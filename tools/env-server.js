/* =============================================================================
 * tools/env-server.js — the training environment.
 *
 * The browser runs the simulator. So does the trainer. This file is what makes
 * that true: it loads the SAME simulation files the browser loads, runs them
 * headless in Node, and exposes them to a Python trainer over a line-delimited
 * JSON protocol on stdin and stdout.
 *
 * Why not rewrite the physics in Python? Because a second copy drifts, and then
 * the model is trained against a world the browser does not run. One model of
 * the world, two consumers.
 *
 * PROTOCOL — one JSON object per line, request in, response out.
 *   {"cmd":"reset","seed":123,"load":1.0}        -> {"state":[...], "done":false}
 *   {"cmd":"step","actions":[0,1,2,0]}           -> {"state":[...], "reward":-3.2,
 *                                                    "info":{...}, "done":false}
 *   {"cmd":"baseline","seconds":300}             -> {"delay":16.7,...}
 *   {"cmd":"close"}                              -> exits
 *
 * ACTIONS, one per junction: 0 = hold, 1 = extend current phase, 2 = switch.
 * The safety layer in sim.js can veto any of them; the trainer never bypasses it.
 *
 * Run standalone to sanity-check:  node tools/env-server.js --selftest
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');
const FILES = ['sim.js', 'features.js', 'sensorFeed.js', 'controllers.js',
               'priority.js', 'scenarios.js', 'bench.js', 'coordinator.js'];

const STEP_SECONDS = 1.0;      // simulated seconds per RL step
const TICK = 0.05;             // physics sub-step, matches the browser's clamp

/* ------------------------------------------------------------------ sandbox
 * The simulation expects a browser. We give it the few globals it uses and
 * nothing else — no DOM, no p5, no network.
 */
function loadSim() {
  let rafQueue = [];
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Math, JSON, Object, Array, String, Number, Boolean, Date, Promise, isNaN,
    performance: { now: () => Date.now() },
    setTimeout, clearTimeout,
    requestAnimationFrame: (fn) => { rafQueue.push(fn); },
    window: { CONFIG: { GEMINI_API_KEY: '' } },
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    fetch: async () => { throw new Error('offline'); }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  vm.runInContext('SIM.start();', sandbox);
  // Drain the animation-frame queue once so start() completes.
  rafQueue.splice(0).forEach(fn => fn(0));
  return { sandbox, run: (code) => vm.runInContext(code, sandbox) };
}

const env = loadSim();
// `const SIM` inside the vm lives in the context's lexical scope, not on the
// sandbox object, so we pull the reference out by evaluating its name.
const SIM = env.run('SIM');

/* ------------------------------------------------------------------- state
 * Per junction, six numbers, all scaled to roughly 0..1 so the network sees
 * comparable magnitudes:
 *   0  queue on the phase currently green      (PCU / 12)
 *   1  queue on the phase currently red        (PCU / 12)
 *   2  longest wait on the green phase         (s / 60)
 *   3  longest wait on the red phase           (s / 60)
 *   4  seconds of green already served         (s / 60)
 *   5  1 if the current phase is NS, else 0
 * Four junctions -> 32 numbers.
 */
// The feature definition lives in features.js so the trainer and the browser
// cannot drift apart. See that file for what each number means.
const FEATURES = env.run('FEATURES');

function observe() {
  return FEATURES.all();
}

/* ------------------------------------------------------------------ reward
 * Negative delay is the objective. Two shaping terms keep the policy honest:
 * a penalty for letting any approach wait a long time (starvation), and a
 * bonus for clearing vehicles (throughput), so the network cannot score well
 * by simply freezing traffic.
 */
let lastProcessed = 0;
let lastThroughput = {};

/** Per-junction reward, so each junction learns from its own consequences.
 *  Credit assignment with one global number is much slower to learn. */
