/* =============================================================================
 * sim.js — Simulation state and physics ONLY.
 *
 * ARCHITECTURE RULE: this file contains ZERO drawing code, ZERO p5.js calls and
 * ZERO DOM access. It describes the world as plain data (vehicle positions as
 * {x, y}, junction signal states, timers, statistics). Any renderer — the
 * current 2D p5.js one, or a future Three.js one — reads that data and draws
 * it. Swapping to 3D must therefore only touch render.js.
 *
 * sim.js also owns the clock: it runs the requestAnimationFrame loop and calls
 * every subscriber registered with SIM.onTick(fn). The renderer does NOT drive
 * the simulation, so replacing the renderer cannot break the simulation.
 * ========================================================================== */

const SIM = (function () {
  'use strict';

  /* ---------------------------------------------------------------- geometry
   * World coordinates are fixed and renderer-independent (the renderer scales
   * them to whatever canvas size it has). Units are "world pixels";
   * 1 world px is treated as 0.125 m for the speed readouts.
   */
  const WORLD = { w: 1200, h: 800 };
  const COLS = [420, 780];   // x of the two vertical roads
  const ROWS = [280, 560];   // y of the two horizontal roads
  const LANE_OFFSET = 16;    // lane centre distance from the road centreline
  const ROAD_WIDTH = 64;
  const JUNCTION_HALF = 36;
  const VEHICLE_LEN = 20;
  const VEHICLE_W = 12;

  /* ------------------------------------------------------------ vehicle model
   * Simple car-following: a target speed derived from the gap to whatever is
   * ahead (lead vehicle or a red/yellow stop line), approached under finite
   * acceleration. Produces smooth per-frame motion and realistic queues.
   */
  const MAX_SPEED = 135;     // px/s
  const ACCEL = 95;          // px/s^2
  const DECEL = 280;         // px/s^2
  const MIN_GAP = 10;        // bumper gap at a standstill
  const SAFE_GAP = 110;      // gap at which free-flow speed is resumed
  const QUEUE_ZONE = 190;    // how far back from a junction we count a queue
  const QUEUE_SPEED = 28;    // below this speed a vehicle counts as "queued"
  const MAX_VEHICLES = 40;
  const PX_TO_KMH = 0.45;    // 1 px = 0.125 m  ->  px/s * 0.125 * 3.6 (free flow ~60 km/h)

  /* ------------------------------------------------------------ signal timing
   * Opposing approaches run together as a phase pair: NS serves the north and
   * south approaches, EW serves east and west. This is how real fixed-time
   * controllers work and it makes conflicting movements impossible.
   */
  const SIGNAL = {
    baseGreen: 9,     // green length under AI control before any extension
    minGreen: 5,      // safety floor: a green is never cut shorter than this
    maxGreen: 22,     // safety ceiling: starvation guard for the other phase
    yellow: 2.2,
    fixedGreen: 12,   // green length in FIXED TIMER baseline mode
    extendStep: 4     // seconds added by an extend_green_* action
  };

  const AXIS = { E: { x: 1, y: 0 }, W: { x: -1, y: 0 }, S: { x: 0, y: 1 }, N: { x: 0, y: -1 } };
  const DIRS = ['N', 'S', 'E', 'W'];

  /* ------------------------------------------------------------------- state */
  const junctions = [];
  const vehicles = [];
  const spawnPoints = [];
  const tickListeners = [];

  let nextVehicleId = 1;
  let paused = false;
  let spawnRate = 1.0;         // multiplier on the spawn frequency
  let controlMode = 'ai';      // 'ai' | 'fixed'
  let simTime = 0;
  let lastFrameMs = 0;
  let running = false;

  const stats = {
    processed: 0,
    waitSum: 0,
    spawned: 0,
    byMode: {
      ai:    { processed: 0, waitSum: 0, activeSec: 0 },
      fixed: { processed: 0, waitSum: 0, activeSec: 0 }
    }
  };

  /* ---------------------------------------------------------------- junctions
   * Ids read top-left, top-right, bottom-left, bottom-right.
   */
  function buildJunctions() {
    const names = [['J1', 0, 0], ['J2', 1, 0], ['J3', 0, 1], ['J4', 1, 1]];
    for (const entry of names) {
      const id = entry[0], col = entry[1], row = entry[2];
      junctions.push({
        id: id,
        col: col,
        row: row,
        x: COLS[col],
        y: ROWS[row],
        phase: (col + row) % 2 === 0 ? 'NS' : 'EW',   // stagger the start
        state: 'green',                                // 'green' | 'yellow'
        timer: SIGNAL.baseGreen,                       // seconds left in state
        greenElapsed: 0,
        cycles: 0,
        throughput: 0,
        queues: { N: 0, S: 0, E: 0, W: 0 },
        longestWait: { N: 0, S: 0, E: 0, W: 0 },
        // Written by agent.js so the renderer can show live AI reasoning.
        lastAction: null,
        lastReason: 'Awaiting first decision.',
        lastSource: 'init',
        lastDecisionAt: 0
      });
    }
  }

  function junctionById(id) {
    for (const j of junctions) if (j.id === id) return j;
    return null;
  }

  /* -------------------------------------------------------------------- lanes
   * One lane per direction per road (right-hand traffic). Vehicles travel in a
   * straight line from one edge of the world to the opposite edge; they never
   * turn, so every conflict at a junction is resolved by the signal alone.
   */
  function buildSpawnPoints() {
    ROWS.forEach(function (rowY, rowIdx) {
      spawnPoints.push({ dir: 'E', lane: rowIdx, lat: rowY + LANE_OFFSET, x: -50, y: rowY + LANE_OFFSET, next: rnd(0.5, 3) });
      spawnPoints.push({ dir: 'W', lane: rowIdx, lat: rowY - LANE_OFFSET, x: WORLD.w + 50, y: rowY - LANE_OFFSET, next: rnd(0.5, 3) });
    });
    COLS.forEach(function (colX, colIdx) {
      spawnPoints.push({ dir: 'S', lane: colIdx, lat: colX - LANE_OFFSET, x: colX - LANE_OFFSET, y: -50, next: rnd(0.5, 3) });
      spawnPoints.push({ dir: 'N', lane: colIdx, lat: colX + LANE_OFFSET, x: colX + LANE_OFFSET, y: WORLD.h + 50, next: rnd(0.5, 3) });
    });
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // Progress along the direction of travel. Always increases as a vehicle moves.
  function progressOf(dir, x, y) { return AXIS[dir].x * x + AXIS[dir].y * y; }

  function spawnVehicle(sp) {
    if (vehicles.length >= MAX_VEHICLES) return;
    const s = progressOf(sp.dir, sp.x, sp.y);
    // Do not spawn on top of a vehicle that has not cleared the entry yet.
    for (const v of vehicles) {
      if (v.dir === sp.dir && v.lane === sp.lane && v.s - s < 70) return;
    }
    vehicles.push({
      id: nextVehicleId++,
      dir: sp.dir,
      lane: sp.lane,
      lat: sp.lat,
      s: s,
      x: sp.x,
      y: sp.y,
      speed: MAX_SPEED * 0.8,
      waitTime: 0,
      bornAt: simTime,
      passed: {}
    });
    stats.spawned++;
  }

  /* ------------------------------------------------------------------ signals */
  function signalFor(j, dir) {
    const group = (dir === 'N' || dir === 'S') ? 'NS' : 'EW';
    if (j.phase !== group) return 'red';
    return j.state;
  }

  function updateSignals(dt) {
    for (const j of junctions) {
      j.timer -= dt;
      if (j.state === 'green') {
        j.greenElapsed += dt;
        // Hard ceiling so a stuck AI decision can never starve the other phase.
        if (j.greenElapsed >= SIGNAL.maxGreen) j.timer = Math.min(j.timer, 0);
        if (j.timer <= 0) { j.state = 'yellow'; j.timer = SIGNAL.yellow; }
      } else if (j.timer <= 0) {
        j.phase = (j.phase === 'NS') ? 'EW' : 'NS';
        j.state = 'green';
        j.greenElapsed = 0;
        j.cycles++;
        j.timer = (controlMode === 'fixed') ? SIGNAL.fixedGreen : SIGNAL.baseGreen;
      }
    }
  }

  // Cut the running green short, but never below the minimum green time.
  function cutGreenShort(j) {
    if (j.state !== 'green') return;
    const remainingMin = Math.max(0, SIGNAL.minGreen - j.greenElapsed);
    j.timer = Math.min(j.timer, Math.max(0.2, remainingMin));
  }

  /* Applied by agent.js (AI or heuristic). Never called by the renderer. */
  function applyAction(junctionId, action) {
    const j = junctionById(junctionId);
    if (!j || controlMode === 'fixed') return false;
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
        // Wanted phase is not running: end the current green early to reach it.
        cutGreenShort(j);
      }
      return true;
    }
    return false;
  }

  /* ----------------------------------------------------------- vehicle motion */
  function updateVehicles(dt) {
    // Bucket by lane so lead-vehicle lookup stays cheap.
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

        const gapLead = lead ? (lead.s - v.s - VEHICLE_LEN) : Infinity;
        const gap = Math.min(gapLead, stopLineGap(v));

        const target = MAX_SPEED * clamp((gap - MIN_GAP) / (SAFE_GAP - MIN_GAP), 0, 1);
        if (target > v.speed) v.speed = Math.min(target, v.speed + ACCEL * dt);
        else v.speed = Math.max(target, v.speed - DECEL * dt);
        if (v.speed < 0) v.speed = 0;

        v.s += v.speed * dt;
        if (v.speed < 5) v.waitTime += dt;

        if (v.dir === 'E' || v.dir === 'W') { v.x = AXIS[v.dir].x * v.s; v.y = v.lat; }
        else { v.y = AXIS[v.dir].y * v.s; v.x = v.lat; }

        creditThroughput(v);
      }
    }

    for (let i = vehicles.length - 1; i >= 0; i--) {
      const v = vehicles[i];
      if (v.x < -80 || v.x > WORLD.w + 80 || v.y < -80 || v.y > WORLD.h + 80) {
        stats.processed++;
        stats.waitSum += v.waitTime;
        const m = stats.byMode[controlMode];
        m.processed++;
        m.waitSum += v.waitTime;
        vehicles.splice(i, 1);
      }
    }
  }

  // Distance from this vehicle to the nearest stop line it must respect.
  function stopLineGap(v) {
    let best = Infinity;
    for (const j of junctions) {
      const onPath = (v.dir === 'E' || v.dir === 'W') ? (j.row === v.lane) : (j.col === v.lane);
      if (!onPath) continue;
      const sStop = progressOf(v.dir, j.x, j.y) - JUNCTION_HALF - 2;
      const d = sStop - v.s;
      if (d < -2) continue;                       // already inside or past
      const sig = signalFor(j, v.dir);
      if (sig === 'green') continue;
      // Yellow: stop if there is room, otherwise clear the junction.
      if (sig === 'yellow' && d < 18) continue;
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
   * "N approach" means vehicles waiting NORTH of the junction, travelling
   * south — i.e. the queue a driver standing on the north arm would see.
   */
  function updateQueues() {
    for (const j of junctions) {
      for (const d of DIRS) { j.queues[d] = 0; j.longestWait[d] = 0; }
    }
    for (const v of vehicles) {
      const approach = OPPOSITE[v.dir];
      for (const j of junctions) {
        const onPath = (v.dir === 'E' || v.dir === 'W') ? (j.row === v.lane) : (j.col === v.lane);
        if (!onPath) continue;
        const d = progressOf(v.dir, j.x, j.y) - JUNCTION_HALF - v.s;   // distance to stop line
        if (d < 0 || d > QUEUE_ZONE) continue;
        if (v.speed < QUEUE_SPEED) j.queues[approach]++;
        if (v.waitTime > j.longestWait[approach]) j.longestWait[approach] = v.waitTime;
      }
    }
  }

  const OPPOSITE = { E: 'W', W: 'E', N: 'S', S: 'N' };

  /* ------------------------------------------------------------------- spawns */
  function updateSpawns(dt) {
    for (const sp of spawnPoints) {
      sp.next -= dt * spawnRate;
      if (sp.next <= 0) {
        spawnVehicle(sp);
        sp.next = rnd(1.1, 4.2);
      }
    }
  }

  /* --------------------------------------------------------------- main clock */
  function step(dt) {
    simTime += dt;
    stats.byMode[controlMode].activeSec += dt;
    updateSignals(dt);
    updateSpawns(dt);
    updateVehicles(dt);
    updateQueues();
    for (const fn of tickListeners) fn(dt, simTime);
  }

  function frame(nowMs) {
    if (!running) return;
    const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.05);   // clamp on tab wake
    lastFrameMs = nowMs;
    if (!paused && dt > 0) step(dt);
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    buildJunctions();
    buildSpawnPoints();
    running = true;
    lastFrameMs = performance.now();
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- read API
   * Everything the renderer needs, as plain data. No behaviour attached.
   */
  return {
    GEOM: {
      world: WORLD, cols: COLS, rows: ROWS,
      laneOffset: LANE_OFFSET, roadWidth: ROAD_WIDTH, junctionHalf: JUNCTION_HALF,
      vehicleLen: VEHICLE_LEN, vehicleWidth: VEHICLE_W, queueZone: QUEUE_ZONE
    },
    SIGNAL: SIGNAL,
    PX_TO_KMH: PX_TO_KMH,
    DIRS: DIRS,

    start: start,
    onTick: function (fn) { tickListeners.push(fn); },

    junctions: junctions,
    vehicles: vehicles,
    stats: stats,

    junctionById: junctionById,
    signalFor: signalFor,
    applyAction: applyAction,

    time: function () { return simTime; },
    isPaused: function () { return paused; },
    setPaused: function (p) { paused = !!p; },
    spawnRate: function () { return spawnRate; },
    setSpawnRate: function (r) { spawnRate = r; },
    controlMode: function () { return controlMode; },
    setControlMode: function (m) {
      if (m !== 'ai' && m !== 'fixed') return;
      controlMode = m;
      for (const j of junctions) {
        j.lastReason = (m === 'fixed') ? 'Fixed timer baseline - no AI input.' : 'Awaiting next decision.';
        j.lastSource = (m === 'fixed') ? 'fixed' : 'init';
      }
    },
    avgWait: function (mode) {
      const s = mode ? stats.byMode[mode] : stats;
      return s.processed ? s.waitSum / s.processed : 0;
    }
  };
})();
