/* bellhive99.com - sign-in backdrop: an original rain-soaked night skyline drawn in SVG,
 * falling rain on a canvas, and a live clock readout. Only runs while the login is visible. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const rnd = (a, b) => a + Math.random() * (b - a);

  function skyline(host) {
    const W = 1600, H = 560;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
    svg.innerHTML = `<defs>
      <linearGradient id="brFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16203a"/><stop offset="1" stop-color="#0a0f1e"/></linearGradient>
      <linearGradient id="brNear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b15"/><stop offset="1" stop-color="#020308"/></linearGradient>
      <filter id="brGlow"><feGaussianBlur stdDeviation="2.2"/></filter>
      <filter id="brHolo" x="-50%" y="-20%" width="200%" height="140%"><feGaussianBlur stdDeviation="18"/></filter></defs>`;
    const layer = (fill, count, hMin, hMax, wMin, wMax, winOpacity, winColors) => {
      const g = document.createElementNS(NS, 'g');
      let x = -40;
      while (x < W + 40) {
        const w = rnd(wMin, wMax), h = rnd(hMin, hMax), y = H - h;
        const b = document.createElementNS(NS, 'rect');
        b.setAttribute('x', x); b.setAttribute('y', y); b.setAttribute('width', w); b.setAttribute('height', h);
        b.setAttribute('fill', fill);
        g.appendChild(b);
        if (Math.random() < 0.25) {          // antenna / spire
          const ah = rnd(18, 60);
          const a = document.createElementNS(NS, 'rect');
          a.setAttribute('x', x + w / 2 - 1); a.setAttribute('y', y - ah); a.setAttribute('width', 2); a.setAttribute('height', ah); a.setAttribute('fill', fill);
          g.appendChild(a);
          const tip = document.createElementNS(NS, 'circle');
          tip.setAttribute('cx', x + w / 2); tip.setAttribute('cy', y - ah); tip.setAttribute('r', 2.2);
          tip.setAttribute('fill', '#ff4a3a'); tip.setAttribute('class', 'br-beacon');
          g.appendChild(tip);
        }
        for (let wy = y + 8; wy < H - 6; wy += 9) {        // lit windows
          for (let wx = x + 5; wx < x + w - 6; wx += 8) {
            if (Math.random() < winOpacity) {
              const r = document.createElementNS(NS, 'rect');
              r.setAttribute('x', wx); r.setAttribute('y', wy); r.setAttribute('width', 3); r.setAttribute('height', 4);
              r.setAttribute('fill', winColors[Math.floor(Math.random() * winColors.length)]);
              r.setAttribute('opacity', rnd(0.25, 0.9).toFixed(2));
              g.appendChild(r);
            }
          }
        }
        x += w + rnd(2, 14);
      }
      svg.appendChild(g);
    };
    // 2049: a massive stepped brutalist structure looming in the haze
    const mega = document.createElementNS(NS, 'g');
    const mx = rnd(W * 0.55, W * 0.72), mw = rnd(380, 470), mh = rnd(470, 530);
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const inset = (mw / 2) * (i / steps) * 0.85;
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', mx - mw / 2 + inset); r.setAttribute('y', H - mh + i * mh * 0.13);
      r.setAttribute('width', mw - inset * 2); r.setAttribute('height', mh);
      r.setAttribute('fill', i % 2 ? '#141a22' : '#11161d');
      mega.appendChild(r);
    }
    for (let i = 0; i < 26; i++) {          // sparse slit windows
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', mx - mw * 0.35 + rnd(0, mw * 0.7)); r.setAttribute('y', H - mh * rnd(0.25, 0.95));
      r.setAttribute('width', rnd(10, 34)); r.setAttribute('height', 2);
      r.setAttribute('fill', '#ffad42'); r.setAttribute('opacity', rnd(0.25, 0.7).toFixed(2));
      mega.appendChild(r);
    }
    svg.appendChild(mega);
    // 2049: a soft holographic glow column rising from the city
    const holo = document.createElementNS(NS, 'rect');
    holo.setAttribute('x', rnd(W * 0.12, W * 0.32)); holo.setAttribute('y', H - rnd(420, 500));
    holo.setAttribute('width', rnd(70, 110)); holo.setAttribute('height', 360); holo.setAttribute('rx', 30);
    holo.setAttribute('fill', '#3ee8ff'); holo.setAttribute('opacity', '0.10'); holo.setAttribute('filter', 'url(#brHolo)');
    svg.appendChild(holo);
    layer('url(#brFar)', 0, 160, 420, 50, 120, 0.10, ['#ffb547', '#3ee8ff', '#8fa8ff']);
    // a few neon signs on the far layer
    for (let i = 0; i < 7; i++) {
      const s = document.createElementNS(NS, 'rect');
      const sw = rnd(10, 26), sh = rnd(36, 90);
      s.setAttribute('x', rnd(40, W - 40)); s.setAttribute('y', rnd(H - 360, H - 160));
      s.setAttribute('width', sw); s.setAttribute('height', sh); s.setAttribute('rx', 2);
      s.setAttribute('fill', ['#ffad42', '#3ee8ff', '#ffd9a0', '#c8402f'][i % 4]);
      s.setAttribute('opacity', '0.55'); s.setAttribute('filter', 'url(#brGlow)');
      svg.appendChild(s);
    }
    layer('url(#brNear)', 0, 90, 260, 70, 170, 0.06, ['#ffb547', '#ffd7a1', '#3ee8ff']);
    host.appendChild(svg);
  }

  function rain(canvas, visible) {
    const ctx = canvas.getContext('2d');
    let drops = [], ash = [], w = 0, h = 0, raf = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / 5200);
      drops = Array.from({ length: n }, () => ({ x: rnd(0, w), y: rnd(0, h), l: rnd(10, 26), v: rnd(9, 17), o: rnd(0.08, 0.32) }));
      ash = Array.from({ length: Math.round(n / 4) }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(0.6, 1.8), v: rnd(0.25, 0.8), s: rnd(0, 6.28), o: rnd(0.15, 0.5) }));
    };
    const tick = () => {
      if (!visible()) { raf = requestAnimationFrame(tick); return; }
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (const d of drops) {
        ctx.strokeStyle = `rgba(185, 215, 230, ${d.o})`;
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.18, d.y + d.l); ctx.stroke();
        d.y += d.v; d.x -= d.v * 0.18;
        if (d.y > h) { d.y = -d.l; d.x = rnd(0, w + 60); }
      }
      for (const a of ash) {
        a.s += 0.01; a.y += a.v; a.x += Math.sin(a.s) * 0.4 - 0.15;
        ctx.fillStyle = `rgba(255, 200, 150, ${a.o})`;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.283); ctx.fill();
        if (a.y > h) { a.y = -4; a.x = rnd(0, w); }
      }
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('resize', resize);
    resize(); tick();
    return () => cancelAnimationFrame(raf);
  }

  function clock(el) {
    const pad = (n) => String(n).padStart(2, '0');
    const draw = () => {
      const d = new Date();
      el.textContent = d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    };
    draw(); setInterval(draw, 1000);
  }

  window.BR_LOGIN = {
    mount(screen) {
      if (screen.querySelector('.br-city')) return;
      const city = document.createElement('div'); city.className = 'br-city';
      const canvas = document.createElement('canvas'); canvas.className = 'br-rain';
      const fog = document.createElement('div'); fog.className = 'br-fog';
      const scan = document.createElement('div'); scan.className = 'br-scan';
      screen.prepend(city, fog, canvas, scan);
      skyline(city);
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduce) rain(canvas, () => !screen.classList.contains('bh-gone'));
      const c = screen.querySelector('[data-br-clock]');
      if (c) clock(c);
    },
  };
})();
