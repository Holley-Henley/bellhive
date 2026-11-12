/* bellhive99.com - Chrisware
 * Per-user permissions: what each person sees in the left menu and which module pages
 * they can open. Edited on ADMIN > Permissions; stored in the user_permissions table
 * (supabase/permissions.sql). Modeled on HHB Project Exchange's permission tree, but set
 * per user instead of per tier.
 *
 * Load after auth.js:
 *   <script src="<root>/auth/perms.js"></script>                    shared helpers only
 *   <script src="<root>/auth/perms.js" data-perm="workout"></script> also guards this page
 *
 *   await BH.loadPerms()   -> { key: true/false, ... } for the signed-in user
 *   BH.can('workout')      -> true / false
 *   BH.watchPerms(fn)      -> calls fn(perms) whenever an admin saves this user's permissions
 *
 * The ADMIN section is not in the tree on purpose: it follows the Admin role
 * (ADMIN > Users), so nothing on the Permissions screen can lock every admin out.
 */
(function () {
  if (!window.BH) return;
  const BH = window.BH;

  /* Adding a menu item later = one entry here + data-perm="<key>" on its line in INDEXA.HTM.
   * def: what someone gets before an admin changes anything (missing = on). */
  const TREE = [
    { section: 'main', label: 'Main Menu', items: [
      { key: 'fileshare', label: 'File Share', href: 'fileshare/index.html' },
      { key: 'pictures',  label: 'Pictures (SmugMug galleries)', href: 'pictures/index.html' },
      { key: 'guestbook', label: 'Guest Book', href: 'guestbook/index.html' },
    ] },
    { section: 'resources', label: 'Resources', items: [
      { key: 'inventory',   label: 'Inventory (vehicles & equipment)', href: 'vehicles/inventory.html' },
      { key: 'maintenance', label: 'Maintenance', href: 'vehicles/maintenance.html' },
    ] },
    { section: 'audiobooks', label: 'Audiobooks', items: [
      { key: 'audiobooks_twice',   label: 'Twice Yearly', href: 'audiobooks/twice-yearly.html' },
      { key: 'audiobooks_library', label: 'Library', href: 'audiobooks/library.html' },
    ] },
    { section: 'music', label: 'Music', items: [
      { key: 'music_library', label: 'Library', href: 'music/library.html', note: 'shared - everyone it is on for sees the whole collection', def: false },
    ] },
    { section: 'health', label: 'Health and Fitness', items: [
      { key: 'workout',   label: 'Workout', href: 'workout/index.html', note: 'each person only ever sees their own log' },
      { key: 'bloodpressure', label: 'Blood Pressure', href: 'bloodpressure/index.html', note: 'each person only ever sees their own readings' },
    ] },
    { section: 'links', label: 'Link Lists (outside websites)', items: [
      { key: 'links_search',  label: 'Search Engines' },
    ] },
  ];
  BH.PERM_TREE = TREE;

  const DEFAULTS = {};
  TREE.forEach((s) => s.items.forEach((i) => { DEFAULTS[i.key] = i.def !== false; }));
  BH.permDefaults = () => Object.assign({}, DEFAULTS);
  /* stored object -> full object with every key filled in */
  BH.permFill = (stored) => {
    const out = BH.permDefaults();
    Object.keys(stored || {}).forEach((k) => { if (k in out) out[k] = stored[k] !== false; });
    return out;
  };

  BH.perms = null;
  BH.loadPerms = async function () {
    if (!BH.sb || !BH.user) { BH.perms = BH.permDefaults(); return BH.perms; }
    try {
      const { data, error } = await BH.sb.from('user_permissions').select('permissions').eq('user_id', BH.user.id).maybeSingle();
      if (error) throw error;
      BH.perms = BH.permFill(data && data.permissions);
    } catch (e) {
      // table not there yet / offline: fall back to the defaults so the site keeps working
      console.warn('permissions:', e.message || e);
      BH.perms = BH.permDefaults();
    }
    return BH.perms;
  };
  BH.can = (key) => (BH.perms ? BH.perms[key] !== false : DEFAULTS[key] !== false);

  /* Live updates: an admin's save reaches this person's menu right away (and on refocus). */
  BH.watchPerms = function (fn) {
    if (!BH.sb || !BH.user) return;
    const reload = async () => { const before = JSON.stringify(BH.perms); await BH.loadPerms(); if (JSON.stringify(BH.perms) !== before) fn(BH.perms); };
    try {
      BH.sb.channel('perms-' + Math.random().toString(36).slice(2, 8))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_permissions', filter: 'user_id=eq.' + BH.user.id }, reload)
        .subscribe();
    } catch (e) { /* realtime unavailable - the focus refresh still works */ }
    window.addEventListener('focus', reload);
  };

  /* ---------- page guard (data-perm on the script tag) ---------- */
  const me = document.currentScript;
  const pageKey = me && me.dataset.perm;
  if (!pageKey) return;

  function block() {
    const root = BH.root || '';
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'alert');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
      'background:#f5f3ef;font:15px Barlow,system-ui,sans-serif;color:#1e1a14;padding:20px';
    wrap.innerHTML = '<div style="max-width:420px;background:#fff;border:1px solid #e6e1d6;border-radius:12px;padding:26px 28px;text-align:center">' +
      '<div style="font:700 22px \'Barlow Condensed\',sans-serif;margin-bottom:8px">Not turned on for your account</div>' +
      '<div style="color:#5f5747;line-height:1.5">This part of the site is switched off for you. An admin can turn it on under ADMIN &rsaquo; Permissions.</div>' +
      '<a href="' + root + 'index.html" target="_top" style="display:inline-block;margin-top:18px;padding:8px 16px;background:#2a2216;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Back to Home</a></div>';
    const put = () => { [...document.body.children].forEach((c) => { if (c !== wrap && c.tagName !== 'SCRIPT') c.style.display = 'none'; }); document.body.appendChild(wrap); };
    if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
  }

  if (BH.init) {
    BH.init().then(async ({ user }) => {
      if (!user) return;           // the page's own code sends them to sign in
      await BH.loadPerms();
      if (!BH.can(pageKey)) { block(); return; }
      BH.watchPerms(() => { if (!BH.can(pageKey)) block(); });
    }).catch(() => {});
  }
})();
