/* =============================================================================
 * tools/demo-shots.js — the pictures the demo deck reads off.
 *
 *   node tools/demo-shots.js
 *
 * Drives both windows through the demo in docs/DEMO_SCRIPT.md and photographs
 * each beat, so the deck shows what the judge is about to see rather than a
 * stock diagram. Writes into docs/screenshots/demo/.
 *
 * These are captures of the real thing. If a shot looks wrong, the app is
 * wrong - do not touch up the image.
 * ========================================================================== */

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require(path.join(__dirname, 'browser-check', 'node_modules', 'puppeteer'));

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots', 'demo');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.png': 'image/png' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

server.listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 180000,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
           '--enable-unsafe-swiftshader']
  });

  const street = await browser.newPage();
  await street.setViewport({ width: 1500, height: 900 });
  await street.goto(base + '/index.html', { waitUntil: 'networkidle2' });

  const room = await browser.newPage();
  await room.setViewport({ width: 1280, height: 900 });
  await room.goto(base + '/console.html', { waitUntil: 'networkidle2' });
  await room.evaluate(() => {
    const b = document.getElementById('help-close');
    if (b) b.click();
  });

  await street.bringToFront();
  await sleep(3000);

  const shot = async (page, name) => {
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('  ' + name + '.png');
  };

  /* --- 1. the street, running normally ---------------------------------- */
  await street.evaluate(() => SIM.setSpawnRate(1.4));
  await sleep(6000);
  await shot(street, '01-street-normal');

  /* --- 2. a deliberately bad plan, tested ------------------------------- */
  await street.evaluate(() => {
    SIM.setPlanAll({ greenNS: 30, greenEW: 8 });
    document.getElementById('green-ns').value = 30;
    document.getElementById('green-ew').value = 8;
    document.getElementById('btn-test').click();
  });
  await sleep(16000);
  await street.evaluate(() => document.getElementById('btn-webster').click());
  await sleep(600);
  await street.evaluate(() => document.getElementById('btn-test').click());
  await sleep(16000);
  await shot(street, '02-street-two-plans-tested');

  /* --- 3. the bad day on the street ------------------------------------- */
  await street.evaluate(() => {
    document.querySelector('.tab[data-pane="operate"]').click();
    document.getElementById('btn-accident').click();
    document.getElementById('btn-flood').click();
  });
  await sleep(7000);
  await shot(street, '03-street-bad-day');

  /* --- 4. and what it did to the control room --------------------------- */
  await room.bringToFront();
  await sleep(2500);
  await shot(room, '04-room-degraded');

  /* --- 5. two ambulances, plan standing --------------------------------- */
  await street.bringToFront();
  await street.evaluate(() => {
    document.getElementById('btn-normal').click();
    SIM.setSpawnRate(1.0);
  });
  await sleep(1500);
  await street.evaluate(() => document.getElementById('btn-two-amb').click());
  await sleep(2500);
  await shot(street, '05-street-two-ambulances');
  await room.bringToFront();
  await sleep(1800);
  await shot(room, '06-room-plan-and-veto');

  /* --- 6. after it runs: one served, one held --------------------------- */
  await street.bringToFront();
  await street.evaluate(() => PRIORITY.executePlan());
  await sleep(4000);
  await shot(street, '07-street-corridor-running');

  /* --- 7. the model tab ------------------------------------------------- */
  await street.evaluate(() => {
    document.querySelector('.tab[data-pane="learn"]').click();
    document.getElementById('btn-nn').click();
  });
  await sleep(4000);
  await street.evaluate(() => document.getElementById('btn-qubo').click());
  await sleep(2500);
  await shot(street, '08-street-model-and-qubo');

  /* --- 8. the 3D view --------------------------------------------------- */
  const ok3d = await street.evaluate(() => {
    document.querySelector('.tab[data-pane="operate"]').click();
    document.getElementById('btn-two-amb').click();
    document.getElementById('view-3d').click();
    return RENDER3D.isActive();
  });
  await sleep(6000);
  if (ok3d) await shot(street, '09-street-3d');
  else console.log('  (no WebGL here - 3D shot skipped)');

  await browser.close();
  server.close();
  console.log('\nwritten to docs/screenshots/demo/');
});