function rewards() {
  const out = [];
  for (const j of SIM.junctions) {
    let queued = 0, worstWait = 0;
    for (const d of SIM.DIRS) {
      queued += j.pcuQueues[d];
      if (j.longestWait[d] > worstWait) worstWait = j.longestWait[d];
    }
    lastThroughput[j.id] = j.throughput;
    // Queue length integrated over time IS total delay - that is the definition,
    // not an approximation. So the reward is simply the negative queue, scaled.
    // Anything else here would be optimising for something we do not measure.
    out.push(-0.25 * queued);
  }
  return out;
}

function reward() {
  let queued = 0, worstWait = 0;
  for (const j of SIM.junctions) {
    for (const d of SIM.DIRS) {
      queued += j.pcuQueues[d];
      if (j.longestWait[d] > worstWait) worstWait = j.longestWait[d];
    }
  }
  const cleared = SIM.stats.processed - lastProcessed;
  lastProcessed = SIM.stats.processed;

  return -0.10 * queued            // queued vehicles are the cost
         - 0.05 * worstWait        // and nobody should be forgotten
         + 0.60 * cleared;         // getting vehicles out is the point
}

/* ------------------------------------------------------------------ stepping */
function stepWorld(seconds) {
  let remaining = seconds;
  while (remaining > 0) {
    const dt = Math.min(remaining, TICK);
    SIM.advance(dt);
    maybeFlip();                 // checked as the clock runs, not once per call
    remaining -= dt;
  }
}

/* ACTIONS, expressed in the same frame as the state:  0 = keep the phase that
 * is green now, 1 = switch to the other one.
 *
 * This matters more than it looks. The state describes queues as "on the green
 * phase" and "on the red phase", so a relative action lets the policy learn the
 * obvious rule - if the red side is much longer than the green side, switch -
 * directly. With absolute actions (serve NS / serve EW) the network first has
 * to combine the phase flag with the queues to work out which is which, and in
 * practice it collapses to always naming the same phase. */
function applyActions(actions) {
  SIM.junctions.forEach(function (j, i) {
    // 0 = hold: do nothing at all, so the underlying timing plan runs. This is
    // deliberate - a policy that learns nothing degenerates to the fixed plan
    // rather than to something worse, so the network can only earn its place.
    if ((actions[i] | 0) === 1) SIM.applyAction(j.id, 'switch');
  });
}

/* ------------------------------------------------------------------ demand
 * A fixed plan with an equal split is close to optimal when demand is equal on
 * both axes and never changes. Real demand is neither: it is directional, and
 * the direction turns over during the day. This profile makes the world behave
 * that way, which is the condition under which adaptive control is worth
 * anything at all.
 */
let profile = { bias: 1.0, biasAxis: 'EW', flipEvery: 0 };
let lastFlipEpoch = -1;

function applyDemand() {
  const dirs = (profile.biasAxis === 'NS') ? ['N', 'S'] : ['E', 'W'];
  for (const sp of SIM.spawnPoints()) {
    sp.weight = (dirs.indexOf(sp.dir) !== -1) ? profile.bias : 1;
  }
}

/** Turn the peak direction over every flipEvery seconds. */
function maybeFlip() {
  if (!profile.flipEvery) return;
  const epoch = Math.floor(SIM.time() / profile.flipEvery);
  if (epoch === lastFlipEpoch) return;
  lastFlipEpoch = epoch;
  profile.biasAxis = (epoch % 2 === 0) ? 'EW' : 'NS';
  applyDemand();
}

function resetWorld(seed, load, warmupSec) {
  SIM.setControlMode('ai');          // so applyAction is accepted
  SIM.reset({ seed: seed });
  SIM.setSpawnRate(load);
  SIM.setPaused(false);
  lastProcessed = 0;
  lastThroughput = {};
  lastFlipEpoch = -1;
  applyDemand();
  if (warmupSec) stepWorld(warmupSec);
  lastProcessed = SIM.stats.processed;
  rewards();   // prime the per-junction throughput baseline
}

