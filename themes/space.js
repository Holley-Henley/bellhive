/* bellhive99.com - home page theme: Star Wars (classic space opera)
 * Starfighter dogfight in deep space: light fighters (orange engines, red bolts) and dark delta
 * fighters (green engines, green bolts) chase each other around a ring battle station and a
 * ringed planet. Hits spark, ships explode and warp back in. The bellhive99 logo is a flickering
 * hologram projected from the station. Click anywhere for the jump to lightspeed.
 * All ships and the station are original designs. Loaded by INDEXB.HTM (see themes/themes.js).
 */
(window.BHScenes = window.BHScenes || {}).space = function (box, lib) {
  const { THREE, OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = lib;
  const ASPECT = 453 / 503, CROP = 780 / 1006;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const glowColor = (r, g, b) => new THREE.Color(r, g, b);   /* > 1 so bloom picks it up */

  box.title = 'Drag to look around · click to jump to lightspeed';
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

  /* ring battle station (spins slowly) */
  const station = new THREE.Group(); station.position.set(24, 9, -66); far.add(station);
  station.rotation.set(1.05, -0.5, 0.25);
  const spin = new THREE.Group(); station.add(spin);
  const hullMap = canvasTex(1024, 64, (g, w, h) => {
    g.fillStyle = '#4b5059'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { g.fillStyle = `rgb(${60 + rand(0, 30)},${64 + rand(0, 30)},${72 + rand(0, 30)})`; g.fillRect(x, 0, 15, h); }
    g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 8; y < h; y += 16) g.fillRect(0, y, w, 2);
  }, 6, 1);
  const lightMap = canvasTex(1024, 64, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = pick(['#fff3c4', '#cfe6ff', '#ffe08a']); g.fillRect(Math.floor(rand(0, w / 3)) * 3, Math.floor(rand(0, h / 4)) * 4 + 1, 2, 2); }
  }, 6, 1);
  const hullMat = new THREE.MeshStandardMaterial({ map: hullMap, emissiveMap: lightMap, emissive: 0xffffff, emissiveIntensity: 0.9, metalness: 0.25, roughness: 0.6 });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(9, 1.25, 20, 140), hullMat); torus.rotation.x = Math.PI / 2; spin.add(torus);
  const torus2 = new THREE.Mesh(new THREE.TorusGeometry(9, 0.45, 10, 140), new THREE.MeshStandardMaterial({ color: 0x2e3238, metalness: 0.7, roughness: 0.4 }));
  torus2.rotation.x = Math.PI / 2; torus2.position.y = 1.15; spin.add(torus2);
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x6a707b, metalness: 0.3, roughness: 0.5 });
  for (let k = 0; k < 6; k++) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 9, 10), darkMetal);
    sp.rotation.z = Math.PI / 2; const a = (k / 6) * Math.PI * 2;
    const holder = new THREE.Group(); holder.rotation.y = a; sp.position.x = 4.5; holder.add(sp); spin.add(holder);
    const pod = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.6), hullMat);
    pod.position.set(Math.cos(a) * 9, 0, -Math.sin(a) * 9); pod.rotation.y = a; spin.add(pod);
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(2.7, 40, 24), hullMat); station.add(hub);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.7, 12, 12), darkMetal); station.add(spire);
  const beacons = [];
  for (let k = 0; k < 8; k++) {
    const b = glowSprite(glowColor(4, 0.4, 0.3), 0.9);
    const a = (k / 8) * Math.PI * 2;
    b.position.set(Math.cos(a) * 10.3, 0, Math.sin(a) * 10.3); spin.add(b); beacons.push(b);
  }
  const tipA = glowSprite(glowColor(4, 0.4, 0.3), 1.3); tipA.position.y = 6.2; station.add(tipA); beacons.push(tipA);
  const tipB = glowSprite(glowColor(4, 0.4, 0.3), 1.3); tipB.position.y = -6.2; station.add(tipB); beacons.push(tipB);

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
  const placeHolo = () => { holoBase.set(0, -6.2, -4); holo.position.copy(holoBase); };
  placeHolo();

  /* ---------- starfighters ---------- */
  const mats = {
    lightHull: new THREE.MeshStandardMaterial({ color: 0xe6e2da, metalness: 0.15, roughness: 0.5 }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xd2621e, metalness: 0.2, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2a3a, metalness: 0.9, roughness: 0.15 }),
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

    spin.rotation.y += dt * 0.04;
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

    controls.update();
    composer.render();
  });
};
