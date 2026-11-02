/* bellhive99.com - Guest Book count for the left menu (INDEXA.HTM).
 *
 * INDEXA.HTM has the "Guest Book" link (id bh-guestbook-link) and loads
 *   <script src="guestbook/menu.js"></script>
 * This fills its red count of entries other people have written since you last opened the
 * Guest Book (guests signing from the sign-in screen included). Refreshes every minute and
 * clears when you open the Guest Book.
 */
(function () {
  const countEl = () => document.getElementById('bh-guestbook-count');
  function show(n) {
    const c = countEl();
    if (!c) return;
    c.textContent = n > 9 ? '9+' : String(n);
    c.style.display = n > 0 ? '' : 'none';
    c.title = n ? n + ' new guest book entr' + (n === 1 ? 'y' : 'ies') : '';
  }
  function bh() {
    try { if (window.top.BH && window.top.BH.sb && window.top.BH.user) return window.top.BH; } catch (e) { /* other origin */ }
    if (window.BH && window.BH.sb && window.BH.user) return window.BH;
    return null;
  }
  async function refresh() {
    const B = bh();
    if (!B) return;
    try {
      const me = B.user.id;
      const pref = await B.sb.from('user_prefs').select('value').eq('user_id', me).eq('key', 'guestbook_seen_at').maybeSingle();
      let q = B.sb.from('guestbook_entries').select('id', { count: 'exact', head: true })
        .eq('source', 'site').eq('hidden', false).or('user_id.is.null,user_id.neq.' + me);
      if (pref.data && pref.data.value) q = q.gt('created_at', String(pref.data.value));
      const { count, error } = await q;
      if (!error) show(count || 0);
    } catch (e) { /* never break the menu */ }
  }
  function boot() {
    const link = document.getElementById('bh-guestbook-link');
    if (link) link.addEventListener('click', () => show(0));
    let tries = 0;
    const wait = setInterval(() => { if (bh() || ++tries > 30) { clearInterval(wait); refresh(); } }, 1000);
    setInterval(refresh, 60000);
    window.addEventListener('message', (e) => { if (e.data && e.data.bhGuestbookSeen) show(0); });
    window.addEventListener('focus', refresh);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
