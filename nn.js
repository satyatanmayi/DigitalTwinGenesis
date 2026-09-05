/* =============================================================================
 * nn.js — the trained model, running in the browser.
 *
 * Loads the weights produced by tools/train.py and uses them as a fourth
 * controller. Inference is three matrix multiplies; there is no library, and
 * every line here has a matching line in the trainer.
 *
 * WHAT IT DECIDES
 *   For each junction, every DECISION_SEC seconds, it scores two actions:
 *       hold   — do nothing, let the timing plan run
 *       switch — end the running green now and serve the other phase
 *   and takes the better-scoring one. The score is a predicted outcome: how
 *   much delay the junction is expected to accumulate over the next minute.
 *
 * WHAT IT CANNOT DO
 *   Anything unsafe. It writes through SIM.applyAction() like every other
 *   controller, and minimum green, maximum green, yellow and all-red are
 *   enforced beneath that function. A bad prediction costs delay, never safety.
 *
 * NO drawing code, NO p5.js in this file. It reads weights and writes actions.
 * ========================================================================== */

const NN = (function () {
  'use strict';

  const DECISION_SEC = 5.0;      // must match DECISION_SEC in tools/train.py

  let weights = null;            // { layers: [{W, b}], meta: {...} }
  let ready = false;
  let loadError = null;
  let sinceDecision = 0;
  const lastScores = {};         // junctionId -> { hold, switch }

  /* ------------------------------------------------------------------ maths */
  function relu(v) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = v[i] > 0 ? v[i] : 0;
    return out;
  }

  /** y = x·W + b for one sample. W is stored row-major as W[input][output]. */
  function layer(x, W, b) {
    const outSize = b.length;
    const out = new Array(outSize);
    for (let o = 0; o < outSize; o++) {
      let sum = b[o];
      for (let i = 0; i < x.length; i++) sum += x[i] * W[i][o];
      out[o] = sum;
    }
    return out;
  }

  /** Forward pass: ReLU on the hidden layers, linear on the output. */
  function predict(x) {
    if (!ready) return null;
    let h = x;
    const L = weights.layers;
    for (let i = 0; i < L.length - 1; i++) h = relu(layer(h, L[i].W, L[i].b));
    return layer(h, L[L.length - 1].W, L[L.length - 1].b);
  }

  /* ------------------------------------------------------------------ loading
   * weights.js sets window.NN_WEIGHTS, which works when the page is opened
   * straight from disk. weights.json is fetched when the page is served over
   * HTTP. Either path gives the same numbers.
   */
  function load() {
    if (typeof window !== 'undefined' && window.NN_WEIGHTS) {
      adopt(window.NN_WEIGHTS);
      return Promise.resolve(true);
    }
    return fetch('weights.json')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) { adopt(data); return true; })
      .catch(function (err) {
        loadError = err.message;
        return false;
      });
  }

  function adopt(data) {
    weights = data;
    ready = !!(data && data.layers && data.layers.length);
    if (ready && data.inputSize !== FEATURES.SIZE) {
      loadError = 'weights expect ' + data.inputSize + ' inputs but features give ' + FEATURES.SIZE;
      ready = false;
    }
  }

  /* ---------------------------------------------------------------- the loop */
  SIM.onTick(function (dt) {
    if (SIM.controlMode() !== 'nn' || !ready) return;
    sinceDecision += dt;
    if (sinceDecision < DECISION_SEC) return;
    sinceDecision = 0;

    for (const j of SIM.junctions) {
      const x = FEATURES.forJunction(j);
      const q = predict(x);
      if (!q) continue;
      lastScores[j.id] = { hold: q[0], switchTo: q[1] };

      const wantSwitch = q[1] > q[0];
      if (wantSwitch) SIM.applyAction(j.id, 'switch');

      j.lastAction = wantSwitch ? 'switch' : 'hold';
      j.lastSource = 'nn';
      j.lastDecisionAt = SIM.time();
      j.lastReason = wantSwitch
        ? 'Model predicts switching is better here: ' + q[1].toFixed(2) +
          ' against ' + q[0].toFixed(2) + ', with ' +
          (j.pcuQueues[oppositeOfPhase(j)] || 0).toFixed(1) + ' PCU waiting on red.'
        : 'Model predicts holding is better: ' + q[0].toFixed(2) +
          ' against ' + q[1].toFixed(2) + '.';
    }
  });

  function oppositeOfPhase(j) {
    return j.phase === 'NS' ? 'E' : 'N';
  }

  /* ------------------------------------------------------------------- API */
  return {
    DECISION_SEC: DECISION_SEC,
    load: load,
    isReady: function () { return ready; },
    error: function () { return loadError; },
    meta: function () { return weights && weights.meta; },
    scores: function (junctionId) { return lastScores[junctionId] || null; },
    /** Exposed so the console can ask "what would the model do here?" */
    scoreJunction: function (j) {
      const q = predict(FEATURES.forJunction(j));
      return q ? { hold: q[0], switchTo: q[1] } : null;
    },
    featureVector: function (j) { return FEATURES.forJunction(j); }
  };
})();

if (typeof window !== 'undefined') NN.load();
