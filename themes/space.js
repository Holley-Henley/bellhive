/* bellhive99.com - home page theme: Star Wars (classic space opera)
 * Starfighter dogfight in deep space: light fighters (orange engines, red bolts) and dark delta
 * fighters (green engines, green bolts) chase each other near a moon-sized battle station and a
 * ringed planet. Hits spark, ships explode and warp back in. Two droids bicker on a floating rock. The bellhive99 logo is a flickering
 * hologram projected toward the fight. The station is an armored sphere with a superlaser dish that fires now and then. Click anywhere for the jump to lightspeed.
 * All ships and the station are original designs. Loaded by INDEXB.HTM (see themes/themes.js).
 */
(window.BHScenes = window.BHScenes || {}).space = function (box, lib) {
  const { THREE, OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = lib;
  const ASPECT = 453 / 503, CROP = 780 / 1006;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const glowColor = (r, g, b) => new THREE.Color(r, g, b);   /* > 1 so bloom picks it up */

  box.title = 'Drag to look around \u00b7 click to jump to lightspeed';
  box.style.position = 'relative';
  /* black space, faded into the page at the edges */
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
  renderer.setClearColor(0x02030a, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  box.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const flash = document.createElement('div');   /* white-out at the lightspeed jump */
  flash.style.cssText = 'position:absolute;inset:0;background:#e8f4ff;opacity:0;pointer-events:none;';
  box.appendChild(flash);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1 / ASPECT, 0.1, 1200);
  camera.position.set(0, 3.2, 15.5);
  scene.add(camera);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1006, 780), 0.6, 0.45, 0.78);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- textures ---------- */
  function canvasTex(w, h, draw, repeatX = 1, repeatY = 1, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = 4;
    return t;
  }
  const glowTex = canvasTex(128, 128, (g, w, h) => {
    const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    rg.addColorStop(0.5, 'rgba(255,255,255,0.12)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  });
  const glowSprite = (color, scale, opacity = 1) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.scale.setScalar(scale);
    return s;
  };

  /* ---------- lights ---------- */
  scene.add(new THREE.AmbientLight(0x3a4a7a, 0.55));
  const SUN_DIR = V(60, 22, -70);
  const sunLight = new THREE.DirectionalLight(0xfff1dc, 3.0);
  sunLight.position.copy(SUN_DIR);
  scene.add(sunLight);
  const rim = new THREE.DirectionalLight(0x6f8cff, 0.8);
  rim.position.set(-40, -10, 30);
  scene.add(rim);

  /* ---------- the far background: stars, nebulae, sun, planet, station ---------- */
  const far = new THREE.Group(); scene.add(far);

  function starLayer(n, size, rMin, rMax) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const v = V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(rMin, rMax));
      pos.set([v.x, v.y, v.z], i * 3);
      c.setHSL(pick([0.6, 0.62, 0.08, 0.12, 0.0]), rand(0.1, 0.5), rand(0.65, 0.95));
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ size, map: glowTex, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }));
  }
  far.add(starLayer(3500, 2.4, 300, 500), starLayer(300, 4.5, 300, 500));

  const nebTex = canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < 26; i++) {
      const x = w / 2 + rand(-35, 35), y = h / 2 + rand(-35, 35), r = rand(25, 85);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,0.22)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    }
    g.globalCompositeOperation = 'destination-in';   /* soft edge so the sprite square never shows */
    const fade = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w / 2);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, w, h);
  });
  [[0x6a3dbf, V(-160, 60, -260), 260], [0x1f6f9c, V(150, -40, -280), 300], [0xb2386e, V(40, 120, -300), 220], [0x2c3f9e, V(-220, -80, 120), 320]]
    .forEach(([col, p, s]) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebTex, color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.position.copy(p); sp.scale.setScalar(s); far.add(sp);
    });

  const sunGlow = glowSprite(glowColor(3, 2.5, 1.8), 60); sunGlow.position.copy(SUN_DIR).multiplyScalar(4); far.add(sunGlow);
  const sunCore = glowSprite(glowColor(6, 5.5, 5), 14); sunCore.position.copy(sunGlow.position); far.add(sunCore);

  /* ringed gas giant */
  const planet = new THREE.Group(); planet.position.set(-40, -13, -78); far.add(planet);
  const bandTex = (hue) => canvasTex(512, 256, (g, w, h) => {
    for (let y = 0; y < h; y += 2) {
      const l = 0.35 + 0.18 * Math.sin(y * 0.09) + 0.08 * Math.sin(y * 0.31) + rand(-0.03, 0.03);
      g.fillStyle = `hsl(${hue + Math.sin(y * 0.05) * 12}, 45%, ${l * 100}%)`;
      g.fillRect(0, y, w, 2);
    }
    for (let i = 0; i < 40; i++) {   /* storms */
      g.fillStyle = `hsla(${hue + rand(-20, 20)}, 50%, ${rand(30, 70)}%, 0.25)`;
      g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(8, 40), rand(2, 7), 0, 0, 7); g.fill();
    }
  });
  const planetMat = new THREE.MeshStandardMaterial({ map: bandTex(28), roughness: 1 });
  const planetBall = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 40), planetMat);
  planet.add(planetBall);
  const ringTex = canvasTex(512, 512, (g, w, h) => {
    for (let r = 0; r < w / 2; r += 1) {
      const t = r / (w / 2);
      if (t < 0.62) continue;
      const a = (0.25 + 0.5 * Math.abs(Math.sin(r * 0.21)) * Math.abs(Math.sin(r * 0.047))) * (t > 0.97 ? 0 : 1);
      g.strokeStyle = `rgba(${200 + rand(0, 40)}, ${170 + rand(0, 30)}, ${130 + rand(0, 30)}, ${a})`;
      g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.stroke();
    }
  }, 1, 1);
  ringTex.wrapS = ringTex.wrapT = THREE.ClampToEdgeWrapping;
  const ring = new THREE.Mesh(new THREE.RingGeometry(12.5, 20, 128), new THREE.MeshStandardMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, roughness: 1, depthWrite: false }));
  ring.rotation.set(-1.25, 0.25, 0.3);
  planet.add(ring);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 32, 20), new THREE.MeshStandardMaterial({ color: 0x9a9690, roughness: 1 }));
  moon.position.set(24, 6, 10); planet.add(moon);

  /* the battle station: a moon-sized armored sphere with an equatorial trench and a superlaser dish */
  const SR = 11;
  const station = new THREE.Group(); station.position.set(15, 3.2, -72); far.add(station);
  station.rotation.set(0.12, -0.25, 0.18);
  const spin = new THREE.Group(); station.add(spin);
  /* hull: an equirectangular map of panels, trenches and tiny lights (v = 0.5 is the equator) */
  const HW = 2048, HH = 1024;
  const hullCanvas = (lights) => (g, w, h) => {
    g.fillStyle = lights ? '#26282c' : '#5a5e64'; g.fillRect(0, 0, w, h);   /* the light map carries a dim base glow so the night side still reads as gray */
    for (let row = 0; row < 64; row++) {
      const y0 = (row / 64) * h, rh = h / 64, lat = Math.abs(row / 64 - 0.5) * Math.PI;
      const cells = Math.max(8, Math.round(160 * Math.cos(lat)));
      for (let c = 0; c < cells; c++) {
        const x0 = (c / cells) * w, cw = w / cells;
        if (lights) {
          if (Math.random() < 0.05) for (let k = 0; k < 2; k++) { g.fillStyle = pick(['#fff4d0', '#d0e6ff', '#ffe6a0']); g.fillRect(x0 + rand(1, cw - 3), y0 + rand(1, rh - 2), 2, 1.5); }
          continue;
        }
        const v = Math.floor(rand(70, 120));
        g.fillStyle = `rgb(${v},${v + 2},${v + 6})`; g.fillRect(x0 + 1, y0 + 1, cw - 2, rh - 2);
        if (Math.random() < 0.3) { g.fillStyle = `rgba(0,0,0,${rand(0.2, 0.45)})`; g.fillRect(x0 + rand(2, cw / 2), y0 + 2, rand(3, cw / 2), rh - 4); }   /* recessed panels */
        if (Math.random() < 0.08) { g.fillStyle = 'rgba(200,205,215,0.5)'; g.fillRect(x0 + cw * 0.3, y0 + rh * 0.2, cw * 0.4, rh * 0.6); }   /* towers catching the light */
      }
    }
    if (!lights) {
      g.strokeStyle = 'rgba(20,22,26,0.7)'; g.lineWidth = 2;   /* long service trenches */
      for (let i = 0; i < 22; i++) { const y = rand(0.1, 0.9) * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (let i = 0; i < 40; i++) { const x = rand(0, w), y = rand(0.12, 0.88) * h; g.fillStyle = 'rgba(25,27,30,0.8)'; g.fillRect(x, y, rand(40, 200), 3); }
      const eq = h / 2;   /* the equatorial trench: dark, with lit walls */
      g.fillStyle = '#15171a'; g.fillRect(0, eq - 9, w, 18);
      g.fillStyle = 'rgba(150,155,165,0.6)'; g.fillRect(0, eq - 11, w, 2); g.fillRect(0, eq + 9, w, 2);
    } else {
      g.fillStyle = '#08090a'; g.fillRect(0, h / 2 - 9, w, 18);
      for (let i = 0; i < 90; i++) { g.fillStyle = pick(['#fff4d0', '#d0e6ff']); g.fillRect(rand(0, w), h / 2 + rand(-8, 8), 2, 1.5); }
    }
  };
  const hullMap = canvasTex(HW, HH, hullCanvas(false));
  const lightMap = canvasTex(HW, HH, hullCanvas(true));
  const hullMat = new THREE.MeshStandardMaterial({ map: hullMap, bumpMap: hullMap, bumpScale: 1.5, emissiveMap: lightMap, emissive: 0xffffff, emissiveIntensity: 1.0, metalness: 0.35, roughness: 0.65 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(SR, 96, 64), hullMat); spin.add(ball);
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x4a4e55, metalness: 0.4, roughness: 0.6 });
  for (const y of [-0.22, 0.22]) { const lip = new THREE.Mesh(new THREE.TorusGeometry(SR * Math.cos(y / SR), 0.07, 6, 160), lipMat); lip.rotation.x = Math.PI / 2; lip.position.y = y; spin.add(lip); }
  /* the superlaser dish: a shaded concave cap, a rim, tributary emitters and a focus point */
  const DISH_A = 0.36;   /* angular radius of the dish */
  const dishTex = canvasTex(512, 256, (g, w, h) => {   /* x = angle around the dish, y = from centre (bottom) to rim (top) */
    for (let y = 0; y < h; y++) {
      const r = 1 - y / h;
      for (let x = 0; x < w; x += 4) {
        const ang = (x / w) * Math.PI * 2;
        const shade = 70 + 55 * Math.cos(ang - 2.4) * r + 20 * (1 - r);   /* lit on one inner wall, dark on the other */
        g.fillStyle = `rgb(${shade | 0},${(shade + 2) | 0},${(shade + 6) | 0})`; g.fillRect(x, y, 4, 1);
      }
    }
    g.strokeStyle = 'rgba(20,22,26,0.55)'; g.lineWidth = 2;
    for (let i = 1; i < 6; i++) { const y = (i / 6) * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }   /* concentric rings */
    for (let i = 0; i < 24; i++) { const x = (i / 24) * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }   /* radial ribs */
  });
  dishTex.wrapS = THREE.RepeatWrapping; dishTex.wrapT = THREE.ClampToEdgeWrapping;
  const dish = new THREE.Group(); spin.add(dish);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(SR * 1.003, 64, 16, 0, Math.PI * 2, 0, DISH_A), new THREE.MeshStandardMaterial({ map: dishTex, roughness: 0.7, metalness: 0.3 }));
  dish.add(cap);
  const dishRim = new THREE.Mesh(new THREE.TorusGeometry(SR * Math.sin(DISH_A), 0.14, 8, 96), lipMat); dishRim.rotation.x = Math.PI / 2; dishRim.position.y = SR * Math.cos(DISH_A); dish.add(dishRim);
  const focusPos = V(0, SR * 1.01, 0);
  const emitMat = new THREE.MeshBasicMaterial({ color: glowColor(0.3, 1.2, 0.4), toneMapped: false });
  const focus = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), emitMat); focus.position.copy(focusPos); dish.add(focus);
  const focusGlow = glowSprite(glowColor(0.6, 3, 0.8), 2.2, 0.3); focusGlow.position.copy(focusPos); dish.add(focusGlow);
  const tribs = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, rr = SR * Math.sin(DISH_A * 0.62), yy = SR * Math.cos(DISH_A * 0.62) + 0.05;
    const e = glowSprite(glowColor(0.6, 3, 0.8), 0.7, 0.2); e.position.set(Math.cos(a) * rr, yy, Math.sin(a) * rr); dish.add(e); tribs.push(e);
  }
  const beamMat = new THREE.MeshBasicMaterial({ color: glowColor(0.8, 4, 1.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 120, 12, 1, true), beamMat); beam.position.set(0, SR + 60, 0); dish.add(beam);
  /* point the dish up and toward the viewer, off to one side */
  dish.quaternion.setFromUnitVectors(V(0, 1, 0), V(0.15, 0.45, 0.88).normalize());
  let laserT = rand(10, 18);
  /* a few red warning lights on towers */
  const beacons = [];
  for (let k = 0; k < 10; k++) {
    const b = glowSprite(glowColor(4, 0.4, 0.3), 0.6);
    const d = V(rand(-1, 0.3), rand(-0.7, 0.7), rand(0.3, 1)).normalize().multiplyScalar(SR * 1.02);
    b.position.copy(d); spin.add(b); beacons.push(b);
  }
  /* bellhive99 hologram, projected from the station toward the fight */
  const holoTex = canvasTex(1024, 256, (g, w, h) => {
    g.font = '900 150px "Arial Black", "Segoe UI Black", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(80,200,255,1)'; g.shadowBlur = 28;
    g.fillStyle = '#c8f2ff';
    const text = 'bellhive99', spacing = 6;
    const widths = [...text].map((ch) => g.measureText(ch).width);
    let x = w / 2 - (widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1)) / 2;
    [...text].forEach((ch, i) => { g.textAlign = 'left'; g.fillText(ch, x, h / 2 + 6); x += widths[i] + spacing; });
    g.shadowBlur = 0;
    g.globalCompositeOperation = 'destination-out';   /* scan lines */
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = 0; y < h; y += 5) g.fillRect(0, y, w, 2);
  }, 1, 1);
  holoTex.wrapS = holoTex.wrapT = THREE.ClampToEdgeWrapping;
  const holoMat = new THREE.SpriteMaterial({ map: holoTex, color: glowColor(0.75, 1.0, 1.25), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const holo = new THREE.Sprite(holoMat);
  holo.scale.set(11, 2.75, 1);
  far.add(holo);
  const holoBase = new THREE.Vector3();
  const placeHolo = () => { holoBase.set(-2.4, -6.0, -4); holo.position.copy(holoBase); };
  placeHolo();

  /* ---------- starfighters ---------- */
  const mats = {
    lightHull: new THREE.MeshStandardMaterial({ color: 0xe6e2da, metalness: 0.15, roughness: 0.5 }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xd2621e, metalness: 0.2, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2a3a4a, metalness: 0.6, roughness: 0.1, transparent: true, opacity: 0.45 }),
    helmet: new THREE.MeshStandardMaterial({ color: 0xe86a1e, roughness: 0.45 }),
    grey: new THREE.MeshStandardMaterial({ color: 0x7d838c, metalness: 0.3, roughness: 0.45 }),
    darkHull: new THREE.MeshStandardMaterial({ color: 0x5b6270, metalness: 0.3, roughness: 0.45 }),
    darkTrim: new THREE.MeshStandardMaterial({ color: 0x343841, metalness: 0.3, roughness: 0.4 }),
    orange: new THREE.MeshBasicMaterial({ color: glowColor(2.6, 1.1, 0.3), toneMapped: false }),
    green: new THREE.MeshBasicMaterial({ color: glowColor(0.4, 2.6, 0.7), toneMapped: false }),
  };
  const disc = new THREE.CircleGeometry(0.075, 16).rotateY(Math.PI);

  function lightFighter() {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
    add(new THREE.BoxGeometry(0.28, 0.22, 1.1), mats.lightHull, 0, 0, 0);
    add(new THREE.ConeGeometry(0.16, 0.5, 4).rotateX(Math.PI / 2), mats.lightHull, 0, 0, 0.8, 0, 0, Math.PI / 4);
    add(new THREE.SphereGeometry(0.065, 12, 10), mats.helmet, 0, 0.15, 0.18);   /* the pilot */
    add(new THREE.BoxGeometry(0.07, 0.025, 0.02), mats.darkTrim, 0, 0.155, 0.24);
    add(new THREE.SphereGeometry(0.12, 12, 8).scale(1, 0.75, 1.7), mats.glass, 0, 0.13, 0.22);
    add(new THREE.BoxGeometry(0.06, 0.225, 0.5), mats.stripe, 0, 0.001, 0.15);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.85, 0.04, 0.36), mats.lightHull, s * 0.55, -0.02, -0.22, 0, s * 0.38, s * 0.1);
      add(new THREE.BoxGeometry(0.22, 0.045, 0.3), mats.stripe, s * 0.8, 0.0, -0.33, 0, s * 0.38, s * 0.1);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6).rotateX(Math.PI / 2), mats.grey, s * 0.98, 0.02, -0.12);   /* wingtip cannons */
      add(new THREE.CylinderGeometry(0.1, 0.09, 0.5, 12).rotateX(Math.PI / 2), mats.grey, s * 0.24, 0, -0.45);
      add(disc, mats.orange, s * 0.24, 0, -0.705);
      const gl = glowSprite(glowColor(2, 0.8, 0.2), 0.32); gl.position.set(s * 0.24, 0, -0.75); g.add(gl);
    }
    g.userData = { guns: [V(-0.98, 0.02, 0.3), V(0.98, 0.02, 0.3)], bolt: 'red', glows: g.children.filter((c) => c.isSprite) };
    return g;
  }
  const deltaGeo = (() => {
    const s = new THREE.Shape(); s.moveTo(0, 0.95); s.lineTo(-0.8, -0.55); s.lineTo(-0.22, -0.42); s.lineTo(0, -0.6); s.lineTo(0.22, -0.42); s.lineTo(0.8, -0.55); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 1 });
    geo.rotateX(Math.PI / 2); geo.translate(0, 0.04, 0);
    return geo;
  })();
  function darkFighter() {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
    add(deltaGeo, mats.darkHull, 0, 0, 0);
    add(new THREE.BoxGeometry(0.3, 0.16, 0.9), mats.darkTrim, 0, 0.08, 0.05);
    add(new THREE.BoxGeometry(0.04, 0.36, 0.5), mats.darkHull, 0, 0.27, -0.28, -0.35, 0, 0);
    add(new THREE.BoxGeometry(0.2, 0.03, 0.12), mats.darkTrim, 0, 0.17, 0.32);
    for (const x of [-0.2, 0, 0.2]) {
      add(disc, mats.green, x, 0.06, -0.52);
      const gl = glowSprite(glowColor(0.3, 2, 0.6), 0.28); gl.position.set(x, 0.06, -0.56); g.add(gl);
    }
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.05, 0.45).translate(0, 0, 0.1), mats.darkTrim, s * 0.55, 0, -0.1);
    g.userData = { guns: [V(-0.55, 0, 0.4), V(0.55, 0, 0.4)], bolt: 'green', glows: g.children.filter((c) => c.isSprite) };
    return g;
  }

  const fleet = new THREE.Group(); scene.add(fleet);
  function pathFn(seed) {
    const A = V(rand(6.5, 9), rand(2.4, 3.8), rand(4.5, 6.5));
    const W = V(rand(0.32, 0.46), rand(0.5, 0.8), rand(0.28, 0.5)).multiplyScalar(seed.dir);
    const P = V(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3));
    return (t, out) => out.set(A.x * Math.sin(W.x * t + P.x), A.y * Math.sin(W.y * t + P.y), A.z * Math.sin(W.z * t + P.z));
  }
  const ships = [];
  function addShip(kind, path, delay, role) {
    const obj = kind === 'light' ? lightFighter() : darkFighter();
    fleet.add(obj);
    const s = { obj, path, delay, role, kind, hp: 4, dead: 0, cool: rand(0.5, 2), burst: 0, lastKill: 0, target: null, fwd: V(0, 0, 1), pos: V(), vel: V() };
    ships.push(s);
    return s;
  }
  for (let i = 0; i < 5; i++) {
    const path = pathFn({ dir: i % 2 ? 1 : -1 });
    const leadKind = i % 2 ? 'light' : 'dark';
    const lead = addShip(leadKind, path, 0, 'lead');
    const chaser = addShip(leadKind === 'light' ? 'dark' : 'light', path, rand(0.38, 0.62), 'chaser');
    chaser.target = lead; lead.hp = Math.floor(rand(3, 7));
    if (i < 2) { const wing = addShip(chaser.kind, path, chaser.delay + rand(0.25, 0.35), 'wing'); wing.target = lead; }
  }

  /* ---------- lasers, sparks, explosions ---------- */
  const boltGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6).rotateX(Math.PI / 2);
  const boltMat = { red: new THREE.MeshBasicMaterial({ color: glowColor(6, 0.5, 0.3), toneMapped: false }), green: new THREE.MeshBasicMaterial({ color: glowColor(0.5, 6, 0.8), toneMapped: false }) };
  const bolts = [];
  for (let i = 0; i < 80; i++) { const m = new THREE.Mesh(boltGeo, boltMat.red); m.visible = false; scene.add(m); bolts.push({ m, vel: V(), life: 0, target: null }); }
  const sparks = [];
  for (let i = 0; i < 16; i++) { const s = glowSprite(glowColor(4, 3, 2), 0.1); s.visible = false; scene.add(s); sparks.push({ s, t: 0 }); }
  const booms = [];
  for (let i = 0; i < 6; i++) {
    const n = 90, geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { const c = new THREE.Color().setHSL(rand(0.02, 0.13), 1, rand(0.5, 0.75)).multiplyScalar(3); col.set([c.r, c.g, c.b], k * 3); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    pts.visible = false; scene.add(pts);
    const fl = glowSprite(glowColor(5, 3.2, 1.6), 1); fl.visible = false; scene.add(fl);
    booms.push({ pts, fl, vels: Array.from({ length: n }, () => V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(1.5, 7))), t: -1, at: V() });
  }
  const spark = (p, scale = 0.9) => { const s = sparks.find((x) => !x.s.visible) || sparks[0]; s.s.position.copy(p); s.s.visible = true; s.t = 0; s.max = scale; };
  function explode(p) {
    const b = booms.find((x) => x.t < 0) || booms[0];
    b.t = 0; b.at.copy(p); b.pts.visible = true; b.fl.visible = true; b.fl.position.copy(p);
  }
  function fire(s) {
    const b = bolts.find((x) => !x.m.visible);
    if (!b) return;
    const gun = s.obj.userData.guns[(s.gunIx = (s.gunIx || 0) ^ 1)];
    b.m.material = boltMat[s.obj.userData.bolt];
    b.m.position.copy(gun).applyMatrix4(s.obj.matrixWorld);
    b.vel.copy(s.fwd).multiplyScalar(38).add(s.vel);
    b.m.lookAt(b.m.position.x + b.vel.x, b.m.position.y + b.vel.y, b.m.position.z + b.vel.z);
    b.m.visible = true; b.life = 0.9; b.target = s.target;
    spark(b.m.position, 0.45);   /* muzzle flash */
  }

  /* ---------- two droids on a floating rock: a fussy gold one and a little dome-headed one ---------- */
  const duel = new THREE.Group(); duel.position.set(4.1, -2.1, 3.9); scene.add(duel);
  const gold = {}, dome = {};
  {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a625a, roughness: 1, flatShading: true });
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 1), rockMat); rock.scale.set(1.35, 0.45, 1.1); rock.position.y = -0.55; duel.add(rock);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.85, 0.12, 9), rockMat); top.position.y = -0.06; duel.add(top);
    const add = (p, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };

    /* the tall gold one: slim, jointed, gestures a lot */
    const gm = new THREE.MeshStandardMaterial({ color: 0xe0b048, metalness: 0.55, roughness: 0.28, emissive: 0x3a2808, emissiveIntensity: 0.4 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.6, roughness: 0.3, emissive: 0x202428, emissiveIntensity: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.6 });
    const g = new THREE.Group(); g.position.set(-0.55, 0.06, 0.1); g.rotation.y = 0.5; g.scale.setScalar(1.5); duel.add(g);
    const hips = new THREE.Group(); hips.position.y = 0.5; g.add(hips);
    add(hips, new THREE.BoxGeometry(0.2, 0.08, 0.12), gm);
    const legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.065, -0.03, 0); hips.add(hip);
      add(hip, new THREE.CylinderGeometry(0.035, 0.03, 0.22, 10), gm, 0, -0.11, 0);
      add(hip, new THREE.SphereGeometry(0.035, 10, 8), dark, 0, -0.23, 0);   /* knee */
      add(hip, new THREE.CylinderGeometry(0.032, 0.026, 0.22, 10), s > 0 ? silver : gm, 0, -0.35, 0);   /* one silver shin */
      add(hip, new THREE.BoxGeometry(0.06, 0.03, 0.11), gm, 0, -0.47, 0.02);
      legs.push(hip);
    }
    const torso = new THREE.Group(); torso.position.y = 0.04; hips.add(torso);
    add(torso, new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), dark, 0, 0.06, 0);   /* the waist: wires */
    for (let i = 0; i < 5; i++) add(torso, new THREE.CylinderGeometry(0.006, 0.006, 0.1, 4), new THREE.MeshBasicMaterial({ color: [0xc03020, 0x2050c0, 0xd0c020, 0x30a040, 0xc03020][i] }), Math.cos(i * 1.3) * 0.035, 0.06, Math.sin(i * 1.3) * 0.035 + 0.01);
    const chest = add(torso, new THREE.CylinderGeometry(0.12, 0.08, 0.24, 14), gm, 0, 0.23, 0); chest.scale.z = 0.7;
    add(torso, new THREE.CircleGeometry(0.03, 14), silver, 0, 0.25, 0.085);   /* chest plate disc */
    const head = new THREE.Group(); head.position.y = 0.4; torso.add(head);
    add(head, new THREE.CylinderGeometry(0.02, 0.025, 0.05, 8), dark, 0, -0.04, 0);
    const skull = add(head, new THREE.SphereGeometry(0.075, 20, 16), gm, 0, 0.04, 0); skull.scale.set(0.95, 1.1, 0.95);
    add(head, new THREE.CylinderGeometry(0.06, 0.07, 0.04, 16), gm, 0, -0.01, 0.005);   /* jaw ring */
    const eyeMat = new THREE.MeshBasicMaterial({ color: glowColor(3.2, 2.2, 0.5), toneMapped: false });
    for (const s of [-1, 1]) {
      add(head, new THREE.SphereGeometry(0.018, 10, 8), eyeMat, s * 0.03, 0.05, 0.063);
      add(head, new THREE.TorusGeometry(0.021, 0.005, 6, 14), gm, s * 0.03, 0.05, 0.064);
      add(head, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10).rotateZ(Math.PI / 2), gm, s * 0.075, 0.04, 0);   /* ear pieces */
    }
    add(head, new THREE.BoxGeometry(0.03, 0.006, 0.01), dark, 0, 0.005, 0.07);   /* a little mouth slot */
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.14, 0.31, 0); torso.add(sh);
      add(sh, new THREE.SphereGeometry(0.04, 10, 8), gm);
      add(sh, new THREE.CylinderGeometry(0.028, 0.024, 0.17, 10), gm, 0, -0.09, 0);
      const el = new THREE.Group(); el.position.y = -0.18; sh.add(el);
      add(el, new THREE.SphereGeometry(0.026, 8, 6), dark);
      add(el, new THREE.CylinderGeometry(0.024, 0.02, 0.15, 10), gm, 0, -0.08, 0);
      add(el, new THREE.SphereGeometry(0.03, 10, 8), gm, 0, -0.17, 0).scale.set(0.8, 1.1, 0.5);   /* hand */
      arms.push({ s, sh, el });
    }
    Object.assign(gold, { g, hips, legs, torso, head, arms });

    /* the short one: a white barrel with blue panels, a turning silver dome, two side legs and a middle foot */
    const bodyTex = canvasTex(512, 256, (c, w, h) => {
      c.fillStyle = '#eceef2'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2a58b8';
      for (let i = 0; i < 6; i++) { const x = i * w / 6; c.fillRect(x + 14, 30, 34, 90); c.fillRect(x + 56, 150, 22, 70); c.fillRect(x + 10, 150, 38, 26); }
      c.fillStyle = '#9aa0a8'; for (let i = 0; i < 6; i++) c.fillRect(i * w / 6 + 60, 34, 14, 86);
      c.strokeStyle = 'rgba(60,70,90,0.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 136); c.lineTo(w, 136); c.stroke();
    });
    const domeTex = canvasTex(512, 128, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f0f2f6'); gr.addColorStop(1, '#a8aeb8');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2a58b8';
      for (let i = 0; i < 8; i++) { c.fillRect(i * w / 8 + 8, 70, 40, 40); if (i % 2) c.fillRect(i * w / 8 + 14, 22, 26, 30); }
    });
    const white = new THREE.MeshStandardMaterial({ map: bodyTex, roughness: 0.4, metalness: 0.15 });
    const domeMat = new THREE.MeshStandardMaterial({ map: domeTex, roughness: 0.25, metalness: 0.5, emissive: 0x202830, emissiveIntensity: 0.5 });
    const plain = new THREE.MeshStandardMaterial({ color: 0xe6e8ee, roughness: 0.45 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x2a58b8, roughness: 0.4 });
    const d = new THREE.Group(); d.position.set(0.55, 0.06, 0.3); d.rotation.y = -0.4; d.scale.setScalar(1.5); duel.add(d);
    const barrel = new THREE.Group(); barrel.position.y = 0.2; d.add(barrel);
    add(barrel, new THREE.CylinderGeometry(0.15, 0.14, 0.3, 28), white, 0, 0.15, 0);
    const domeG = new THREE.Group(); domeG.position.y = 0.3; barrel.add(domeG);
    add(domeG, new THREE.SphereGeometry(0.15, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    add(domeG, new THREE.SphereGeometry(0.035, 14, 10), new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.1, metalness: 0.5 }), 0, 0.08, 0.125);   /* the big eye */
    const lamp = add(domeG, new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: glowColor(3.5, 0.4, 0.3), toneMapped: false }), 0.07, 0.11, 0.095);
    const lampGlow = glowSprite(glowColor(3, 0.5, 0.4), 0.12); lampGlow.position.copy(lamp.position); domeG.add(lampGlow);
    add(domeG, new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: glowColor(0.5, 1.2, 3.5), toneMapped: false }), -0.06, 0.04, 0.135);
    for (const s of [-1, 1]) {   /* the side legs, with shoulder hubs and wide feet */
      add(d, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16).rotateZ(Math.PI / 2), blue, s * 0.17, 0.42, 0);
      const leg = add(d, new THREE.BoxGeometry(0.05, 0.38, 0.08), plain, s * 0.175, 0.22, 0); leg.rotation.x = 0.08;
      add(d, new THREE.BoxGeometry(0.08, 0.06, 0.14), plain, s * 0.175, 0.03, 0.02);
    }
    add(d, new THREE.BoxGeometry(0.06, 0.06, 0.1), plain, 0, 0.03, 0);   /* the middle foot */
    Object.assign(dome, { d, barrel, domeG, lampGlow, lamp });
  }
  /* ---------- lightspeed ---------- */
  const STREAKS = 520;
  const sPos = new Float32Array(STREAKS * 6), sData = [];
  const streakGeo = new THREE.BufferGeometry(); streakGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const streakMat = new THREE.LineBasicMaterial({ color: glowColor(1.6, 1.9, 2.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const streaks = new THREE.LineSegments(streakGeo, streakMat); streaks.frustumCulled = false; streaks.visible = false;
  camera.add(streaks);
  const resetStreak = (d, z) => { const a = rand(0, 6.3), r = rand(1.2, 16); d.x = Math.cos(a) * r; d.y = Math.sin(a) * r; d.z = z; };
  for (let i = 0; i < STREAKS; i++) { const d = {}; resetStreak(d, rand(-160, -4)); sData.push(d); }
  let jump = -1, fleetClock = 0;
  const JUMP = 3.6;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function newSystem() {
    far.rotation.y = rand(0, Math.PI * 2);
    far.rotation.x = rand(-0.25, 0.25);
    const old = planetMat.map;
    planetMat.map = bandTex(pick([28, 200, 12, 260, 160, 40])); planetMat.needsUpdate = true;
    old.dispose();
    planet.scale.setScalar(rand(0.75, 1.3));
    fleetClock += rand(20, 60);
    ships.forEach((s) => { s.dead = 0; s.obj.visible = true; s.hp = Math.floor(rand(3, 7)); });
  }

  /* ---------- controls, click, sizing ---------- */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, -0.6, 0);
  Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, dampingFactor: 0.08, autoRotate: true, autoRotateSpeed: 0.35, minPolarAngle: 0.35, maxPolarAngle: 2.6 });
  controls.update();
  let resumeTimer;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeTimer); renderer.domElement.style.cursor = 'grabbing'; });
  controls.addEventListener('end', () => { resumeTimer = setTimeout(() => (controls.autoRotate = true), 4000); renderer.domElement.style.cursor = 'pointer'; });
  renderer.domElement.style.cursor = 'pointer';
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6 && jump < 0) jump = 0;
    down = null;
  });

  const BASE_FOV = 45;
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
  const P0 = V(), P1 = V(), P2 = V(), ACC = V(), UP = V(), tmp = V();
  const H = 0.05;

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!onScreen) return;
    const t = clock.elapsedTime;
    fleetClock += dt;

    spin.rotation.y = Math.sin(t * 0.025) * 0.18;
    /* now and then the superlaser charges (tributaries light up) and fires a beam off into space */
    laserT -= dt;
    const charge = laserT < 3 ? Math.min(1, (3 - laserT) / 3) : 0, firing = laserT < 0 && laserT > -1.2;
    tribs.forEach((e, i) => (e.material.opacity = 0.15 + 0.85 * charge * (0.7 + 0.3 * Math.sin(t * 20 + i))));
    focusGlow.material.opacity = 0.25 + charge * 0.6 + (firing ? 0.5 : 0);
    focusGlow.scale.setScalar(2.2 + charge * 2 + (firing ? 3 : 0));
    beamMat.opacity = firing ? Math.sin(((-laserT) / 1.2) * Math.PI) : 0;
    if (laserT < -1.2) laserT = rand(16, 26);
    planetBall.rotation.y += dt * 0.01;
    beacons.forEach((b, i) => (b.material.opacity = (Math.sin(t * 3 + i * 0.8) > 0.6) ? 1 : 0.15));
    holoMat.opacity = 0.78 + Math.sin(t * 7) * 0.06 + (Math.random() < 0.03 ? -0.4 : 0);
    holo.position.x = holoBase.x + (Math.random() < 0.02 ? rand(-0.3, 0.3) : 0);

    /* ships: each rides its pair's curve, chasers a little behind the leader */
    for (const s of ships) {
      if (s.dead > 0) {
        s.dead -= dt;
        if (s.dead <= 0) { s.obj.visible = jump < 0; s.hp = Math.floor(rand(3, 7)); spark(s.obj.position, 2.2); }
      }
      const ft = fleetClock - s.delay;
      s.path(ft - H, P0); s.path(ft, P1); s.path(ft + H, P2);
      if (s.role === 'wing') P1.add(tmp.set(Math.sin(t * 0.7 + s.delay * 9) * 0.6, 0.7, 0));
      s.vel.subVectors(P2, P0).divideScalar(2 * H);
      s.fwd.copy(s.vel).normalize();
      ACC.copy(P2).add(P0).addScaledVector(P1, -2).divideScalar(H * H);
      UP.set(0, 1, 0).addScaledVector(ACC, 0.12);
      s.pos.copy(P1);
      s.obj.position.copy(P1);
      s.obj.up.copy(UP.normalize());
      s.obj.lookAt(P1.x + s.fwd.x, P1.y + s.fwd.y, P1.z + s.fwd.z);
      s.obj.updateMatrixWorld();
      for (const gl of s.obj.userData.glows) gl.scale.setScalar(gl.userData.base || (gl.userData.base = gl.scale.x)).multiplyScalar(0.85 + Math.random() * 0.3);

      /* shooting: chasers fire bursts when lined up; leaders loose the odd shot forward */
      if (!s.obj.visible) continue;
      s.cool -= dt;
      if (s.cool > 0) continue;
      if (s.target && s.target.dead <= 0) {
        tmp.subVectors(s.target.pos, s.pos);
        const lined = tmp.length() < 10 && tmp.normalize().dot(s.fwd) > 0.9;
        if (lined) {
          fire(s);
          s.burst = (s.burst || 0) + 1;
          if (s.burst >= 3 + Math.floor(Math.random() * 3)) { s.burst = 0; s.cool = rand(0.6, 1.4); } else s.cool = 0.11;
        } else s.cool = 0.15;
      } else if (s.role === 'lead' && Math.random() < 0.3) { fire(s); s.cool = rand(0.8, 2.5); } else s.cool = 0.4;
    }

    for (const b of bolts) {
      if (!b.m.visible) continue;
      b.m.position.addScaledVector(b.vel, dt);
      b.life -= dt;
      const tg = b.target;
      if (tg && tg.dead <= 0 && tg.obj.visible && b.m.position.distanceTo(tg.pos) < 0.75) {
        b.m.visible = false; spark(b.m.position, 1.1);
        tg.hp -= 1;
        if (tg.hp <= 0) { explode(tg.pos); tg.dead = rand(2.2, 3.5); tg.obj.visible = false; }
        continue;
      }
      if (b.life <= 0) b.m.visible = false;
    }
    for (const s of sparks) {
      if (!s.s.visible) continue;
      s.t += dt;
      const k = s.t / 0.22;
      s.s.scale.setScalar((s.max || 0.9) * (0.4 + k));
      s.s.material.opacity = 1 - k;
      if (k >= 1) s.s.visible = false;
    }
    for (const b of booms) {
      if (b.t < 0) continue;
      b.t += dt;
      const arr = b.pts.geometry.attributes.position.array, k = b.t;
      b.vels.forEach((v, i) => { arr[i * 3] = b.at.x + v.x * k; arr[i * 3 + 1] = b.at.y + v.y * k; arr[i * 3 + 2] = b.at.z + v.z * k; });
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - k / 1.3);
      b.fl.scale.setScalar(1 + k * 9); b.fl.material.opacity = Math.max(0, 1 - k / 0.45);
      if (k > 1.3) { b.t = -1; b.pts.visible = false; b.fl.visible = false; }
    }

    /* the jump: stars stretch into streaks, white-out, arrive somewhere new */
    if (jump >= 0) {
      jump += dt;
      const speed = 320 * smooth(0.15, 1.3, jump) * (1 - smooth(2.1, 3.3, jump));
      const len = Math.min(40, speed * 0.09) + 0.3;
      streaks.visible = true;
      streakMat.opacity = smooth(0.05, 0.6, jump) * (1 - smooth(2.6, 3.5, jump));
      for (let i = 0; i < STREAKS; i++) {
        const d = sData[i];
        d.z += speed * dt;
        if (d.z > -2) resetStreak(d, rand(-180, -120));
        sPos.set([d.x, d.y, d.z, d.x, d.y, d.z - len], i * 6);
      }
      streakGeo.attributes.position.needsUpdate = true;
      const fovK = smooth(0.2, 1.4, jump) * (1 - smooth(1.7, 2.8, jump));
      camera.fov = BASE_FOV + 22 * fovK; camera.updateProjectionMatrix();
      flash.style.opacity = String(Math.max(0, 1 - Math.abs(jump - 1.75) / 0.35) * 0.9);
      const hide = jump > 0.7 && jump < 2.3;
      fleet.visible = !hide; far.visible = !(jump > 1.6 && jump < 1.9);
      if (jump > 1.75 && !newSystem.done) { newSystem.done = true; newSystem(); placeHolo(); }
      if (jump > JUMP) {
        jump = -1; newSystem.done = false; streaks.visible = false; fleet.visible = true; far.visible = true;
        camera.fov = BASE_FOV; camera.updateProjectionMatrix(); flash.style.opacity = '0';
      }
    }

    /* the droids: the gold one frets and waves its arms; the little one rocks, swivels its dome and blinks */
    duel.visible = fleet.visible;
    duel.rotation.y = 0.5 + Math.sin(t * 0.1) * 0.15; duel.position.y = -2.1 + Math.sin(t * 0.4) * 0.15;
    {
      const fuss = 0.5 + 0.5 * Math.sin(t * 0.6);   /* how worked up it is */
      gold.torso.rotation.z = Math.sin(t * 1.3) * 0.05; gold.torso.rotation.x = 0.05 + 0.05 * fuss;
      gold.head.rotation.y = Math.sin(t * 0.7) * 0.6 - 0.2; gold.head.rotation.z = Math.sin(t * 2.1) * 0.08;
      gold.hips.position.y = 0.5 + Math.abs(Math.sin(t * 2.6)) * 0.006;
      gold.arms.forEach(({ s, sh, el }, i) => {
        sh.rotation.x = -0.4 - fuss * (0.5 + 0.4 * Math.sin(t * 3.1 + i * 2));
        sh.rotation.z = s * (0.25 + 0.2 * fuss * Math.sin(t * 2.3 + i));
        el.rotation.x = -0.9 - 0.4 * Math.sin(t * 4 + i * 1.7) * fuss;
      });
      gold.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 1.3 + i * Math.PI) * 0.03));
      dome.d.rotation.z = Math.sin(t * 2.2) * 0.06;
      dome.barrel.rotation.x = 0.08 + Math.sin(t * 1.1) * 0.06;
      dome.domeG.rotation.y = Math.sin(t * 0.9) * 1.1 + Math.sin(t * 3.7) * 0.15;
      const on = Math.sin(t * 6) > 0.2 || Math.sin(t * 13) > 0.85;
      dome.lampGlow.material.opacity = on ? 1 : 0.1;
      dome.lamp.material.color.copy(on ? glowColor(3.5, 0.4, 0.3) : glowColor(0.4, 0.05, 0.05));
    }
    controls.update();
    composer.render();
  });
};
