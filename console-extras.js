/* =============================================================================
 * console-extras.js — the control room's backdrop, its charts, and its alarm.
 *
 * Split out of console.js on purpose. console.js is the decision logic: what
 * the operator is told and what their clicks do. This file is presentation and
 * sensation only - it reads the same published state and never sends a command.
 *
 * THREE THINGS
 *   BACKDROP  a dim 3D lattice behind the glass panels. It carries no data.
 *             An operator screen must never make you read a decoration, so it
 *             is deliberately slow, low contrast, and identical whatever the
 *             traffic is doing.
 *   ANALYTICS two gauges and two sparklines. The instantaneous number cannot
 *             tell you whether 26 seconds of delay is climbing or recovering,
 *             and that is the thing an operator acts on.
 *   ALARM     a real sound, synthesised - no audio file to ship or fail to
 *             load. Browsers refuse to make noise before a user gesture, so it
 *             arms on the first click and says so until then.
 *
 * NO simulation and NO commands in this file.
 * ========================================================================== */

const CONSOLE_EXTRAS = (function () {
  'use strict';

  const el = (id) => document.getElementById(id);

  /* ================================================================ backdrop */
  function startBackdrop() {
    const canvas = el('bg3d');
    if (!canvas || typeof THREE === 'undefined') return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      return;                       // no WebGL: the glass just sits on flat colour
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    camera.position.set(0, 26, 48);
    camera.lookAt(0, 0, 0);

    // A road lattice, not a starfield: it should read as a city from above.
    const grid = new THREE.Group();
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x22D3EE, transparent: true, opacity: 0.16
    });
    for (let i = -6; i <= 6; i++) {
      for (const axis of ['x', 'z']) {
        const g = new THREE.BufferGeometry().setFromPoints(
          axis === 'x'
            ? [new THREE.Vector3(-60, 0, i * 10), new THREE.Vector3(60, 0, i * 10)]
            : [new THREE.Vector3(i * 10, 0, -60), new THREE.Vector3(i * 10, 0, 60)]
        );
        grid.add(new THREE.Line(g, lineMat));
      }
    }
    scene.add(grid);

    // A few blocks so the plane has depth, and a scatter of slow "vehicles".
    const blockMat = new THREE.MeshBasicMaterial({
      color: 0x1B2430, transparent: true, opacity: 0.55
    });
    for (let i = 0; i < 26; i++) {
      const h = 2 + Math.random() * 9;
      const b = new THREE.Mesh(new THREE.BoxGeometry(5, h, 5), blockMat);
      b.position.set((Math.floor(Math.random() * 12) - 6) * 10 + 5, h / 2,
                     (Math.floor(Math.random() * 12) - 6) * 10 + 5);
      scene.add(b);
    }

    const dots = [];
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x67E8F9, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 30; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.9), dotMat);
      const lane = (Math.floor(Math.random() * 13) - 6) * 10;
      const along = Math.random() * 120 - 60;
      const horizontal = Math.random() < 0.5;
      d.position.set(horizontal ? along : lane, 0.4, horizontal ? lane : along);
      dots.push({ mesh: d, horizontal: horizontal, speed: 3 + Math.random() * 5 });
      scene.add(d);
    }

    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    let last = performance.now();
    (function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      grid.rotation.y += dt * 0.012;          // slow enough to be ignorable
      for (const d of dots) {
        const p = d.mesh.position;
        if (d.horizontal) { p.x += d.speed * dt; if (p.x > 62) p.x = -62; }
        else { p.z += d.speed * dt; if (p.z > 62) p.z = -62; }
      }
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    })(last);
  }

  /* =============================================================== the alarm
   * Synthesised, so there is no audio file to ship, cache-bust or 404. Two
   * alternating tones - the interval is what makes a sound read as "attend to
   * me" rather than "something happened".
   *
   * Browsers will not make noise before the user has interacted with the page,
   * and silently failing would be worse than not having it, so the state is on
   * screen until it is armed.
   */
  let audio = null, armed = false, lastAlarmAt = 0;

  function armAudio() {
    if (armed) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audio = new Ctx();
      if (audio.state === 'suspended') audio.resume();
      armed = true;
      const b = el('sound-state');
      if (b) { b.textContent = 'SOUND ON'; b.classList.add('on'); }
    } catch (e) { /* no audio on this machine; the screen still works */ }
  }

  /** Two-tone, twice. Roughly a European ambulance, deliberately short. */
  function alarm(urgent) {
    if (!armed || !audio) return;
    const now = audio.currentTime;
    const pair = urgent ? [740, 988] : [523, 659];
    for (let i = 0; i < 4; i++) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.value = pair[i % 2];
      // Shaped, not clicked: a square edge on a gain node is an audible pop.
      const t0 = now + i * 0.26;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(urgent ? 0.16 : 0.09, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
      osc.connect(gain); gain.connect(audio.destination);
      osc.start(t0); osc.stop(t0 + 0.26);
    }
  }

  /** Ring at most once every few seconds, whatever the state says. */
  function alarmThrottled(urgent) {
    const now = Date.now();
    if (now - lastAlarmAt < 4000) return;
    lastAlarmAt = now;
    alarm(urgent);
  }

  /* ============================================================== analytics */
  function paintSpark(id, data, colour, opts) {
    const c = el(id);
    if (!c) return;
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    if (!data || data.length < 2) return;

    const max = Math.max(opts && opts.floor || 1, ...data);
    const step = w / (data.length - 1);
    const y = (v) => h - 4 - (v / max) * (h - 10);

    // Area first, line on top: the fill is what makes a 52px strip readable.
    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((v, i) => ctx.lineTo(i * step, y(v)));
    ctx.lineTo(w, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, colour + '55');
    grad.addColorStop(1, colour + '00');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    data.forEach((v, i) => (i ? ctx.lineTo(i * step, y(v)) : ctx.moveTo(0, y(v))));
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    ctx.stroke();

    // The endpoint, so the eye lands on "now" rather than the whole shape.
    ctx.beginPath();
    ctx.arc(w - 1, y(data[data.length - 1]), 3, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  }

  function trend(data) {
    if (!data || data.length < 12) return { word: 'settling', dir: 0 };
    const half = Math.floor(data.length / 2);
    const older = data.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const newer = data.slice(half).reduce((a, b) => a + b, 0) / (data.length - half);
    const change = newer - older;
    const rel = older ? change / older : 0;
    if (rel > 0.12) return { word: 'getting worse', dir: 1 };
    if (rel < -0.12) return { word: 'recovering', dir: -1 };
    return { word: 'holding steady', dir: 0 };
  }

  function gauge(prefix, value, max, unit, bands) {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    const fill = el(prefix + '-fill');
    const v = el(prefix + '-v');
    const verdict = el(prefix + '-verdict');
    if (!fill || !v) return;
    fill.style.width = pct + '%';

    let band = bands[bands.length - 1];
    for (const b of bands) { if (value <= b.upTo) { band = b; break; } }
    fill.style.background = band.colour;
    v.textContent = (Math.round(value * 10) / 10) + unit;
    v.style.color = band.colour;
    if (verdict) verdict.textContent = band.label;
  }

  function renderAnalytics(state) {
    if (!state) return;
    const s = state.series || { delay: [], queue: [] };

    // Network load: queued vehicles against the budget the arbitration uses.
    const load = state.totalQueue || 0;
    gauge('g-load', load, 60, ' waiting', [
      { upTo: 18, colour: '#34D399', label: 'FLOWING' },
      { upTo: 34, colour: '#FBAF3F', label: 'BUSY' },
      { upTo: 1e9, colour: '#F87171', label: 'CONGESTED' }
    ]);

    // Delay against a 45s service level, which is the number a city would set.
    gauge('g-delay', state.avgDelay || 0, 90, 's', [
      { upTo: 25, colour: '#34D399', label: 'WITHIN TARGET' },
      { upTo: 45, colour: '#FBAF3F', label: 'AT THE LIMIT' },
      { upTo: 1e9, colour: '#F87171', label: 'OVER TARGET' }
    ]);

    paintSpark('c-delay', s.delay, '#22D3EE', { floor: 20 });
    paintSpark('c-queue', s.queue, '#FBAF3F', { floor: 10 });

    const dTrend = trend(s.delay), qTrend = trend(s.queue);
    if (el('s-delay')) el('s-delay').textContent = (state.avgDelay || 0).toFixed(1) + 's';
    if (el('s-queue')) el('s-queue').textContent = String(load);
    if (el('n-delay')) el('n-delay').textContent = 'last 90s — ' + dTrend.word;
    if (el('n-queue')) el('n-queue').textContent = 'last 90s — ' + qTrend.word;

    // Name the worst approach. "Something is wrong somewhere" is not operable.
    const host = el('worst');
    if (host) {
      let worst = null;
      for (const j of state.junctions || []) {
        for (const d of ['N', 'S', 'E', 'W']) {
          if (!worst || j.queues[d] > worst.q) worst = { id: j.id, dir: d, q: j.queues[d] };
        }
      }
      host.innerHTML = worst && worst.q > 0
        ? '<span>WORST APPROACH</span><b>' + worst.id + ' ' + worst.dir + '</b>' +
          '<i>' + worst.q + ' vehicles deep</i>'
        : '<span>WORST APPROACH</span><b>none</b><i>every approach is clear</i>';
    }
  }

  /* --------------------------------------------------- when to make a noise */
  let wasAlerting = false;
  function considerAlarm(state) {
    if (!state) return;
    const plan = state.plan;
    const planPending = !!(plan && plan.state === 'pending');
    const conflict = (state.conflicts || []).length > 0;
    const blocked = (state.blocked || []).length > 0;
    const alerting = planPending || conflict || blocked;

    // Ring on the EDGE, then repeat slowly while a decision is still open.
    // A continuous siren is what makes operators mute a system.
    if (alerting && !wasAlerting) alarmThrottled(planPending || conflict);
    else if (planPending && plan.secondsLeft <= 3) alarmThrottled(true);
    wasAlerting = alerting;
  }

  return {
    start: function () {
      startBackdrop();
      // Any click anywhere arms the audio - browsers require a gesture.
      window.addEventListener('pointerdown', armAudio, { once: false });
      const b = el('sound-state');
      if (b) b.addEventListener('click', armAudio);
    },
    onState: function (state) {
      renderAnalytics(state);
      considerAlarm(state);
    },
    test: function () { armAudio(); alarm(true); }
  };
})();

CONSOLE_EXTRAS.start();
