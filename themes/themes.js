/* bellhive99.com - home page themes (load after auth.js).
 *
 * The 3D scene at the top of the home page (INDEXB.HTM) is a theme: themes/<id>.js.
 * Which one shows is worked out here from the site_theme row (supabase/site-theme.sql),
 * the viewer's own pick (member_theme) and today's date, in this order:
 *   1. your own pick (My Account) - you only
 *   2. "switch today's theme" - everyone, today only
 *   3. a holiday pinned to today's date (MM-DD)
 *   4. the schedule: static | daily | weekly | monthly | random (each visit) | timed, over the rotation list
 *      timed: changes every cycle_minutes, randomly or in the rotation's order, optionally with the
 *      Classic Beehive every other change. Time slots count from 1970, so everyone sees the same theme.
 *   BHThemes.nextChange(cfg, mine) -> ms until the theme next changes on its own (timed mode), or 0
 *
 *   BHThemes.list                 [{ id, name, blurb }]
 *   BHThemes.load()               -> { cfg, mine }   (needs BH.init() first)
 *   BHThemes.resolve(cfg, mine)   -> { id, why }
 *   BHThemes.card()               -> the "Home Page Theme" settings card (My Account, ADMIN > Settings)
 *
 * To add a theme: write themes/<id>.js (registers window.BHScenes[id] = function (box, lib) {...})
 * and add it to the list below.
 */
