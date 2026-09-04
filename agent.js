/* =============================================================================
 * agent.js — Per-junction AI signal controller (Gemini).
 *
 * Every DECISION_INTERVAL simulated seconds each junction sends its own sensor
 * snapshot to the Gemini API and receives a JSON decision:
 *
 *   { junctionId, action: "extend_green_NS" | "extend_green_EW" | "hold"
 *                       | "switch",
 *     reason: "<one short sentence citing the queue numbers>" }
 *
 * The four junctions are queried in parallel, so one slow junction never
 * delays the others. The decision is applied through SIM.applyAction() — this
 * file never touches signal internals directly.
 *
 * NO drawing code, NO p5.js in this file. It writes the reason string onto the
 * junction object; render.js reads it and draws the floating label.
 * ========================================================================== */

/* API KEY
 * -------
 * The key is read from config.js (window.CONFIG), which is git-ignored. Copy
 * config.example.js to config.js and paste your key there. Never commit a real
 * key: anything in client-side JavaScript is visible to every page visitor, so
 * use a throwaway / restricted key for demos.
 */
const GEMINI_API_KEY = (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.GEMINI_API_KEY) || '';
const GEMINI_MODEL = (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.GEMINI_MODEL) || 'gemini-2.0-flash';

const AGENT = (function () {
  'use strict';

  const DECISION_INTERVAL = 5;      // simulated seconds between decisions
  const REQUEST_TIMEOUT_MS = 4500;  // abort a slow call; signals keep running
  const LOG_LIMIT = 40;             // decisions retained for the sidebar
  const HISTORY_PER_JUNCTION = 2;   // recent decisions replayed into the prompt

  const ACTIONS = ['extend_green_NS', 'extend_green_EW', 'hold', 'switch'];
  const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    GEMINI_MODEL + ':generateContent';

  const SYSTEM_PROMPT =
    'You are a traffic signal controller for one junction in a four-junction ' +
    'city grid digital twin. Opposing approaches run as phase pairs: NS serves ' +
    'the north and south approaches, EW serves east and west. You receive live ' +
    'sensor data and return exactly one action.\n' +
    'Rules:\n' +
    '1. Serve the phase with the longest queues and the longest waits.\n' +
    '2. extend_green_NS / extend_green_EW adds 4s of green to that phase; if ' +
    'that phase is not currently green it ends the running green early.\n' +
    '3. switch ends the running green now. hold changes nothing.\n' +
    '4. Never starve a phase: if an approach has waited over 25s, serve it.\n' +
    '5. If incidentFlag is true, clear the affected direction first.\n' +
    '6. The reason must be one short sentence and must cite the actual queue ' +
    'numbers you used.';

  const RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
      junctionId: { type: 'STRING' },
      action: { type: 'STRING', enum: ACTIONS },
      reason: { type: 'STRING' }
    },
    required: ['junctionId', 'action', 'reason']
  };

  const decisions = [];             // newest first
  const timers = {};                // junctionId -> seconds until next decision
  const inFlight = {};              // junctionId -> bool
  const callStats = { calls: 0, errors: 0, lastLatencyMs: 0, avgLatencyMs: 0 };

  function hasKey() { return GEMINI_API_KEY.trim().length > 0; }

  /* ------------------------------------------------------------------ logging */
  function log(junctionId, action, reason, source, latencyMs) {
    const j = SIM.junctionById(junctionId);
    if (j) {
      j.lastAction = action;
      j.lastReason = reason;
      j.lastSource = source;
      j.lastDecisionAt = SIM.time();
    }
    decisions.unshift({
      junctionId: junctionId,
      action: action,
      reason: reason,
      source: source,             // 'gemini' | 'heuristic' | 'error'
      latencyMs: latencyMs || 0,
      simTime: SIM.time(),
      wallClock: new Date()
    });
    if (decisions.length > LOG_LIMIT) decisions.length = LOG_LIMIT;
  }

  /* ------------------------------------------------------------- prompt build
   * Rich context: own queues and waits, current phase, neighbour pressure and
   * the junction's own recent decisions, so the model can avoid flip-flopping.
   */
  function buildPayload(j, snap) {
    const neighbours = {};
    for (const other of SIM.junctions) {
      if (other.id === j.id) continue;
      if (other.row !== j.row && other.col !== j.col) continue;   // not adjacent
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
        incidentFlag: snap.incidentFlag
      },
      signal: {
        currentPhase: j.phase,
        phaseState: j.state,
        greenElapsedSec: Math.round(j.greenElapsed * 10) / 10,
        minGreenSec: SIM.SIGNAL.minGreen,
        maxGreenSec: SIM.SIGNAL.maxGreen
      },
      adjacentJunctions: neighbours,
      yourRecentDecisions: history
    };
  }

  /* ------------------------------------------------------------- Gemini call */
  // Flipped to false if the endpoint rejects the response schema, so a schema
  // that a future model version dislikes cannot break every decision.
  let schemaSupported = true;

  async function askGemini(j, snap) {
    const payload = buildPayload(j, snap);
    const generationConfig = {
      temperature: 0.15,
      maxOutputTokens: 200,
      responseMimeType: 'application/json'
    };
    if (schemaSupported) generationConfig.responseSchema = RESPONSE_SCHEMA;

    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        role: 'user',
        parts: [{
          text: 'Live snapshot:\n' + JSON.stringify(payload) +
            '\nReturn one decision as JSON with keys junctionId, action, reason. ' +
            'action must be one of ' + ACTIONS.join(', ') + '.'
        }]
      }],
      generationConfig: generationConfig
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    const started = performance.now();

    try {
      const res = await fetch(ENDPOINT + '?key=' + encodeURIComponent(GEMINI_API_KEY), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        // A 400 usually means the schema was refused; drop it and let the next
        // call go through on the prompt alone rather than failing forever.
        if (res.status === 400 && schemaSupported) schemaSupported = false;
        throw new Error('HTTP ' + res.status);
      }
      const data = await res.json();
      const text = data &&
        data.candidates && data.candidates[0] &&
        data.candidates[0].content && data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
      if (!text) throw new Error('empty response');

      const parsed = JSON.parse(text);
      if (ACTIONS.indexOf(parsed.action) === -1) throw new Error('bad action: ' + parsed.action);

      const latency = Math.round(performance.now() - started);
      callStats.calls++;
      callStats.lastLatencyMs = latency;
      callStats.avgLatencyMs = callStats.avgLatencyMs
        ? Math.round(callStats.avgLatencyMs * 0.8 + latency * 0.2)
        : latency;

      return { action: parsed.action, reason: String(parsed.reason || '').slice(0, 160), latency: latency };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* --------------------------------------------------------------- heuristic
   * Local fallback controller. Runs when no API key is configured, so the
   * digital twin is fully usable offline and doubles as a sanity baseline.
   */
  function heuristicDecision(j, snap) {
    const q = snap.queueLengths;
    const w = snap.longestWaitSec;
    const ns = q.N + q.S;
    const ew = q.E + q.W;
    const nsWait = Math.max(w.N, w.S);
    const ewWait = Math.max(w.E, w.W);

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

  /* ------------------------------------------------------------ decision cycle */
  async function decide(j) {
    const snap = SENSOR_FEED.get(j.id);
    if (!snap) return;
    inFlight[j.id] = true;
    try {
      if (!hasKey()) {
        const d = heuristicDecision(j, snap);
        SIM.applyAction(j.id, d.action);
        log(j.id, d.action, d.reason, 'heuristic', 0);
        return;
      }
      const d = await askGemini(j, snap);
      SIM.applyAction(j.id, d.action);
      log(j.id, d.action, d.reason, 'gemini', d.latency);
    } catch (err) {
      // On latency or failure the signal keeps its previous state; the state
      // machine in sim.js carries on running, so the sim never freezes.
      callStats.errors++;
      log(j.id, 'hold', 'Gemini unavailable (' + err.message + ') - holding previous signal state.', 'error', 0);
    } finally {
      inFlight[j.id] = false;
    }
  }

  SIM.onTick(function (dt) {
    if (SIM.controlMode() !== 'ai') return;
    for (const j of SIM.junctions) {
      if (timers[j.id] === undefined) timers[j.id] = 1.0 + Math.random();  // small startup spread
      timers[j.id] -= dt;
      if (timers[j.id] <= 0 && !inFlight[j.id]) {
        timers[j.id] = DECISION_INTERVAL;
        decide(j);            // fired in parallel across junctions, never awaited
      }
    }
  });

  return {
    DECISION_INTERVAL: DECISION_INTERVAL,
    MODEL: GEMINI_MODEL,
    decisions: decisions,
    stats: callStats,
    hasKey: hasKey,
    isBusy: function (junctionId) { return !!inFlight[junctionId]; }
  };
})();
