/* =============================================================================
 * sim.js — Simulation state and physics ONLY.
 *
 * ARCHITECTURE RULE: zero drawing code, zero p5.js, zero DOM access. This file
 * describes the world as plain data. render.js reads that data and draws it, so
 * swapping the 2D view for Three.js touches render.js and nothing else.
 *
 * sim.js owns the clock: it runs the requestAnimationFrame loop and calls every
 * subscriber registered with SIM.onTick(fn).
 *
 * Units: world pixels, calibrated at 4 px per metre (see PARAMS.pxPerM). The
 * full model specification is docs/LOGIC.md.
 * ========================================================================== */

const SIM = (function () {
  'use strict';

  /* ---------------------------------------------------------------- geometry */
  const WORLD = { w: 1200, h: 800 };
  const COLS = [420, 780];         // x of the two vertical roads   -> 90 m apart
  const ROWS = [280, 560];         // y of the two horizontal roads -> 70 m apart
  const LANE_OFFSET = 16;
  const ROAD_WIDTH = 64;
  const JUNCTION_HALF = 36;

  /* -------------------------------------------------------------- parameters
   * Calibrated: 4 world px = 1 metre. Every figure below is derived from a real
   * traffic-engineering value, named here so it can be defended or changed.
   */
  const PARAMS = {
    pxPerM: 4,
    freeFlowKmh: 40,        // urban arterial free-flow speed
    accelMs2: 1.5,          // comfortable acceleration
    decelMs2: 3.0,          // comfortable braking
    minGapM: 2.0,           // bumper gap at a standstill
    timeHeadwayS: 2.0,      // following headway at free flow
    startupLostS: 2.0,      // lost time before a stopped queue starts moving
    satFlowPcuH: 1800,      // saturation flow per lane, PCU/hour
    queueZoneM: 60,         // how far back from the stop line a queue is counted
    queueSpeedKmh: 8,       // below this a vehicle counts as queued
    maxVehicles: 120
  };

  const MAX_SPEED = (PARAMS.freeFlowKmh / 3.6) * PARAMS.pxPerM;   // 44.4 px/s
  const ACCEL = PARAMS.accelMs2 * PARAMS.pxPerM;                  // 6 px/s^2
  const DECEL = PARAMS.decelMs2 * PARAMS.pxPerM;                  // 12 px/s^2
  const MIN_GAP = PARAMS.minGapM * PARAMS.pxPerM;                 // 8 px
  const SAFE_GAP = MAX_SPEED * PARAMS.timeHeadwayS;               // 89 px
  const QUEUE_ZONE = PARAMS.queueZoneM * PARAMS.pxPerM;           // 240 px
  const QUEUE_SPEED = (PARAMS.queueSpeedKmh / 3.6) * PARAMS.pxPerM;
  const PX_TO_KMH = 3.6 / PARAMS.pxPerM;                          // px/s -> km/h

  /* ------------------------------------------------------------ vehicle mix
   * Heterogeneous, as Indian urban traffic actually is. pcu = passenger car
   * units. weight = 'light' | 'heavy'; the flood scenario bars heavy vehicles.
   */
  const VEHICLE_TYPES = [
    { id: '2w',    label: 'Two-wheeler',   share: 0.42, lenM: 2.0,  widM: 0.8, pcu: 0.25, weight: 'light', speedFactor: 1.05 },
    { id: 'auto',  label: 'Auto-rickshaw', share: 0.16, lenM: 2.8,  widM: 1.4, pcu: 0.50, weight: 'light', speedFactor: 0.85 },
    { id: 'car',   label: 'Car',           share: 0.30, lenM: 4.5,  widM: 1.8, pcu: 1.00, weight: 'light', speedFactor: 1.00 },
    { id: 'bus',   label: 'Bus',           share: 0.05, lenM: 11.0, widM: 2.5, pcu: 3.00, weight: 'heavy', speedFactor: 0.80 },
    { id: 'truck', label: 'Truck',         share: 0.07, lenM: 8.0,  widM: 2.4, pcu: 2.20, weight: 'heavy', speedFactor: 0.78 }
  ];
  VEHICLE_TYPES.forEach(function (t) {
    t.len = t.lenM * PARAMS.pxPerM;
    t.wid = Math.max(3, t.widM * PARAMS.pxPerM);
    t.maxSpeed = MAX_SPEED * t.speedFactor;
  });

  /* ------------------------------------------------------------ signal timing */
  const SIGNAL = {
    yellow: 3.0,
    allRed: 1.0,
    minGreen: 5,
    maxGreen: 60,
    defaultGreenNS: 18,
    defaultGreenEW: 18,
    extendStep: 4        // seconds added by one extend_green_* action
  };

  const RECOVERY_BIAS_SEC = 12;   // how long a starved phase is favoured after a hold

  const AXIS = { E: { x: 1, y: 0 }, W: { x: -1, y: 0 }, S: { x: 0, y: 1 }, N: { x: 0, y: -1 } };
  const OPPOSITE = { E: 'W', W: 'E', N: 'S', S: 'N' };
  const DIRS = ['N', 'S', 'E', 'W'];

  /* -------------------------------------------------------- seeded randomness
   * Every comparison between two timing plans must run on identical demand,
   * otherwise the difference is sampling noise. One seeded generator drives all
   * arrivals, so a reset with the same seed replays exactly the same traffic.
   */
  let seed = 20260905;
  let rngState = seed;
  function rng() {
    rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
    let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rnd(a, b) { return a + rng() * (b - a); }

  /* ------------------------------------------------------------------- state */
  let junctions = [];
  let vehicles = [];
  let spawnPoints = [];
  const tickListeners = [];

  let nextVehicleId = 1;
  let paused = false;
  let spawnRate = 1.0;
  let speedScale = 1.0;          // simulation speed multiplier
  let controlMode = 'plan';      // 'plan' | 'ai' | 'maxpressure'
  let simTime = 0;
  let lastFrameMs = 0;
  let running = false;

  /* Per-junction timing plan the user edits. This IS the deliverable control. */
  function defaultPlan() {
    return { greenNS: SIGNAL.defaultGreenNS, greenEW: SIGNAL.defaultGreenEW, offset: 0 };
  }
  let plan = {};

  /* Scenario state, written by scenarios.js, read by the physics. */
  const conditions = {
    blockedApproaches: {},   // "J2:N" -> true   (approach cannot discharge)
    floodedRoads: {},        // "row0" / "col1" -> { speedFactor, barHeavy }
    priorityHolds: []        // [{ id, junctionIds:[], phase:'EW', until }] — several
                             // corridors can run at once; priority.js owns them
  };

  const stats = {
    processed: 0, delaySum: 0, stopDelaySum: 0, spawned: 0, blockedSpawns: 0,
    priorityLedger: { active: false, savedSec: 0, crossVehSec: 0, grants: 0, refusals: 0,
                      costByRequest: {} }   // requestId -> vehicle-seconds paid so far
  };

  /* Rolling series for the charts: one sample per simulated second. */
  const series = { t: [], avgDelay: [], totalQueue: [], throughput: [], maxLen: 180 };
  let seriesAcc = 0, windowCompleted = 0, windowDelay = 0, windowThroughput = 0;

  /* --------------------------------------------------------------- build ---- */
  function buildJunctions() {
    const defs = [['J1', 0, 0], ['J2', 1, 0], ['J3', 0, 1], ['J4', 1, 1]];
    junctions = defs.map(function (d) {
      const id = d[0], col = d[1], row = d[2];
      if (!plan[id]) plan[id] = defaultPlan();
      return {
        id: id, col: col, row: row, x: COLS[col], y: ROWS[row],
        phase: 'NS', state: 'green', timer: plan[id].greenNS, greenElapsed: 0,
        cycles: 0, throughput: 0,
        queues: { N: 0, S: 0, E: 0, W: 0 },
        pcuQueues: { N: 0, S: 0, E: 0, W: 0 },
        longestWait: { N: 0, S: 0, E: 0, W: 0 },
        arrivals: { N: 0, S: 0, E: 0, W: 0 },      // cumulative, for Webster
        arrivalPcu: { N: 0, S: 0, E: 0, W: 0 },
        lastAction: null,
        lastReason: 'Fixed-time plan running.',
        lastSource: 'plan',
        lastDecisionAt: 0,
        recoveryBias: 0,        // seconds of bias left after a priority hold
        starvedPhase: null      // the phase that waited during the hold
      };
    });
    // Offsets stagger the start of the first green, exactly as coordination does.
    for (const j of junctions) {
      const off = plan[j.id].offset || 0;
      j.timer = Math.max(1, plan[j.id].greenNS - (off % Math.max(1, cycleLength(j))));
    }
  }

  function cycleLength(j) {
    const p = plan[j.id];
    return p.greenNS + p.greenEW + 2 * (SIGNAL.yellow + SIGNAL.allRed);
  }

  function buildSpawnPoints() {
    spawnPoints = [];
    ROWS.forEach(function (rowY, rowIdx) {
      spawnPoints.push({ dir: 'E', lane: rowIdx, road: 'row' + rowIdx, lat: rowY + LANE_OFFSET, x: -60, y: rowY + LANE_OFFSET, next: rnd(0.5, 3), weight: 1 });
      spawnPoints.push({ dir: 'W', lane: rowIdx, road: 'row' + rowIdx, lat: rowY - LANE_OFFSET, x: WORLD.w + 60, y: rowY - LANE_OFFSET, next: rnd(0.5, 3), weight: 1 });
    });
    COLS.forEach(function (colX, colIdx) {
      spawnPoints.push({ dir: 'S', lane: colIdx, road: 'col' + colIdx, lat: colX - LANE_OFFSET, x: colX - LANE_OFFSET, y: -60, next: rnd(0.5, 3), weight: 1 });
      spawnPoints.push({ dir: 'N', lane: colIdx, road: 'col' + colIdx, lat: colX + LANE_OFFSET, x: colX + LANE_OFFSET, y: WORLD.h + 60, next: rnd(0.5, 3), weight: 1 });
    });
  }

  function roadOf(dir, lane) {
    return (dir === 'E' || dir === 'W') ? ('row' + lane) : ('col' + lane);
  }

  function progressOf(dir, x, y) { return AXIS[dir].x * x + AXIS[dir].y * y; }

  function pickType() {
    const r = rng();
    let acc = 0;
    for (const t of VEHICLE_TYPES) { acc += t.share; if (r <= acc) return t; }
    return VEHICLE_TYPES[2];
  }

  function spawnVehicle(sp) {
    if (vehicles.length >= PARAMS.maxVehicles) return;
    let type = pickType();
    const flood = conditions.floodedRoads[sp.road];
    if (flood && flood.barHeavy && type.weight === 'heavy') {
      // Heavy vehicles are barred from a flooded link. With no route choice in
      // the model they are simply not generated here — counted, not hidden.
      stats.blockedSpawns++;
      type = VEHICLE_TYPES[2];
      if (rng() < 0.5) return;
    }
    const s = progressOf(sp.dir, sp.x, sp.y);
    for (const v of vehicles) {
      if (v.dir === sp.dir && v.lane === sp.lane && v.s - s < type.len + 60) return;
    }
    vehicles.push({
      id: nextVehicleId++, type: type, dir: sp.dir, lane: sp.lane, road: sp.road,
      lat: sp.lat, s: s, x: sp.x, y: sp.y,
      speed: type.maxSpeed * 0.8, waitTime: 0, travelled: 0, bornAt: simTime,
      priority: false, passed: {}
    });
    stats.spawned++;
  }

  /* ------------------------------------------------------------------ signals */
  function signalFor(j, dir) {
    if (conditions.blockedApproaches[j.id + ':' + OPPOSITE[dir]]) return 'red';
    const group = (dir === 'N' || dir === 'S') ? 'NS' : 'EW';
    if (j.phase !== group) return 'red';
    return j.state;
  }

  function greenFor(j, phase) {
    const p = plan[j.id];
    const base = (phase === 'NS') ? p.greenNS : p.greenEW;
    return Math.max(SIGNAL.minGreen, Math.min(SIGNAL.maxGreen, base));
  }

  function updateSignals(dt) {
    for (const j of junctions) {
      // A priority hold freezes the requested phase green for its window. Several
      // holds may be active; the first one that names this junction wins, and
      // priority.js guarantees it never grants two holds needing opposite
      // phases at the same junction.
      const hold = holdFor(j.id);
      if (hold) {
        if (j.phase !== hold.phase) {
          if (j.state === 'green' && j.greenElapsed >= SIGNAL.minGreen) { j.timer = 0.01; }
        } else if (j.state === 'green') {
          j.timer = Math.max(j.timer, 1.0);
          j.greenElapsed = Math.min(j.greenElapsed, SIGNAL.maxGreen - 1);
        }
      } else if (j.recoveryBias > 0) {
        // After a hold ends, favour the phase that was starved. The preemption
        // literature is explicit that the exit strategy decides how much
        // coordination the corridor destroys.
        j.recoveryBias -= dt;
        if (j.phase === j.starvedPhase && j.state === 'green') {
          j.timer = Math.max(j.timer, 1.0);
          j.greenElapsed = Math.min(j.greenElapsed, SIGNAL.maxGreen - 1);
        }
      }

      j.timer -= dt;
      if (j.state === 'green') {
        j.greenElapsed += dt;
        if (j.greenElapsed >= SIGNAL.maxGreen) j.timer = Math.min(j.timer, 0);
        if (j.timer <= 0) { j.state = 'yellow'; j.timer = SIGNAL.yellow; }
      } else if (j.state === 'yellow') {
        if (j.timer <= 0) { j.state = 'allred'; j.timer = SIGNAL.allRed; }
      } else if (j.timer <= 0) {
        j.phase = (j.phase === 'NS') ? 'EW' : 'NS';
        j.state = 'green';
        j.greenElapsed = 0;
        j.cycles++;
        j.timer = greenFor(j, j.phase);
      }
    }
  }

  /** The active hold covering this junction, or null. */
  function holdFor(junctionId) {
    for (const h of conditions.priorityHolds) {
      if (h.until > simTime && h.junctionIds.indexOf(junctionId) !== -1) return h;
    }
    return null;
  }

  /** Drop holds whose window has closed, and start the recovery bias. */
  function expireHolds() {
    for (let i = conditions.priorityHolds.length - 1; i >= 0; i--) {
      const h = conditions.priorityHolds[i];
      if (h.until > simTime) continue;
      for (const id of h.junctionIds) {
        const j = junctionById(id);
        if (!j) continue;
        j.starvedPhase = (h.phase === 'NS') ? 'EW' : 'NS';
        j.recoveryBias = RECOVERY_BIAS_SEC;
      }
      conditions.priorityHolds.splice(i, 1);
    }
  }

  function cutGreenShort(j) {
    if (j.state !== 'green') return;
    const floor = Math.max(0, SIGNAL.minGreen - j.greenElapsed);
    j.timer = Math.min(j.timer, Math.max(0.2, floor));
  }

  /* Applied by controllers and by agent.js. The only write path into signals. */
  function applyAction(junctionId, action) {
    const j = junctionById(junctionId);
    if (!j || controlMode === 'plan') return false;
    if (action === 'hold') return true;
    if (action === 'switch') { cutGreenShort(j); return true; }
    if (action === 'extend_green_NS' || action === 'extend_green_EW') {
      const want = (action === 'extend_green_NS') ? 'NS' : 'EW';
      if (j.phase === want) {
        if (j.state === 'green') {
          const room = Math.max(0, SIGNAL.maxGreen - j.greenElapsed);
          j.timer = Math.min(j.timer + SIGNAL.extendStep, room);
        }
      } else {
        cutGreenShort(j);
      }
      return true;
    }
    return false;
  }

  /* ----------------------------------------------------------- vehicle motion */
  function updateVehicles(dt) {
    const lanes = {};
    for (const v of vehicles) {
      const key = v.dir + v.lane;
      (lanes[key] || (lanes[key] = [])).push(v);
    }

    for (const key in lanes) {
      const list = lanes[key];
      list.sort(function (a, b) { return a.s - b.s; });
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        const lead = list[i + 1];

        const gapLead = lead ? (lead.s - v.s - lead.type.len) : Infinity;
        const gap = Math.min(gapLead, stopLineGap(v));

        let vmax = v.type.maxSpeed;
        const flood = conditions.floodedRoads[v.road];
        if (flood) vmax *= flood.speedFactor;
        if (v.priority) vmax *= 1.15;

        let target = vmax * clamp((gap - MIN_GAP) / (SAFE_GAP - MIN_GAP), 0, 1);

        // Start-up lost time: a stopped queue does not move the instant the
        // signal turns green.
        if (v.speed < 1) {
          const j = nextJunction(v);
          if (j && j.state === 'green' && j.greenElapsed < PARAMS.startupLostS &&
              signalFor(j, v.dir) === 'green') target = 0;
        }

        if (target > v.speed) v.speed = Math.min(target, v.speed + ACCEL * dt);
        else v.speed = Math.max(target, v.speed - DECEL * dt);
        if (v.speed < 0) v.speed = 0;

        const step = v.speed * dt;
        v.s += step;
        v.travelled += step;
        if (v.speed < 1) v.waitTime += dt;

        if (v.dir === 'E' || v.dir === 'W') { v.x = AXIS[v.dir].x * v.s; v.y = v.lat; }
        else { v.y = AXIS[v.dir].y * v.s; v.x = v.lat; }

        creditThroughput(v);
      }
    }

    for (let i = vehicles.length - 1; i >= 0; i--) {
      const v = vehicles[i];
      if (v.x < -120 || v.x > WORLD.w + 120 || v.y < -120 || v.y > WORLD.h + 120) {
        completeTrip(v);
        vehicles.splice(i, 1);
      }
    }
  }

  /* Control delay: how much longer the trip took than free flow. This is the
   * measure traffic engineering uses, and it is larger than stopped delay. */
  function completeTrip(v) {
    const freeFlowTime = v.travelled / v.type.maxSpeed;
    const actual = simTime - v.bornAt;
    const delay = Math.max(0, actual - freeFlowTime);
    stats.processed++;
    stats.delaySum += delay;
    stats.stopDelaySum += v.waitTime;
    windowCompleted++;
    windowDelay += delay;
    windowThroughput++;
  }

  function nextJunction(v) {
    let best = null, bestD = Infinity;
    for (const j of junctions) {
      const onPath = (v.dir === 'E' || v.dir === 'W') ? (j.row === v.lane) : (j.col === v.lane);
      if (!onPath) continue;
      const d = progressOf(v.dir, j.x, j.y) - JUNCTION_HALF - 2 - v.s;
      if (d < -2) continue;
      if (d < bestD) { bestD = d; best = j; }
    }
    return best;
  }

  function stopLineGap(v) {
    let best = Infinity;
    for (const j of junctions) {
      const onPath = (v.dir === 'E' || v.dir === 'W') ? (j.row === v.lane) : (j.col === v.lane);
      if (!onPath) continue;
      const sStop = progressOf(v.dir, j.x, j.y) - JUNCTION_HALF - 2;
      const d = sStop - v.s;
      if (d < -2) continue;
      const sig = signalFor(j, v.dir);
      if (sig === 'green') continue;
      if (sig === 'yellow' && d < 18) continue;    // dilemma zone: committed
      if (d < best) best = d;
    }
    return best;
  }

  function creditThroughput(v) {
    for (const j of junctions) {
      if (v.passed[j.id]) continue;
      const onPath = (v.dir === 'E' || v.dir === 'W') ? (j.row === v.lane) : (j.col === v.lane);
      if (!onPath) continue;
      if (v.s >= progressOf(v.dir, j.x, j.y)) {
        v.passed[j.id] = true;
        j.throughput++;
      }
    }
  }

  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  /* --------------------------------------------------------- queue statistics
   * "N approach" holds vehicles waiting north of the junction and travelling
   * south — the queue a driver on the north arm would see.
   */
  function updateQueues(dt) {
    for (const j of junctions) {
      for (const d of DIRS) { j.queues[d] = 0; j.pcuQueues[d] = 0; j.longestWait[d] = 0; }
    }
    for (const v of vehicles) {
      const approach = OPPOSITE[v.dir];
      for (const j of junctions) {
        const onPath = (v.dir === 'E' || v.dir === 'W') ? (j.row === v.lane) : (j.col === v.lane);
        if (!onPath) continue;
        const d = progressOf(v.dir, j.x, j.y) - JUNCTION_HALF - v.s;
        if (d < 0 || d > QUEUE_ZONE) continue;
        if (v.speed < QUEUE_SPEED) {
          j.queues[approach]++;
          j.pcuQueues[approach] += v.type.pcu;
          // Cross-traffic seconds paid while a priority hold is running, charged
          // to the request that caused it.
          const hold = holdFor(j.id);
          if (hold) {
            const served = (hold.phase === 'NS') ? ['N', 'S'] : ['E', 'W'];
            if (served.indexOf(approach) === -1) {
              stats.priorityLedger.crossVehSec += dt;
              const by = stats.priorityLedger.costByRequest;
              by[hold.id] = (by[hold.id] || 0) + dt;
            }
          }
        }
        if (v.waitTime > j.longestWait[approach]) j.longestWait[approach] = v.waitTime;
      }
    }
  }

  function countArrival(v) {
    const j = nextJunction(v);
    if (!j) return;
    const approach = OPPOSITE[v.dir];
    j.arrivals[approach]++;
    j.arrivalPcu[approach] += v.type.pcu;
  }

  /* ------------------------------------------------------------------- spawns */
  function updateSpawns(dt) {
    for (const sp of spawnPoints) {
      sp.next -= dt * spawnRate * (sp.weight || 1);
      if (sp.next <= 0) {
        const before = vehicles.length;
        spawnVehicle(sp);
        if (vehicles.length > before) countArrival(vehicles[vehicles.length - 1]);
        // Mean headway 8 s per entry lane at 1.0x load, about 450 veh/h per
        // lane against roughly 670 veh/h of capacity at the default 18s
        // greens — a volume-to-capacity ratio near 0.67, so the default state
        // is busy but stable, and the load slider pushes it into oversaturation.
        sp.next = rnd(4.0, 12.0);
      }
    }
  }

  /* -------------------------------------------------------------- series ---- */
  function updateSeries(dt) {
    seriesAcc += dt;
    if (seriesAcc < 1) return;
    seriesAcc = 0;
    let totalQueue = 0;
    for (const j of junctions) for (const d of DIRS) totalQueue += j.queues[d];
    series.t.push(Math.round(simTime));
    series.avgDelay.push(windowCompleted ? windowDelay / windowCompleted : (series.avgDelay.length ? series.avgDelay[series.avgDelay.length - 1] : 0));
    series.totalQueue.push(totalQueue);
    series.throughput.push(windowThroughput * 60);   // vehicles per minute
    windowCompleted = 0; windowDelay = 0; windowThroughput = 0;
    if (series.t.length > series.maxLen) {
      series.t.shift(); series.avgDelay.shift(); series.totalQueue.shift(); series.throughput.shift();
    }
  }

  /* --------------------------------------------------------------- main clock */
  function step(dt) {
    simTime += dt;
    expireHolds();
    updateSignals(dt);
    updateSpawns(dt);
    updateVehicles(dt);
    updateQueues(dt);
    updateSeries(dt);
    for (const fn of tickListeners) fn(dt, simTime);
  }

  function frame(nowMs) {
    if (!running) return;
    const real = Math.min((nowMs - lastFrameMs) / 1000, 0.05);
    lastFrameMs = nowMs;
    if (!paused && real > 0) {
      // Sub-stepping keeps the physics stable at high speed multipliers.
      let remaining = real * speedScale;
      while (remaining > 0) {
        const dt = Math.min(remaining, 0.05);
        step(dt);
        remaining -= dt;
      }
    }
    requestAnimationFrame(frame);
  }

  function junctionById(id) {
    for (const j of junctions) if (j.id === id) return j;
    return null;
  }

  function reset(opts) {
    opts = opts || {};
    if (opts.seed !== undefined) seed = opts.seed;
    rngState = seed;
    vehicles = [];
    nextVehicleId = 1;
    simTime = 0;
    stats.processed = 0; stats.delaySum = 0; stats.stopDelaySum = 0;
    stats.spawned = 0; stats.blockedSpawns = 0;
    stats.priorityLedger = { active: false, savedSec: 0, crossVehSec: 0, grants: 0,
                             refusals: 0, costByRequest: {} };
    series.t = []; series.avgDelay = []; series.totalQueue = []; series.throughput = [];
    seriesAcc = 0; windowCompleted = 0; windowDelay = 0; windowThroughput = 0;
    if (!opts.keepConditions) {
      conditions.blockedApproaches = {};
      conditions.floodedRoads = {};
      conditions.priorityHolds = [];
      for (const sp of spawnPoints) sp.weight = 1;
    }
    buildJunctions();
    for (const sp of spawnPoints) sp.next = rnd(0.5, 3);
  }

  function start() {
    if (running) return;
    rngState = seed;
    buildJunctions();
    buildSpawnPoints();
    running = true;
    lastFrameMs = performance.now();
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ read API */
  return {
    GEOM: {
      world: WORLD, cols: COLS, rows: ROWS,
      laneOffset: LANE_OFFSET, roadWidth: ROAD_WIDTH, junctionHalf: JUNCTION_HALF,
      queueZone: QUEUE_ZONE
    },
    PARAMS: PARAMS,
    SIGNAL: SIGNAL,
    VEHICLE_TYPES: VEHICLE_TYPES,
    PX_TO_KMH: PX_TO_KMH,
    MAX_SPEED: MAX_SPEED,
    DIRS: DIRS,
    OPPOSITE: OPPOSITE,

    start: start,
    reset: reset,
    onTick: function (fn) { tickListeners.push(fn); },

    get junctions() { return junctions; },
    get vehicles() { return vehicles; },
    stats: stats,
    series: series,
    conditions: conditions,

    junctionById: junctionById,
    signalFor: signalFor,
    holdFor: holdFor,
    /** Called only by priority.js. Adds a corridor hold. */
    addPriorityHold: function (id, junctionIds, phase, seconds) {
      conditions.priorityHolds.push({ id: id, junctionIds: junctionIds.slice(),
                                      phase: phase, until: simTime + seconds });
    },
    clearPriorityHold: function (id) {
      conditions.priorityHolds = conditions.priorityHolds.filter(function (h) { return h.id !== id; });
    },
    activeHolds: function () { return conditions.priorityHolds.filter(function (h) { return h.until > simTime; }); },
    applyAction: applyAction,
    cycleLength: cycleLength,

    /* ---- timing plan: the control the problem statement asks for ---- */
    getPlan: function (id) { return plan[id]; },
    allPlans: function () { return plan; },
    setPlan: function (id, patch) {
      if (!plan[id]) plan[id] = defaultPlan();
      Object.assign(plan[id], patch);
    },
    setPlanAll: function (patch) {
      for (const id in plan) Object.assign(plan[id], patch);
    },
    snapshotPlan: function () { return JSON.parse(JSON.stringify(plan)); },
    loadPlan: function (p) { plan = JSON.parse(JSON.stringify(p)); },

    time: function () { return simTime; },
    seed: function () { return seed; },
    setSeed: function (s) { seed = s; },
    isPaused: function () { return paused; },
    setPaused: function (p) { paused = !!p; },
    spawnRate: function () { return spawnRate; },
    setSpawnRate: function (r) { spawnRate = r; },
    speedScale: function () { return speedScale; },
    setSpeedScale: function (s) { speedScale = s; },
    spawnPoints: function () { return spawnPoints; },
    controlMode: function () { return controlMode; },
    setControlMode: function (m) {
      if (['plan', 'ai', 'maxpressure'].indexOf(m) === -1) return;
      controlMode = m;
      for (const j of junctions) {
        j.lastSource = (m === 'plan') ? 'plan' : j.lastSource;
        if (m === 'plan') j.lastReason = 'Fixed-time plan running.';
        if (m === 'maxpressure') j.lastReason = 'Max-Pressure control running.';
        if (m === 'ai') j.lastReason = 'Awaiting next decision.';
      }
    },

    /* ---- headline metrics ---- */
    avgDelay: function () { return stats.processed ? stats.delaySum / stats.processed : 0; },
    avgStopDelay: function () { return stats.processed ? stats.stopDelaySum / stats.processed : 0; },
    totalQueue: function () {
      let q = 0;
      for (const j of junctions) for (const d of DIRS) q += j.queues[d];
      return q;
    }
  };
})();
