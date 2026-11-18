/* bellhive99.com - home page theme: The Fifth Element (flying-car city)
 * A hazy golden-afternoon canyon of towers dropping away into fog, with lanes of flying cars
 * streaming both ways at different heights, neon signs and a big bellhive99 billboard on a
 * skybridge. A yellow flying taxi weaves through the traffic; click and it dives straight down
 * through the lanes. Original design. Loaded by INDEXB.HTM (see themes/themes.js).
 */
(window.BHScenes = window.BHScenes || {}).flycity = function (box, lib) {
  const { THREE, OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = lib;
  const ASPECT = 453 / 503, CROP = 780 / 1006;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const glowColor = (r, g, b) => new THREE.Color(r, g, b);

  box.title = 'Drag to look around \u00b7 click and the taxi dives';
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  box.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  const HAZE = 0xd8c3a2;
  scene.fog = new THREE.Fog(HAZE, 50, 330);
  const camera = new THREE.PerspectiveCamera(48, 1 / ASPECT, 0.5, 1200);
  camera.position.set(0, 13, 36);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1006, 780), 0.55, 0.45, 0.8));
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

  /* ---------- sky ---------- */
  const SUN = V(-0.5, 0.62, 0.6).normalize();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sunDir: { value: SUN } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 sunDir; varying vec3 vDir;
      void main() { vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(vec3(0.85, 0.76, 0.62), vec3(0.52, 0.66, 0.86), smoothstep(0.0, 0.55, h));
        col = mix(col, vec3(0.85, 0.76, 0.62), smoothstep(0.0, -0.2, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.85, 0.6) * (pow(s, 8.0) * 0.35 + pow(s, 400.0) * 2.0);
        gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0); }`,
  })));
  scene.add(new THREE.HemisphereLight(0xffe2bf, 0x6a6058, 1.5));
  const sun = new THREE.DirectionalLight(0xffd7a0, 2.6);
  sun.position.copy(SUN).multiplyScalar(100);
  scene.add(sun);

  /* ---------- towers ---------- */
  const winTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a8070'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) {
      g.fillStyle = Math.random() < 0.15 ? '#d9c49a' : `rgb(${70 + rand(0, 30)},${80 + rand(0, 30)},${92 + rand(0, 30)})`;
      g.fillRect(x + 3, y + 4, 10, 9);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 3);
  });
  const litTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) if (Math.random() < 0.18) { g.fillStyle = pick(['#ffd890', '#fff0c8', '#9fd8ff']); g.fillRect(x + 3, y + 4, 10, 9); }
  });
  const tints = [0xd8c8b0, 0xb8b0a8, 0xc9a888, 0xa8b4bc, 0xd0bca0, 0x9c9488];
  const towerMats = tints.map((c) => new THREE.MeshStandardMaterial({ color: c, map: winTex, emissiveMap: litTex, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.75, metalness: 0.1 }));
  function box3(w, h, d) {   /* box with UVs scaled to its size so the windows stay square */
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / 12, uv.getY(i) * dims[f][1] / 12); }
    return g;
  }
  const BOTTOM = -260;
  const city = new THREE.Group(); scene.add(city);
  for (const side of [-1, 1]) {
    for (const row of [0, 1]) {
      let z = 50;
      while (z > -520) {
        const w = rand(12, 22), d = rand(12, 24), top = row ? rand(80, 210) : rand(25, 150);
        const x = side * (row ? rand(48, 70) : 14 + w / 2 + rand(0, 4));
        const m = new THREE.Mesh(box3(w, top - BOTTOM, d), pick(towerMats));
        m.position.set(x, (top + BOTTOM) / 2, z - d / 2); city.add(m);
        if (Math.random() < 0.5) {   /* set-back crown */
          const cw = w * rand(0.4, 0.7), ch = rand(8, 26);
          const c = new THREE.Mesh(box3(cw, ch, d * rand(0.4, 0.7)), m.material); c.position.set(x, top + ch / 2, z - d / 2); city.add(c);
          if (Math.random() < 0.6) { const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, rand(8, 20), 6), new THREE.MeshStandardMaterial({ color: 0x555a60 })); ant.position.set(x, top + ch + 6, z - d / 2); city.add(ant); }
        }
        z -= d + rand(2, 8);
      }
    }
  }
  /* skybridges */
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x8c8f94, metalness: 0.4, roughness: 0.5 });
  for (const [y, z] of [[-30, -90], [55, -170], [10, -260], [-60, -40], [80, -330]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(34, 3, 5), bridgeMat); b.position.set(0, y, z); city.add(b);
  }

  /* ---------- neon signs and the billboard ---------- */
  function neonTex(text, color, w = 512, h = 128, font = '900 84px "Arial Black", Arial, sans-serif') {
    return canvasTex(w, h, (g) => {
      g.fillStyle = 'rgba(10,10,14,0.85)'; g.fillRect(0, 0, w, h);
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = color; g.shadowBlur = 22; g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 4);
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(text, w / 2, h / 2 + 4);
    });
  }
  const signs = [];
  const sign = (text, color, x, y, z, rotY, sw, sh) => {
    const mat = new THREE.MeshBasicMaterial({ map: neonTex(text, color), color: glowColor(1.4, 1.4, 1.4), toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat); m.position.set(x, y, z); m.rotation.y = rotY; city.add(m); signs.push({ m, ph: rand(0, 6), flick: Math.random() < 0.3 });
  };
  [['NOODLES', '#ff4fa0'], ['HOTEL', '#4fd8ff'], ['BAR 24H', '#ffd24f'], ['SUSHI', '#ff6a3d'], ['TAXI', '#ffe04f'], ['CLONES', '#9dff6a'], ['DINER', '#ff4fa0'], ['FLY-THRU', '#4fd8ff']]
    .forEach(([t, c], i) => {
      const side = i % 2 ? 1 : -1;
      sign(t, c, side * 13.6, rand(-15, 45), -20 - i * 34, -side * Math.PI / 2, rand(9, 14), rand(2.4, 3.4));
    });
  const bbTex = canvasTex(1024, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#1b0b2a'); gr.addColorStop(1, '#0b1730');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffb03a'; g.lineWidth = 8; g.shadowColor = '#ffb03a'; g.shadowBlur = 18; g.strokeRect(14, 14, w - 28, h - 28);
    g.font = '900 150px "Arial Black", "Segoe UI Black", Arial, sans-serif'; g.textBaseline = 'middle';
    const parts = [['bell', '#ff4fb8'], ['hive', '#ffd34f'], ['99', '#4fd8ff']];
    const total = parts.reduce((s, p) => s + g.measureText(p[0]).width, 0);
    let x = (w - total) / 2;
    for (const [t, c] of parts) { g.shadowColor = c; g.shadowBlur = 26; g.fillStyle = c; g.fillText(t, x, h / 2 + 8); g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillText(t, x, h / 2 + 8); x += g.measureText(t).width; }
  });
  const bbMat = new THREE.MeshBasicMaterial({ map: bbTex, color: glowColor(1.3, 1.3, 1.3), toneMapped: false });
  const billboard = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), bbMat);
  billboard.position.set(0, 47, -72); city.add(billboard);
  const bbBridge = new THREE.Mesh(new THREE.BoxGeometry(34, 2.5, 4), bridgeMat); bbBridge.position.set(0, 42.5, -72.5); city.add(bbBridge);
  const bbFrame = new THREE.Mesh(new THREE.BoxGeometry(27, 7.4, 0.8), bridgeMat); bbFrame.position.set(0, 47, -72.6); city.add(bbFrame);

  /* ---------- traffic ---------- */
  const carBody = new THREE.BoxGeometry(2.2, 0.75, 4.2);
  const carCab = new THREE.BoxGeometry(1.7, 0.6, 2.0).translate(0, 0.62, -0.3);
  const headGeo = new THREE.BoxGeometry(1.8, 0.15, 0.1).translate(0, 0.05, 2.12);
  const tailGeo = new THREE.BoxGeometry(1.9, 0.18, 0.1).translate(0, 0.05, -2.12);
  const lanes = [];
  [[-7, -8, 1], [-3, -8, -1], [3, -8, 1], [7, -8, -1], [-6, 6, -1], [-2, 6, 1], [2, 6, -1], [6, 6, 1], [-5, 20, 1], [0, 20, -1], [5, 20, 1], [-4, 34, -1], [4, 34, 1], [-6, -24, -1], [6, -24, 1], [0, -40, -1]]
    .forEach(([x, y, dir]) => lanes.push({ x, y, dir, speed: rand(22, 40) }));
  const PER = 14, NCAR = lanes.length * PER, Z0 = 70, Z1 = -480;
  const bodyMesh = new THREE.InstancedMesh(carBody, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.5 }), NCAR);
  const cabMesh = new THREE.InstancedMesh(carCab, new THREE.MeshStandardMaterial({ color: 0x202a36, roughness: 0.15, metalness: 0.8 }), NCAR);
  const headMesh = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: glowColor(3, 3, 2.6), toneMapped: false }), NCAR);
  const tailMesh = new THREE.InstancedMesh(tailGeo, new THREE.MeshBasicMaterial({ color: glowColor(3.5, 0.3, 0.2), toneMapped: false }), NCAR);
  [bodyMesh, cabMesh, headMesh, tailMesh].forEach((m) => { m.frustumCulled = false; scene.add(m); });
  const cars = [];
  const cc = new THREE.Color();
  lanes.forEach((ln, li) => {
    for (let k = 0; k < PER; k++) {
      const i = li * PER + k;
      cars.push({ ln, z: Z0 + (Z1 - Z0) * (k / PER) + rand(-10, 10), bob: rand(0, 6), sway: rand(-0.4, 0.4) });
      bodyMesh.setColorAt(i, cc.set(pick([0xb8bcc2, 0x2e3a4a, 0x8a2f25, 0xd8d4cc, 0x3a5a7a, 0x5a6066, 0xc9a23a, 0x1e1e22])));
    }
  });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = V(1, 1, 1), P = V(), E = new THREE.Euler();

  /* ---------- the hero taxi ---------- */
  const taxi = new THREE.Group(); scene.add(taxi);
  {
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c41c, roughness: 0.35, metalness: 0.35 });
    const checkTex = canvasTex(256, 32, (g, w, h) => { for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) { g.fillStyle = ((x + y) / 16) % 2 ? '#111' : '#f2c41c'; g.fillRect(x, y, 16, 16); } });
    const prof = new THREE.Shape();   /* side profile, nose at +z */
    prof.moveTo(-2.3, 0); prof.lineTo(2.2, 0); prof.lineTo(2.55, 0.35); prof.lineTo(2.1, 0.75); prof.lineTo(0.9, 0.85); prof.lineTo(-2.0, 0.85); prof.lineTo(-2.3, 0.75); prof.closePath();
    const body = new THREE.ExtrudeGeometry(prof, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2 });
    body.rotateY(-Math.PI / 2); body.translate(1.1, -0.6, 0);
    taxi.add(new THREE.Mesh(body, yellow));
    for (const s of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.28), new THREE.MeshStandardMaterial({ map: checkTex, roughness: 0.5 }));
      stripe.position.set(s * 1.24, 0.12, 0); stripe.rotation.y = s * Math.PI / 2; taxi.add(stripe);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.1, metalness: 0.8 }));
      win.visible = false;
    }
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.75), new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.1, metalness: 0.8 }));
    ws.visible = false;
    /* glass cabin with a roof, so the driver shows */
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fc4e0, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 2.1), glass); cabin.position.set(0, 0.56, -0.35); cabin.renderOrder = 2; taxi.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.07, 2.2), yellow); roof.position.set(0, 0.9, -0.35); taxi.add(roof);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), yellow); post.position.set(sx * 0.98, 0.56, -0.35 + sz * 1.03); taxi.add(post); }
    {   /* a robot cabbie: boxy head with a glowing visor, hands on the wheel */
      const metal = new THREE.MeshStandardMaterial({ color: 0x5a6470, metalness: 0.7, roughness: 0.35 });
      const d = new THREE.Group(); d.position.set(-0.45, 0.2, -0.15); taxi.add(d);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.3), metal); torso.position.y = 0.15; d.add(torso);
      const head = new THREE.Group(); head.position.y = 0.58; d.add(head);
      head.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.3), metal));
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.02), new THREE.MeshBasicMaterial({ color: glowColor(0.4, 2.2, 3.2), toneMapped: false })); visor.position.set(0, 0.03, 0.16); head.add(visor);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 6), metal); ant.position.set(0.1, 0.22, 0); head.add(ant);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: 0x2a3a5a, roughness: 0.7 })); cap.position.set(0, 0.16, 0.04); head.add(cap);
      for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), metal); arm.rotation.x = Math.PI / 2 - 0.3; arm.position.set(sx * 0.2, 0.2, 0.25); d.add(arm); }
      taxi.userData.driverHead = head;
    }    const sign2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.35), new THREE.MeshBasicMaterial({ color: glowColor(2.4, 2.0, 0.6), toneMapped: false })); sign2.position.set(0, 1.07, -0.4); taxi.add(sign2);
    const thr = new THREE.MeshBasicMaterial({ color: glowColor(0.5, 0.9, 1.7), toneMapped: false });
    for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.2, 16).rotateX(Math.PI / 2), thr); t.position.set(s * 0.75, -0.25, -2.42); taxi.add(t); }
    const hl = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: glowColor(3, 3, 2.6), toneMapped: false })); hl.position.set(0, -0.05, 2.62); taxi.add(hl);
    const under = new THREE.PointLight(0x7fb8ff, 8, 6, 2); under.position.set(0, -0.9, 0); taxi.add(under);
  }
  taxi.scale.setScalar(0.95);
  let dive = -1;

  /* ---------- the blue singer on a floating stage ---------- */
  const stage = new THREE.Group(); stage.position.set(-7.6, 6.5, 8); scene.add(stage);
  const stageLights = [];
  let singer = null;
  const notes = [];
  {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.1, 0.35, 32), new THREE.MeshStandardMaterial({ color: 0x2a2440, metalness: 0.6, roughness: 0.35 }));
    stage.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: glowColor(2.2, 0.6, 2.0), toneMapped: false })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.18; stage.add(rim);
    const under = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.15, 0.6, 16), new THREE.MeshBasicMaterial({ color: glowColor(0.6, 1.2, 2.6), toneMapped: false })); under.position.y = -0.45; stage.add(under);
    [0xff4fd0, 0x4fd8ff, 0xffd24f].forEach((c, i) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5, 24, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      cone.position.set(0, 2.7, 0); const holder = new THREE.Group(); holder.add(cone); holder.rotation.set(0.25, (i / 3) * Math.PI * 2, 0); holder.position.y = 0.2; stage.add(holder);
      const pl = new THREE.PointLight(c, 6, 8, 1.6); pl.position.set(Math.sin(i * 2.1) * 1.5, 3.5, Math.cos(i * 2.1) * 1.5); stage.add(pl);
      stageLights.push({ holder, cone, pl, i });
    });
    if (window.BHFigures) {
      singer = BHFigures.person(THREE, { height: 2.0, alien: true, skin: 0x4a86d8, hair: 'none', robe: 0xece4f6, eyes: 0x221830 });
      singer.root.position.y = 0.18; singer.root.rotation.y = 0.55; stage.add(singer.root);
    }
    const noteTex = ['\u266a', '\u266b', '\u2669'].map((ch) => canvasTex(64, 64, (g, w, h) => { g.font = 'bold 54px "Segoe UI Symbol", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(ch, w / 2, h / 2); }));
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex[i % 3], color: glowColor(...[[2, 0.6, 1.8], [0.6, 1.6, 2.2], [2, 1.7, 0.5]][i % 3]), transparent: true, depthWrite: false, toneMapped: false }));
      sp.scale.setScalar(0.7); stage.add(sp); notes.push({ sp, t: i * 0.45 });
    }
  }

  /* ---------- controls, click, sizing ---------- */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 14, -10);
  Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, dampingFactor: 0.08, minPolarAngle: 1.1, maxPolarAngle: 1.85, minAzimuthAngle: -0.55, maxAzimuthAngle: 0.55 });
  controls.update();
  let lastTouch = -10;
  controls.addEventListener('start', () => { lastTouch = Infinity; renderer.domElement.style.cursor = 'grabbing'; });
  controls.addEventListener('end', () => { lastTouch = clock.elapsedTime; renderer.domElement.style.cursor = 'pointer'; });
  renderer.domElement.style.cursor = 'pointer';
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6 && dive < 0) { dive = 0; }
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
  const sph = new THREE.Spherical(), off = V(), prev = V(), vel = V();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!onScreen) return;
    const t = clock.elapsedTime;

    if (t - lastTouch > 4) {
      off.subVectors(camera.position, controls.target); sph.setFromVector3(off);
      sph.theta += (Math.sin(t * 0.1) * 0.35 - sph.theta) * 0.01;
      off.setFromSpherical(sph); camera.position.copy(controls.target).add(off);
    }

    /* traffic */
    cars.forEach((c, i) => {
      c.z -= c.ln.dir * c.ln.speed * dt;
      if (c.z < Z1) c.z += Z0 - Z1; else if (c.z > Z0) c.z -= Z0 - Z1;
      P.set(c.ln.x + Math.sin(t * 0.5 + c.bob) * c.sway, c.ln.y + Math.sin(t * 1.3 + c.bob) * 0.25, c.z);
      E.set(0, c.ln.dir > 0 ? Math.PI : 0, Math.sin(t * 0.5 + c.bob) * c.sway * 0.1);
      Q.setFromEuler(E); M.compose(P, Q, S);
      bodyMesh.setMatrixAt(i, M); cabMesh.setMatrixAt(i, M); headMesh.setMatrixAt(i, M); tailMesh.setMatrixAt(i, M);
    });
    [bodyMesh, cabMesh, headMesh, tailMesh].forEach((m) => (m.instanceMatrix.needsUpdate = true));

    /* the taxi weaves; click = a steep dive through the lanes and a climb back */
    prev.copy(taxi.position);
    let dy = 0;
    if (dive >= 0) {
      dive += dt;
      dy = -46 * smooth(0, 1.4, dive) * (1 - smooth(1.9, 4.6, dive));
      if (dive > 4.8) dive = -1;
    }
    taxi.position.set(Math.sin(t * 0.42) * 6.5, 10 + Math.sin(t * 0.29) * 3.2 + dy, 4 + Math.sin(t * 0.21) * 5);
    vel.subVectors(taxi.position, prev).divideScalar(Math.max(dt, 1e-3));
    taxi.rotation.set(Math.max(-0.9, Math.min(0.5, vel.y * 0.03)), Math.PI + vel.x * 0.02, -vel.x * 0.05);
    if (taxi.userData.driverHead) taxi.userData.driverHead.rotation.y = -vel.x * 0.02 + Math.sin(t * 0.3) * 0.2;

    /* the singer: arms rise with the high notes, lights sweep, notes float up */
    if (singer) {
      const sing = Math.sin(t * 1.3);
      singer.update(t, { armL: -1.2 - 0.9 * Math.max(0, sing), armR: -1.0 - 1.2 * Math.max(0, -sing), armLz: 0.5, armRz: -0.5, tilt: Math.sin(t * 0.9) * 0.15, lean: -0.1 * Math.max(0, sing) });
    }
    stage.position.y = 6.5 + Math.sin(t * 0.5) * 0.3;
    stageLights.forEach((l) => { l.holder.rotation.y = (l.i / 3) * Math.PI * 2 + t * 0.6; l.cone.material.opacity = 0.04 + 0.025 * Math.sin(t * 3 + l.i); });
    for (const n of notes) {
      n.t += dt;
      const k = (n.t % 4.5) / 4.5;
      n.sp.position.set(Math.sin(n.t * 1.7) * 0.8 + 0.3, 2.2 + k * 4, Math.cos(n.t * 1.3) * 0.6);
      n.sp.material.opacity = Math.sin(k * Math.PI);
    }

    signs.forEach((s) => (s.m.material.color.setScalar(s.flick && Math.sin(t * 13 + s.ph) > 0.85 ? 0.3 : 1.4)));
    bbMat.color.setScalar(1.2 + Math.sin(t * 2) * 0.12);

    controls.update();
    composer.render();
  });
};
