/* bellhive99.com - stylized people for the home page themes.
 * Characters are recognizable "types" (a wizard, a hotel twin, an astronaut), never a specific
 * actor's likeness. INDEXB.HTM loads this before the theme script.
 *
 *   const p = BHFigures.person(THREE, { height, skin, hair, hairColor, hat, top, topColor, ... });
 *   scene.add(p.root);          // feet at y = 0, facing +z
 *   p.update(t, { walk: 0..1, armL: angle, armR: angle, lean: angle });   // each frame
 *   p.hand.L / p.hand.R         // Object3Ds in the hands, to hold props
 *
 * Options (all optional):
 *   height 1.75 | skin | eyes (color) | face 'grin' | stout | bigHead | shortLegs
 *   hair 'short'|'curly'|'messy'|'long'|'bob'|'feathered'|'none' + hairColor + fringe
 *   hat 'pointy'|'cap'|'hood'|'helmet' + hatColor | beard (color)
 *   topColor | vest (color) | robe (color) | dress (color) | straps (strappy white outfit)
 *   hoodie (hood bunched at the neck) | collar (color)
 *   bottomColor | shorts | flares | bareLegs | socks (color) | shoeColor | barefoot | bigFeet
 *   alien (head fins) | sleeveColor | gloves (color)
 */
