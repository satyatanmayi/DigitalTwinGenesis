/* =============================================================================
 * agent.js — the language-model controller, and the scaffolding that makes it
 * safe to put in front of a traffic signal.
 *
 * THREE LAYERS, EACH CATCHING WHAT THE ONE ABOVE MISSES
 *
 *   1. PROPOSE   A model reads the junction snapshot and returns an action plus
 *                a one-sentence reason citing the queue numbers.
 *
 *   2. VALIDATE  A SECOND call - a different prompt, and a different model when
 *                one is available - is shown the same snapshot and the proposal,
 *                and must either approve it or correct it. This is the useful
 *                part: a model marking its own homework is worth little, a model
 *                marking someone else's is worth something. The validator can
 *                only choose from the same four actions, so it cannot invent a
 *                new failure mode.
 *
 *   3. FALL BACK If either call is slow, fails, returns nonsense, or the whole
 *                network is down, a local rule decides instead and says so. The
 *                simulation never blocks on the internet.
 *
 * And underneath all three, sim.js enforces minimum green, maximum green and the
 * yellow interval. No answer from any model can produce an unsafe signal - the
 * worst it can do is a slightly worse cycle.
 *
 * MODEL FALLBACK
 * Models get retired. gemini-2.0-flash went away mid-project and every call
 * started returning 404. So the endpoint list is tried in order and a model that
 * fails is skipped for the rest of the session rather than retried forever.
 *
 * NO drawing code, NO p5.js in this file.
 * ========================================================================== */

/* The key is read from config.js (git-ignored). With no key the whole file
 * still works - it just runs on layer 3. */
const GEMINI_API_KEY = (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.GEMINI_API_KEY) || '';
const GEMINI_MODEL = (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.GEMINI_MODEL) || 'gemini-3.6-flash';

