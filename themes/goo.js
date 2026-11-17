/* bellhive99.com - home page theme: John Dies at the End (the black goo)
 * Night, a scratched table under a swinging, flickering bulb. A living blob of glossy black goo
 * bulges out of a glass jar, tentacles feeling their way across the table; now and then eyes open
 * on it and follow you around. A syringe of the stuff, a sausage on a plate that twitches, and a
 * buzzing, half-broken bellhive99 neon sign on the brick wall. Click: the goo splatters and the
 * droplets crawl home. Creepy-funny, nothing gory. Original design.
 * Loaded by INDEXB.HTM (see themes/themes.js).
 */
(window.BHScenes = window.BHScenes || {}).goo = function (box, lib) {
  const { THREE, OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, RoomEnvironment } = lib;
  const ASPECT = 453 / 503, CROP = 780 / 1006;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const glowColor = (r, g, b) => new THREE.Color(r, g, b);

  box.title = 'Drag to look around · click to poke the goo';
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
  renderer.setClearColor(0x050407, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  box.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1 / ASPECT, 0.05, 100);
  camera.position.set(0, 2.2, 5.8);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1006, 780), 0.6, 0.4, 0.8));
  composer.addPass(new OutputPass());

  /* reflections for the wet goo and the glass only */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  /* ---------- helpers ---------- */
  function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = 4;
    t.userData.canvas = c;
    return t;
  }
  const glowTex = canvasTex(128, 128, (g, w, h) => {
    const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    rg.addColorStop(0.6, 'rgba(255,255,255,0.08)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  });
  const glowSprite = (color, scale, opacity = 1) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.scale.setScalar(scale);
    return s;
  };
  const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  /* ---------- room: brick wall, table ---------- */
  const brickTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#1d1512'; g.fillRect(0, 0, w, h);
    const bw = 64, bh = 28;
    for (let row = 0; row * bh < h; row++) {
      for (let x = (row % 2) * -bw / 2; x < w; x += bw) {
        g.fillStyle = `hsl(${rand(5, 18)}, ${rand(25, 40)}%, ${rand(17, 27)}%)`;
        g.fillRect(x + 3, row * bh + 3, bw - 5, bh - 5);
      }
    }
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${rand(0.05, 0.25)})`; g.fillRect(rand(0, w), rand(0, h), rand(1, 4), rand(1, 4)); }
    for (let i = 0; i < 14; i++) {   /* damp streaks */
      const x = rand(0, w), gr = g.createLinearGradient(x, 0, x, h);
      gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x, 0, rand(6, 20), h * rand(0.3, 0.8));
    }
  }, 3, 2);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.95 }));
  wall.position.set(0, 2.2, -2.2); wall.receiveShadow = true; scene.add(wall);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; floor.receiveShadow = true; scene.add(floor);

  const tableTex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#4a3020'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = pick(['#3a2416', '#5e3d27', '#2e1c11', '#6a4630']); g.globalAlpha = rand(0.25, 0.6); g.lineWidth = rand(0.6, 2.4);
      const y = rand(0, h); g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
      g.stroke();
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 60; i++) {   /* scratches, rings, burns */
      g.strokeStyle = `rgba(200,170,130,${rand(0.08, 0.2)})`; g.lineWidth = 1;
      const x = rand(0, w), y = rand(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-40, 40), y + rand(-10, 10)); g.stroke();
    }
    for (let i = 0; i < 5; i++) { g.strokeStyle = 'rgba(20,10,5,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(rand(0, w), rand(0, h), rand(14, 26), 0, 7); g.stroke(); }
  }, 2, 1);
  const table = shadowy(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.14, 3.2), new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.7 })));
  table.position.set(0, -0.07, 0.2); scene.add(table);
  for (const [x, z] of [[-2.4, -1.2], [2.4, -1.2], [-2.4, 1.6], [2.4, 1.6]]) {
    const leg = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16), table.material)); leg.position.set(x, -0.85, z); scene.add(leg);
  }

  /* ---------- lights: a swinging, flickering bulb and the neon ---------- */
  scene.add(new THREE.AmbientLight(0x2a2440, 0.6));
  const cordTop = V(1.35, 5.4, 0.55);
  const bulbGroup = new THREE.Group(); bulbGroup.position.copy(cordTop); scene.add(bulbGroup);
  const CORD = 2.55;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, CORD, 6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  cord.position.y = -CORD / 2; bulbGroup.add(cord);
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.14, 12), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 }));
  socket.position.y = -CORD - 0.05; bulbGroup.add(socket);
  const bulbMat = new THREE.MeshBasicMaterial({ color: glowColor(2, 1.5, 0.9), toneMapped: false });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), bulbMat); bulb.scale.y = 1.25; bulb.position.y = -CORD - 0.2; bulbGroup.add(bulb);
  const bulbGlow = glowSprite(glowColor(1.0, 0.75, 0.45), 0.9, 0.5); bulbGlow.position.copy(bulb.position); bulbGroup.add(bulbGlow);
  const bulbLight = new THREE.PointLight(0xffc98a, 9, 9, 1.4);
  bulbLight.position.copy(bulb.position); bulbLight.castShadow = true; bulbLight.shadow.mapSize.set(1024, 1024); bulbLight.shadow.bias = -0.002;
  bulbGroup.add(bulbLight);

  /* ---------- the bellhive99 neon (letters buzz and drop out) ---------- */
  const NEON = [...'bellhive99'];
  const neonColor = (i) => (i >= 4 && i <= 7 ? ['#5ef6ff', 'rgba(94,246,255,1)'] : ['#ff5fc8', 'rgba(255,95,200,1)']);
  const neonOn = NEON.map(() => true);
  const neonTex = canvasTex(1024, 256, () => {});
  neonTex.wrapS = neonTex.wrapT = THREE.ClampToEdgeWrapping;
  function drawNeon() {
    const c = neonTex.userData.canvas, g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    g.font = '700 150px "Brush Script MT", "Segoe Script", "Comic Sans MS", cursive';
    g.textBaseline = 'middle';
    const widths = NEON.map((ch) => g.measureText(ch).width);
    let x = (w - widths.reduce((a, b) => a + b, 0)) / 2;
    NEON.forEach((ch, i) => {
      const [col, glow] = neonColor(i);
      if (neonOn[i]) {
        g.shadowColor = glow; g.shadowBlur = 16; g.strokeStyle = col; g.lineWidth = 8;
        g.strokeText(ch, x, h / 2); g.shadowBlur = 8; g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; g.strokeText(ch, x, h / 2);
      } else {
        g.shadowBlur = 0; g.strokeStyle = 'rgba(120,110,120,0.55)'; g.lineWidth = 6; g.strokeText(ch, x, h / 2);
      }
      x += widths[i];
    });
    g.shadowBlur = 0;
    neonTex.needsUpdate = true;
  }
  drawNeon();
  const neonMat = new THREE.MeshBasicMaterial({ map: neonTex, transparent: true, color: glowColor(0.95, 0.95, 0.95), toneMapped: false, depthWrite: false });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), neonMat);
  neon.position.set(-0.3, 2.35, -2.12); scene.add(neon);
  const neonBack = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.2, 0.04), new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.6, transparent: true, opacity: 0.6 }));
  neonBack.position.set(-0.3, 2.35, -2.17); scene.add(neonBack);
  const pinkLight = new THREE.PointLight(0xff4fc0, 3, 6, 1.5); pinkLight.position.set(-1.2, 2.6, -1.4); scene.add(pinkLight);
  const cyanLight = new THREE.PointLight(0x4fe8ff, 2.5, 6, 1.5); cyanLight.position.set(0.9, 2.6, -1.4); scene.add(cyanLight);

  /* ---------- the jar ---------- */
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb4b8, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, envMap, envMapIntensity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const JAR_R = 0.46, JAR_H = 0.95;
  const jar = new THREE.Group(); scene.add(jar);
  const jarWall = new THREE.Mesh(new THREE.CylinderGeometry(JAR_R, JAR_R, JAR_H, 48, 1, true), glassMat); jarWall.position.y = JAR_H / 2; jarWall.renderOrder = 3; jar.add(jarWall);
  const jarRim = new THREE.Mesh(new THREE.TorusGeometry(JAR_R, 0.025, 8, 48), glassMat); jarRim.rotation.x = Math.PI / 2; jarRim.position.y = JAR_H; jarRim.renderOrder = 3; jar.add(jarRim);
  const jarBase = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(JAR_R, JAR_R, 0.04, 48), glassMat)); jarBase.position.y = 0.02; jar.add(jarBase);
  /* masking-tape label, marker handwriting: SOY SAUCE (wraps the front of the jar) */
  const labelTex = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#e8dcb8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(120,100,60,${rand(0.03, 0.1)})`; g.fillRect(rand(0, w), rand(0, h), rand(1, 3), 1); }
    g.fillStyle = 'rgba(90,70,40,0.25)';   /* torn, darker edges */
    for (let x = 0; x < w; x += 6) { g.fillRect(x, 0, 6, rand(3, 10)); g.fillRect(x, h - rand(3, 10), 6, 10); }
    g.save(); g.translate(w / 2, h / 2 + 8); g.rotate(-0.035);
    g.font = 'bold 150px "Permanent Marker", "Marker Felt", "Comic Sans MS", "Segoe Print", cursive';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#141414'; g.fillText('SOY SAUCE', 0, 0);
    g.restore();
  });
  labelTex.wrapS = labelTex.wrapT = THREE.ClampToEdgeWrapping;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(JAR_R + 0.006, JAR_R + 0.006, 0.3, 48, 1, true, -1.15, 2.3),
    new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.85, side: THREE.DoubleSide }));
  label.position.y = 0.46; label.rotation.z = 0.02; jar.add(label);
  const lid = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 40), new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.5, roughness: 0.45 })));
  lid.position.set(0.95, 0.035, 0.95); lid.rotation.set(0.06, 0, 0.04); scene.add(lid);   /* knocked off */

  /* ---------- the goo ---------- */
  const gooMat = new THREE.MeshPhysicalMaterial({
    color: 0x020203, roughness: 0.18, metalness: 0.0, clearcoat: 0.7, clearcoatRoughness: 0.08,
    iridescence: 0.55, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 480],
    emissive: 0x2a0a44, emissiveIntensity: 0.25, envMap, envMapIntensity: 0.28,
  });
  const gooBody = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(JAR_R - 0.03, JAR_R - 0.03, 0.7, 40), gooMat));
  gooBody.position.y = 0.39; scene.add(gooBody);
  const BLOB_C = V(0, 0.95, 0), BLOB_R = 0.5;
  const blobGeo = new THREE.SphereGeometry(BLOB_R, 96, 64);
  const blobDirs = blobGeo.attributes.position.array.slice();
  for (let i = 0; i < blobDirs.length; i += 3) { const l = Math.hypot(blobDirs[i], blobDirs[i + 1], blobDirs[i + 2]); blobDirs[i] /= l; blobDirs[i + 1] /= l; blobDirs[i + 2] /= l; }
  const blob = shadowy(new THREE.Mesh(blobGeo, gooMat)); blob.position.copy(BLOB_C); scene.add(blob);
  let quake = 0;   /* extra wobble after a poke */
  const disp = (x, y, z, t) =>
    0.075 * Math.sin(x * 4.1 + t * 1.3) * Math.sin(y * 3.3 + t * 0.9 + 1.7) * Math.sin(z * 3.7 - t * 1.1)
    + 0.035 * Math.sin(x * 9.0 - y * 7.0 + t * 2.3) + 0.03 * Math.sin(z * 8.0 + y * 6.0 - t * 1.7)
    + quake * 0.09 * Math.sin(x * 13 + y * 11 + t * 18);
  function blobRadius(d, t, pulse) { return BLOB_R * (1 + pulse) + disp(d.x, d.y, d.z, t); }
  function updateBlob(t, pulse) {
    const pos = blobGeo.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      const dx = blobDirs[i], dy = blobDirs[i + 1], dz = blobDirs[i + 2];
      let r = BLOB_R * (1 + pulse) + disp(dx, dy, dz, t);
      let x = dx * r, y = dy * r * 1.05, z = dz * r;
      if (y < 0.02) {   /* squeeze the bottom into the jar */
        const lim = (JAR_R - 0.05) - Math.max(0, -y) * 0.05, rr = Math.hypot(x, z);
        if (rr > lim) { x *= lim / rr; z *= lim / rr; }
        y = Math.max(y, -0.55);
      }
      pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
    }
    blobGeo.attributes.position.needsUpdate = true;
    blobGeo.computeVertexNormals();
  }

  /* tentacles: tubes rebuilt along a moving curve each frame, tapering to a point */
  const TSEG = 48, TRAD = 10;
  const tentacles = [0.7, 2.2, -0.6, -2.0, 3.1].map((a, k) => {
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 1, 0), V(0, 2, 0)]), TSEG, 0.07, TRAD, false);
    const m = shadowy(new THREE.Mesh(geo, gooMat)); m.frustumCulled = false; scene.add(m);
    return { m, geo, a, ph: rand(0, 6.3), speed: rand(0.25, 0.45), reach: rand(0.9, 1.5), thick: rand(0.06, 0.085), pts: Array.from({ length: 6 }, () => V()), curve: new THREE.CatmullRomCurve3(Array.from({ length: 6 }, () => V())) };
  });
  const N = V(), B = V(), P = V(), T = V();
  function updateTentacle(tc, t) {
    const s = 0.5 + 0.5 * Math.sin(t * tc.speed + tc.ph);   /* 0 = curled up, 1 = reaching */
    const a = tc.a + Math.sin(t * 0.3 + tc.ph) * 0.25;
    const dir = (r, y, side = 0) => V(Math.sin(a + side) * r, y, Math.cos(a + side) * r);
    const wig = (k) => Math.sin(t * 2.2 + tc.ph + k * 1.3) * 0.08 * k;
    const reach = tc.reach * s;
    tc.pts[0].copy(dir(0.28, 1.12, 0)).add(BLOB_C).sub(V(0, 0.95, 0));
    tc.pts[1].copy(dir(0.52, 1.28 + 0.1 * s, wig(1) * 0.5));
    tc.pts[2].copy(dir(0.66, 1.05 + 0.15 * s, wig(2) * 0.4));
    tc.pts[3].copy(dir(0.8 + reach * 0.35, 0.45 + 0.2 * (1 - s), wig(3) * 0.3));
    tc.pts[4].copy(dir(0.95 + reach * 0.75, 0.08 + 0.05 * Math.sin(t * 2 + tc.ph), wig(4) * 0.25));
    tc.pts[5].copy(dir(1.0 + reach * 1.15, 0.1 + 0.22 * Math.max(0, Math.sin(t * 1.7 + tc.ph)), wig(5) * 0.25));
    tc.curve.points = tc.pts;
    const frames = tc.curve.computeFrenetFrames(TSEG, false);
    const pos = tc.geo.attributes.position.array;
    let o = 0;
    for (let i = 0; i <= TSEG; i++) {
      const u = i / TSEG;
      tc.curve.getPointAt(u, P);
      N.copy(frames.normals[i]); B.copy(frames.binormals[i]);
      const r = tc.thick * (1 - 0.88 * u) * (1 + 0.15 * Math.sin(u * 20 - t * 3));
      for (let j = 0; j <= TRAD; j++) {
        const v = (j / TRAD) * Math.PI * 2;
        T.copy(P).addScaledVector(N, Math.cos(v) * r).addScaledVector(B, Math.sin(v) * r);
        if (T.y < 0.005) T.y = 0.005;
        pos[o++] = T.x; pos[o++] = T.y; pos[o++] = T.z;
      }
    }
    tc.geo.attributes.position.needsUpdate = true;
    tc.geo.computeVertexNormals();
  }

  /* eyes that open on the blob and follow the viewer */
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.25 });
  const irisMat = new THREE.MeshBasicMaterial({ color: glowColor(2.6, 2.0, 0.25), toneMapped: false });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const eyes = [[-0.32, 0.18, 0.075], [0.3, 0.12, 0.06], [0.02, 0.42, 0.05], [-0.05, -0.05, 0.085]].map(([ox, oy, size]) => {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 14), eyeWhite); g.add(ball);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(size * 0.6, 16, 10), irisMat); iris.position.z = size * 0.55; iris.scale.z = 0.5; g.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.3, 12, 8), pupilMat); pupil.position.z = size * 0.82; pupil.scale.set(0.6, 1.2, 0.5); g.add(pupil);
    g.scale.set(1, 0.001, 1); scene.add(g);
    return { g, ox, oy, open: 0, want: 0, timer: rand(1, 6), blink: 0 };
  });

  /* ---------- props: syringe, sausage on a plate, drips ---------- */
  {
    const syr = new THREE.Group(); syr.position.set(1.45, 0.075, 0.25); syr.rotation.set(0, -0.6, Math.PI / 2); scene.add(syr);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.75, 20, 1, true), glassMat); syr.add(barrel);
    const fillLiq = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.42, 16), gooMat)); fillLiq.position.y = 0.15; syr.add(fillLiq);
    const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.9, roughness: 0.2 });
    const needle = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.35, 6), steel)); needle.position.y = 0.55; syr.add(needle);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.06, 10), steel); hub.position.y = 0.4; syr.add(hub);
    const rod = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4 }))); rod.position.y = -0.5; syr.add(rod);
    const thumb = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16), rod.material)); thumb.position.y = -0.73; syr.add(thumb);
    const flange = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.07), rod.material); flange.position.y = -0.37; syr.add(flange);
  }
  const plate = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.04, 40), new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.3 })));
  plate.position.set(-1.45, 0.02, 0.45); scene.add(plate);
  const sausage = shadowy(new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 8, 16), new THREE.MeshStandardMaterial({ color: 0x7a3b1c, roughness: 0.35 })));
  sausage.rotation.z = Math.PI / 2; sausage.position.set(-1.45, 0.12, 0.45); scene.add(sausage);
  let sausageJump = rand(4, 9), sausageT = -1;
  const drips = [];
  for (const [x, z, s] of [[0.62, 0.35, 0.09], [-0.55, 0.6, 0.06], [0.2, 0.9, 0.05], [1.1, 0.5, 0.045]]) {
    const d = shadowy(new THREE.Mesh(new THREE.SphereGeometry(s, 16, 10), gooMat)); d.scale.y = 0.35; d.position.set(x, s * 0.3, z); scene.add(d); drips.push(d);
  }

  /* ---------- the poke: splatter, droplets crawl home ---------- */
  const drops = Array.from({ length: 14 }, () => {
    const m = shadowy(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), gooMat)); m.visible = false; scene.add(m);
    return { m, vel: V(), state: 'off', size: 0.05 };
  });
  let blackout = 0;
  function poke() {
    quake = 1; blackout = 0.7;
    eyes.forEach((e) => { e.want = 1; e.timer = rand(2.5, 4); });
    drops.forEach((d) => {
      const a = rand(0, Math.PI * 2);
      d.size = rand(0.035, 0.08);
      d.m.scale.setScalar(d.size);
      d.m.position.copy(BLOB_C).add(V(Math.sin(a) * 0.3, 0.3, Math.cos(a) * 0.3));
      d.vel.set(Math.sin(a) * rand(0.8, 2.2), rand(1.8, 3.2), Math.cos(a) * rand(0.8, 2.2));
      d.state = 'fly'; d.m.visible = true;
    });
  }

  /* ---------- controls, click, sizing ---------- */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.0, -0.2);
  Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, dampingFactor: 0.08, minPolarAngle: 0.85, maxPolarAngle: 1.48, minAzimuthAngle: -1.0, maxAzimuthAngle: 1.0 });
  controls.update();
  let lastTouch = -10;
  controls.addEventListener('start', () => { lastTouch = Infinity; renderer.domElement.style.cursor = 'grabbing'; });
  controls.addEventListener('end', () => { lastTouch = clock.elapsedTime; renderer.domElement.style.cursor = 'pointer'; });
  renderer.domElement.style.cursor = 'pointer';
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) poke();
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
  let onScreen = true, neonTick = 0;
  new IntersectionObserver(([en]) => (onScreen = en.isIntersecting)).observe(box);
  const sph = new THREE.Spherical(), off = V(), camDir = V(), right = V(), up = V(), ed = V(), home = V();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!onScreen) return;
    const t = clock.elapsedTime;

    /* gentle look-around sway when nobody is dragging */
    if (t - lastTouch > 4) {
      off.subVectors(camera.position, controls.target); sph.setFromVector3(off);
      sph.theta += (Math.sin(t * 0.12) * 0.55 - sph.theta) * 0.01;
      off.setFromSpherical(sph); camera.position.copy(controls.target).add(off);
    }

    /* the bulb swings and stutters; the neon buzzes */
    bulbGroup.rotation.z = Math.sin(t * 0.9) * 0.07; bulbGroup.rotation.x = Math.sin(t * 0.63) * 0.04;
    blackout = Math.max(0, blackout - dt);
    const stutter = blackout > 0 ? (Math.random() < 0.15 ? 0.6 : 0.03) : (Math.random() < 0.02 ? rand(0.2, 0.6) : 1);
    bulbLight.intensity = 9 * stutter; bulbGlow.material.opacity = 0.5 * stutter;
    bulbMat.color.setRGB(2 * stutter + 0.1, 1.5 * stutter + 0.08, 0.9 * stutter + 0.05);
    neonTick -= dt;
    if (neonTick <= 0) {
      neonTick = rand(0.05, 0.25);
      let changed = false;
      NEON.forEach((ch, i) => {
        const flaky = i === 4 ? 0.45 : i === 9 ? 0.25 : 0.03;   /* the h is barely hanging on */
        const on = blackout > 0 ? false : Math.random() > flaky;
        if (on !== neonOn[i]) { neonOn[i] = on; changed = true; }
      });
      if (changed) drawNeon();
    }
    const neonPow = blackout > 0 ? 0 : 1;
    neonMat.opacity = blackout > 0 ? 0.25 : 1;
    pinkLight.intensity = 3 * neonPow * (0.85 + Math.random() * 0.15);
    cyanLight.intensity = 2.5 * neonPow * (neonOn[4] ? 1 : 0.4);

    /* the goo breathes */
    quake = Math.max(0, quake - dt * 0.8);
    const pulse = 0.04 * Math.sin(t * 1.4) + 0.02 * Math.sin(t * 3.3);
    updateBlob(t, pulse);
    gooMat.emissiveIntensity = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t * 1.4)) + quake * 0.6;
    tentacles.forEach((tc) => updateTentacle(tc, t));

    /* eyes: open now and then, blink, and watch the camera */
    camDir.subVectors(camera.position, BLOB_C).normalize();
    right.crossVectors(V(0, 1, 0), camDir).normalize(); up.crossVectors(camDir, right);
    for (const e of eyes) {
      e.timer -= dt;
      if (e.timer <= 0) { e.want = e.want ? 0 : 1; e.timer = e.want ? rand(2, 5) : rand(3, 9); }
      e.open += ((e.want ? 1 : 0) - e.open) * Math.min(1, dt * 6);
      if (e.want && Math.random() < 0.006) e.blink = 0.15;
      e.blink = Math.max(0, e.blink - dt);
      ed.copy(camDir).addScaledVector(right, e.ox).addScaledVector(up, e.oy).normalize();
      e.g.position.copy(BLOB_C).addScaledVector(ed, blobRadius(ed, t, pulse) - 0.015);
      e.g.lookAt(camera.position);
      e.g.scale.y = Math.max(0.001, e.open * (e.blink > 0 ? 0.08 : 1));
      e.g.visible = e.open > 0.02;
    }

    /* the sausage twitches */
    sausageJump -= dt;
    if (sausageJump <= 0) { sausageJump = rand(5, 12); sausageT = 0; }
    if (sausageT >= 0) {
      sausageT += dt;
      const k = sausageT / 0.5;
      sausage.position.y = 0.12 + Math.sin(Math.min(1, k) * Math.PI) * 0.12;
      sausage.rotation.y = Math.sin(k * Math.PI * 2) * 0.3;
      if (k >= 1) sausageT = -1;
    }
    drips.forEach((d, i) => (d.scale.y = 0.33 + 0.04 * Math.sin(t * 1.5 + i)));

    /* splatter droplets: fly, land, crawl back, merge */
    for (const d of drops) {
      if (d.state === 'off') continue;
      const p = d.m.position;
      if (d.state === 'fly') {
        d.vel.y -= 6 * dt; p.addScaledVector(d.vel, dt);
        const onTable = Math.abs(p.x) < 2.55 && p.z > -1.35 && p.z < 1.75;
        if (onTable && p.y <= d.size * 0.35) { p.y = d.size * 0.35; d.state = 'crawl'; d.m.scale.set(d.size * 1.3, d.size * 0.4, d.size * 1.3); }
        else if (p.y < -2) { d.state = 'off'; d.m.visible = false; }
      } else {
        home.set(-p.x, 0, -p.z);
        const dist = home.length();
        const wob = 0.5 + 0.5 * Math.sin(t * 9 + d.size * 100);
        p.addScaledVector(home.normalize(), dt * (0.25 + 0.35 * wob));
        d.m.scale.set(d.size * (1.1 + 0.4 * wob), d.size * 0.4, d.size * (1.5 - 0.3 * wob));
        d.m.lookAt(0, p.y, 0);
        if (dist < JAR_R + 0.05) { d.state = 'off'; d.m.visible = false; }
      }
    }

    controls.update();
    composer.render();
  });
};
