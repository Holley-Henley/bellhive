// bellhive99.com - smugmug edge function (Pictures page)
//
// Signed-in, active bellhive99 users:
//   status                          -> { connected, nickname }
//   albums                          -> every album (public + private) with a cover thumbnail
//   images   { album_key, start }   -> one page of photos for an album, plus the album's details
// Admins only (one-time connection):
//   connect_start  { api_key?, api_secret? } -> saves key/secret, returns the SmugMug approval URL
//   connect_finish { verifier }              -> trades the 6-digit code for a long-lived access token
//   disconnect
//
// Deploy with "Verify JWT" OFF - the function checks the caller itself.
// The SmugMug key, secret and token live in public.integration_secrets (see supabase/smugmug.sql),
// which only the server key can read. SMUGMUG_API_KEY / SMUGMUG_API_SECRET function secrets also work.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authHeader, queryString } from './oauth1.js';

const OAUTH = 'https://api.smugmug.com/services/oauth/1.0a';
const API = 'https://api.smugmug.com';
const PAGE = 100;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// short in-memory cache of the album list (per running instance)
let albumCache: { at: number; data: unknown[] } | null = null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let secret = '';
  try { secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')['default'] || ''; } catch { /* fall back */ }
  if (!secret) secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!secret) return json({ error: 'Server key is not configured.' }, 500);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---- who is calling? ----
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in.' }, 401);
  const { data: who, error: whoErr } = await db.auth.getUser(token);
  if (whoErr || !who?.user) return json({ error: 'Not signed in.' }, 401);
  const { data: me } = await db.from('profiles').select('role, active').eq('id', who.user.id).single();
  if (!me || !me.active) return json({ error: 'Account not active.' }, 403);
  const isAdmin = me.role === 'admin';

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || '');

  // ---- stored connection ----
  const getRow = async (name: string) => {
    const { data } = await db.from('integration_secrets').select('data').eq('name', name).maybeSingle();
    return (data?.data || {}) as Record<string, string>;
  };
  const putRow = (name: string, data: Record<string, unknown>) =>
    db.from('integration_secrets').upsert({ name, data, updated_at: new Date().toISOString() });

  const conn = await getRow('smugmug');
  const apiKey = conn.api_key || Deno.env.get('SMUGMUG_API_KEY') || '';
  const apiSecret = conn.api_secret || Deno.env.get('SMUGMUG_API_SECRET') || '';
  const connected = !!(apiKey && apiSecret && conn.access_token && conn.access_secret);

  // signed GET against the SmugMug API (JSON)
  async function smug(path: string, query: Record<string, string | number> = {}) {
    const url = API + path;
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(query)) q[k] = String(v);
    const auth = await authHeader({ method: 'GET', url, query: q, consumerKey: apiKey, consumerSecret: apiSecret, token: conn.access_token, tokenSecret: conn.access_secret });
    const r = await fetch(url + queryString(q), { headers: { Authorization: auth, Accept: 'application/json' } });
    const text = await r.text();
    let j: any = null;
    try { j = JSON.parse(text); } catch { /* not json */ }
    if (!r.ok) throw new Error('SmugMug said ' + r.status + ': ' + ((j && (j.Message || j.message)) || text.slice(0, 200)));
    return j;
  }
  // OAuth token endpoints return form-encoded text
  async function oauthCall(endpoint: string, opts: { token?: string; tokenSecret?: string; extra?: Record<string, string>; key: string; secret: string }) {
    const url = OAUTH + '/' + endpoint;
    const auth = await authHeader({ method: 'GET', url, consumerKey: opts.key, consumerSecret: opts.secret, token: opts.token, tokenSecret: opts.tokenSecret, extra: opts.extra });
    const r = await fetch(url, { headers: { Authorization: auth } });
    const text = await r.text();
    if (!r.ok) throw new Error('SmugMug sign-in step failed (' + r.status + '): ' + text.slice(0, 200));
    return Object.fromEntries(new URLSearchParams(text));
  }
  const expansion = (resp: any, uri?: string) => (uri && resp?.Expansions ? resp.Expansions[uri] : null);
  // swap a SmugMug size code in a photo URL, e.g. .../Th/i-abc-Th.jpg -> .../L/i-abc-L.jpg
  const resize = (u: string | undefined, size: string) => (u ? u.replace(/\/(Ti|Th|S|M|L|XL|X2|X3)\/([^/]+)-(Ti|Th|S|M|L|XL|X2|X3)\.(\w+)$/, `/${size}/$2-${size}.$4`) : u);

  try {
    if (action === 'status') {
      return json({ connected, nickname: conn.nickname || null, is_admin: isAdmin, has_key: !!(apiKey && apiSecret) });
    }

    // ---------- admin: connect ----------
    if (action === 'connect_start' || action === 'connect_finish' || action === 'disconnect') {
      if (!isAdmin) return json({ error: 'Admins only.' }, 403);
      if (action === 'disconnect') {
        await db.from('integration_secrets').delete().in('name', ['smugmug', 'smugmug_request']);
        albumCache = null;
        return json({ ok: true });
      }
      if (action === 'connect_start') {
        const key = String(body.api_key || apiKey || '').trim();
        const sec = String(body.api_secret || apiSecret || '').trim();
        if (!key || !sec) return json({ error: 'Enter the SmugMug API key and secret.' }, 400);
        const rt = await oauthCall('getRequestToken', { key, secret: sec, extra: { oauth_callback: 'oob' } });
        if (!rt.oauth_token) return json({ error: 'SmugMug did not return a request token - check the key and secret.' }, 400);
        await putRow('smugmug', { ...conn, api_key: key, api_secret: sec });
        await putRow('smugmug_request', { token: rt.oauth_token, secret: rt.oauth_token_secret });
        const url = OAUTH + '/authorize?oauth_token=' + encodeURIComponent(rt.oauth_token) + '&Access=Full&Permissions=Read';
        return json({ ok: true, authorize_url: url });
      }
      // connect_finish
      const verifier = String(body.verifier || '').trim();
      if (!verifier) return json({ error: 'Enter the 6-digit code SmugMug showed you.' }, 400);
      const reqTok = await getRow('smugmug_request');
      if (!reqTok.token) return json({ error: 'Start the connection again - the approval request expired.' }, 400);
      const at = await oauthCall('getAccessToken', { key: apiKey, secret: apiSecret, token: reqTok.token, tokenSecret: reqTok.secret, extra: { oauth_verifier: verifier } });
      if (!at.oauth_token) return json({ error: 'SmugMug did not accept that code - start again.' }, 400);
      conn.access_token = at.oauth_token; conn.access_secret = at.oauth_token_secret;
      const me2 = await smug('/api/v2!authuser');
      const nickname = me2?.Response?.User?.NickName || '';
      await putRow('smugmug', { ...conn, nickname });
      await db.from('integration_secrets').delete().eq('name', 'smugmug_request');
      albumCache = null;
      return json({ ok: true, nickname });
    }

    if (!connected) return json({ error: 'SmugMug is not connected yet.', not_connected: true }, 409);
    const nick = conn.nickname;

    // ---------- albums ----------
    if (action === 'albums') {
      if (albumCache && Date.now() - albumCache.at < 5 * 60 * 1000 && !body.refresh) return json({ albums: albumCache.data, nickname: nick, cached: true });
      const out: unknown[] = [];
      let start = 1;
      for (let guard = 0; guard < 30; guard++) {
        const r = await smug('/api/v2/user/' + encodeURIComponent(nick) + '!albums', { start, count: PAGE, _expand: 'HighlightImage' });
        const list = r?.Response?.Album || [];
        for (const a of list) {
          const hi = expansion(r, a?.Uris?.HighlightImage?.Uri);
          const img = hi?.Image || hi?.AlbumImage || null;
          out.push({
            key: a.AlbumKey, name: a.Name || a.Title || 'Untitled', description: a.Description || '',
            path: a.UrlPath || '', url: a.WebUri || '', count: a.ImageCount ?? null,
            privacy: a.Privacy || 'Public', date: a.Date || null,
            updated: a.ImagesLastUpdated || a.LastUpdated || a.Date || null,
            cover: img ? resize(img.ThumbnailUrl, 'M') : null, cover_small: img?.ThumbnailUrl || null,
          });
        }
        const pages = r?.Response?.Pages;
        if (!pages?.NextPage || !list.length) break;
        start += list.length;
      }
      albumCache = { at: Date.now(), data: out };
      return json({ albums: out, nickname: nick });
    }

    // ---------- images in one album ----------
    if (action === 'images') {
      const key = String(body.album_key || '');
      if (!/^[A-Za-z0-9]+$/.test(key)) return json({ error: 'Bad album.' }, 400);
      const start = Math.max(1, Number(body.start) || 1);
      const [ar, ir] = await Promise.all([
        start === 1 ? smug('/api/v2/album/' + key) : Promise.resolve(null),
        smug('/api/v2/album/' + key + '!images', { start, count: PAGE, _expand: 'ImageSizes' }),
      ]);
      const a = ar?.Response?.Album;
      const images = (ir?.Response?.AlbumImage || []).map((im: any) => {
        const sz = expansion(ir, im?.Uris?.ImageSizes?.Uri)?.ImageSizes || {};
        const thumb = im.ThumbnailUrl;
        return {
          key: im.ImageKey, title: im.Title || '', caption: im.Caption || '', file: im.FileName || '',
          date: im.DateTimeOriginal || im.Date || null, video: !!im.IsVideo, url: im.WebUri || '',
          w: im.OriginalWidth || null, h: im.OriginalHeight || null,
          thumb: sz.SmallImageUrl || resize(thumb, 'S') || thumb,
          medium: sz.MediumImageUrl || resize(thumb, 'M') || thumb,
          large: sz.X2LargeImageUrl || sz.XLargeImageUrl || sz.LargeImageUrl || resize(thumb, 'XL') || thumb,
        };
      });
      const pages = ir?.Response?.Pages || {};
      return json({
        album: a ? { key: a.AlbumKey, name: a.Name || a.Title, description: a.Description || '', url: a.WebUri, count: a.ImageCount ?? null, privacy: a.Privacy || 'Public' } : null,
        images, next: pages.NextPage ? start + images.length : null, total: pages.Total ?? null,
      });
    }

    return json({ error: 'Unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || 'Server error.' }, 502);
  }
});
