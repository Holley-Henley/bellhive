/* bellhive99.com - File Share count for the left menu (INDEXA.HTM).
 *
 * INDEXA.HTM has the "File Share" link under the version number (under the star) and loads
 *   <script src="fileshare/menu.js"></script>
 * This fills its red count of files shared with you that you haven't opened yet. The count
 * refreshes every minute and clears when you open File Share. (If the link is ever missing
 * from the menu, this adds it under the version number.)
 */
(function () {

  /* ---- the link ---- */
  const p = document.createElement('p');
  p.align = 'left';
  p.innerHTML =
    '<b><a id="bh-fileshare-link" href="fileshare/index.html" target="main">' +
    '<svg class="bh-ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#8a5a00" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="m9 13 3-3 3 3"/></svg>' +
    '<font face="Tahoma" size="1">File Share</font></a></b>' +
    '<span id="bh-fileshare-count" style="display:none;margin-left:6px;font:bold 11px Tahoma,sans-serif;color:#fff;' +
    'background:#b9382b;border-radius:9px;padding:1px 6px;vertical-align:1px"></span>';

  function place() {
    const ver = document.getElementById('bh-ver') || document.querySelector('[data-bh-version]');
    let anchor = ver ? (ver.closest('p, div, td') || ver) : null;
    if (anchor && anchor.tagName === 'TD') anchor = ver;   // version sits loose in the cell
    if (anchor && anchor.parentNode) { anchor.parentNode.insertBefore(p, anchor.nextSibling); return; }
    // no version line found - fall back to just above Workout
    const w = [...document.querySelectorAll('a')].find((a) => /workout\//i.test(a.getAttribute('href') || ''));
    const wp = w && w.closest('p');
    if (wp && wp.parentNode) wp.parentNode.insertBefore(p, wp);
    else document.body.insertBefore(p, document.body.firstChild);
  }

  /* ---- the "new for you" count ---- */
  const countEl = () => document.getElementById('bh-fileshare-count');
  function show(n) {
    const c = countEl();
    if (!c) return;
    c.textContent = n > 9 ? '9+' : String(n);
    c.style.display = n > 0 ? '' : 'none';
    c.title = n ? n + ' new file' + (n === 1 ? '' : 's') + ' for you' : '';
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
      const [pref, files, mine] = await Promise.all([
        B.sb.from('user_prefs').select('value').eq('key', 'fileshare_seen_at').maybeSingle(),
        B.sb.from('shared_files').select('id, created_at').neq('sender_id', me).order('created_at', { ascending: false }).limit(200),
        B.sb.from('shared_file_downloads').select('file_id').eq('user_id', me),
      ]);
      if (files.error) return;
      const seen = pref.data && pref.data.value ? new Date(String(pref.data.value)) : null;
      const got = new Set((mine.data || []).map((d) => d.file_id));
      show((files.data || []).filter((f) => !got.has(f.id) && (!seen || new Date(f.created_at) > seen)).length);
    } catch (e) { /* never break the menu */ }
  }

  function boot() {
    if (!document.getElementById('bh-fileshare-link')) place();
    document.getElementById('bh-fileshare-link').addEventListener('click', () => show(0));
    let tries = 0;
    const wait = setInterval(() => { if (bh() || ++tries > 30) { clearInterval(wait); refresh(); } }, 1000);
    setInterval(refresh, 60000);
    window.addEventListener('message', (e) => { if (e.data && e.data.bhFileShareSeen) show(0); });
    window.addEventListener('focus', refresh);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