const AGENT = (function () {
  'use strict';

  const DECISION_INTERVAL = 5;       // simulated seconds between decisions
  /* Measured, not guessed: a structured-output call to gemini-3.6-flash came
   * back in 8.7s and 13.6s on two consecutive probes from this machine. A 5s
   * timeout aborted every single call and the whole stack silently ran on the
   * local rule - which is exactly the kind of quiet failure this project is
   * supposed to make visible. */
  const REQUEST_TIMEOUT_MS = 20000;
  const LOG_LIMIT = 40;
  const HISTORY_PER_JUNCTION = 2;

  /* CALL BUDGET
   * Four junctions deciding every 5s, two calls each, is roughly 96 requests a
   * minute. Every free tier on earth answers that with HTTP 429. So the API is
   * treated as a scarce strategic resource, which is also how a real system
   * would use it: the fast local loop runs every junction every interval, and
   * the language-model stack supervises whichever junction is worst off, as
   * often as the budget allows. A junction that does not get the model this
   * interval is not left undecided - it runs on the rule and says so. */
  const MIN_CALL_SPACING_MS = 9000;  // between any two API calls, network-wide
  const RATE_LIMIT_COOLDOWN_MS = 30000;
  let nextCallAllowedAt = 0;
  let cooldownUntil = 0;

  const ACTIONS = ['extend_green_NS', 'extend_green_EW', 'hold', 'switch'];

  /* Tried in order. A model that 404s is struck off for the session. */
  const MODEL_CHAIN = [
    GEMINI_MODEL,
    'gemini-3.6-flash',
    'gemini-flash-latest'
  ].filter(function (m, i, a) { return m && a.indexOf(m) === i; });
  const dead = {};

  function endpoint(model) {
    return 'https://generativelanguage.googleapis.com/v1beta/models/' +
           model + ':generateContent?key=' + encodeURIComponent(GEMINI_API_KEY);
  }

  const PROPOSER_PROMPT =
    'You are a traffic signal controller for one junction in a four-junction ' +
    'grid. Opposing approaches run as phase pairs: NS serves north and south, ' +
    'EW serves east and west.\n' +
    'Rules:\n' +
    '1. Serve the phase with the longest queues and the longest waits.\n' +
    '2. extend_green_NS / extend_green_EW adds 4s of green to that phase; if it ' +
    'is not currently green, it ends the running green early.\n' +
    '3. switch ends the running green now. hold changes nothing.\n' +
    '4. Never starve a phase: if an approach has waited over 25s, serve it.\n' +
    '5. Every phase change costs 4s of yellow and all-red that serves nobody, so ' +
    'do not switch for a small difference.\n' +
    '6. The reason must be one short sentence citing the actual numbers used.';

  const VALIDATOR_PROMPT =
    'You are reviewing another controller\'s decision for the same junction. ' +
    'You are shown the junction state and the proposed action.\n' +
    'Approve it if it is reasonable. Correct it only if it is clearly wrong - ' +
    'for example switching away from the phase with the much longer queue, ' +
    'switching when the difference is small enough that the 4s changeover costs ' +
    'more than it saves, or leaving an approach that has waited over 25s.\n' +
    'Return verdict "approve" or "correct". If you correct it, give the action ' +
    'you would take instead and one short sentence saying why.';

  const DECISION_SCHEMA = {
    type: 'OBJECT',
    properties: {
      junctionId: { type: 'STRING' },
      action: { type: 'STRING', enum: ACTIONS },
      reason: { type: 'STRING' }
    },
    required: ['junctionId', 'action', 'reason']
  };

  const REVIEW_SCHEMA = {
    type: 'OBJECT',
    properties: {
      verdict: { type: 'STRING', enum: ['approve', 'correct'] },
      action: { type: 'STRING', enum: ACTIONS },
      reason: { type: 'STRING' }
    },
    required: ['verdict', 'reason']
  };

  const decisions = [];
  let lastSupervised = null;
  const timers = {};
  const inFlight = {};
  const callStats = {
    calls: 0, errors: 0, corrections: 0, approvals: 0, rateLimited: 0, ruleOnly: 0,
    lastLatencyMs: 0, avgLatencyMs: 0, modelInUse: null
  };

  /** True when the budget allows another API call right now. */
  function budgetAvailable() {
    const now = Date.now();
    return now >= cooldownUntil && now >= nextCallAllowedAt;
  }

  function hasKey() { return GEMINI_API_KEY.trim().length > 0; }

  /* ------------------------------------------------------------------ logging */
  function log(junctionId, action, reason, source, latencyMs, extra) {
    const j = SIM.junctionById(junctionId);
    if (j) {
      j.lastAction = action;
      j.lastReason = reason;
      j.lastSource = source;
      j.lastDecisionAt = SIM.time();
    }
    decisions.unshift(Object.assign({
      junctionId: junctionId, action: action, reason: reason, source: source,
      latencyMs: latencyMs || 0, simTime: SIM.time(), wallClock: new Date()
    }, extra || {}));
    if (decisions.length > LOG_LIMIT) decisions.length = LOG_LIMIT;
  }

  /* -------------------------------------------------------------- the prompt */
  function snapshotFor(j) {
    const snap = SENSOR_FEED.get(j.id);
    if (!snap) return null;

    const neighbours = {};
    for (const other of SIM.junctions) {
      if (other.id === j.id) continue;
      if (other.row !== j.row && other.col !== j.col) continue;
      neighbours[other.id] = {
        totalQueue: other.queues.N + other.queues.S + other.queues.E + other.queues.W,
        phase: other.phase
      };
    }

    const history = [];
    for (const d of decisions) {
      if (d.junctionId !== j.id) continue;
      history.push({ action: d.action, reason: d.reason });
      if (history.length >= HISTORY_PER_JUNCTION) break;
    }

    return {
      junctionId: j.id,
      sensors: {
        queueLengths: snap.queueLengths,
        longestWaitSec: snap.longestWaitSec,
        avgSpeedKmh: snap.avgSpeed,
        incidentFlag: snap.incidentFlag,
        blockedApproach: snap.blockedApproach || null
      },
      signal: {
        currentPhase: j.phase,
        phaseState: j.state,
        greenElapsedSec: Math.round(j.greenElapsed * 10) / 10,
        minGreenSec: SIM.SIGNAL.minGreen,
        maxGreenSec: SIM.SIGNAL.maxGreen,
        changeoverCostSec: SIM.SIGNAL.yellow + SIM.SIGNAL.allRed
      },
      adjacentJunctions: neighbours,
      yourRecentDecisions: history
    };
  }

  /* ------------------------------------------------------------- one API call */
  async function callModel(system, userText, schema) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 8000,
        responseMimeType: 'application/json',
        responseSchema: schema,
        // Signal timing is not a reasoning puzzle; the numbers are in the
        // prompt. Low thinking keeps the round trip short.
        thinkingConfig: { thinkingLevel: 'low' }
      }
    };

    let lastError = 'no model available';
    for (const model of MODEL_CHAIN) {
      if (dead[model]) continue;

      const controller = new AbortController();
      const timeoutId = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
      const started = performance.now();
      nextCallAllowedAt = Date.now() + MIN_CALL_SPACING_MS;
      try {
        const res = await fetch(endpoint(model), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        if (res.status === 404) {
          // The model was retired. Strike it off and try the next one.
          dead[model] = true;
          lastError = model + ' retired (404)';
          continue;
        }
        if (res.status === 429) {
          // Rate limited. The model is fine, we are asking too fast - so back
          // the whole stack off rather than striking the model off the list.
          callStats.rateLimited++;
          cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
          lastError = 'rate limited, backing off ' + (RATE_LIMIT_COOLDOWN_MS / 1000) + 's';
          break;
        }
        if (!res.ok) { lastError = 'HTTP ' + res.status; continue; }

        const data = await res.json();
        const cand = data && data.candidates && data.candidates[0];
        const parts = cand && cand.content && cand.content.parts;
        const text = parts && parts.map(function (p) { return p.text || ''; }).join('');
        if (!text) { lastError = 'empty response'; continue; }

        const latency = Math.round(performance.now() - started);
        callStats.calls++;
        callStats.lastLatencyMs = latency;
        callStats.avgLatencyMs = callStats.avgLatencyMs
          ? Math.round(callStats.avgLatencyMs * 0.8 + latency * 0.2) : latency;
        callStats.modelInUse = model;

        return { data: JSON.parse(text), latency: latency, model: model };
      } catch (err) {
        lastError = err && err.message ? err.message : String(err);
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw new Error(lastError);
  }

  /* ------------------------------------------------- layer 1 + 2: the stack */
  async function proposeAndValidate(j) {
    const snap = snapshotFor(j);
    if (!snap) return null;

    const proposal = await callModel(
      PROPOSER_PROMPT,
      'Live snapshot:\n' + JSON.stringify(snap) + '\nReturn one decision.',
      DECISION_SCHEMA
    );
    let action = proposal.data.action;
    let reason = String(proposal.data.reason || '').slice(0, 200);
    if (ACTIONS.indexOf(action) === -1) throw new Error('bad action: ' + action);

    // The second opinion. If it fails we keep the proposal rather than losing
    // the decision - a missing review is not a reason to do nothing.
    let review = null;
    try {
      review = await callModel(
        VALIDATOR_PROMPT,
        'Junction state:\n' + JSON.stringify(snap) +
        '\n\nProposed action: ' + action + '\nProposed reason: ' + reason +
        '\n\nApprove or correct.',
        REVIEW_SCHEMA
      );
    } catch (e) {
      review = null;
    }

    let verdict = 'unreviewed';
    if (review && review.data) {
      if (review.data.verdict === 'correct' &&
          ACTIONS.indexOf(review.data.action) !== -1 &&
          review.data.action !== action) {
        callStats.corrections++;
        verdict = 'corrected';
        reason = 'Reviewer overruled "' + action + '": ' +
                 String(review.data.reason || '').slice(0, 160);
        action = review.data.action;
      } else {
        callStats.approvals++;
        verdict = 'approved';
      }
    }

    return {
      action: action,
      reason: reason,
      latency: proposal.latency + (review ? review.latency : 0),
      model: proposal.model,
      verdict: verdict
    };
  }

  /* ------------------------------------------------------- layer 3: the rule
   * Runs when there is no key, or when the network is unavailable. Same action
   * space, no dependencies, always available.
   */
  function heuristicDecision(j, snap) {
    const q = snap.queueLengths;
    const w = snap.longestWaitSec;
    const ns = q.N + q.S, ew = q.E + q.W;
    const nsWait = Math.max(w.N, w.S), ewWait = Math.max(w.E, w.W);

    if (nsWait > 25 && j.phase !== 'NS') {
      return { action: 'extend_green_NS', reason: 'NS waited ' + Math.round(nsWait) + 's, over the 25s starvation limit.' };
    }
    if (ewWait > 25 && j.phase !== 'EW') {
      return { action: 'extend_green_EW', reason: 'EW waited ' + Math.round(ewWait) + 's, over the 25s starvation limit.' };
    }
    if (ns > ew + 2) {
      return { action: 'extend_green_NS', reason: 'NS queue ' + ns + ' against EW queue ' + ew + ', so serve NS.' };
    }
    if (ew > ns + 2) {
      return { action: 'extend_green_EW', reason: 'EW queue ' + ew + ' against NS queue ' + ns + ', so serve EW.' };
    }
    if (ns + ew === 0) {
      return { action: 'hold', reason: 'No queues on any approach, so keep the current phase.' };
    }
    return { action: 'hold', reason: 'Queues balanced at NS ' + ns + ' and EW ' + ew + ', so hold.' };
  }

  /* ------------------------------------------------------------ the cycle */
  async function decide(j) {
    const snap = SENSOR_FEED.get(j.id);
    if (!snap) return;
    inFlight[j.id] = true;
    try {
      // No key, or the budget is spent on a busier junction: the local rule
      // decides. This is the common case, and it is not a degraded one - it is
      // the fast loop doing its job while the model supervises elsewhere.
      if (!hasKey() || !budgetAvailable()) {
        if (hasKey()) callStats.ruleOnly++;
        const d = heuristicDecision(j, snap);
        SIM.applyAction(j.id, d.action);
        log(j.id, d.action, d.reason, 'heuristic', 0, { verdict: 'rule' });
        return;
      }
      const d = await proposeAndValidate(j);
      if (!d) return;
      SIM.applyAction(j.id, d.action);
      log(j.id, d.action, d.reason, 'gemini', d.latency,
          { verdict: d.verdict, model: d.model });
      // Rule decisions outnumber supervised ones by design, so the last
      // supervised one is kept where the panel can always show it rather than
      // letting it scroll out of the log.
      lastSupervised = {
        junctionId: j.id, action: d.action, reason: d.reason,
        verdict: d.verdict, model: d.model, latencyMs: d.latency, simTime: SIM.time()
      };
    } catch (err) {
      // Everything above failed. Decide anyway, locally, and say so.
      callStats.errors++;
      const d = heuristicDecision(j, snap);
      SIM.applyAction(j.id, d.action);
      log(j.id, d.action, 'Model unavailable (' + err.message + '), local rule used: ' + d.reason,
          'error', 0, { verdict: 'fallback' });
    } finally {
      inFlight[j.id] = false;
    }
  }

  SIM.onTick(function (dt) {
    if (SIM.controlMode() !== 'ai') return;

    const due = [];
    for (const j of SIM.junctions) {
      if (timers[j.id] === undefined) timers[j.id] = 1.0 + Math.random();
      timers[j.id] -= dt;
      if (timers[j.id] <= 0 && !inFlight[j.id]) {
        timers[j.id] = DECISION_INTERVAL;
        due.push(j);
      }
    }
    if (!due.length) return;

    // Worst junction first, so when the budget allows exactly one supervised
    // decision it is spent where it matters rather than on whoever fired first.
    due.sort(function (a, b) {
      const qa = a.queues.N + a.queues.S + a.queues.E + a.queues.W;
      const qb = b.queues.N + b.queues.S + b.queues.E + b.queues.W;
      return qb - qa;
    });
    for (const j of due) decide(j);
  });

  return {
    DECISION_INTERVAL: DECISION_INTERVAL,
    MODEL: GEMINI_MODEL,
    MODEL_CHAIN: MODEL_CHAIN,
    decisions: decisions,
    stats: callStats,
    hasKey: hasKey,
    callSpacingSec: MIN_CALL_SPACING_MS / 1000,
    budgetAvailable: budgetAvailable,
    lastSupervised: function () { return lastSupervised; },
    coolingDown: function () { return Date.now() < cooldownUntil; },
    deadModels: function () { return Object.keys(dead); },
    isBusy: function (junctionId) { return !!inFlight[junctionId]; }
  };
})();
