/* Small SVG charts (single series) with hover/focus tooltips and a table fallback. */
window.WL = window.WL || {};

WL.chart = (function () {
  const u = WL.u, h = u.h, S = u.svg;
  const W = 640, H = 220, PAD = { l: 44, r: 12, t: 12, b: 26 };

  function niceMax(v) {
    if (!v) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function ticks(min, max, n) { const out = []; for (let i = 0; i <= n; i++) out.push(min + ((max - min) * i) / n); return out; }

  function frame(title) {
    const tip = h('div.tip', { hidden: true });
    const svgEl = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': title });
    const wrap = h('div.chart', svgEl, tip);
    return { wrap, svgEl, tip };
  }
  function showTip(f, evt, value, label) {
    f.tip.replaceChildren(h('b', value), h('span', label));
    f.tip.hidden = false;
    const r = f.wrap.getBoundingClientRect();
    const x = (evt.clientX != null ? evt.clientX : r.left + r.width / 2) - r.left;
    f.tip.style.left = Math.min(Math.max(x, 60), r.width - 60) + 'px';
  }
  function axes(svgEl, lo, hi, fmt) {
    const g = S('g', { class: 'axis' });
    ticks(lo, hi, 4).forEach((t) => {
      const y = PAD.t + (H - PAD.t - PAD.b) * (1 - (t - lo) / (hi - lo || 1));
      g.appendChild(S('line', { x1: PAD.l, x2: W - PAD.r, y1: y, y2: y, class: 'grid' }));
      const tx = S('text', { x: PAD.l - 6, y: y + 4, 'text-anchor': 'end' }); tx.textContent = fmt(t); g.appendChild(tx);
    });
    svgEl.appendChild(g);
  }
  function xLabels(svgEl, pts, xOf) {
    /* label the first point of each month, thinned to fit */
    const g = S('g', { class: 'axis' });
    let lastX = -999, lastMonth = '';
    pts.forEach((p, i) => {
      const m = p.x.slice(0, 7);
      if (m === lastMonth) return;
      lastMonth = m;
      const x = xOf(i);
      if (x - lastX < 46) return;
      lastX = x;
      const d = u.parse(p.x);
      const tx = S('text', { x, y: H - 8, 'text-anchor': 'middle' });
      tx.textContent = d.toLocaleString(undefined, { month: 'short' }) + (d.getMonth() === 0 || i === 0 ? " '" + String(d.getFullYear()).slice(2) : '');
      g.appendChild(tx);
    });
    svgEl.appendChild(g);
  }

  /* pts: [{x: isoDate, v: number|null, label: string}] */
  function bars(pts, opts) {
    const f = frame(opts.title);
    const max = niceMax(Math.max(0, ...pts.map((p) => p.v || 0)));
    const fmt = (v) => u.fmtNum(v, v < 10 ? 1 : 0);
    axes(f.svgEl, 0, max, fmt);
    const iw = (W - PAD.l - PAD.r) / Math.max(pts.length, 1);
    const bw = Math.max(1, iw - 2);
    const xOf = (i) => PAD.l + i * iw + iw / 2;
    const ph = H - PAD.t - PAD.b;
    pts.forEach((p, i) => {
      const x = PAD.l + i * iw + (iw - bw) / 2;
      const hgt = p.v ? Math.max(2, (p.v / max) * ph) : 0;
      if (hgt) {
        const r = Math.min(4, bw / 2, hgt);
        const y = PAD.t + ph - hgt;
        /* rounded data-end, square baseline */
        f.svgEl.appendChild(S('path', { class: 'bar', d: `M${x},${PAD.t + ph}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${PAD.t + ph}Z` }));
      }
      const hit = S('rect', { x: PAD.l + i * iw, y: PAD.t, width: iw, height: ph, class: 'hit', tabindex: 0 });
      const val = p.v ? fmt(p.v) + (opts.unit ? ' ' + opts.unit : '') : '—';
      const on = (e) => { showTip(f, e, val, p.label); hit.classList.add('on'); };
      const off = () => { f.tip.hidden = true; hit.classList.remove('on'); };
      hit.addEventListener('pointermove', on); hit.addEventListener('focus', on);
      hit.addEventListener('pointerleave', off); hit.addEventListener('blur', off);
      f.svgEl.appendChild(hit);
    });
    xLabels(f.svgEl, pts, xOf);
    return h('div.chart-block', f.wrap, table(pts, opts, fmt));
  }

  function line(pts, opts) {
    const f = frame(opts.title);
    const vals = pts.filter((p) => p.v != null).map((p) => p.v);
    if (!vals.length) return h('div.empty.small', 'No data in this range.');
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const padv = Math.max(1, (hi - lo) * 0.15);
    lo = Math.floor(lo - padv); hi = Math.ceil(hi + padv);
    const fmt = (v) => u.fmtNum(v, 0);
    axes(f.svgEl, lo, hi, fmt);
    const t0 = u.parse(pts[0].x).getTime(), t1 = u.parse(pts[pts.length - 1].x).getTime() || t0 + 1;
    const xOfT = (iso) => PAD.l + ((u.parse(iso).getTime() - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
    const yOf = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - lo) / (hi - lo || 1));
    const real = pts.filter((p) => p.v != null);
    f.svgEl.appendChild(S('path', { class: 'line', d: real.map((p, i) => (i ? 'L' : 'M') + xOfT(p.x).toFixed(1) + ',' + yOf(p.v).toFixed(1)).join('') }));
    if (real.length <= 60) real.forEach((p) => f.svgEl.appendChild(S('circle', { class: 'dot', cx: xOfT(p.x), cy: yOf(p.v), r: 3 })));
    const hair = S('line', { class: 'hair', y1: PAD.t, y2: H - PAD.b, x1: -10, x2: -10 });
    const mark = S('circle', { class: 'dot on', r: 5, cx: -10, cy: -10 });
    f.svgEl.append(hair, mark);
    const overlay = S('rect', { x: PAD.l, y: PAD.t, width: W - PAD.l - PAD.r, height: H - PAD.t - PAD.b, class: 'hit', tabindex: 0 });
    let fi = real.length - 1;
    const at = (p, e) => {
      const x = xOfT(p.x), y = yOf(p.v);
      f.svgEl.classList.add('hovering'); hair.setAttribute('x1', x); hair.setAttribute('x2', x); mark.setAttribute('cx', x); mark.setAttribute('cy', y);
      showTip(f, e || { clientX: f.wrap.getBoundingClientRect().left + (x / W) * f.wrap.getBoundingClientRect().width }, fmt1(p.v) + (opts.unit ? ' ' + opts.unit : ''), p.label);
    };
    const fmt1 = (v) => u.fmtNum(v, 1);
    overlay.addEventListener('pointermove', (e) => {
      const r = f.svgEl.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * W;
      let best = 0, bd = Infinity;
      real.forEach((p, i) => { const d = Math.abs(xOfT(p.x) - sx); if (d < bd) { bd = d; best = i; } });
      fi = best; at(real[best], e);
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') fi = Math.max(0, fi - 1); else if (e.key === 'ArrowRight') fi = Math.min(real.length - 1, fi + 1); else return;
      e.preventDefault(); at(real[fi]);
    });
    overlay.addEventListener('focus', () => at(real[fi]));
    const off = () => { f.tip.hidden = true; f.svgEl.classList.remove('hovering'); hair.setAttribute('x1', -10); hair.setAttribute('x2', -10); mark.setAttribute('cx', -10); };
    overlay.addEventListener('pointerleave', off); overlay.addEventListener('blur', off);
    f.svgEl.appendChild(overlay);
    xLabels(f.svgEl, pts, (i) => xOfT(pts[i].x));
    return h('div.chart-block', f.wrap, table(real, opts, fmt1));
  }

  function table(pts, opts, fmt) {
    const rows = pts.filter((p) => p.v != null).slice().reverse();
    const det = h('details.chart-table', h('summary', 'Show as table'),
      h('table', h('thead', h('tr', h('th', opts.xLabel || 'Date'), h('th', (opts.title || 'Value') + (opts.unit ? ' (' + opts.unit + ')' : '')))),
        h('tbody', rows.map((p) => h('tr', h('td', p.label), h('td', fmt(p.v)))))));
    return det;
  }

  return { bars, line };
})();
