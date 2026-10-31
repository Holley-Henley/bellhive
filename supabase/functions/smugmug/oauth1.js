// OAuth 1.0a request signing (HMAC-SHA1), as SmugMug's API requires.
// Plain JavaScript with Web Crypto so it runs in Supabase Edge Functions (Deno) and in Node for tests.

/** RFC 3986 percent-encoding (encodeURIComponent leaves !'()* alone; OAuth needs them encoded). */
export const pct = (s) =>
  encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export async function hmacSha1Base64(key, text) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Signature base string: METHOD & encoded-base-URL & encoded-sorted-params. */
export function baseString(method, baseUrl, params) {
  const pairs = params.map(([k, v]) => [pct(k), pct(v)]);
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const norm = pairs.map(([k, v]) => k + '=' + v).join('&');
  return method.toUpperCase() + '&' + pct(baseUrl) + '&' + pct(norm);
}

/**
 * Build the Authorization header for a request.
 * opts: { method, url (no query), query: {..}, consumerKey, consumerSecret, token?, tokenSecret?, extra?: {oauth_callback|oauth_verifier}, nonce?, timestamp? }
 */
export async function authHeader(opts) {
  const oauth = {
    oauth_consumer_key: opts.consumerKey,
    oauth_nonce: opts.nonce || crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(opts.timestamp || Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
  };
  if (opts.token) oauth.oauth_token = opts.token;
  Object.assign(oauth, opts.extra || {});
  const params = Object.entries(opts.query || {}).map(([k, v]) => [k, String(v)]).concat(Object.entries(oauth));
  const base = baseString(opts.method || 'GET', opts.url, params);
  const signingKey = pct(opts.consumerSecret) + '&' + pct(opts.tokenSecret || '');
  oauth.oauth_signature = await hmacSha1Base64(signingKey, base);
  return 'OAuth ' + Object.entries(oauth).map(([k, v]) => pct(k) + '="' + pct(v) + '"').join(', ');
}

/** Query string encoded the same way the signature saw it (spaces as %20, not +). */
export function queryString(query) {
  const q = Object.entries(query || {}).map(([k, v]) => pct(k) + '=' + pct(v)).join('&');
  return q ? '?' + q : '';
}
