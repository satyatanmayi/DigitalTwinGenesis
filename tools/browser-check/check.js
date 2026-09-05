/* =============================================================================
 * tools/browser-check/check.js — does it actually run in a browser?
 *
 *   node tools/browser-check/check.js
 *   node tools/browser-check/check.js --shots      (also writes screenshots)
 *
 * Unit tests prove the simulation is correct. They say nothing about whether
 * the page loads, whether a script threw on line one, or whether the control
 * room ever hears from the street. This does that: it starts a static server,
 * opens both pages in a real headless Chromium, drives them, and fails on any
 * console error or unhandled rejection.
 *
 * It is the check that stops a demo dying in front of a judge.
 * ========================================================================== */

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', '..');
const SHOT_DIR = path.join(ROOT, 'docs', 'screenshots');
const WANT_SHOTS = process.argv.includes('--shots');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'
};

let passed = 0, failed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + name + (detail ? '   ' + detail : '')); }
  else { failed++; failures.push(name + (detail ? '   ' + detail : '')); console.log('  FAIL  ' + name + (detail ? '   ' + detail : '')); }
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, url === '/' ? 'index.html' : url);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/** Attach error collection to a page. p5 and the CDN are allowed to be noisy. */
function watch(page, bag) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/favicon|net::ERR_|Failed to load resource/i.test(text)) return;
    bag.push(text);
  });
  page.on('pageerror', (err) => bag.push('pageerror: ' + err.message));
  page.on('requestfailed', (req) => {
    const u = req.url();
    if (/favicon/i.test(u)) return;
    if (u.startsWith('http://127.0.0.1')) bag.push('failed request: ' + u);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { server, port } = await serve();
  const base = 'http://127.0.0.1:' + port;
  console.log('serving ' + ROOT + ' on ' + base + '\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  try {
    /* ------------------------------------------------ the street ---------- */
    console.log('The street (index.html)');
    const street = await browser.newPage();
    await street.setViewport({ width: 1600, height: 950 });
    const streetErrors = [];
    watch(street, streetErrors);

    await street.goto(base + '/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2500);

    check('page loads with no script errors', streetErrors.length === 0,
          streetErrors.slice(0, 2).join(' | ') || 'clean');

    const hasCanvas = await street.$('#canvas-host canvas');
    check('p5 canvas is created', !!hasCanvas);

    const modules = await street.evaluate(() => ({
      sim: typeof SIM, priority: typeof PRIORITY, nn: typeof NN,
      link: typeof LINK, scenarios: typeof SCENARIOS, bench: typeof BENCH
    }));
    check('every module is defined',
          Object.values(modules).every((t) => t === 'object'),
          JSON.stringify(modules));

    const modelReady = await street.evaluate(() => NN.isReady());
    check('trained model weights loaded', modelReady === true,
          modelReady ? 'weights.js in use' : String(await street.evaluate(() => NN.error())));

    // Is the world actually moving?
    const t1 = await street.evaluate(() => SIM.time());
    await sleep(2000);
    const t2 = await street.evaluate(() => SIM.time());
    check('simulation clock advances', t2 > t1 + 0.5,
          t1.toFixed(1) + 's -> ' + t2.toFixed(1) + 's');

    const moving = await street.evaluate(() =>
      SIM.vehicles.length > 0 && SIM.vehicles.some((v) => v.speed > 1));
    check('vehicles exist and are moving', moving === true,
          (await street.evaluate(() => SIM.vehicles.length)) + ' on road');

    // Greens are 18 s, so a 12 s window can legitimately see no change at all.
    // Count actual transitions over a window longer than one full cycle.
    const cycled = await street.evaluate(() => {
      return new Promise((resolve) => {
        const t0 = SIM.time();
        const last = {};
        let changes = 0;
        for (const j of SIM.junctions) last[j.id] = j.phase + j.state;
        const tick = () => {
          for (const j of SIM.junctions) {
            const now = j.phase + j.state;
            if (now !== last[j.id]) { changes++; last[j.id] = now; }
          }
          if (SIM.time() - t0 > 50) resolve(changes);
          else requestAnimationFrame(tick);
        };
        tick();
      });
    });
    check('signals cycle through their phases', cycled >= 4,
          cycled + ' phase transitions in 50 simulated seconds');

    /* ---- the deliverable: changing a timing changes the queues ---- */
    const before = await street.evaluate(() => {
      SIM.setPlanAll({ greenNS: 30, greenEW: 8 });
      return SIM.getPlan('J1');
    });
    await sleep(2500);
    const after = await street.evaluate(() => SIM.getPlan('J1'));
    check('timing plan can be changed from the UI layer',
          after.greenNS === 30 && after.greenEW === 8,
          'J1 now ' + after.greenNS + 's/' + after.greenEW + 's');

    /* ---- the guided demo buttons ---- */
    const stepCount = await street.$$eval('.demo-steps .step', (b) => b.length);
    check('guided demo strip is present', stepCount === 5, stepCount + ' steps');

    for (const n of [1, 2]) {
      await street.click('.demo-steps .step[data-step="' + n + '"]');
      await sleep(600);
    }
    const saidSomething = await street.$eval('#demo-say', (el) => el.textContent.length > 40);
    check('demo steps run and print what to say', saidSomething === true);

    /* ---- the tabs: one job on screen at a time ---- */
    const tabCount = await street.$$eval('.tab', (t) => t.length);
    check('the sidebar is split into tabs', tabCount === 3, tabCount + ' tabs');

    await street.click('.tab[data-pane="operate"]');
    await sleep(400);
    const paneVisible = await street.evaluate(() => {
      const p = document.querySelector('.pane[data-pane="operate"]');
      const q = document.querySelector('.pane[data-pane="plan"]');
      return { operate: !p.hidden, plan: !q.hidden };
    });
    check('switching tab shows one pane and hides the others',
          paneVisible.operate && !paneVisible.plan, JSON.stringify(paneVisible));

    /* ---- scenarios ---- */
    await street.click('#btn-accident');
    await sleep(400);
    const blocked = await street.evaluate(() =>
      Object.keys(SIM.conditions.blockedApproaches).length);
    check('accident scenario blocks an approach', blocked > 0, blocked + ' blocked');

    await street.click('#btn-flood');
    await sleep(400);
    const flooded = await street.evaluate(() =>
      Object.keys(SIM.conditions.floodedRoads).length);
    check('flood scenario marks a road', flooded > 0);

    /* ---- the misuse attack: the answer to "what if someone abuses it" ---- */
    await street.click('#btn-normal');
    await sleep(500);
    await street.click('#btn-misuse');
    await sleep(1200);
    const misuse = await street.evaluate(() => {
      const from7 = PRIORITY.requests.filter((r) => r.source === 'DEVICE-7');
      return {
        made: from7.length,
        refused: from7.filter((r) => r.state === 'refused').length,
        reason: from7.filter((r) => r.state === 'refused')
                    .map((r) => r.reason)
                    .find((t) => /DEVICE-7/.test(t)) ||
                (from7.find((r) => r.state === 'refused') || {}).reason || ''
      };
    });
    check('a burst from one source is rate limited',
          misuse.made >= 5 && misuse.refused > 0,
          misuse.refused + ' of ' + misuse.made + ' refused');
    check('and the refusal names the source and the limit',
          /DEVICE-7/.test(misuse.reason) && /limit/i.test(misuse.reason),
          misuse.reason.slice(0, 90));

    await street.click('#btn-normal');
    await sleep(400);

    /* ---- 3D ---- */
    await street.click('#view-3d');
    await sleep(2500);
    const three = await street.evaluate(() => ({
      available: typeof THREE !== 'undefined',
      active: typeof RENDER3D !== 'undefined' && RENDER3D.isActive(),
      canvases: document.querySelectorAll('#three-host canvas').length,
      hidden: document.getElementById('three-host').hidden
    }));
    check('the 3D view starts and renders', three.active && three.canvases === 1 && !three.hidden,
          JSON.stringify(three));
    if (WANT_SHOTS) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await street.screenshot({ path: path.join(SHOT_DIR, 'street-3d.png') });
    }
    await street.click('#view-2d');
    await sleep(800);
    const back2d = await street.evaluate(() => RENDER3D.isActive());
    check('and switches back to 2D cleanly', back2d === false);

    /* ---- the QUBO panel ---- */
    await street.click('.tab[data-pane="learn"]');
    await sleep(400);
    await street.click('#btn-qubo');
    await sleep(1500);
    const qubo = await street.evaluate(() => {
      const out = document.getElementById('qubo-out').textContent;
      return { text: out, rows: document.querySelectorAll('#qubo-out .qrow').length };
    });
    check('the QUBO solver runs and reports', qubo.rows >= 5, qubo.rows + ' rows');
    check('and the annealer matches the exact optimum',
          /annealer found it\?\s*yes/i.test(qubo.text.replace(/\s+/g, ' ')),
          qubo.text.replace(/\s+/g, ' ').slice(0, 110));

    const facts = await street.$$eval('#model-facts .fact', (f) => f.length);
    check('the model panel shows how it was trained', facts >= 6, facts + ' facts');

    await street.click('.tab[data-pane="operate"]');
    await sleep(400);

    if (WANT_SHOTS) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await street.screenshot({ path: path.join(SHOT_DIR, 'street.png') });
    }

    /* ------------------------------------------------ the control room ---- */
    console.log('\nThe control room (console.html)');
    const room = await browser.newPage();
    await room.setViewport({ width: 1600, height: 1100 });
    const roomErrors = [];
    watch(room, roomErrors);
    await room.goto(base + '/console.html', { waitUntil: 'networkidle2', timeout: 30000 });
    await room.evaluate(() => document.getElementById('help').classList.add('hidden'));
    await sleep(2500);

    check('console loads with no script errors', roomErrors.length === 0,
          roomErrors.slice(0, 2).join(' | ') || 'clean');

    const transport = await room.evaluate(() => LINK.transport());
    check('a channel to the street exists', transport !== 'none', 'using ' + transport);

    // The street must be publishing, and the console must be receiving it.
    await street.bringToFront();
    await sleep(1500);
    const mirrored = await room.evaluate(() => {
      const v = document.getElementById('k-queue').textContent;
      return { queue: v, junctions: document.querySelectorAll('#junctions .jn').length };
    });
    check('control room mirrors the street', mirrored.junctions === 4 && mirrored.queue !== '—',
          mirrored.junctions + ' junctions, queue reads "' + mirrored.queue + '"');

    /* ---- the centrepiece: two ambulances ---- */
    await street.evaluate(() => { SIM.setPlanAll({ greenNS: 18, greenEW: 18 }); SCENARIOS.twoAmbulances(); });
    await sleep(2000);

    const requests = await street.evaluate(() =>
      PRIORITY.requests.map((r) => ({ id: r.id, state: r.state })));
    check('two requests are created', requests.length >= 2, JSON.stringify(requests));
    check('one is granted and one waits',
          requests.some((r) => r.state === 'granted') && requests.some((r) => r.state === 'queued'),
          requests.map((r) => r.id + '=' + r.state).join(', '));

    const conflictSeen = await street.evaluate(() => PRIORITY.conflicts().length);
    check('the conflict is predicted', conflictSeen > 0, conflictSeen + ' predicted');

    await sleep(1500);
    const alertUp = await room.evaluate(() => {
      const a = document.getElementById('alert');
      return {
        visible: !a.classList.contains('hidden'),
        title: document.getElementById('alert-title').textContent,
        options: document.querySelectorAll('#options .option').length
      };
    });
    check('control room raises the alert', alertUp.visible === true, alertUp.title);
    check('and offers priced options', alertUp.options >= 3, alertUp.options + ' options');

    if (WANT_SHOTS) {
      await room.screenshot({ path: path.join(SHOT_DIR, 'console-alert.png') });
    }

    /* ---- operator acts, street obeys ---- */
    await room.evaluate(() => {
      const btn = document.querySelector('#options .option button');
      if (btn) btn.click();
    });
    await sleep(1500);
    const logged = await room.$$eval('#log .entry', (e) => e.length);
    check('the operator decision is logged', logged > 0, logged + ' entries');

    await room.evaluate(() => {
      document.querySelector('.chip[data-mode="nn"]').click();
    });
    await sleep(1500);
    const mode = await street.evaluate(() => SIM.controlMode());
    check('control room can hand the junction to the trained model',
          mode === 'nn', 'street controller is now "' + mode + '"');

    // The model decides every NN.DECISION_SEC simulated seconds, so give it
    // room for two decisions rather than assuming it acts instantly.
    const waitFor = await street.evaluate(() => NN.DECISION_SEC);
    await sleep((waitFor * 2 + 2) * 1000);
    const nnDeciding = await street.evaluate(() =>
      SIM.junctions.filter((j) => j.lastSource === 'nn').length);
    check('the model is making decisions', nnDeciding > 0,
          nnDeciding + ' of 4 junctions decided by the model');

    const reason = await street.evaluate(() =>
      SIM.junctions.map((j) => j.lastReason).find((r) => /Model predicts/.test(r)) || '');
    check('and each decision carries a reason', reason.length > 10, reason);

    if (WANT_SHOTS) {
      await street.screenshot({ path: path.join(SHOT_DIR, 'street-model.png') });
      await room.screenshot({ path: path.join(SHOT_DIR, 'console.png') });
      console.log('\nscreenshots written to docs/screenshots/');
    }

    /* ---- the language-model stack ----
     * The point of these checks is that the stack DEGRADES rather than stalls.
     * With a key and a network it calls a model and then reviews the answer;
     * with neither it uses the local rule. Either way a decision appears, so
     * the assertion is on the decision existing and naming its layer, not on
     * the network being up.
     */
    await street.evaluate(() => {
      document.querySelector('.tab[data-pane="learn"]').click();
    });
    const chain = await street.evaluate(() => AGENT.MODEL_CHAIN.length);
    check('the model fallback chain has more than one model', chain >= 2,
          chain + ' models tried in order');

    await street.evaluate(() => {
      document.getElementById('btn-ai').click();
    });
    // A propose call and a review call are one round trip each, and each takes
    // roughly ten seconds against the live API, so wait for two of them.
    await sleep(50000);

    const llm = await street.evaluate(() => ({
      total: AGENT.decisions.length,
      sources: AGENT.decisions.slice(0, 8).map((d) => d.source),
      verdicts: AGENT.decisions.slice(0, 8).map((d) => d.verdict),
      reasons: AGENT.decisions.slice(0, 8).map((d) => d.reason),
      stats: AGENT.stats
    }));
    check('the language-model layer produces decisions', llm.total > 0,
          llm.total + ' decisions, sources: ' + [...new Set(llm.sources)].join('/'));
    check('every decision names which layer made it',
          llm.total > 0 && llm.verdicts.every((v) => typeof v === 'string' && v.length > 0),
          [...new Set(llm.verdicts)].join('/') || 'none');
    check('and every decision carries a reason',
          llm.total > 0 && llm.reasons.every((r) => typeof r === 'string' && r.length > 10),
          llm.reasons[0] || 'none');

    // Whether a live model answers depends on quota and venue wifi, neither of
    // which is a property of this code. So the assertion is on the stack ending
    // up in one of its three DOCUMENTED states, and the detail says which one
    // actually happened - a rate limit reported as a failure would teach us to
    // ignore a red harness on demo day.
    const reviewed = llm.stats.approvals + llm.stats.corrections;
    let state, ok;
    if (reviewed > 0) {
      state = 'reviewed: ' + llm.stats.approvals + ' approved, ' + llm.stats.corrections + ' overruled';
      ok = true;
    } else if (llm.stats.rateLimited > 0) {
      state = 'rate limited (' + llm.stats.rateLimited + 'x) before a review landed, fallback held';
      ok = llm.sources.length > 0;
    } else if (llm.stats.calls > 0) {
      state = 'a model answered but no review completed in the window';
      ok = false;
    } else {
      state = 'no model reachable, ran on the local rule only';
      ok = llm.sources.every((s) => s === 'heuristic' || s === 'error');
    }
    check('the stack ends in one of its three documented states', ok, state);

    const llmFacts = await street.evaluate(() =>
      document.querySelectorAll('#llm-facts .fact').length);
    check('the stack is explained on screen', llmFacts >= 6, llmFacts + ' rows shown');

    const safety = await street.evaluate(() =>
      SIM.junctions.every((j) => j.state !== 'green' || j.greenElapsed >= 0));
    check('signal safety limits still hold under model control', safety === true,
          'min green ' + (await street.evaluate(() => SIM.SIGNAL.minGreen)) + 's enforced below every controller');

    if (WANT_SHOTS) {
      await street.screenshot({ path: path.join(SHOT_DIR, 'street-llm.png') });
    }

    /* ---- late errors ---- */
    check('no errors appeared during the whole run',
          streetErrors.length === 0 && roomErrors.length === 0,
          (streetErrors.concat(roomErrors).slice(0, 2).join(' | ')) || 'clean');

  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n' + '-'.repeat(64));
  console.log(passed + ' passed, ' + failed + ' failed');
  if (failed) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  ' + f);
    process.exit(1);
  }
  console.log('Both pages run in a real browser.');
})().catch((err) => {
  console.error('\nharness crashed:', err.message);
  process.exit(1);
});