function metrics() {
  return {
    delay: SIM.avgDelay(),
    processed: SIM.stats.processed,
    delaySum: SIM.stats.delaySum,
    queue: SIM.totalQueue(),
    simTime: SIM.time()
  };
}

function setProfile(msg) {
  if (msg.bias !== undefined) profile.bias = msg.bias;
  if (msg.biasAxis) profile.biasAxis = msg.biasAxis;
  if (msg.flipEvery !== undefined) profile.flipEvery = msg.flipEvery;
}

/* -------------------------------------------------------------- the protocol */
function handle(msg) {
  switch (msg.cmd) {
    case 'reset':
      setProfile(msg);
      resetWorld(msg.seed || 1, msg.load === undefined ? 1.0 : msg.load, msg.warmup || 20);
      return { state: observe(), done: false, info: metrics() };

    case 'step': {
      applyActions(msg.actions || []);
      stepWorld(msg.seconds || STEP_SECONDS);
      return { state: observe(), reward: reward(), rewards: rewards(),
               done: false, info: metrics() };
    }

    case 'baseline': {
      // Run the fixed-time plan for comparison on the same seed and demand.
      setProfile(msg);
      SIM.setControlMode('plan');
      SIM.reset({ seed: msg.seed || 1 });
      SIM.setSpawnRate(msg.load === undefined ? 1.0 : msg.load);
      lastFlipEpoch = -1; applyDemand();
      stepWorld(msg.warmup || 20);
      const before = { p: SIM.stats.processed, d: SIM.stats.delaySum };
      stepWorld(msg.seconds || 300);
      const done = SIM.stats.processed - before.p;
      const delay = done ? (SIM.stats.delaySum - before.d) / done : 0;
      SIM.setControlMode('ai');
      return { delay: delay, processed: done };
    }

    case 'reference': {
      // Max-Pressure on the same seed and demand: the classical opponent.
      setProfile(msg);
      SIM.setControlMode('maxpressure');
      SIM.reset({ seed: msg.seed || 1 });
      SIM.setSpawnRate(msg.load === undefined ? 1.0 : msg.load);
      lastFlipEpoch = -1; applyDemand();
      stepWorld(msg.warmup || 20);
      const mark = { p: SIM.stats.processed, d: SIM.stats.delaySum };
      stepWorld(msg.seconds || 300);
      const n = SIM.stats.processed - mark.p;
      const avg = n ? (SIM.stats.delaySum - mark.d) / n : 0;
      SIM.setControlMode('ai');
      return { delay: avg, processed: n };
    }

    case 'measure': {
      // Measured window under whatever controller is currently active.
      const before = { p: SIM.stats.processed, d: SIM.stats.delaySum };
      return { mark: before };
    }

    case 'close':
      process.exit(0);
      return {};

    default:
      return { error: 'unknown cmd ' + msg.cmd };
  }
}

/* ------------------------------------------------------------------ selftest */
if (process.argv.indexOf('--selftest') !== -1) {
  console.error('env-server selftest');
  const r1 = handle({ cmd: 'reset', seed: 7, load: 1.0 });
  console.error('  state length:', r1.state.length);
  let total = 0;
  for (let i = 0; i < 60; i++) {
    const r = handle({ cmd: 'step', actions: [0, 0, 0, 0] });
    total += r.reward;
  }
  console.error('  60 steps of hold, total reward:', total.toFixed(1),
                'delay:', handle({ cmd: 'step', actions: [0, 0, 0, 0] }).info.delay.toFixed(2));
  const b = handle({ cmd: 'baseline', seed: 7, load: 1.0, seconds: 200 });
  console.error('  fixed-plan baseline delay:', b.delay.toFixed(2), 's over', b.processed, 'vehicles');
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', function (line) {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch (e) { process.stdout.write(JSON.stringify({ error: 'bad json' }) + '\n'); return; }
  let out;
  try { out = handle(msg); } catch (e) { out = { error: String(e && e.message || e) }; }
  process.stdout.write(JSON.stringify(out) + '\n');
});
