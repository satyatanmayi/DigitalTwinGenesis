/* =============================================================================
 * render.js — THE ONLY FILE THAT DRAWS ANYTHING.
 *
 * It reads simulation state (SIM), sensor snapshots (SENSOR_FEED) and AI
 * decisions (AGENT) and paints them. It never mutates simulation state; the
 * only writes it performs are the user controls (pause, traffic load, mode,
 * incident injection), which go through the public SIM / SENSOR_FEED setters.
 *
 * SWAPPING TO 3D: replace this file with a Three.js renderer that reads the
 * same SIM.junctions / SIM.vehicles / AGENT.decisions data. sim.js, agent.js,
 * sensorFeed.js and coordinator.js stay untouched.
 * ========================================================================== */

(function () {
  'use strict';

  const C = {
    bg:        '#0b0e14',
    grid:      '#141a26',
    road:      '#3a4150',
    roadEdge:  '#4a5364',
    dash:      '#7b8798',
    junction:  '#454e60',
    vehicle:   '#22d3ee',
    vehicleQ:  '#0e7490',
    stopLine:  '#93a2b8',
    label:     '#e8eef7',
    labelBg:   'rgba(19,24,34,0.92)',
    labelEdge: '#22d3ee',
    heurEdge:  '#93a2b8',
    errEdge:   '#ef4444',
    red:       '#ef4444',
    yellow:    '#facc15',
    green:     '#22c55e',
    dimText:   '#93a2b8',
    incident:  '#fb923c'
  };

  const G = SIM.GEOM;
  const W = G.world.w, H = G.world.h;

  let scaleFactor = 1, offX = 0, offY = 0;
  let frameCount2 = 0;

  /* ------------------------------------------------------------------ setup */
  window.setup = function () {
    const host = document.getElementById('canvas-host');
    const cnv = createCanvas(host.clientWidth, host.clientHeight);
    cnv.parent(host);
    textFont('Segoe UI');
    wireControls();
    SIM.start();
  };

  window.windowResized = function () {
    const host = document.getElementById('canvas-host');
    resizeCanvas(host.clientWidth, host.clientHeight);
  };

  function computeTransform() {
    const pad = 26;
    scaleFactor = Math.min((width - pad * 2) / W, (height - pad * 2) / H);
    offX = (width - W * scaleFactor) / 2;
    offY = (height - H * scaleFactor) / 2;
  }

  /* ------------------------------------------------------------------- draw */
  window.draw = function () {
    background(C.bg);
    computeTransform();

    push();
    translate(offX, offY);
    scale(scaleFactor);

    drawBackdrop();
    drawRoads();
    drawJunctions();
    drawSignals();
    drawVehicles();
    drawJunctionLabels();

    pop();

    if (SIM.isPaused()) drawPausedBanner();

    frameCount2++;
    if (frameCount2 % 6 === 0) updateSidebar();
  };

  function drawBackdrop() {
    noStroke();
    fill(C.grid);
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

    // Lane divider dashes.
    fill(C.dash);
    for (const y of G.rows) {
      for (let x = 0; x < W; x += 44) {
        if (nearAnyJunctionAxis(x, G.cols)) continue;
        rect(x, y - 1.5, 22, 3);
      }
    }
    for (const x of G.cols) {
      for (let y = 0; y < H; y += 44) {
        if (nearAnyJunctionAxis(y, G.rows)) continue;
        rect(x - 1.5, y, 3, 22);
      }
    }
  }

  function nearAnyJunctionAxis(v, axisList) {
    for (const a of axisList) if (Math.abs(v - a) < G.junctionHalf + 20) return true;
    return false;
  }

  function drawJunctions() {
    rectMode(CENTER);
    for (const j of SIM.junctions) {
      noStroke();
      fill(C.junction);
      rect(j.x, j.y, G.junctionHalf * 2, G.junctionHalf * 2, 4);

      if (SENSOR_FEED.incidentActive(j.id)) {
        noFill();
        stroke(C.incident);
        strokeWeight(3);
        rect(j.x, j.y, G.junctionHalf * 2 + 14, G.junctionHalf * 2 + 14, 6);
      }
    }
    rectMode(CORNER);

    // Stop bars on each approach.
    noStroke();
    fill(C.stopLine);
    for (const j of SIM.junctions) {
      const d = G.junctionHalf + 3;
      const lo = G.laneOffset;
      rect(j.x - lo - 10, j.y - d - 3, 20, 3);   // north approach (traffic heading south)
      rect(j.x + lo - 10, j.y + d, 20, 3);       // south approach
      rect(j.x + d, j.y - lo - 10, 3, 20);       // east approach
      rect(j.x - d - 3, j.y + lo - 10, 3, 20);   // west approach
    }
  }

  /* Signal head per approach, coloured for the movement that approach gets. */
  function drawSignals() {
    const d = G.junctionHalf + 20;
    for (const j of SIM.junctions) {
      // Approach N holds traffic travelling south, and so on.
      signalHead(j.x - G.laneOffset - 22, j.y - d, SIM.signalFor(j, 'S'));
      signalHead(j.x + G.laneOffset + 22, j.y + d, SIM.signalFor(j, 'N'));
      signalHead(j.x + d, j.y - G.laneOffset - 22, SIM.signalFor(j, 'W'));
      signalHead(j.x - d, j.y + G.laneOffset + 22, SIM.signalFor(j, 'E'));
    }
  }

  function signalHead(x, y, state) {
    const col = state === 'green' ? C.green : (state === 'yellow' ? C.yellow : C.red);
    noStroke();
    fill('#0d1220');
    ellipse(x, y, 20, 20);
    fill(col);
    ellipse(x, y, 14, 14);
    // Soft halo so the signal reads from the back of a room.
    fill(red(color(col)), green(color(col)), blue(color(col)), 55);
    ellipse(x, y, 26, 26);
  }

  function drawVehicles() {
    rectMode(CENTER);
    noStroke();
    for (const v of SIM.vehicles) {
      const moving = v.speed > 25;
      fill(moving ? C.vehicle : C.vehicleQ);
      push();
      translate(v.x, v.y);
      if (v.dir === 'N' || v.dir === 'S') rotate(HALF_PI);
      rect(0, 0, G.vehicleLen, G.vehicleWidth, 3);
      pop();
    }
    rectMode(CORNER);
  }

  /* Live AI reasoning, floating next to each junction. */
  function drawJunctionLabels() {
    const boxW = 250;
    for (const j of SIM.junctions) {
      const outX = (j.x < W / 2) ? -1 : 1;
      const outY = (j.y < H / 2) ? -1 : 1;

      const lines = wrapText(j.lastReason || '', boxW - 20, 15);
      const boxH = 28 + lines.length * 18;

      const bx = j.x + outX * 84 - (outX < 0 ? boxW : 0);
      const by = (outY < 0) ? (j.y - 72 - boxH) : (j.y + 72);

      const edge = j.lastSource === 'gemini' ? C.labelEdge
        : (j.lastSource === 'error' ? C.errEdge : C.heurEdge);

      noStroke();
      fill(C.labelBg);
      rect(bx, by, boxW, boxH, 7);
      fill(edge);
      rect(bx, by, 4, boxH, 3);

      textSize(13);
      textStyle(BOLD);
      fill(edge);
      text(j.id + '  ' + (j.lastAction ? j.lastAction.toUpperCase() : 'STANDBY'), bx + 13, by + 17);

      textStyle(NORMAL);
      textSize(15);
      fill(C.label);
      for (let i = 0; i < lines.length; i++) {
        text(lines[i], bx + 13, by + 36 + i * 18);
      }
    }
  }

  function wrapText(str, maxW, size) {
    textSize(size);
    const words = String(str).split(' ');
    const lines = [];
    let line = '';
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
    noStroke();
    fill(11, 14, 20, 170);
    rect(0, 0, width, height);
    fill('#e8eef7');
    textSize(46);
    textStyle(BOLD);
    textAlign(CENTER, CENTER);
    text('PAUSED', width / 2, height / 2);
    textAlign(LEFT, BASELINE);
    textStyle(NORMAL);
  }

  /* ---------------------------------------------------------------- sidebar */
  let cardsBuilt = false;

  function buildCards() {
    const host = document.getElementById('junction-cards');
    host.innerHTML = '';
    for (const j of SIM.junctions) {
      const card = document.createElement('div');
      card.className = 'jcard';
      card.id = 'card-' + j.id;
      let rows = '';
      for (const d of SIM.DIRS) {
        rows += '<div class="qrow"><span>' + d + '</span>' +
          '<span class="qbar-track"><span class="qbar-fill" id="q-' + j.id + '-' + d + '" style="width:0%"></span></span>' +
          '<span class="qval" id="qv-' + j.id + '-' + d + '">0</span></div>';
      }
      card.innerHTML =
        '<div class="jcard-head"><span class="jcard-id">' + j.id + '</span>' +
        '<span class="jcard-phase" id="phase-' + j.id + '">NS</span></div>' + rows;
      host.appendChild(card);
    }
    cardsBuilt = true;
  }

  let lastLogLength = -1;

  function updateSidebar() {
    if (!cardsBuilt) {
      if (!SIM.junctions.length) return;
      buildCards();
    }

    for (const j of SIM.junctions) {
      for (const d of SIM.DIRS) {
        const q = j.queues[d];
        const bar = document.getElementById('q-' + j.id + '-' + d);
        const val = document.getElementById('qv-' + j.id + '-' + d);
        if (!bar) continue;
        bar.style.width = Math.min(100, q * 14) + '%';
        bar.className = 'qbar-fill' + (q >= 6 ? ' crit' : (q >= 4 ? ' hot' : ''));
        val.textContent = q;
      }
      const ph = document.getElementById('phase-' + j.id);
      ph.textContent = j.phase + ' ' + (j.state === 'green' ? 'GO' : 'AMB');
      ph.className = 'jcard-phase ' + (j.state === 'green' ? 'phase-green' : 'phase-yellow');
      document.getElementById('card-' + j.id).className =
        'jcard' + (SENSOR_FEED.incidentActive(j.id) ? ' incident' : '');
    }

    // Decision log: last 6, newest on top.
    if (AGENT.decisions.length !== lastLogLength) {
      lastLogLength = AGENT.decisions.length;
      const host = document.getElementById('decision-log');
      host.innerHTML = '';
      for (let i = 0; i < Math.min(6, AGENT.decisions.length); i++) {
        const d = AGENT.decisions[i];
        const el = document.createElement('div');
        el.className = 'dec ' + (d.source === 'gemini' ? '' : d.source);
        const meta = d.source === 'gemini' ? (d.latencyMs + 'ms')
          : (d.source === 'heuristic' ? 'HEURISTIC' : 'FALLBACK');
        el.innerHTML =
          '<div class="dec-head"><span class="dec-j">' + d.junctionId + '</span>' +
          '<span class="dec-action">' + d.action + '</span>' +
          '<span class="dec-meta">' + meta + '</span></div>' +
          '<div class="dec-reason">' + escapeHtml(d.reason) + '</div>';
        host.appendChild(el);
      }
    }

    // Aggregate stats.
    document.getElementById('stat-processed').textContent = SIM.stats.processed;
    document.getElementById('stat-wait').textContent = SIM.avgWait().toFixed(1) + 's';
    document.getElementById('stat-active').textContent = SIM.vehicles.length;
    document.getElementById('stat-latency').textContent =
      AGENT.stats.calls ? AGENT.stats.avgLatencyMs + 'ms' : '—';

    // Mode comparison.
    const ai = SIM.stats.byMode.ai, fx = SIM.stats.byMode.fixed;
    const aiWait = ai.processed ? ai.waitSum / ai.processed : null;
    const fxWait = fx.processed ? fx.waitSum / fx.processed : null;
    document.getElementById('wait-ai').textContent = aiWait === null ? '—' : aiWait.toFixed(1) + 's';
    document.getElementById('wait-fixed').textContent = fxWait === null ? '—' : fxWait.toFixed(1) + 's';
    document.getElementById('count-ai').textContent = ai.processed;
    document.getElementById('count-fixed').textContent = fx.processed;

    const delta = document.getElementById('delta-line');
    if (aiWait !== null && fxWait !== null && ai.processed > 5 && fx.processed > 5) {
      const pct = ((fxWait - aiWait) / fxWait) * 100;
      if (pct >= 0) {
        delta.className = 'delta good';
        delta.textContent = 'AI control cuts average wait by ' + pct.toFixed(0) + '%.';
      } else {
        delta.className = 'delta bad';
        delta.textContent = 'AI control is ' + Math.abs(pct).toFixed(0) + '% slower so far.';
      }
    } else {
      delta.className = 'delta';
      delta.textContent = 'Run both modes to compare.';
    }

    const note = document.getElementById('source-note');
    if (AGENT.hasKey()) {
      note.className = 'source-note live';
      note.textContent = 'Controller: ' + AGENT.MODEL + ' · ' +
        AGENT.stats.calls + ' calls · ' + AGENT.stats.errors + ' errors';
    } else {
      note.className = 'source-note';
      note.textContent = 'Controller: heuristic fallback (no API key in config.js)';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------------------------------------------------------- controls */
  function wireControls() {
    document.getElementById('model-name').textContent = AGENT.MODEL;

    const btnAI = document.getElementById('btn-ai');
    const btnFixed = document.getElementById('btn-fixed');
    const capMode = document.getElementById('cap-mode');

    btnAI.addEventListener('click', function () {
      SIM.setControlMode('ai');
      btnAI.classList.add('active');
      btnFixed.classList.remove('active');
      capMode.textContent = 'GEMINI AI CONTROL';
    });
    btnFixed.addEventListener('click', function () {
      SIM.setControlMode('fixed');
      btnFixed.classList.add('active');
      btnAI.classList.remove('active');
      capMode.textContent = 'FIXED TIMER BASELINE';
    });

    const btnPause = document.getElementById('btn-pause');
    btnPause.addEventListener('click', function () {
      const next = !SIM.isPaused();
      SIM.setPaused(next);
      btnPause.textContent = next ? 'RESUME' : 'PAUSE';
      btnPause.classList.toggle('on', next);
    });

    document.getElementById('btn-incident').addEventListener('click', function () {
      const id = document.getElementById('incident-target').value;
      SENSOR_FEED.injectIncident(id, 25);
    });

    const slider = document.getElementById('spawn-rate');
    const out = document.getElementById('spawn-rate-out');
    slider.addEventListener('input', function () {
      const v = parseFloat(slider.value);
      SIM.setSpawnRate(v);
      out.textContent = v.toFixed(1) + 'x';
    });

    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space') { e.preventDefault(); btnPause.click(); }
    });
  }
})();
