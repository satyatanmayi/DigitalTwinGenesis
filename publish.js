/* =============================================================================
 * publish.js — the street's side of the wire.
 *
 * Runs inside index.html. Twice a second it publishes what the twin can see,
 * and it accepts commands back from the control room. Nothing here decides
 * anything: the console decides, the street carries it out.
 *
 * What gets published is deliberately small — the state a roadside system could
 * actually report, plus the request book. Not vehicle positions: a control room
 * does not need to know where every two-wheeler is, and sending them would make
 * this look like screen-sharing rather than a data feed.
 *
 * NO drawing code in this file.
 * ========================================================================== */

(function () {
  'use strict';

  const PUBLISH_EVERY = 0.5;      // simulated seconds between snapshots
  let acc = 0;

  function junctionSnapshot(j) {
    const plan = SIM.getPlan(j.id);
    const hold = SIM.holdFor(j.id);
    return {
      id: j.id,
      phase: j.phase,
      state: j.state,
      greenElapsed: Math.round(j.greenElapsed * 10) / 10,
      queues: { N: j.queues.N, S: j.queues.S, E: j.queues.E, W: j.queues.W },
      pcu: {
        N: Math.round(j.pcuQueues.N * 10) / 10, S: Math.round(j.pcuQueues.S * 10) / 10,
        E: Math.round(j.pcuQueues.E * 10) / 10, W: Math.round(j.pcuQueues.W * 10) / 10
      },
      longestWait: {
        N: Math.round(j.longestWait.N), S: Math.round(j.longestWait.S),
        E: Math.round(j.longestWait.E), W: Math.round(j.longestWait.W)
      },
      plan: { greenNS: plan.greenNS, greenEW: plan.greenEW },
      heldFor: hold ? hold.id : null,
      blocked: blockedApproach(j.id),
      reason: j.lastReason,
      source: j.lastSource,
      modelScores: (typeof NN !== 'undefined' && NN.isReady()) ? NN.scoreJunction(j) : null
    };
  }

  function blockedApproach(id) {
    for (const d of SIM.DIRS) {
      if (SIM.conditions.blockedApproaches[id + ':' + d]) return d;
    }
    return null;
  }

  function requestSnapshot(r) {
    return {
      id: r.id, state: r.state, axis: r.axis, severity: r.severity,
      verification: r.verification, persons: r.persons,
      etaSec: Math.round(r.etaSec), route: r.route,
      reason: r.reason, workings: r.workings || '',
      score: r.estimate ? Math.round(r.estimate.score * 100) / 100 : null,
      predictedSaved: r.estimate ? Math.round(r.estimate.saved) : null,
      predictedCost: r.estimate ? Math.round(r.estimate.cost) : null,
      actual: r.actual ? {
        saved: Math.round(r.actual.savedSec * 10) / 10,
        cost: Math.round(r.actual.costVehSec)
      } : null
    };
  }

  function snapshot() {
    return {
      clock: Math.round(SIM.time()),
      controller: SIM.controlMode(),
      avgDelay: Math.round(SIM.avgDelay() * 10) / 10,
      totalQueue: SIM.totalQueue(),
      onRoad: SIM.vehicles.length,
      processed: SIM.stats.processed,
      load: SIM.spawnRate(),
      paused: SIM.isPaused(),
      junctions: SIM.junctions.map(junctionSnapshot),
      requests: PRIORITY.requests.slice(-8).map(requestSnapshot),
      conflicts: PRIORITY.conflicts().map(function (c) {
        return {
          junction: c.junction, inSec: Math.round(c.inSec), text: c.text,
          a: requestSnapshot(c.a), b: requestSnapshot(c.b)
        };
      }),
      flooded: Object.keys(SIM.conditions.floodedRoads),
      modelReady: (typeof NN !== 'undefined') && NN.isReady(),
      ledger: {
        grants: SIM.stats.priorityLedger.grants,
        refusals: SIM.stats.priorityLedger.refusals,
        crossVehSec: Math.round(SIM.stats.priorityLedger.crossVehSec)
      }
    };
  }

  SIM.onTick(function (dt) {
    acc += dt;
    if (acc < PUBLISH_EVERY) return;
    acc = 0;
    LINK.send('state', snapshot());
  });

  /* ------------------------------------------------------- inbound commands */
  LINK.on(function (msg) {
    if (msg.type !== 'command') return;
    const c = msg.payload || {};
    switch (c.action) {
      case 'setPlan':
        if (c.junction === 'ALL') SIM.setPlanAll(c.plan);
        else SIM.setPlan(c.junction, c.plan);
        note('Control room set ' + c.junction + ' to ' +
             c.plan.greenNS + 's/' + c.plan.greenEW + 's.');
        break;

      case 'controller':
        SIM.setControlMode(c.mode);
        note('Control room switched control to ' + c.mode + '.');
        break;

      case 'grant': {
        const r = PRIORITY.byId(c.requestId);
        if (r) {
          PRIORITY.forceGrant(r);
          note('Control room granted ' + r.id + ' by hand.');
        }
        break;
      }

      case 'deny': {
        const r = PRIORITY.byId(c.requestId);
        if (r) {
          PRIORITY.forceRefuse(r, 'Refused by the control room operator.');
          note('Control room refused ' + r.id + '.');
        }
        break;
      }

      case 'holdBoth':
        note('Control room chose to serve neither request yet.');
        break;

      case 'scenario':
        if (c.name === 'accident') SCENARIOS.accident(c.junction || 'J2', c.approach || 'E');
        else if (c.name === 'flood') SCENARIOS.flood('row1', 0.45, true);
        else if (c.name === 'surge') SCENARIOS.surge('EW', 2.6);
        else if (c.name === 'twoAmbulances') SCENARIOS.twoAmbulances();
        else if (c.name === 'normal') SCENARIOS.clearAll();
        break;

      case 'load':
        SIM.setSpawnRate(c.value);
        break;
    }
  });

  function note(text) {
    SCENARIOS.log.unshift({ kind: 'scenario', text: text, at: SIM.time(), wall: new Date() });
    if (SCENARIOS.log.length > 30) SCENARIOS.log.length = 30;
  }
})();
