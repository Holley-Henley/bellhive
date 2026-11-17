/* bellhive99.com - home page themes (load after auth.js).
 *
 * The 3D scene at the top of the home page (INDEXB.HTM) is a theme: themes/<id>.js.
 * Which one shows is worked out here from the site_theme row (supabase/site-theme.sql),
 * the viewer's own pick (member_theme) and today's date, in this order:
 *   1. your own pick (My Account) - you only
 *   2. "switch today's theme" - everyone, today only
 *   3. a holiday pinned to today's date (MM-DD)
 *   4. the schedule: static | daily | weekly | monthly | random (each visit), over the rotation list
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
    { id: 'space', name: 'Star Wars', blurb: 'Starfighter dogfight around a battle station and a ringed planet. Click for the jump to lightspeed.' },
    { id: 'shire', name: 'Lord of the Rings', blurb: 'Hill village with round doors at sunset, chimney smoke and fireflies. Click for fireworks.' },
    { id: 'goo', name: 'John Dies at the End', blurb: 'A living black goo in a jar under a flickering bulb and a half-broken neon sign. Click to poke it.' },
  ];
  const byId = Object.fromEntries(list.map((t) => [t.id, t]));
  const known = (id) => !!(id && byId[id]);
  const MODES = [
    ['static', 'Keep static'],
    ['daily', 'Change every day'],
    ['weekly', 'Change every week (Mondays)'],
    ['monthly', 'Change every month'],
    ['random', 'Random each visit'],
  ];
  const DEFAULT = { mode: 'static', static_theme: 'beehive', rotation: ['beehive', 'space'], today_theme: null, today_date: null, holidays: [] };

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
      default: return { id: known(cfg.static_theme) ? cfg.static_theme : 'beehive', why: 'kept static' };
    }
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
    const wrap = el('div', { class: 'bh-card bh-card-pad th-card' }, el('div', { class: 'bh-empty' }, 'Loading themes…'));
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
      const rotBoxes = list.map((t) => {
        const cb = el('input', { type: 'checkbox', value: t.id, checked: (cfg.rotation || []).includes(t.id) ? 'checked' : null });
        return el('label', { class: 'th-check' }, cb, el('b', null, t.name), el('small', null, t.blurb));
      });
      const rotRow = el('div', { class: 'bh-field' }, el('span', null, 'Themes in the rotation'), ...rotBoxes);
      const syncMode = () => {
        staticRow.classList.toggle('bh-gone', modeSel.value !== 'static');
        rotRow.classList.toggle('bh-gone', modeSel.value === 'static');
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
            el('button', { class: 'bh-btn', type: 'button', title: 'Remove', onclick: () => { hols.splice(i, 1); drawHols(); } }, '✕'));
        }),
        el('button', { class: 'bh-btn', type: 'button', onclick: () => { hols.push({ md: '', theme: list[0].id, name: '' }); drawHols(); } }, '+ Add a Date'));
      drawHols();

      const saveBtn = el('button', { class: 'bh-btn primary', type: 'button', onclick: async () => {
        err.textContent = '';
        const rotation = rotBoxes.map((l) => l.querySelector('input')).filter((c) => c.checked).map((c) => c.value);
        if (modeSel.value !== 'static' && !rotation.length) { err.textContent = 'Tick at least one theme for the rotation.'; return; }
        const bad = hols.find((h) => !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(h.md || ''));
        if (bad) { err.textContent = 'Holiday dates are month-day, like 05-04 or 12-25.'; return; }
        try {
          cfg = await saveSite({ mode: modeSel.value, static_theme: staticSel.value, rotation, holidays: hols.map((h) => ({ md: h.md, theme: h.theme, name: (h.name || '').trim() || undefined })) });
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
        staticRow, rotRow,
        el('div', { class: 'bh-field' }, el('span', null, 'Holidays'),
          el('small', { class: 'th-help' }, 'On these dates the theme is set automatically, whatever the schedule says.'), holBox),
        saveBtn,
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
    ].join('\n');
    document.head.appendChild(css);
  }

  window.BHThemes = { list, byId, MODES, resolve, load, saveSite, saveMine, card, isoDay };
})();
