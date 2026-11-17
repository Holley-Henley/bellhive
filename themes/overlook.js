/* bellhive99.com - home page theme: The Shining (the hotel hallway)
 * A long hotel corridor: bold hexagon-pattern carpet, patterned wallpaper over dark wainscot,
 * rows of numbered doors (one is 237), flickering sconces, a child's tricycle, an elevator at the
 * far end - and nobody in it. A small red ball rolls slowly out of the dark toward you and stops.
 * Click: the lights flicker, the ball comes back, Room 237 creaks open with light spilling out,
 * and the ball rolls out of it toward you before the door slams.
 * bellhive99 is the brass plaque on the nearest door. Stylized, original design.
 * Loaded by INDEXB.HTM (see themes/themes.js).
 */
(window.BHScenes = window.BHScenes || {}).overlook = function (box, lib) {
  const { THREE, OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = lib;
  const ASPECT = 453 / 503, CROP = 780 / 1006;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const glowColor = (r, g, b) => new THREE.Color(r, g, b);

  box.title = 'Drag to look around \u00b7 click... if you dare';
  const mask = 'linear-gradient(to right, transparent, #000 9%, #000 91%, transparent), linear-gradient(to bottom, transparent, #000 9%, #000 91%, transparent)';
  box.style.webkitMaskImage = mask; box.style.maskImage = mask;
  box.style.webkitMaskComposite = 'source-in'; box.style.maskComposite = 'intersect';

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    box.innerHTML = '<p style="font: 28px Georgia, serif; padding-top: 180px;">bellhive99</p>';
    throw e;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0a0605, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  box.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1a0f0a, 14, 46);
  const camera = new THREE.PerspectiveCamera(50, 1 / ASPECT, 0.05, 100);
  camera.position.set(0.15, 1.6, 3.2);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1006, 780), 0.45, 0.4, 0.85));
  composer.addPass(new OutputPass());

  function canvasTex(w, h, draw, rx = 1, ry = 1) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 8;
    return t;
  }

  /* ---------- the corridor ---------- */
  const W = 3.2, H = 3.0, Z_NEAR = 5, Z_FAR = -36, LEN = Z_NEAR - Z_FAR;
  const carpet = canvasTex(256, 222, (g, w, h) => {   /* interlocking hexagons, one tile */
    g.fillStyle = '#3a160d'; g.fillRect(0, 0, w, h);
    const r = 64, hh = Math.sqrt(3) * r / 2;
    const hex = (cx, cy, rad) => { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; g.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a)); } g.closePath(); };
    for (let col = -1; col <= 3; col++) for (let row = -1; row <= 3; row++) {
      const cx = col * 1.5 * r, cy = row * 2 * hh + (col % 2 ? hh : 0);
      hex(cx, cy, r - 4); g.fillStyle = '#c4501c'; g.fill();
      hex(cx, cy, r - 16); g.fillStyle = '#7a1a12'; g.fill();
      hex(cx, cy, r - 28); g.fillStyle = '#3a160d'; g.fill();
      hex(cx, cy, r - 38); g.fillStyle = '#c4501c'; g.fill();
      hex(cx, cy, r - 48); g.fillStyle = '#7a1a12'; g.fill();
    }
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${rand(0.03, 0.12)})`; g.fillRect(rand(0, w), rand(0, h), 2, 2); }
  }, W / 1.1, LEN / 0.95);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, LEN), new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (Z_NEAR + Z_FAR) / 2); scene.add(floor);

  const paper = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9b48c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,80,40,0.25)'; g.lineWidth = 3;
    for (let x = 0; x <= w; x += 64) for (let y = 0; y <= h; y += 64) {
      g.beginPath(); g.ellipse(x, y, 14, 22, 0, 0, 7); g.stroke();
      g.beginPath(); g.ellipse(x + 32, y + 32, 6, 10, 0, 0, 7); g.stroke();
    }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(80,50,20,${rand(0.02, 0.07)})`; g.fillRect(rand(0, w), rand(0, h), 2, 3); }
  }, LEN / 1.3, 2);
  const wood = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3d2214'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${rand(20, 80)},${rand(10, 40)},5,0.5)`; g.lineWidth = rand(1, 3); const y = rand(0, h); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w / 3, y + rand(-6, 6), w * 2 / 3, y + rand(-6, 6), w, y); g.stroke(); }
  }, 6, 1);
  const paperMat = new THREE.MeshStandardMaterial({ map: paper, roughness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.6 });
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(LEN, H - 0.95), paperMat);
    wall.position.set(s * W / 2, 0.95 + (H - 0.95) / 2, (Z_NEAR + Z_FAR) / 2); wall.rotation.y = -s * Math.PI / 2; scene.add(wall);
    const wain = new THREE.Mesh(new THREE.PlaneGeometry(LEN, 0.95), woodMat);
    wain.position.set(s * W / 2, 0.475, (Z_NEAR + Z_FAR) / 2); wain.rotation.y = -s * Math.PI / 2; scene.add(wain);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, LEN), trimMat); rail.position.set(s * (W / 2 - 0.02), 0.96, (Z_NEAR + Z_FAR) / 2); scene.add(rail);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, LEN), trimMat); base.position.set(s * (W / 2 - 0.02), 0.06, (Z_NEAR + Z_FAR) / 2); scene.add(base);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, LEN), trimMat); crown.position.set(s * (W / 2 - 0.04), H - 0.05, (Z_NEAR + Z_FAR) / 2); scene.add(crown);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, LEN), new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.95 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, (Z_NEAR + Z_FAR) / 2); scene.add(ceil);
  const ceilLamps = [];
  for (let z = 2; z > Z_FAR; z -= 6) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ color: glowColor(1.6, 1.4, 1.0), toneMapped: false }));
    p.rotation.x = Math.PI / 2; p.position.set(0, H - 0.01, z); scene.add(p); ceilLamps.push(p);
  }

  /* end wall with an elevator */
  const endWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), paperMat); endWall.position.set(0, H / 2, Z_FAR); scene.add(endWall);
  const elevFrame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.4, 0.1), new THREE.MeshStandardMaterial({ color: 0x8a2a14, roughness: 0.5, metalness: 0.3 }));
  elevFrame.position.set(0, 1.2, Z_FAR + 0.05); scene.add(elevFrame);
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9690, metalness: 0.7, roughness: 0.35 });
  for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.72, 2.2, 0.06), steel); d.position.set(s * 0.37, 1.1, Z_FAR + 0.12); scene.add(d); }

  /* doors: numbered brass plates; 237; the nearest one carries the bellhive99 plaque */
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 0.85, roughness: 0.3 });
  const plateTex = (text, w = 256, h = 96, size = 64) => {
    const t = canvasTex(w, h, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#e2c06a'); gr.addColorStop(0.5, '#b8902e'); gr.addColorStop(1, '#8a6a1e');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#6a4a12'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      g.font = `bold ${size}px Georgia, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,240,200,0.5)'; g.fillText(text, w / 2 + 2, h / 2 + 4);
      g.fillStyle = '#3a2408'; g.fillText(text, w / 2, h / 2 + 2);
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x5a3018, map: wood, roughness: 0.55 });
  let num = 231;
  const doors = [];
  for (let z = 0.5, k = 0; z > Z_FAR + 3; z -= 4.6, k++) {
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(s * (W / 2 - 0.03), 0, z); g.rotation.y = -s * Math.PI / 2; scene.add(g);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.3, 0.06), trimMat); frame.position.y = 1.15; g.add(frame);
      const hinge = new THREE.Group(); hinge.position.set(0.475, 0, 0); g.add(hinge);   /* doors swing on the edge farther down the hall */
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.15, 0.08), doorMat); door.position.set(-0.475, 1.08, 0.03); hinge.add(door);
      for (const py of [0.55, 1.5]) { const panel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 0.02), woodMat); panel.position.set(-0.475, py, 0.08); hinge.add(panel); }
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), brassMat); knob.position.set(-0.835, 1.0, 0.11); hinge.add(knob);
      const isLogo = k === 0 && s === -1;
      const label = isLogo ? 'bellhive99' : String(num);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(isLogo ? 0.62 : 0.28, isLogo ? 0.17 : 0.1, 0.015),
        [brassMat, brassMat, brassMat, brassMat, new THREE.MeshStandardMaterial({ map: isLogo ? plateTex('bellhive99', 512, 140, 84) : plateTex(label), metalness: 0.6, roughness: 0.35 }), brassMat]);
      plate.position.set(-0.475, 1.68, 0.12); hinge.add(plate);
      if (!isLogo) num += 2;
      doors.push({ g, hinge, label, s, z });
    }
  }

  /* hanging hotel sign facing the guests: bellhive99 */
  {
    const t = canvasTex(1024, 256, (g, w, h) => {
      g.fillStyle = '#2a1a10'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#c9a040'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 120px Georgia, "Times New Roman", serif';
      const gr = g.createLinearGradient(0, 40, 0, 170); gr.addColorStop(0, '#f0d27a'); gr.addColorStop(1, '#a87c26');
      g.fillStyle = gr; g.fillText('bellhive99', w / 2, 112);
      g.font = 'italic 44px Georgia, serif'; g.fillStyle = '#d8b864'; g.fillText('Rooms 231 \u2013 249  \u2192', w / 2, 200);
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const signMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.2 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.42, 0.04), [brassMat, brassMat, brassMat, brassMat, signMat, signMat]);
    sign.position.set(0, 2.45, -3.2); scene.add(sign);
    for (const s of [-1, 1]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6), brassMat); rod.position.set(s * 0.7, 2.83, -3.2); scene.add(rod); }
  }

  /* sconces */
  const sconceLights = [], sconceGlows = [];
  for (let z = -1.8, k = 0; z > Z_FAR + 1; z -= 4.6, k++) {
    for (const s of [-1, 1]) {
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.22, 16, 1, true), new THREE.MeshBasicMaterial({ color: glowColor(1.8, 1.3, 0.75), side: THREE.DoubleSide, toneMapped: false }));
      shade.position.set(s * (W / 2 - 0.16), 2.0, z); scene.add(shade); sconceGlows.push(shade);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), brassMat); arm.position.set(s * (W / 2 - 0.08), 1.92, z); scene.add(arm);
    }
    if (k % 2 === 0) { const l = new THREE.PointLight(0xffc68a, 5, 9, 1.6); l.position.set(0, 2.3, z); scene.add(l); sconceLights.push(l); }
  }
  const endLight = new THREE.PointLight(0xffb070, 4, 10, 1.6); endLight.position.set(0, 2.4, -19); scene.add(endLight); sconceLights.push(endLight);
  scene.add(new THREE.AmbientLight(0x3a2a20, 0.7));

  /* ---------- the tricycle ---------- */
  {
    const red = new THREE.MeshStandardMaterial({ color: 0xb02020, roughness: 0.4, metalness: 0.4 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.2, metalness: 0.9 });
    const trike = new THREE.Group(); trike.position.set(0.35, 0, -7.5); trike.rotation.y = 0.55; scene.add(trike);
    const front = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 24), rubber); front.position.set(0, 0.25, 0.45); front.rotation.y = Math.PI / 2; trike.add(front);
    for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.42, 4), chrome); sp.position.copy(front.position); sp.rotation.set(0, 0, 0); sp.rotation.x = (i / 6) * Math.PI; trike.add(sp); }
    for (const s of [-1, 1]) { const rw = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 20), rubber); rw.position.set(s * 0.26, 0.15, -0.3); rw.rotation.y = Math.PI / 2; trike.add(rw); }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 6), chrome); axle.rotation.z = Math.PI / 2; axle.position.set(0, 0.15, -0.3); trike.add(axle);
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 8), red); frame.rotation.x = Math.PI / 2 - 0.25; frame.position.set(0, 0.32, 0.05); trike.add(frame);
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8), red); fork.position.set(0, 0.45, 0.45); fork.rotation.x = -0.15; trike.add(fork);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 8), chrome); bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.68, 0.42); trike.add(bar);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.2), rubber); seat.position.set(0, 0.46, -0.12); trike.add(seat);
    trike.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  }

  /* ---------- the little red ball ---------- */
  const ballTex = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#c0141a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8d8b0'; g.fillRect(0, h * 0.44, w, h * 0.12);   /* a pale stripe so you can see it roll */
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${rand(0.02, 0.08)})`; g.fillRect(rand(0, w), rand(0, h), 3, 3); }
  });
  ballTex.wrapS = ballTex.wrapT = THREE.ClampToEdgeWrapping;
  const BALL_R = 0.14;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35 }));
  ball.castShadow = true; scene.add(ball);
  const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 1.1, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
  ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);
  /* a roll: from (x0,z0) to (x1,z1), easing to a stop, with a slight drift */
  const roll = { from: V(), to: V(), t: 0, dur: 1, rest: 0, on: false };
  const axis = V(), step = V();
  function startRoll(x0, z0, x1, z1, dur) {
    roll.from.set(x0, BALL_R, z0); roll.to.set(x1, BALL_R, z1); roll.t = 0; roll.dur = dur; roll.on = true;
    ball.position.copy(roll.from); ball.visible = true;
  }
  const FAR_Z = -24;
  startRoll(rand(-0.6, 0.2), FAR_Z, rand(-0.5, 0.0), rand(-2.6, -1.8), 26);

  /* ---------- room 237: the door creaks open, light spills out ---------- */
  const d237 = doors.find((d) => d.label === '237');
  const roomGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.15), new THREE.MeshBasicMaterial({ map: canvasTex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5a6a50'); gr.addColorStop(0.55, '#d8e8c0'); gr.addColorStop(1, '#f6f0d8');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }), color: glowColor(1, 1, 1), toneMapped: false, transparent: true, opacity: 0 }));
  roomGlow.position.set(0, 1.08, 0.034); d237.g.add(roomGlow);
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.8), new THREE.MeshBasicMaterial({ map: canvasTex(64, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(230,245,200,0.9)'); gr.addColorStop(1, 'rgba(230,245,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  spill.rotation.x = -Math.PI / 2; spill.position.set(0, 0.012, 0.9); d237.g.add(spill);
  const roomLight = new THREE.PointLight(0xd8f0c0, 0, 6, 1.6); roomLight.position.set(0, 1.4, 0.6); d237.g.add(roomLight);
  let open237 = 0, want237 = 0;
  /* ---------- lights out ---------- */
  let dark = 0, scare = -1, autoFlicker = rand(16, 26);
  function blackout(dur) { dark = Math.max(dark, dur); }

  /* ---------- controls, click, sizing ---------- */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.45, -8);
  Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.4, minPolarAngle: 1.3, maxPolarAngle: 1.75, minAzimuthAngle: -0.4, maxAzimuthAngle: 0.4 });
  controls.update();
  let lastTouch = -10;
  controls.addEventListener('start', () => { lastTouch = Infinity; renderer.domElement.style.cursor = 'grabbing'; });
  controls.addEventListener('end', () => { lastTouch = clock.elapsedTime; renderer.domElement.style.cursor = 'pointer'; });
  renderer.domElement.style.cursor = 'pointer';
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6 && scare < 0) { scare = 0; blackout(0.45); }
    down = null;
  });

  function resize() {
    const w = box.clientWidth || 1006, full = Math.round(w * ASPECT), h = Math.round(w * CROP);
    box.style.height = h + 'px';
    renderer.setSize(w, h);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / full;
    camera.setViewOffset(w, full, 0, 0, w, h);
  }
  new ResizeObserver(resize).observe(box);
  resize();

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  let onScreen = true;
  new IntersectionObserver(([en]) => (onScreen = en.isIntersecting)).observe(box);
  const sph = new THREE.Spherical(), off = V();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!onScreen) return;
    const t = clock.elapsedTime;

    if (t - lastTouch > 4) {
      off.subVectors(camera.position, controls.target); sph.setFromVector3(off);
      sph.theta += (Math.sin(t * 0.09) * 0.18 - sph.theta) * 0.01;
      off.setFromSpherical(sph); camera.position.copy(controls.target).add(off);
    }

    /* the click: lights out - the ball is back at the far end - room 237 creaks open, the ball
       rolls out of it toward you - the door slams */
    if (scare >= 0) {
      const before = scare; scare += dt;
      const at = (x) => before < x && scare >= x;
      if (at(0.3)) startRoll(rand(-0.5, 0.1), FAR_Z, rand(-0.4, 0.1), -2.2, 9);
      if (at(2.4)) want237 = 1;
      if (at(4.2)) { const dx = d237.s * (W / 2 - 0.45); startRoll(dx, d237.z + 0.35, rand(-0.2, 0.3), -1.9, 7); }
      if (at(9.0)) { want237 = 0; }
      if (at(9.6)) { blackout(0.15); scare = -1; }
    } else {
      /* the ball sits a while once it stops; a flicker and it is back in the dark at the far end */
      autoFlicker -= dt;
      if (!roll.on) roll.rest += dt;
      if (autoFlicker <= 0 || roll.rest > 9) {
        autoFlicker = rand(16, 26); blackout(rand(0.2, 0.4)); roll.rest = 0;
        startRoll(rand(-0.6, 0.2), FAR_Z, rand(-0.5, 0.1), rand(-2.6, -1.8), rand(20, 28));
      }
    }

    /* the ball rolls, slowing to a stop; it hides while the lights are out at the start of a new roll */
    if (roll.on) {
      roll.t += dt;
      const k = Math.min(1, roll.t / roll.dur), e = 1 - Math.pow(1 - k, 2.2);
      step.copy(ball.position);
      ball.position.lerpVectors(roll.from, roll.to, e);
      ball.position.x += Math.sin(e * 9) * 0.05 * (1 - e);
      step.subVectors(ball.position, step);
      const d = step.length();
      if (d > 1e-5) { axis.set(step.z, 0, -step.x).normalize(); ball.rotateOnWorldAxis(axis, d / BALL_R); }
      if (k >= 1) { roll.on = false; roll.rest = 0; }
    }
    ballShadow.position.set(ball.position.x + 0.02, 0.006, ball.position.z + 0.02);

    /* room 237's door swings open and shut; the light inside breathes */
    open237 += (want237 - open237) * Math.min(1, dt * (want237 ? 0.9 : 6));
    d237.hinge.rotation.y = 1.35 * open237 + Math.sin(t * 13) * 0.01 * open237;
    const glow = open237 * (0.85 + Math.sin(t * 3.1) * 0.08) * (dark > 0 ? 0.15 : 1);
    roomGlow.material.opacity = Math.min(1, open237 * 3) * (dark > 0 ? 0.2 : 1);
    roomGlow.material.color.setRGB(1.2 * glow + 0.2, 1.3 * glow + 0.2, 1.1 * glow + 0.2);
    spill.material.opacity = 0.55 * glow;
    roomLight.intensity = 6 * glow;
    /* lights: a gentle buzz, flickers, blackouts */
    dark = Math.max(0, dark - dt);
    const buzz = dark > 0 ? 0.02 : (Math.random() < 0.015 ? rand(0.3, 0.7) : 1);
    sconceLights.forEach((l, i) => (l.intensity = (i === sconceLights.length - 1 ? 4 : 5) * buzz * (i === 1 && Math.sin(t * 17) > 0.6 ? 0.5 : 1)));
    sconceGlows.forEach((g) => g.material.color.setRGB(1.8 * buzz + 0.05, 1.3 * buzz + 0.03, 0.75 * buzz + 0.02));
    ceilLamps.forEach((p) => p.material.color.setRGB(1.6 * buzz + 0.03, 1.4 * buzz + 0.02, 1.0 * buzz + 0.02));

    controls.update();
    composer.render();
  });
};
