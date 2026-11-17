/* bellhive99.com - home page theme: Aquarium (a saltwater reef tank)
 * Looking into a reef tank: rippling light on the sand, sun shafts from the surface, live rock,
 * branching and brain corals, a sea fan, swaying kelp, an anemone with orange-and-white clownfish
 * darting in and out, blue and yellow tangs, a school of little blue-green fish, and a lazy
 * pufferfish that puffs up now and then. A sunken treasure chest carved with bellhive99 creaks open
 * and lets out a burst of bubbles. Click: feeding time - flakes drift down and everyone rushes up.
 * Loaded by INDEXB.HTM (see themes/themes.js).
 */
(window.BHScenes = window.BHScenes || {}).aquarium = function (box, lib) {
  const { THREE, OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = lib;
  const ASPECT = 453 / 503, CROP = 780 / 1006;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const glowColor = (r, g, b) => new THREE.Color(r, g, b);

  box.title = 'Drag to look around \u00b7 click to feed the fish';
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
  renderer.setClearColor(0x0a3a5c, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  box.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c4a6e, 0.045);
  const camera = new THREE.PerspectiveCamera(45, 1 / ASPECT, 0.1, 100);
  camera.position.set(0, 3.2, 10.5);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1006, 780), 0.45, 0.5, 0.85));
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
  const bubbleTex = canvasTex(64, 64, (g, w, h) => {
    const rg = g.createRadialGradient(w * 0.5, h * 0.5, w * 0.28, w * 0.5, h * 0.5, w * 0.5);
    rg.addColorStop(0, 'rgba(255,255,255,0.05)'); rg.addColorStop(0.8, 'rgba(220,245,255,0.7)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(w * 0.36, h * 0.34, w * 0.09, 0, 7); g.fill();
  });
  const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const add = (p, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };

  /* tank bounds the fish keep to */
  const B = { x0: -6.2, x1: 6.2, y0: 0.5, y1: 5.0, z0: -3.6, z1: 3.2 };
  const SURFACE = 8.2;

  /* ---------- lights ---------- */
  scene.add(new THREE.HemisphereLight(0x9fe6ff, 0x0a2a40, 1.1));
  const sun = new THREE.DirectionalLight(0xe8fbff, 2.4);
  sun.position.set(2, 14, 4); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  /* ---------- the back of the tank: a deep-blue gradient wall ---------- */
  const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), new THREE.MeshBasicMaterial({ fog: false, map: canvasTex(16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2a8ab8'); gr.addColorStop(0.45, '#0e5480'); gr.addColorStop(1, '#06243c');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }) }));
  back.position.set(0, 4, -9); scene.add(back);

  /* ---------- sand with ripples, and rippling caustic light over it ---------- */
  const sandTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d8c69a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { g.fillStyle = pick(['#c9b484', '#e8d8b0', '#b8a070', '#f2e6c8', '#a89068']); g.globalAlpha = rand(0.3, 0.8); g.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3)); }
    g.globalAlpha = 1;
    for (let i = 0; i < 30; i++) { g.fillStyle = pick(['#f4eee0', '#e6c8b8', '#c8b8a8']); g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(3, 7), rand(2, 4), rand(0, 3), 0, 7); g.fill(); }   /* shell bits */
  }, 4, 3);
  const sandGeo = new THREE.PlaneGeometry(24, 16, 96, 64);
  {
    const p = sandGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, Math.sin(x * 0.45 + y * 0.2) * 0.18 + Math.sin(x * 2.4 + y * 1.1) * 0.03 + Math.cos(y * 0.6) * 0.12);
    }
    sandGeo.computeVertexNormals();
  }
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.receiveShadow = true; scene.add(sand);
  const sandY = (x, z) => { const y = -z; return Math.sin(x * 0.45 + y * 0.2) * 0.18 + Math.sin(x * 2.4 + y * 1.1) * 0.03 + Math.cos(y * 0.6) * 0.12; };

  const causticTex = canvasTex(256, 256, (g, w, h) => {   /* a web of bright wavy lines, tiles seamlessly */
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const pts = Array.from({ length: 26 }, () => [rand(0, w), rand(0, h)]);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 1e9, b = 1e9;
      for (const [px, py] of pts) for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        const dd = (x - px - ox) ** 2 + (y - py - oy) ** 2;
        if (dd < a) { b = a; a = dd; } else if (dd < b) b = dd;
      }
      const edge = Math.sqrt(b) - Math.sqrt(a);
      const v = Math.max(0, 1 - edge / 6) ** 2 * 255;
      const k = (y * w + x) * 4; d[k] = v * 0.85; d[k + 1] = v; d[k + 2] = v; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, 3, 2);
  const causticMats = [0, 1].map((i) => {
    const t = causticTex.clone(); t.needsUpdate = true; t.repeat.set(i ? 2.3 : 3, i ? 1.6 : 2);
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, color: 0xbff4ff });
  });
  const caustics = causticMats.map((m) => {
    const c = new THREE.Mesh(sandGeo, m); c.rotation.x = -Math.PI / 2; c.position.y = 0.02; scene.add(c); return c;
  });

  /* sun shafts from the surface */
  const shaftTex = canvasTex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h);
  });
  const shafts = Array.from({ length: 7 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(rand(0.8, 1.8), 9), new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xcff6ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.position.set(-5 + i * 1.7 + rand(-0.4, 0.4), 2.6, rand(-3, 1)); m.rotation.z = 0.32; m.rotation.y = rand(-0.4, 0.4);
    scene.add(m); return { m, ph: rand(0, 6.3), base: m.position.x };
  });

  /* the water surface, seen from below */
  const surfTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5ab8d8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(220,250,255,${rand(0.1, 0.35)})`; g.lineWidth = rand(1, 3); g.beginPath(); const x = rand(0, w), y = rand(0, h); g.ellipse(x, y, rand(8, 30), rand(4, 12), rand(0, 3), 0, 7); g.stroke(); }
  }, 3, 2);
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.MeshBasicMaterial({ map: surfTex, transparent: true, opacity: 0.75, side: THREE.DoubleSide, fog: false }));
  surface.rotation.x = Math.PI / 2; surface.position.y = SURFACE; scene.add(surface);

  /* ---------- live rock ---------- */
  const rockTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a7a6a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = pick(['#6a5a50', '#a08a78', '#7a5a6a', '#b07a8a', '#6a7a5a', '#9a6a5a', '#c89aa8']); g.globalAlpha = rand(0.3, 0.9); g.beginPath(); g.arc(rand(0, w), rand(0, h), rand(1, 5), 0, 7); g.fill(); }
    g.globalAlpha = 1;
  }, 2, 2);
  const rockMat = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 1, flatShading: true });
  const rocks = [[-4.2, 0.2, -1.6, 1.6], [-2.8, 0.1, -2.6, 1.3], [3.8, 0.1, -2.0, 1.5], [5.0, 0.2, -0.6, 1.0], [-5.2, 0.1, 0.4, 0.9], [1.4, 0, -3.0, 1.0]];
  for (const [x, y, z, s] of rocks) {
    const geo = new THREE.DodecahedronGeometry(s, 1), p = geo.attributes.position;
    const sx = rand(0, 9), sz = rand(0, 9);   /* lumpy but watertight: the bump depends only on the vertex position */
    for (let i = 0; i < p.count; i++) { const x0 = p.getX(i), y0 = p.getY(i), z0 = p.getZ(i), k = 1 + 0.16 * Math.sin(x0 * 3.1 + sx) * Math.cos(z0 * 2.7 + sz) + 0.08 * Math.sin(y0 * 4.3 + sx); p.setXYZ(i, x0 * k, y0 * k * 0.7, z0 * k); }
    geo.computeVertexNormals();
    const r = shadowy(new THREE.Mesh(geo, rockMat)); r.position.set(x, y + sandY(x, z), z); r.rotation.y = rand(0, 6); scene.add(r);
  }

  /* ---------- corals ---------- */
  const corals = new THREE.Group(); scene.add(corals);
  function branchCoral(x, z, color, scale) {   /* staghorn: branches that split */
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
    const tip = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).offsetHSL(0, 0, 0.18), roughness: 0.6, emissive: color, emissiveIntensity: 0.15 });
    const root = new THREE.Group(); root.position.set(x, sandY(x, z), z); root.scale.setScalar(scale); corals.add(root);
    const grow = (parent, len, r, depth) => {
      const seg = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, len, 7), mat)); seg.position.y = len / 2; parent.add(seg);
      const end = new THREE.Group(); end.position.y = len; parent.add(end);
      if (depth === 0) { add(end, new THREE.SphereGeometry(r * 0.8, 8, 6), tip); return; }
      const n = depth > 2 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const b = new THREE.Group(); end.add(b);
        b.rotation.set(rand(0.3, 0.7) * (i % 2 ? 1 : -1), (i / n) * Math.PI * 2 + rand(-0.4, 0.4), rand(-0.3, 0.3));
        grow(b, len * rand(0.65, 0.85), r * 0.72, depth - 1);
      }
    };
    grow(root, 0.45, 0.09, 3);
  }
  function brainCoral(x, z, r) {
    const t = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#c8b860'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#7a6a2a'; g.lineWidth = 3;
      for (let i = 0; i < 40; i++) {
        g.beginPath(); let px = rand(0, w), py = rand(0, h); g.moveTo(px, py);
        for (let k = 0; k < 14; k++) { px += rand(-12, 12); py += rand(-8, 8); g.lineTo(px, py); }
        g.stroke();
      }
    }, 2, 1);
    const m = shadowy(new THREE.Mesh(new THREE.SphereGeometry(r, 36, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, bumpMap: t, bumpScale: 2 })));
    m.position.set(x, sandY(x, z) - 0.05, z); m.scale.y = 0.75; corals.add(m);
  }
  const fans = [];
  function seaFan(x, z, color, size, ry) {
    const t = canvasTex(256, 256, (g, w, h) => {
      g.strokeStyle = color; g.lineCap = 'round';
      const branch = (x0, y0, a, len, lw) => {
        if (len < 6) return;
        const x1 = x0 + Math.cos(a) * len, y1 = y0 - Math.sin(a) * len;
        g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        branch(x1, y1, a + rand(0.15, 0.45), len * 0.78, lw * 0.75);
        branch(x1, y1, a - rand(0.15, 0.45), len * 0.78, lw * 0.75);
      };
      branch(w / 2, h, Math.PI / 2, 52, 8);
      g.globalAlpha = 0.35; g.lineWidth = 1;   /* the fine mesh between branches */
      for (let i = 0; i < 70; i++) { g.beginPath(); g.moveTo(rand(30, w - 30), rand(20, h - 40)); g.lineTo(rand(30, w - 30), rand(20, h - 40)); g.stroke(); }
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.8 }));
    m.geometry.translate(0, size / 2, 0); m.castShadow = true;
    m.position.set(x, sandY(x, z) - 0.05, z); m.rotation.y = ry; corals.add(m); fans.push(m);
  }
  function tubeCoral(x, z, color) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.12 });
    const inside = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const h = rand(0.25, 0.6), px = x + rand(-0.3, 0.3), pz = z + rand(-0.25, 0.25);
      const m = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, h, 10, 1, true), mat)); m.position.set(px, sandY(px, pz) + h / 2, pz); m.rotation.set(rand(-0.2, 0.2), 0, rand(-0.2, 0.2)); corals.add(m);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(0.065, 10), inside); cap.rotation.x = -Math.PI / 2; cap.position.set(0, h / 2 - 0.01, 0); m.add(cap);
    }
  }
  branchCoral(-3.6, -0.9, 0xd86a9a, 1.25);
  branchCoral(4.4, -1.2, 0x9a6ad8, 1.1);
  branchCoral(-1.6, -2.4, 0xe0904a, 0.95);
  brainCoral(2.6, -0.4, 0.7);
  brainCoral(-5.4, -1.8, 0.55);
  seaFan(-2.4, -3.0, '#c0305a', 2.6, 0.2);
  seaFan(3.4, -3.1, '#e0a030', 2.2, -0.3);
  tubeCoral(5.2, 0.6, 0xf07a30);
  tubeCoral(-0.6, -1.4, 0xe8d040);

  /* kelp ribbons that sway */
  const kelpMat = new THREE.MeshStandardMaterial({ color: 0x5aa83a, roughness: 0.7, side: THREE.DoubleSide, emissive: 0x1a3a0a, emissiveIntensity: 0.3 });
  const kelp = [];
  for (const [x, z, h] of [[-5.8, -2.6, 5.2], [-5.5, -2.2, 4.2], [-5.2, -3.1, 4.6], [-4.7, -2.8, 3.4], [5.8, -2.4, 4.8], [6.3, -1.4, 3.6], [5.4, -3.0, 4.2], [0.4, -3.4, 4.0], [0.8, -3.2, 3.2]]) {
    const geo = new THREE.PlaneGeometry(0.26, h, 1, 30); geo.translate(0, h / 2, 0);
    { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1.1 - 0.7 * (p.getY(i) / h)) + Math.sin(p.getY(i) * 5) * 0.03); }
    const m = new THREE.Mesh(geo, kelpMat); m.position.set(x, sandY(x, z), z); m.rotation.y = rand(-0.6, 0.6); m.castShadow = true; scene.add(m);
    kelp.push({ m, base: Float32Array.from(geo.attributes.position.array), h, ph: rand(0, 6.3) });
  }

  /* ---------- the anemone ---------- */
  const ANEM = V(-1.2, sandY(-1.2, 0.6), 0.6);
  const tentacles = [];
  {
    const base = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 20), new THREE.MeshStandardMaterial({ color: 0xa04a6a, roughness: 0.8 })));
    base.position.copy(ANEM).add(V(0, 0.15, 0)); scene.add(base);
    const tmat = new THREE.MeshStandardMaterial({ color: 0xf0a8c0, roughness: 0.5, emissive: 0x8a3a60, emissiveIntensity: 0.35 });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xff70b0, roughness: 0.4, emissive: 0xff3a90, emissiveIntensity: 0.5 });
    for (let i = 0; i < 70; i++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 0.42;
      const piv = new THREE.Group(); piv.position.copy(ANEM).add(V(Math.cos(a) * r, 0.3, Math.sin(a) * r)); scene.add(piv);
      const len = rand(0.35, 0.6);
      add(piv, new THREE.CapsuleGeometry(0.03, len, 3, 6), tmat, 0, len / 2, 0);
      add(piv, new THREE.SphereGeometry(0.04, 6, 5), tipMat, 0, len + 0.03, 0);
      tentacles.push({ piv, a, r, ph: rand(0, 6.3) });
    }
  }

  /* ---------- the treasure chest, carved with bellhive99 ---------- */
  const chest = new THREE.Group(); chest.position.set(1.7, sandY(1.7, 0.4) + 0.02, 0.4); chest.rotation.set(0.04, -0.28, 0.06); scene.add(chest);
  let lidPivot, chestGlow;
  const CW = 1.9, CH = 0.8, CD = 1.0;
  {
    const woodTex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#5a3a1e'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#4e3218' : '#62401f'; g.fillRect(0, (i * h) / 5, w, h / 5 - 3); }
      for (let i = 0; i < 120; i++) { g.strokeStyle = `rgba(30,18,8,${rand(0.15, 0.4)})`; g.lineWidth = rand(0.5, 2); const y = rand(0, h); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rand(-4, 4), w * 0.6, y + rand(-4, 4), w, y + rand(-3, 3)); g.stroke(); }
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(60,110,90,${rand(0.08, 0.25)})`; g.beginPath(); g.arc(rand(0, w), rand(0, h), rand(4, 16), 0, 7); g.fill(); }   /* algae */
    });
    const frontTex = canvasTex(1024, 432, (g, w, h) => {
      const img = woodTex.image; g.drawImage(img, 0, 0, w, h);
      g.fillStyle = '#a8862e'; g.fillRect(0, 0, 34, h); g.fillRect(w - 34, 0, 34, h);   /* brass corner bands */
      g.font = 'bold 150px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(20,10,4,0.75)'; g.fillText('bellhive99', w / 2 + 4, h * 0.56 + 5);   /* carved shadow */
      const gr = g.createLinearGradient(0, h * 0.35, 0, h * 0.75); gr.addColorStop(0, '#ffe08a'); gr.addColorStop(0.5, '#d8a832'); gr.addColorStop(1, '#8a6018');
      g.fillStyle = gr; g.fillText('bellhive99', w / 2, h * 0.56);
      g.strokeStyle = 'rgba(60,30,8,0.6)'; g.lineWidth = 2; g.strokeText('bellhive99', w / 2, h * 0.56);
    });
    frontTex.wrapS = frontTex.wrapT = THREE.ClampToEdgeWrapping;
    const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 });
    const front = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: frontTex, emissiveIntensity: 0.08 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc09a40, metalness: 0.8, roughness: 0.35, emissive: 0x3a2a08, emissiveIntensity: 0.4 });
    const body = shadowy(new THREE.Mesh(new THREE.BoxGeometry(CW, CH, CD), [wood, wood, wood, wood, front, wood]));
    body.position.y = CH / 2; chest.add(body);
    for (const x of [-CW / 2 + 0.05, CW / 2 - 0.05]) shadowy(add(chest, new THREE.BoxGeometry(0.1, CH + 0.02, CD + 0.02), brass, x, CH / 2, 0));
    add(chest, new THREE.BoxGeometry(0.16, 0.2, 0.04), brass, 0, CH - 0.06, CD / 2 + 0.02);   /* lock plate */
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc840, metalness: 0.9, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.6 });
    for (let i = 0; i < 26; i++) { const c = add(chest, new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), gold, rand(-0.75, 0.75), CH - 0.04 + rand(0, 0.08), rand(-0.35, 0.35)); c.rotation.set(rand(-0.5, 0.5), 0, rand(-0.5, 0.5)); }
    lidPivot = new THREE.Group(); lidPivot.position.set(0, CH, -CD / 2); chest.add(lidPivot);
    const lid = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(CD / 2, CD / 2, CW, 20, 1, false, 0, Math.PI), wood));
    lid.rotation.set(0, 0, Math.PI / 2); lid.position.set(0, 0, CD / 2); lidPivot.add(lid);
    for (const x of [-CW / 2 + 0.05, CW / 2 - 0.05]) { const band = add(lidPivot, new THREE.CylinderGeometry(CD / 2 + 0.015, CD / 2 + 0.015, 0.1, 20, 1, false, 0, Math.PI), brass, x, 0, CD / 2); band.rotation.set(0, 0, Math.PI / 2); }
    chestGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: glowColor(2.2, 1.6, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    chestGlow.scale.setScalar(2.2); chestGlow.position.set(0, CH + 0.2, 0); chest.add(chestGlow);
  }

  /* ---------- bubbles ---------- */
  const bubbles = Array.from({ length: 140 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false, opacity: 0.85 }));
    s.visible = false; scene.add(s);
    return { s, v: 0, ph: 0, on: false };
  });
  function bubble(p, size = rand(0.05, 0.14)) {
    const b = bubbles.find((x) => !x.on); if (!b) return;
    b.on = true; b.s.visible = true; b.s.position.copy(p); b.s.scale.setScalar(size); b.v = rand(0.9, 1.5) * (0.6 + size * 4); b.ph = rand(0, 6.3);
  }
  const BUBBLER = V(-4.6, 0.3, -2.4);

  /* ---------- fish ---------- */
  function fishTex(draw) { const t = canvasTex(256, 128, draw); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; return t; }
  /* the body is a sphere stretched along z; texture v runs head (top of the canvas) to tail */
  const TO_TAIL = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);   /* shape x -> up, shape y -> along the body */
  const TO_FIN = new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);    /* shape x -> along the body, shape y -> up */
  function makeFish(o) {
    const g = new THREE.Group();
    const bodyGeo = new THREE.SphereGeometry(0.5, 24, 16).rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ map: o.tex, roughness: 0.4, emissive: 0xffffff, emissiveMap: o.tex, emissiveIntensity: 0.12 }));
    body.scale.set(o.w, o.h, o.len); body.castShadow = true; g.add(body);
    const finMat = new THREE.MeshStandardMaterial({ color: o.fin, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.9, emissive: o.fin, emissiveIntensity: 0.15 });
    const tail = new THREE.Group(); tail.position.z = -o.len * 0.45; g.add(tail);
    const ts = new THREE.Shape(); const L = o.len * 0.45, Ht = o.h * 0.6;
    ts.moveTo(0, 0); ts.lineTo(-Ht, -L); ts.quadraticCurveTo(0, -L * 0.7, Ht, -L); ts.lineTo(0, 0);
    const tm = new THREE.Mesh(new THREE.ShapeGeometry(ts).applyMatrix4(TO_TAIL), o.tailMat || finMat); tail.add(tm);
    const ds = new THREE.Shape(); ds.moveTo(-o.len * 0.3, 0); ds.quadraticCurveTo(0, o.h * 0.55 * (o.dorsal || 1), o.len * 0.2, 0); ds.lineTo(-o.len * 0.3, 0);
    const dorsal = new THREE.Mesh(new THREE.ShapeGeometry(ds).applyMatrix4(TO_FIN), finMat); dorsal.position.y = o.h * 0.42; g.add(dorsal);
    if (o.anal) { const an = dorsal.clone(); an.scale.set(1, -0.6, 0.7); an.position.y = -o.h * 0.4; g.add(an); }
    const pecs = [];
    for (const s of [-1, 1]) {
      const p = new THREE.Group(); p.position.set(s * o.w * 0.45, -o.h * 0.1, o.len * 0.12); g.add(p);
      const pm = new THREE.Mesh(new THREE.CircleGeometry(o.h * 0.25, 10, 0, Math.PI), finMat); pm.rotation.set(0, s * 0.3, -Math.PI / 2); pm.position.z = -o.h * 0.05; p.add(pm);
      pecs.push(p);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(o.h * 0.1, 10, 8), new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.1 }));
      eye.position.set(s * o.w * 0.36, o.h * 0.12, o.len * 0.32); g.add(eye);
      const ring = new THREE.Mesh(new THREE.SphereGeometry(o.h * 0.13, 10, 8), new THREE.MeshStandardMaterial({ color: o.eyeRing || 0xf0f0e0, roughness: 0.4 }));
      ring.position.copy(eye.position).add(V(-s * 0.012, 0, -0.005)); g.add(ring);
    }
    g.scale.setScalar(o.size || 1);
    scene.add(g);
    return { g, tail, pecs };
  }

  const clownTex = fishTex((g, w, h) => {
    g.fillStyle = '#ff7a1a'; g.fillRect(0, 0, w, h);
    for (const y of [0.18, 0.5, 0.8]) {
      g.fillStyle = '#111'; g.fillRect(0, h * y - 11, w, 22);
      g.fillStyle = '#fbfbf6'; g.fillRect(0, h * y - 8, w, 16);
    }
    g.fillStyle = '#111'; g.fillRect(0, h - 6, w, 6);
  });
  const blueTangTex = fishTex((g, w, h) => {
    g.fillStyle = '#1a5ad8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0a1430';
    g.beginPath(); g.moveTo(w * 0.15, h * 0.25); g.bezierCurveTo(w * 0.25, h * 0.6, w * 0.3, h * 0.8, w * 0.22, h); g.lineTo(w * 0.36, h); g.bezierCurveTo(w * 0.4, h * 0.6, w * 0.3, h * 0.3, w * 0.15, h * 0.25); g.fill();
    g.beginPath(); g.moveTo(w * 0.65, h * 0.25); g.bezierCurveTo(w * 0.75, h * 0.6, w * 0.8, h * 0.8, w * 0.72, h); g.lineTo(w * 0.86, h); g.bezierCurveTo(w * 0.9, h * 0.6, w * 0.8, h * 0.3, w * 0.65, h * 0.25); g.fill();
    g.fillStyle = '#ffd820'; g.fillRect(0, h * 0.9, w, h * 0.1);
  });
  const yellowTex = fishTex((g, w, h) => { g.fillStyle = '#ffd81a'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, h * 0.7, w, 4); });
  const chromisTex = fishTex((g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#30d8c0'); gr.addColorStop(0.5, '#70f0ff'); gr.addColorStop(1, '#30d8c0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const pufferTex = fishTex((g, w, h) => {
    g.fillStyle = '#c8a850'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a2a14'; for (let i = 0; i < 140; i++) { g.beginPath(); g.arc(rand(0, w), rand(0, h), rand(2, 4.5), 0, 7); g.fill(); }
  });
  const yellowFin = new THREE.MeshStandardMaterial({ color: 0xffd820, roughness: 0.5, side: THREE.DoubleSide, emissive: 0xffd820, emissiveIntensity: 0.15 });

  const fishes = [];
  const wanderIn = (box) => V(rand(box.x0, box.x1), rand(box.y0, box.y1), rand(box.z0, box.z1));
  function spawn(kind, n, opts, swim) {
    for (let i = 0; i < n; i++) {
      const f = makeFish(opts);
      const p = swim.home ? swim.home.clone().add(V(rand(-0.5, 0.5), rand(0.3, 0.8), rand(-0.5, 0.5))) : wanderIn(B);
      f.g.position.copy(p);
      Object.assign(f, { kind, vel: V(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(0.3), target: wanderIn(B), retarget: rand(0, 4), speed: swim.speed, turn: swim.turn, ph: rand(0, 6.3), home: swim.home, range: swim.range, idx: i, puff: 0 });
      fishes.push(f);
    }
  }
  spawn('clown', 3, { tex: clownTex, len: 0.42, h: 0.22, w: 0.13, fin: 0xff7a1a, dorsal: 0.8, anal: true }, { speed: 0.9, turn: 3, home: ANEM.clone().add(V(0, 0.7, 0)), range: 1.1 });
  spawn('bluetang', 2, { tex: blueTangTex, len: 0.85, h: 0.55, w: 0.16, fin: 0x1a5ad8, tailMat: yellowFin, dorsal: 0.6, anal: true }, { speed: 1.0, turn: 1.6 });
  spawn('yellowtang', 2, { tex: yellowTex, len: 0.65, h: 0.6, w: 0.12, fin: 0xffd81a, dorsal: 0.7, anal: true, eyeRing: 0xfff6c0 }, { speed: 0.9, turn: 1.8 });
  spawn('chromis', 22, { tex: chromisTex, len: 0.22, h: 0.11, w: 0.06, fin: 0x40e0d0, dorsal: 0.6 }, { speed: 1.5, turn: 3.5 });
  spawn('puffer', 1, { tex: pufferTex, len: 0.7, h: 0.5, w: 0.45, fin: 0xd8c890, dorsal: 0.4, eyeRing: 0x2a4a2a }, { speed: 0.35, turn: 0.9 });
  const school = { c: V(2, 3, -1), target: V(0, 3, 0), t: 0 };

  /* ---------- feeding time ---------- */
  const flakeMats = ['#e0502a', '#f0a030', '#c8d040', '#a03020'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.25 }));
  const flakes = Array.from({ length: 60 }, () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.06), pick(flakeMats)); m.visible = false; scene.add(m);
    return { m, on: false, vy: 0, ph: 0, spin: V() };
  });
  let feeding = 0;
  function feed() {
    const cx = rand(-2, 2), cz = rand(-1, 1.2);
    flakes.forEach((f, i) => {
      f.on = true; f.m.visible = true;
      f.m.position.set(cx + rand(-1.4, 1.4), SURFACE - 0.05 + rand(0, 0.1), cz + rand(-0.8, 0.8));
      f.vy = rand(0.12, 0.3); f.ph = rand(0, 6.3); f.spin.set(rand(-3, 3), rand(-3, 3), rand(-3, 3)); f.delay = i * 0.02;
    });
    feeding = 16;
  }

  /* ---------- controls, click, sizing ---------- */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2.6, 0);
  Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.5, minPolarAngle: 1.2, maxPolarAngle: 1.75, minAzimuthAngle: -0.6, maxAzimuthAngle: 0.6 });
  controls.update();
  let lastTouch = -10;
  controls.addEventListener('start', () => { lastTouch = Infinity; renderer.domElement.style.cursor = 'grabbing'; });
  controls.addEventListener('end', () => { lastTouch = clock.elapsedTime; renderer.domElement.style.cursor = 'pointer'; });
  renderer.domElement.style.cursor = 'pointer';
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) feed();
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
  let onScreen = true, chestT = rand(4, 8), chestOpen = 0, chestWant = 0, bubblerT = 0;
  new IntersectionObserver(([en]) => (onScreen = en.isIntersecting)).observe(box);
  const sph = new THREE.Spherical(), off = V(), want = V(), tmp = V(), look = V(), chestTop = V(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!onScreen) return;
    const t = clock.elapsedTime;

    if (t - lastTouch > 4) {
      off.subVectors(camera.position, controls.target); sph.setFromVector3(off);
      sph.theta += (Math.sin(t * 0.08) * 0.35 - sph.theta) * 0.01;
      off.setFromSpherical(sph); camera.position.copy(controls.target).add(off);
    }

    /* light in the water */
    causticMats[0].map.offset.set(t * 0.012, t * 0.02);
    causticMats[1].map.offset.set(-t * 0.017, t * 0.011);
    caustics[0].position.x = Math.sin(t * 0.3) * 0.05;
    shafts.forEach((s) => { s.m.material.opacity = 0.07 + 0.05 * Math.sin(t * 0.5 + s.ph); s.m.position.x = s.base + Math.sin(t * 0.2 + s.ph) * 0.3; });
    surfTex.offset.set(t * 0.01, Math.sin(t * 0.2) * 0.02);

    /* plants and anemone sway */
    for (const k of kelp) {
      const p = k.m.geometry.attributes.position, a = p.array;
      for (let i = 0; i < p.count; i++) {
        const y = k.base[i * 3 + 1], u = y / k.h;
        a[i * 3] = k.base[i * 3] + Math.sin(t * 0.8 + k.ph + u * 2.5) * 0.45 * u * u;
        a[i * 3 + 2] = k.base[i * 3 + 2] + Math.sin(t * 0.6 + k.ph + u * 3) * 0.25 * u;
      }
      p.needsUpdate = true; k.m.geometry.computeVertexNormals();
    }
    fans.forEach((f, i) => (f.rotation.z = Math.sin(t * 0.7 + i) * 0.04));
    for (const tc of tentacles) {
      const out = 0.25 + tc.r * 1.2;
      tc.piv.rotation.set(Math.sin(t * 1.3 + tc.ph) * 0.25 + Math.sin(tc.a) * out, 0, -Math.cos(tc.a) * out + Math.cos(t * 1.1 + tc.ph) * 0.2);
    }

    /* the chest creaks open every so often and lets out a burst of bubbles */
    chestT -= dt;
    if (chestT <= 0) { chestWant = chestWant ? 0 : 1; chestT = chestWant ? 3.5 : rand(8, 14); }
    chestOpen += (chestWant - chestOpen) * Math.min(1, dt * (chestWant ? 1.2 : 3));
    lidPivot.rotation.x = -1.1 * chestOpen;
    chestGlow.material.opacity = chestOpen * (0.5 + Math.sin(t * 3) * 0.1);
    if (chestOpen > 0.5 && Math.random() < dt * 30) { chest.localToWorld(chestTop.set(rand(-0.7, 0.7), CH + 0.1, rand(-0.3, 0.3))); bubble(chestTop); }
    bubblerT -= dt;
    if (bubblerT <= 0) { bubblerT = rand(0.05, 0.2); bubble(tmp.copy(BUBBLER).add(V(rand(-0.05, 0.05), 0, rand(-0.05, 0.05))), rand(0.04, 0.1)); }
    for (const b of bubbles) {
      if (!b.on) continue;
      b.s.position.y += b.v * dt;
      b.s.position.x += Math.sin(t * 6 + b.ph) * 0.004;
      if (b.s.position.y > SURFACE - 0.05) { b.on = false; b.s.visible = false; }
    }

    /* flakes drift down, fluttering */
    feeding = Math.max(0, feeding - dt);
    const live = [];
    for (const f of flakes) {
      if (!f.on) continue;
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.m.position.y -= f.vy * dt;
      f.m.position.x += Math.sin(t * 2 + f.ph) * 0.003;
      f.m.rotation.x += f.spin.x * dt; f.m.rotation.y += f.spin.y * dt;
      if (f.m.position.y < 0.15 || feeding <= 0) { f.on = false; f.m.visible = false; } else live.push(f);
    }

    /* the little school moves as one */
    school.t -= dt;
    if (school.t <= 0) { school.t = rand(4, 8); school.target.copy(wanderIn({ x0: -4.5, x1: 4.5, y0: 1.8, y1: 4.8, z0: -2.5, z1: 1.5 })); }
    school.c.lerp(school.target, Math.min(1, dt * 0.35));

    /* fish */
    for (const f of fishes) {
      const p = f.g.position;
      let speed = f.speed, turn = f.turn;
      let food = null;
      if (live.length) {
        let best = 1e9;
        for (const fl of live) { const d = fl.m.position.distanceToSquared(p); if (d < best) { best = d; food = fl; } }
      }
      if (food) {
        want.copy(food.m.position); speed *= 2.1; turn *= 1.8;
        if (p.distanceTo(food.m.position) < 0.18 * (f.g.scale.x || 1) + 0.08) { food.on = false; food.m.visible = false; }
      } else if (f.kind === 'chromis') {
        want.copy(school.c).add(tmp.set(Math.sin(f.idx * 2.1 + t * 0.4) * 0.9, Math.cos(f.idx * 1.3) * 0.5, Math.cos(f.idx * 2.1 + t * 0.4) * 0.7));
      } else {
        f.retarget -= dt;
        if (f.retarget <= 0 || p.distanceTo(f.target) < 0.4) {
          f.retarget = rand(3, 7);
          if (f.home) f.target.copy(f.home).add(V(rand(-f.range, f.range), rand(-0.3, f.range * 0.8), rand(-f.range, f.range)));
          else f.target.copy(wanderIn(f.kind === 'puffer' ? { x0: -4, x1: 4, y0: 1.2, y1: 3.5, z0: -2, z1: 2 } : B));
        }
        want.copy(f.target);
        if (f.kind === 'clown' && Math.sin(t * 0.5 + f.idx * 2) > 0.7) { want.copy(ANEM).add(V(0, 0.45, 0)); speed *= 0.6; }   /* nestle into the anemone */
      }
      want.sub(p);
      const dist = want.length();
      want.normalize().multiplyScalar(speed * Math.min(1, dist + 0.25));
      f.vel.lerp(want, Math.min(1, dt * turn * 0.8));
      p.addScaledVector(f.vel, dt);
      p.x = Math.min(B.x1 + 0.5, Math.max(B.x0 - 0.5, p.x)); p.y = Math.min(SURFACE - 0.25, Math.max(0.35, p.y)); p.z = Math.min(B.z1, Math.max(B.z0, p.z));
      const v = f.vel.length();
      if (v > 0.02) {
        look.copy(p).add(tmp.copy(f.vel).setY(f.vel.y * 0.5));
        q0.copy(f.g.quaternion); f.g.lookAt(look); q1.copy(f.g.quaternion);
        f.g.quaternion.copy(q0).slerp(q1, Math.min(1, dt * 5));
      }
      const beat = 4 + v * 9;
      f.ph += dt * beat;
      f.tail.rotation.y = Math.sin(f.ph) * (0.35 + v * 0.3);
      f.pecs.forEach((pc, i) => (pc.rotation.y = (i ? 1 : -1) * (0.3 + Math.sin(f.ph * 0.7) * 0.3)));
      if (f.kind === 'puffer') {   /* every so often it puffs up into a ball */
        f.puff = Math.max(0, f.puff - dt);
        if (f.puff <= 0 && Math.random() < dt / 20) f.puff = 4;
        const k = smooth(0, 0.6, f.puff) * smooth(4, 3.2, f.puff);
        f.g.children[0].scale.set(0.45 + k * 0.35, 0.5 + k * 0.3, 0.7 - k * 0.0);
      }
    }

    controls.update();
    composer.render();
  });
};
