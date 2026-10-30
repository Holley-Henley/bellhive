/* Shared helpers: dates, formatting, tiny DOM builder. */
window.WL = window.WL || {};

WL.u = (function () {
  const pad = (n) => String(n).padStart(2, '0');
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function today() { return iso(new Date()); }
  function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function weekStart(s) {
    const d = parse(s);
    const start = (WL.CONFIG && WL.CONFIG.weekStartsOn) || 1;
    const diff = (d.getDay() - start + 7) % 7;
    d.setDate(d.getDate() - diff);
    return iso(d);
  }
  function weekDays(startIso) { return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(startIso, i)); }
  function dayShort(s) { return DAY_SHORT[parse(s).getDay()]; }
  function fmtDate(s, opts) {
    const d = parse(s);
    const base = MON_SHORT[d.getMonth()] + ' ' + d.getDate();
    if (opts && opts.year) return base + ', ' + d.getFullYear();
    if (opts && opts.weekday) return DAY_SHORT[d.getDay()] + ', ' + base;
    return base;
  }
  function nowTime() { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function fmtTime(t) {
    if (!t) return '';
    let [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + pad(m) + ' ' + ap;
  }
  /* durations are stored in seconds */
  function fmtDuration(sec) {
    if (sec == null || isNaN(sec)) return '';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }
  /* "2:00" -> 120, "1:05:00" -> 3900, "30" -> 1800 (plain numbers are minutes) */
  function parseDuration(v) {
    if (v == null) return null;
    v = String(v).trim();
    if (!v) return null;
    if (v.includes(':')) {
      const parts = v.split(':').map(Number);
      if (parts.some(isNaN)) return null;
      return parts.reduce((acc, p) => acc * 60 + p, 0);
    }
    const n = parseFloat(v);
    return isNaN(n) ? null : Math.round(n * 60);
  }
  function num(v) { if (v === '' || v == null) return null; const n = Number(v); return isNaN(n) ? null : n; }
  function fmtNum(n, dp) {
    if (n == null) return '';
    const f = dp == null ? (Math.round(n) === n ? 0 : 1) : dp;
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: f, minimumFractionDigits: 0 });
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'item'; }

  /* h('div.card#main', {onclick: fn, class: 'x'}, child, 'text', [more]) */
  function h(sel, attrs, ...kids) {
    const m = sel.match(/^([a-z0-9]+)?([^]*)$/i);
    const el = document.createElement(m[1] || 'div');
    (m[2].match(/[.#][^.#]+/g) || []).forEach((p) => {
      if (p[0] === '.') el.classList.add(p.slice(1)); else el.id = p.slice(1);
    });
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className += ' ' + v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k in el && k !== 'list') { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (k) => {
      if (k == null || k === false) return;
      if (Array.isArray(k)) return k.forEach(add);
      el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    };
    kids.forEach(add);
    return el;
  }
  function svg(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs || {}) el.setAttribute(k, attrs[k]);
    return el;
  }
  function toast(msg, ms) {
    const t = h('div.toast', msg);
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms || 2200);
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  return { iso, parse, today, addDays, weekStart, weekDays, dayShort, fmtDate, nowTime, fmtTime,
    fmtDuration, parseDuration, num, fmtNum, uid, slug, h, svg, toast, loadScript, ls: store, DAY_SHORT };
})();
