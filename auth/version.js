/* bellhive99.com - site version (load after auth.js).
 *
 * The version is the newest `ver` in the release_notes table (ADMIN > Release Notes),
 * format YYMMDD.NN. Nothing here is hand-maintained: adding a release note is what
 * bumps the version everywhere.
 *
 *   BH.version()           -> Promise of the newest ver, or '' if it can't be read
 *   <span data-bh-version="Version ">Version —</span>
 *                          -> filled with "Version 261030.05" once it loads
 *
 * Read once per page load, so a tab left open keeps the version it loaded with.
 * Same ordering rule as Project Exchange: ver is parsed, not string-sorted.
 */
(function () {
  if (!window.BH) return;

  /* "YYMMDD.NN" -> { dateNum, suf, date }, or null if it doesn't fit the pattern */
  BH.parseVer = function (ver) {
    const m = /^(\d{2})(\d{2})(\d{2})\.(\d+)$/.exec(String(ver || '').trim());
    if (!m) return null;
    const yy = +m[1], mm = +m[2], dd = +m[3];
    return { dateNum: +(m[1] + m[2] + m[3]), suf: +m[4], date: new Date(2000 + yy, mm - 1, dd) };
  };
  /* newest first */
  BH.compareVer = function (a, b) {
    const pa = BH.parseVer(a), pb = BH.parseVer(b);
    if (!pa || !pb) return pa ? -1 : pb ? 1 : 0;
    return (pb.dateNum - pa.dateNum) || (pb.suf - pa.suf);
  };

  let pending = null;
  BH.version = function () {
    if (pending) return pending;
    pending = (async () => {
      if (!BH.sb) return '';
      const { data, error } = await BH.sb.from('release_notes').select('ver');
      if (error || !data || !data.length) return '';
      const vers = data.map((r) => r.ver).filter((v) => BH.parseVer(v)).sort(BH.compareVer);
      return vers[0] || '';
    })().catch(() => '');
    return pending;
  };

  function fill() {
    const els = document.querySelectorAll('[data-bh-version]');
    if (!els.length) return;
    BH.version().then((v) => {
      if (!v) return;
      els.forEach((e) => { e.textContent = (e.getAttribute('data-bh-version') || 'v') + v; });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill);
  else fill();
})();
