/* bellhive99.com - Blood Pressure log
 *
 * Log:      quick entry (when, systolic / diastolic, optional note), a live category badge while
 *           typing, and the last few readings with their category so a typo can be deleted.
 * History:  a line graph of systolic and diastolic over 1 week, 1 month, 3 months, 1 year or a
 *           custom date range, with the category limits drawn on it, a summary and a table.
 *
 * Categories follow the American Heart Association / American College of Cardiology adult
 * blood pressure categories (2017, kept in the 2025 guideline):
 *   Normal      under 120 and under 80
 *   Elevated    120-129 and under 80
 *   Stage 1     130-139 or 80-89
 *   Stage 2     140 or higher or 90 or higher
 *   Crisis      over 180 and/or over 120 (severe - seek care)
 *   Low         under 90 or under 60 (not an AHA stage; shown so very low readings stand out)
 * A reading is placed in the HIGHER category its two numbers reach.
 *
 * Table: public.bp_readings (supabase/blood-pressure.sql). Row level security keeps every
 * person to their own readings - admins included. The Audit Log notes that a reading was
 * added or deleted, never the numbers.
 */
(function () {
  const { el, toast, modal } = BH.ui;
  const root = document.getElementById('bp');
  const RECENT = 5;
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const S = { tab: 'log', recent: [], range: 'month', from: '', to: '', rows: [] };
  const NS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------------ categories */
  const CATS = {
    low:      { label: 'Low',      color: '#6b5b95', ico: 'down',  range: 'Under 90 or under 60' },
    normal:   { label: 'Normal',   color: '#1e7e4a', ico: 'check', range: 'Under 120 and under 80' },
    elevated: { label: 'Elevated', color: '#9a7000', ico: 'up',    range: '120–129 and under 80' },
    stage1:   { label: 'Stage 1',  color: '#c45a12', ico: 'warn',  range: '130–139 or 80–89' },
    stage2:   { label: 'Stage 2',  color: '#b9382b', ico: 'warn',  range: '140 or higher or 90 or higher' },
    crisis:   { label: 'Crisis',   color: '#6e0f1d', ico: 'alert', range: 'Over 180 and/or over 120 - get care right away' },
  };
  const ORDER = ['low', 'normal', 'elevated', 'stage1', 'stage2', 'crisis'];
  function category(s, d) {
    if (s > 180 || d > 120) return 'crisis';
    if (s >= 140 || d >= 90) return 'stage2';
    if (s >= 130 || d >= 80) return 'stage1';
    if (s >= 120) return 'elevated';
    if (s < 90 || d < 60) return 'low';
    return 'normal';
  }
  /* limits drawn on the graph: upper set = systolic, lower set = diastolic */
  const LIMITS = [
    { v: 180, cat: 'crisis',   label: '180 Crisis',   which: 'Systolic' },
    { v: 140, cat: 'stage2',   label: '140 Stage 2',  which: 'Systolic' },
    { v: 130, cat: 'stage1',   label: '130 Stage 1',  which: 'Systolic' },
    { v: 120, cat: 'elevated', label: '120 Elevated', which: 'Systolic' },
    { v: 90,  cat: 'stage2',   label: '90 Stage 2',   which: 'Diastolic' },
    { v: 80,  cat: 'stage1',   label: '80 Stage 1',   which: 'Diastolic' },
  ];
  const SERIES = {
    sys: { label: 'Systolic (top)', color: '#2b62b8' },     // validated pair (dataviz validate_palette.js, light):
    dia: { label: 'Diastolic (bottom)', color: '#4ba3d9' }, // CVD ΔE 19; contrast relieved by the reading table
  };

  const svg = (paths) => el('span', { html: '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths + '</svg>' }).firstChild;
  const ICON = {
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    warn: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  };
  const badge = (cat, small) => el('span', { class: 'bp-cat' + (small ? ' sm' : ''), style: '--c:' + CATS[cat].color, title: CATS[cat].label + ': ' + CATS[cat].range },
    svg(ICON[CATS[cat].ico]), CATS[cat].label);

  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  /* value for <input type="datetime-local"> in this computer's time zone */
  const localNow = () => { const d = new Date(); return dateStr(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fmtWhen = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const fmtDay = (d, withYear) => d.toLocaleDateString('en-US', withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
  const friendly = (err) => {
    const m = (err && err.message) || String(err || 'Something went wrong');
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Could not reach the database. Check your connection and try again.';
    if (/check constraint|violates/i.test(m)) return 'Those numbers don’t look right - please check them and try again.';
    return m;
  };
  const store = {
    get(k) { try { return localStorage.getItem('bp_' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('bp_' + k, v); } catch (e) { /* private window */ } },
  };

  /* ------------------------------------------------------------------ page */
  function shell() {
    if (!inFrame) {
      document.body.prepend(el('div', { class: 'bh-bar bp-topbar' },
        el('a', { class: 'bh-wordmark', href: '../index.html', title: 'Home', html: 'bell<b>hive</b>99' }),
        el('span', { class: 'spacer' }),
        el('a', { class: 'bh-bar-btn', href: '../index.html' }, 'Home')));
    }
    const tabs = el('div', { class: 'bp-tabs', role: 'tablist' },
      ['log', 'history'].map((t) => el('button', { type: 'button', role: 'tab', class: 'bp-tab', 'data-tab': t, onclick: () => setTab(t) }, t === 'log' ? 'Log' : 'History')));
    root.replaceChildren(el('div', { class: 'bh-page-wrap bp-wrap' },
      el('div', { class: 'bh-page-head' },
        el('div', null, el('div', { class: 'crumb' }, 'Health and Fitness'), el('h1', null, 'Blood Pressure')),
        el('div', { class: 'bp-head-note' }, 'Only you can see your readings')),
      tabs,
      el('div', { id: 'bp-body' })));
  }
  function setTab(t) {
    S.tab = t; store.set('tab', t);
    document.querySelectorAll('.bp-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    document.querySelector('.bp-wrap').classList.toggle('wide', t === 'history');
    if (t === 'log') logView(); else historyView();
  }

  /* ================================================================== LOG */
  function logView() {
    document.getElementById('bp-body').replaceChildren(entryCard(),
      el('div', { id: 'bp-recent' }, el('div', { class: 'bh-empty' }, 'Loading…')),
      categoryKey());
    refreshRecent();
  }

  function entryCard() {
    const when = el('input', { type: 'datetime-local', value: localNow(), max: localNow(), required: true });
    const num = (ph) => el('input', { type: 'number', inputMode: 'numeric', min: 1, max: 300, step: 1, placeholder: ph, required: true });
    const sys = num('120'), dia = num('80');
    const live = el('div', { class: 'bp-live', 'aria-live': 'polite' });
    const notes = el('textarea', { rows: 2, maxLength: 500, placeholder: 'Notes (optional) - e.g. after coffee, left arm, felt stressed' });
    const err = el('div', { class: 'bh-err bp-err' });
    const btn = el('button', { class: 'bh-btn primary bp-save', type: 'submit' }, svg(ICON.heart), 'Save Reading');

    const showLive = () => {
      const s = parseInt(sys.value, 10), d = parseInt(dia.value, 10);
      if (s >= 50 && s <= 300 && d >= 30 && d <= 200 && s > d) {
        const c = category(s, d);
        live.replaceChildren(badge(c), el('span', { class: 'bp-live-t' }, CATS[c].range));
      } else live.replaceChildren();
    };
    // typing 3 digits of systolic moves on to diastolic
    sys.addEventListener('input', () => { if (sys.value.length >= 3) dia.focus(); showLive(); });
    dia.addEventListener('input', showLive);

    const form = el('form', { class: 'bh-card bh-card-pad bp-entry', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const s = parseInt(sys.value, 10), d = parseInt(dia.value, 10);
      if (!(s >= 50 && s <= 300)) { err.textContent = 'Systolic (top number) should be between 50 and 300.'; sys.focus(); return; }
      if (!(d >= 30 && d <= 200)) { err.textContent = 'Diastolic (bottom number) should be between 30 and 200.'; dia.focus(); return; }
      if (s <= d) { err.textContent = 'The top number (systolic) should be higher than the bottom number (diastolic).'; sys.focus(); return; }
      const at = when.value ? new Date(when.value) : new Date();
      if (isNaN(at)) { err.textContent = 'Pick the date and time of the reading.'; when.focus(); return; }
      btn.disabled = true;
      try {
        const { error } = await BH.sb.from('bp_readings').insert({ taken_at: at.toISOString(), systolic: s, diastolic: d, notes: notes.value.trim() || null });
        if (error) throw error;
        const c = category(s, d);
        toast('Saved ' + s + '/' + d + ' - ' + CATS[c].label, c === 'crisis' ? 'error' : 'ok');
        sys.value = ''; dia.value = ''; notes.value = ''; showLive();
        when.value = localNow(); when.max = localNow();
        await refreshRecent(true);
        sys.focus();
      } catch (ex) { err.textContent = friendly(ex); }
      finally { btn.disabled = false; }
    } },
      el('label', { class: 'bh-field bp-when' }, el('span', null, 'When'), when),
      el('div', { class: 'bp-nums' },
        el('label', { class: 'bh-field' }, el('span', null, 'Systolic', el('small', null, ' top number')), sys),
        el('div', { class: 'bp-slash', 'aria-hidden': 'true' }, '/'),
        el('label', { class: 'bh-field' }, el('span', null, 'Diastolic', el('small', null, ' bottom number')), dia)),
      live,
      el('label', { class: 'bh-field' }, el('span', null, 'Notes'), notes),
      err, btn);
    setTimeout(() => sys.focus(), 50);
    return form;
  }

  async function refreshRecent(justSaved) {
    const box = document.getElementById('bp-recent');
    if (!box) return;
    try {
      const { data, error } = await BH.sb.from('bp_readings')
        .select('id, taken_at, systolic, diastolic, notes')
        .order('taken_at', { ascending: false }).limit(RECENT);
      if (error) throw error;
      S.recent = data || [];
    } catch (ex) {
      box.replaceChildren(el('div', { class: 'bh-alert' }, 'Could not load your readings: ' + friendly(ex)));
      return;
    }
    if (!S.recent.length) {
      box.replaceChildren(el('div', { class: 'bh-card bh-empty bp-empty' }, 'No readings yet - your first one will show here.'));
      return;
    }
    box.replaceChildren(
      el('div', { class: 'bp-recent-t' }, 'Latest readings',
        el('button', { type: 'button', class: 'bp-link', onclick: () => setTab('history') }, 'See history & graph →')),
      ...S.recent.map((r, i) => readingRow(r, justSaved && i === 0, refreshRecent)));
  }

  function readingRow(r, pop, after) {
    const c = category(r.systolic, r.diastolic);
    return el('div', { class: 'bp-row' + (pop ? ' pop' : ''), style: '--c:' + CATS[c].color },
      el('div', { class: 'bp-val' }, String(r.systolic), el('span', null, '/'), String(r.diastolic)),
      el('div', { class: 'bp-main' },
        el('div', { class: 'bp-row-top' }, badge(c, true), el('span', { class: 'bp-when-t' }, fmtWhen(r.taken_at))),
        r.notes ? el('div', { class: 'bp-note' }, r.notes) : null),
      el('button', { class: 'bh-ib red', type: 'button', title: 'Delete this reading', onclick: () => remove(r, after) }, svg(ICON.trash)));
  }

  function categoryKey() {
    return el('details', { class: 'bp-key' },
      el('summary', null, 'What the categories mean'),
      el('div', { class: 'bp-key-list' }, ORDER.map((k) => el('div', { class: 'bp-key-row' }, badge(k, true), el('span', null, CATS[k].range)))),
      el('p', { class: 'bp-key-note' }, 'American Heart Association / American College of Cardiology adult categories. A reading counts in the higher category either number reaches. “Low” isn’t an AHA stage - it flags readings under 90/60. This is a log, not medical advice: talk to your doctor about your numbers, and get care right away for a reading over 180/120, especially with chest pain, shortness of breath or vision changes.'));
  }

  function remove(r, after) {
    modal({
      title: 'Delete Reading',
      body: el('p', { class: 'bh-note' }, 'Delete ' + r.systolic + '/' + r.diastolic + ' from ' + fmtWhen(r.taken_at) + '? This can’t be undone.'),
      buttons: [{ label: 'Cancel' }, { label: 'Delete', danger: true, onClick: async (close) => {
        const { error } = await BH.sb.from('bp_readings').delete().eq('id', r.id);
        if (error) { toast(friendly(error), 'error'); return; }
        close();
        toast('Reading deleted', 'ok');
        after();
      } }],
    });
  }

  /* ================================================================== HISTORY */
  const RANGES = [
    { id: 'week', label: '1 Week' },
    { id: 'month', label: '1 Month' },
    { id: 'quarter', label: '3 Months' },
    { id: 'year', label: '1 Year' },
    { id: 'custom', label: 'Custom' },
  ];
  function rangeDates() {
    const now = new Date();
    if (S.range === 'custom' && S.from && S.to) {
      const a = new Date(S.from + 'T00:00:00'), b = new Date(S.to + 'T23:59:59.999');
      return a <= b ? [a, b] : [new Date(S.to + 'T00:00:00'), new Date(S.from + 'T23:59:59.999')];
    }
    const a = new Date(now);
    if (S.range === 'week') a.setDate(a.getDate() - 7);
    else if (S.range === 'quarter') a.setMonth(a.getMonth() - 3);
    else if (S.range === 'year') a.setFullYear(a.getFullYear() - 1);
    else a.setMonth(a.getMonth() - 1);
    a.setHours(0, 0, 0, 0);
    return [a, now];
  }

  function historyView() {
    const [a, b] = rangeDates();
    if (!S.from) S.from = dateStr(a);
    if (!S.to) S.to = dateStr(b);
    const from = el('input', { type: 'date', value: S.from, max: dateStr(new Date()) });
    const to = el('input', { type: 'date', value: S.to, max: dateStr(new Date()) });
    const custom = el('div', { class: 'bp-custom' + (S.range === 'custom' ? ' on' : '') },
      el('label', null, 'From', from), el('label', null, 'To', to),
      el('button', { type: 'button', class: 'bh-btn sm primary', onclick: () => {
        if (!from.value || !to.value) { toast('Pick both dates', 'error'); return; }
        S.from = from.value; S.to = to.value; store.set('from', S.from); store.set('to', S.to); loadHistory();
      } }, 'Show'));
    const pills = el('div', { class: 'bp-ranges', role: 'group', 'aria-label': 'Time period' },
      RANGES.map((r) => el('button', { type: 'button', class: 'bp-range', 'data-r': r.id, 'aria-pressed': String(S.range === r.id), onclick: () => {
        S.range = r.id; store.set('range', r.id);
        pills.querySelectorAll('.bp-range').forEach((p) => p.setAttribute('aria-pressed', String(p.dataset.r === r.id)));
        custom.classList.toggle('on', r.id === 'custom');
        if (r.id !== 'custom') {
          const [x, y] = rangeDates(); from.value = dateStr(x); to.value = dateStr(y);
          loadHistory();
        } else from.focus();
      } }, r.label)));

    document.getElementById('bp-body').replaceChildren(
      el('div', { class: 'bp-filters' }, pills, custom),
      el('div', { id: 'bp-hist' }, el('div', { class: 'bh-empty' }, 'Loading…')));
    loadHistory();
  }

  async function loadHistory() {
    const box = document.getElementById('bp-hist');
    if (!box) return;
    box.classList.add('loading');
    const [a, b] = rangeDates();
    try {
      const { data, error } = await BH.sb.from('bp_readings')
        .select('id, taken_at, systolic, diastolic, notes')
        .gte('taken_at', a.toISOString()).lte('taken_at', b.toISOString())
        .order('taken_at', { ascending: true }).limit(5000);
      if (error) throw error;
      S.rows = (data || []).map((r) => Object.assign(r, { t: new Date(r.taken_at), cat: category(r.systolic, r.diastolic) }));
    } catch (ex) {
      box.classList.remove('loading');
      box.replaceChildren(el('div', { class: 'bh-alert' }, 'Could not load your readings: ' + friendly(ex)));
      return;
    }
    box.classList.remove('loading');
    renderHistory(a, b);
  }

  function renderHistory(a, b) {
    const box = document.getElementById('bp-hist');
    const rows = S.rows;
    const period = fmtDay(a, true) + ' – ' + fmtDay(b, true);
    if (!rows.length) {
      box.replaceChildren(el('div', { class: 'bh-card bh-empty bp-empty' }, el('b', null, 'No readings in this period'), period));
      return;
    }
    const avg = (k) => Math.round(rows.reduce((t, r) => t + r[k], 0) / rows.length);
    const as = avg('systolic'), ad = avg('diastolic'), ac = category(as, ad);
    const hi = rows.reduce((m, r) => (r.systolic > m.systolic || (r.systolic === m.systolic && r.diastolic > m.diastolic) ? r : m), rows[0]);
    const lo = rows.reduce((m, r) => (r.systolic < m.systolic || (r.systolic === m.systolic && r.diastolic < m.diastolic) ? r : m), rows[0]);
    const counts = {}; rows.forEach((r) => { counts[r.cat] = (counts[r.cat] || 0) + 1; });

    const stat = (label, val, sub, cat) => el('div', { class: 'bp-stat' },
      el('div', { class: 'bp-stat-l' }, label), el('div', { class: 'bp-stat-v' }, val), cat ? badge(cat, true) : null, sub ? el('div', { class: 'bp-stat-s' }, sub) : null);

    const chartBox = el('div', { class: 'bp-chart' });
    box.replaceChildren(
      el('div', { class: 'bp-stats' },
        stat('Readings', String(rows.length), period),
        stat('Average', as + '/' + ad, null, ac),
        stat('Highest', hi.systolic + '/' + hi.diastolic, fmtDay(hi.t, true), hi.cat),
        stat('Lowest', lo.systolic + '/' + lo.diastolic, fmtDay(lo.t, true), lo.cat)),
      el('div', { class: 'bp-mix', 'aria-label': 'Readings by category' },
        ORDER.filter((k) => counts[k]).map((k) => el('span', { class: 'bp-mix-i' }, badge(k, true), el('b', null, String(counts[k]))))),
      el('div', { class: 'bh-card bp-chart-card' },
        el('div', { class: 'bp-chart-head' },
          el('div', { class: 'bp-chart-t' }, 'Blood pressure (mmHg)'),
          el('div', { class: 'bp-legend' },
            el('span', null, el('i', { class: 'ln', style: 'background:' + SERIES.sys.color }), el('i', { class: 'mk c', style: 'background:' + SERIES.sys.color }), SERIES.sys.label),
            el('span', null, el('i', { class: 'ln', style: 'background:' + SERIES.dia.color }), el('i', { class: 'mk s', style: 'background:' + SERIES.dia.color }), SERIES.dia.label),
            el('span', null, el('i', { class: 'ln dash' }), 'Category limits'))),
        chartBox,
        el('div', { class: 'bp-chart-note' }, 'Dashed lines are the category limits: the upper set (120 / 130 / 140) applies to the systolic line, the lower set (80 / 90) to the diastolic line.')),
      historyTable(rows));
    drawChart(chartBox, rows, a, b);
  }

  /* ------------------------------------------------------------------ the graph (plain SVG) */
  let resizeT = null, lastDraw = null;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (lastDraw && document.body.contains(lastDraw[0])) drawChart(...lastDraw); }, 150); });

  function drawChart(box, rows, a, b) {
    lastDraw = [box, rows, a, b];
    const W = Math.max(300, box.clientWidth || 640), H = W < 500 ? 260 : 320;
    const M = { l: 38, r: W < 500 ? 78 : 92, t: 12, b: 28 };
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    const maxS = Math.max(...rows.map((r) => r.systolic)), minD = Math.min(...rows.map((r) => r.diastolic));
    const y0 = Math.min(50, Math.floor((minD - 10) / 10) * 10), y1 = Math.max(150, Math.ceil((maxS + 10) / 10) * 10);
    const t0 = a.getTime(), t1 = Math.max(b.getTime(), t0 + 3600e3);
    const X = (t) => M.l + ((t - t0) / (t1 - t0)) * pw;
    const Y = (v) => M.t + (1 - (v - y0) / (y1 - y0)) * ph;
    const s = (tag, attrs, ...kids) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); kids.forEach((c) => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)); return n; };

    const root = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': 'Line graph of systolic and diastolic readings from ' + fmtDay(a, true) + ' to ' + fmtDay(b, true) + '. The table below lists every reading.' });

    // grid + y axis (every 20 mmHg)
    for (let v = Math.ceil(y0 / 20) * 20; v <= y1; v += 20) {
      root.appendChild(s('line', { x1: M.l, x2: M.l + pw, y1: Y(v), y2: Y(v), class: 'g' }));
      root.appendChild(s('text', { x: M.l - 6, y: Y(v) + 4, class: 'ax', 'text-anchor': 'end' }, String(v)));
    }
    // x axis ticks: days / weeks / months depending on the span
    const span = (t1 - t0) / 864e5;
    const ticks = [];
    const d = new Date(a); d.setHours(0, 0, 0, 0);
    const fit = Math.max(2, Math.floor(pw / 58));          // how many date labels fit side by side
    if (span <= 10) { const step = Math.ceil(span / fit) || 1; for (; d.getTime() <= t1; d.setDate(d.getDate() + step)) ticks.push(new Date(d)); }
    else if (span <= 45) { while (d.getDay() !== 0) d.setDate(d.getDate() + 1); const step = 7 * Math.ceil(span / 7 / fit); for (; d.getTime() <= t1; d.setDate(d.getDate() + step)) ticks.push(new Date(d)); }
    else { d.setDate(1); d.setMonth(d.getMonth() + 1); const step = Math.ceil(span / 30.4 / fit); for (; d.getTime() <= t1; d.setMonth(d.getMonth() + step)) ticks.push(new Date(d)); }
    ticks.filter((t) => t.getTime() >= t0).forEach((t) => {
      const x = X(t.getTime());
      root.appendChild(s('line', { x1: x, x2: x, y1: M.t + ph, y2: M.t + ph + 4, class: 'tk' }));
      root.appendChild(s('text', { x, y: H - 8, class: 'ax', 'text-anchor': 'middle' },
        span > 45 ? t.toLocaleDateString('en-US', { month: 'short' }) + (t.getMonth() === 0 ? ' ’' + String(t.getFullYear()).slice(2) : '') : fmtDay(t)));
    });
    root.appendChild(s('line', { x1: M.l, x2: M.l + pw, y1: M.t + ph, y2: M.t + ph, class: 'base' }));

    // category limits
    LIMITS.filter((l) => l.v > y0 && l.v < y1).forEach((l) => {
      const y = Y(l.v);
      root.appendChild(s('line', { x1: M.l, x2: M.l + pw, y1: y, y2: y, class: 'lim', stroke: CATS[l.cat].color }));
      root.appendChild(s('circle', { cx: M.l + pw + 8, cy: y, r: 3, fill: CATS[l.cat].color }));
      root.appendChild(s('text', { x: M.l + pw + 14, y: y + 4, class: 'lim-t' }, s('title', {}, l.which + ' ' + CATS[l.cat].label + ' starts at ' + l.v), l.label));
    });

    // the two lines
    const path = (k) => rows.map((r, i) => (i ? 'L' : 'M') + X(r.t.getTime()).toFixed(1) + ' ' + Y(r[k]).toFixed(1)).join(' ');
    root.appendChild(s('path', { d: path('diastolic'), class: 'ln', stroke: SERIES.dia.color }));
    root.appendChild(s('path', { d: path('systolic'), class: 'ln', stroke: SERIES.sys.color }));
    const showMarks = rows.length <= Math.max(40, pw / 9);
    if (showMarks) {
      rows.forEach((r) => {
        const x = X(r.t.getTime());
        root.appendChild(s('rect', { x: x - 3.5, y: Y(r.diastolic) - 3.5, width: 7, height: 7, rx: 1.5, class: 'mk', fill: SERIES.dia.color }));
        root.appendChild(s('circle', { cx: x, cy: Y(r.systolic), r: 4, class: 'mk', fill: SERIES.sys.color }));
      });
    }

    // hover: crosshair snaps to the nearest reading; one tooltip with both numbers
    const cross = s('line', { y1: M.t, y2: M.t + ph, class: 'cross', visibility: 'hidden' });
    const hs = s('circle', { r: 5.5, class: 'hl', fill: SERIES.sys.color, visibility: 'hidden' });
    const hd = s('rect', { width: 10, height: 10, rx: 2, class: 'hl', fill: SERIES.dia.color, visibility: 'hidden' });
    const hit = s('rect', { x: M.l, y: M.t, width: pw, height: ph, fill: 'transparent', tabindex: 0, 'aria-label': 'Chart: use left and right arrow keys to step through readings' });
    root.append(cross, hd, hs, hit);
    const tip = el('div', { class: 'bp-tip', hidden: true });
    box.replaceChildren(root, tip);

    let cur = -1;
    function show(i) {
      if (i < 0 || i >= rows.length) return;
      cur = i;
      const r = rows[i], x = X(r.t.getTime());
      cross.setAttribute('x1', x); cross.setAttribute('x2', x);
      hs.setAttribute('cx', x); hs.setAttribute('cy', Y(r.systolic));
      hd.setAttribute('x', x - 5); hd.setAttribute('y', Y(r.diastolic) - 5);
      [cross, hs, hd].forEach((n) => n.setAttribute('visibility', 'visible'));
      tip.replaceChildren(
        el('div', { class: 'bp-tip-d' }, fmtWhen(r.taken_at)),
        el('div', { class: 'bp-tip-row' }, el('i', { style: 'background:' + SERIES.sys.color }), el('b', null, String(r.systolic)), el('span', null, 'Systolic')),
        el('div', { class: 'bp-tip-row' }, el('i', { style: 'background:' + SERIES.dia.color }), el('b', null, String(r.diastolic)), el('span', null, 'Diastolic')),
        badge(r.cat, true),
        r.notes ? el('div', { class: 'bp-tip-n' }, r.notes) : '');
      tip.hidden = false;
      const sx = box.clientWidth / W;
      const left = x * sx, tw = tip.offsetWidth;
      tip.style.left = Math.max(4, Math.min(box.clientWidth - tw - 4, left + (left + tw + 16 > box.clientWidth ? -tw - 12 : 12))) + 'px';
      tip.style.top = Math.max(4, Y(r.systolic) * sx - 10) + 'px';
    }
    function hide() { cur = -1; tip.hidden = true; [cross, hs, hd].forEach((n) => n.setAttribute('visibility', 'hidden')); }
    function nearest(px) {
      const t = t0 + ((px - M.l) / pw) * (t1 - t0);
      let lo = 0, hi = rows.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rows[m].t.getTime() < t) lo = m; else hi = m; }
      return Math.abs(rows[lo].t.getTime() - t) <= Math.abs(rows[hi].t.getTime() - t) ? lo : hi;
    }
    hit.addEventListener('pointermove', (e) => { const r = root.getBoundingClientRect(); show(nearest((e.clientX - r.left) * (W / r.width))); });
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('blur', hide);
    hit.addEventListener('focus', () => show(cur >= 0 ? cur : rows.length - 1));
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(Math.max(0, cur - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(Math.min(rows.length - 1, cur + 1)); }
      if (e.key === 'Escape') hide();
    });
  }

  /* ------------------------------------------------------------------ table (every reading in the period) */
  function historyTable(rows) {
    const list = rows.slice().reverse();
    return el('div', { class: 'bp-table-wrap' },
      el('div', { class: 'bp-recent-t' }, 'All readings in this period'),
      list.map((r) => readingRow(r, false, loadHistory)));
  }

  /* ------------------------------------------------------------------ start */
  (async function start() {
    let user = null;
    try { ({ user } = await BH.init()); } catch (e) { /* not configured / deactivated */ }
    if (!user) { BH.requireLogin(); return; }
    if (BH.track) BH.track('bloodpressure');
    BH.pageOpen('Blood Pressure', 'bloodpressure');
    S.range = store.get('range') || 'month';
    if (!RANGES.some((r) => r.id === S.range)) S.range = 'month';
    S.from = store.get('from') || ''; S.to = store.get('to') || '';
    if (S.range !== 'custom') { S.from = ''; S.to = ''; }
    shell();
    setTab(store.get('tab') === 'history' ? 'history' : 'log');
  })();
})();
