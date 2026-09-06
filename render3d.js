/* =============================================================================
 * render3d.js — the same twin, in three dimensions.
 *
 * This file exists to prove a claim the architecture has been making all along:
 * the simulation holds state, renderers draw it, and swapping the renderer
 * changes nothing else. Every number on screen in 3D comes from the same
 * SIM.vehicles and SIM.junctions the 2D view reads. No physics is duplicated
 * here, and no decision is made here.
 *
 * It is deliberately not a video game. Boxes, honest colours, readable signal
 * heads. A traffic engineer needs to see queues and phases, not reflections.
 *
 * CONTROLS
 *   drag        orbit
 *   wheel       zoom
 *   double click reset the camera
 *
 * NO simulation logic in this file.
 * ========================================================================== */

const RENDER3D = (function () {
  'use strict';

  const COLOURS = {
    ground: 0x070B12,
    road: 0x2B3442,
    kerb: 0x3C4757,
    junction: 0x394456,
    block: 0x121A25,
    green: 0x34D399,
    yellow: 0xFBBF24,
    red: 0xF87171,
    priority: 0xFFFFFF,
    warn: 0xF59E0B,
    flood: 0x2563EB
  };

  const TYPE_COLOUR = {
    '2w': 0x7DD3FC, 'auto': 0xFBBF24, 'car': 0x22D3EE,
    'bus': 0xC084FC, 'truck': 0xFB923C
  };

  const SCALE = 0.1;                 // world pixels -> scene units
  const MAX_VEHICLES = 240;

  let scene, camera, renderer, host;
  let active = false, ready = false;
  let cars, carGeo;                  // instanced mesh + shared geometry
  const dummy = { };                 // filled in once THREE is present
  const lamps = [];                  // { junction, meshes: {N,S,E,W} }
  let orbit = { yaw: -0.75, pitch: 0.82, dist: 145, target: { x: 0, y: 0, z: 0 } };
  let dragging = false, lastX = 0, lastY = 0;

  const G = SIM.GEOM;
  const W = G.world.w, H = G.world.h;

  /** World (x, y) in simulation pixels -> scene (x, z) in units, centred. */
  function sx(wx) { return (wx - W / 2) * SCALE; }
  function sz(wy) { return (wy - H / 2) * SCALE; }

  /* ------------------------------------------------------------------ build */
  function build() {
    if (typeof THREE === 'undefined') return false;

    host = document.getElementById('three-host');
    if (!host) return false;

    // Some machines have three.js but no usable WebGL context - a locked-down
    // venue laptop, a remote desktop session, a browser with hardware
    // acceleration switched off. Constructing the renderer THROWS there, so it
    // is caught here and the 3D button refuses politely instead of taking the
    // whole page down mid-demo.
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (err) {
      renderer = null;
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(COLOURS.ground, 1);
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(COLOURS.ground, 120, 320);

    camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 0.5, 900);

    scene.add(new THREE.AmbientLight(0x4A6480, 1.15));
    const key = new THREE.DirectionalLight(0xBFE4F0, 0.75);
    key.position.set(60, 120, 40);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x22D3EE, 0.25);
    fill.position.set(-70, 40, -50);
    scene.add(fill);

    buildGround();
    buildRoads();
    buildJunctions();
    buildVehicles();
    buildAmbulances();
    buildScenarioLayer();
    buildOverlay();

    dummy.obj = new THREE.Object3D();
    wireInput();
    ready = true;
    return true;
  }

  function buildGround() {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(W * SCALE * 2.2, H * SCALE * 2.4),
      new THREE.MeshStandardMaterial({ color: COLOURS.ground, roughness: 1 })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.4;
    scene.add(plane);

    const grid = new THREE.GridHelper(W * SCALE * 2, 40, 0x1B3644, 0x101E28);
    grid.position.y = -0.35;
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
    scene.add(grid);

    // City blocks between the roads, so the grid reads as a place.
    const blockMat = new THREE.MeshStandardMaterial({ color: COLOURS.block, roughness: 0.95 });
    const gapsX = [-1, 0, 1], gapsY = [-1, 0, 1];
    for (const gx of gapsX) {
      for (const gy of gapsY) {
        const cx = sx(W / 2 + gx * 360), cz = sz(H / 2 + gy * 280);
        for (let k = 0; k < 3; k++) {
          const h = 1.5 + Math.random() * 7;
          const b = new THREE.Mesh(new THREE.BoxGeometry(4 + Math.random() * 6, h,
                                                         4 + Math.random() * 6), blockMat);
          b.position.set(cx + (Math.random() - 0.5) * 16, h / 2, cz + (Math.random() - 0.5) * 14);
          scene.add(b);
        }
      }
    }
  }

  function buildRoads() {
    const roadMat = new THREE.MeshStandardMaterial({ color: COLOURS.road, roughness: 0.95 });
    const kerbMat = new THREE.MeshStandardMaterial({ color: COLOURS.kerb, roughness: 1 });
    const rw = G.roadWidth * SCALE;

    for (const y of G.rows) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(W * SCALE, 0.3, rw), roadMat);
      road.position.set(0, 0, sz(y));
      scene.add(road);
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(W * SCALE, 0.42, rw + 0.9), kerbMat);
      kerb.position.set(0, -0.06, sz(y));
      scene.add(kerb);
    }
    for (const x of G.cols) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.3, H * SCALE), roadMat);
      road.position.set(sx(x), 0, 0);
      scene.add(road);
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(rw + 0.9, 0.42, H * SCALE), kerbMat);
      kerb.position.set(sx(x), -0.06, 0);
      scene.add(kerb);
    }
  }

  function buildJunctions() {
    const jMat = new THREE.MeshStandardMaterial({ color: COLOURS.junction, roughness: 0.9 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1B2430, roughness: 0.8 });
    const size = G.junctionHalf * 2 * SCALE;

    for (const j of SIM.junctions) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(size, 0.34, size), jMat);
      pad.position.set(sx(j.x), 0.02, sz(j.y));
      scene.add(pad);

      const entry = { junction: j, heads: {} };
      const off = (G.junctionHalf + 26) * SCALE;
      const spots = {
        S: [sx(j.x) - 1.6, sz(j.y) - off],     // controls traffic heading south
        N: [sx(j.x) + 1.6, sz(j.y) + off],
        W: [sx(j.x) + off, sz(j.y) - 1.6],
        E: [sx(j.x) - off, sz(j.y) + 1.6]
      };
      for (const dir in spots) {
        const [px, pz] = spots[dir];
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.4, 8), poleMat);
        pole.position.set(px, 1.7, pz);
        scene.add(pole);

        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.72, 14, 12),
          new THREE.MeshBasicMaterial({ color: COLOURS.red })
        );
        head.position.set(px, 3.6, pz);
        scene.add(head);

        // A soft halo so the state reads from a distance, like the 2D view.
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(1.25, 12, 10),
          new THREE.MeshBasicMaterial({ color: COLOURS.red, transparent: true, opacity: 0.18 })
        );
        halo.position.copy(head.position);
        scene.add(halo);

        entry.heads[dir] = { head: head, halo: halo };
      }
      lamps.push(entry);
    }
  }

  function buildVehicles() {
    carGeo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
    cars = new THREE.InstancedMesh(carGeo, mat, MAX_VEHICLES);
    cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cars.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_VEHICLES * 3), 3);
    scene.add(cars);
  }

  /* ------------------------------------------------------------------ input */
  function wireInput() {
    const el = renderer.domElement;
    el.style.cursor = 'grab';
    el.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY; el.style.cursor = 'grabbing';
    });
    window.addEventListener('pointerup', function () { dragging = false; el.style.cursor = 'grab'; });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      orbit.yaw -= (e.clientX - lastX) * 0.006;
      orbit.pitch = Math.max(0.18, Math.min(1.45, orbit.pitch - (e.clientY - lastY) * 0.005));
      lastX = e.clientX; lastY = e.clientY;
    });
    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      orbit.dist = Math.max(45, Math.min(320, orbit.dist + e.deltaY * 0.12));
    }, { passive: false });
    el.addEventListener('dblclick', function () {
      orbit = { yaw: -0.75, pitch: 0.82, dist: 145, target: { x: 0, y: 0, z: 0 } };
    });
  }

  function placeCamera() {
    const r = orbit.dist;
    camera.position.set(
      orbit.target.x + r * Math.cos(orbit.pitch) * Math.cos(orbit.yaw),
      orbit.target.y + r * Math.sin(orbit.pitch),
      orbit.target.z + r * Math.cos(orbit.pitch) * Math.sin(orbit.yaw)
    );
    camera.lookAt(orbit.target.x, orbit.target.y, orbit.target.z);
  }

  /* ------------------------------------------------------------------ frame */
  function updateSignals() {
    for (const entry of lamps) {
      const j = entry.junction;
      for (const dir in entry.heads) {
        const state = SIM.signalFor(j, dir);
        const c = state === 'green' ? COLOURS.green
                : state === 'yellow' ? COLOURS.yellow : COLOURS.red;
        entry.heads[dir].head.material.color.setHex(c);
        entry.heads[dir].halo.material.color.setHex(c);
      }
    }
  }

  const colour = { r: 0, g: 0, b: 0 };

  /* An InstancedMesh carries one colour per instance, so it can paint an
   * ambulance white but it cannot put a red stripe down the side of it. There
   * are never more than a handful of emergency vehicles, so they are drawn as
   * ordinary meshes from a small pool instead: white body, red stripe, blue
   * beacon - the same reading as the 2D view. */
  const AMB_POOL = 6;
  const ambulances = [];

  function buildAmbulances() {
    const body = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.4 });
    const stripe = new THREE.MeshBasicMaterial({ color: 0xE5484D });
    const beacon = new THREE.MeshBasicMaterial({ color: 0x38BDF8 });

    for (let i = 0; i < AMB_POOL; i++) {
      const g = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.25, 1.15), body);
      shell.position.y = 0.62;
      g.add(shell);

      // A stripe on each flank, so it reads from either side of the orbit.
      for (const z of [0.59, -0.59]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.34, 0.02), stripe);
        s.position.set(0, 0.6, z);
        g.add(s);
      }
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), beacon);
      light.position.y = 1.36;
      g.add(light);

      // The halo that says "this one holds the corridor", matching 2D.
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(1.9, 2.5, 28),
        new THREE.MeshBasicMaterial({ color: 0x22D3EE, transparent: true,
                                      opacity: 0.5, side: THREE.DoubleSide })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.08;
      g.add(halo);

      g.visible = false;
      scene.add(g);
      ambulances.push({ group: g, halo: halo, beacon: light, vehicle: null });
    }
  }

  function updateVehicles() {
    const tmp = new THREE.Color();
    const emergency = [];
    let i = 0;

    for (const v of SIM.vehicles) {
      if (v.emergency || v.priority) { emergency.push(v); continue; }
      if (i >= MAX_VEHICLES) break;

      const len = v.type.len * SCALE * 1.35;      // same readability nudge as 2D
      const wid = Math.max(0.55, v.type.wid * SCALE * 1.35);
      const hgt = v.type.id === 'bus' || v.type.id === 'truck' ? 1.5 : 0.85;

      dummy.obj.position.set(sx(v.x), hgt / 2 + 0.2, sz(v.y));
      dummy.obj.rotation.set(0, (v.dir === 'N' || v.dir === 'S') ? Math.PI / 2 : 0, 0);
      dummy.obj.scale.set(len, hgt, wid);
      dummy.obj.updateMatrix();
      cars.setMatrixAt(i, dummy.obj.matrix);

      tmp.setHex(TYPE_COLOUR[v.type.id] || 0x22D3EE);
      if (v.speed < 8) tmp.multiplyScalar(0.55);
      cars.setColorAt(i, tmp);
      i++;
    }
    cars.count = i;
    cars.instanceMatrix.needsUpdate = true;
    if (cars.instanceColor) cars.instanceColor.needsUpdate = true;

    const flash = (Math.sin(SIM.time() * 9) > 0);
    for (let k = 0; k < ambulances.length; k++) {
      const slot = ambulances[k];
      const v = emergency[k] || null;
      slot.vehicle = v;
      slot.group.visible = !!v;
      if (!v) continue;
      slot.group.position.set(sx(v.x), 0.2, sz(v.y));
      slot.group.rotation.y = (v.dir === 'N' || v.dir === 'S') ? Math.PI / 2 : 0;
      slot.halo.visible = !!v.priority;
      slot.beacon.material.color.setHex(flash ? 0x38BDF8 : 0xE5484D);
    }
  }

  /* ================================================================ scenarios
   * The 2D view draws the state of the world AND what is being done to it: the
   * flooded road, the ring round a junction with an incident, the decision each
   * junction just took and why. Without those the 3D view is a pretty
   * animation - you can see traffic moving but not what the demo is showing
   * you. So the same four overlays are reproduced here.
   *
   * Geometry that belongs in the world (flood water, incident rings) is drawn
   * as meshes. Text is drawn as HTML positioned over the canvas, because
   * projected DOM stays crisp at any zoom and reflows properly, whereas a
   * texture-based label goes blurry the moment someone scrolls in.
   */
  const incidentRings = {};          // junctionId -> mesh
  const blockedMarks = {};           // "J2:E" -> crossed-bars group
  const floodPlanes = {};            // roadId -> mesh
  let overlay = null, labelEls = {}, bannerEl = null;
  const ambulanceEls = [];

  function buildScenarioLayer() {
    for (const j of SIM.junctions) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry((G.junctionHalf + 10) * SCALE, 0.28, 8, 40),
        new THREE.MeshBasicMaterial({ color: COLOURS.warn,
                                      transparent: true, opacity: 0.9 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(sx(j.x), 0.5, sz(j.y));
      ring.visible = false;
      scene.add(ring);
      incidentRings[j.id] = ring;
    }

    /* Blocked approaches. The 2D view draws a red cross and the word BLOCKED at
     * the mouth of the approach that cannot discharge, and that - not the
     * incident ring - is what the ACCIDENT scenario actually sets. Leaving it
     * out of 3D meant the accident demo showed a queue with no visible cause. */
    const barMat = new THREE.MeshBasicMaterial({ color: COLOURS.red });
    const off = (G.junctionHalf + 46) * SCALE;
    const DIR_OFFSET = { E: [off, 0], W: [-off, 0], S: [0, off], N: [0, -off] };
    for (const j of SIM.junctions) {
      for (const dir in DIR_OFFSET) {
        const [dx, dz] = DIR_OFFSET[dir];
        const group = new THREE.Group();
        for (const rot of [Math.PI / 4, -Math.PI / 4]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.55), barMat);
          bar.rotation.y = rot;
          group.add(bar);
        }
        group.position.set(sx(j.x) + dx, 1.4, sz(j.y) + dz);
        group.visible = false;
        scene.add(group);
        blockedMarks[j.id + ':' + dir] = group;
      }
    }

    const water = new THREE.MeshStandardMaterial({
      color: COLOURS.flood, transparent: true, opacity: 0.32, roughness: 0.25
    });
    const hw = (G.roadWidth / 2 + 4) * SCALE;
    G.rows.forEach(function (y, i) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(W * SCALE, 0.5, hw * 2), water);
      m.position.set(0, 0.3, sz(y));
      m.visible = false;
      scene.add(m);
      floodPlanes['row' + i] = m;
    });
    G.cols.forEach(function (x, i) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.5, H * SCALE), water);
      m.position.set(sx(x), 0.3, 0);
      m.visible = false;
      scene.add(m);
      floodPlanes['col' + i] = m;
    });
  }

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'ov3d';
    host.appendChild(overlay);

    for (const j of SIM.junctions) {
      const el = document.createElement('div');
      el.className = 'ov3d-card';
      el.innerHTML = '<b></b><span></span>';
      overlay.appendChild(el);
      labelEls[j.id] = el;
    }

    // One tag per ambulance, not one for "the" priority vehicle. In a two
    // ambulance conflict both are on the road and the interesting thing is
    // which of them has the corridor - a single label could only ever show one
    // of them, which is exactly the case the demo is about.
    for (let i = 0; i < AMB_POOL; i++) {
      const tag = document.createElement('div');
      tag.className = 'ov3d-priority';
      tag.hidden = true;
      overlay.appendChild(tag);
      ambulanceEls.push(tag);
    }

    bannerEl = document.createElement('div');
    bannerEl.className = 'ov3d-banner';
    bannerEl.hidden = true;
    overlay.appendChild(bannerEl);
  }

  function updateScenarioMeshes() {
    for (const j of SIM.junctions) {
      const ring = incidentRings[j.id];
      if (ring) ring.visible = !!SENSOR_FEED.incidentActive(j.id);
    }
    for (const id in floodPlanes) {
      floodPlanes[id].visible = !!SIM.conditions.floodedRoads[id];
    }
    for (const key in blockedMarks) {
      blockedMarks[key].visible = !!SIM.conditions.blockedApproaches[key];
    }
  }

  /** Project a scene point to a pixel position inside the host element. */
  const projected = { x: 0, y: 0, z: 0 };
  function toScreen(x, y, z) {
    projected.x = x; projected.y = y; projected.z = z;
    const v = new THREE.Vector3(x, y, z).project(camera);
    return {
      left: (v.x * 0.5 + 0.5) * host.clientWidth,
      top: (-v.y * 0.5 + 0.5) * host.clientHeight,
      behind: v.z > 1
    };
  }

  function updateOverlay() {
    for (const j of SIM.junctions) {
      const el = labelEls[j.id];
      if (!el) continue;
      const p = toScreen(sx(j.x), 5.4, sz(j.y));
      if (p.behind) { el.hidden = true; continue; }
      el.hidden = false;
      el.style.left = p.left + 'px';
      el.style.top = p.top + 'px';

      const plan = SIM.getPlan(j.id);
      const source = j.lastSource || 'plan';
      el.dataset.source = source;
      el.firstChild.textContent = j.id + '  ' + plan.greenNS + 's NS / ' + plan.greenEW + 's EW';
      el.lastChild.textContent = j.lastReason || 'Running the fixed plan.';
      el.classList.toggle('incident', !!SENSOR_FEED.incidentActive(j.id));
    }

    for (let k = 0; k < ambulanceEls.length; k++) {
      const tag = ambulanceEls[k];
      const slot = ambulances[k];
      const v = slot && slot.vehicle;
      if (!v) { tag.hidden = true; continue; }
      const p = toScreen(sx(v.x), 2.6, sz(v.y));
      tag.hidden = p.behind;
      tag.style.left = p.left + 'px';
      tag.style.top = p.top + 'px';
      tag.textContent = v.priority ? 'PRIORITY' : 'HELD';
      tag.classList.toggle('held', !v.priority);
    }

    // One banner, for whichever thing the audience most needs told in words.
    const flooded = Object.keys(SIM.conditions.floodedRoads);
    const blocked = Object.keys(SIM.conditions.blockedApproaches);
    if (SIM.isPaused()) {
      bannerEl.hidden = false;
      bannerEl.textContent = 'PAUSED';
    } else if (blocked.length) {
      bannerEl.hidden = false;
      bannerEl.textContent = 'BLOCKED — ' + blocked.join(', ') +
        ' cannot discharge' + (flooded.length ? ' · FLOODED ' + flooded.join(', ') : '');
    } else if (flooded.length) {
      bannerEl.hidden = false;
      bannerEl.textContent = 'FLOODED — NO HEAVY VEHICLES ON ' +
        flooded.map(function (r) { return r.toUpperCase(); }).join(', ');
    } else {
      bannerEl.hidden = true;
    }
  }

  function frame() {
    if (!active || !ready) return;
    updateSignals();
    updateVehicles();
    updateScenarioMeshes();
    placeCamera();
    renderer.render(scene, camera);
    updateOverlay();          // after render, so the camera matrix is current
  }

  function resize() {
    if (!ready || !host) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener('resize', resize);

  /* -------------------------------------------------------------------- API */
  return {
    /** Turn the 3D view on. Builds the scene the first time it is asked for. */
    enable: function () {
      if (!ready && !build()) return false;
      active = true;
      resize();
      return true;
    },
    disable: function () { active = false; },
    isActive: function () { return active; },
    isAvailable: function () { return typeof THREE !== 'undefined'; },
    frame: frame,
    resize: resize,
    /** Point the camera at one junction, for the focus view. */
    focus: function (junctionId) {
      const j = SIM.junctionById(junctionId);
      if (!j) { orbit.target = { x: 0, y: 0, z: 0 }; orbit.dist = 145; return; }
      orbit.target = { x: sx(j.x), y: 0, z: sz(j.y) };
      orbit.dist = 70;
      orbit.pitch = 0.7;
    }
  };
})();
