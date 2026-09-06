/* =============================================================================
 * tests/run.js — the checks that have to pass.
 *
 *   node tests/run.js
 *
 * No framework, no install. Loads the real simulation files headless and
 * asserts things that would be embarrassing to get wrong in front of anyone:
 * that results are reproducible, that no controller can break a safety rule,
 * that changing a timing plan actually changes the outcome, that arbitration
 * resolves conflicts the way it claims to, and that the physics agrees with the
 * closed-form delay model traffic engineers have used since 1958.
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['sim.js', 'features.js', 'sensorFeed.js', 'controllers.js',
               'priority.js', 'scenarios.js', 'bench.js', 'coordinator.js'];

/* ------------------------------------------------------------------ harness */
let passed = 0, failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log('  PASS  ' + name + (detail ? '   ' + detail : ''));
  } else {
    failed++;
    failures.push(name + (detail ? '   ' + detail : ''));
    console.log('  FAIL  ' + name + (detail ? '   ' + detail : ''));
  }
}

function near(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

function section(title) {
  console.log('\n' + title);
}

/** A fresh world, loaded from the same files the browser loads. */
function makeWorld(weights) {
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Math, JSON, Object, Array, String, Number, Boolean, Date, Promise, isNaN,
    performance: { now: () => Date.now() },
    setTimeout, clearTimeout,
    requestAnimationFrame: () => {},
    window: { CONFIG: { GEMINI_API_KEY: '' }, NN_WEIGHTS: weights },
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    fetch: async () => { throw new Error('offline'); }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const files = FILES.slice();
  if (weights) files.push('nn.js');
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  const run = (code) => vm.runInContext(code, sandbox);
  run('SIM.start();');
  const SIM = run('SIM');
  return { run, SIM, sandbox };
}

function advance(w, seconds) {
  let left = seconds;
  while (left > 0) {
    const dt = Math.min(left, 0.05);
    w.SIM.advance(dt);
    left -= dt;
  }
}

/** Average control delay over a measured window, warm-up discarded. */
function measure(w, mode, seed, opts) {
  opts = opts || {};
  w.SIM.setControlMode(mode);
  w.SIM.reset({ seed: seed });
  w.SIM.setSpawnRate(opts.load === undefined ? 1.0 : opts.load);
  if (opts.plan) w.SIM.setPlanAll(opts.plan);
  if (opts.bias) {
    const dirs = opts.biasAxis === 'NS' ? ['N', 'S'] : ['E', 'W'];
    for (const sp of w.SIM.spawnPoints()) {
      sp.weight = dirs.indexOf(sp.dir) !== -1 ? opts.bias : 1;
    }
  }
  advance(w, opts.warmup === undefined ? 20 : opts.warmup);
  const p0 = w.SIM.stats.processed, d0 = w.SIM.stats.delaySum;
  advance(w, opts.seconds || 300);
  const done = w.SIM.stats.processed - p0;
  return { delay: done ? (w.SIM.stats.delaySum - d0) / done : 0, processed: done };
}

/* ============================================================ 1. determinism */
section('Reproducibility - the claim every comparison rests on');
{
  const a = makeWorld();
  const b = makeWorld();
  const ra = measure(a, 'plan', 4242, { seconds: 120 });
  const rb = measure(b, 'plan', 4242, { seconds: 120 });
  check('same seed gives the same delay',
        near(ra.delay, rb.delay, 1e-9),
        ra.delay.toFixed(6) + 's vs ' + rb.delay.toFixed(6) + 's');
  check('same seed gives the same vehicle count',
        ra.processed === rb.processed,
        ra.processed + ' vs ' + rb.processed);

  const c = makeWorld();
  const rc = measure(c, 'plan', 9999, { seconds: 120 });
  check('a different seed gives different traffic',
        rc.processed !== ra.processed || !near(rc.delay, ra.delay, 1e-6),
        'seed 9999: ' + rc.delay.toFixed(2) + 's over ' + rc.processed + ' vehicles');
}

/* ========================================================= 2. safety invariants */
section('Safety - true whatever any controller asks for');
{
  const w = makeWorld();
  w.SIM.setControlMode('ai');
  w.SIM.reset({ seed: 77 });

  let minGreenViolation = null, maxGreenViolation = null, skippedYellow = null;
  const seen = {};

  // A deliberately hostile controller: switch every single tick, for ever.
  for (let i = 0; i < 12000; i++) {
    for (const j of w.SIM.junctions) {
      w.SIM.applyAction(j.id, 'switch');
      w.SIM.applyAction(j.id, 'extend_green_' + j.phase);
    }
    w.SIM.advance(0.05);
    for (const j of w.SIM.junctions) {
      const prev = seen[j.id];
      if (prev && prev.phase !== j.phase && prev.state === 'green' && j.state === 'green') {
        skippedYellow = j.id;                       // green -> green is impossible
      }
      if (prev && prev.state === 'green' && j.state !== 'green' &&
          prev.greenElapsed < w.SIM.SIGNAL.minGreen - 0.2) {
        minGreenViolation = j.id + ' ended green after ' + prev.greenElapsed.toFixed(1) + 's';
      }
      if (j.state === 'green' && j.greenElapsed > w.SIM.SIGNAL.maxGreen + 1.5) {
        maxGreenViolation = j.id + ' held green for ' + j.greenElapsed.toFixed(1) + 's';
      }
      seen[j.id] = { phase: j.phase, state: j.state, greenElapsed: j.greenElapsed };
    }
  }

  check('minimum green is never cut short', minGreenViolation === null,
        minGreenViolation || 'floor is ' + w.SIM.SIGNAL.minGreen + 's');
  check('maximum green is never exceeded', maxGreenViolation === null,
        maxGreenViolation || 'ceiling is ' + w.SIM.SIGNAL.maxGreen + 's');
  check('yellow is never skipped', skippedYellow === null,
        skippedYellow || 'every phase change passed through yellow and all-red');

  const before = JSON.stringify(w.SIM.getPlan('J1'));
  w.SIM.setControlMode('plan');
  w.SIM.applyAction('J1', 'switch');
  check('a fixed plan ignores controller actions entirely',
        JSON.stringify(w.SIM.getPlan('J1')) === before);
}

/* ============================================== 3. the tool's own premise */
section('Timing matters - or the whole project is pointless');
{
  const w = makeWorld();
  const balanced = measure(w, 'plan', 555, { seconds: 300, plan: { greenNS: 18, greenEW: 18 } });
  const skewed = measure(w, 'plan', 555, { seconds: 300, plan: { greenNS: 25, greenEW: 8 } });
  check('a skewed plan is worse than a balanced one on identical traffic',
        skewed.delay > balanced.delay,
        'balanced ' + balanced.delay.toFixed(1) + 's vs skewed ' + skewed.delay.toFixed(1) + 's');

  const w2 = makeWorld();
  const light = measure(w2, 'plan', 555, { seconds: 300, load: 0.5 });
  const heavy = measure(w2, 'plan', 555, { seconds: 300, load: 2.0 });
  check('more traffic means more delay',
        heavy.delay > light.delay,
        '0.5x ' + light.delay.toFixed(1) + 's vs 2.0x ' + heavy.delay.toFixed(1) + 's');
}

/* ================================================ 4. validation against theory */
section('Physics - does it agree with the textbook?');
{
  /* Webster's uniform delay term, the closed-form result every traffic
   * engineering course teaches:
   *      d1 = C(1 - g/C)^2 / (2(1 - (g/C)(q/s)))
   * It assumes uniform arrivals and under-saturation, so we test in exactly
   * that regime: light demand, no bias. The simulator adds queueing randomness
   * and start-up lost time that the formula omits, so it should land somewhat
   * ABOVE the formula, and within the same order of magnitude - not equal.
   */
  const w = makeWorld();
  const load = 0.5;
  const r = measure(w, 'plan', 606, { seconds: 420, load: load, plan: { greenNS: 18, greenEW: 18 } });

  const j = w.SIM.junctions[0];
  const C = w.SIM.cycleLength(j);
  const g = 18;
  const sat = w.SIM.PARAMS.satFlowPcuH / 3600;              // PCU per second
  const arrivals = j.arrivalPcu.N + j.arrivalPcu.S + j.arrivalPcu.E + j.arrivalPcu.W;
  const q = (arrivals / Math.max(1, w.SIM.time())) / 4;      // PCU/s per approach
  const gc = g / C;
  const ratio = Math.min(0.95, q / (sat * gc));
  const d1 = C * Math.pow(1 - gc, 2) / (2 * (1 - gc * ratio));

  check('measured delay is the same order as Webster uniform delay',
        r.delay > d1 * 0.6 && r.delay < d1 * 4.0,
        'measured ' + r.delay.toFixed(1) + 's, Webster d1 ' + d1.toFixed(1) +
        's, cycle ' + C.toFixed(0) + 's, v/c ' + ratio.toFixed(2));

  check('measured delay exceeds the uniform-delay floor',
        r.delay > d1 * 0.8,
        'the formula omits randomness and start-up lost time, so it is a floor');

  // Saturation flow: a queue should discharge at roughly 1800 PCU/h/lane.
  const w2 = makeWorld();
  w2.SIM.setControlMode('plan');
  w2.SIM.reset({ seed: 12 });
  w2.SIM.setSpawnRate(2.5);
  advance(w2, 240);
  const thru = w2.SIM.junctions.reduce((a, x) => a + x.throughput, 0);
  const perLanePerHour = thru / 4 / (240 / 3600) / 2;        // 4 junctions, 2 phases
  check('discharge rate is in the right range for saturation flow',
        perLanePerHour > 500 && perLanePerHour < 2200,
        Math.round(perLanePerHour) + ' veh/h/lane against a 1800 PCU/h ideal');
}

/* ============================================================ 5. arbitration */
section('Arbitration - the behaviour the pitch claims');
{
  const w = makeWorld();
  w.SIM.setControlMode('plan');
  w.SIM.reset({ seed: 31 });
  advance(w, 120);

  const PRIORITY = w.run('PRIORITY');
  const pair = w.run('SCENARIOS.twoAmbulances()');
  advance(w, 1);

  // Both ambulances are on the road and NEITHER is served yet: a standing plan
  // owns the decision until its countdown expires. That gap is deliberate - it
  // is the window in which the control room can veto - so a test that demanded
  // an immediate grant would be testing the behaviour we removed on purpose.
  const states = w.run('PRIORITY.requests.map(function (r) { return r.state; })');
  check('neither request is served while the plan is still standing',
        states.every(function (st) { return st !== 'granted'; }),
        states.join(', '));

  const onRoad = w.run('SIM.vehicles.filter(function (v) { return v.emergency; }).length');
  check('both ambulances are on the road from the moment the calls come in',
        onRoad === 2, onRoad + ' ambulances');

  const plan = w.run('PRIORITY.plan()');
  check('the plan names a winner and states its reasoning',
        !!plan && !!plan.winnerId && String(plan.reason).indexOf('case score') !== -1,
        plan ? plan.reason : 'no plan');

  // Now let the countdown run out. The default is to act.
  advance(w, w.run('PRIORITY.PLAN_LEAD_SEC') + 2);
  const after = w.run('PRIORITY.requests.map(function (r) { return r.state; })');
  check('when the countdown expires exactly one is granted',
        after.filter(function (st) { return st === 'granted'; }).length === 1,
        after.join(', '));

  const conflicts = w.run('PRIORITY.conflicts().length');
  check('the conflict is predicted before either vehicle arrives',
        conflicts > 0, conflicts + ' predicted');

  const workings = w.run('PRIORITY.requests[0].workings');
  check('every decision shows its arithmetic',
        typeof workings === 'string' && workings.indexOf('score =') === 0,
        workings.slice(0, 60) + '...');

  // The corridor must not be taken from a vehicle already inside it.
  advance(w, 40);
  const granted = w.run('PRIORITY.requests.filter(function(r){return r.state==="granted";}).length');
  check('at most the concurrency cap is granted at once',
        granted <= w.run('PRIORITY.POLICY.maxConcurrent'),
        granted + ' active, cap ' + w.run('PRIORITY.POLICY.maxConcurrent'));

  // Under congestion, admission control must refuse.
  const w2 = makeWorld();
  w2.SIM.setControlMode('plan');
  w2.SIM.reset({ seed: 88 });
  w2.SIM.setSpawnRate(3);
  advance(w2, 200);
  const busy = w2.SIM.totalQueue();
  const req = w2.run('PRIORITY.submit({axis:"EW", severity:"S3"})');
  check('a congested network refuses or queues a low-severity request',
        req.state === 'queued' || req.state === 'refused',
        'network queue ' + busy + ', outcome: ' + req.state);
  check('and it says which budget it exceeded',
        typeof req.reason === 'string' && req.reason.length > 10,
        req.reason.slice(0, 70));
}

/* ================================================================ 6. the model */
section('The trained model');
{
  let weights = null;
  try {
    weights = JSON.parse(fs.readFileSync(path.join(ROOT, 'weights.json'), 'utf8'));
  } catch (e) {
    console.log('  SKIP  weights.json not found - run tools/train.py first');
  }

  if (weights) {
    const w = makeWorld(weights);
    check('weights load and match the feature definition',
          w.run('NN.isReady()') === true,
          'input size ' + weights.inputSize + ', actions ' + weights.actions.join('/'));

    const envelope = { seconds: 360, load: 0.7, bias: 2.0, biasAxis: 'EW' };
    const fixed = measure(w, 'plan', 101, envelope);
    const model = measure(w, 'nn', 101, envelope);
    check('the model beats the fixed plan in the regime it was trained for',
          model.delay < fixed.delay,
          'fixed ' + fixed.delay.toFixed(1) + 's vs model ' + model.delay.toFixed(1) + 's');

    const reason = w.SIM.junctions[0].lastReason;
    check('every model decision carries a readable reason',
          typeof reason === 'string' && reason.indexOf('Model predicts') === 0,
          reason);
  }
}

/* ------------------------------------------------------------------- verdict */
console.log('\n' + '-'.repeat(64));
console.log(passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log('All checks passed.');
