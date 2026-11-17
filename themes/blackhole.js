/* bellhive99.com - home page theme: Interstellar (the black hole)
 * A spinning black hole whose light-bent accretion disk wraps over and under it, a thin photon
 * ring, a starfield, and a small ring-shaped ship orbiting with bellhive99 stenciled on it. The
 * lensing is real: each pixel's light ray is bent around the hole in a shader. Click for time
 * dilation - everything slows to a crawl while Earth's clock races ahead. Original design.
 * Loaded by INDEXB.HTM (see themes/themes.js).
 */
(window.BHScenes = window.BHScenes || {}).blackhole = function (box, lib) {
  const { THREE, OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = lib;
  const ASPECT = 453 / 503, CROP = 780 / 1006;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  box.title = 'Drag to look around · click for time dilation';
  box.style.position = 'relative';
  const mask = 'linear-gradient(to right, transparent, #000 9%, #000 91%, transparent), linear-gradient(to bottom, transparent, #000 9%, #000 91%, transparent)';
  box.style.webkitMaskImage = mask; box.style.maskImage = mask;
  box.style.webkitMaskComposite = 'source-in'; box.style.maskComposite = 'intersect';

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    box.innerHTML = '<p style="font: 28px Arial, sans-serif; letter-spacing: 8px; padding-top: 180px;">BELLHIVE99</p>';
    throw e;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));   /* the lensing shader is per pixel */
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  box.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  /* time-dilation readout */
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:50%;top:13%;transform:translateX(-50%);font:600 15px/1.6 "Segoe UI",Arial,sans-serif;letter-spacing:3px;color:#cfe3ff;text-align:center;opacity:0;transition:opacity .6s;pointer-events:none;text-shadow:0 0 8px #000;';
  box.appendChild(hud);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1 / ASPECT, 0.1, 2000);
  camera.position.set(0, 3.2, 34);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1006, 780), 0.45, 0.35, 0.82));
  composer.addPass(new OutputPass());

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const glowTex = canvasTex(64, 64, (g, w, h) => {
    const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,255,255,0.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  });

  /* ---------- stars ---------- */
  function stars(n, size, rMin, rMax) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const v = V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(rMin, rMax));
      pos.set([v.x, v.y, v.z], i * 3);
      c.setHSL(rand(0.55, 0.65), rand(0, 0.35), rand(0.6, 0.95)); col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ size, map: glowTex, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }));
  }
  scene.add(stars(4000, 2.2, 600, 900), stars(250, 4, 600, 900));

  /* ---------- the black hole: ray-marched, light bent around the hole ---------- */
  const BOUND = 15;   /* the shader works inside this sphere; units: horizon radius = 1 */
  const bhMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uBound: { value: BOUND } },
    vertexShader: `varying vec3 vWorld; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; uniform float uBound; varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      vec3 diskColor(vec3 p, vec3 dir, out float alpha) {
        float r = length(p.xz);
        float inner = 2.6, outer = 9.5;
        if (r < inner || r > outer) { alpha = 0.0; return vec3(0.0); }
        float ang = atan(p.z, p.x);
        float spin = uTime * 0.9 / pow(r, 1.5);
        float swirl = fbm(vec2(r * 2.2, (ang + spin * 6.0) * 3.0)) * 0.65 + fbm(vec2(r * 7.0, (ang + spin * 6.0) * 9.0)) * 0.35;
        float t = (r - inner) / (outer - inner);
        vec3 hot = vec3(1.6, 1.35, 1.05), mid = vec3(1.4, 0.75, 0.3), cool = vec3(0.6, 0.18, 0.05);
        vec3 c = mix(hot, mid, smoothstep(0.0, 0.35, t)); c = mix(c, cool, smoothstep(0.35, 1.0, t));
        vec3 orbit = normalize(vec3(-p.z, 0.0, p.x));
        float dop = 1.0 + 0.35 * dot(orbit, -dir);
        float edge = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.7, 1.0, t));
        alpha = clamp(edge * (0.55 + 0.6 * swirl), 0.0, 1.0);
        return c * (0.35 + 0.9 * swirl) * dop * (1.25 - 0.8 * t);
      }
      void main() {
        vec3 ro = cameraPosition, rd = normalize(vWorld - cameraPosition);
        float b = dot(ro, rd), c = dot(ro, ro) - uBound * uBound, h = b * b - c;
        if (h < 0.0) discard;
        float t0 = max(-b - sqrt(h), 0.0);
        vec3 pos = ro + rd * t0, vel = rd;
        float h2 = pow(length(cross(pos, vel)), 2.0);
        vec3 col = vec3(0.0); float alpha = 0.0, minR = 100.0;
        bool captured = false;
        for (int i = 0; i < 260; i++) {
          float r = length(pos);
          minR = min(minR, r);
          if (r < 1.0) { captured = true; break; }
          if (r > uBound + 0.5 && dot(pos, vel) > 0.0) break;
          float dt = clamp(0.06 * r, 0.015, 0.6);
          vec3 acc = -1.5 * h2 * pos / pow(r, 5.0);
          vec3 np = pos + vel * dt;
          vel = normalize(vel + acc * dt);
          if (pos.y * np.y < 0.0) {
            vec3 hit = mix(pos, np, pos.y / (pos.y - np.y));
            float a; vec3 dc = diskColor(hit, vel, a);
            col += dc * a * (1.0 - alpha); alpha += a * (1.0 - alpha);
          }
          pos = np;
          if (alpha > 0.98) break;
        }
        float ring = exp(-pow((minR - 1.55) * 9.0, 2.0)) * (captured ? 0.0 : 1.0);
        col += vec3(1.1, 0.85, 0.6) * ring * 0.7 * (1.0 - alpha);
        alpha = max(alpha, ring * 0.9);
        if (captured) { alpha = 1.0; }
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  const bh = new THREE.Mesh(new THREE.SphereGeometry(BOUND, 64, 32), bhMat);
  bh.renderOrder = 5;
  scene.add(bh);
  const diskLight = new THREE.PointLight(0xffb070, 420, 90, 1.6); scene.add(diskLight);
  scene.add(new THREE.AmbientLight(0x404a60, 0.9));
  const frontFill = new THREE.DirectionalLight(0xbfd2ff, 1.4); frontFill.position.set(4, 12, 40); scene.add(frontFill);

  /* ---------- the ship: a ring of modules ---------- */
  const shipTex = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#d9dcdf'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.15)'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 2, h);
    g.font = '700 54px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#20262c'; g.fillText('B E L L H I V E 9 9', w / 2, h / 2 + 2);
  });
  const ship = new THREE.Group(); scene.add(ship);
  const spinner = new THREE.Group(); ship.add(spinner);
  const hull = new THREE.MeshStandardMaterial({ color: 0xd2d5d8, metalness: 0.4, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.6, roughness: 0.4 });
  const label = new THREE.MeshStandardMaterial({ map: shipTex, metalness: 0.3, roughness: 0.5 });
  const MODS = 12, RING = 1.1;
  for (let i = 0; i < MODS; i++) {
    const a = (i / MODS) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.48), i % 3 === 0 ? [hull, hull, hull, hull, label, hull] : hull);
    m.position.set(Math.cos(a) * RING, 0, Math.sin(a) * RING); m.rotation.y = -a + Math.PI / 2; spinner.add(m);
    const link = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.2), dark);
    const b = a + Math.PI / MODS; link.position.set(Math.cos(b) * RING * 0.99, 0, Math.sin(b) * RING * 0.99); link.rotation.y = -b; spinner.add(link);
  }
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, RING * 2, 6), dark);
    s.rotation.z = Math.PI / 2; s.rotation.y = (i / 4) * Math.PI; spinner.add(s);
  }
  spinner.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 16), hull));
  const lights = [];
  for (const s of [-1, 1]) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(3, 0.4, 0.3), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); sp.scale.setScalar(0.25); sp.position.set(s * RING * 1.05, 0.05, 0); spinner.add(sp); lights.push(sp); }
  ship.scale.setScalar(0.75);

  /* ---------- the title: wide-spaced thin capitals ---------- */
  const titleTex = canvasTex(1024, 128, (g, w, h) => {
    g.font = '300 64px "Segoe UI Light", "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#e8eef6';
    const txt = 'B E L L H I V E 9 9';
    g.fillText(txt, w / 2, h / 2);
  });
  const title = new THREE.Sprite(new THREE.SpriteMaterial({ map: titleTex, transparent: true, color: new THREE.Color(1.1, 1.15, 1.25), depthWrite: false, toneMapped: false }));
  title.scale.set(16, 2, 1); title.renderOrder = 6;
  scene.add(title);

  /* ---------- controls, click, sizing ---------- */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, -0.8, 0);
  Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, dampingFactor: 0.06, autoRotate: true, autoRotateSpeed: 0.25, minPolarAngle: 1.2, maxPolarAngle: 1.68 });
  controls.update();
  let resumeTimer;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeTimer); renderer.domElement.style.cursor = 'grabbing'; });
  controls.addEventListener('end', () => { resumeTimer = setTimeout(() => (controls.autoRotate = true), 4000); renderer.domElement.style.cursor = 'pointer'; });
  renderer.domElement.style.cursor = 'pointer';
  let down = null, dilate = -1;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6 && dilate < 0) dilate = 0;
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
  let onScreen = true, sim = 0, shipT = 0, earthYears = 0, shipHours = 0;
  new IntersectionObserver(([en]) => (onScreen = en.isIntersecting)).observe(box);
  const camRight = V(), camUp = V();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!onScreen) return;

    /* time dilation: slow everything for a few seconds, Earth's clock races */
    let scale = 1;
    if (dilate >= 0) {
      dilate += dt;
      scale = 1 - 0.93 * smooth(0, 1.2, dilate) * (1 - smooth(5.5, 7, dilate));
      shipHours += dt * scale * 0.4;
      earthYears += dt * (1 - scale) * 6.5;
      hud.style.opacity = dilate < 6.5 ? '1' : '0';
      hud.innerHTML = 'SHIP &nbsp;' + shipHours.toFixed(2) + ' h<br>EARTH &nbsp;+' + earthYears.toFixed(1) + ' years';
      if (dilate > 8) { dilate = -1; shipHours = 0; earthYears = 0; }
    }
    controls.autoRotateSpeed = 0.25 * scale;
    sim += dt * scale;
    bhMat.uniforms.uTime.value = sim;

    /* ship orbit: tilted, slow, passing in front of and behind the hole */
    shipT += dt * scale * 0.06;
    ship.position.set(Math.sin(shipT * 2.2) * 9.5, 4.6 + Math.sin(shipT * 3.1) * 0.5, 15.6 + Math.cos(shipT * 2.2) * 0.8);   /* drifts across in front of the hole, above the disk */
    ship.rotation.set(0.5, shipT * 1.5, 0.12);
    spinner.rotation.y += dt * scale * 0.5;
    lights.forEach((l, i) => (l.material.opacity = Math.sin(sim * 4 + i * 3) > 0.7 ? 1 : 0.15));

    /* title sits below the hole, facing the camera */
    camRight.setFromMatrixColumn(camera.matrixWorld, 0); camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    title.position.set(0, 0, 0).addScaledVector(camUp, -7.6);

    controls.update();
    composer.render();
  });
};
