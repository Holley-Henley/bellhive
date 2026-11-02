/* bellhive99.com - ADMIN > Audit Log
 * Same idea as HHB Project Exchange's audit viewer: newest-first timeline of who did what,
 * with a colored dot per kind of action. Filters, day headings, paging and CSV download.
 *
 * Entries come from three places (the "source" column):
 *   browser  - written by a page (pages opened, albums viewed, sign-outs, downloads)
 *   database - written by the database itself (every add / edit / delete of stored data,
 *              sign-ins, password changes) with before / after values
 *   server   - written by an edge function (user admin, SmugMug, failed sign-ins)
 * Click an entry to see its details; repeated entries (a run of logged sets, a string of
 * page opens) are grouped and can be expanded. Page visits from ADMIN > Visitors can be
 * mixed into the same timeline. */
(function () {
  const { el, toast } = BH.ui;
  const mc = document.getElementById('mc');
  const PAGE = 500;

  /* what each action_type means: label + dot color group */
  const ACTIONS = {
    login:            { label: 'Signed in',             kind: 'access' },
    logout:           { label: 'Signed out',            kind: 'access' },
    login_failed:     { label: 'Failed sign-in',        kind: 'security' },
    password:         { label: 'Password changed',      kind: 'security' },
    password_reset:   { label: 'Password reset asked',  kind: 'security' },
    profile:          { label: 'Profile',               kind: 'update' },
    user_create:      { label: 'User added',            kind: 'create' },
    user_update:      { label: 'User edited',           kind: 'update' },
    user_password:    { label: 'User password',         kind: 'security' },
    user_reset_email: { label: 'Reset email sent',      kind: 'security' },
    user_status:      { label: 'User status',           kind: 'delete' },
    user_delete:      { label: 'User removed',          kind: 'delete' },
    workout_import:   { label: 'History imported',      kind: 'create' },
    workout_erase:    { label: 'Data erased',           kind: 'delete' },
    exercise_create:  { label: 'Exercise added',        kind: 'create' },
    exercise_update:  { label: 'Exercise edited',       kind: 'update' },
    exercise_delete:  { label: 'Exercise deleted',      kind: 'delete' },
    tracker_create:   { label: 'Tracker added',         kind: 'create' },
    tracker_update:   { label: 'Tracker edited',        kind: 'update' },
    tracker_delete:   { label: 'Tracker deleted',       kind: 'delete' },
    set_add:          { label: 'Set logged',            kind: 'create' },
    set_edit:         { label: 'Set edited',            kind: 'update' },
    set_delete:       { label: 'Set deleted',           kind: 'delete' },
    daily_add:        { label: 'Daily entry',           kind: 'create' },
    daily_edit:       { label: 'Daily entry changed',   kind: 'update' },
    daily_delete:     { label: 'Daily entry cleared',   kind: 'delete' },
    smugmug_connect:    { label: 'SmugMug connected',    kind: 'create' },
    smugmug_disconnect: { label: 'SmugMug disconnected', kind: 'delete' },
    page_open:        { label: 'Page opened',           kind: 'view' },
    link_open:        { label: 'Outside link',          kind: 'view' },
    album_open:       { label: 'Album opened',          kind: 'view' },
    photos_view:      { label: 'Photos viewed',         kind: 'view' },
    video_open:       { label: 'Video played',          kind: 'view' },
    audit_export:     { label: 'Audit log downloaded',  kind: 'view' },
    visit:            { label: 'Page visit',            kind: 'visit' },
    guestbook_guest:  { label: 'Guest signed guest book', kind: 'create' },
    guestbook_sign:   { label: 'Signed guest book',     kind: 'create' },
    guestbook_hide:   { label: 'Guest book entry hidden', kind: 'update' },
    guestbook_show:   { label: 'Guest book entry shown', kind: 'update' },
    guestbook_delete: { label: 'Guest book entry deleted', kind: 'delete' },
    vehicle_insert:   { label: 'Item added',            kind: 'create' },
    vehicle_update:   { label: 'Item edited',           kind: 'update' },
    vehicle_delete:   { label: 'Item deleted',          kind: 'delete' },
    vehicle_photo:    { label: 'Item photo',            kind: 'update' },
    vehicle_recall:   { label: 'Recall marked',         kind: 'update' },
    maint_insert:     { label: 'Maintenance logged',    kind: 'create' },
    maint_update:     { label: 'Maintenance edited',    kind: 'update' },
    maint_delete:     { label: 'Maintenance deleted',   kind: 'delete' },
    maint_file:       { label: 'Maintenance invoice',   kind: 'update' },
  };
  const act = (e) => ACTIONS[e.action_type] || { label: e.action_type, kind: 'update' };
  const GROUPS = [
    { id: '', label: 'All actions' },
    { id: 'access', label: 'Sign-ins & sign-outs', test: (e) => act(e).kind === 'access' },
    { id: 'security', label: 'Passwords & failed sign-ins', test: (e) => act(e).kind === 'security' },
    { id: 'users', label: 'User management', test: (e) => /^user_/.test(e.action_type) },
    { id: 'logging', label: 'Workout logging (sets & daily)', test: (e) => /^(set|daily)_/.test(e.action_type) },
    { id: 'setup', label: 'Workout setup', test: (e) => /^(exercise|tracker|workout)_/.test(e.action_type) },
    { id: 'guestbook', label: 'Guest Book', test: (e) => /^guestbook_/.test(e.action_type) },
    { id: 'vehicles', label: 'Inventory & maintenance', test: (e) => /^(vehicle|maint)_/.test(e.action_type) },
    { id: 'views', label: 'Pages, albums & links opened', test: (e) => act(e).kind === 'view' },
    { id: 'changes', label: 'All adds, edits & deletes', test: (e) => ['create', 'update', 'delete'].includes(act(e).kind) },
  ];
  const RANGES = [
    { id: '1', label: 'Last 24 hours', days: 1 },
    { id: '7', label: 'Last 7 days', days: 7 },
    { id: '30', label: 'Last 30 days', days: 30 },
    { id: '90', label: 'Last 90 days', days: 90 },
    { id: '365', label: 'Last 12 months', days: 365 },
    { id: 'all', label: 'All time', days: null },
  ];
  const MODULES = { site: 'Site', admin: 'Admin', workout: 'Workout', pictures: 'Pictures', fileshare: 'File Share', guestbook: 'Guest Book', vehicles: 'Inventory' };
  const SOURCES = { browser: 'Browser', database: 'Database', server: 'Server', visit: 'Visitor log' };
  const SOURCE_NOTE = {
    browser: 'Written by the page in the browser.',
    database: 'Written by the database itself when the data changed - cannot be skipped from a page.',
    server: 'Written by a server function (edge function).',
    visit: 'From the visitor log (ADMIN > Visitors).',
  };
  /* field names in before/after values */
  const FIELD = {
    full_name: 'Name', name: 'Name', phone: 'Phone', role: 'Role', active: 'Active', email: 'Email',
    reps: 'Reps', weight: 'Weight (lb)', duration_sec: 'Seconds', distance: 'Distance (mi)', set_no: 'Set #',
    performed_on: 'Date', performed_at: 'Time', note: 'Note', extra: 'Other fields', exercise_id: 'Exercise',
    category: 'Category', fields: 'Measures', custom: 'Custom fields', target: 'Target', archived: 'Hidden', key: 'Key',
    unit: 'Unit', agg: 'Weekly number', step: 'Step', value: 'Value', entry_date: 'Date', metric_id: 'Tracker',
    method: 'Method', city: 'City', region: 'Region', country: 'Country', device: 'Device', browser: 'Browser',
    reason: 'Reason', privacy: 'Privacy', photos: 'Photos', location: 'From', message: 'Message', hidden: 'Hidden',
  };
  const HIDE_FIELDS = new Set(['exercise_id', 'metric_id', 'key']);
  const GROUPABLE = /^(set_|daily_|page_open|link_open|album_open|photos_view|video_open|visit)/;
  const GROUP_GAP = 30 * 60e3;   // entries closer than 30 minutes join a group

  const state = { range: '7', module: '', user: '', group: '', source: '', q: '', visits: false, grouped: true };
  let rows = [], visits = [], more = false;
  const open = new Set();        // expanded entry / group ids

  async function start() {
    try {
      const { user } = await BH.init();
      if (!user) return BH.requireLogin();
    } catch (e) { mc.replaceChildren(el('div', { class: 'bh-alert' }, e.message)); return; }
    if (!BH.isAdmin()) { mc.replaceChildren(el('div', { class: 'bh-card bh-empty' }, 'Access restricted - admins only.')); return; }
    BH.pageOpen('Admin › Audit Log', 'admin');
    document.getElementById('al-actions').replaceChildren(el('button', { class: 'bh-btn', type: 'button', onclick: downloadCsv }, 'Download CSV'));
    await load(false);
  }

  function since() {
    const r = RANGES.find((x) => x.id === state.range);
    return r.days ? new Date(Date.now() - r.days * 864e5).toISOString() : null;
  }

  async function load(older) {
    let q = BH.sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(PAGE);
    const from = since();
    if (from) q = q.gte('created_at', from);
    if (older && rows.length) q = q.lt('created_at', rows[rows.length - 1].created_at);
    const { data, error } = await q;
    if (error) {
      const missing = /audit_log/.test(error.message) && /(does not exist|schema cache|not find)/i.test(error.message);
      mc.replaceChildren(el('div', { class: 'bh-alert' }, missing
        ? 'The audit log table has not been created yet - run supabase/audit-log.sql in the Supabase SQL Editor.'
        : 'Error: ' + error.message));
      return;
    }
    rows = older ? rows.concat(data || []) : (data || []);
    more = (data || []).length === PAGE;
    if (state.visits && !older) await loadVisits();
    drawFilters(); render();
  }

  /* page visits (ADMIN > Visitors) shown as timeline entries */
  async function loadVisits() {
    let q = BH.sb.from('site_visits').select('id, created_at, page, signed_in, user_id, city, region, country_code, device, browser, referrer, is_bot')
      .order('created_at', { ascending: false }).limit(1000);
    const from = since();
    if (from) q = q.gte('created_at', from);
    const [{ data, error }, { data: people }] = await Promise.all([q, BH.sb.from('profiles').select('id, full_name, email, role')]);
    if (error) { toast('Could not load page visits: ' + error.message, 'error'); visits = []; return; }
    const who = new Map((people || []).map((p) => [p.id, p]));
    visits = (data || []).map((v) => {
      const p = v.user_id && who.get(v.user_id);
      const where = [v.city, v.region, v.country_code].filter(Boolean).join(', ');
      return {
        id: 'v' + v.id, created_at: v.created_at, action_type: 'visit', module: 'site', source: 'visit',
        user_name: p ? (p.full_name || p.email) : (v.is_bot ? 'Bot / crawler' : 'Anonymous visitor'),
        user_role: p ? p.role : null,
        action_detail: 'viewed the ' + v.page + ' page' + (where ? ' from ' + where : ''),
        item_reference: [v.device, v.browser, v.referrer ? 'came from ' + v.referrer : ''].filter(Boolean).join(' · '),
        new_values: null, old_values: null,
      };
    });
  }

  function allRows() {
    if (!state.visits || !visits.length) return rows;
    const oldest = more && rows.length ? rows[rows.length - 1].created_at : '';
    return rows.concat(visits.filter((v) => v.created_at >= oldest)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  function filtered() {
    const g = GROUPS.find((x) => x.id === state.group);
    const q = state.q.trim().toLowerCase();
    return allRows().filter((e) =>
      (!state.module || e.module === state.module) &&
      (!state.user || (e.user_name || '') === state.user) &&
      (!state.source || (e.source || 'browser') === state.source) &&
      (!g || !g.test || g.test(e)) &&
      (!q || [e.user_name, e.action_detail, e.item_reference, act(e).label].some((v) => (v || '').toLowerCase().includes(q))));
  }

  function select(value, options, onchange, label) {
    return el('select', { class: 'al-select', 'aria-label': label, onchange: (e) => onchange(e.target.value) },
      options.map(([v, t]) => el('option', { value: v, selected: v === value }, t)));
  }
  function check(on, text, onchange) {
    return el('label', { class: 'al-check' }, el('input', { type: 'checkbox', checked: on, onchange: (e) => onchange(e.target.checked) }), text);
  }
  function drawFilters() {
    const people = [...new Set(allRows().map((e) => e.user_name).filter(Boolean))].sort();
    const search = el('input', { class: 'al-search', type: 'search', placeholder: 'Search details…', value: state.q, 'aria-label': 'Search' });
    let t = null;
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = search.value; render(); }, 200); });
    document.getElementById('al-filters').replaceChildren(el('div', { class: 'al-filters' },
      select(state.range, RANGES.map((r) => [r.id, r.label]), (v) => { state.range = v; load(false); }, 'Date range'),
      select(state.module, [['', 'All areas']].concat(Object.entries(MODULES)), (v) => { state.module = v; render(); }, 'Area'),
      select(state.user, [['', 'Everyone']].concat(people.map((p) => [p, p])), (v) => { state.user = v; render(); }, 'Person'),
      select(state.group, GROUPS.map((g) => [g.id, g.label]), (v) => { state.group = v; render(); }, 'Kind of action'),
      select(state.source, [['', 'All sources']].concat(Object.entries(SOURCES).filter(([k]) => k !== 'visit' || state.visits)), (v) => { state.source = v; render(); }, 'Source'),
      search),
    el('div', { class: 'al-filters al-filters2' },
      check(state.grouped, 'Group repeated entries', (v) => { state.grouped = v; render(); }),
      check(state.visits, 'Include page visits (Visitors log)', async (v) => {
        state.visits = v;
        if (v) await loadVisits(); else { visits = []; if (state.source === 'visit') state.source = ''; }
        drawFilters(); render();
      })));
  }

  /* collapse runs of the same thing by the same person */
  function grouped(list) {
    if (!state.grouped) return list.map((e) => ({ e, kids: null }));
    const out = [];
    list.forEach((e) => {
      const g = out[out.length - 1];
      const head = g && (g.kids ? g.kids[g.kids.length - 1] : g.e);
      if (g && GROUPABLE.test(e.action_type) && head.action_type === e.action_type && head.user_name === e.user_name &&
          head.module === e.module && new Date(head.created_at).toDateString() === new Date(e.created_at).toDateString() &&
          new Date(head.created_at) - new Date(e.created_at) < GROUP_GAP) {
        if (!g.kids) g.kids = [g.e];
        g.kids.push(e);
      } else out.push({ e, kids: null });
    });
    return out;
  }

  const fmtTime = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  function fmtVal(v) {
    if (v == null || v === '') return '—';
    if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? (x.label || x.key || JSON.stringify(x)) : String(x))).join(', ') : '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'object') { const k = Object.entries(v).filter(([, x]) => x != null && x !== ''); return k.length ? k.map(([a, b]) => a + ': ' + b).join(', ') : '—'; }
    return String(v);
  }

  function details(e) {
    const o = e.old_values || {}, n = e.new_values || {};
    const keys = [...new Set(Object.keys(o).concat(Object.keys(n)))].filter((k) => !HIDE_FIELDS.has(k));
    const both = e.old_values && e.new_values;
    const facts = [
      ['When', new Date(e.created_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })],
      ['Who', (e.user_name || 'Unknown') + (e.user_role ? ' (' + (e.user_role === 'admin' ? 'Admin' : 'Member') + ')' : '')],
      ['Area', MODULES[e.module] || e.module || '—'],
      ['Recorded by', (SOURCES[e.source] || 'Browser') + ' — ' + (SOURCE_NOTE[e.source] || SOURCE_NOTE.browser)],
      e.item_reference ? ['Reference', e.item_reference] : null,
      e.row_count > 1 ? ['Rows affected', String(e.row_count)] : null,
    ].filter(Boolean);
    return el('div', { class: 'al-detail' },
      el('dl', { class: 'al-facts' }, facts.flatMap(([a, b]) => [el('dt', null, a), el('dd', null, b)])),
      keys.length ? el('table', { class: 'al-diff' },
        el('thead', null, el('tr', null, el('th', null, 'Field'), both ? el('th', null, 'Before') : null, el('th', null, both ? 'After' : (e.old_values ? 'Value (removed)' : 'Value')))),
        el('tbody', null, keys.map((k) => el('tr', null,
          el('td', null, FIELD[k] || k.replace(/_/g, ' ')),
          both ? el('td', { class: 'al-old' }, fmtVal(o[k])) : null,
          el('td', { class: both ? 'al-new' : '' }, fmtVal(e.new_values ? n[k] : o[k])))))) : null);
  }

  /* a run of page opens reads as one line: "opened 3 pages: Home, Pictures, Workout › Week" */
  const OPENS = /^(page_open|link_open|album_open)$/;
  function openedSummary(kids) {
    const names = [...new Set(kids.slice().reverse().map((k) => (k.action_detail || '').replace(/^opened (outside link |album )?/, '')))];
    const noun = kids[0].action_type === 'album_open' ? 'album' : kids[0].action_type === 'link_open' ? 'outside link' : 'page';
    const list = names.slice(0, 6).join(', ') + (names.length > 6 ? ', …' : '');
    return 'opened ' + kids.length + ' ' + noun + 's: ' + list;
  }
  function rowFor(e, opts) {
    const d = new Date(e.created_at);
    const a = act(e);
    const id = String(e.id);
    const isOpen = open.has(id);
    const kids = opts && opts.kids;
    const toggle = () => { if (open.has(id)) open.delete(id); else open.add(id); render(); };
    const body = el('div', { class: 'al-body' },
      el('span', { class: 'al-who' }, e.user_name || 'Unknown'),
      e.user_role ? el('span', { class: 'al-role' }, ' (' + (e.user_role === 'admin' ? 'Admin' : 'Member') + ')') : null,
      el('span', { class: 'al-what' }, ' ' + (kids && OPENS.test(e.action_type) ? openedSummary(kids) : (e.action_detail || a.label))),
      e.item_reference && !(kids && OPENS.test(e.action_type)) ? el('span', { class: 'al-ref' }, ' — ' + e.item_reference) : null,
      kids && !OPENS.test(e.action_type) ? el('span', { class: 'al-more' }, ' + ' + (kids.length - 1) + ' more') : null);
    return [
      el('div', { class: 'al-row' + (opts && opts.child ? ' al-child' : '') + (isOpen ? ' open' : ''), role: 'button', tabindex: 0,
        title: kids ? 'Show all ' + kids.length : 'Show details',
        onclick: toggle, onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } } },
        el('span', { class: 'al-time' }, kids && fmtTime(new Date(kids[kids.length - 1].created_at)) !== fmtTime(d)
          ? fmtTime(new Date(kids[kids.length - 1].created_at)).replace(/ (AM|PM)$/, (m) => (fmtTime(d).endsWith(m.trim()) ? '' : m)) + '–' + fmtTime(d) : fmtTime(d)),
        el('span', { class: 'al-dot k-' + a.kind, title: a.label }),
        body,
        el('span', { class: 'al-tags' },
          kids ? el('span', { class: 'al-count-badge' }, '×' + kids.length) : null,
          el('span', { class: 'al-src s-' + (e.source || 'browser'), title: SOURCE_NOTE[e.source] || SOURCE_NOTE.browser }, (SOURCES[e.source] || 'Browser').replace('Visitor log', 'Visit')),
          el('span', { class: 'al-mod' }, MODULES[e.module] || e.module || ''),
          el('span', { class: 'al-caret' }, isOpen ? '▾' : '▸'))),
      isOpen ? (kids ? el('div', { class: 'al-kids' }, kids.flatMap((k) => rowFor(k, { child: true })).filter(Boolean)) : details(e)) : null,
    ];
  }

  function render() {
    const list = filtered();
    const out = [];
    let day = '';
    grouped(list).forEach(({ e, kids }) => {
      const d = new Date(e.created_at);
      const dk = d.toDateString();
      if (dk !== day) {
        day = dk;
        out.push(el('div', { class: 'al-day' }, d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })));
      }
      out.push(...rowFor(e, { kids }).filter(Boolean));
    });
    const total = allRows().length;
    const legend = el('div', { class: 'al-legend' },
      [['access', 'Sign-in'], ['create', 'Added'], ['update', 'Edited'], ['security', 'Password / failed'], ['delete', 'Removed'], ['view', 'Opened'], state.visits ? ['visit', 'Visit'] : null]
        .filter(Boolean).map(([k, t]) => el('span', null, el('i', { class: 'al-dot k-' + k }), t)));
    mc.replaceChildren(...[
      el('div', { class: 'al-count' }, 'Showing ' + list.length + (list.length !== total ? ' of ' + total : '') + ' entr' + (list.length === 1 ? 'y' : 'ies') + ' · click an entry for details', legend),
      el('div', { class: 'bh-card al-card' }, out.length ? out : el('div', { class: 'bh-empty' }, total ? 'Nothing matches these filters.' : 'No log entries in this date range yet.')),
      more ? el('div', { style: 'text-align:center;margin-top:12px' }, el('button', { class: 'bh-btn', type: 'button', onclick: () => load(true) }, 'Load older entries')) : null,
    ].filter(Boolean));
  }

  function downloadCsv() {
    const list = filtered();
    if (!list.length) { toast('Nothing to download', 'error'); return; }
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const vals = (o) => (o ? Object.entries(o).filter(([k]) => !HIDE_FIELDS.has(k)).map(([k, v]) => (FIELD[k] || k) + ': ' + fmtVal(v)).join('; ') : '');
    const lines = [['When', 'Person', 'Role', 'Area', 'Action', 'Detail', 'Reference', 'Recorded by', 'Rows', 'Before', 'After'].join(',')].concat(list.map((e) => [
      new Date(e.created_at).toLocaleString('en-US'), e.user_name, e.user_role, MODULES[e.module] || e.module,
      act(e).label, e.action_detail, e.item_reference, SOURCES[e.source] || 'Browser', e.row_count || '',
      vals(e.old_values), vals(e.new_values)].map(esc).join(',')));
    const a = el('a', { href: URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' })), download: 'bellhive99-audit-log-' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    BH.audit('audit_export', 'downloaded the audit log (' + list.length + ' entries)', RANGES.find((r) => r.id === state.range).label, 'admin');
  }

  start();
})();