(function () {
  const list = [
    { id: 'beehive', name: 'Classic Beehive', blurb: 'Straw skep on a stump, bees foraging at the flowers. Click the hive for a swarm.' },
    { id: 'space', name: 'Star Wars', blurb: 'Starfighter dogfight near a moon-sized battle station and a ringed planet, two droids looking on. Click for the jump to lightspeed.' },
    { id: 'shire', name: 'Lord of the Rings', blurb: 'Hill village with round doors at sunset, chimney smoke and fireflies. Click for fireworks.' },
    { id: 'goo', name: 'John Dies at the End', blurb: 'A living black goo in a soy sauce can, a meat monster and a dog under a flickering bulb. Click to poke it.' },
    { id: 'blackhole', name: 'Interstellar', blurb: 'A black hole bending its glowing disk around itself, a ring ship drifting past. Click for time dilation.' },
    { id: 'flycity', name: 'The Fifth Element', blurb: 'Hazy canyon city with lanes of flying cars and a yellow taxi weaving through. Click and the taxi dives.' },
    { id: 'overlook', name: 'The Shining', blurb: 'A long, empty hotel hallway, hexagon carpet, a tricycle and a small red ball rolling toward you. Click if you dare.' },
    { id: 'aquarium', name: 'Aquarium', blurb: 'A saltwater reef tank: clownfish in an anemone, tangs, a pufferfish and a sunken bellhive99 treasure chest. Click to feed the fish.' },
  ];
  const byId = Object.fromEntries(list.map((t) => [t.id, t]));
  const known = (id) => !!(id && byId[id]);
  const MODES = [
    ['static', 'Keep static'],
    ['daily', 'Change every day'],
    ['weekly', 'Change every week (Mondays)'],
    ['monthly', 'Change every month'],
    ['random', 'Random each visit'],
    ['timed', 'Change on a timer'],
  ];
  const DEFAULT = { mode: 'static', static_theme: 'beehive', rotation: ['beehive', 'space'], today_theme: null, today_date: null, holidays: [], cycle_minutes: 15, cycle_order: 'random', cycle_hive: false };
  const INTERVALS = [[1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [360, '6 hours'], [720, '12 hours']];
  const HOME = 'beehive';
  const everyLabel = (m) => { const i = INTERVALS.find((x) => x[0] === m); return i ? i[1] : m + ' minutes'; };
  /* a stable pseudo-random number in [0,1) for a slot, the same in every browser */
  const hash01 = (k) => { let x = (k | 0) ^ 0x5bd1e995; x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); x = Math.imul(x ^ (x >>> 12), 0x297a2d39); x ^= x >>> 15; return (x >>> 0) / 4294967296; };
  function timedPick(cfg, rot, now) {
    const mins = Math.min(1440, Math.max(1, cfg.cycle_minutes | 0 || 15));
    const slot = Math.floor(now.getTime() / (mins * 60000));
    let pool = rot, k = slot;
    if (cfg.cycle_hive) {
      if (slot % 2 === 0) return HOME;
      pool = rot.filter((id) => id !== HOME);
      if (!pool.length) return HOME;
      k = Math.floor(slot / 2);
    }
    const n = pool.length;
    if (cfg.cycle_order === 'order') return pool[((k % n) + n) % n];
    /* shuffle-play: each round shows every theme once in a shuffled order (the same shuffle in every
       browser), and a round never starts with the theme the last one ended on */
    const order = (r) => {
      const p = pool.slice();
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(hash01(r * 7919 + i) * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
      return p;
    };
    const r = Math.floor(k / n), at = ((k % n) + n) % n, cur = order(r);
    if (n > 1 && cur[0] === order(r - 1)[n - 1]) [cur[0], cur[1]] = [cur[1], cur[0]];
    return cur[at];
  }

  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dayNum = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);

  function resolve(cfg, mine, now) {
    cfg = Object.assign({}, DEFAULT, cfg || {});
    now = now || new Date();
    if (known(mine)) return { id: mine, why: 'your own pick' };
    if (known(cfg.today_theme) && cfg.today_date === isoDay(now)) return { id: cfg.today_theme, why: 'switched for today' };
    const md = pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    const hol = (cfg.holidays || []).find((h) => h && h.md === md && known(h.theme));
    if (hol) return { id: hol.theme, why: 'holiday' + (hol.name ? ': ' + hol.name : '') };
    let rot = (cfg.rotation || []).filter(known);
    if (!rot.length) rot = ['beehive'];
    const dn = dayNum(now);
    switch (cfg.mode) {
      case 'daily': return { id: rot[dn % rot.length], why: 'changes every day' };
      case 'weekly': return { id: rot[Math.floor((dn + 3) / 7) % rot.length], why: 'changes every week' };
      case 'monthly': return { id: rot[(now.getFullYear() * 12 + now.getMonth()) % rot.length], why: 'changes every month' };
      case 'random': return { id: rot[Math.floor(Math.random() * rot.length)], why: 'random each visit' };
      case 'timed': return { id: timedPick(cfg, rot, now), why: 'changes every ' + everyLabel(cfg.cycle_minutes) + (cfg.cycle_hive ? ', Classic Beehive every other time' : '') };
      default: return { id: known(cfg.static_theme) ? cfg.static_theme : 'beehive', why: 'kept static' };
    }
  }

  /* ms until the timer schedule next changes the theme for this viewer; 0 when nothing is on a timer
     (own pick, today's switch and holidays all hold still) */
  function nextChange(cfg, mine, now) {
    cfg = Object.assign({}, DEFAULT, cfg || {});
    now = now || new Date();
    if (cfg.mode !== 'timed' || !/^changes every/.test(resolve(cfg, mine, now).why)) return 0;
    const ms = Math.min(1440, Math.max(1, cfg.cycle_minutes | 0 || 15)) * 60000;
    return ms - (now.getTime() % ms);
  }

  async function load() {
    const out = { cfg: Object.assign({}, DEFAULT), mine: null };
    if (!window.BH || !BH.sb || !BH.user) return out;
    const [s, m] = await Promise.all([
      BH.sb.from('site_theme').select('*').eq('id', 1).maybeSingle(),
      BH.sb.from('member_theme').select('theme').eq('user_id', BH.user.id).maybeSingle(),
    ]);
    if (s.data) out.cfg = Object.assign(out.cfg, s.data);
    if (m.data) out.mine = m.data.theme;
    return out;
  }
  async function saveSite(patch) {
    const r = await BH.sb.from('site_theme').update(patch).eq('id', 1).select('*').single();
    if (r.error) throw new Error(r.error.message);
    changed();
    return r.data;
  }
  async function saveMine(theme) {
    const r = theme
      ? await BH.sb.from('member_theme').upsert({ user_id: BH.user.id, theme, updated_at: new Date().toISOString() })
      : await BH.sb.from('member_theme').delete().eq('user_id', BH.user.id);
    if (r.error) throw new Error(r.error.message);
    changed();
  }
  /* tell the home page shell (index.html) to re-read the theme */
  function changed() { try { (window.top || window).postMessage({ bhThemeChanged: true }, '*'); } catch (e) { /* not framed */ } }

  /* ---------- the settings card ---------- */
  function card() {
    const { el, toast } = BH.ui;
    const wrap = el('div', { class: 'bh-card bh-card-pad th-card' }, el('div', { class: 'bh-empty' }, 'Loading themes\u2026'));
    let cfg, mine;
    const opt = (id, label, sel) => el('option', { value: id, selected: sel ? 'selected' : null }, label);
    const themeSelect = (val, extra) => {
      const s = el('select', null, ...(extra || []), ...list.map((t) => opt(t.id, t.name, t.id === val)));
      s.value = known(val) ? val : s.options[0].value;
      return s;
    };

    function render() {
      const now = new Date();
      const cur = resolve(cfg, mine, now);
      const site = resolve(cfg, null, now);
      const err = el('div', { class: 'bh-err', style: 'text-align:left' });
      const fail = (e) => { err.textContent = e.message; };

      /* today */
      const todaySel = themeSelect(site.id);
      const todaySet = known(cfg.today_theme) && cfg.today_date === isoDay(now);
      const todayBtn = el('button', { class: 'bh-btn primary', type: 'button', onclick: async () => {
        err.textContent = '';
        try { cfg = await saveSite({ today_theme: todaySel.value, today_date: isoDay(new Date()) }); toast('Today\'s theme: ' + byId[todaySel.value].name, 'ok'); render(); } catch (e) { fail(e); }
      } }, 'Switch Today');
      const todayClear = todaySet ? el('button', { class: 'bh-btn', type: 'button', onclick: async () => {
        try { cfg = await saveSite({ today_theme: null, today_date: null }); toast('Back to the schedule', 'ok'); render(); } catch (e) { fail(e); }
      } }, 'Back to Schedule') : null;

      /* schedule */
      const modeSel = el('select', null, ...MODES.map(([v, l]) => opt(v, l, v === cfg.mode)));
      modeSel.value = cfg.mode;
      const staticSel = themeSelect(cfg.static_theme);
      const staticRow = el('label', { class: 'bh-field' }, el('span', null, 'Theme'), staticSel);
      /* the rotation: ticked themes in their saved order first, then the rest; arrows reorder them */
      const saved = (cfg.rotation || []).filter(known);
      const ordered = saved.concat(list.map((t) => t.id).filter((id) => !saved.includes(id)));
      const rotList = el('div', { class: 'th-rot' });
      const rotBoxes = ordered.map((id) => {
        const t = byId[id];
        const cb = el('input', { type: 'checkbox', value: t.id, checked: saved.includes(t.id) ? 'checked' : null });
        const row = el('div', { class: 'th-rotrow' });
        const move = (d) => {
          const rows = [...rotList.children], i = rows.indexOf(row), j = i + d;
          if (j < 0 || j >= rows.length) return;
          if (d < 0) rotList.insertBefore(row, rows[j]); else rotList.insertBefore(rows[j], row);
        };
        row.append(
          el('span', { class: 'th-arrows' },
            el('button', { class: 'bh-btn th-arrow', type: 'button', title: 'Move up', onclick: () => move(-1) }, '\u25b2'),
            el('button', { class: 'bh-btn th-arrow', type: 'button', title: 'Move down', onclick: () => move(1) }, '\u25bc')),
          el('label', { class: 'th-check' }, cb, el('b', null, t.name), el('small', null, t.blurb)));
        rotList.appendChild(row);
        return row;
      });
      const rotRow = el('div', { class: 'bh-field' }, el('span', null, 'Themes in the rotation'),
        el('small', { class: 'th-help' }, 'Tick the themes to use. The arrows set the order for "In order".'), rotList);

      /* timer options */
      const everySel = el('select', null, ...INTERVALS.map(([m, l]) => opt(String(m), l, m === cfg.cycle_minutes)));
      if (!INTERVALS.some(([m]) => m === cfg.cycle_minutes)) everySel.value = '15';
      const orderSel = el('select', null, opt('random', 'Random (never the same one twice running)', cfg.cycle_order !== 'order'), opt('order', 'In order (the order of the list below)', cfg.cycle_order === 'order'));
      const hiveCb = el('input', { type: 'checkbox', checked: cfg.cycle_hive ? 'checked' : null });
      const timedRow = el('div', null,
        el('label', { class: 'bh-field' }, el('span', null, 'Change every'), everySel),
        el('label', { class: 'bh-field' }, el('span', null, 'Order'), orderSel),
        el('label', { class: 'th-check' }, hiveCb, el('b', null, 'Classic Beehive every other change'),
          el('small', null, 'Beehive, then the next theme, then Beehive again, then the next one, and so on.')));
      const syncMode = () => {
        staticRow.classList.toggle('bh-gone', modeSel.value !== 'static');
        rotRow.classList.toggle('bh-gone', modeSel.value === 'static');
        timedRow.classList.toggle('bh-gone', modeSel.value !== 'timed');
      };
      modeSel.addEventListener('change', syncMode);
      syncMode();

      /* holidays */
      let hols = (cfg.holidays || []).map((h) => Object.assign({}, h));
      const holBox = el('div', { class: 'th-hols' });
      const drawHols = () => holBox.replaceChildren(
        ...hols.map((h, i) => {
          const md = el('input', { value: h.md || '', placeholder: 'MM-DD', maxLength: 5, class: 'th-md', oninput: (e) => (h.md = e.target.value.trim()) });
          const nm = el('input', { value: h.name || '', placeholder: 'Name (optional)', oninput: (e) => (h.name = e.target.value) });
          const ts = themeSelect(h.theme); ts.addEventListener('change', () => (h.theme = ts.value));
          if (!h.theme) h.theme = ts.value;
          return el('div', { class: 'th-hol' }, md, ts, nm,
            el('button', { class: 'bh-btn', type: 'button', title: 'Remove', onclick: () => { hols.splice(i, 1); drawHols(); } }, '\u2715'));
        }),
        el('button', { class: 'bh-btn', type: 'button', onclick: () => { hols.push({ md: '', theme: list[0].id, name: '' }); drawHols(); } }, '+ Add a Date'));
      drawHols();

      const saveBtn = el('button', { class: 'bh-btn primary', type: 'button', onclick: async () => {
        err.textContent = '';
        const rotation = [...rotList.children].map((r) => r.querySelector('input[type=checkbox]')).filter((c) => c.checked).map((c) => c.value);
        if (modeSel.value !== 'static' && !rotation.length) { err.textContent = 'Tick at least one theme for the rotation.'; return; }
        if (modeSel.value === 'timed' && hiveCb.checked && !rotation.some((id) => id !== HOME)) { err.textContent = 'With Classic Beehive every other change, tick at least one other theme.'; return; }
        const bad = hols.find((h) => !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(h.md || ''));
        if (bad) { err.textContent = 'Holiday dates are month-day, like 05-04 or 12-25.'; return; }
        try {
          cfg = await saveSite({ mode: modeSel.value, static_theme: staticSel.value, rotation, cycle_minutes: +everySel.value, cycle_order: orderSel.value, cycle_hive: hiveCb.checked, holidays: hols.map((h) => ({ md: h.md, theme: h.theme, name: (h.name || '').trim() || undefined })) });
          toast('Theme schedule saved', 'ok'); render();
        } catch (e) { fail(e); }
      } }, 'Save Schedule');

      /* mine */
      const mineSel = themeSelect(mine, [opt('', 'Follow the site', !known(mine))]);
      mineSel.addEventListener('change', async () => {
        try { await saveMine(mineSel.value || null); mine = mineSel.value || null; toast(mine ? 'You\'ll see ' + byId[mine].name : 'Following the site theme', 'ok'); render(); } catch (e) { fail(e); }
      });

      wrap.replaceChildren(
        el('h2', null, 'Home Page Theme'),
        el('p', { class: 'bh-note' }, 'The 3D scene at the top of the home page. Showing now: ',
          el('b', null, byId[cur.id].name), ' (' + cur.why + ').',
          cur.id !== site.id || cur.why === 'your own pick' ? [' Everyone else sees ', el('b', null, byId[site.id].name), ' (' + site.why + ').'] : ''),
        el('h3', { class: 'th-h3' }, 'Today'),
        el('p', { class: 'bh-note' }, 'Switches the theme for everyone until midnight, then the schedule takes over again.'),
        el('div', { class: 'th-row' }, todaySel, todayBtn, todayClear),
        el('h3', { class: 'th-h3' }, 'Schedule'),
        el('label', { class: 'bh-field' }, el('span', null, 'How it changes'), modeSel),
        staticRow, timedRow, rotRow,
        el('div', { class: 'bh-field' }, el('span', null, 'Holidays'),
          el('small', { class: 'th-help' }, 'On these dates the theme is set automatically, whatever the schedule says.'), holBox),
        saveBtn,
        known(mine) ? el('div', { class: 'bh-alert', style: 'margin-top:12px' },
          'On your screen your own pick (' + byId[mine].name + ') overrides this schedule, so you won\'t see it change. ',
          el('button', { class: 'bh-btn', type: 'button', onclick: async () => {
            try { await saveMine(null); mine = null; toast('Following the site theme', 'ok'); render(); } catch (e) { fail(e); }
          } }, 'Follow the Site')) : null,
        el('h3', { class: 'th-h3' }, 'Just for Me'),
        el('p', { class: 'bh-note' }, 'Pick your own theme. Only you see it; everyone else follows the site.'),
        el('label', { class: 'bh-field' }, el('span', null, 'My theme'), mineSel),
        err);
    }

    load().then((r) => { cfg = r.cfg; mine = r.mine; render(); })
      .catch((e) => wrap.replaceChildren(el('h2', null, 'Home Page Theme'), el('div', { class: 'bh-alert' }, 'Could not load themes: ' + e.message)));
    return wrap;
  }

  /* card styles, kept here so any page that shows the card gets them */
  if (!document.getElementById('th-css')) {
    const css = document.createElement('style');
    css.id = 'th-css';
    css.textContent = [
      '.th-card h2 { margin-top: 0; }',
      '.th-h3 { font-size: 15px; margin: 18px 0 6px; padding-top: 14px; border-top: 1px solid var(--bh-border); }',
      '.th-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }',
      '.th-row select { flex: 1 1 180px; }',
      '.th-check { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: center; margin: 6px 0; font-size: 14px; cursor: pointer; }',
      '.th-check small { grid-column: 2; color: var(--bh-text3); font-size: 12px; }',
      '.th-help { display: block; font-size: 12px; color: var(--bh-text3); margin: 2px 0 6px; }',
      '.th-hols { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }',
      '.th-hol { display: flex; gap: 6px; flex-wrap: wrap; width: 100%; }',
      '.th-hol .th-md { width: 76px; flex: none; }',
      '.th-hol input:not(.th-md) { flex: 1 1 140px; }',
      '.th-card > .bh-btn { margin-top: 8px; }',
      '.th-rotrow { display: flex; gap: 8px; align-items: center; }',
      '.th-rotrow .th-check { flex: 1; }',
      '.th-arrows { display: flex; flex-direction: column; gap: 2px; }',
      '.th-arrow { padding: 0 6px; font-size: 10px; line-height: 16px; min-height: 0; }',
    ].join('\n');
    document.head.appendChild(css);
  }

  window.BHThemes = { list, byId, MODES, resolve, nextChange, load, saveSite, saveMine, card, isoDay };
})();
