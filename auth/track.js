/* bellhive99.com - record a page view for ADMIN > Visitors.
 * Usage (after auth.js):  BH.track('pictures')
 * Fire-and-forget: never slows the page or shows an error. Skipped when opened straight
 * from disk (file://) so testing on your own computer doesn't fill the map. */
(function () {
  if (!window.BH) return;
  const C = window.BH_CONFIG || {};
  BH.track = async function (page) {
    try {
      if (location.protocol === 'file:' || !C.supabaseUrl) return;
      let token = null;
      if (BH.sb) { const { data } = await BH.sb.auth.getSession(); token = data.session && data.session.access_token; }
      const headers = { 'Content-Type': 'application/json', apikey: C.supabaseKey };
      if (token) headers.Authorization = 'Bearer ' + token;
      let ref = '';
      try { if (document.referrer && new URL(document.referrer).origin !== location.origin) ref = document.referrer; } catch (e) { /* ignore */ }
      fetch(C.supabaseUrl + '/functions/v1/track', { method: 'POST', headers, body: JSON.stringify({ page, referrer: ref }), keepalive: true }).catch(() => {});
    } catch (e) { /* never interfere */ }
  };
})();
