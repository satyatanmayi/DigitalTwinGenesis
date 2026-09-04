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
    SIM.conditions.priorityHold = null;
    for (const sp of SIM.spawnPoints()) sp.weight = 1;
    active = null;
    tracked = null;
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
   * A verified priority request arrives from an external source. Verification
   * itself is out of scope for this tool: what is modelled here is what the
   * network does with a request once it believes it — arbitrate, grant or
   * refuse, hold the corridor, and account for the cost.
   */

  function requestCorridor(axis) {
    axis = axis || 'EW';
    const phase = (axis === 'NS') ? 'NS' : 'EW';

    // ---- admission control ----
    if (active && active.until > SIM.time()) {
      SIM.stats.priorityLedger.refusals++;
      note('refused', 'Priority request REFUSED: a corridor is already running. ' +
        'Concurrent corridors are capped at ' + ADMISSION.maxConcurrent + '.');
      return false;
    }
    const q = SIM.totalQueue();
    if (q > ADMISSION.queueBudgetPcu) {
      SIM.stats.priorityLedger.refusals++;
      note('refused', 'Priority request REFUSED: network queue is ' + q +
        ' vehicles, above the ' + ADMISSION.queueBudgetPcu +
        ' budget. Granting it now would cost more than it saves.');
      return false;
    }

    const route = SIM.junctions.map(function (j) { return j.id; });
    active = { route: route, phase: phase, until: SIM.time() + ADMISSION.holdSeconds };
    SIM.conditions.priorityHold = {
      junctionIds: route, phase: phase, until: active.until
    };
    SIM.stats.priorityLedger.active = true;
    SIM.stats.priorityLedger.grants++;
    SIM.stats.priorityLedger.crossVehSec = 0;

    spawnPriorityVehicle(axis);
    note('granted', 'Priority corridor GRANTED on the ' + axis + ' axis for ' +
      ADMISSION.holdSeconds + 's across ' + route.length + ' junctions.');
    return true;
  }

  function spawnPriorityVehicle(axis) {
    const dir = (axis === 'NS') ? 'S' : 'E';
    const points = SIM.spawnPoints().filter(function (sp) { return sp.dir === dir; });
    if (!points.length) return;
    const sp = points[0];
    const type = SIM.VEHICLE_TYPES[2];   // car-sized
    const s = (dir === 'E') ? sp.x : (dir === 'S' ? sp.y : -sp.x);
    const v = {
      id: 90000 + Math.floor(Math.random() * 9999),
      type: type, dir: sp.dir, lane: sp.lane, road: sp.road,
      lat: sp.lat, s: s, x: sp.x, y: sp.y,
      speed: type.maxSpeed * 0.9, waitTime: 0, travelled: 0,
      bornAt: SIM.time(), priority: true, passed: {}
    };
    SIM.vehicles.push(v);
    // The comparison is against ordinary vehicles finishing in the SAME window,
    // not against a historical average — same traffic, same conditions.
    tracked = {
      ref: v, bornAt: v.bornAt,
      atStart: { processed: SIM.stats.processed, delaySum: SIM.stats.delaySum },
      fallback: SIM.avgDelay()
    };
  }

  /* ---- per-tick bookkeeping: close the corridor, settle the ledger ---- */
  SIM.onTick(function () {
    if (active && active.until <= SIM.time()) {
      SIM.conditions.priorityHold = null;
      SIM.stats.priorityLedger.active = false;
      active = null;
    }
    if (tracked) {
      const stillHere = SIM.vehicles.indexOf(tracked.ref) !== -1;
      if (stillHere) {
        tracked.travelled = tracked.ref.travelled;
        tracked.elapsed = SIM.time() - tracked.bornAt;
      } else {
        const freeFlow = (tracked.travelled || 0) / SIM.VEHICLE_TYPES[2].maxSpeed;
        const actualDelay = Math.max(0, (tracked.elapsed || 0) - freeFlow);
        // Baseline: the delay ordinary vehicles took on the same network while
        // this trip was running. Same traffic, same conditions, same window.
        const doneN = SIM.stats.processed - tracked.atStart.processed;
        const doneD = SIM.stats.delaySum - tracked.atStart.delaySum;
        const baseline = doneN > 3 ? (doneD / doneN) : tracked.fallback;
        tracked.baseline = baseline;
        const saved = Math.max(0, baseline - actualDelay);
        SIM.stats.priorityLedger.savedSec = saved;
        lastCompleted = {
          savedSec: saved,
          crossVehSec: SIM.stats.priorityLedger.crossVehSec,
          at: SIM.time()
        };
        note('ledger', 'Corridor complete. Priority vehicle saved ' + saved.toFixed(1) +
          's against the ' + (tracked.baseline || 0).toFixed(1) +
          's an ordinary vehicle was losing. Cross traffic paid ' +
          SIM.stats.priorityLedger.crossVehSec.toFixed(0) + ' vehicle-seconds.');
        tracked = null;
      }
    }
  });

  return {
    ADMISSION: ADMISSION,
    log: log,
    clearAll: clearAll,
    accident: accident,
    clearAccident: clearAccident,
    flood: flood,
    clearFlood: clearFlood,
    surge: surge,
    signalFailure: signalFailure,
    requestCorridor: requestCorridor,
    isCorridorActive: function () { return !!(active && active.until > SIM.time()); },
    corridorRemaining: function () { return active ? Math.max(0, active.until - SIM.time()) : 0; },
    lastCompleted: function () { return lastCompleted; },
    trackedVehicle: function () { return tracked ? tracked.ref : null; }
  };
})();
