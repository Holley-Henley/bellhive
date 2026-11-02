/* bellhive99.com - Chrisware
 * ADMIN > Permissions
 * Same idea as HHB Project Exchange's Manage Permissions panel (list on the left, checkbox
 * tree on the right, nothing commits until Save), but one set of checkboxes per user
 * instead of per tier. Rows live in user_permissions (supabase/permissions.sql); the tree
 * itself is BH.PERM_TREE in auth/perms.js.
 */
(function () {
  const { el, toast, fmtWhen } = BH.ui;
  const mc = document.getElementById('mc');
  let users = [];            // profiles
  let stored = {};           // user_id -> user_permissions row
  let selId = null;          // user shown on the right
  let working = null;        // full key -> bool copy for selId, edited in place until Save
  let saving = false;

  async function start() {
    try {
      const { user } = await BH.init();
      if (!user) return BH.requireLogin();
    } catch (e) {
      mc.replaceChildren(el('div', { class: 'bh-alert' }, e.message)); return;
    }
    if (!BH.isAdmin()) { mc.replaceChildren(el('div', { class: 'bh-card bh-empty' }, 'Access restricted - admins only.')); return; }
    BH.pageOpen('Admin › Permissions', 'admin');
    document.getElementById('pm-actions').replaceChildren(
      el('a', { class: 'bh-btn', style: 'text-decoration:none', href: 'users.html' }, 'Users'));
    await load(new URLSearchParams(location.search).get('user'));
    window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
  }

  async function load(pick) {
    const [p, r] = await Promise.all([
      BH.sb.from('profiles').select('id, full_name, email, role, active').order('full_name'),
      BH.sb.from('user_permissions').select('*'),
    ]);
    if (p.error) { mc.replaceChildren(el('div', { class: 'bh-alert' }, 'Error: ' + p.error.message)); return; }
    if (r.error) {
      mc.replaceChildren(el('div', { class: 'bh-alert' },
        'The permissions table is not set up yet (' + r.error.message + '). Run supabase/permissions.sql on the bellhive99 project.'));
      return;
    }
    users = (p.data || []).slice().sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1));
    stored = {};
    (r.data || []).forEach((row) => { stored[row.user_id] = row; });
    const keep = pick && users.find((u) => u.id === pick) ? pick : (selId && users.find((u) => u.id === selId) ? selId : null);
    select(keep || (users.find((u) => u.id !== BH.user.id) || users[0] || {}).id, true);
  }

  const saved = (id) => BH.permFill(stored[id] && stored[id].permissions);
  const dirty = () => !!(selId && working && JSON.stringify(working) !== JSON.stringify(saved(selId)));
  const isCustom = (id) => {
    const s = saved(id), d = BH.permDefaults();
    return Object.keys(d).some((k) => s[k] !== d[k]);
  };

  function select(id, force) {
    if (!id) { mc.replaceChildren(el('div', { class: 'bh-card bh-empty' }, 'No users yet.')); return; }
    if (!force && id !== selId && dirty() && !confirm('You have unsaved changes for this person. Discard them?')) return;
    selId = id;
    working = saved(id);
    history.replaceState(null, '', location.pathname + '?user=' + encodeURIComponent(id));
    render();
  }

  function render() {
    const u = users.find((x) => x.id === selId);
    const list = el('div', { class: 'pm-list' }, el('div', { class: 'lh' }, 'People'),
      users.map((x) => el('button', { class: 'pm-user' + (x.id === selId ? ' on' : ''), type: 'button', onclick: () => select(x.id) },
        el('span', { class: 'bh-av' }, BH.initials(x.full_name || x.email)),
        el('span', null, (x.full_name || x.email || '—') + (x.id === BH.user.id ? ' (you)' : ''),
          el('span', { class: 'sub' }, (x.role === 'admin' ? 'Admin' : 'Member') + (x.active ? '' : ' · inactive'))),
        isCustom(x.id) ? el('span', { class: 'dot', title: 'Has changes from the defaults' }) : null)));

    const row = stored[selId];
    let editor = null;
    const by = row && row.updated_by ? users.find((x) => x.id === row.updated_by) : null;
    const sections = BH.PERM_TREE.map((sec) => {
      const boxes = sec.items.map((it) => {
        const cb = el('input', { type: 'checkbox', checked: working[it.key] !== false });
        const line = el('label', { class: 'pm-item' + (working[it.key] !== saved(selId)[it.key] ? ' changed' : '') }, cb,
          el('span', null, it.label), it.note ? el('span', { class: 'note' }, '- ' + it.note) : null);
        cb.addEventListener('change', () => { working[it.key] = cb.checked; render(); });
        return line;
      });
      const setAll = (v) => { sec.items.forEach((it) => { working[it.key] = v; }); render(); };
      return el('div', { class: 'pm-sec' },
        el('div', { class: 'pm-sec-h' }, el('span', null, sec.label), el('span', { class: 'sp' }),
          el('button', { type: 'button', onclick: () => setAll(true) }, 'All'),
          el('button', { type: 'button', onclick: () => setAll(false) }, 'None')),
        boxes);
    });

    const saveBtn = el('button', { class: 'bh-btn primary', type: 'button', disabled: !dirty() || saving, onclick: save }, saving ? 'Saving…' : 'Save');
    const resetBtn = el('button', { class: 'bh-btn', type: 'button', disabled: saving || !row, title: 'Remove this person\'s custom settings so they get the defaults (everything on)', onclick: reset }, 'Reset to Defaults');
    const undoBtn = dirty() ? el('button', { class: 'bh-btn', type: 'button', onclick: () => { working = saved(selId); render(); } }, 'Undo Changes') : null;

    editor = el('div', { class: 'pm-detail' },
      el('div', { class: 'pm-who' }, el('h2', null, u.full_name || u.email), el('span', { class: 'bh-badge ' + (u.role === 'admin' ? 'admin' : 'member') }, u.role === 'admin' ? 'Admin' : 'Member')),
      el('div', { class: 'pm-meta' }, row ? 'Last changed ' + fmtWhen(row.updated_at) + (by ? ' by ' + (by.full_name || by.email) : '') : 'Using the defaults - nothing changed yet'),
      el('div', { class: 'pm-info' },
        u.role === 'admin'
          ? 'The ADMIN section (Users, Permissions, Audit Log, Visitors, Release Notes) always shows for admins and can\'t be switched off here, so nobody gets locked out. Change the role on ADMIN › Users.'
          : 'Members never see the ADMIN section. Make someone an admin on ADMIN › Users.'),
      sections,
      el('div', { class: 'pm-foot' },
        el('span', { class: 'hint' }, 'Unchecked items disappear from this person\'s left menu right away, and the page itself won\'t open for them.'),
        undoBtn, resetBtn, saveBtn));

    mc.replaceChildren(el('div', { class: 'bh-card pm-shell' }, list, editor));
  }

  async function save() {
    if (!dirty()) return;
    saving = true; render();
    const { data, error } = await BH.sb.from('user_permissions')
      .upsert({ user_id: selId, permissions: working }, { onConflict: 'user_id' }).select();
    saving = false;
    if (error) { render(); toast('Could not save: ' + error.message, 'error'); return; }
    // Same guard as Project Exchange: an RLS block returns no rows instead of an error.
    if (!data || !data.length) { render(); toast('Save failed - nothing was written (permission or session problem). Refresh and sign in again.', 'error'); return; }
    stored[selId] = data[0];
    working = saved(selId);
    const u = users.find((x) => x.id === selId);
    toast('Permissions saved for ' + (u.full_name || u.email), 'ok');
    render();
  }

  async function reset() {
    const u = users.find((x) => x.id === selId);
    if (!confirm('Reset ' + (u.full_name || u.email) + ' to the defaults? Everything will be turned back on.')) return;
    saving = true; render();
    const { data, error } = await BH.sb.from('user_permissions').delete().eq('user_id', selId).select();
    saving = false;
    if (error || !data || !data.length) { render(); toast('Could not reset: ' + (error ? error.message : 'nothing was removed'), 'error'); return; }
    delete stored[selId];
    working = saved(selId);
    toast((u.full_name || u.email) + ' is back on the defaults', 'ok');
    render();
  }

  start();
})();