(function () {
  function person(THREE, o) {
    o = o || {};
    const H = o.height || 1.75;
    const M = (c, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75 }, extra || {}));
    const skin = M(o.skin != null ? o.skin : 0xe0b090, { roughness: 0.65 });
    const hairM = M(o.hairColor != null ? o.hairColor : 0x4a2c18, { roughness: 0.9 });
    const topM = M(o.topColor != null ? o.topColor : 0x4a5a6a);
    const botM = M(o.bottomColor != null ? o.bottomColor : 0x30303a);
    const shoeM = M(o.shoeColor != null ? o.shoeColor : 0x1a1410, { roughness: 0.5 });
    const sleeveM = o.sleeveColor != null ? M(o.sleeveColor) : (o.robe != null ? M(o.robe) : (o.straps ? skin : topM));
    const stout = o.stout ? 1.3 : 1;

    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const add = (parent, geo, mat, x, y, z, rx, ry, rz) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = true; parent.add(m); return m;
    };

    const legLen = H * 0.45 * (o.shortLegs ? 0.82 : 1);
    const hipY = legLen + H * 0.03;
    const torsoH = H * 0.3;
    const shY = hipY + torsoH;
    const headR = H * 0.068 * (o.bigHead ? 1.18 : 1);
    const headY = shY + H * 0.07 + headR;

    /* legs (pivot at the hip, swing about x) */
    const legs = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * H * 0.055 * stout, hipY, 0); body.add(piv);
      if (o.shorts) {
        add(piv, new THREE.CylinderGeometry(H * 0.05 * stout, H * 0.047 * stout, legLen * 0.42, 10), botM, 0, -legLen * 0.21);
        add(piv, new THREE.CylinderGeometry(H * 0.034, H * 0.03, legLen * 0.62, 10), skin, 0, -legLen * 0.7);
      } else {
        add(piv, new THREE.CylinderGeometry(H * 0.045 * stout, H * 0.037 * (o.flares ? 1.9 : 1), legLen, 10), o.bareLegs ? skin : botM, 0, -legLen / 2);
      }
      if (o.socks != null) add(piv, new THREE.CylinderGeometry(H * 0.033, H * 0.031, legLen * 0.22, 10), M(o.socks), 0, -legLen * 0.88);
      const big = o.bigFeet ? 1.55 : 1;
      add(piv, new THREE.BoxGeometry(H * 0.06 * big, H * 0.035, H * 0.13 * big), o.barefoot ? skin : shoeM, 0, -legLen - H * 0.012, H * 0.03 * big);
      if (o.bigFeet) for (let k = 0; k < 6; k++) add(piv, new THREE.SphereGeometry(H * 0.016, 6, 5), hairM, (k % 3 - 1) * H * 0.025, -legLen + H * 0.012, H * (0.0 + (k > 2 ? 0.07 : 0.02)));
      legs.push(piv);
    }

    /* torso / robe / dress */
    const torsoMat = o.straps ? skin : topM;
    if (o.robe != null) {
      const robeM = M(o.robe, { roughness: 0.9 });
      add(body, new THREE.CylinderGeometry(H * 0.12 * stout, H * 0.24 * stout, shY, 18), robeM, 0, shY / 2);
    } else {
      const torso = add(body, new THREE.CylinderGeometry(H * 0.125 * stout, H * 0.105 * stout, torsoH, 16), torsoMat, 0, hipY + torsoH / 2);
      torso.scale.z = 0.68;
      if (o.vest != null) { const v = add(body, new THREE.CylinderGeometry(H * 0.128 * stout, H * 0.108 * stout, torsoH * 0.8, 16, 1, true, -1.3, 2.6), M(o.vest), 0, hipY + torsoH * 0.45); v.scale.z = 0.72; }
      if (o.dress != null) add(body, new THREE.CylinderGeometry(H * 0.1, H * 0.21, H * 0.25, 18), M(o.dress), 0, hipY - H * 0.1);
      if (o.straps) {
        const white = M(0xf4f2ee, { roughness: 0.5 });
        for (const y of [0.15, 0.45, 0.75]) { const r = add(body, new THREE.TorusGeometry(H * 0.117, H * 0.012, 6, 24), white, 0, hipY + torsoH * y, 0, Math.PI / 2); r.scale.y = 0.68; }
        for (const s of [-1, 1]) add(body, new THREE.BoxGeometry(H * 0.02, torsoH * 0.9, H * 0.012), white, s * H * 0.05, hipY + torsoH * 0.5, H * 0.075, 0, 0, s * 0.35);
      }
      if (o.hoodie) { const hood = add(body, new THREE.TorusGeometry(H * 0.07, H * 0.03, 8, 18), topM, 0, shY - H * 0.005, -H * 0.03, Math.PI / 2 - 0.3); hood.scale.set(1.2, 1, 1); }
      if (o.collar != null) for (const s of [-1, 1]) add(body, new THREE.BoxGeometry(H * 0.09, H * 0.025, H * 0.07), M(o.collar), s * H * 0.055, shY - H * 0.01, H * 0.05, 0.6, 0, s * 0.5);
    }

    /* arms (pivot at the shoulder) */
    const arms = {}, hand = {};
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * (H * 0.135 * stout + H * 0.02), shY - H * 0.025, 0); body.add(piv);
      const armLen = H * 0.36;
      if (o.robe != null) add(piv, new THREE.CylinderGeometry(H * 0.04, H * 0.075, armLen * 0.95, 10), sleeveM, 0, -armLen * 0.47);
      else add(piv, new THREE.CylinderGeometry(H * 0.042 * stout, H * 0.035 * stout, armLen, 10), sleeveM, 0, -armLen / 2);
      add(piv, new THREE.SphereGeometry(H * 0.045 * stout, 10, 8), sleeveM);   /* shoulder */
      add(piv, new THREE.SphereGeometry(H * 0.034, 10, 8), o.gloves != null ? M(o.gloves) : skin, 0, -armLen - H * 0.01);
      const h = new THREE.Object3D(); h.position.set(0, -armLen - H * 0.015, 0); piv.add(h);
      piv.rotation.z = s * 0.08;
      arms[s < 0 ? 'L' : 'R'] = piv; hand[s < 0 ? 'L' : 'R'] = h;
    }

    /* neck and head */
    const head = new THREE.Group(); head.position.set(0, headY, 0); body.add(head);
    add(body, new THREE.CylinderGeometry(H * 0.03, H * 0.035, H * 0.07, 10), skin, 0, shY + H * 0.03);
    const skull = add(head, new THREE.SphereGeometry(headR, 22, 16), skin); skull.scale.set(0.93, 1.08, 1);
    if (o.alien) { skull.scale.set(0.85, 1.35, 0.95); }
    const eyeM = new THREE.MeshBasicMaterial({ color: o.eyes != null ? o.eyes : 0x120c08 });
    for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(headR * 0.12, 8, 6), eyeM, s * headR * 0.36, headR * 0.12, headR * 0.9);
    add(head, new THREE.SphereGeometry(headR * 0.14, 8, 6), skin, 0, -headR * 0.08, headR * 0.98);   /* nose */
    if (o.face === 'grin') add(head, new THREE.TorusGeometry(headR * 0.32, headR * 0.06, 6, 14, Math.PI), new THREE.MeshBasicMaterial({ color: 0xf0ece0 }), 0, -headR * 0.38, headR * 0.86, 0, 0, Math.PI);
    else add(head, new THREE.BoxGeometry(headR * 0.4, headR * 0.06, headR * 0.05), new THREE.MeshBasicMaterial({ color: 0x5a2a20 }), 0, -headR * 0.42, headR * 0.92);

    const cap = (r, tilt) => add(head, new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, headR * 0.06, -headR * 0.04, tilt || -0.25);
    switch (o.hair) {
      case 'none': break;
      case 'curly': {
        cap(headR * 1.04);
        for (let i = 0; i < 34; i++) {
          const a = (i / 34) * Math.PI * 2 * 3.1, el = 0.15 + (i / 34) * 1.25;
          const x = Math.sin(a) * Math.cos(el - 0.6), z = Math.cos(a) * Math.cos(el - 0.6) - 0.15, y = Math.sin(el - 0.3);
          if (z > 0.55 && y < 0.5) continue;   /* keep the face clear */
          add(head, new THREE.SphereGeometry(headR * 0.3, 8, 6), hairM, x * headR * 1.02, y * headR * 1.0 + headR * 0.1, z * headR);
        }
        break;
      }
      case 'messy': cap(headR * 1.05); for (let i = 0; i < 7; i++) add(head, new THREE.ConeGeometry(headR * 0.18, headR * 0.45, 5), hairM, (i - 3) * headR * 0.2, headR * 0.95, -headR * 0.1 + (i % 2) * headR * 0.15, (i % 2 ? 0.4 : -0.4), 0, (i - 3) * 0.2); break;
      case 'long': cap(headR * 1.05); add(head, new THREE.BoxGeometry(headR * 1.7, headR * 2.1, headR * 0.35), hairM, 0, -headR * 0.6, -headR * 0.75); break;
      case 'bob': {
        cap(headR * 1.07, -0.1);
        const b = add(head, new THREE.CylinderGeometry(headR * 1.08, headR * 1.15, headR * 1.15, 22, 1, true, Math.PI * 0.25, Math.PI * 1.5), hairM, 0, -headR * 0.25, -headR * 0.02);
        b.material = hairM; b.material.side = THREE.DoubleSide;
        break;
      }
      case 'feathered': cap(headR * 1.08); for (const s of [-1, 1]) { const w = add(head, new THREE.SphereGeometry(headR * 0.7, 14, 10), hairM, s * headR * 0.85, -headR * 0.05, -headR * 0.2); w.scale.set(0.7, 1.15, 1.25); } break;
      default: cap(headR * 1.04);
    }
    if (o.fringe) { const f = add(head, new THREE.BoxGeometry(headR * 1.7, headR * 0.32, headR * 0.3), hairM, 0, headR * 0.62, headR * 0.72, 0.25); }
    if (o.alien) for (let i = 0; i < 5; i++) add(head, new THREE.ConeGeometry(headR * 0.16, headR * 1.6, 8), skin, (i - 2) * headR * 0.28, headR * 0.4, -headR * 0.9, -2.2 + Math.abs(i - 2) * 0.15, 0, (i - 2) * 0.25);
    if (o.beard != null) add(head, new THREE.ConeGeometry(headR * 0.75, H * 0.2, 12), M(o.beard, { roughness: 0.95 }), 0, -headR - H * 0.08, headR * 0.45, Math.PI - 0.15);
    const hatM = M(o.hatColor != null ? o.hatColor : 0x777777, { roughness: 0.9 });
    if (o.hat === 'pointy') {
      add(head, new THREE.CylinderGeometry(headR * 2.3, headR * 2.3, headR * 0.08, 24), hatM, 0, headR * 0.65);
      add(head, new THREE.ConeGeometry(headR * 1.05, H * 0.24, 18), hatM, -headR * 0.15, headR * 0.65 + H * 0.12, -headR * 0.1, -0.12, 0, 0.18);
    } else if (o.hat === 'cap') {
      add(head, new THREE.SphereGeometry(headR * 1.08, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hatM, 0, headR * 0.15);
      add(head, new THREE.BoxGeometry(headR * 1.3, headR * 0.06, headR * 0.8), hatM, 0, headR * 0.35, headR * 1.0, 0.15);
    } else if (o.hat === 'hood') {
      const hood = add(head, new THREE.SphereGeometry(headR * 1.45, 18, 14, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7), hatM, 0, headR * 0.15, -headR * 0.2);
      hood.material.side = THREE.DoubleSide;
    } else if (o.hat === 'helmet') {
      const glass = new THREE.MeshStandardMaterial({ color: 0xc89a30, metalness: 1, roughness: 0.15 });
      add(head, new THREE.SphereGeometry(headR * 1.75, 22, 16), hatM);
      const visor = add(head, new THREE.SphereGeometry(headR * 1.78, 22, 16, Math.PI / 2 - 0.9, 1.8, Math.PI * 0.28, Math.PI * 0.38), glass);
      visor.material.side = THREE.DoubleSide;
    }

    function update(t, st) {
      st = st || {};
      const w = st.walk || 0, ph = t * (st.pace || 7);
      legs[0].rotation.x = Math.sin(ph) * 0.55 * w;
      legs[1].rotation.x = -Math.sin(ph) * 0.55 * w;
      arms.L.rotation.x = st.armL != null ? st.armL : -Math.sin(ph) * 0.45 * w + Math.sin(t * 1.3) * 0.03;
      arms.R.rotation.x = st.armR != null ? st.armR : Math.sin(ph) * 0.45 * w + Math.sin(t * 1.1 + 1) * 0.03;
      if (st.armLz != null) arms.L.rotation.z = st.armLz;
      if (st.armRz != null) arms.R.rotation.z = st.armRz;
      body.position.y = Math.abs(Math.sin(ph)) * H * 0.02 * w + Math.sin(t * 1.6) * H * 0.003;
      body.rotation.x = st.lean || 0;
      head.rotation.y = st.look || 0;
      head.rotation.z = st.tilt || 0;
    }
    return { root, body, head, legs, arms, hand, H, update };
  }
  window.BHFigures = { person };
})();
