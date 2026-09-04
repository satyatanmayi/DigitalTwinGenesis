/* =============================================================================
 * controllers.js — Classical signal control, for comparison against the AI.
 *
 * Two well-known methods, both implemented honestly and both citable:
 *
 *   Webster (1958)  — closed-form minimum-delay cycle length and green split
 *                     from measured flow ratios. What a traffic engineer does
 *                     by hand. Used here to propose a plan, not to run live.
 *   Max-Pressure    — serve the phase with the greatest pressure. Provably
 *                     throughput-maximising, needs no training, and is the
 *                     standard baseline in the RL signal-control literature
 *                     (RESCO benchmark; learned methods beat it by ~11-13%).
 *
 * NO drawing code, NO p5.js, NO DOM access in this file.
 * ========================================================================== */

const CONTROLLERS = (function () {
  'use strict';

  /* --------------------------------------------------------------- Webster
   * C = (1.5 L + 5) / (1 - Y)
   *   L = total lost time per cycle  (yellow + all-red + start-up, per phase)
   *   Y = sum of critical flow ratios y = q / s
   * Effective green is split between phases in proportion to y.
   *
   * Known limitation, stated openly: Webster overestimates the cycle once the
   * volume-to-capacity ratio passes about 0.5, and it was derived for
   * homogeneous lane-disciplined traffic. Indian-calibrated variants exist.
   * The flow ratios here use PCU, which is the usual correction.
   */
  function websterFor(junction, elapsedSec) {
    const P = SIM.PARAMS;
    const S = SIM.SIGNAL;
    const hours = Math.max(elapsedSec, 30) / 3600;
    const sat = P.satFlowPcuH;

    const q = {};
    for (const d of SIM.DIRS) q[d] = junction.arrivalPcu[d] / hours;   // PCU/hour

    const yNS = Math.max(q.N, q.S) / sat;
    const yEW = Math.max(q.E, q.W) / sat;
    let Y = yNS + yEW;
    const saturated = Y >= 0.9;
    if (saturated) Y = 0.9;                       // keep the formula finite

    const lost = 2 * (S.yellow + S.allRed) + 2 * P.startupLostS;
    const cycle = (1.5 * lost + 5) / (1 - Y);
    const totalGreen = Math.max(2 * S.minGreen, cycle - lost);

    let greenNS = Y > 0 ? totalGreen * (yNS / Y) : totalGreen / 2;
    let greenEW = Y > 0 ? totalGreen * (yEW / Y) : totalGreen / 2;
    greenNS = clamp(Math.round(greenNS), S.minGreen, S.maxGreen);
    greenEW = clamp(Math.round(greenEW), S.minGreen, S.maxGreen);

    return {
      junctionId: junction.id,
      greenNS: greenNS,
      greenEW: greenEW,
      cycle: Math.round(greenNS + greenEW + lost),
      flowNS: Math.round(Math.max(q.N, q.S)),
      flowEW: Math.round(Math.max(q.E, q.W)),
      yNS: yNS, yEW: yEW, Y: Y,
      saturated: saturated,
      reason: saturated
        ? 'Demand is at or above capacity (Y >= 0.9), so the cycle is capped. Webster cannot fix an oversaturated junction.'
        : 'Critical flows ' + Math.round(Math.max(q.N, q.S)) + ' PCU/h north-south and ' +
          Math.round(Math.max(q.E, q.W)) + ' PCU/h east-west give a ' +
          Math.round(greenNS + greenEW + lost) + 's cycle.'
    };
  }

  /** Compute Webster plans for every junction and write them into SIM. */
  function applyWebster() {
    const out = [];
    for (const j of SIM.junctions) {
      const r = websterFor(j, SIM.time());
      SIM.setPlan(j.id, { greenNS: r.greenNS, greenEW: r.greenEW });
      out.push(r);
    }
    return out;
  }

  /* ----------------------------------------------------------- Max-Pressure
   * Pressure of a phase = total queued PCU on the approaches that phase serves.
   *
   * Simplification stated openly: the textbook formulation subtracts downstream
   * queue from upstream queue. In this network vehicles leave at the boundary
   * rather than entering a downstream link with a finite queue, so the
   * downstream term is zero for edge movements and small elsewhere; the
   * upstream term is used alone.
   */
  function pressure(j, phase) {
    const dirs = (phase === 'NS') ? ['N', 'S'] : ['E', 'W'];
    let p = 0;
    for (const d of dirs) p += j.pcuQueues[d];
    return p;
  }

  const MARGIN = 1.0;    // PCU advantage needed before switching, damps flapping

  function stepMaxPressure() {
    for (const j of SIM.junctions) {
      if (j.state !== 'green') continue;
      if (j.greenElapsed < SIM.SIGNAL.minGreen) continue;
      const other = (j.phase === 'NS') ? 'EW' : 'NS';
      const pNow = pressure(j, j.phase);
      const pOther = pressure(j, other);
      if (pOther > pNow + MARGIN) {
        SIM.applyAction(j.id, 'switch');
        j.lastAction = 'switch';
        j.lastSource = 'maxpressure';
        j.lastReason = 'Pressure ' + pOther.toFixed(1) + ' PCU on ' + other +
          ' exceeds ' + pNow.toFixed(1) + ' on ' + j.phase + ', so switch.';
        j.lastDecisionAt = SIM.time();
      } else if (j.timer < 1 && pNow > pOther + MARGIN) {
        SIM.applyAction(j.id, 'extend_green_' + j.phase);
        j.lastAction = 'extend_green_' + j.phase;
        j.lastSource = 'maxpressure';
        j.lastReason = 'Pressure ' + pNow.toFixed(1) + ' PCU still highest on ' +
          j.phase + ', so extend.';
        j.lastDecisionAt = SIM.time();
      }
    }
  }

  SIM.onTick(function () {
    if (SIM.controlMode() === 'maxpressure') stepMaxPressure();
  });

  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  return {
    websterFor: websterFor,
    applyWebster: applyWebster,
    pressure: pressure
  };
})();
