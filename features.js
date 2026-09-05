/* =============================================================================
 * features.js — the state the model sees.
 *
 * This file exists so there is exactly ONE definition of the input vector. The
 * trainer (tools/env-server.js) and the browser (nn.js) both load it, so the
 * features the model was trained on cannot drift away from the features it is
 * given at run time. That mismatch is one of the most common ways a working
 * model quietly stops working after deployment.
 *
 * Every number is expressed RELATIVE to the phase that is green right now, so
 * the policy never has to work out which way round the junction is:
 *
 *   0  queue on the green phase                (PCU / 12)
 *   1  queue on the red phase                  (PCU / 12)
 *   2  red queue minus green queue             — what the decision turns on
 *   3  longest wait on the green phase         (s / 60)
 *   4  longest wait on the red phase           (s / 60)
 *   5  red wait minus green wait
 *   6  green already served                    (s / 60)
 *   7  1 if minimum green has been served, so switching is allowed
 *
 * NO drawing code, NO p5.js, NO DOM access in this file.
 * ========================================================================== */

const FEATURES = (function () {
  'use strict';

  const SIZE = 8;

  function forJunction(j) {
    const nsQ = j.pcuQueues.N + j.pcuQueues.S;
    const ewQ = j.pcuQueues.E + j.pcuQueues.W;
    const nsW = Math.max(j.longestWait.N, j.longestWait.S);
    const ewW = Math.max(j.longestWait.E, j.longestWait.W);
    const isNS = j.phase === 'NS';

    const greenQ = isNS ? nsQ : ewQ;
    const redQ = isNS ? ewQ : nsQ;
    const greenW = isNS ? nsW : ewW;
    const redW = isNS ? ewW : nsW;

    return [
      greenQ / 12,
      redQ / 12,
      (redQ - greenQ) / 12,
      greenW / 60,
      redW / 60,
      (redW - greenW) / 60,
      j.greenElapsed / 60,
      j.greenElapsed >= SIM.SIGNAL.minGreen ? 1 : 0
    ];
  }

  /** All junctions, flattened — the shape the environment protocol uses. */
  function all() {
    const out = [];
    for (const j of SIM.junctions) out.push.apply(out, forJunction(j));
    return out;
  }

  const LABELS = [
    'green queue (PCU/12)', 'red queue (PCU/12)', 'red minus green queue',
    'green wait (s/60)', 'red wait (s/60)', 'red minus green wait',
    'green elapsed (s/60)', 'min green served'
  ];

  return { SIZE: SIZE, forJunction: forJunction, all: all, LABELS: LABELS };
})();
