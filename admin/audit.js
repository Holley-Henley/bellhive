/* bellhive99.com - ADMIN > Audit Log
 * Same idea as HHB Project Exchange's audit viewer: newest-first timeline of who did what,
 * with a colored dot per kind of action. Adds filters, day headings, paging and CSV download. */
(function () {
  const { el, toast } = BH.ui;
  const mc = document.getElementById('mc');
  const PAGE = 500;

  /* what each action_type means: label + dot color group */
  const ACTIONS = {
    login:           { label: 'Signed in',          kind: 'access' },
    logout:          { label: 'Signed out',         kind: 'access' },
    password:        { label: 'Password',           kind: 'security' },
    profile:         { label: 'Profile',            kind: 'update' },
    user_create:     { label: 'User added',         kind: 'create' },
    user_update:     { label: 'User edited',        kind: 'update' },
    user_password:   { label: 'User password',      kind: 'security' },
    user_status:     { label: 'User status',        kind: 'delete' },
    workout_import:  { label: 'History imported',   kind: 'create' },
    workout_erase:   { label: 'Data erased',        kind: 'delete' },
    exercise_create: { label: 'Exercise added',     kind: 'create' },
    exercise_update: { label: 'Exercise edited',    kind: 'update' },
    exercise_delete: { label: 'Exercise deleted',   kind: 'delete' },
    tracker_create:  { label: 'Tracker added',      kind: 'create' },
    tracker_update:  { label: 'Tracker edited',     kind: 'update' },
    tracker_delete:  { label: 'Tracker deleted',    kind: 'delete' },
    smugmug_connect:    { label: 'SmugMug connected',    kind: 'create' },
    smugmug_disconnect: { label: 'SmugMug disconnected', kind: 'delete' },
  };
  const GROUPS = [
    { id: '', label: 'All actions' },
    { id: 'access', label: 'Sign-ins & sign-outs', test: (e) => e.action_type === 'login' || e.action_type === 'logout' },
    { id: 'users', label: 'User management', test: (e) => /^user_/.test(e.action_type) },
    { id: 'security', label: 'Passwords', test: (e) => (ACTIONS[e.action_type] || {}).kind === 'security' },
    { id: 'changes', label: 'Adds, edits & deletes', test: (e) => ['create', 'update', 'delete'].includes((ACTIONS[e.action_type] || {}).kind) },
  ];
  const RANGES = [
    { id: '7', label: 'Last 7 days', days: 7 },
    { id: '30', label: 'Last 30 days', days: 30 },
    { id: '90', label: 'Last 90 days', days: 90 },
    { id: '365', label: 'Last 12 months', days: 365 },
    { id: 'all', label: 'All time', days: null },
  ];
  const MODULES = { site: 'Site', admin: 'Admin', workout: 'Workout' };

  const state = { range: '30', module: '', user: '', group: '', q: '' };
  let rows = [], more = false;

  async function start() {
    try {
      const { user } = await BH.init();
      if (!user) return BH.requireLogin();
    } catch (e) { mc.replaceChildren(el('div', { class: 'bh-alert' }, e.message)); return; }
    if (!BH.isAdmin()) { mc.replaceChildren(el('div', { class: 'bh-card bh-empty' }, 'Access restricted - admins only.')); return; }
    document.getElementById('al-actions').replaceChildren(el('button', { class: 'bh-btn', type: 'button', onclick: downloadCsv }, 'Download CSV'));
    await load(false);
  }

  async function load(older) {
    let q = BH.sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(PAGE);
    const r = RANGES.find((x) => x.id === state.range);
    if (r.days) q = q.gte('created_at', new Date(Date.now() - r.days * 864e5).toISOString());
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
    drawFilters(); render();
  }

  function filtered() {
    const g = GROUPS.find((x) => x.id === state.group);
    const q = state.q.trim().toLowerCase();
    return rows.filter((e) =>
      (!state.module || e.module === state.module) &&
      (!state.user || (e.user_name || '') === state.user) &&
      (!g || !g.test || g.test(e)) &&
      (!q || [e.user_name, e.action_detail, e.item_reference, (ACTIONS[e.action_type] || {}).label].some((v) => (v || '').toLowerCase().includes(q))));
  }

  function select(value, options, onchange, label) {
    return el('select', { class: 'al-select', 'aria-label': label, onchange: (e) => onchange(e.target.value) },
      options.map(([v, t]) => el('option', { value: v, selected: v === value }, t)));
  }
  function drawFilters() {
    const people = [...new Set(rows.map((e) => e.user_name).filter(Boolean))].sort();
    const search = el('input', { class: 'al-search', type: 'search', placeholder: 'Search details…', value: state.q, 'aria-label': 'Search' });
    let t = null;
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = search.value; render(); }, 200); });
    document.getElementById('al-filters').replaceChildren(el('div', { class: 'al-filters' },
      select(state.range, RANGES.map((r) => [r.id, r.label]), (v) => { state.range = v; load(false); }, 'Date range'),
      select(state.module, [['', 'All areas']].concat(Object.entries(MODULES)), (v) => { state.module = v; render(); }, 'Area'),
      select(state.user, [['', 'Everyone']].concat(people.map((p) => [p, p])), (v) => { state.user = v; render(); }, 'Person'),
      select(state.group, GROUPS.map((g) => [g.id, g.label]), (v) => { state.group = v; render(); }, 'Kind of action'),
      search));
  }

  function render() {
    const list = filtered();
    const out = [];
    let day = '';
    list.forEach((e) => {
      const d = new Date(e.created_at);
      const dk = d.toDateString();
      if (dk !== day) {
        day = dk;
        out.push(el('div', { class: 'al-day' }, d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })));
      }
      const a = ACTIONS[e.action_type] || { label: e.action_type, kind: 'update' };
      out.push(el('div', { class: 'al-row' },
        el('span', { class: 'al-time' }, d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })),
        el('span', { class: 'al-dot k-' + a.kind, title: a.label }),
        el('div', { class: 'al-body' },
          el('span', { class: 'al-who' }, e.user_name || 'Unknown'),
          e.user_role ? el('span', { class: 'al-role' }, ' (' + (e.user_role === 'admin' ? 'Admin' : 'Member') + ')') : null,
          el('span', { class: 'al-what' }, ' ' + (e.action_detail || a.label)),
          e.item_reference ? el('span', { class: 'al-ref' }, ' — ' + e.item_reference) : null),
        el('span', { class: 'al-mod' }, MODULES[e.module] || e.module || '')));
    });
    const legend = el('div', { class: 'al-legend' },
      [['access', 'Sign-in'], ['create', 'Added'], ['update', 'Edited'], ['security', 'Password'], ['delete', 'Removed / deactivated']]
        .map(([k, t]) => el('span', null, el('i', { class: 'al-dot k-' + k }), t)));
    mc.replaceChildren(...[
      el('div', { class: 'al-count' }, 'Showing ' + list.length + (list.length !== rows.length ? ' of ' + rows.length : '') + ' entr' + (list.length === 1 ? 'y' : 'ies'), legend),
      el('div', { class: 'bh-card al-card' }, out.length ? out : el('div', { class: 'bh-empty' }, rows.length ? 'Nothing matches these filters.' : 'No log entries in this date range yet.')),
      more ? el('div', { style: 'text-align:center;margin-top:12px' }, el('button', { class: 'bh-btn', type: 'button', onclick: () => load(true) }, 'Load older entries')) : null,
    ].filter(Boolean));
  }

  function downloadCsv() {
    const list = filtered();
    if (!list.length) { toast('Nothing to download', 'error'); return; }
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [['When', 'Person', 'Role', 'Area', 'Action', 'Detail', 'Reference'].join(',')].concat(list.map((e) => [
      new Date(e.created_at).toLocaleString('en-US'), e.user_name, e.user_role, MODULES[e.module] || e.module,
      (ACTIONS[e.action_type] || {}).label || e.action_type, e.action_detail, e.item_reference].map(esc).join(',')));
    const a = el('a', { href: URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' })), download: 'bellhive99-audit-log-' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  start();
})();
