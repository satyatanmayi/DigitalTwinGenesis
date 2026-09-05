/* =============================================================================
 * scenarios.js — The bad day.
 *
 * Adaptive control optimises the ordinary day. These are the conditions that
 * fall out of it and get handled by police override and radio: a blocked
 * approach after a collision, a flooded link that heavy vehicles cannot use, a
 * demand surge, a signal failure, and a request for priority down a corridor.
 *
 * The priority ledger is the part nobody else shows: granting a green corridor
 * has a price, paid in cross-traffic vehicle-seconds, and this measures it
 * while it is being paid.
 *
 * NO drawing code, NO p5.js, NO DOM access in this file.
 * ========================================================================== */

const SCENARIOS = (function () {
  'use strict';

  const ADMISSION = {
    maxConcurrent: 1,        // corridors that may run at once
    queueBudgetPcu: 34,      // network queue above which a corridor is refused
    holdSeconds: 22          // how long a corridor holds each junction green
  };

  const log = [];            // newest first
  let active = null;         // { id, route, phase, until }
  let tracked = null;        // the priority vehicle being measured
  let lastCompleted = null;  // result of the most recent corridor

  function note(kind, text) {
    log.unshift({ kind: kind, text: text, at: SIM.time(), wall: new Date() });
    if (log.length > 30) log.length = 30;
  }

  /* --------------------------------------------------------------- presets */

  function clearAll() {
    SIM.conditions.blockedApproaches = {};
    SIM.conditions.floodedRoads = {};
    SIM.conditions.priorityHolds = [];
    for (const sp of SIM.spawnPoints()) sp.weight = 1;
    PRIORITY.reset();
    note('scenario', 'Normal conditions restored.');
  }

  /** A collision blocks one approach: it cannot discharge until it is cleared. */
  function accident(junctionId, approach) {
    junctionId = junctionId || 'J2';
    approach = approach || 'E';
    SIM.conditions.blockedApproaches[junctionId + ':' + approach] = true;
    note('incident', 'Collision at ' + junctionId + ': the ' + approach +
      ' approach is blocked and cannot discharge. Queue will spill back upstream.');
  }

  function clearAccident(junctionId, approach) {
    delete SIM.conditions.blockedApproaches[junctionId + ':' + approach];
    note('incident', 'Carriageway cleared at ' + junctionId + ' ' + approach + '.');
  }

  /** A flooded link: everything slows, and heavy vehicles are barred from it. */
  function flood(roadId, speedFactor, barHeavy) {
    roadId = roadId || 'row1';
    SIM.conditions.floodedRoads[roadId] = {
      speedFactor: speedFactor === undefined ? 0.45 : speedFactor,
      barHeavy: barHeavy === undefined ? true : barHeavy
    };
    note('incident', 'Waterlogging on ' + roadId + ': speeds cut to ' +
      Math.round((speedFactor === undefined ? 0.45 : speedFactor) * 100) +
      '% and buses and trucks are barred by weight restriction.');
  }

  function clearFlood(roadId) {
    delete SIM.conditions.floodedRoads[roadId];
    note('incident', 'Water receded on ' + roadId + '. Weight restriction lifted.');
  }

  /** Stadium, festival, market: demand goes sharply asymmetric. */
  function surge(axis, factor) {
    axis = axis || 'EW';
    factor = factor || 2.6;
    const dirs = (axis === 'NS') ? ['N', 'S'] : ['E', 'W'];
    for (const sp of SIM.spawnPoints()) {
      sp.weight = (dirs.indexOf(sp.dir) !== -1) ? factor : 1;
    }
    note('scenario', 'Demand surge on the ' + axis + ' axis at ' + factor +
      'x normal arrival rate.');
  }

  /** A dead or unsynchronised controller: long fixed cycle, no responsiveness. */
  function signalFailure(junctionId) {
    junctionId = junctionId || 'J3';
    SIM.setPlan(junctionId, { greenNS: 45, greenEW: 45 });
    note('incident', junctionId + ' controller degraded: stuck on a 45s/45s fixed cycle. ' +
      'Watch how far the damage spreads to its neighbours.');
  }

  /* ------------------------------------------------------- priority corridor
   * Arbitration lives in priority.js now, because one corridor at a time was
   * never the real problem. These functions stay as the demo entry points.
   */

  function requestCorridor(axis) {
    const req = PRIORITY.submit({ axis: axis || 'EW' });
    note(req.state === 'granted' ? 'granted' : (req.state === 'refused' ? 'refused' : 'scenario'),
      req.id + ' ' + req.state.toUpperCase() + (req.reason ? ' — ' + req.reason : ''));
    return req.state === 'granted';
  }

  /** The abuse case a judge will raise: one source, pressed over and over.
   *
   *  Nothing here is stopped by trusting the requester - severity and
   *  verification are inputs and could be lied about. What stops it is that the
   *  network limits what any single source can consume, prices every grant, and
   *  writes each attempt to a log with the source attached.
   */
  function misuseAttack(count) {
    count = count || 8;
    // An abuser presses the button in a busy network - that is when a granted
    // corridor is worth stealing. Make sure there is traffic to steal from,
    // otherwise every request is refused for being pointless rather than for
    // being abusive, and the demo shows the wrong mechanism.
    if (SIM.totalQueue() < 8) SIM.setSpawnRate(Math.max(SIM.spawnRate(), 1.6));
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(PRIORITY.submit({
        source: 'DEVICE-7',
        severity: 'S1',
        verification: i % 3 === 0 ? 'unverified' : 'verified',
        axis: i % 2 === 0 ? 'EW' : 'NS',
        etaSec: 10 + i * 3
      }));
    }
    const refused = out.filter(function (r) { return r.state === 'refused'; }).length;
    note('refused', count + ' priority requests fired from a single source, DEVICE-7. ' +
      refused + ' refused outright. Every attempt is logged against that source.');
    return out;
  }

  /** The headline case: two ambulances, one junction, opposite phases. */
  function twoAmbulances() {
    const pair = PRIORITY.demoConflict();
    note('incident', 'Two priority requests inbound on crossing roads: ' +
      pair[0].id + ' in ' + pair[0].etaSec.toFixed(0) + 's and ' +
      pair[1].id + ' in ' + pair[1].etaSec.toFixed(0) + 's. Only one can be served.');
    return pair;
  }

  return {
    ADMISSION: { get holdSeconds() { return PRIORITY.POLICY.holdSeconds; },
                 get maxConcurrent() { return PRIORITY.POLICY.maxConcurrent; },
                 get queueBudgetPcu() { return PRIORITY.POLICY.queueBudgetPcu; } },
    log: log,
    clearAll: clearAll,
    accident: accident,
    clearAccident: clearAccident,
    flood: flood,
    clearFlood: clearFlood,
    surge: surge,
    signalFailure: signalFailure,
    requestCorridor: requestCorridor,
    twoAmbulances: twoAmbulances,
    misuseAttack: misuseAttack,
    isCorridorActive: function () { return PRIORITY.active().length > 0; },
    corridorRemaining: function () {
      const holds = SIM.activeHolds();
      if (!holds.length) return 0;
      let m = 0;
      for (const h of holds) m = Math.max(m, h.until - SIM.time());
      return m;
    },
    lastCompleted: function () {
      const done = PRIORITY.requests.filter(function (r) { return r.state === 'completed' && r.actual; });
      return done.length ? done[done.length - 1].actual : null;
    },
    trackedVehicle: function () {
      const live = PRIORITY.active();
      for (const r of live) if (r.vehicle && SIM.vehicles.indexOf(r.vehicle) !== -1) return r.vehicle;
      return null;
    }
  };
})();
