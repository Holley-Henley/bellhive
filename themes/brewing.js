/* bellhive99.com - home page theme: Homebrew Garage (brew night in the garage)
 * A big stainless kettle at a rolling boil over a blue propane flame, steam drifting past the
 * window, two glass carboys fermenting with their airlocks going blip, sacks of malt and jars of
 * hops, a pegboard of tools, string lights, and a keg labelled bellhive99 House Ale feeding a tap
 * on the workbench. The brewery cat naps on the grain sacks. Click: pour a pint - the tap opens,
 * the glass fills with amber beer, the head rises and spills over, and the cat wakes up to look.
 * Loaded by INDEXB.HTM (see themes/themes.js).
 */
(window.BHScenes = window.BHScenes || {}).brewing = function (box, lib) {
  const { THREE, OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = lib;
  const ASPECT = 453 / 503, CROP = 780 / 1006;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  box.title = 'Drag to look around \u00b7 click to pour a pint';
  const mask = 'linear-gradient(to right, transparent, #000 9%, #000 91%, transparent), linear-gradient(to bottom, transparent, #000 9%, #000 91%, transparent)';
  box.style.webkitMaskImage = mask; box.style.maskImage = mask;
  box.style.webkitMaskComposite = 'source-in'; box.style.maskComposite = 'intersect';

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    box.innerHTML = '<p style="font: bold 28px Arial, sans-serif; padding-top: 180px;">bellhive99</p>';
    throw e;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x1a1410, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.localClippingEnabled = true;
  box.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a1410, 0.025);
  const camera = new THREE.PerspectiveCamera(45, 1 / ASPECT, 0.1, 100);
  camera.position.set(0.2, 3.4, 10.8);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1006, 780), 0.5, 0.5, 0.82));
  composer.addPass(new OutputPass());

  /* ---------- helpers ---------- */
  function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = 4;
    return t;
  }
  const glowTex = canvasTex(128, 128, (g, w, h) => {
    const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    rg.addColorStop(0.7, 'rgba(255,255,255,0.06)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  });
  const puffTex = canvasTex(128, 128, (g, w, h) => {   /* a soft lumpy cloud for steam */
    for (let i = 0; i < 9; i++) {
      const x = w / 2 + rand(-22, 22), y = h / 2 + rand(-22, 22), r = rand(26, 44);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,0.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    }
  });
  const bubbleTex = canvasTex(64, 64, (g, w, h) => {
    const rg = g.createRadialGradient(w * 0.5, h * 0.5, w * 0.2, w * 0.5, h * 0.5, w * 0.5);
    rg.addColorStop(0, 'rgba(255,240,200,0.1)'); rg.addColorStop(0.8, 'rgba(255,245,220,0.8)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  });
  const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const add = (p, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };
  const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const glow = (color, size, x, y, z, op = 0.8) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.scale.set(size, size, 1); s.position.set(x, y, z); scene.add(s); return s;
  };

  const steelTex = canvasTex(512, 64, (g, w, h) => {   /* brushed steel with a soft fake reflection band */
    const gr = g.createLinearGradient(0, 0, w, 0);
    [['#5a5e63', 0], ['#9aa0a6', 0.12], ['#e4e8ec', 0.2], ['#8c9298', 0.3], ['#4c5055', 0.48], ['#7a8086', 0.62], ['#c8cdd2', 0.72], ['#6a6f75', 0.85], ['#5a5e63', 1]]
      .forEach(([c, s]) => gr.addColorStop(s, c));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'; g.fillRect(rand(0, w), 0, 1, h); }
  });
  const steel = std({ map: steelTex, metalness: 0.15, roughness: 0.3, color: 0xffffff, emissive: 0x16181a });
  const darkSteel = std({ color: 0x3a3d42, metalness: 0.6, roughness: 0.5 });
  const rubber = std({ color: 0x1c1c1e, roughness: 0.85 });
  const chrome = std({ color: 0xdfe3e8, metalness: 0.7, roughness: 0.18, emissive: 0x222428 });

  /* ---------- lights ---------- */
  scene.add(new THREE.HemisphereLight(0xffd9a8, 0x2a2018, 0.7));
  const shop = new THREE.DirectionalLight(0xffe2b8, 1.5);
  shop.position.set(3, 10, 7); shop.castShadow = true;
  shop.shadow.mapSize.set(1024, 1024);
  Object.assign(shop.shadow.camera, { left: -8, right: 8, top: 8, bottom: -6, near: 1, far: 30 });
  shop.shadow.bias = -0.0015;
  scene.add(shop);
  const bulbLights = [V(-3, 5.2, 0.6), V(3, 5.2, 0.6)].map((p) => { const l = new THREE.PointLight(0xffb860, 5, 12, 1.2); l.position.copy(p); scene.add(l); return l; });

  /* ---------- the garage: concrete floor, walls, window ---------- */
  const BACK_Z = -2.8;
  const floorTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#6e6a64'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14000; i++) { g.fillStyle = pick(['#5e5a55', '#7c7872', '#686460', '#84807a']); g.globalAlpha = rand(0.2, 0.6); g.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3)); }
    for (let i = 0; i < 10; i++) { g.globalAlpha = rand(0.06, 0.16); g.fillStyle = '#2a2622'; g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(20, 70), rand(10, 40), rand(0, 3), 0, 7); g.fill(); }   /* oil stains */
    g.globalAlpha = 0.5; g.strokeStyle = '#3e3a36'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();   /* expansion joints */
    g.globalAlpha = 1;
  }, 2, 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), std({ map: floorTex, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = 3; floor.receiveShadow = true; scene.add(floor);

  const wallTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8c7f6c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; g.fillRect(rand(0, w), rand(0, h), 2, 2); }
  }, 4, 2);
  const wallMat = std({ map: wallTex, roughness: 1 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(22, 12), wallMat);
  back.position.set(0, 6, BACK_Z); back.receiveShadow = true; scene.add(back);
  [-7.5, 7.5].forEach((x) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), wallMat); s.position.set(x, 6, 4); s.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(s); });
  /* a skirting strip where wall meets floor */
  add(scene, new THREE.BoxGeometry(22, 0.18, 0.05), std({ color: 0x5a4e40, roughness: 1 }), 0, 0.09, BACK_Z + 0.03);

  /* the window: a moonlit night outside */
  const winTex = canvasTex(256, 192, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0c1a3a'); gr.addColorStop(1, '#24406a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(255,255,255,' + rand(0.3, 0.9) + ')'; g.fillRect(rand(0, w), rand(0, h * 0.7), 1.5, 1.5); }
    const mg = g.createRadialGradient(190, 50, 0, 190, 50, 40); mg.addColorStop(0, 'rgba(255,250,225,0.5)'); mg.addColorStop(1, 'rgba(255,250,225,0)');
    g.fillStyle = mg; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(190, 50, 16, 0, 7); g.fill();
    g.fillStyle = '#0a1222'; g.beginPath(); g.moveTo(0, h);   /* treeline */
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h - 28 - Math.abs(Math.sin(x * 0.07)) * 26 - rand(0, 8));
    g.lineTo(w, h); g.fill();
  });
  const win = new THREE.Group(); win.position.set(-1.7, 4.5, BACK_Z + 0.02); scene.add(win);
  add(win, new THREE.PlaneGeometry(1.8, 1.3), new THREE.MeshBasicMaterial({ map: winTex, fog: false }));
  const frameMat = std({ color: 0xe8e0d0, roughness: 0.8 });
  [[0, 0.68, 1.96, 0.08], [0, -0.68, 1.96, 0.08], [-0.94, 0, 0.08, 1.44], [0.94, 0, 0.08, 1.44], [0, 0, 0.05, 1.3], [0, 0, 1.8, 0.05]]
    .forEach(([x, y, w, h]) => add(win, new THREE.BoxGeometry(w, h, 0.08), frameMat, x, y, 0.03));
  add(win, new THREE.BoxGeometry(2.1, 0.08, 0.22), frameMat, 0, -0.74, 0.1);   /* sill */

  /* chalkboard with tonight's brew */
  const chalkTex = canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = '#23302a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,0.03)'; g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(20, 80), rand(8, 20), rand(0, 3), 0, 7); g.fill(); }
    g.fillStyle = '#f2efe4'; g.textAlign = 'center';
    g.font = 'bold 54px "Comic Sans MS", "Segoe Print", cursive'; g.fillText('BREW NIGHT', w / 2, 72);
    g.font = '36px "Comic Sans MS", "Segoe Print", cursive';
    g.fillStyle = '#ffd88a'; g.fillText('Garage Gold Ale', w / 2, 132);
    g.fillStyle = '#e8e4d8'; g.textAlign = 'left';
    ['OG  1.056', 'FG  1.012', 'ABV  5.8%', 'Hops: Cascade'].forEach((s, i) => g.fillText(s, 70, 196 + i * 46));
    g.strokeStyle = '#f2efe4'; g.lineWidth = 3; g.beginPath(); g.moveTo(60, 92); g.lineTo(w - 60, 92); g.stroke();
  });
  const chalk = new THREE.Group(); chalk.position.set(-4.3, 4.4, BACK_Z + 0.03); scene.add(chalk);
  add(chalk, new THREE.PlaneGeometry(1.6, 1.2), std({ map: chalkTex, roughness: 1 }), 0, 0, 0.03);
  const woodMat = std({ color: 0x7a5432, roughness: 0.8 });
  [[0, 0.63, 1.76, 0.08], [0, -0.63, 1.76, 0.08], [-0.84, 0, 0.08, 1.3], [0.84, 0, 0.08, 1.3]]
    .forEach(([x, y, w, h]) => add(chalk, new THREE.BoxGeometry(w, h, 0.06), woodMat, x, y, 0.03));

  /* ---------- workbench, pegboard, shelf ---------- */
  const plankTex = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#a0703e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.strokeStyle = pick(['rgba(80,44,16,0.35)', 'rgba(200,150,90,0.25)', 'rgba(60,32,10,0.25)']); g.lineWidth = rand(1, 3); g.beginPath(); const y = rand(0, h); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rand(-8, 8), w * 0.7, y + rand(-8, 8), w, y + rand(-4, 4)); g.stroke(); }
    g.fillStyle = 'rgba(40,20,6,0.5)'; [0.33, 0.66].forEach((s) => g.fillRect(0, h * s, w, 2));
  });
  const benchMat = std({ map: plankTex, roughness: 0.75 });
  const BENCH = { x: 3.1, y: 2.3, z: -2.15, w: 4.6, d: 1.2 };
  const benchTop = BENCH.y + 0.07;
  shadowy(add(scene, new THREE.BoxGeometry(BENCH.w, 0.14, BENCH.d), benchMat, BENCH.x, BENCH.y, BENCH.z));
  const legMat = std({ color: 0x7c5530, roughness: 0.8 });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => shadowy(add(scene, new THREE.BoxGeometry(0.16, BENCH.y, 0.16), legMat, BENCH.x + sx * (BENCH.w / 2 - 0.15), BENCH.y / 2, BENCH.z + sz * (BENCH.d / 2 - 0.12))));
  shadowy(add(scene, new THREE.BoxGeometry(BENCH.w - 0.2, 0.08, BENCH.d - 0.2), benchMat, BENCH.x, 0.55, BENCH.z));
  /* brown bottles on the lower shelf */
  const bottleMat = std({ color: 0x3a1c06, roughness: 0.15, metalness: 0.2, emissive: 0x120600 });
  const capMat = std({ color: 0xc8a040, metalness: 0.7, roughness: 0.3 });
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Group(); b.position.set(BENCH.x - 1.9 + i * 0.27 + rand(-0.03, 0.03), 0.59, BENCH.z + rand(-0.2, 0.2)); scene.add(b);
    shadowy(add(b, lathe([[0, 0], [0.09, 0], [0.095, 0.02], [0.095, 0.42], [0.05, 0.54], [0.035, 0.6], [0.035, 0.7], [0, 0.7]], 16), bottleMat));
    add(b, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), capMat, 0, 0.71, 0);
  }

  const pegTex = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#b08458'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3e2c1c';
    for (let y = 16; y < h; y += 32) for (let x = 16; x < w; x += 32) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    const tool = (fn) => { g.save(); fn(); g.restore(); };
    g.fillStyle = '#2a2a2e'; g.strokeStyle = '#2a2a2e';
    tool(() => { g.translate(120, 80); g.fillRect(-8, 0, 16, 210); g.fillStyle = '#5a5e64'; g.fillRect(-50, -10, 100, 34); });   /* hammer */
    tool(() => { g.translate(260, 70); g.fillStyle = '#7a7e84'; g.fillRect(-10, 20, 20, 220); g.beginPath(); g.arc(0, 20, 30, 0, 7); g.fill(); g.fillStyle = '#b08458'; g.fillRect(-12, -14, 24, 30); });   /* wrench */
    tool(() => { g.translate(420, 70); g.fillStyle = '#8a8e94'; g.beginPath(); g.moveTo(-40, 0); g.lineTo(40, 0); g.lineTo(18, 300); g.lineTo(-6, 300); g.fill(); g.fillStyle = '#8a3020'; g.fillRect(-46, -60, 92, 64); });   /* saw */
    tool(() => { g.translate(600, 90); g.fillStyle = '#b02a20'; g.rotate(0.15); g.fillRect(-20, 60, 14, 150); g.rotate(-0.3); g.fillRect(6, 60, 14, 150); g.fillStyle = '#6a6e74'; g.fillRect(-14, 0, 28, 70); });   /* pliers */
    tool(() => { g.translate(760, 80); g.fillStyle = '#d8b030'; g.fillRect(-14, 70, 28, 120); g.fillStyle = '#6a6e74'; g.fillRect(-5, -40, 10, 112); });   /* screwdriver */
    tool(() => { g.translate(880, 120); g.strokeStyle = '#2a6aa0'; g.lineWidth = 14; g.beginPath(); g.arc(0, 0, 60, 0, 7); g.stroke(); g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 40, 0, 7); g.stroke(); });   /* coiled hose */
    g.fillStyle = '#5a5e64'; for (let i = 0; i < 6; i++) g.fillRect(120 + i * 140, 400, 60, 70);   /* little bins */
  });
  const peg = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), std({ map: pegTex, roughness: 0.9 }));
  peg.position.set(BENCH.x, 3.65, BACK_Z + 0.03); peg.receiveShadow = true; scene.add(peg);

  /* shelf over the grain sacks: hop jars and a bag of hops */
  shadowy(add(scene, new THREE.BoxGeometry(2.4, 0.08, 0.5), benchMat, -4.4, 2.9, BACK_Z + 0.25));
  [-5.3, -3.5].forEach((x) => add(scene, new THREE.BoxGeometry(0.06, 0.3, 0.4), legMat, x, 2.75, BACK_Z + 0.22));
  const hopTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#6a8a2a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = pick(['#8aae3c', '#4e6e1e', '#a8c858', '#5e7e22']); g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(5, 10), rand(3, 7), rand(0, 3), 0, 7); g.fill(); }
  });
  const jarGlass = std({ color: 0xd8ecf0, transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false });
  const lidMat = std({ color: 0xb8a060, metalness: 0.6, roughness: 0.35 });
  [[-5.2, 0.5], [-4.75, 0.42], [-4.32, 0.5]].forEach(([x, hh]) => {
    const j = new THREE.Group(); j.position.set(x, 2.94, BACK_Z + 0.27); scene.add(j);
    add(j, new THREE.CylinderGeometry(0.17, 0.17, hh * 0.85, 20), std({ map: hopTex, roughness: 0.9 }), 0, hh * 0.43, 0);
    add(j, new THREE.CylinderGeometry(0.19, 0.19, hh, 20), jarGlass, 0, hh / 2, 0);
    add(j, new THREE.CylinderGeometry(0.2, 0.2, 0.06, 20), lidMat, 0, hh + 0.03, 0);
  });
  const bagTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e8e2d0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a6a1e'; g.textAlign = 'center'; g.font = 'bold 54px Arial'; g.fillText('HOPS', w / 2, 110);
    g.font = '30px Arial'; g.fillText('CASCADE', w / 2, 160); g.fillText('1 lb', w / 2, 200);
  });
  shadowy(add(scene, new THREE.BoxGeometry(0.55, 0.65, 0.2), std({ map: bagTex, roughness: 0.7 }), -3.8, 3.27, BACK_Z + 0.25)).rotation.y = -0.1;

  /* ---------- grain sacks, and the brewery cat asleep on top ---------- */
  const burlapTex = (label) => canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#b89a68'; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.35;
    for (let y = 0; y < h; y += 4) { g.fillStyle = y % 8 ? '#9a7e50' : '#d0b688'; g.fillRect(0, y, w, 2); }
    for (let x = 0; x < w; x += 4) { g.fillStyle = x % 8 ? '#8e7448' : '#c8ae80'; g.fillRect(x, 0, 2, h); }
    g.globalAlpha = 0.85; g.fillStyle = '#5a2a14'; g.textAlign = 'center';
    g.font = 'bold 62px "Arial Black", Arial'; g.fillText(label[0], w / 2, 110);
    g.font = 'bold 34px Arial'; g.fillText(label[1], w / 2, 160);
    g.globalAlpha = 1;
  });
  function sack(label, w, hh, d) {
    const geo = new THREE.BoxGeometry(w, hh, d, 16, 6, 10);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {   /* pillow it: thick in the middle, pinched at the edges */
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const nx = Math.abs(x / (w / 2)), nz = Math.abs(z / (d / 2));
      const edge = Math.max(nx, nz);
      p.setY(i, y * (1 - 0.8 * Math.pow(edge, 2.2)) + Math.sin(x * 9 + z * 7) * 0.012);
      p.setX(i, x * (1 - 0.04 * (1 - Math.abs(y / (hh / 2)))));
    }
    geo.computeVertexNormals();
    return shadowy(new THREE.Mesh(geo, std({ map: burlapTex(label), roughness: 1 })));
  }
  const sack1 = sack(['PALE MALT', '2-ROW  \u00b7  50 LB'], 2.0, 0.62, 1.25); sack1.position.set(-3.95, 0.31, -1.75); sack1.rotation.y = 0.06; scene.add(sack1);
  const sack2 = sack(['CRYSTAL 60', 'CARAMEL MALT  \u00b7  25 LB'], 1.75, 0.55, 1.1); sack2.position.set(-3.85, 0.85, -1.7); sack2.rotation.y = -0.12; scene.add(sack2);

  /* the cat: an orange tabby curled up nose to tail */
  const tabbyTex = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#d98a3a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,220,160,0.12)' : 'rgba(120,50,10,0.1)'; g.fillRect(rand(0, w), rand(0, h), 1, 3); }
    g.fillStyle = 'rgba(140,62,14,0.75)';
    for (let i = 0; i < 16; i++) {
      const x0 = i * (w / 16) + rand(-3, 3);
      g.beginPath(); g.moveTo(x0, 0);
      for (let y = 0; y <= h; y += 8) g.lineTo(x0 + Math.sin(y * 0.08 + i) * 4 - 3, y);
      for (let y = h; y >= 0; y -= 8) g.lineTo(x0 + Math.sin(y * 0.08 + i) * 4 + 3 + rand(0, 2), y);
      g.fill();
    }
  }, 3, 2);
  const fur = std({ map: tabbyTex, roughness: 0.95 });
  const furPlain = std({ color: 0xd98a3a, roughness: 0.95 });
  const pink = std({ color: 0xe89a9a, roughness: 0.8 });
  const dark = std({ color: 0x2a1a10, roughness: 0.8 });
  const cat = new THREE.Group(); cat.position.set(-3.8, 1.08, -1.55); cat.rotation.y = 0.35; scene.add(cat);
  const catBody = shadowy(add(cat, new THREE.SphereGeometry(0.5, 32, 20), fur, 0, 0.25, 0));
  catBody.scale.set(1.2, 0.58, 0.82);
  shadowy(add(cat, new THREE.SphereGeometry(0.34, 24, 16), fur, -0.38, 0.26, 0.1)).scale.set(1, 0.85, 1);   /* haunch */
  [[0.32, 0.38], [0.58, 0.3]].forEach(([x, z]) => shadowy(add(cat, new THREE.SphereGeometry(0.09, 12, 10), furPlain, x, 0.07, z)).scale.set(1.6, 0.7, 1));   /* front paws */
  const headPiv = new THREE.Group(); headPiv.position.set(0.5, 0.2, 0.28); cat.add(headPiv);
  const head = new THREE.Group(); head.position.set(0.04, 0.05, 0.06); headPiv.add(head);
  shadowy(add(head, new THREE.SphereGeometry(0.25, 24, 18), fur, 0, 0, 0)).scale.set(1.05, 0.9, 0.95);
  add(head, new THREE.SphereGeometry(0.11, 16, 12), std({ color: 0xf0c898, roughness: 0.95 }), 0, -0.07, 0.19).scale.set(1.2, 0.75, 0.8);   /* muzzle */
  add(head, new THREE.SphereGeometry(0.03, 10, 8), pink, 0, -0.03, 0.27);   /* nose */
  const ears = [-1, 1].map((s) => {
    const e = new THREE.Group(); e.position.set(s * 0.13, 0.17, -0.02); e.rotation.z = -s * 0.32; head.add(e);
    add(e, new THREE.ConeGeometry(0.09, 0.17, 4), furPlain, 0, 0.07, 0).rotation.y = Math.PI / 4;
    add(e, new THREE.ConeGeometry(0.055, 0.11, 4), pink, 0, 0.06, 0.03).rotation.y = Math.PI / 4;
    return e;
  });
  const eyesShut = [-1, 1].map((s) => { const m = add(head, new THREE.BoxGeometry(0.08, 0.014, 0.02), dark, s * 0.09, 0.03, 0.21); m.rotation.z = s * 0.25; return m; });
  const eyeMat = std({ color: 0x9adf40, emissive: 0x3a7a10, emissiveIntensity: 0.8, roughness: 0.2 });
  const eyesOpen = [-1, 1].map((s) => {
    const e = new THREE.Group(); e.position.set(s * 0.09, 0.035, 0.2); head.add(e);
    add(e, new THREE.SphereGeometry(0.042, 14, 10), eyeMat).scale.set(1.15, 0.85, 0.6);
    add(e, new THREE.SphereGeometry(0.03, 10, 8), dark, 0, 0, 0.012).scale.set(0.3, 1, 0.6);
    e.visible = false; return e;
  });
  [-1, 1].forEach((s) => [0.02, -0.02].forEach((dy) => {   /* whiskers */
    const w = add(head, new THREE.BoxGeometry(0.2, 0.004, 0.004), std({ color: 0xf8f4ec }), s * 0.2, -0.06 + dy, 0.2);
    w.rotation.z = s * dy * 4; w.rotation.y = -s * 0.3;
  }));
  /* the tail: a chain of segments wrapped around the front */
  const tail = [];
  {
    let parent = new THREE.Group(); parent.position.set(-0.7, 0.1, 0.12); parent.rotation.y = -1.45; cat.add(parent);
    for (let i = 0; i < 10; i++) {
      const seg = new THREE.Group(); seg.position.x = i ? 0.13 : 0; parent.add(seg);
      const r0 = 0.075 - i * 0.003;
      const m = add(seg, new THREE.CylinderGeometry(r0 - 0.003, r0, 0.15, 10), i > 7 ? std({ color: 0x8a4a18, roughness: 0.95 }) : fur, 0.065, 0, 0);
      m.rotation.z = Math.PI / 2; m.castShadow = true;
      add(seg, new THREE.SphereGeometry(r0, 10, 8), i > 7 ? std({ color: 0x8a4a18, roughness: 0.95 }) : furPlain, 0, 0, 0);
      seg.userData.base = i ? 0.26 : 0;
      tail.push(seg); parent = seg;
    }
  }

  /* ---------- the propane burner and the boil kettle ---------- */
  const KET = { x: -1.55, z: -0.7, y: 0.6, r: 0.88, h: 1.5 };
  const burner = new THREE.Group(); burner.position.set(KET.x, 0, KET.z); scene.add(burner);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + 0.5;
    const leg = shadowy(add(burner, new THREE.BoxGeometry(0.07, 0.66, 0.07), darkSteel, Math.sin(a) * 0.62, 0.3, Math.cos(a) * 0.62));
    leg.rotation.set(Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
  }
  add(burner, new THREE.TorusGeometry(0.66, 0.035, 8, 40), darkSteel, 0, 0.58, 0).rotation.x = Math.PI / 2;
  add(burner, new THREE.TorusGeometry(0.3, 0.05, 8, 30), std({ color: 0x2a2624, roughness: 0.6, metalness: 0.5 }), 0, 0.3, 0).rotation.x = Math.PI / 2;
  add(burner, new THREE.CylinderGeometry(0.08, 0.12, 0.25, 12), darkSteel, 0, 0.17, 0);
  const flames = [];
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x4a8aff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.position.set(Math.sin(a) * 0.3, 0.42, Math.cos(a) * 0.3); burner.add(s); flames.push(s);
  }
  const flameCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a40, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  flameCore.position.set(0, 0.45, 0); flameCore.scale.set(1.2, 0.5, 1); burner.add(flameCore);
  const fireLight = new THREE.PointLight(0xff8a40, 3, 5, 1.5); fireLight.position.set(KET.x, 0.5, KET.z + 0.7); scene.add(fireLight);
  /* the propane tank and its hose */
  const tank = new THREE.Group(); tank.position.set(-2.55, 0, -2.2); scene.add(tank);
  const tankMat = std({ color: 0xe8e8e4, roughness: 0.45, metalness: 0.2 });
  shadowy(add(tank, lathe([[0, 0], [0.3, 0], [0.34, 0.08], [0.34, 0.75], [0.28, 0.9], [0.12, 0.96], [0, 0.96]], 28), tankMat));
  add(tank, new THREE.CylinderGeometry(0.2, 0.2, 0.18, 20, 1, true), tankMat, 0, 1.03, 0).material.side = THREE.DoubleSide;
  add(tank, new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10), std({ color: 0xa08a30, metalness: 0.7, roughness: 0.3 }), 0, 1.02, 0);
  add(scene, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-2.55, 1.05, -2.2), V(-2.4, 0.6, -1.9), V(-2.2, 0.05, -1.5), V(-1.8, 0.08, -1.0), V(KET.x - 0.05, 0.18, KET.z)]), 30, 0.025, 6), rubber);

  const kettle = new THREE.Group(); kettle.position.set(KET.x, KET.y, KET.z); scene.add(kettle);
  const kwall = shadowy(add(kettle, new THREE.CylinderGeometry(KET.r, KET.r - 0.03, KET.h, 56, 1, true), steel, 0, KET.h / 2, 0));
  kwall.material = steel.clone(); kwall.material.side = THREE.DoubleSide;
  add(kettle, new THREE.CircleGeometry(KET.r - 0.03, 40), darkSteel, 0, 0.01, 0).rotation.x = -Math.PI / 2;
  add(kettle, new THREE.TorusGeometry(KET.r, 0.035, 10, 56), chrome, 0, KET.h, 0).rotation.x = Math.PI / 2;
  [-1, 1].forEach((s) => { const hnd = add(kettle, new THREE.TorusGeometry(0.16, 0.03, 8, 20, Math.PI), chrome, s * (KET.r + 0.02), KET.h - 0.25, 0); hnd.rotation.set(0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0); });
  /* thermometer dial and the ball valve on the front */
  const dialTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#f4f0e4'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.strokeStyle = '#222'; g.lineWidth = 2;
    for (let i = 0; i <= 12; i++) { const a = Math.PI * 0.75 + i / 12 * Math.PI * 1.5; g.beginPath(); g.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); g.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); g.stroke(); }
    g.fillStyle = '#c02020'; g.beginPath(); g.arc(64 + Math.cos(Math.PI * 2.05) * 40, 64 + Math.sin(Math.PI * 2.05) * 40, 0, 0, 7); g.fill();
    g.strokeStyle = '#c02020'; g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(-0.3) * 44, 64 + Math.sin(-0.3) * 44); g.stroke();
    g.fillStyle = '#222'; g.font = 'bold 16px Arial'; g.textAlign = 'center'; g.fillText('212\u00b0', 64, 100);
  });
  const dialA = 0.35;
  const dial = new THREE.Group(); dial.position.set(Math.sin(dialA) * (KET.r + 0.02), KET.h * 0.62, Math.cos(dialA) * (KET.r + 0.02)); dial.rotation.y = dialA; kettle.add(dial);
  add(dial, new THREE.CylinderGeometry(0.15, 0.15, 0.05, 24), chrome, 0, 0, 0.02).rotation.x = Math.PI / 2;
  add(dial, new THREE.CircleGeometry(0.13, 24), std({ map: dialTex, roughness: 0.4 }), 0, 0, 0.05);
  const valve = new THREE.Group(); valve.position.set(Math.sin(-0.2) * KET.r, 0.18, Math.cos(-0.2) * KET.r); valve.rotation.y = -0.2; kettle.add(valve);
  add(valve, new THREE.CylinderGeometry(0.05, 0.05, 0.22, 12), chrome, 0, 0, 0.1).rotation.x = Math.PI / 2;
  add(valve, new THREE.BoxGeometry(0.24, 0.04, 0.05), std({ color: 0xc02020, roughness: 0.5 }), 0.08, 0.06, 0.14);
  /* the boiling wort */
  const wortTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7a3e0e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { g.fillStyle = pick(['rgba(200,120,40,0.35)', 'rgba(60,24,4,0.35)', 'rgba(230,170,90,0.25)']); g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(4, 18), rand(3, 10), rand(0, 3), 0, 7); g.fill(); }
    g.fillStyle = 'rgba(240,210,150,0.5)';
    for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(rand(0, w), rand(0, h), rand(1, 4), 0, 7); g.fill(); }
  });
  const WORT_Y = KET.h - 0.16;
  const wort = add(kettle, new THREE.CircleGeometry(KET.r - 0.035, 48), std({ map: wortTex, roughness: 0.25, emissive: 0x2a1000, emissiveIntensity: 0.6 }), 0, WORT_Y, 0);
  wort.rotation.x = -Math.PI / 2;
  add(kettle, new THREE.TorusGeometry(KET.r - 0.06, 0.04, 8, 48), std({ color: 0xd8b078, roughness: 0.9 }), 0, WORT_Y + 0.01, 0).rotation.x = Math.PI / 2;   /* foam ring */
  const boilBubbles = Array.from({ length: 16 }, () => {
    const m = add(kettle, new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0xc89058, roughness: 0.3, emissive: 0x301400 }), 0, WORT_Y, 0);
    m.userData = { t: rand(0, 1), r: rand(0.04, 0.09), sp: rand(0.8, 1.6) };
    return m;
  });
  const steam = Array.from({ length: 40 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xf0e6dc, transparent: true, opacity: 0, depthWrite: false }));
    s.userData = { life: rand(0, 1), dur: rand(3, 5.5), x: 0, z: 0, dx: 0, s0: 0 };
    scene.add(s); return s;
  });
  const KTOP = V(KET.x, KET.y + WORT_Y, KET.z);

  /* ---------- two carboys fermenting ---------- */
  const carGlass = std({ color: 0xbcdad0, transparent: true, opacity: 0.26, roughness: 0.04, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const carboyProfile = [[0, 0], [0.5, 0], [0.56, 0.06], [0.6, 0.2], [0.6, 1.05], [0.55, 1.25], [0.4, 1.42], [0.2, 1.52], [0.13, 1.58], [0.13, 1.74]];
  const carboys = [[0.35, -0.55, 0xd08a2a, 0x5a2e06], [1.55, -0.15, 0x6a3410, 0x2a1004]].map(([x, z, col, em], ci) => {
    const c = new THREE.Group(); c.position.set(x, 0, z); scene.add(c);
    const beer = add(c, lathe([[0, 0.04], [0.53, 0.04], [0.57, 0.2], [0.57, 1.0], [0, 1.0]]), std({ color: col, emissive: em, emissiveIntensity: 0.5, roughness: 0.2, transparent: true, opacity: 0.9 }));
    beer.castShadow = true;
    const krTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#d8b880'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 120; i++) { g.fillStyle = pick(['#f0dcb0', '#b89058', '#e8cc98']); g.beginPath(); g.arc(rand(0, w), rand(0, h), rand(3, 9), 0, 7); g.fill(); }
    });
    add(c, new THREE.CylinderGeometry(0.575, 0.575, 0.1, 40), std({ map: krTex, roughness: 0.95 }), 0, 1.04, 0);   /* krausen */
    const glassM = add(c, lathe(carboyProfile), carGlass); glassM.renderOrder = 2;
    add(c, new THREE.CylinderGeometry(0.16, 0.12, 0.14, 16), std({ color: 0xd07a30, roughness: 0.7 }), 0, 1.78, 0);   /* bung */
    const al = new THREE.Group(); al.position.y = 1.85; c.add(al);   /* the airlock */
    add(al, new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), jarGlass, 0, 0.06, 0);
    add(al, new THREE.CylinderGeometry(0.065, 0.065, 0.22, 16), jarGlass, 0, 0.22, 0).renderOrder = 2;
    add(al, new THREE.CylinderGeometry(0.06, 0.06, 0.08, 16), std({ color: 0xa8d8ff, transparent: true, opacity: 0.5, roughness: 0.1 }), 0, 0.15, 0);
    add(al, new THREE.CylinderGeometry(0.07, 0.07, 0.03, 16), std({ color: 0xe8e8e8, roughness: 0.5 }), 0, 0.34, 0);
    const blip = add(al, new THREE.SphereGeometry(0.028, 10, 8), std({ color: 0xffffff, transparent: true, opacity: 0.8, roughness: 0.1 }), 0, 0.12, 0);
    const fizz = Array.from({ length: 10 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, opacity: 0.8, depthWrite: false }));
      const a = rand(0, 6.3), r = rand(0, 0.45);
      s.position.set(Math.sin(a) * r, rand(0.1, 0.95), Math.cos(a) * r); s.scale.setScalar(rand(0.02, 0.04));
      s.userData.v = rand(0.08, 0.2); c.add(s); return s;
    });
    /* a strip of masking tape with the batch */
    const tapeTex = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#e8dcb0'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a3a8a'; g.font = 'bold 34px "Comic Sans MS", cursive'; g.textAlign = 'center'; g.fillText(ci ? 'STOUT  #98' : 'ALE  #99', w / 2, 44); });
    const tape = add(c, new THREE.CylinderGeometry(0.605, 0.605, 0.16, 40, 1, true, -0.5, 1.0), std({ map: tapeTex, roughness: 0.9, side: THREE.DoubleSide }), 0, 0.7, 0);
    tape.rotation.y = Math.atan2(-x, 10.8 - z) * 0.9;
    return { c, blip, blipT: rand(0.5, 3), blipK: -1, fizz };
  });

  /* ---------- the keg (bellhive99 House Ale) and the tap on the bench ---------- */
  const labelTex = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#f2e6c8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a1c12'; g.lineWidth = 14; g.strokeRect(22, 22, w - 44, h - 44);
    g.strokeStyle = '#c89a2a'; g.lineWidth = 4; g.strokeRect(44, 44, w - 88, h - 88);
    g.textBaseline = 'alphabetic';
    const word = (y, size) => {   /* the bellhive99 wordmark: bell + bold hive + 99 */
      g.font = size + 'px Georgia, serif'; const a = g.measureText('bell').width;
      g.font = 'bold ' + size + 'px Georgia, serif'; const b = g.measureText('hive').width;
      g.font = size + 'px Georgia, serif'; const c = g.measureText('99').width;
      let x = (w - a - b - c) / 2;
      g.fillStyle = '#3a2a1a'; g.font = size + 'px Georgia, serif'; g.fillText('bell', x, y); x += a;
      g.fillStyle = '#c8861a'; g.font = 'bold ' + size + 'px Georgia, serif'; g.fillText('hive', x, y); x += b;
      g.fillStyle = '#3a2a1a'; g.font = size + 'px Georgia, serif'; g.fillText('99', x, y);
    };
    word(210, 150);
    g.fillStyle = '#8a1c12'; g.textAlign = 'center'; g.font = 'bold 76px Georgia, serif'; g.fillText('HOUSE  ALE', w / 2, 320);
    g.fillStyle = '#5a4a3a'; g.font = 'italic 40px Georgia, serif'; g.fillText('Batch No. 99  \u00b7  Brewed in the garage', w / 2, 400);
    g.fillStyle = '#c89a2a'; [[150, 300], [w - 150, 300]].forEach(([x, y]) => {   /* little hop cones */
      for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(x, y - 40 + i * 22, 30 - i * 5, 16, 0, 0, 7); g.fill(); }
    });
  });
  const KEG = { x: 4.7, z: -0.55 };
  const keg = new THREE.Group(); keg.position.set(KEG.x, 0, KEG.z); keg.rotation.y = Math.atan2(-KEG.x, 10.8 - KEG.z); scene.add(keg);
  shadowy(add(keg, lathe([[0, 0.12], [0.44, 0.12], [0.5, 0.2], [0.5, 1.7], [0.46, 1.84], [0.3, 1.9], [0, 1.9]], 48), steel));
  add(keg, new THREE.CylinderGeometry(0.5, 0.5, 0.22, 40), rubber, 0, 0.11, 0);   /* bottom boot */
  const ring = add(keg, new THREE.CylinderGeometry(0.47, 0.47, 0.3, 40, 1, true), rubber, 0, 2.0, 0); ring.material = rubber.clone(); ring.material.side = THREE.DoubleSide;   /* top handle ring */
  add(keg, new THREE.CylinderGeometry(0.15, 0.15, 0.04, 20), steel, 0, 1.92, 0).scale.z = 0.7;   /* lid */
  [[-0.2, 0.05], [0.2, -0.05]].forEach(([x, z]) => add(keg, new THREE.CylinderGeometry(0.05, 0.05, 0.12, 6), chrome, x, 1.92, z));   /* posts */
  add(keg, new THREE.CylinderGeometry(0.506, 0.506, 0.62, 48, 1, true, -0.85, 1.7), std({ map: labelTex, roughness: 0.75, side: THREE.DoubleSide }), 0, 1.0, 0);
  /* a CO2 tank behind the keg */
  const co2 = new THREE.Group(); co2.position.set(5.6, 0, -1.6); scene.add(co2);
  shadowy(add(co2, lathe([[0, 0], [0.2, 0], [0.22, 0.05], [0.22, 1.1], [0.16, 1.24], [0, 1.26]], 24), std({ color: 0x2e6a3a, roughness: 0.4, metalness: 0.3 })));
  add(co2, new THREE.CylinderGeometry(0.05, 0.05, 0.18, 10), chrome, 0, 1.33, 0);
  add(co2, new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16), chrome, 0.08, 1.42, 0).rotation.z = Math.PI / 2;

  const TAP = { x: 3.2, z: -1.85 };
  shadowy(add(scene, new THREE.BoxGeometry(0.9, 0.06, 0.5), darkSteel, TAP.x, benchTop + 0.03, TAP.z + 0.02));   /* drip tray */
  add(scene, new THREE.BoxGeometry(0.84, 0.01, 0.44), std({ color: 0x8a8e94, metalness: 0.6, roughness: 0.4, wireframe: false }), TAP.x, benchTop + 0.065, TAP.z + 0.02);
  const TOWER_TOP = benchTop + 1.55;
  shadowy(add(scene, new THREE.CylinderGeometry(0.08, 0.1, TOWER_TOP - benchTop, 20), chrome, TAP.x, (benchTop + TOWER_TOP) / 2, TAP.z - 0.25));
  add(scene, new THREE.SphereGeometry(0.1, 16, 12), chrome, TAP.x, TOWER_TOP, TAP.z - 0.25);
  add(scene, new THREE.CylinderGeometry(0.15, 0.15, 0.05, 20), chrome, TAP.x, benchTop + 0.03, TAP.z - 0.25);
  add(scene, new THREE.CylinderGeometry(0.045, 0.045, 0.26, 12), chrome, TAP.x, TOWER_TOP - 0.06, TAP.z - 0.12).rotation.x = Math.PI / 2;   /* shank */
  add(scene, new THREE.CylinderGeometry(0.055, 0.05, 0.12, 12), chrome, TAP.x, TOWER_TOP - 0.06, TAP.z + 0.04).rotation.x = Math.PI / 2;   /* faucet body */
  const SPOUT_Y = TOWER_TOP - 0.18;
  add(scene, new THREE.CylinderGeometry(0.025, 0.03, 0.1, 10), chrome, TAP.x, SPOUT_Y + 0.05, TAP.z + 0.08);   /* spout */
  const handlePiv = new THREE.Group(); handlePiv.position.set(TAP.x, TOWER_TOP - 0.02, TAP.z + 0.06); scene.add(handlePiv);
  const handleTex = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#1e1410'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8a030'; g.font = 'bold 40px Georgia, serif'; g.textAlign = 'center';
    g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2); g.fillText('99', 0, 14); g.restore();
    g.fillRect(4, 10, w - 8, 4); g.fillRect(4, h - 14, w - 8, 4);
  });
  shadowy(add(handlePiv, new THREE.CylinderGeometry(0.065, 0.045, 0.62, 16), std({ map: handleTex, roughness: 0.5 }), 0, 0.36, 0));
  add(handlePiv, new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10), chrome, 0, 0.03, 0);
  /* the hose from the keg up to the tower */
  add(scene, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(KEG.x + 0.15, 2.0, KEG.z), V(KEG.x + 0.1, 2.7, KEG.z - 0.5), V(4.0, 2.9, -2.45), V(TAP.x + 0.12, benchTop + 0.35, TAP.z - 0.6), V(TAP.x + 0.06, benchTop + 0.02, TAP.z - 0.52)]), 40, 0.035, 8),
    std({ color: 0xe8e0c8, transparent: true, opacity: 0.85, roughness: 0.3 }));

  /* the pint glass */
  const G = { H: 0.8, base: 0.06, rB: 0.19, rT: 0.258 };
  const rIn = (y) => G.rB + (G.rT - G.rB) * Math.min(1, Math.max(0, (y - G.base) / (G.H - G.base)));
  const glassY = benchTop + 0.07;
  const pint = new THREE.Group(); pint.position.set(TAP.x, glassY, TAP.z + 0.08); scene.add(pint);
  const glassMesh = add(pint, lathe([[0, 0], [0.2, 0], [0.205, 0.03], [0.27, G.H], [G.rT, G.H], [G.rB, G.base], [0, G.base]], 48),
    std({ color: 0xe8f4f8, transparent: true, opacity: 0.13, roughness: 0.03, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  glassMesh.renderOrder = 3;
  const rimGlint = add(pint, new THREE.TorusGeometry(0.266, 0.006, 6, 48), std({ color: 0xffffff, emissive: 0x666666, transparent: true, opacity: 0.6 }), 0, G.H, 0); rimGlint.rotation.x = Math.PI / 2;
  const clip = new THREE.Plane(V(0, -1, 0), glassY);
  const beerTex = canvasTex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffc23a'); gr.addColorStop(1, '#d07810');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const beer = add(pint, new THREE.CylinderGeometry(G.rT - 0.004, G.rB - 0.004, G.H - G.base, 40), std({ map: beerTex, emissive: 0xb06000, emissiveIntensity: 0.7, roughness: 0.15, transparent: true, opacity: 0.96, clippingPlanes: [clip] }), 0, (G.H + G.base) / 2, 0);
  beer.renderOrder = 1;
  const foamTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#fff4dc'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { g.strokeStyle = pick(['rgba(220,190,140,0.5)', 'rgba(255,255,255,0.9)']); g.lineWidth = 1; g.beginPath(); g.arc(rand(0, w), rand(0, h), rand(1.5, 5), 0, 7); g.stroke(); }
  });
  const foamMat = std({ map: foamTex, roughness: 0.95, emissive: 0x302820 });
  const foamGeo = new THREE.CylinderGeometry(1, 1, 1, 40); foamGeo.translate(0, 0.5, 0);
  const foam = add(pint, foamGeo, foamMat);
  const dome = add(pint, new THREE.SphereGeometry(1, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), foamMat);
  const streamTex = canvasTex(32, 128, (g, w, h) => {
    g.fillStyle = '#e89a2a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = pick(['rgba(255,220,140,0.6)', 'rgba(160,80,10,0.5)']); g.fillRect(rand(0, w), rand(0, h), rand(2, 5), rand(8, 30)); }
  });
  const streamGeo = new THREE.CylinderGeometry(0.022, 0.026, 1, 12, 1, true); streamGeo.translate(0, -0.5, 0);
  const stream = add(scene, streamGeo, new THREE.MeshStandardMaterial({ map: streamTex, emissive: 0x8a4a00, emissiveIntensity: 0.7, roughness: 0.1, transparent: true, opacity: 0.92 }), TAP.x, SPOUT_Y, TAP.z + 0.08);
  stream.visible = false;
  const pintBubbles = Array.from({ length: 26 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, opacity: 0.9, depthWrite: false }));
    s.scale.setScalar(rand(0.015, 0.03)); s.userData = { a: rand(0, 6.3), r: rand(0, 0.8), y: rand(0, 1), v: rand(0.25, 0.55) };
    s.visible = false; pint.add(s); return s;
  });
  const drips = [-0.35, 0.05, 0.4].map((a) => {
    const m = add(pint, new THREE.SphereGeometry(0.026, 12, 10), foamMat); m.scale.set(1, 2.2, 0.5);
    m.userData.a = a; m.visible = false; return m;
  });

  /* ---------- string lights across the ceiling ---------- */
  const bulbs = [];
  const bulbMat = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  [[V(-7, 5.7, 0.8), V(7, 5.7, 0.8), 0.7], [V(-7, 5.4, -2.6), V(7, 5.6, -2.6), 0.45]].forEach(([a, b, sag]) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const u = i / 40; const p = a.clone().lerp(b, u); p.y -= Math.sin(u * Math.PI) * sag; pts.push(p); }
    add(scene, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.012, 4), std({ color: 0x222222 }));
    for (let i = 1; i < 22; i++) {
      const u = i / 22, p = a.clone().lerp(b, u); p.y -= Math.sin(u * Math.PI) * sag;
      const col = new THREE.Color(pick([0xffc870, 0xffb050, 0xffd890]));
      const m = add(scene, new THREE.SphereGeometry(0.06, 10, 8), bulbMat(col.clone().multiplyScalar(2.2)), p.x, p.y - 0.1, p.z);
      m.scale.y = 1.3;
      add(scene, new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), std({ color: 0x222222 }), p.x, p.y - 0.03, p.z);
      const gs = glow(col, 0.55, p.x, p.y - 0.1, p.z, 0.55);
      bulbs.push({ m, gs, col, ph: rand(0, 6.3) });
    }
  });

  /* ---------- pouring ---------- */
  let pourT = -1, autoT = 5;
  function pour() {
    if (pourT >= 0 && pourT < 13.5) return;   /* already pouring/drinking */
    pourT = 0; autoT = rand(30, 45);
  }
  const FULL = 0.62;
  /* returns { level, foam, dome, handle, stream } in glass-local units at pour time p */
  function pourState(p) {
    const s = { level: 0, foam: 0, dome: 0, handle: 0, stream: 0 };
    if (p < 0) return s;
    s.handle = smooth(0, 0.35, p) * (1 - smooth(4.0, 4.35, p));
    s.stream = p > 0.3 && p < 4.1 ? 1 : 0;
    const fill = smooth(0.35, 4.0, p);
    s.level = G.base + (FULL - G.base) * fill;
    s.foam = 0.012 + 0.07 * smooth(0.6, 4.0, p) + 0.06 * smooth(4.0, 5.6, p) - 0.05 * smooth(6.5, 11, p);
    s.dome = 0.01 + 0.05 * smooth(4.2, 5.6, p) - 0.035 * smooth(6.5, 11, p);
    /* four big gulps */
    let gone = 0;
    for (let i = 0; i < 4; i++) gone += 0.25 * smooth(14 + i * 1.6, 14.6 + i * 1.6, p);
    if (gone > 0) {
      s.level = G.base + (FULL - G.base) * (1 - gone);
      s.foam *= 1 - gone * 0.7;
      s.dome *= 1 - gone;
    }
    return s;
  }

  /* ---------- controls, click, sizing ---------- */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.4, 2.1, -1.2);
  Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.5, minPolarAngle: 1.15, maxPolarAngle: 1.6, minAzimuthAngle: -0.5, maxAzimuthAngle: 0.5 });
  controls.update();
  let lastTouch = -10;
  controls.addEventListener('start', () => { lastTouch = Infinity; renderer.domElement.style.cursor = 'grabbing'; });
  controls.addEventListener('end', () => { lastTouch = clock.elapsedTime; renderer.domElement.style.cursor = 'pointer'; });
  renderer.domElement.style.cursor = 'pointer';
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) pour();
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
  let onScreen = true, awake = 0, earT = rand(3, 7), earK = 0, flickT = rand(4, 9), flickK = 0;
  new IntersectionObserver(([en]) => (onScreen = en.isIntersecting)).observe(box);
  const sph = new THREE.Spherical(), off = V();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!onScreen) return;
    const t = clock.elapsedTime;

    if (t - lastTouch > 4) {
      off.subVectors(camera.position, controls.target); sph.setFromVector3(off);
      sph.theta += (Math.sin(t * 0.07) * 0.22 - sph.theta) * 0.01;
      off.setFromSpherical(sph); camera.position.copy(controls.target).add(off);
    }

    /* string lights twinkle a touch */
    for (const b of bulbs) { const k = 0.85 + Math.sin(t * 1.7 + b.ph) * 0.08 + (Math.random() < 0.002 ? -0.4 : 0); b.gs.material.opacity = 0.55 * k; }
    bulbLights.forEach((l, i) => (l.intensity = 5 + Math.sin(t * 1.3 + i) * 0.3));

    /* the burner flame and the rolling boil */
    flames.forEach((f, i) => { const k = 0.8 + Math.sin(t * 23 + i * 1.7) * 0.15 + Math.random() * 0.15; f.scale.set(0.16 * k, 0.3 * k, 1); });
    flameCore.material.opacity = 0.4 + Math.random() * 0.15;
    fireLight.intensity = 2.6 + Math.sin(t * 17) * 0.3 + Math.random() * 0.4;
    wort.material.map.offset.set(Math.sin(t * 0.3) * 0.05, t * 0.03);
    wort.rotation.z = t * 0.05;
    for (const b of boilBubbles) {
      const u = b.userData; u.t += dt * u.sp;
      if (u.t > 1) { u.t = 0; const a = rand(0, 6.3), r = rand(0, KET.r - 0.18); b.position.set(Math.sin(a) * r, WORT_Y, Math.cos(a) * r); }
      const k = Math.sin(u.t * Math.PI) * u.r; b.scale.set(k, k * 0.8, k);
    }
    for (const s of steam) {
      const u = s.userData; u.life += dt / u.dur;
      if (u.life >= 1) {
        u.life = 0; u.dur = rand(3, 5.5);
        const a = rand(0, 6.3), r = rand(0, KET.r * 0.7);
        u.x = KTOP.x + Math.sin(a) * r; u.z = KTOP.z + Math.cos(a) * r; u.dx = rand(-0.5, 0.7); u.s0 = rand(0.5, 0.9);
      }
      const L = u.life;
      s.position.set(u.x + u.dx * L * 3 + Math.sin(t * 0.8 + u.dur) * 0.1 * L, KTOP.y + L * 2.8, u.z + u.dx * L);
      const sc = u.s0 + L * 2.6; s.scale.set(sc, sc, 1);
      s.material.opacity = 0.11 * smooth(0, 0.12, L) * (1 - smooth(0.5, 1, L));
    }

    /* fermenting: airlocks blip, fizz rises */
    for (const cb of carboys) {
      cb.blipT -= dt;
      if (cb.blipT <= 0) { cb.blipT = rand(1.5, 4); cb.blipK = 0; }
      if (cb.blipK >= 0) { cb.blipK += dt * 3; cb.blip.position.y = 0.12 + Math.min(1, cb.blipK) * 0.16; cb.blip.visible = cb.blipK < 1; if (cb.blipK >= 1) { cb.blipK = -1; cb.blip.position.y = 0.12; cb.blip.visible = true; } }
      for (const f of cb.fizz) { f.position.y += f.userData.v * dt; if (f.position.y > 0.98) f.position.y = 0.08; }
    }

    /* the pint */
    autoT -= dt;
    if (autoT <= 0 && pourT < 0) pour();
    if (pourT >= 0) { pourT += dt; if (pourT > 20.5) pourT = -1; }
    const ps = pourState(pourT);
    handlePiv.rotation.x = ps.handle * 0.6;
    const has = pourT >= 0 && ps.level > G.base + 0.003;
    beer.visible = has;
    clip.constant = glassY + ps.level;
    const surfY = has ? ps.level : G.base;
    stream.visible = ps.stream > 0;
    if (stream.visible) { stream.scale.y = SPOUT_Y - (glassY + surfY); stream.material.map.offset.y = -t * 3; }
    const showFoam = pourT >= 0 && pourT > 0.45;
    foam.visible = dome.visible = showFoam;
    if (showFoam) {
      const fTop = Math.min(ps.level + ps.foam, G.H + 0.02);
      const rr = rIn(ps.level);
      const rTop = fTop > G.H ? G.rT + 0.008 : rIn(fTop);
      foam.position.y = ps.level; foam.scale.set((rr + rTop) / 2, Math.max(0.005, fTop - ps.level), (rr + rTop) / 2);
      dome.position.y = fTop; dome.scale.set(rTop, Math.max(0.004, ps.dome + Math.max(0, ps.level + ps.foam - fTop)), rTop);
    }
    for (const b of pintBubbles) {
      const u = b.userData;
      b.visible = has && u.y * (ps.level - G.base) + G.base < ps.level - 0.02;
      if (!has) continue;
      u.y += dt * u.v / Math.max(0.2, ps.level);
      if (u.y > 1) { u.y = 0; u.a = rand(0, 6.3); u.r = rand(0, 0.8); }
      const y = G.base + 0.02 + u.y * (ps.level - G.base - 0.04);
      b.position.set(Math.sin(u.a) * u.r * rIn(y), y, Math.cos(u.a) * u.r * rIn(y));
    }
    drips.forEach((d, i) => {   /* the head spills over the rim and runs down the glass */
      const k = (pourT - 4.6 - i * 0.45) / 2.8;
      d.visible = pourT >= 0 && k > 0 && k < 1;
      if (!d.visible) return;
      const y = G.H - k * (G.H - 0.12), r = 0.205 + (0.27 - 0.205) * (y / G.H) + 0.02;
      d.position.set(Math.sin(d.userData.a) * r, y, Math.cos(d.userData.a) * r);
      const s = 1 - k * 0.6; d.scale.set(s, 2.2 * s, 0.5 * s);
    });

    /* the cat: breathes, twitches, and wakes up for a pour */
    const wantAwake = pourT >= 0.2 && pourT < 9 ? 1 : 0;
    awake += (wantAwake - awake) * Math.min(1, dt * (wantAwake ? 2.5 : 0.8));
    catBody.scale.y = 0.58 + Math.sin(t * 1.6) * 0.015 * (1 - awake * 0.5);
    headPiv.rotation.x = -0.38 * awake;
    headPiv.rotation.y = 0.35 * awake;
    headPiv.position.y = 0.2 + 0.12 * awake;
    eyesOpen.forEach((e) => (e.visible = awake > 0.55));
    eyesShut.forEach((e) => (e.visible = awake <= 0.55));
    earT -= dt; if (earT <= 0) { earT = rand(3, 8); earK = 1; }
    earK = Math.max(0, earK - dt * 4);
    ears.forEach((e, i) => { const s = i ? 1 : -1; e.rotation.z = -s * (0.32 - 0.15 * awake) + (i ? Math.sin(earK * 18) * 0.25 * earK : 0); });
    flickT -= dt; if (flickT <= 0) { flickT = rand(3, 7); flickK = 1; }
    flickK = Math.max(0, flickK - dt * 1.2);
    tail.forEach((s, i) => {
      const u = i / tail.length;
      s.rotation.y = s.userData.base + Math.sin(t * 0.9 + i * 0.5) * 0.03 + (u > 0.6 ? Math.sin(t * 9 + i) * 0.22 * flickK * u : 0) + awake * 0.08 * Math.sin(t * 5 + i * 0.7) * u;
    });

    controls.update();
    composer.render();
  });
};
