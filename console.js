/* =============================================================================
 * console.js — the control room.
 *
 * Subscribes to the street (index.html) over LINK, and turns what it sees into
 * decisions a person has to make. It contains no traffic physics: everything it
 * knows arrives as a state message, and everything it does leaves as a command.
 *
 * THE LOOP THIS SCREEN EXISTS FOR
 *   1. WATCH   — mirror the network, quietly, while nothing needs anyone.
 *   2. WARN    — when the street predicts two priority requests converging on
 *                one junction, raise an alert with a countdown, BEFORE either
 *                vehicle arrives.
 *   3. OPTIONS — show what each choice is predicted to cost, and mark the one
 *                the numbers favour.
 *   4. ACT     — the operator picks; the command goes to the street.
 *   5. RECORD  — every decision is logged with its reason, and the measured
 *                outcome is written next to the prediction when it arrives.
 *
 * A note on honesty, which is also on screen: option costs are PREDICTIONS made
 * from the junction as it stands. The ledger afterwards is a MEASUREMENT. The
 * two are never mixed.
 * ========================================================================== */

(function () {
  'use strict';

  const el = (id) => document.getElementById(id);

  let state = null;             // latest snapshot from the street
  let lastSeen = 0;             // wall clock of the last message
  let decided = {};             // conflict key -> the choice already made
  const logEntries = [];        // newest first

  /* ------------------------------------------------------------------ link */
  el('link-state').textContent = LINK.available()
    ? 'waiting for the street…'
    : 'no channel — open index.html in another window';

  LINK.on(function (msg) {
    if (msg.type === 'state') {
      state = msg.payload;
      lastSeen = Date.now();
      render();
    }
  });

  setInterval(function () {
    const live = Date.now() - lastSeen < 2500;
    el('link-dot').classList.toggle('live', live);
    el('link-state').textContent = live
      ? 'live via ' + LINK.transport()
      : (state ? 'street not responding' : 'open index.html in another window');
  }, 800);

  /* ---------------------------------------------------------------- options
   * For a two-request conflict there are exactly three things a person can do,
   * and all three are priced. Doing nothing is a real choice, so it is on the
   * screen with its consequences, not left as the absence of a choice.
   */
  function optionsFor(conflict) {
    const a = conflict.a, b = conflict.b;
    const first = (x, other) => ({
      key: 'grant:' + x.id,
      title: 'Serve ' + x.id + ' first',
      why: x.severity + ', ' + x.verification + ', arriving in ' + x.etaSec + 's on the ' +
           x.axis + ' axis. ' + other.id + ' waits for the corridor to clear.',
      saved: x.predictedSaved,
      cost: x.predictedCost,
      score: x.score,
      command: { action: 'grant', requestId: x.id }
    });

    const wait = {
      key: 'hold',
      title: 'Serve neither yet',
      why: 'Both wait for the ordinary signal cycle. Nothing is taken from cross ' +
           'traffic, and neither vehicle gets help.',
      saved: 0,
      cost: 0,
      score: null,
      command: { action: 'holdBoth' }
    };

    const opts = [first(a, b), first(b, a), wait];
    // The recommendation is simply the best benefit-to-cost ratio, and the
    // screen says that is what it is.
    let best = null;
    for (const o of opts) {
      if (o.score === null) continue;
      if (!best || o.score > best.score) best = o;
    }
    for (const o of opts) o.best = (o === best);
    return opts;
  }

  function renderAlert() {
    const alertBox = el('alert');
    const calm = el('calm');
    const conflicts = (state && state.conflicts) || [];

    // Only alert on conflicts that have not already been decided.
    const live = conflicts.filter(function (c) {
      return !decided[c.a.id + '|' + c.b.id];
    });

    if (!live.length) {
      alertBox.classList.add('hidden');
      calm.classList.remove('hidden');
      return;
    }

    const c = live[0];
    calm.classList.add('hidden');
    alertBox.classList.remove('hidden');
    alertBox.classList.toggle('critical', c.inSec <= 8);

    el('alert-tag').textContent = c.inSec <= 8 ? 'DECISION NEEDED NOW' : 'CONFLICT PREDICTED';
    el('alert-count').textContent = 'in ' + c.inSec + 's';
    el('alert-title').textContent =
      c.a.id + ' and ' + c.b.id + ' both need ' + c.junction + ', on opposite phases';
    el('alert-sub').textContent =
      'Only one can be served. Choose, or the arbitration rules choose for you.';

    const host = el('options');
    host.innerHTML = '';
    for (const o of optionsFor(c)) {
      const card = document.createElement('div');
      card.className = 'option' + (o.best ? ' best' : '');
      card.innerHTML =
        (o.best ? '<span class="badge">BEST RATIO</span>' : '') +
        '<h3>' + esc(o.title) + '</h3>' +
        '<p class="why">' + esc(o.why) + '</p>' +
        '<div class="nums">' +
          '<div><b>' + (o.saved === null ? '—' : o.saved + 's') + '</b><span>PREDICTED SAVING</span></div>' +
          '<div><b>' + (o.cost === null ? '—' : o.cost) + '</b><span>VEH-SEC COST</span></div>' +
        '</div>' +
        '<button type="button">CHOOSE</button>';
      card.querySelector('button').addEventListener('click', function () {
        decided[c.a.id + '|' + c.b.id] = o.key;
        LINK.send('command', o.command);
        addLog('operator', 'Operator chose: ' + o.title + '. Predicted ' +
               (o.saved || 0) + 's saved for ' + (o.cost || 0) + ' vehicle-seconds.');
        // The other request is explicitly refused only when one was granted.
        if (o.command.action === 'grant') {
          const loser = (o.command.requestId === c.a.id) ? c.b.id : c.a.id;
          addLog('queued', loser + ' waits for the corridor to clear.');
        }
        renderAlert();
      });
      host.appendChild(card);
    }
  }

  /* -------------------------------------------------------------- the network */
  function renderJunctions() {
    const host = el('junctions');
    if (!state) { host.innerHTML = '<p class="empty">Waiting for the street.</p>'; return; }
    host.innerHTML = '';
    for (const j of state.junctions) {
      const div = document.createElement('div');
      div.className = 'jn' + (j.heldFor ? ' held' : '') + (j.blocked ? ' blocked' : '');
      const phaseClass = j.state === 'green' ? 'ph-green' : (j.state === 'yellow' ? 'ph-yellow' : 'ph-red');
      let arms = '';
      for (const d of ['N', 'S', 'E', 'W']) {
        const q = j.queues[d];
        const cls = q >= 10 ? ' crit' : (q >= 6 ? ' hot' : '');
        arms += '<div class="arm"><span>' + d + '</span>' +
                '<span class="bar-track"><span class="bar-fill' + cls +
                '" style="width:' + Math.min(100, q * 9) + '%"></span></span>' +
                '<b>' + q + '</b></div>';
      }
      const note = j.blocked
        ? 'Approach ' + j.blocked + ' is blocked and cannot discharge.'
        : (j.heldFor ? 'Held green for ' + j.heldFor + '.' : esc(j.reason || ''));
      div.innerHTML =
        '<div class="jn-head"><span class="jn-id">' + j.id + '</span>' +
        '<span class="jn-phase ' + phaseClass + '">' + j.phase + ' ' +
        (j.state === 'green' ? 'GO' : j.state === 'yellow' ? 'AMBER' : 'RED') + '</span></div>' +
        arms +
        '<p class="jn-note">' + note + '</p>';
      host.appendChild(div);
    }
  }

  function renderRequests() {
    const host = el('requests');
    const reqs = (state && state.requests) || [];
    if (!reqs.length) { host.innerHTML = '<p class="empty">No requests.</p>'; return; }
    host.innerHTML = '';
    for (let i = reqs.length - 1; i >= 0; i--) {
      const r = reqs[i];
      const div = document.createElement('div');
      div.className = 'req ' + r.state;
      let nums = '';
      if (r.actual) {
        nums = 'Measured: saved ' + r.actual.saved + 's, cross traffic paid ' +
               r.actual.cost + ' vehicle-seconds.';
      } else if (r.predictedSaved !== null) {
        nums = 'Predicted: ' + r.predictedSaved + 's saved for ' + r.predictedCost +
               ' vehicle-seconds. Score ' + r.score + '.';
      }
      div.innerHTML =
        '<div class="req-head"><b>' + r.id + '</b>' +
        '<span>' + r.severity + ' · ' + r.verification + ' · ' + r.axis + '</span>' +
        '<span class="state">' + r.state.toUpperCase() + '</span></div>' +
        (r.reason ? '<div class="req-why">' + esc(r.reason) + '</div>' : '') +
        (nums ? '<div class="req-nums">' + esc(nums) + '</div>' : '');
      host.appendChild(div);
    }
  }

  /* --------------------------------------------------------------------- log */
  function addLog(kind, text) {
    logEntries.unshift({ kind: kind, text: text, at: new Date() });
    if (logEntries.length > 60) logEntries.length = 60;
    renderLog();
  }

  function renderLog() {
    const host = el('log');
    if (!logEntries.length) { host.innerHTML = '<p class="empty">Nothing yet.</p>'; return; }
    host.innerHTML = '';
    for (const e of logEntries) {
      const div = document.createElement('div');
      div.className = 'entry ' + e.kind;
      div.innerHTML = '<time>' + e.at.toLocaleTimeString() + '</time>' + esc(e.text);
      host.appendChild(div);
    }
  }

  /* ---------------------------------------------- watch the street for events */
  let seenRequests = {};
  let seenLedger = {};

  function watchForEvents() {
    if (!state) return;
    for (const r of state.requests) {
      const prev = seenRequests[r.id];
      if (prev !== r.state) {
        seenRequests[r.id] = r.state;
        if (r.state === 'granted') addLog('granted', r.id + ' granted. ' + (r.workings || ''));
        else if (r.state === 'queued') addLog('queued', r.id + ' queued. ' + (r.reason || ''));
        else if (r.state === 'refused') addLog('refused', r.id + ' refused. ' + (r.reason || ''));
      }
      if (r.actual && !seenLedger[r.id]) {
        seenLedger[r.id] = true;
        addLog('granted', r.id + ' complete — measured ' + r.actual.saved +
               's saved against ' + r.actual.cost + ' vehicle-seconds paid by cross traffic. ' +
               'Predicted ' + r.predictedSaved + 's for ' + r.predictedCost + '.');
      }
    }
  }

  /* ------------------------------------------------------------------ render */
  function render() {
    if (state) {
      el('k-delay').textContent = state.avgDelay + 's';
      el('k-queue').textContent = state.totalQueue;
      el('k-onroad').textContent = state.onRoad;
      const m = Math.floor(state.clock / 60), s = state.clock % 60;
      el('k-clock').textContent = m + ':' + String(s).padStart(2, '0');

      document.querySelectorAll('.chip[data-mode]').forEach(function (b) {
        b.classList.toggle('active', b.dataset.mode === state.controller);
      });
    }
    watchForEvents();
    renderAlert();
    renderJunctions();
    renderRequests();
  }

  /* ------------------------------------------------------------------ tools */
  const ns = el('t-ns'), ew = el('t-ew');
  ns.addEventListener('input', () => el('t-ns-out').textContent = ns.value + 's');
  ew.addEventListener('input', () => el('t-ew-out').textContent = ew.value + 's');

  el('t-apply').addEventListener('click', function () {
    const junction = el('t-junction').value;
    LINK.send('command', {
      action: 'setPlan', junction: junction,
      plan: { greenNS: +ns.value, greenEW: +ew.value }
    });
    addLog('operator', 'Sent ' + junction + ' a new plan: ' + ns.value + 's north-south, ' +
           ew.value + 's east-west.');
  });

  document.querySelectorAll('.chip[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      LINK.send('command', { action: 'controller', mode: b.dataset.mode });
      addLog('operator', 'Switched control to ' + b.textContent + '.');
    });
  });

  document.querySelectorAll('.chip[data-scenario]').forEach(function (b) {
    b.addEventListener('click', function () {
      LINK.send('command', { action: 'scenario', name: b.dataset.scenario });
      addLog('operator', 'Rehearsing: ' + b.textContent + '.');
      if (b.dataset.scenario === 'normal') decided = {};
    });
  });

  el('btn-help').addEventListener('click', () => el('help').classList.remove('hidden'));
  el('help-close').addEventListener('click', () => el('help').classList.add('hidden'));
  if (!localStorage.getItem('dtg-console-seen')) {
    el('help').classList.remove('hidden');
    try { localStorage.setItem('dtg-console-seen', '1'); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  render();
})();
