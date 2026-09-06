/* =============================================================================
 * render.js — THE ONLY FILE THAT DRAWS ANYTHING.
 *
 * Reads simulation state (SIM), sensor snapshots (SENSOR_FEED), AI decisions
 * (AGENT), scenario state (SCENARIOS) and plan results (BENCH), and paints
 * them. It never computes simulation state; the only writes it performs are
 * user controls, through the public setters.
 *
 * SWAPPING TO 3D: replace this file with a Three.js renderer reading the same
 * data. No simulation file changes.
 * ========================================================================== */

(function () {
  'use strict';

  const C = {
    bg: '#0b0e14', grid: '#141a26', road: '#3a4150', roadEdge: '#4a5364',
    dash: '#7b8798', junction: '#454e60', stopLine: '#93a2b8',
    label: '#e8eef7', labelBg: 'rgba(19,24,34,0.93)',
    red: '#ef4444', yellow: '#facc15', green: '#22c55e',
    accent: '#22d3ee', dim: '#93a2b8', warn: '#fb923c', flood: 'rgba(56,110,190,0.35)'
  };

  const TYPE_COLOR = {
    '2w': '#7dd3fc', 'auto': '#fbbf24', 'car': '#22d3ee', 'bus': '#c084fc', 'truck': '#fb923c'
  };

  const G = SIM.GEOM;
  const W = G.world.w, H = G.world.h;

  let scaleFactor = 1, offX = 0, offY = 0, tick = 0;
  let selectedJunction = 'ALL';

  /* ------------------------------------------------------------------ setup */
  window.setup = function () {
    const host = document.getElementById('canvas-host');
    const cnv = createCanvas(host.clientWidth, host.clientHeight);
    cnv.parent(host);
    textFont('Segoe UI');
    SIM.start();
    wireControls();
    syncTimingInputs();
  };

  window.windowResized = function () {
    const host = document.getElementById('canvas-host');
    resizeCanvas(host.clientWidth, host.clientHeight);
  };

  function computeTransform() {
    const pad = 24;
    scaleFactor = Math.min((width - pad * 2) / W, (height - pad * 2) / H);
    offX = (width - W * scaleFactor) / 2;
    offY = (height - H * scaleFactor) / 2;
  }

  /* ------------------------------------------------------------------- draw */
  window.draw = function () {
    // When the 3D view is on, the p5 canvas is hidden and Three.js draws the
    // same state instead. The sidebar still updates either way, because it
    // reads SIM, not the canvas.
    if (typeof RENDER3D !== 'undefined' && RENDER3D.isActive()) {
      RENDER3D.frame();
      tick++;
      if (tick % 5 === 0) updateSidebar();
      if (tick % 15 === 0) drawCharts();
      return;
    }

    background(C.bg);
    computeTransform();

    push();
    translate(offX, offY);
    scale(scaleFactor);
    drawBackdrop();
    drawRoads();
    drawFlood();
    drawJunctions();
    drawSignals();
    drawVehicles();
    drawJunctionLabels();
    pop();

    if (SIM.isPaused()) drawPausedBanner();

    tick++;
    if (tick % 5 === 0) updateSidebar();
    if (tick % 15 === 0) drawCharts();
  };

  function drawCharts() {
    drawChart('chart-delay', SIM.series.avgDelay, C.accent);
    drawChart('chart-queue', SIM.series.totalQueue, C.warn);
    drawModelChart();
  }

  function drawBackdrop() {
    noStroke(); fill(C.grid);
    for (let x = 0; x <= W; x += 80) rect(x, 0, 1, H);
    for (let y = 0; y <= H; y += 80) rect(0, y, W, 1);
  }

  function drawRoads() {
    const hw = G.roadWidth / 2;
    noStroke();
    for (const y of G.rows) { fill(C.roadEdge); rect(0, y - hw - 2, W, G.roadWidth + 4); }
    for (const x of G.cols) { fill(C.roadEdge); rect(x - hw - 2, 0, G.roadWidth + 4, H); }
    for (const y of G.rows) { fill(C.road); rect(0, y - hw, W, G.roadWidth); }
    for (const x of G.cols) { fill(C.road); rect(x - hw, 0, G.roadWidth, H); }

    fill(C.dash);
    for (const y of G.rows) {
      for (let x = 0; x < W; x += 44) {
        if (nearAxis(x, G.cols)) continue;
        rect(x, y - 1.5, 22, 3);
      }
    }
    for (const x of G.cols) {
      for (let y = 0; y < H; y += 44) {
        if (nearAxis(y, G.rows)) continue;
        rect(x - 1.5, y, 3, 22);
      }
    }
  }

  function nearAxis(v, list) {
    for (const a of list) if (Math.abs(v - a) < G.junctionHalf + 20) return true;
    return false;
  }

  function drawFlood() {
    const hw = G.roadWidth / 2 + 4;
    noStroke(); fill(C.flood);
    for (const roadId in SIM.conditions.floodedRoads) {
      if (roadId.indexOf('row') === 0) {
        const y = G.rows[+roadId.slice(3)];
        rect(0, y - hw, W, hw * 2);
      } else {
        const x = G.cols[+roadId.slice(3)];
        rect(x - hw, 0, hw * 2, H);
      }
    }
    // Label it, because colour alone must never carry meaning.
    fill(C.label); textSize(15); textStyle(BOLD);
    for (const roadId in SIM.conditions.floodedRoads) {
      if (roadId.indexOf('row') === 0) text('FLOODED — NO HEAVY VEHICLES', 16, G.rows[+roadId.slice(3)] - 26);
      else text('FLOODED', G.cols[+roadId.slice(3)] + 26, 26);
    }
    textStyle(NORMAL);
  }

  function drawJunctions() {
    rectMode(CENTER);
    for (const j of SIM.junctions) {
      noStroke(); fill(C.junction);
      rect(j.x, j.y, G.junctionHalf * 2, G.junctionHalf * 2, 4);
      if (SENSOR_FEED.incidentActive(j.id)) {
        noFill(); stroke(C.warn); strokeWeight(3);
        rect(j.x, j.y, G.junctionHalf * 2 + 14, G.junctionHalf * 2 + 14, 6);
      }
    }
    rectMode(CORNER);

    noStroke(); fill(C.stopLine);
    for (const j of SIM.junctions) {
      const d = G.junctionHalf + 3, lo = G.laneOffset;
      rect(j.x - lo - 10, j.y - d - 3, 20, 3);
      rect(j.x + lo - 10, j.y + d, 20, 3);
      rect(j.x + d, j.y - lo - 10, 3, 20);
      rect(j.x - d - 3, j.y + lo - 10, 3, 20);
    }

    // Blocked approach marker — crossed box plus the word.
    for (const key in SIM.conditions.blockedApproaches) {
      const parts = key.split(':');
      const j = SIM.junctionById(parts[0]);
      if (!j) continue;
      const dir = parts[1];
      const off = G.junctionHalf + 46;
      const px = j.x + (dir === 'E' ? off : dir === 'W' ? -off : 0);
      const py = j.y + (dir === 'S' ? off : dir === 'N' ? -off : 0);
      stroke(C.red); strokeWeight(4);
      line(px - 13, py - 13, px + 13, py + 13);
      line(px + 13, py - 13, px - 13, py + 13);
      noStroke(); fill(C.red); textSize(13); textStyle(BOLD);
      text('BLOCKED', px - 26, py + 32);
      textStyle(NORMAL);
    }
  }

  function drawSignals() {
    const d = G.junctionHalf + 20;
    for (const j of SIM.junctions) {
      signalHead(j.x - G.laneOffset - 22, j.y - d, SIM.signalFor(j, 'S'));
      signalHead(j.x + G.laneOffset + 22, j.y + d, SIM.signalFor(j, 'N'));
      signalHead(j.x + d, j.y - G.laneOffset - 22, SIM.signalFor(j, 'W'));
      signalHead(j.x - d, j.y + G.laneOffset + 22, SIM.signalFor(j, 'E'));
    }
  }

  function signalHead(x, y, state) {
    const col = state === 'green' ? C.green : (state === 'yellow' ? C.yellow : C.red);
    noStroke();
    fill('#0d1220'); ellipse(x, y, 20, 20);
    fill(col); ellipse(x, y, 14, 14);
    const c = color(col);
    fill(red(c), green(c), blue(c), 55); ellipse(x, y, 26, 26);
  }

  /* Vehicles are drawn wider than their true size, the way a transport map
   * exaggerates a station symbol: at real scale a two-wheeler is under a
   * millimetre on a projector and the animation reads as an empty grid.
   *
   * Width is scaled freely - it is lateral, so it cannot cause a vehicle to
   * touch the one in front. Opposing lane centres are 32 px apart and the
   * widest vehicle here draws at 20 px.
   *
   * LENGTH IS THE ONE THAT BIT. It used to be scaled by 1.9 as well, and that
   * is arithmetically guaranteed to overlap: a stopped car is 4.5 m long and
   * sits 2 m behind the next one, so centres are 26 px apart at 4 px/m - but a
   * 1.9x car draws 34 px long. Every queue rendered as a pile of overlapping
   * boxes while the physics underneath was perfectly correct.
   *
   * So length is padded by a FRACTION OF THE BUMPER GAP instead of multiplied.
   * Two vehicles sit at least (lenA + lenB)/2 + MIN_GAP apart, and this draws
   * them (lenA + lenB)/2 + GAP_USE*MIN_GAP wide. With GAP_USE < 1 the drawn
   * boxes cannot meet, whatever the vehicle types or the traffic - it holds for
   * a bus behind a two-wheeler as surely as for two cars. */
  const WIDTH_SCALE = 2.0;
  const MIN_DRAW_W = 8;
  /* Was 0.7. That assumed vehicles never close below the 2 m standstill gap,
   * but the hard floor in sim.js only guarantees they never INTERPENETRATE -
   * a decelerating vehicle can settle a little inside MIN_GAP and stay there.
   * The harness caught a 0.3 px draw overlap from exactly that.
   *
   * Zero is the only value that is provably safe against the invariant the
   * physics actually offers. The honest alternative is to make sim.js enforce
   * the documented 2 m standstill gap, which would also let this go back up -
   * but that changes the simulated world and every published number with it,
   * so it is not a thing to do the morning of a demo. */
  const GAP_USE = 0;
  const LEN_PAD = SIM.PARAMS.minGapM * SIM.PARAMS.pxPerM * GAP_USE;

  function drawVehicles() {
    rectMode(CENTER);
    for (const v of SIM.vehicles) {
      const base = TYPE_COLOR[v.type.id] || C.accent;
      const queued = v.speed < 8;
      const len = v.type.len + LEN_PAD;
      const wid = Math.max(MIN_DRAW_W, v.type.wid * WIDTH_SCALE);
      push();
      translate(v.x, v.y);
      if (v.dir === 'N' || v.dir === 'S') rotate(HALF_PI);

      if (v.emergency || v.priority) {
        // Both ambulances in a conflict are drawn as ambulances. Only the one
        // actually holding a green corridor gets the halo, so the picture shows
        // which one won rather than implying both did.
        noStroke();
        if (v.priority) { fill(34, 211, 238, 70); ellipse(0, 0, len + 34, len + 34); }
        else { stroke(C.warn); strokeWeight(1.5); noFill(); ellipse(0, 0, len + 22, len + 22); noStroke(); }
        fill('#ffffff');
        rect(0, 0, len, wid, 2);
        fill(C.red);
        rect(0, 0, len * 0.34, wid, 1);          // a red flash, so it reads instantly
      } else {
        const c = color(base);
        stroke(10, 14, 20, queued ? 120 : 200);
        strokeWeight(1);
        fill(red(c), green(c), blue(c), queued ? 150 : 255);
        rect(0, 0, len, wid, 2);
      }
      pop();
    }
    rectMode(CORNER);
    noStroke();

    const pv = SCENARIOS.trackedVehicle();
    if (pv) {
      noStroke(); fill(C.label); textSize(14); textStyle(BOLD);
      text('PRIORITY', pv.x - 28, pv.y - 18);
      textStyle(NORMAL);
    }
  }

  function drawJunctionLabels() {
    const boxW = 260;
    for (const j of SIM.junctions) {
      const outX = (j.x < W / 2) ? -1 : 1;
      const outY = (j.y < H / 2) ? -1 : 1;
      const lines = wrapText(j.lastReason || '', boxW - 22, 15);
      const boxH = 30 + lines.length * 18;
      const bx = j.x + outX * 86 - (outX < 0 ? boxW : 0);
      const by = (outY < 0) ? (j.y - 74 - boxH) : (j.y + 74);

      const edge = j.lastSource === 'gemini' ? C.accent
        : j.lastSource === 'error' ? C.red
        : j.lastSource === 'maxpressure' ? '#67e8f9' : C.dim;

      noStroke();
      fill(C.labelBg); rect(bx, by, boxW, boxH, 7);
      fill(edge); rect(bx, by, 4, boxH, 3);

      const p = SIM.getPlan(j.id);
      textSize(13); textStyle(BOLD); fill(edge);
      text(j.id + '   ' + p.greenNS + 's NS / ' + p.greenEW + 's EW', bx + 13, by + 18);
      textStyle(NORMAL); textSize(15); fill(C.label);
      for (let i = 0; i < lines.length; i++) text(lines[i], bx + 13, by + 38 + i * 18);
    }
  }

  function wrapText(str, maxW, size) {
    textSize(size);
    const words = String(str).split(' ');
    const lines = []; let line = '';
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (textWidth(test) > maxW && line) { lines.push(line); line = wd; }
      else line = test;
      if (lines.length >= 3) break;
    }
    if (line && lines.length < 3) lines.push(line);
    return lines;
  }

  function drawPausedBanner() {
    noStroke(); fill(11, 14, 20, 170); rect(0, 0, width, height);
    fill('#e8eef7'); textSize(44); textStyle(BOLD); textAlign(CENTER, CENTER);
    text('PAUSED', width / 2, height / 2);
    textAlign(LEFT, BASELINE); textStyle(NORMAL);
  }

  /* ------------------------------------------------------------ mini charts */
  function drawChart(id, data, colour) {
    const cv = document.getElementById(id);
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d1220'; ctx.fillRect(0, 0, w, h);
    if (data.length < 2) return;

    let max = 1;
    for (const v of data) if (v > max) max = v;
    max *= 1.15;

    ctx.strokeStyle = '#2a3444'; ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const y = (h / 3) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    ctx.strokeStyle = colour; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = h - (data[i] / max) * (h - 6) - 3;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#93a2b8';
    ctx.font = '10px Consolas, monospace';
    ctx.fillText(max.toFixed(0), 4, 11);
    ctx.fillText(data[data.length - 1].toFixed(1), w - 34, 11);
  }

  /* ------------------------------------------------------------ model panel
   * What the trained model is thinking, in two forms: the facts about how it
   * was made, and a running trace of how strongly it prefers holding over
   * switching at the moment.
   */
  const qTrace = [];

  function drawModelChart() {
    const cv = document.getElementById('chart-q');
    if (!cv || typeof NN === 'undefined' || !NN.isReady()) return;
    const j = SIM.junctions[0];
    if (!j) return;
    const q = NN.scoreJunction(j);
    if (q) {
      qTrace.push(q.hold - q.switchTo);
      if (qTrace.length > 160) qTrace.shift();
    }

    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d1220'; ctx.fillRect(0, 0, w, h);
    if (qTrace.length < 2) return;

    let m = 0.5;
    for (const v of qTrace) m = Math.max(m, Math.abs(v));

    ctx.strokeStyle = '#2a3444'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

    ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < qTrace.length; i++) {
      const x = (i / (qTrace.length - 1)) * w;
      const y = h / 2 - (qTrace[i] / m) * (h / 2 - 4);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#93a2b8';
    ctx.font = '10px Consolas, monospace';
    ctx.fillText('hold', 5, 11);
    ctx.fillText('switch', 5, h - 4);
  }

  function renderModelFacts() {
    const host = document.getElementById('model-facts');
    if (!host) return;
    if (typeof NN === 'undefined' || !NN.isReady()) {
      host.innerHTML = '<p class="hint">No trained weights loaded. ' +
        (typeof NN !== 'undefined' && NN.error() ? escapeHtml(NN.error()) : 'weights.js missing') +
        '</p>';
      return;
    }
    const m = NN.meta() || {};
    const ev = m.evaluation || {};
    const rows = [
      ['trained on', (m.episodes || '?') + ' episodes inside this simulator'],
      ['method', m.method === 'mc' ? 'Monte-Carlo returns' : (m.method || 'dqn')],
      ['input', (m.stateLayout ? m.stateLayout.length : FEATURES.SIZE) + ' numbers per junction'],
      ['decides', 'hold or switch, every ' + NN.DECISION_SEC + 's'],
      ['fixed plan', ev.fixedDelay ? ev.fixedDelay.toFixed(1) + 's delay' : '—'],
      ['max-pressure', ev.maxPressureDelay ? ev.maxPressureDelay.toFixed(1) + 's delay' : '—'],
      ['this model', ev.modelDelay ? ev.modelDelay.toFixed(1) + 's delay' : '—'],
      ['verdict', ev.changePct ? ev.changePct.toFixed(1) + '% better than fixed' : '—']
    ];
    host.innerHTML = rows.map(function (r) {
      const good = r[0] === 'verdict' || r[0] === 'this model';
      return '<div class="fact' + (good ? ' good' : '') + '"><span>' + r[0] +
             '</span><b>' + escapeHtml(String(r[1])) + '</b></div>';
    }).join('');
  }

  /* The three layers, and how much work each one is actually doing. The point
   * of showing errors and fallbacks is that they are the normal case on a bad
   * network, and the twin keeps running through them. */
  let lastLlmKey = '';
  function renderLlmFacts() {
    const host = document.getElementById('llm-facts');
    if (!host) return;
    const s = AGENT.stats;
    const key = [s.calls, s.errors, s.approvals, s.corrections, s.ruleOnly,
                 s.rateLimited, s.modelInUse].join('|');
    if (key === lastLlmKey) return;
    lastLlmKey = key;
    const reviewed = s.approvals + s.corrections;
    const rows = [
      ['1 · propose', AGENT.hasKey() ? (s.modelInUse || AGENT.MODEL) : 'no key — layer 3 only'],
      ['2 · review', reviewed ? s.approvals + ' approved, ' + s.corrections + ' overruled' : 'waiting for a decision'],
      ['3 · fall back', (s.ruleOnly + s.errors) + ' decisions made by the local rule'],
      ['fallback chain', AGENT.MODEL_CHAIN.join(' → ')],
      ['call budget', 'one supervised junction every ' + AGENT.callSpacingSec + 's' +
        (AGENT.coolingDown() ? ' — cooling down after a rate limit' : '')],
      ['rate limits hit', s.rateLimited + (AGENT.deadModels().length ? ' · retired: ' + AGENT.deadModels().join(', ') : '')],
      ['round trip', s.calls ? s.avgLatencyMs + 'ms average' : '—'],
      ['under all three', 'min green ' + SIM.SIGNAL.minGreen + 's · yellow ' + SIM.SIGNAL.yellow + 's · max green ' + SIM.SIGNAL.maxGreen + 's']
    ];
    host.innerHTML = rows.map(function (r) {
      const good = r[0] === 'under all three';
      return '<div class="fact' + (good ? ' good' : '') + '"><span>' + escapeHtml(r[0]) +
             '</span><b>' + escapeHtml(String(r[1])) + '</b></div>';
    }).join('');

    const lastHost = document.getElementById('llm-last');
    if (!lastHost) return;
    const d = AGENT.lastSupervised();
    if (!d) {
      // Say which of the three reasons it is, rather than one generic line -
      // "no supervised decision yet" while the LLM agent is already driving
      // reads like a bug when it is actually the budget doing its job.
      let why;
      if (!AGENT.hasKey()) why = 'No API key in config.js, so the local rule is driving.';
      else if (SIM.controlMode() !== 'ai') why = 'Switch the controller to LLM AGENT to see one.';
      else if (AGENT.coolingDown()) why = 'Rate limited — cooling down. The local rule is driving.';
      else why = 'Waiting on the call budget. The local rule is driving in the meantime.';
      lastHost.innerHTML = '<p class="hint">No supervised decision yet. ' + why + '</p>';
      return;
    }
    lastHost.innerHTML =
      '<div class="dec' + (d.verdict === 'corrected' ? ' warn' : '') + '">' +
      '<div class="dec-head"><span class="dec-j">' + escapeHtml(d.junctionId) + '</span>' +
      '<span class="dec-action">' + escapeHtml(d.action) + '</span>' +
      '<span class="dec-meta">' + (d.verdict === 'corrected' ? 'OVERRULED' : 'APPROVED') +
      ' · ' + d.latencyMs + 'ms</span></div>' +
      '<div class="dec-reason">' + escapeHtml(d.reason) + '</div></div>';
  }

  /* ---------------------------------------------------------------- sidebar */
  let cardsBuilt = false;

  function buildCards() {
    const host = document.getElementById('junction-cards');
    host.innerHTML = '';
    for (const j of SIM.junctions) {
      const card = document.createElement('div');
      card.className = 'jcard'; card.id = 'card-' + j.id;
      let rows = '';
      for (const d of SIM.DIRS) {
        rows += '<div class="qrow"><span>' + d + '</span>' +
          '<span class="qbar-track"><span class="qbar-fill" id="q-' + j.id + '-' + d + '" style="width:0%"></span></span>' +
          '<span class="qval" id="qv-' + j.id + '-' + d + '">0</span></div>';
      }
      card.innerHTML = '<div class="jcard-head"><span class="jcard-id">' + j.id + '</span>' +
        '<span class="jcard-phase" id="phase-' + j.id + '">NS</span></div>' + rows;
      host.appendChild(card);
    }
    cardsBuilt = true;
  }

  let lastLogKey = '';
  let lastResultCount = -1;

  function updateSidebar() {
    if (!cardsBuilt) { if (!SIM.junctions.length) return; buildCards(); }

    // HUD
    document.getElementById('hud-delay').textContent = SIM.avgDelay().toFixed(1) + 's';
    document.getElementById('hud-queue').textContent = SIM.totalQueue();
    const thr = SIM.series.throughput.length ? SIM.series.throughput[SIM.series.throughput.length - 1] : 0;
    document.getElementById('hud-thru').textContent = Math.round(thr);
    const t = Math.floor(SIM.time());
    document.getElementById('hud-clock').textContent =
      Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    document.getElementById('insight').textContent = BENCH.insight();

    // Junction cards
    for (const j of SIM.junctions) {
      for (const d of SIM.DIRS) {
        const q = j.queues[d];
        const bar = document.getElementById('q-' + j.id + '-' + d);
        if (!bar) continue;
        bar.style.width = Math.min(100, q * 9) + '%';
        bar.className = 'qbar-fill' + (q >= 10 ? ' crit' : (q >= 6 ? ' hot' : ''));
        document.getElementById('qv-' + j.id + '-' + d).textContent = q;
      }
      const ph = document.getElementById('phase-' + j.id);
      const word = j.state === 'green' ? 'GO' : (j.state === 'yellow' ? 'AMB' : 'RED');
      ph.textContent = j.phase + ' ' + word;
      ph.className = 'jcard-phase ' + (j.state === 'green' ? 'phase-green' : j.state === 'yellow' ? 'phase-yellow' : 'phase-allred');
      document.getElementById('card-' + j.id).className =
        'jcard' + (SENSOR_FEED.incidentActive(j.id) ? ' incident' : '');
    }

    // Merged log: AI decisions and scenario events, newest first.
    const merged = [];
    for (const d of AGENT.decisions.slice(0, 8)) {
      merged.push({
        t: d.simTime, cls: d.source, head: d.junctionId, action: d.action,
        meta: d.source === 'gemini'
          ? (d.verdict === 'corrected' ? 'CORRECTED · ' : d.verdict === 'approved' ? 'REVIEWED · ' : '') + d.latencyMs + 'ms'
          : d.source.toUpperCase(),
        text: d.reason
      });
    }
    for (const e of SCENARIOS.log.slice(0, 8)) {
      merged.push({ t: e.at, cls: e.kind, head: 'EVENT', action: e.kind.toUpperCase(), meta: '', text: e.text });
    }
    merged.sort(function (a, b) { return b.t - a.t; });
    const key = merged.slice(0, 7).map(function (m) { return m.t + m.text.slice(0, 12); }).join('|');
    if (key !== lastLogKey) {
      lastLogKey = key;
      const host = document.getElementById('decision-log');
      host.innerHTML = '';
      for (const m of merged.slice(0, 7)) {
        const el = document.createElement('div');
        el.className = 'dec ' + (m.cls === 'gemini' ? '' : m.cls);
        el.innerHTML = '<div class="dec-head"><span class="dec-j">' + m.head + '</span>' +
          '<span class="dec-action">' + escapeHtml(m.action) + '</span>' +
          '<span class="dec-meta">' + m.meta + '</span></div>' +
          '<div class="dec-reason">' + escapeHtml(m.text) + '</div>';
        host.appendChild(el);
      }
    }

    // Ledger
    const L = SIM.stats.priorityLedger;
    document.getElementById('led-saved').textContent = L.savedSec ? L.savedSec.toFixed(1) + 's' : '—';
    document.getElementById('led-paid').textContent = Math.round(L.crossVehSec);
    document.getElementById('led-note').textContent =
      'Granted ' + L.grants + ' · refused ' + L.refusals +
      '. Saved is measured against the ' + SIM.avgDelay().toFixed(1) +
      's an ordinary vehicle loses on the same trip.';

    // Results table
    if (BENCH.results.length !== lastResultCount) {
      lastResultCount = BENCH.results.length;
      const host = document.getElementById('results');
      host.innerHTML = '';
      const best = BENCH.best();
      for (const r of BENCH.results) {
        const el = document.createElement('div');
        el.className = 'res' + (best && r === best ? ' best' : '');
        el.innerHTML = '<span class="res-name">' + escapeHtml(r.name) + '</span>' +
          '<span class="res-delay">' + r.avgDelay.toFixed(1) + 's</span>' +
          '<span class="res-meta">' + Math.round(r.throughput) + ' veh/h</span>';
        host.appendChild(el);
      }
    }

    // Stats
    document.getElementById('stat-processed').textContent = SIM.stats.processed;
    document.getElementById('stat-stop').textContent = SIM.avgStopDelay().toFixed(1) + 's';
    document.getElementById('stat-active').textContent = SIM.vehicles.length;
    document.getElementById('stat-latency').textContent =
      AGENT.stats.calls ? AGENT.stats.avgLatencyMs + 'ms' : '—';
    document.getElementById('cycle-out').textContent =
      Math.round(SIM.cycleLength(SIM.junctions[0])) + 's';
    document.getElementById('seed-out').textContent = SIM.seed();

    const note = document.getElementById('source-note');
    const mode = SIM.controlMode();
    if (mode === 'ai' && AGENT.hasKey()) {
      note.className = 'source-note live';
      note.textContent = 'Controller: ' + (AGENT.stats.modelInUse || AGENT.MODEL) +
        ' · ' + AGENT.stats.calls + ' calls · ' + AGENT.stats.corrections + ' corrected · ' +
        AGENT.stats.errors + ' errors';
    } else if (mode === 'ai') {
      note.className = 'source-note';
      note.textContent = 'Controller: local heuristic (no API key in config.js)';
    } else {
      note.className = 'source-note';
      note.textContent = mode === 'plan' ? 'Controller: fixed-time plan' : 'Controller: Max-Pressure';
    }

    renderLlmFacts();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* --------------------------------------------------------------- controls */
  function syncTimingInputs() {
    const id = selectedJunction === 'ALL' ? SIM.junctions[0].id : selectedJunction;
    const p = SIM.getPlan(id);
    document.getElementById('green-ns').value = p.greenNS;
    document.getElementById('green-ew').value = p.greenEW;
    document.getElementById('green-ns-out').textContent = p.greenNS + 's';
    document.getElementById('green-ew-out').textContent = p.greenEW + 's';
  }

  function setGreen(which, value) {
    const patch = {};
    patch[which] = value;
    if (selectedJunction === 'ALL') SIM.setPlanAll(patch);
    else SIM.setPlan(selectedJunction, patch);
  }

  function wireControls() {
    document.getElementById('model-name').textContent = AGENT.hasKey() ? AGENT.MODEL : 'heuristic';

    const modes = { 'btn-plan': 'plan', 'btn-mp': 'maxpressure',
                    'btn-nn': 'nn', 'btn-ai': 'ai' };
    const caps = { plan: 'FIXED-TIME PLAN', maxpressure: 'MAX-PRESSURE CONTROL',
                   nn: 'TRAINED MODEL IN CONTROL', ai: 'GEMINI AI CONTROL' };
    for (const id in modes) {
      document.getElementById(id).addEventListener('click', function () {
        SIM.setControlMode(modes[id]);
        const notes = {
          plan: 'A fixed plan is round robin: equal slices whether or not anyone is waiting.',
          maxpressure: 'Serves whichever phase has the most queued PCU, with hysteresis so it cannot thrash.',
          nn: 'The trained model: hold or switch every 5s, from 8 numbers per junction.',
          ai: 'A language model proposing actions, validated by a second pass, with a rule-based fallback.'
        };
        const note = document.getElementById('controller-note');
        if (note) note.textContent = notes[modes[id]] || '';
        for (const other in modes) document.getElementById(other).classList.toggle('active', other === id);
        document.getElementById('cap-mode').textContent = caps[modes[id]];
      });
    }

    document.getElementById('btn-webster').addEventListener('click', function () {
      const out = CONTROLLERS.applyWebster();
      syncTimingInputs();
      document.getElementById('webster-note').textContent = out[0].reason;
    });

    document.getElementById('sel-junction').addEventListener('change', function (e) {
      selectedJunction = e.target.value;
      syncTimingInputs();
    });

    const gns = document.getElementById('green-ns');
    gns.addEventListener('input', function () {
      const v = parseInt(gns.value, 10);
      document.getElementById('green-ns-out').textContent = v + 's';
      setGreen('greenNS', v);
    });
    const gew = document.getElementById('green-ew');
    gew.addEventListener('input', function () {
      const v = parseInt(gew.value, 10);
      document.getElementById('green-ew-out').textContent = v + 's';
      setGreen('greenEW', v);
    });

    const load = document.getElementById('spawn-rate');
    load.addEventListener('input', function () {
      const v = parseFloat(load.value);
      SIM.setSpawnRate(v);
      document.getElementById('spawn-rate-out').textContent = v.toFixed(1) + 'x';
    });

    const speed = document.getElementById('sim-speed');
    speed.addEventListener('input', function () {
      const v = parseFloat(speed.value);
      SIM.setSpeedScale(v);
      document.getElementById('sim-speed-out').textContent = v.toFixed(1) + 'x';
    });

    const pause = document.getElementById('btn-pause');
    pause.addEventListener('click', function () {
      const next = !SIM.isPaused();
      SIM.setPaused(next);
      pause.textContent = next ? 'RESUME' : 'PAUSE';
      pause.classList.toggle('on', next);
    });

    document.getElementById('btn-reset').addEventListener('click', function () {
      SIM.reset({ seed: SIM.seed(), keepConditions: true });
    });

    const test = document.getElementById('btn-test');
    test.addEventListener('click', function () {
      if (BENCH.isRunning()) return;
      test.disabled = true;
      test.textContent = 'TESTING…';
      const name = ({ plan: 'Plan', maxpressure: 'Max-Pressure', ai: 'Gemini AI' })[SIM.controlMode()] +
        ' ' + SIM.getPlan(SIM.junctions[0].id).greenNS + '/' + SIM.getPlan(SIM.junctions[0].id).greenEW;
      BENCH.run(name).then(function () {
        test.disabled = false;
        test.textContent = 'TEST THIS PLAN — 100s';
      });
    });

    document.getElementById('btn-normal').addEventListener('click', function () { SCENARIOS.clearAll(); });
    document.getElementById('btn-accident').addEventListener('click', function () { SCENARIOS.accident('J2', 'E'); });
    document.getElementById('btn-flood').addEventListener('click', function () { SCENARIOS.flood('row1', 0.45, true); });
    document.getElementById('btn-surge').addEventListener('click', function () { SCENARIOS.surge('EW', 2.6); });
    document.getElementById('btn-failure').addEventListener('click', function () { SCENARIOS.signalFailure('J3'); syncTimingInputs(); });
    document.getElementById('btn-corridor').addEventListener('click', function () { SCENARIOS.requestCorridor('EW'); });

    // ---- dispatch panel: place a request with its own severity and source ----
    document.getElementById('btn-send-req').addEventListener('click', function () {
      const req = PRIORITY.submit({
        severity: document.getElementById('rq-sev').value,
        verification: document.getElementById('rq-ver').value,
        axis: document.getElementById('rq-axis').value,
        persons: parseInt(document.getElementById('rq-persons').value, 10)
      });
      document.getElementById('rq-note').textContent =
        req.id + ' ' + req.state.toUpperCase() + (req.reason ? ' — ' + req.reason : ' — ' + req.workings);
    });

    document.getElementById('btn-two-amb').addEventListener('click', function () {
      const pair = SCENARIOS.twoAmbulances();
      document.getElementById('rq-note').textContent =
        pair[0].id + ' and ' + pair[1].id + ' are converging on the same junction on ' +
        'opposite phases. Watch the control room window.';
    });

    // ---- guided demo: sets the scene and tells the presenter what to say ----
    const SCRIPT = {
      1: {
        say: 'Four junctions, real vehicles — two-wheelers, autos, cars, buses. ' +
             'The number top right is average delay per vehicle. That is the one that matters.',
        run: function () {
          SCENARIOS.clearAll();
          SIM.setControlMode('plan');
          SIM.setPlanAll({ greenNS: 18, greenEW: 18 });
          SIM.setSpawnRate(1.0);
          SIM.reset({ seed: SIM.seed(), keepConditions: true });
          syncTimingInputs();
          setSeg('btn-plan');
        }
      },
      2: {
        say: 'East–west green is now 30s instead of 18. Watch east–west drain and ' +
             'north–south build — I took those seconds from somewhere. Press TEST THIS PLAN ' +
             'to score it on identical traffic.',
        run: function () {
          selectedJunction = 'ALL';
          document.getElementById('sel-junction').value = 'ALL';
          SIM.setPlanAll({ greenNS: 12, greenEW: 30 });
          syncTimingInputs();
        }
      },
      3: {
        say: 'A collision blocks one approach at J2 — watch the queue grow backwards ' +
             'into the junction behind it. Then the flooded road: speeds drop and heavy ' +
             'vehicles are barred, which is why we model five vehicle types.',
        run: function () {
          SCENARIOS.accident('J2', 'E');
          later(function () { SCENARIOS.flood('row1', 0.45, true); }, 4000);
        }
      },
      4: {
        say: 'Two ambulances, crossing roads, same junction, opposite phases. Only one ' +
             'can go. Look at the control room window — it warned before either arrived, ' +
             'and it priced both options.',
        run: function () {
          SCENARIOS.clearAll();
          SIM.setSpawnRate(1.0);
          SCENARIOS.twoAmbulances();
        }
      },
      5: {
        say: 'The trained model is driving now. It was trained inside this simulator, ' +
             'and it beats the fixed plan by about 11% in the demand pattern it was ' +
             'trained for. Every decision it makes still passes through the safety limits.',
        run: function () {
          SIM.setControlMode('nn');
          setSeg('btn-nn');
        }
      }
    };

    function setSeg(id) {
      for (const other in modes) {
        document.getElementById(other).classList.toggle('active', other === id);
      }
      document.getElementById('cap-mode').textContent = caps[modes[id]];
    }

    /* The step buttons used to only ever gain a green tick, because the tick
     * meant "rehearsed" and nothing removed it. In a live demo that is the
     * wrong model: what you want is to see which step is RUNNING, and to be
     * able to back out of one you opened by mistake. So there are now two
     * states - `active` for the step on screen, `done` for steps already shown
     * - and clicking the active step again undoes it. */
    const steps = document.querySelectorAll('.demo-steps .step');

    /* Some steps stage themselves in two beats - the collision first, the
     * flood a few seconds later - so the audience sees one thing at a time.
     * Those timers have to be cancellable. Without this, clearing a step wipes
     * the scene and then its pending timer fires and puts the flood back, which
     * looks exactly like the tool ignoring you. */
    const demoTimers = [];
    function later(fn, ms) { demoTimers.push(setTimeout(fn, ms)); }
    function clearTimers() {
      while (demoTimers.length) clearTimeout(demoTimers.pop());
    }

    function clearScene() {
      clearTimers();
      SCENARIOS.clearAll();
      if (typeof PRIORITY !== 'undefined') { PRIORITY.cancelPlan(); PRIORITY.clearPlan(); }
      SIM.setControlMode('plan');
      setSeg('btn-plan');
    }

    steps.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const step = SCRIPT[btn.dataset.step];
        if (!step) return;

        if (btn.classList.contains('active')) {
          btn.classList.remove('active');
          clearScene();
          document.getElementById('demo-say').textContent =
            'Step ' + btn.dataset.step + ' cleared. The network is back to the ' +
            'fixed plan with nothing running. Press it again to replay it.';
          return;
        }

        steps.forEach(function (o) {
          if (o.classList.contains('active')) o.classList.replace('active', 'done');
        });
        clearTimers();          // a previous step's staged beats must not land in this one
        step.run();
        document.getElementById('demo-say').textContent = step.say;
        btn.classList.add('active');
      });
    });

    document.getElementById('btn-demo-reset').addEventListener('click', function () {
      steps.forEach(function (o) { o.classList.remove('active', 'done'); });
      clearScene();
      document.getElementById('demo-say').textContent =
        'Demo reset. Nothing is running and no step is marked. Press 1 to begin.';
    });

    document.getElementById('btn-open-console').addEventListener('click', function () {
      window.open('console.html', 'dtg-console', 'width=1280,height=900');
    });

    /* ---- tabs: one job on screen at a time ------------------------------ */
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        const want = tab.dataset.pane;
        document.querySelectorAll('.tab').forEach(function (t) {
          t.classList.toggle('active', t === tab);
        });
        document.querySelectorAll('.pane').forEach(function (p) {
          p.hidden = (p.dataset.pane !== want);
        });
        if (want === 'learn') renderModelFacts();
      });
    });

    /* ---- 2D / 3D ------------------------------------------------------- */
    const b2d = document.getElementById('view-2d');
    const b3d = document.getElementById('view-3d');
    const host2d = document.getElementById('canvas-host');
    const host3d = document.getElementById('three-host');
    const hint = document.getElementById('view-hint');

    function setView(three) {
      if (three) {
        if (!RENDER3D.isAvailable()) {
          document.getElementById('demo-say').textContent =
            'The 3D view needs three.js, which did not load. The 2D view has everything.';
          return;
        }
        host3d.hidden = false;
        const ok = RENDER3D.enable();
        if (!ok) { host3d.hidden = true; return; }
        host2d.style.visibility = 'hidden';
      } else {
        RENDER3D.disable();
        host3d.hidden = true;
        host2d.style.visibility = 'visible';
      }
      hint.hidden = !three;
      b2d.classList.toggle('active', !three);
      b3d.classList.toggle('active', three);
    }
    b2d.addEventListener('click', function () { setView(false); });
    b3d.addEventListener('click', function () { setView(true); });

    /* ---- misuse attack -------------------------------------------------- */
    document.getElementById('btn-misuse').addEventListener('click', function () {
      const out = SCENARIOS.misuseAttack(8);
      const refused = out.filter(function (r) { return r.state === 'refused'; }).length;
      document.getElementById('rq-note').textContent =
        'DEVICE-7 fired ' + out.length + ' requests. ' + refused +
        ' refused outright, and every attempt is logged against that source. ' +
        'Nothing here depends on trusting what the requester says about itself.';
    });

    /* ---- the QUBO panel -------------------------------------------------- */
    document.getElementById('btn-qubo').addEventListener('click', function () {
      const r = QUANTUM.solve();
      const host = document.getElementById('qubo-out');
      const agree = JSON.stringify(r.solution) === JSON.stringify(r.greedy);
      host.innerHTML =
        '<div class="qrow"><span>variables</span><b>' + r.variables + ' binary</b></div>' +
        '<div class="qrow"><span>search space</span><b>2^' + r.variables + ' = ' +
          r.bruteForceStates + ' states</b></div>' +
        '<div class="qrow"><span>annealed energy</span><b>' + r.energy.toFixed(2) + '</b></div>' +
        '<div class="qrow"><span>exact optimum</span><b>' +
          (r.exactEnergy === null ? 'n/a' : r.exactEnergy.toFixed(2)) + '</b></div>' +
        '<div class="qrow ' + (r.matchedOptimum ? 'good' : 'bad') + '"><span>annealer found it?</span><b>' +
          (r.matchedOptimum ? 'yes' : 'no') + '</b></div>' +
        '<div class="qrow"><span>time</span><b>' + r.annealMs.toFixed(1) + ' ms anneal · ' +
          r.bruteForceMs.toFixed(1) + ' ms exact</b></div>' +
        '<div class="qsol">' + Object.keys(r.solution).map(function (id) {
            return id + '&rarr;' + r.solution[id];
          }).join(' &nbsp; ') + '</div>' +
        '<p class="hint">' + (agree
            ? 'Here it agrees with the one-junction-at-a-time answer. It stops agreeing when serving a neighbour matters more than serving yourself.'
            : 'Note this differs from the greedy per-junction answer: ' +
              Object.keys(r.greedy).map(function (id) { return id + '&rarr;' + r.greedy[id]; }).join(' ') +
              '. That difference is the coordination term.') +
        '</p>' +
        '<button id="btn-qubo-apply" class="wide-btn" type="button">APPLY THIS SOLUTION</button>';
      document.getElementById('btn-qubo-apply').addEventListener('click', function () {
        const n = QUANTUM.apply(r.solution);
        document.getElementById('qubo-out').insertAdjacentHTML('beforeend',
          '<p class="hint">Applied: ' + n + ' junction' + (n === 1 ? '' : 's') +
          ' asked to switch, through the same safety-checked function as every other controller.</p>');
      });
    });

    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space') { e.preventDefault(); pause.click(); }
    });
  }
})();
