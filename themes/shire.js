/* bellhive99.com - home page theme: Lord of the Rings (hill village at sunset)
 * A grassy hill with round doors and glowing round windows dug in all the way around, chimney
 * smoke (and the odd smoke ring), a winding path, picket fence, flowers, round trees, lanterns,
 * fireflies and misty mountains under a golden sunset. The bellhive99 logo is carved into a
 * wooden signpost. Click for fireworks over the hill. Original design throughout.
 * Loaded by INDEXB.HTM (see themes/themes.js).
 */
(window.BHScenes = window.BHScenes || {}).shire = function (box, lib) {
  const { THREE, OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = lib;
  const ASPECT = 453 / 503, CROP = 780 / 1006;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const glowColor = (r, g, b) => new THREE.Color(r, g, b);

  box.title = 'Drag to look around \u00b7 click for fireworks';
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  box.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe7a676, 40, 170);
  const camera = new THREE.PerspectiveCamera(40, 1 / ASPECT, 0.1, 400);
  camera.position.set(0, 4.6, 16.5);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1006, 780), 0.5, 0.5, 0.85));
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
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    rg.addColorStop(0.6, 'rgba(255,255,255,0.1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  });
  const glowSprite = (color, scale, opacity = 1) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.scale.setScalar(scale);
    return s;
  };
  const woodDraw = (base, lines) => (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = pick(lines); g.globalAlpha = rand(0.25, 0.6); g.lineWidth = rand(0.6, 2.2);
      const y = rand(0, h); g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 2.5);
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  /* ---------- sky and light: low golden sun ---------- */
  const SUN = V(0.85, 0.15, -0.5).normalize();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 sunDir; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir); float h = d.y;
        vec3 hor = vec3(1.0, 0.68, 0.38), mid = vec3(0.86, 0.52, 0.48), top = vec3(0.24, 0.27, 0.52);
        vec3 col = mix(hor, mid, smoothstep(0.0, 0.16, h));
        col = mix(col, top, smoothstep(0.12, 0.62, h));
        col = mix(col, vec3(0.78, 0.56, 0.4), smoothstep(0.0, -0.12, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.62, 0.3) * pow(s, 5.0) * 0.45 + vec3(1.0, 0.9, 0.7) * pow(s, 900.0) * 3.0;
        gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
      }`,
  }));
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xffd2a6, 0x44552f, 1.15));
  const sun = new THREE.DirectionalLight(0xffb070, 3.2);
  sun.position.copy(SUN).multiplyScalar(30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 70 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8a9cff, 0.45);
  fill.position.set(-10, 6, 8);
  scene.add(fill);

  /* ---------- the land: a big hill with doorways cut into it ---------- */
  const MOUND = 2.6, SIG = 2.0;
  const roll = (x, z) => (0.35 * Math.sin(x * 0.32 + 1) * Math.cos(z * 0.27) + 0.22 * Math.sin(x * 0.11 - z * 0.17 + 2)) * (1 - smooth(17, 24, Math.max(Math.abs(x), Math.abs(z))));
  const baseH = (x, z) => MOUND * Math.exp(-(x * x + z * z) / (2 * SIG * SIG)) + roll(x, z);
  const cuts = [];
  function addCut(a, width, rise, len) {
    const dx = Math.sin(a), dz = Math.cos(a);
    const floor = baseH(dx * 4.6, dz * 4.6);
    let r0 = 0.5;
    while (r0 < 4.5 && baseH(dx * r0, dz * r0) > floor + rise) r0 += 0.02;
    const c = { a, dx, dz, w: width, r0, floor, len };
    cuts.push(c);
    return c;
  }
  let lastCut = 0;
  function H(x, z) {
    let h = baseH(x, z);
    lastCut = 0;
    for (const c of cuts) {
      const along = x * c.dx + z * c.dz;
      if (along < c.r0 - 0.6) continue;
      const lat = Math.abs(x * c.dz - z * c.dx);
      const k = (1 - smooth(c.w, c.w + 0.35, lat)) * smooth(c.r0 - 0.55, c.r0 - 0.12, along) * (1 - smooth(c.r0 + c.len, c.r0 + c.len + 0.6, along));
      if (k > 0) { h = h * (1 - k) + c.floor * k; lastCut = Math.max(lastCut, k); }
    }
    return h;
  }

  const DOORS = [[0, 0x2f6b3a], [2.15, 0x8a2f25], [-2.3, 0x2f4f7a], [3.5, 0xc9a23a]].map(([a, col]) => ({ cut: addCut(a, 0.62, 1.12, 1.1), col }));
  const WINDOWS = [0.62, -0.66, 1.45, -1.5, 2.85, -3.0].map((a) => addCut(a, 0.4, 0.95, 0.5));
  const frontDoor = DOORS[0].cut;
  const pathX = (z) => 0.55 * Math.sin(z * 0.5);

  {
    const size = 50, seg = 300;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), dirt = new THREE.Color(0x8a6a44);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, H(x, z));
      const n = Math.sin(x * 3.1 + z * 1.7) * 0.5 + Math.sin(x * 0.7 - z * 2.3) * 0.5;
      c.setHSL(0.25 + n * 0.025, 0.5, 0.27 + n * 0.05 + rand(-0.02, 0.02));
      const onPath = z > frontDoor.r0 && Math.abs(x - pathX(z)) < 0.42 + (z > 10 ? (z - 10) * 0.02 : 0);
      if (onPath) c.copy(dirt).offsetHSL(0, 0, rand(-0.04, 0.04));
      else if (lastCut > 0.4) c.lerp(dirt, smooth(0.4, 0.9, lastCut));
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const land = shadowy(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
    land.castShadow = false;
    scene.add(land);
    const outer = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshStandardMaterial({ color: 0x4f7330, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.03; scene.add(outer);
  }

  /* far mountains */
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4f5a7e, roughness: 1, flatShading: true });
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + rand(-0.08, 0.08), r = rand(95, 115), hgt = rand(7, 15), rad = rand(10, 17);
      const m = new THREE.Mesh(new THREE.ConeGeometry(rad, hgt, 7), mat);
      m.position.set(Math.sin(a) * r, hgt / 2 - 0.5, Math.cos(a) * r); m.rotation.y = rand(0, 6); scene.add(m);
    }
  }

  /* ---------- round doors and windows ---------- */
  const plankTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 3, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${rand(0.02, 0.08)})`; g.fillRect(rand(0, w), rand(0, h), 1, rand(4, 20)); }
  });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a8c78, roughness: 0.95 });
  const woodFrame = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd4a640, metalness: 0.9, roughness: 0.3 });
  const glassMat = new THREE.MeshBasicMaterial({ color: glowColor(2.0, 1.25, 0.5), toneMapped: false });
  const clickable = [];

  for (const d of DOORS) {
    const c = d.cut, g = new THREE.Group();
    g.position.set(c.dx * c.r0, c.floor + 0.53, c.dz * c.r0);
    g.rotation.y = c.a;
    const door = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: d.col, map: plankTex, roughness: 0.7 })));
    g.add(door);
    g.add(shadowy(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.075, 10, 40), woodFrame)));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), brass); knob.position.z = 0.07; g.add(knob);
    const step = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 20), stoneMat));
    step.position.set(0, -0.5, 0.45); step.scale.z = 0.6; g.add(step);
    scene.add(g);
  }
  const lampWins = [];
  for (const c of WINDOWS) {
    const g = new THREE.Group();
    g.position.set(c.dx * c.r0, c.floor + 0.62, c.dz * c.r0);
    g.rotation.y = c.a;
    g.add(new THREE.Mesh(new THREE.CircleGeometry(0.27, 28), glassMat));
    g.add(shadowy(new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.05, 8, 32), woodFrame)));
    const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.56, 0.03), woodFrame), bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.03), woodFrame);
    bar1.position.z = bar2.position.z = 0.02; g.add(bar1, bar2);
    const gl = glowSprite(glowColor(1.4, 0.8, 0.3), 1.1, 0.5); gl.position.z = 0.15; g.add(gl); lampWins.push(gl);
    scene.add(g);
  }

  /* chimneys with smoke */
  const chimneys = [V(0.85, 0, 0.15), V(-0.95, 0, -0.7), V(0.2, 0, -1.6)].map((p) => {
    const y = H(p.x, p.z);
    const ch = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.7, 10), stoneMat));
    ch.position.set(p.x, y + 0.2, p.z); scene.add(ch);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), stoneMat); cap.position.set(p.x, y + 0.57, p.z); scene.add(cap);
    return V(p.x, y + 0.6, p.z);
  });
  const smokeTex = canvasTex(64, 64, (g, w, h) => {
    const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    rg.addColorStop(0, 'rgba(255,255,255,0.8)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  });
  const smoke = [];
  chimneys.forEach((top, ci) => {
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xd9cfc6, transparent: true, depthWrite: false }));
      scene.add(s); smoke.push({ s, top, t: (i / 14) * 5 + ci * 0.7, drift: rand(0.8, 1.2) });
    }
  });
  const rings = Array.from({ length: 3 }, () => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 28), new THREE.MeshStandardMaterial({ color: 0xece4dc, transparent: true, opacity: 0, roughness: 1, depthWrite: false }));
    m.visible = false; scene.add(m); return { m, t: -1 };
  });
  let nextRing = 4;

  /* ---------- garden: path stones, fence, flowers, bushes, trees ---------- */
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0xcdbb98, roughness: 0.9 });
    const R = 5.8, posts = [];
    for (let a = -1.25; a <= 1.25; a += 0.075) {
      const x = Math.sin(a) * R, z = Math.cos(a) * R;
      if (Math.abs(x - pathX(z)) < 0.75) { posts.push(null); continue; }
      const p = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.48, 0.05), wood));
      const y = H(x, z); p.position.set(x, y + 0.22, z); p.rotation.y = a; scene.add(p);
      posts.push(V(x, y, z));
    }
    for (let i = 1; i < posts.length; i++) {
      const a = posts[i - 1], b = posts[i];
      if (!a || !b) continue;
      for (const hgt of [0.14, 0.34]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, a.distanceTo(b)), wood);
        rail.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + hgt, (a.z + b.z) / 2);
        rail.lookAt(b.x, b.y + hgt, b.z); scene.add(rail);
      }
    }

    const fgeo = new THREE.IcosahedronGeometry(0.035, 0);
    const n = 1100, flowers = new THREE.InstancedMesh(fgeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), n);
    const m = new THREE.Object3D(), c = new THREE.Color();
    let k = 0, guard = 0;
    while (k < n && guard++ < 20000) {
      const a = rand(-Math.PI, Math.PI), r = rand(2.9, 5.5);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const y = H(x, z);
      if (lastCut > 0.05 || Math.abs(x - pathX(z)) < 0.6) continue;
      m.position.set(x, y + 0.08, z); m.scale.setScalar(rand(0.7, 1.4)); m.updateMatrix();
      flowers.setMatrixAt(k, m.matrix);
      flowers.setColorAt(k, c.set(pick([0xe8c33a, 0xd9443a, 0xf2f0ea, 0xb565d8, 0xf08a3a, 0xe86aa6, 0x6f8fe8])));
      k++;
    }
    flowers.count = k; scene.add(flowers);

    const leaf = [0x5a8a36, 0x6a9a40, 0x77a848, 0x4f7d30];
    const bushGeo = new THREE.IcosahedronGeometry(0.35, 1);
    for (let i = 0; i < 26; i++) {
      const a = rand(-Math.PI, Math.PI), r = rand(4.3, 6.6), x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (Math.abs(x - pathX(z)) < 1 || H(x, z) && lastCut > 0.05) continue;
      const b = shadowy(new THREE.Mesh(bushGeo, new THREE.MeshStandardMaterial({ color: pick(leaf), roughness: 0.9, flatShading: true })));
      b.position.set(x, H(x, z) + 0.2, z); b.scale.set(rand(0.8, 1.4), rand(0.7, 1.1), rand(0.8, 1.4)); scene.add(b);
    }
    function tree(x, z, s) {
      const y = H(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
      const trunk = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 1 })));
      trunk.position.y = 0.75; g.add(trunk);
      const fm = new THREE.MeshStandardMaterial({ color: pick(leaf), roughness: 0.9, flatShading: true });
      [[0, 1.9, 0, 0.95], [0.5, 1.6, 0.2, 0.7], [-0.45, 1.65, -0.15, 0.72], [0.1, 2.35, -0.2, 0.65]].forEach(([fx, fy, fz, fr]) => {
        const f = shadowy(new THREE.Mesh(new THREE.IcosahedronGeometry(fr, 1), fm)); f.position.set(fx, fy, fz); g.add(f);
      });
      scene.add(g);
    }
    [[-6.5, -3, 1.2], [7, -4, 1.4], [-9.5, 4, 1.3], [9.5, 3.5, 1.1], [-4.5, -8, 1.5], [3.5, -8.5, 1.3], [-13, -3, 1.6], [13.5, -6, 1.5], [-11, 9, 1.2], [12, 10, 1.3], [0.6, -2.4, 1.15]]
      .forEach(([x, z, s]) => tree(x, z, s));
  }

  /* lanterns along the path */
  const lanterns = [];
  [[-0.95, 4.6], [1.15, 7.4]].forEach(([dx, z]) => {
    const x = pathX(z) + dx, y = H(x, z);
    const post = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 6), woodFrame)); post.position.set(x, y + 0.65, z); scene.add(post);
    const lampBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), new THREE.MeshBasicMaterial({ color: glowColor(2.2, 1.4, 0.5), toneMapped: false }));
    lampBox.position.set(x, y + 1.38, z); scene.add(lampBox);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.12, 4), woodFrame); roof.position.set(x, y + 1.54, z); roof.rotation.y = Math.PI / 4; scene.add(roof);
    const gl = glowSprite(glowColor(1.6, 0.9, 0.35), 1.4, 0.6); gl.position.copy(lampBox.position); scene.add(gl);
    lanterns.push(gl);
  });
  const porchLight = new THREE.PointLight(0xffa850, 6, 7, 1.6);
  porchLight.position.set(frontDoor.dx * (frontDoor.r0 + 1.2), frontDoor.floor + 1.4, frontDoor.dz * (frontDoor.r0 + 1.2));
  scene.add(porchLight);

  /* ---------- the signpost with the logo ---------- */
  {
    const signTex = canvasTex(1024, 256, (g, w, h) => {
      woodDraw('#8a6238', ['#6a4524', '#a87a48', '#5a3a1c'])(g, w, h);
      g.strokeStyle = 'rgba(40,22,8,0.55)'; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24);
      const parts = [['bell', '#2b1608'], ['hive', '#e2a52a'], ['99', '#2b1608']];
      g.font = 'bold 150px Georgia, "Times New Roman", serif'; g.textBaseline = 'middle';
      const total = parts.reduce((s, p) => s + g.measureText(p[0]).width, 0);
      let x = (w - total) / 2;
      for (const [txt, col] of parts) {
        g.fillStyle = 'rgba(255,232,190,0.3)'; g.fillText(txt, x + 4, h / 2 + 10);
        g.fillStyle = col; g.fillText(txt, x, h / 2 + 6);
        x += g.measureText(txt).width;
      }
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(30,15,5,${rand(0.05, 0.18)})`; g.beginPath(); g.arc(rand(0, w), rand(0, h), rand(2, 9), 0, 7); g.fill(); }
    });
    signTex.wrapS = signTex.wrapT = THREE.ClampToEdgeWrapping;
    const estTex = canvasTex(512, 128, (g, w, h) => {
      woodDraw('#7d5732', ['#5e3d1f', '#9a6e40'])(g, w, h);
      g.font = 'italic bold 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,232,190,0.3)'; g.fillText('est. 1999', w / 2 + 3, h / 2 + 5);
      g.fillStyle = '#2b1608'; g.fillText('est. 1999', w / 2, h / 2 + 3);
    });
    estTex.wrapS = estTex.wrapT = THREE.ClampToEdgeWrapping;
    const plain = new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 0.9 });
    const sx = 2.3, sz = 7.2, sy = H(sx, sz);
    const sign = new THREE.Group(); sign.position.set(sx, sy, sz); sign.rotation.y = -0.12; scene.add(sign);
    const post = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.3, 8), plain)); post.position.y = 1.15; sign.add(post);
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.85 });
    const board = shadowy(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.07), [plain, plain, plain, plain, signMat, signMat]));
    board.position.set(0, 1.85, 0.1); board.rotation.z = 0.03; sign.add(board); clickable.push(board);
    const estMat = new THREE.MeshStandardMaterial({ map: estTex, roughness: 0.85 });
    const est = shadowy(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.06), [plain, plain, plain, plain, estMat, estMat]));
    est.position.set(0.15, 1.3, 0.1); est.rotation.z = -0.05; sign.add(est);
  }

  /* ---------- fireflies ---------- */
  const flies = Array.from({ length: 45 }, () => {
    const a = rand(-Math.PI, Math.PI), r = rand(3.2, 9);
    const s = glowSprite(glowColor(1.6, 1.8, 0.5), 0.16);
    const base = V(Math.sin(a) * r, 0, Math.cos(a) * r); base.y = H(base.x, base.z) + rand(0.25, 1.4);
    scene.add(s);
    return { s, base, ph: rand(0, 6.3), sp: rand(0.4, 0.9), blink: rand(1.2, 2.6) };
  });

  /* ---------- fireworks ---------- */
  const rockets = [], bursts = [];
  for (let i = 0; i < 10; i++) { const s = glowSprite(glowColor(3, 2.2, 1.2), 0.35); s.visible = false; scene.add(s); rockets.push({ s, t: -1 }); }
  for (let i = 0; i < 10; i++) {
    const n = 180, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    pts.visible = false; pts.frustumCulled = false; scene.add(pts);
    bursts.push({ pts, n, vel: Array.from({ length: n }, () => V()), at: V(), t: -1 });
  }
  let show = [];
  function launch() {
    const r = rockets.find((x) => x.t < 0); if (!r) return;
    if (wizard) {   /* the fireworks fly from the wizard's staff */
      staffTip.getWorldPosition(tmpTip);
      r.from = tmpTip.clone(); r.to = V(rand(-4, 4), rand(6.5, 9.5), rand(-3.5, 0.5));
    } else { r.from = V(rand(-3.5, 3.5), 2, rand(-3.5, -1.5)); r.to = V(r.from.x + rand(-1.5, 1.5), rand(6.5, 9), r.from.z + rand(-1, 1)); }
    r.t = 0; r.dur = rand(1.0, 1.4);
    r.s.visible = true;
  }

  /* ---------- villagers and the wizard ---------- */
  const tmpTip = V();
  const villager = (o) => BHFigures.person(THREE, Object.assign({
    height: 0.95, stout: true, bigHead: true, shortLegs: true, hair: 'curly', barefoot: true, bigFeet: true, shorts: true,
    skin: 0xebc4a2, topColor: 0xece2cc,
  }, o));
  let walker = null, waver = null, gazer = null, wizard = null, staffTip = null, staffGlow = null;
  if (window.BHFigures) {
    walker = villager({ hairColor: 0x6a4020, vest: 0x3f6a2a, bottomColor: 0x6a4a2a });
    waver = villager({ hairColor: 0xa0702a, vest: 0x8a3a24, bottomColor: 0x4a3a2a, height: 0.9 });
    gazer = villager({ hairColor: 0x3a2412, vest: 0xc9a23a, bottomColor: 0x5a4632 });
    [walker, waver, gazer].forEach((p) => scene.add(p.root));
    const fd = cuts[0];
    waver.root.position.set(fd.dx * (fd.r0 + 1.0) + 0.55, fd.floor, fd.dz * (fd.r0 + 1.0));
    gazer.root.position.set(-2.6, H(-2.6, 4.4), 4.4); gazer.root.rotation.y = 2.6;

    wizard = BHFigures.person(THREE, { height: 1.95, robe: 0x8c8c92, hat: 'pointy', hatColor: 0x86868c, beard: 0xdcdcdc, hair: 'long', hairColor: 0xcfcfcf, skin: 0xe6c4a8 });
    wizard.root.position.set(-1.7, H(-1.7, 6.9), 6.9); wizard.root.rotation.y = 0.35; scene.add(wizard.root);
    const staff = new THREE.Group(); wizard.hand.R.add(staff);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.85 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 2.1, 8), wood); pole.position.y = 0.35; staff.add(pole);
    const crook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 16, Math.PI * 1.3), wood); crook.position.set(0.06, 1.42, 0); staff.add(crook);
    staffTip = new THREE.Object3D(); staffTip.position.set(0, 1.45, 0); staff.add(staffTip);
    staffGlow = glowSprite(glowColor(2.2, 2.0, 1.4), 0.6, 0); staffTip.add(staffGlow);
    wizard.staff = staff;
    [walker, waver, gazer, wizard].forEach((p) => p.root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }));
  }
  let raise = 0;
  function burst(p) {
    const b = bursts.find((x) => x.t < 0) || bursts[0];
    const col = b.pts.geometry.attributes.color.array, c = new THREE.Color(), c2 = new THREE.Color();
    c.setHSL(rand(0, 1), 1, 0.6); c2.setHSL(rand(0, 1), 1, 0.65);
    const ring = Math.random() < 0.3;
    b.vel.forEach((v, i) => {
      if (ring) { const a = (i / b.n) * Math.PI * 2; v.set(Math.cos(a), rand(-0.1, 0.1), Math.sin(a)).multiplyScalar(rand(3.2, 3.6)); }
      else v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(1.5, 3.8));
      const cc = i % 3 ? c : c2;
      col.set([cc.r * 3, cc.g * 3, cc.b * 3], i * 3);
    });
    b.pts.geometry.attributes.color.needsUpdate = true;
    b.at.copy(p); b.t = 0; b.pts.visible = true;
  }

  /* ---------- controls, click, sizing ---------- */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, 1.5);
  Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, dampingFactor: 0.08, autoRotate: true, autoRotateSpeed: 0.3, minPolarAngle: 0.7, maxPolarAngle: 1.42 });
  controls.update();
  let resumeTimer;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeTimer); renderer.domElement.style.cursor = 'grabbing'; });
  controls.addEventListener('end', () => { resumeTimer = setTimeout(() => (controls.autoRotate = true), 4000); renderer.domElement.style.cursor = 'pointer'; });
  renderer.domElement.style.cursor = 'pointer';
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6 && !show.length) {
      for (let i = 0; i < 9; i++) show.push(0.7 + i * rand(0.3, 0.45));
      raise = 4.8;
    }
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
  let onScreen = true, showClock = 0;
  new IntersectionObserver(([en]) => (onScreen = en.isIntersecting)).observe(box);
  const tmp = V();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!onScreen) return;
    const t = clock.elapsedTime;

    for (const p of smoke) {
      p.t += dt;
      const k = (p.t % 5) / 5;
      p.s.position.set(p.top.x + k * 0.9 * p.drift + Math.sin(p.t * 1.3) * 0.05, p.top.y + k * 2.2, p.top.z - k * 0.3);
      p.s.scale.setScalar(0.18 + k * 0.9);
      p.s.material.opacity = 0.45 * (1 - k) * smooth(0, 0.08, k);
    }
    nextRing -= dt;
    if (nextRing < 0) {
      nextRing = rand(6, 11);
      const r = rings.find((x) => x.t < 0);
      if (r) { r.t = 0; r.from = chimneys[0].clone().add(V(0, 0.15, 0)); r.m.visible = true; }
    }
    for (const r of rings) {
      if (r.t < 0) continue;
      r.t += dt;
      const k = r.t / 4.5;
      r.m.position.copy(r.from).add(tmp.set(k * 1.2, k * 2.4, -k * 0.2));
      r.m.scale.setScalar(1 + k * 2.2);
      r.m.rotation.set(Math.PI / 2 + Math.sin(r.t) * 0.2, 0, Math.sin(r.t * 0.7) * 0.2);
      r.m.material.opacity = 0.7 * (1 - k) * smooth(0, 0.1, k);
      if (k >= 1) { r.t = -1; r.m.visible = false; }
    }

    lampWins.forEach((w, i) => (w.material.opacity = 0.45 + Math.sin(t * 2.3 + i) * 0.05 + Math.sin(t * 7.1 + i * 3) * 0.03));
    lanterns.forEach((l, i) => (l.material.opacity = 0.55 + Math.sin(t * 5 + i * 2) * 0.06));
    porchLight.intensity = 6 + Math.sin(t * 6) * 0.4;

    for (const f of flies) {
      f.s.position.set(f.base.x + Math.sin(t * f.sp + f.ph) * 0.6, f.base.y + Math.sin(t * f.sp * 1.7 + f.ph) * 0.25, f.base.z + Math.cos(t * f.sp * 0.8 + f.ph) * 0.6);
      f.s.material.opacity = Math.pow(Math.max(0, Math.sin(t * f.blink + f.ph)), 3);
    }

    /* villagers: one strolls the path, one waves from the door, one watches the sky; the wizard leans on his staff */
    if (walker) {
      const u = (t * 0.09) % 2, back = u > 1, k = back ? 2 - u : u;
      const z = 4.3 + 4.0 * k, x = pathX(z) + 0.18;
      walker.root.position.set(x, H(x, z), z); walker.root.rotation.y = back ? Math.PI : 0;
      walker.update(t, { walk: 1, pace: 9 });
      waver.root.lookAt(camera.position.x, waver.root.position.y, camera.position.z);
      waver.update(t, { armR: -2.75, armRz: 0.35 + Math.sin(t * 7) * 0.3, tilt: Math.sin(t * 1.2) * 0.08 });
      gazer.update(t, { look: Math.sin(t * 0.25) * 0.4, armL: -0.2, armR: -0.2 });
      raise = Math.max(0, raise - dt);
      const rk = smooth(0, 0.5, raise);
      wizard.update(t, { armR: -0.35 - 2.35 * rk, armRz: 0.05, armL: 0.05, look: Math.sin(t * 0.2) * 0.2, lean: -0.05 * rk });
      wizard.staff.rotation.x = -wizard.arms.R.rotation.x;
      staffGlow.material.opacity = rk * (0.75 + Math.random() * 0.25);
      staffGlow.scale.setScalar(0.5 + rk * 0.5);
    }

    if (show.length) {
      showClock += dt;
      while (show.length && show[0] <= showClock) { show.shift(); launch(); }
      if (!show.length) showClock = 0;
    }
    for (const r of rockets) {
      if (r.t < 0) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.dur), e = 1 - (1 - k) * (1 - k);
      r.s.position.lerpVectors(r.from, r.to, e);
      r.s.scale.setScalar(0.3 + Math.random() * 0.15);
      if (k >= 1) { r.t = -1; r.s.visible = false; burst(r.to); }
    }
    for (const b of bursts) {
      if (b.t < 0) continue;
      b.t += dt;
      const arr = b.pts.geometry.attributes.position.array, k = b.t, drag = (1 - Math.exp(-k * 1.6)) / 1.6;
      b.vel.forEach((v, i) => { arr[i * 3] = b.at.x + v.x * drag; arr[i * 3 + 1] = b.at.y + v.y * drag - 0.9 * k * k; arr[i * 3 + 2] = b.at.z + v.z * drag; });
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - k / 2.2) * (0.85 + Math.random() * 0.15);
      if (k > 2.2) { b.t = -1; b.pts.visible = false; }
    }

    controls.update();
    composer.render();
  });
};
