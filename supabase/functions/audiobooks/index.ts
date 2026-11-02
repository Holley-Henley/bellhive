// bellhive99.com - audiobooks edge function (AUDIOBOOKS > Library, ADMIN > Settings)
//
// 1. Book lookup by Audible ASIN (Add Book). Details come from Audnexus (api.audnex.us), the
//    open audiobook-metadata service Audiobookshelf and Plex use; it reads Audible's catalog.
//      lookup { asin, region? } -> { book: { asin, title, ..., summary, file_guess } }
//
// 2. The Media connection: a READ-ONLY "Full Dropbox" app (Bellhive99_Media) that lets the
//    site reach Chris's own media folders. Every path is held to /_Media, so even though
//    Dropbox lets the app read the whole account, this function never looks anywhere else,
//    and the app has no write permission, so nothing in Dropbox can be changed or deleted.
//    Stored in integration_secrets: 'dropbox_media' (keys + refresh token) and
//    'media_settings' (which folders the Library uses). Browsers can't read that table.
//      media_status                         -> { connected, account?, settings?, is_admin }
//      media_connect_start { app_key, app_secret } / media_connect_finish { code } /
//      media_disconnect                     (admins)
//      media_settings_save { library_folder, mp3_folder, books_json } -> checks + saves (admins)
//      media_scan                           -> files in the Library folder no book links to,
//                                              with details from OpenAudible's books.json (admins)
//      media_links { id }                   -> short-lived (4 h) links to play / download a book
//                                              and its MP3 twin; any member who can see the book
//
// Deploy with "Verify JWT" OFF - the function checks the caller itself (signed-in, active member).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const REGIONS = ['us', 'ca', 'uk', 'au', 'fr', 'de', 'jp', 'it', 'in', 'es'];
const API = 'https://api.dropboxapi.com';
const CONTENT = 'https://content.dropboxapi.com';
const ROOT = '/_media';                       // the furthest the site may look (lower-case compare)
const AUDIO = /\.(m4b|mp3|m4a|aax|aac|ogg|flac|wav)$/i;
const DEFAULTS = {
  library_folder: '/_Media/Audiobooks/Audible_m4b/books',
  mp3_folder: '/_Media/Audiobooks/Audible_mp3/books',
  books_json: '/_Media/Audiobooks/Audible_m4b/books.json',
};
let tokenCache: { token: string; until: number; refresh: string } | null = null;

