/* =============================================================================
 * priority.js — Arbitration between competing emergency priority requests.
 *
 * The problem this solves is the one existing systems assume away. NTCIP 1211
 * defines how a junction triages several requests, but it assumes a small
 * population of authorised vehicles and it says nothing about what a grant
 * costs everybody else. Open priority to ordinary vehicles and conflicts stop
 * being rare: two requests needing opposite phases at the same junction become
 * the normal case, not the exception.
 *
 * WHAT THIS FILE DOES
 *   1. Accepts requests. Severity, verification status, vehicle type and
 *      occupancy arrive as inputs and are never inferred here.
 *   2. Scores each one as a live benefit-cost ratio, in person-seconds.
 *   3. Grants, queues or refuses — each with a reason and the arithmetic.
 *   4. Detects conflicts BEFORE they happen, so an operator can be warned.
 *   5. Settles a ledger per request: seconds saved against seconds paid.
 *
 * NO drawing code, NO p5.js, NO DOM access in this file.
 * ========================================================================== */

const PRIORITY = (function () {
  'use strict';

  /* ---------------------------------------------------------------- policy
   * These weights are a POLICY input, not an engineering result. Whether a
   * critical case counts three times a routine one belongs to a traffic
   * authority and a health service, not to us. What the tool contributes is
   * making the consequence of any weighting visible.
   */
  const POLICY = {
    severityWeight: { S1: 3.0, S2: 2.0, S3: 1.0 },
    verifiedWeight: { verified: 1.0, unverified: 0.55 },
    ageingPerSecond: 0.9,        // score added per second already waited
    holdSeconds: 20,             // initial hold window for a granted corridor
    holdRefreshSec: 8,           // topped up while the vehicle is still on the route
    maxHoldSec: 80,              // absolute ceiling on one corridor, whatever happens
    maxConcurrent: 2,            // corridors that may run at once
    queueBudgetPcu: 46,          // network queue above which requests are refused
    preemptMargin: 1.35,         // how much better a newcomer must be to take over
    minScore: 0.25,              // below this, a request is not worth granting
    lookaheadSec: 45,            // how far ahead we warn about a coming conflict
    perSourceGrants: 2,          // grants one source may hold in the window below
    perSourceWindowSec: 240,     // the window that limit is measured over
    perSourceRequests: 5,        // requests one source may even make in that window
    feasibleEtaSec: [2, 120],    // outside this window a grant is wasted
    giveUpSec: 150               // stop trying after this long queued
  };

  const SAT_FLOW = 1800 / 3600;  // vehicles per second per approach, discharging

  let nextId = 1;
  const requests = [];           // every request this session, newest last
  const log = [];                // newest first
  const conflicts = [];          // currently predicted conflicts

  /* -------------------------------------------------------- abuse control
   * The obvious attack on any priority system is volume: one source asking
   * over and over until something is granted. Severity and verification come
   * from outside and could be lied about, so the network does not rely on them
   * alone - it also limits what any single source can consume, regardless of
   * what that source claims about itself.
   *
   * This is why the honest answer to "what if someone misuses the button" is
   * not "they cannot" - it is "they get two, then the network stops listening,
   * and every attempt is in the log with the source attached".
   */
  function sourceHistory(source) {
    const now = SIM.time();
    const window = now - POLICY.perSourceWindowSec;
    let asked = 0, granted = 0;
    for (const r of requests) {
      if (r.source !== source || r.requestedAt < window) continue;
      asked++;
      if (r.state === 'granted' || r.state === 'completed') granted++;
    }
    return { asked: asked, granted: granted };
  }

  function note(kind, requestId, text) {
    log.unshift({ kind: kind, requestId: requestId, text: text, at: SIM.time(), wall: new Date() });
    if (log.length > 40) log.length = 40;
  }

  /* ------------------------------------------------------------- estimation
   * Both figures below are ESTIMATES made before the decision, from the state
   * the twin is in right now. The ledger measures what actually happened
   * afterwards, and the two are reported separately on purpose — a prediction
   * presented as a measurement is how tools lose trust.
   */

  /** Seconds this vehicle would lose at these junctions with no priority. */
  function estimateSecondsSaved(route, axis) {
    let total = 0;
    const approaches = (axis === 'NS') ? ['N', 'S'] : ['E', 'W'];
    for (const id of route) {
      const j = SIM.junctionById(id);
      if (!j) continue;
      const plan = SIM.getPlan(id);
      const cycle = SIM.cycleLength(j);
      const green = (axis === 'NS') ? plan.greenNS : plan.greenEW;

      // Chance of arriving on red, times the average wait if you do.
      const redFraction = Math.max(0, (cycle - green) / cycle);
      const avgRedWait = (cycle - green) / 2;

      // Plus the time spent behind whatever is already queued ahead of you.
      let queued = 0;
      for (const d of approaches) queued += j.pcuQueues[d];
      const dischargeWait = (queued / 2) / SAT_FLOW;

      total += redFraction * avgRedWait + dischargeWait;
    }
    return total;
  }

  /** Vehicle-seconds this grant would impose on the traffic it stops. */
  function estimateCost(route, axis) {
    const crossing = (axis === 'NS') ? ['E', 'W'] : ['N', 'S'];
    let total = 0;
    for (const id of route) {
      const j = SIM.junctionById(id);
      if (!j) continue;
      let waiting = 0;
      for (const d of crossing) waiting += j.pcuQueues[d];
      // Everything already queued waits the hold out, and arrivals during the
      // hold wait on average half of it.
      const arrivalsDuringHold = POLICY.holdSeconds * SAT_FLOW * 0.5;
      total += waiting * POLICY.holdSeconds + arrivalsDuringHold * POLICY.holdSeconds / 2;
    }
    return total;
  }

  /* ------------------------------------------------------------------ score */
  function scoreOf(req) {
    const sev = POLICY.severityWeight[req.severity] || 1;
    const ver = POLICY.verifiedWeight[req.verification] || 0.5;
    const waited = SIM.time() - req.requestedAt;

    const saved = estimateSecondsSaved(req.route, req.axis);
    const cost = estimateCost(req.route, req.axis);
    const conflictPenalty = conflictDepth(req) * 40;

    const benefit = sev * ver * req.persons * saved + waited * POLICY.ageingPerSecond;
    const denominator = Math.max(1, cost + conflictPenalty);
    const score = benefit / denominator;

    req.estimate = {
      saved: saved, cost: cost, waited: waited,
      severityWeight: sev, verifiedWeight: ver, conflictPenalty: conflictPenalty,
      score: score
    };
    req.workings =
      'score = (' + sev.toFixed(1) + ' severity x ' + ver.toFixed(2) + ' trust x ' +
      req.persons + ' persons x ' + saved.toFixed(1) + 's saved + ' +
      (waited * POLICY.ageingPerSecond).toFixed(1) + ' ageing) / (' +
      cost.toFixed(0) + ' veh-s cost' +
      (conflictPenalty ? ' + ' + conflictPenalty + ' conflict' : '') + ') = ' +
      score.toFixed(2);
    return score;
  }

  /** How many junctions on this route are held for an opposing phase. */
  function conflictDepth(req) {
    let n = 0;
    for (const id of req.route) {
      const hold = SIM.holdFor(id);
      if (hold && hold.phase !== req.axis) n++;
    }
    return n;
  }

  /* -------------------------------------------------------------- admission */
  function decide(req) {
    const score = scoreOf(req);
    const active = requests.filter(function (r) { return r.state === 'granted'; });

    // Abuse control comes first, before anything the requester claims about
    // itself is even considered.
    const hist = sourceHistory(req.source);
    if (hist.granted > POLICY.perSourceGrants) {
      return refuse(req, 'Source ' + req.source + ' has already been granted ' +
        (hist.granted - 1) + ' corridors in the last ' + POLICY.perSourceWindowSec +
        's. The per-source limit is ' + POLICY.perSourceGrants +
        '. Escalated for human review.');
    }
    if (hist.asked > POLICY.perSourceRequests) {
      return refuse(req, 'Source ' + req.source + ' has made ' + hist.asked +
        ' requests in ' + POLICY.perSourceWindowSec + 's, over the limit of ' +
        POLICY.perSourceRequests + '. Rate limited, and logged against the source.');
    }

    // A request that has already waited too long is given up on, so the book
    // does not fill with vehicles that arrived long ago.
    if (SIM.time() - req.requestedAt > POLICY.giveUpSec) {
      return refuse(req, 'Waited ' + POLICY.giveUpSec + 's without a window opening. ' +
        'The vehicle is being served by the ordinary signal cycle.');
    }

    // Feasibility, on first sight only: a queued request whose vehicle has now
    // arrived is waiting at the stop line, not infeasible.
    if (req.state === 'pending' &&
        (req.etaSec < POLICY.feasibleEtaSec[0] || req.etaSec > POLICY.feasibleEtaSec[1])) {
      return refuse(req, 'Arrival in ' + req.etaSec.toFixed(0) + 's is outside the ' +
        POLICY.feasibleEtaSec[0] + '-' + POLICY.feasibleEtaSec[1] + 's window a hold can serve.');
    }

    // Network budget.
    const netQueue = SIM.totalQueue();
    if (netQueue > POLICY.queueBudgetPcu) {
      return queueIt(req, 'Network queue is ' + netQueue + ' vehicles, over the ' +
        POLICY.queueBudgetPcu + ' budget. Holding until it drops.');
    }

    // Conflict with something already running is checked BEFORE the score
    // threshold: a request that loses a conflict is made to wait, never thrown
    // away, because the thing it lost to will finish.
    const rival = conflictingActive(req);
    if (rival) {
      // A corridor is never taken away from a vehicle that has already entered
      // it. Once an ambulance is inside the reservation, it keeps it.
      const committed = rival.vehicle && Object.keys(rival.vehicle.passed).length > 0;
      if (!committed && score > rival.estimate.score * POLICY.preemptMargin) {
        revoke(rival, 'Outranked by ' + req.id + ' (' + score.toFixed(2) +
          ' against ' + rival.estimate.score.toFixed(2) + ').');
      } else if (committed) {
        return queueIt(req, rival.id + ' is already inside its corridor at ' +
          sharedJunction(req, rival) + ', and a corridor is never taken away from a ' +
          'vehicle already in it. Waiting.');
      } else {
        return queueIt(req, sharedJunction(req, rival) + ' is held for ' + rival.id +
          ', which scores ' + rival.estimate.score.toFixed(2) + ' against this ' +
          'request\u2019s ' + score.toFixed(2) + '. Waiting for that corridor to clear.');
      }
    }

    if (score < POLICY.minScore) {
      return refuse(req, 'Score ' + score.toFixed(2) + ' is below the ' + POLICY.minScore +
        ' threshold \u2014 this grant would cost more than it saves.');
    }

    if (active.length >= POLICY.maxConcurrent) {
      return queueIt(req, POLICY.maxConcurrent + ' corridors are already running, ' +
        'which is the cap.');
    }

    return grant(req);
  }

  function conflictingActive(req) {
    for (const r of requests) {
      if (r.state !== 'granted' || r.id === req.id) continue;
      if (r.axis === req.axis) continue;                 // same phase: compatible
      if (sharedJunction(req, r)) return r;
    }
    return null;
  }

  function sharedJunction(a, b) {
    for (const id of a.route) if (b.route.indexOf(id) !== -1) return id;
    return null;
  }

  /* ------------------------------------------------------------- transitions */
  function grant(req) {
    req.state = 'granted';
    req.grantedAt = SIM.time();
    SIM.addPriorityHold(req.id, req.route, req.axis, POLICY.holdSeconds);
    SIM.stats.priorityLedger.grants++;
    SIM.stats.priorityLedger.active = true;
    spawnVehicle(req);
    note('granted', req.id, req.id + ' GRANTED — ' + req.workings);
    return req;
  }

  function queueIt(req, why) {
    if (req.state !== 'queued') note('queued', req.id, req.id + ' QUEUED — ' + why);
    req.state = 'queued';
    req.reason = why;
    return req;
  }

  function refuse(req, why) {
    req.state = 'refused';
    req.reason = why;
    SIM.stats.priorityLedger.refusals++;
    note('refused', req.id, req.id + ' REFUSED — ' + why);
    return req;
  }

  function revoke(req, why) {
    SIM.clearPriorityHold(req.id);
    req.state = 'queued';
    req.reason = why;
    note('revoked', req.id, req.id + ' hold released — ' + why);
  }

  /* ------------------------------------------------------------- the vehicle */
  function spawnVehicle(req) {
    if (req.vehicle) return;
    const dir = (req.axis === 'NS') ? 'S' : 'E';
    const points = SIM.spawnPoints().filter(function (sp) { return sp.dir === dir; });
    if (!points.length) return;
    const sp = points[req.lane % points.length];
    const type = SIM.VEHICLE_TYPES[2];
    const s = (dir === 'E') ? sp.x : sp.y;
    const v = {
      id: 90000 + nextId, type: type, dir: sp.dir, lane: sp.lane, road: sp.road,
      lat: sp.lat, s: s, x: sp.x, y: sp.y,
      speed: type.maxSpeed * 0.9, waitTime: 0, travelled: 0,
      bornAt: SIM.time(), priority: true, requestId: req.id, passed: {}
    };
    SIM.vehicles.push(v);
    req.vehicle = v;
    req.baselineAt = { processed: SIM.stats.processed, delaySum: SIM.stats.delaySum };
  }

  /** Junctions on the route the priority vehicle has not cleared yet. */
  function remainingRoute(req) {
    const v = req.vehicle;
    if (!v) return req.route;
    const left = req.route.filter(function (id) { return !v.passed[id]; });
    return left.length ? left : [req.route[req.route.length - 1]];
  }

  /** Settle the ledger once the priority vehicle has left the network. */
  function settle(req) {
    const v = req.vehicle;
    const freeFlow = (req.lastTravelled || 0) / SIM.VEHICLE_TYPES[2].maxSpeed;
    const actualDelay = Math.max(0, (req.lastElapsed || 0) - freeFlow);

    const doneN = SIM.stats.processed - req.baselineAt.processed;
    const doneD = SIM.stats.delaySum - req.baselineAt.delaySum;
    const ordinary = doneN > 3 ? (doneD / doneN) : actualDelay;

    req.actual = {
      savedSec: Math.max(0, ordinary - actualDelay),
      ordinaryDelay: ordinary,
      ownDelay: actualDelay,
      costVehSec: SIM.stats.priorityLedger.costByRequest[req.id] || 0
    };
    req.state = 'completed';
    SIM.stats.priorityLedger.savedSec = req.actual.savedSec;
    note('ledger', req.id, req.id + ' complete — saved ' + req.actual.savedSec.toFixed(1) +
      's against the ' + ordinary.toFixed(1) + 's an ordinary vehicle lost, and cross ' +
      'traffic paid ' + req.actual.costVehSec.toFixed(0) + ' vehicle-seconds. ' +
      'Predicted ' + req.estimate.saved.toFixed(1) + 's saved for ' +
      req.estimate.cost.toFixed(0) + ' veh-s.');
  }

  /* ----------------------------------------------------- conflict prediction
   * The operator console needs warning BEFORE two vehicles collide in the
   * schedule, not after. Any two live requests that share a junction, need
   * opposite phases, and arrive within the lookahead window are a coming
   * conflict.
   */
  function predictConflicts() {
    conflicts.length = 0;
    const live = requests.filter(function (r) {
      return r.state === 'pending' || r.state === 'queued' || r.state === 'granted';
    });
    for (let i = 0; i < live.length; i++) {
      for (let k = i + 1; k < live.length; k++) {
        const a = live[i], b = live[k];
        if (a.axis === b.axis) continue;
        const at = sharedJunction(a, b);
        if (!at) continue;
        const gap = Math.abs(a.etaSec - b.etaSec);
        const soonest = Math.min(a.etaSec, b.etaSec);
        if (soonest > POLICY.lookaheadSec) continue;
        conflicts.push({
          junction: at, a: a, b: b, inSec: soonest, gapSec: gap,
          text: a.id + ' and ' + b.id + ' both need ' + at + ' within ' +
                soonest.toFixed(0) + 's, on opposite phases.'
        });
      }
    }
    return conflicts;
  }

  /* ------------------------------------------------------------------- tick */
  SIM.onTick(function (dt) {
    predictConflicts();          // warn first, decide second
    for (const req of requests) {
      if (req.state === 'pending' || req.state === 'queued') {
        req.etaSec = Math.max(0, req.etaSec - dt);
        decide(req);
      } else if (req.state === 'granted') {
        const v = req.vehicle;
        if (v && SIM.vehicles.indexOf(v) !== -1) {
          req.lastTravelled = v.travelled;
          req.lastElapsed = SIM.time() - v.bornAt;
          // A real preemption holds the phase until the vehicle has passed, not
          // for a fixed window. Top the hold up, under an absolute ceiling.
          const heldFor = SIM.time() - req.grantedAt;
          if (heldFor < POLICY.maxHoldSec) {
            SIM.clearPriorityHold(req.id);
            SIM.addPriorityHold(req.id, remainingRoute(req), req.axis, POLICY.holdRefreshSec);
          }
        } else if (v) {
          settle(req);
        } else if (!SIM.holdFor(req.route[0])) {
          req.state = 'completed';
        }
      }
    }
  });

  /* -------------------------------------------------------------- public API */
  function submit(opts) {
    opts = opts || {};
    const req = {
      id: 'REQ-' + String(nextId).padStart(3, '0'),
      source: opts.source || 'DISPATCH',
      severity: opts.severity || 'S1',
      verification: opts.verification || 'verified',
      vehicleType: opts.vehicleType || 'ambulance',
      persons: opts.persons || 1,
      axis: opts.axis || 'EW',
      route: opts.route || SIM.junctions.map(function (j) { return j.id; }),
      lane: opts.lane || 0,
      etaSec: opts.etaSec === undefined ? 14 : opts.etaSec,
      requestedAt: SIM.time(),
      state: 'pending',
      reason: '',
      estimate: null,
      actual: null,
      vehicle: null
    };
    nextId++;
    requests.push(req);
    note('received', req.id, req.id + ' received from ' + req.source + ' — ' +
      req.severity + ', ' + req.verification + ', ' + req.vehicleType +
      ', arriving in ' + req.etaSec.toFixed(0) + 's on the ' + req.axis + ' axis.');
    predictConflicts();
    decide(req);
    return req;
  }

  /** The demo case: two ambulances, one junction, opposite phases. */
  function demoConflict() {
    const mid = SIM.junctions.slice(0, 2).map(function (j) { return j.id; });
    const a = submit({ severity: 'S1', verification: 'verified', axis: 'EW',
                       route: mid, etaSec: 12, persons: 1, lane: 0 });
    const b = submit({ severity: 'S1', verification: 'verified', axis: 'NS',
                       route: mid, etaSec: 15, persons: 1, lane: 0 });
    return [a, b];
  }

  function reset() {
    requests.length = 0;
    log.length = 0;
    conflicts.length = 0;
    nextId = 1;
  }

  /* ------------------------------------------------- operator overrides
   * The control room can overrule the engine. That is deliberate: an operator
   * with information the model does not have must be able to act, and the log
   * records that a human made the call.
   */
  function forceGrant(req) {
    if (req.state === 'granted') return req;
    scoreOf(req);
    const rival = conflictingActive(req);
    if (rival) revoke(rival, 'Released by operator decision in favour of ' + req.id + '.');
    grant(req);
    note('operator', req.id, req.id + ' GRANTED by the control room operator, overriding ' +
      'the score of ' + req.estimate.score.toFixed(2) + '.');
    return req;
  }

  function forceRefuse(req, why) {
    SIM.clearPriorityHold(req.id);
    refuse(req, why || 'Refused by the control room operator.');
    return req;
  }

  return {
    POLICY: POLICY,
    forceGrant: forceGrant,
    forceRefuse: forceRefuse,
    requests: requests,
    log: log,
    submit: submit,
    demoConflict: demoConflict,
    conflicts: function () { return conflicts; },
    active: function () { return requests.filter(function (r) { return r.state === 'granted'; }); },
    pending: function () { return requests.filter(function (r) { return r.state === 'pending' || r.state === 'queued'; }); },
    byId: function (id) { for (const r of requests) if (r.id === id) return r; return null; },
    sourceHistory: sourceHistory,
    estimateSecondsSaved: estimateSecondsSaved,
    estimateCost: estimateCost,
    reset: reset
  };
})();