/* Audnexus summaries are HTML: keep the paragraphs, drop the tags. */
function htmlToText(html: string) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, ' • ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
/* "/_Media/Audiobooks/x/" -> "/_Media/Audiobooks/x"; null if it isn't safely inside /_Media */
function mediaPath(p: unknown): string | null {
  let s = String(p || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/');
  if (!s) return null;
  if (!s.startsWith('/')) s = '/' + s;
  s = s.replace(/\/$/, '');
  if (s.split('/').some((seg) => seg === '..' || seg === '.')) return null;
  const low = s.toLowerCase();
  return low === ROOT || low.startsWith(ROOT + '/') ? s : null;
}
const baseName = (p: string) => String(p || '').split('/').pop() || '';
const stem = (n: string) => n.replace(/\.[^.]+$/, '');
const numOrNull = (v: unknown) => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? null : n; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  let secret = '', anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  try { secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')['default'] || ''; } catch { /* fall back */ }
  try { anon = anon || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')['default'] || ''; } catch { /* fall back */ }
  if (!secret) secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!secret) return json({ error: 'Server keys are not configured.' }, 500);
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---- who is calling? ----
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Not signed in.' }, 401);
  const { data: who, error: whoErr } = await db.auth.getUser(jwt);
  if (whoErr || !who?.user) return json({ error: 'Not signed in.' }, 401);
  const uid = who.user.id;
  const { data: me } = await db.from('profiles').select('active, role, full_name, email').eq('id', uid).single();
  if (!me || !me.active) return json({ error: 'Account not active.' }, 403);
  const isAdmin = me.role === 'admin';
  // the caller's own session: row level security decides which books they may open
  const asUser = createClient(url, anon || secret, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + jwt } } });
  const audit = async (type: string, detail: string) => {
    const { error } = await db.from('audit_log').insert({
      user_id: uid, user_name: me.full_name || me.email, user_role: me.role, module: 'audiobooks',
      action_type: type, action_detail: detail, item_reference: null, source: 'server',
    });
    if (error) console.error('audit failed', error.message);
  };

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || '');

  // ---- the Media connection (Bellhive99_Media, read-only) ----
  const getRow = async (name: string) => {
    const { data } = await db.from('integration_secrets').select('data').eq('name', name).maybeSingle();
    return (data?.data || {}) as Record<string, string>;
  };
  const putRow = (name: string, data: Record<string, unknown>) =>
    db.from('integration_secrets').upsert({ name, data, updated_at: new Date().toISOString() });
  const conn = action.startsWith('media_') ? await getRow('dropbox_media') : {} as Record<string, string>;
  const connected = !!(conn.app_key && conn.app_secret && conn.refresh_token);
  const settings = async () => Object.assign({}, DEFAULTS, await getRow('media_settings')) as typeof DEFAULTS;

  async function oauthToken(form: Record<string, string>) {
    const r = await fetch(API + '/oauth2/token', { method: 'POST', body: new URLSearchParams(form) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Dropbox sign-in failed: ' + (j.error_description || j.error || r.status));
    return j;
  }
  async function accessToken() {
    if (tokenCache && tokenCache.refresh === conn.refresh_token && Date.now() < tokenCache.until) return tokenCache.token;
    const j = await oauthToken({ grant_type: 'refresh_token', refresh_token: conn.refresh_token, client_id: conn.app_key, client_secret: conn.app_secret });
    tokenCache = { token: j.access_token, until: Date.now() + (Number(j.expires_in || 14400) - 300) * 1000, refresh: conn.refresh_token };
    return j.access_token as string;
  }
  async function dbx(endpoint: string, args: unknown, tokenOverride?: string) {
    const token = tokenOverride || await accessToken();
    const r = await fetch(API + '/2/' + endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: args === null ? 'null' : JSON.stringify(args),
    });
    const text = await r.text();
    let j: any = null;
    try { j = JSON.parse(text); } catch { /* not json */ }
    if (!r.ok) {
      const e = new Error('Dropbox said ' + r.status + ': ' + ((j && (j.error_summary || j.error?.['.tag'])) || text.slice(0, 200)));
      (e as any).summary = j?.error_summary || '';
      throw e;
    }
    return j;
  }
  const notFound = (e: unknown) => /not_found/.test((e as any)?.summary || '');
  async function listFiles(folder: string) {
    const out: { name: string; path: string; size: number }[] = [];
    let page = await dbx('files/list_folder', { path: folder, recursive: false, limit: 2000 });
    for (;;) {
      for (const e of page.entries || []) if (e['.tag'] === 'file') out.push({ name: e.name, path: e.path_display, size: e.size });
      if (!page.has_more) break;
      page = await dbx('files/list_folder/continue', { cursor: page.cursor });
    }
    return out;
  }
  async function download(path: string) {
    const r = await fetch(CONTENT + '/2/files/download', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + await accessToken(), 'Dropbox-API-Arg': JSON.stringify({ path }).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) },
    });
    if (!r.ok) { const t = await r.text(); const e = new Error('Dropbox said ' + r.status + ': ' + t.slice(0, 200)); (e as any).summary = t; throw e; }
    return await r.text();
  }
  async function tempLink(path: string) {
    try {
      const j = await dbx('files/get_temporary_link', { path });
      return { url: j.link as string, name: j.metadata?.name as string, size: j.metadata?.size as number, path: j.metadata?.path_display as string };
    } catch (e) { if (notFound(e)) return null; throw e; }
  }

  try {
    // ================= book lookup =================
    if (action === 'lookup') {
      const asin = String(body.asin || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin)) return json({ error: 'That does not look like an Audible ASIN (10 letters/numbers, e.g. B0FXY6DVJS).' }, 400);
      const region = REGIONS.includes(String(body.region || 'us')) ? String(body.region || 'us') : 'us';
      const r = await fetch('https://api.audnex.us/books/' + asin + '?region=' + region, { headers: { 'User-Agent': 'bellhive99.com audiobooks' } });
      if (r.status === 404 || r.status === 400) return json({ error: 'Audible has no book with ASIN ' + asin + ' (' + region.toUpperCase() + ' store).' }, 404);
      if (!r.ok) return json({ error: 'The book lookup service answered ' + r.status + '. Try again in a minute.' }, 502);
      const a: any = await r.json();
      const names = (list: any[]) => (Array.isArray(list) ? list.map((x) => x && x.name).filter(Boolean).join(', ') : '');
      const genres = Array.isArray(a.genres) ? a.genres : [];
      const g1 = genres.find((x: any) => x.type === 'genre');
      const t1 = genres.find((x: any) => x.type === 'tag' && x.name !== (g1 && g1.name) && x.name !== 'Genre Fiction');
      const title = String(a.title || '').trim();
      const subtitle = String(a.subtitle || '').trim();
      const full = subtitle ? title + ' - ' + subtitle : title;
      return json({ book: {
        asin,
        title: full,
        subtitle,
        authors: names(a.authors),
        narrators: names(a.narrators),
        series_name: a.seriesPrimary?.name || null,
        series_seq: a.seriesPrimary?.position ? String(a.seriesPrimary.position) : null,
        genre: g1 ? g1.name + (t1 ? ':' + t1.name : '') : null,
        publisher: a.publisherName || null,
        release_date: a.releaseDate ? String(a.releaseDate).slice(0, 10) : null,
        duration_seconds: a.runtimeLengthMin ? Number(a.runtimeLengthMin) * 60 : null,
        rating: a.rating ? Number(a.rating) : null,
        language: a.language || null,
        abridged: a.formatType ? a.formatType === 'abridged' : null,
        cover_url: a.image || null,
        summary: htmlToText(a.summary || a.description || '') || null,
        // OpenAudible names files "<Title> - <Subtitle>.m4b" with ':' turned into '-'
        file_guess: full.replace(/:/g, '-').replace(/[\\/*?"<>|]/g, '').trim() + '.m4b',
      } });
    }

    // ================= Media connection: status =================
    if (action === 'media_status') {
      const out: Record<string, unknown> = { connected, is_admin: isAdmin };
      if (isAdmin) {
        out.has_key = !!(conn.app_key && conn.app_secret);
        out.account = conn.account_name || null;
        out.settings = await settings();
      }
      return json(out);
    }

    // ================= Media connection: connect / disconnect (admins) =================
    if (action === 'media_connect_start' || action === 'media_connect_finish' || action === 'media_disconnect') {
      if (!isAdmin) return json({ error: 'Admins only.' }, 403);
      if (action === 'media_disconnect') {
        await db.from('integration_secrets').delete().eq('name', 'dropbox_media');
        tokenCache = null;
        await audit('media_disconnect', 'disconnected the Media Dropbox' + (conn.account_name ? ' (' + conn.account_name + ')' : ''));
        return json({ ok: true });
      }
      if (action === 'media_connect_start') {
        const key = String(body.app_key || '').trim() || conn.app_key || '';
        const sec = String(body.app_secret || '').trim() || conn.app_secret || '';
        if (!key || !sec) return json({ error: 'Enter the Dropbox App key and App secret.' }, 400);
        await putRow('dropbox_media', { app_key: key, app_secret: sec });
        const link = 'https://www.dropbox.com/oauth2/authorize?client_id=' + encodeURIComponent(key) + '&response_type=code&token_access_type=offline';
        return json({ ok: true, authorize_url: link });
      }
      const code = String(body.code || '').trim();
      if (!code) return json({ error: 'Paste the access code Dropbox showed you.' }, 400);
      if (!conn.app_key || !conn.app_secret) return json({ error: 'Start the connection again - the app key is missing.' }, 400);
      const t = await oauthToken({ grant_type: 'authorization_code', code, client_id: conn.app_key, client_secret: conn.app_secret });
      if (!t.refresh_token) return json({ error: 'Dropbox did not return a long-lived token - start again.' }, 400);
      let account = '';
      try {
        const a = await dbx('users/get_current_account', null, t.access_token);
        account = a?.name?.display_name ? a.name.display_name + (a.email ? ' (' + a.email + ')' : '') : (a?.email || '');
      } catch { /* scope not granted - fine */ }
      // refuse an app that can write: this connection must be read-only
      const scopes = String(t.scope || '');
      if (/files\.content\.write|files\.permanent_delete|sharing\.write/.test(scopes)) {
        await putRow('dropbox_media', { app_key: conn.app_key, app_secret: conn.app_secret });
        return json({ error: 'This Dropbox app has write permission (' + scopes + '). Untick every write permission on its Permissions tab, click Submit, then connect again.' }, 400);
      }
      await putRow('dropbox_media', { app_key: conn.app_key, app_secret: conn.app_secret, refresh_token: t.refresh_token, account_name: account, scopes });
      tokenCache = null;
      await audit('media_connect', 'connected the Media Dropbox' + (account ? ' (' + account + ')' : ''));
      return json({ ok: true, account });
    }

    // ================= folder settings (admins) =================
    if (action === 'media_settings_save') {
      if (!isAdmin) return json({ error: 'Admins only.' }, 403);
      const next: Record<string, string> = {};
      const labels: Record<string, string> = { library_folder: 'Library folder', mp3_folder: 'MP3 folder', books_json: 'OpenAudible books.json' };
      for (const k of Object.keys(labels)) {
        const raw = String(body[k] ?? '').trim();
        if (!raw) { if (k === 'library_folder') return json({ error: 'The Library folder is required.' }, 400); next[k] = ''; continue; }
        const p = mediaPath(raw);
        if (!p) return json({ error: labels[k] + ' must be inside /_Media (for example ' + (DEFAULTS as any)[k] + ').' }, 400);
        next[k] = p;
      }
      const check: Record<string, string> = {};
      if (connected) {
        for (const k of ['library_folder', 'mp3_folder']) {
          if (!next[k]) continue;
          try { const f = await listFiles(next[k]); check[k] = f.filter((x) => AUDIO.test(x.name)).length + ' audio files'; }
          catch (e) { return json({ error: labels[k] + ': ' + (notFound(e) ? 'Dropbox has no folder ' + next[k] : (e as Error).message) }, 400); }
        }
        if (next.books_json) {
          try { const m = await dbx('files/get_metadata', { path: next.books_json }); check.books_json = m['.tag'] === 'file' ? 'found' : 'not a file'; }
          catch (e) { return json({ error: 'OpenAudible books.json: ' + (notFound(e) ? 'Dropbox has no file ' + next.books_json : (e as Error).message) }, 400); }
        }
      }
      await putRow('media_settings', next);
      await audit('media_settings', 'Library folder ' + next.library_folder + '; MP3 folder ' + (next.mp3_folder || 'none'));
      return json({ ok: true, settings: next, check });
    }

    if (!connected) return json({ error: 'The Media Dropbox connection is not set up yet. An admin can connect it on ADMIN › Settings.', not_connected: true }, 409);

    // ================= scan the Library folder (admins) =================
    if (action === 'media_scan') {
      if (!isAdmin) return json({ error: 'Admins only.' }, 403);
      const s = await settings();
      const lib = mediaPath(s.library_folder);
      if (!lib) return json({ error: 'The Library folder setting is not inside /_Media.' }, 400);
      const files = (await listFiles(lib)).filter((f) => AUDIO.test(f.name));
      // what the caller's Library already links to (by Dropbox path, then by file name in that folder)
      const { data: rows, error } = await asUser.from('audiobooks').select('dropbox_path, m4b_file, mp3_file').eq('owner_id', uid);
      if (error) throw error;
      const linked = new Set<string>();
      for (const r of rows || []) {
        if (r.dropbox_path) linked.add(String(r.dropbox_path).toLowerCase());
        for (const n of [r.m4b_file, r.mp3_file]) if (n) linked.add((lib + '/' + n).toLowerCase());
      }
      const loose = files.filter((f) => !linked.has(f.path.toLowerCase()));
      // OpenAudible's own catalog (books.json) knows the Audible details for every file it made
      const byFile = new Map<string, any>();
      let catalog = 'none';
      const bj = mediaPath(s.books_json);
      if (bj && loose.length) {
        try {
          const list = JSON.parse(await download(bj));
          if (Array.isArray(list)) {
            catalog = list.length + ' books';
            for (const b of list) {
              const names = new Set<string>();
              for (const f of Array.isArray(b.files) ? b.files : []) if (f && f.kind === 'audio' && f.path) names.add(baseName(String(f.path)).toLowerCase());
              if (b.filename) names.add(String(b.filename).toLowerCase());
              for (const n of names) if (!byFile.has(n)) byFile.set(n, b);
            }
          }
        } catch (e) { catalog = 'unreadable: ' + (notFound(e) ? 'not found' : (e as Error).message); }
      }
      const items = loose.map((f) => {
        const b = byFile.get(f.name.toLowerCase()) || byFile.get(stem(f.name).toLowerCase());
        const book = b ? {
          key: b.key || b.product_id || null, asin: b.asin || null,
          title: b.title || stem(f.name), authors: b.author || null, narrators: b.narrated_by || null,
          series_name: b.series_name || null, series_seq: b.series_sequence ? String(b.series_sequence) : null,
          genre: b.genre || null, publisher: b.publisher || null,
          release_date: /^\d{4}-\d\d-\d\d/.test(b.release_date || '') ? String(b.release_date).slice(0, 10) : null,
          purchase_date: /^\d{4}-\d\d-\d\d/.test(b.purchase_date || '') ? String(b.purchase_date).slice(0, 10) : null,
          duration_seconds: Number(b.seconds) || null,
          rating: numOrNull(b.rating_average) != null ? Math.round(numOrNull(b.rating_average)! * 100) / 100 : null,
          rating_count: numOrNull(b.rating_count) != null ? Math.round(numOrNull(b.rating_count)!) : null,
          abridged: b.abridged == null ? null : String(b.abridged) === 'true',
          language: b.language || null,
          description: b.description || null,
          summary: htmlToText(b.summary || '') || null,
          cover_url: /^https?:\/\//.test(b.image_url || '') ? b.image_url : null,
          finished: /finished/i.test(String(b.read_status || '')) || String(b.finished) === 'true',
        } : null;
        return { name: f.name, path: f.path, size: f.size, book };
      });
      return json({ folder: lib, total: files.length, linked: files.length - loose.length, catalog, items });
    }

    // ================= play / download links (any member who can see the book) =================
    if (action === 'media_links') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Unknown book.' }, 400);
      const { data: b, error } = await asUser.from('audiobooks').select('id, dropbox_path, m4b_file, mp3_file').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!b) return json({ error: 'That book is not in a Library you can see.' }, 404);
      const s = await settings();
      const main = mediaPath(b.dropbox_path);
      const out: Record<string, unknown> = { play: null, mp3: null };
      if (main) out.play = await tempLink(main);
      const mp3Dir = mediaPath(s.mp3_folder);
      const name = baseName(main || '') || b.m4b_file || b.mp3_file || '';
      if (mp3Dir && name && !/\.mp3$/i.test(name)) out.mp3 = await tempLink(mp3Dir + '/' + stem(name) + '.mp3');
      else if (main && /\.mp3$/i.test(main)) out.mp3 = out.play;
      return json(out);
    }

    return json({ error: 'Unknown action: ' + action }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Something went wrong.' }, 500);
  }
});
