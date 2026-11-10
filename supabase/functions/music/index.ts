// bellhive99.com - music edge function (MUSIC > Library, ADMIN > Settings > Music)
//
// Uses the same read-only Media Dropbox connection as the audiobooks function
// (integration_secrets 'dropbox_media', set up on ADMIN > Settings). Every path is held to
// /_Media; nothing in Dropbox is ever changed. Its own settings row: 'music_settings'.
//
//   status                                -> { connected, is_admin, settings? }
//   settings_save { music_folder }        -> checks + saves (admins)
//   scan                                  -> lists the music folder (all sub folders), drops rows for
//                                            files that are gone, saves the cover pictures it finds,
//                                            and returns the files that are new or changed (admins)
//   index { files: [{path, size, hash, modified}] } (<= 25)
//                                         -> reads each file's tags (falls back to folder / file
//                                            names) and saves the rows (admins)
//   link { id }                           -> short-lived (4 h) link to play / download one track
//   art_links { paths: [] } (<= 60)       -> short-lived links to cover pictures in the folders
//   art { track_id }                      -> the picture embedded in a file (image bytes)
//   mb_search { artist, album }           -> MusicBrainz releases that could be this album (admins)
//   mb_apply { album_key, release_id }    -> saves the match + Cover Art Archive cover, fills in
//                                            titles for tracks that had no tags (admins)
//   mb_auto { album_key, artist, album, tracks } -> search and apply only a near-certain match (admins)
//   mb_clear { album_key }                -> forget the match (admins)
// Members (Music > Library switched on) can use link / art_links / art; row level security
// on the caller's own session decides what they can see.
//
// MusicBrainz asks apps to identify themselves; set the MUSICBRAINZ_CONTACT secret
// (an email or URL) on the function to add it to the User-Agent. Keep to ~1 request a second.
//
// Deploy with "Verify JWT" OFF - the function checks the caller itself. Files: index.ts, tags.ts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { readTags, type Reader } from './tags.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const API = 'https://api.dropboxapi.com';
const CONTENT = 'https://content.dropboxapi.com';
const ROOT = '/_media';
const AUDIO = /\.(mp3|mp2|flac|m4a|mp4|aac|alac|ogg|oga|opus|wav|aif|aiff|aifc|wma|ape|wv|mpc|dsf|dff|tak)$/i;
const IMAGE = /\.(jpe?g|png|webp|gif)$/i;
const DEFAULTS = { music_folder: '/_Media/Music/Music' };
const MB = 'https://musicbrainz.org/ws/2/';
let tokenCache: { token: string; until: number; refresh: string } | null = null;

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
const dirName = (p: string) => String(p || '').replace(/\/[^/]*$/, '');
const stem = (n: string) => n.replace(/\.[^.]+$/, '');
const extOf = (n: string) => (n.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
const norm = (s: unknown) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
/* for comparing names: no accents, no punctuation, no leading "the" */
const loose = (s: unknown) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&/g, 'and').replace(/^the\s+/, '').replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/[^a-z0-9]+/g, '');
const intOrNull = (v: unknown, max = 100000) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 && n < max ? n : null; };
const DISC_DIR = /^(cd|disc|disk|part)\s*[-_.]?\s*\d+\b/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/* Dropbox-API-Arg must be ASCII */
const apiArg = (o: unknown) => JSON.stringify(o).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

/* Folder and file names -> details, for files without tags.
   .../Artist/Album (1999)/CD1/01 - Title.flac,  .../Artist - Album/03. Title.mp3,  .../Artist - Title.mp3 */
function fromPath(path: string, root: string) {
  const rel = path.slice(root.length).replace(/^\/+/, '');
  const folders = rel.split('/');
  const name = stem(folders.pop() || '');
  const out: Record<string, string | number | null> = { title: null, artist: null, album: null, track_no: null, disc_no: null, year: null };
  if (folders.length && DISC_DIR.test(folders[folders.length - 1])) out.disc_no = intOrNull(folders.pop()!.match(/\d+/)?.[0]);
  let album = folders.length ? folders[folders.length - 1] : null;
  let artist = folders.length >= 2 ? folders[folders.length - 2] : null;
  if (album) {
    const y = album.match(/[([]\s*((?:19|20)\d\d)\s*[)\]]/) || album.match(/^((?:19|20)\d\d)\s*[-.]\s+/);
    if (y) { out.year = +y[1]; album = album.replace(y[0], ' ').trim(); }
    const dash = album.split(/\s+-\s+/);
    if (dash.length === 2 && (!artist || folders.length < 2)) { artist = dash[0]; album = dash[1]; }
  }
  let rest = name;
  const m = name.match(/^(?:(\d{1,2})[-.](?=\d))?(0\d|\d{1,3}(?=\s*[-._)]))\s*[-._)]?\s*(.+)$/);
  if (m) { if (m[1]) out.disc_no = intOrNull(m[1]); out.track_no = intOrNull(m[2]); rest = m[3]; }
  const parts = rest.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3 && !m) {
    // "Artist - Album - 01 - Title" or "Artist - Album - Title"
    const tn = parts.findIndex((p) => /^\d{1,3}$/.test(p));
    if (tn >= 0) { out.track_no = intOrNull(parts[tn]); parts.splice(tn, 1); }
    artist = parts[0]; if (!album) album = parts[1]; rest = parts.slice(2).join(' - ') || parts[parts.length - 1];
  } else if (parts.length === 2) { if (!artist || !m) artist = parts[0]; rest = parts[1]; }
  else if (parts.length >= 3) { artist = artist || parts[0]; rest = parts[parts.length - 1]; }
  out.title = rest.replace(/_/g, ' ').trim() || name;
  out.artist = artist; out.album = album;
  return out;
}
/* Tracks with the same album-artist + album are one album wherever they sit; without an
   album-artist, an album is one folder (CD1 / Disc 2 sub folders count as their parent). */
function albumKey(path: string, album: string | null, albumArtist: string | null, rootLower: string) {
  let dir = dirName(path);
  if (DISC_DIR.test(baseName(dir)) && dir.toLowerCase() !== rootLower) dir = dirName(dir);
  if (album && albumArtist) return 'a:' + norm(albumArtist) + '|' + norm(album);
  return 'f:' + dir.toLowerCase() + '|' + norm(album);
}
/* the best picture in a folder: cover / folder / front first, small thumbnails last */
function artScore(name: string) {
  const n = name.toLowerCase();
  if (/^(cover|folder|front)\./.test(n)) return 0;
  if (/^(cover|folder|front)/.test(n)) return 1;
  if (/albumart.*large/.test(n)) return 2;
  if (/back|cd|disc|inlay|inside|booklet|small/.test(n)) return 8;
  return 5;
}

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
  const asUser = createClient(url, anon || secret, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + jwt } } });
  const audit = async (type: string, detail: string) => {
    const { error } = await db.from('audit_log').insert({
      user_id: uid, user_name: me.full_name || me.email, user_role: me.role, module: 'music',
      action_type: type, action_detail: detail.slice(0, 500), item_reference: null, source: 'server',
    });
    if (error) console.error('audit failed', error.message);
  };

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || '');
  const adminOnly = () => json({ error: 'Admins only.' }, 403);

  // ---- settings + the Media connection ----
  const getRow = async (name: string) => {
    const { data } = await db.from('integration_secrets').select('data').eq('name', name).maybeSingle();
    return (data?.data || {}) as Record<string, string>;
  };
  const conn = await getRow('dropbox_media');
  const connected = !!(conn.app_key && conn.app_secret && conn.refresh_token);
  const settings = async () => Object.assign({}, DEFAULTS, await getRow('music_settings')) as typeof DEFAULTS;

  async function accessToken() {
    if (tokenCache && tokenCache.refresh === conn.refresh_token && Date.now() < tokenCache.until) return tokenCache.token;
    const r = await fetch(API + '/oauth2/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token, client_id: conn.app_key, client_secret: conn.app_secret }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Dropbox sign-in failed: ' + (j.error_description || j.error || r.status));
    tokenCache = { token: j.access_token, until: Date.now() + (Number(j.expires_in || 14400) - 300) * 1000, refresh: conn.refresh_token };
    return j.access_token as string;
  }
  async function dbx(endpoint: string, args: unknown) {
    const r = await fetch(API + '/2/' + endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
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
  async function tempLink(path: string) {
    try { const j = await dbx('files/get_temporary_link', { path }); return { url: j.link as string, name: j.metadata?.name as string, size: j.metadata?.size as number }; }
    catch (e) { if (notFound(e)) return null; throw e; }
  }
  /* Reads byte ranges of a Dropbox file on demand (64 KB blocks), so tags are read without downloading songs. */
  async function reader(path: string, size: number): Promise<Reader> {
    const token = await accessToken();
    const B = 65536;
    const blocks = new Map<number, Uint8Array>();
    async function range(s: number, e: number) {
      const r = await fetch(CONTENT + '/2/files/download', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Dropbox-API-Arg': apiArg({ path }), Range: 'bytes=' + s + '-' + e } });
      if (r.status !== 206 && r.status !== 200) { const t = await r.text(); throw new Error('Dropbox said ' + r.status + ': ' + t.slice(0, 160)); }
      if (r.status === 206) return new Uint8Array(await r.arrayBuffer());
      // the server ignored Range: read only as far as needed, then stop the download
      const want = e + 1, out = new Uint8Array(want);
      let got = 0;
      const rd = r.body!.getReader();
      while (got < want) { const { done, value } = await rd.read(); if (done) break; const n = Math.min(value.length, want - got); out.set(value.subarray(0, n), got); got += n; }
      rd.cancel().catch(() => {});
      return out.subarray(s, got);
    }
    return {
      size,
      async get(off: number, len: number) {
        if (off < 0) { len += off; off = 0; }
        if (off >= size || len <= 0) return new Uint8Array(0);
        len = Math.min(len, size - off);
        const first = Math.floor(off / B), last = Math.floor((off + len - 1) / B);
        for (let k = first; k <= last;) {
          if (blocks.has(k)) { k++; continue; }
          let j = k;
          while (j + 1 <= last && !blocks.has(j + 1)) j++;
          const buf = await range(k * B, Math.min(size - 1, (j + 1) * B - 1));
          for (let q = k; q <= j; q++) blocks.set(q, buf.subarray((q - k) * B, Math.min(buf.length, (q - k + 1) * B)));
          k = j + 1;
        }
        if (first === last) { const b = blocks.get(first)!; return b.subarray(off - first * B, off - first * B + len); }
        const out = new Uint8Array(len);
        let w = 0;
        for (let q = first; q <= last; q++) {
          const b = blocks.get(q)!;
          const s = q === first ? off - first * B : 0, e = q === last ? off + len - q * B : b.length;
          out.set(b.subarray(s, e), w); w += e - s;
        }
        return out;
      },
    };
  }
  /* run fn over items, n at a time */
  async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
    const out: R[] = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
    return out;
  }
  /* MusicBrainz */
  const contact = Deno.env.get('MUSICBRAINZ_CONTACT') || '';
  async function mb(path: string) {
    const r = await fetch(MB + path + (path.includes('?') ? '&' : '?') + 'fmt=json', {
      headers: { 'User-Agent': 'bellhive99-music/1.0' + (contact ? ' ( ' + contact + ' )' : ''), Accept: 'application/json' },
    });
    if (r.status === 503) throw new Error('MusicBrainz is busy right now - try again in a moment.');
    if (!r.ok) throw new Error('MusicBrainz said ' + r.status);
    return await r.json();
  }
  const credit = (ac: any[] | undefined) => (ac || []).map((x) => (x.name || x.artist?.name || '') + (x.joinphrase || '')).join('').trim();
  const phrase = (s: string) => '"' + String(s).replace(/["\\]/g, ' ').trim() + '"';
  async function mbSearch(artist: string, album: string) {
    let q = 'release:' + phrase(album);
    if (artist && !/^various( artists)?$/i.test(artist)) q += ' AND artist:' + phrase(artist);
    const j = await mb('release/?limit=12&query=' + encodeURIComponent(q));
    return (j.releases || []).map((r: any) => ({
      id: r.id, title: r.title, score: r.score, artist: credit(r['artist-credit']), date: r.date || '', country: r.country || '',
      tracks: r['track-count'] ?? null, formats: Array.from(new Set((r.media || []).map((m: any) => m.format).filter(Boolean))).join(' + '),
      group_id: r['release-group']?.id || null, type: r['release-group']?.['primary-type'] || '', status: r.status || '',
    }));
  }
  async function mbApply(key: string, releaseId: string) {
    const rel = await mb('release/' + encodeURIComponent(releaseId) + '?inc=recordings+artist-credits+release-groups+genres');
    const gid = rel['release-group']?.id || null;
    const year = parseInt(String(rel.date || rel['release-group']?.['first-release-date'] || '').slice(0, 4)) || null;
    const genres = (rel.genres || []).slice().sort((a: any, b: any) => (b.count || 0) - (a.count || 0)).slice(0, 2).map((g: any) => g.name);
    const cover = rel['cover-art-archive']?.front ? 'https://coverartarchive.org/release/' + rel.id + '/front-500'
      : gid ? 'https://coverartarchive.org/release-group/' + gid + '/front-500' : null;
    const row = {
      album_key: key, mb_status: 'matched', mb_release_id: rel.id, mb_release_group_id: gid, mb_title: rel.title,
      mb_artist: credit(rel['artist-credit']), mb_year: year, mb_genre: genres.join('; ') || null, cover_url: cover,
      checked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const { error } = await db.from('music_albums').upsert(row, { onConflict: 'album_key' });
    if (error) throw error;
    // tracks that had no tags: take titles from the release by disc + track number
    const { data: tracks, error: te } = await db.from('music_tracks').select('id, track_no, disc_no, tag_source').eq('album_key', key);
    if (te) throw te;
    const byPos = new Map<string, any>();
    (rel.media || []).forEach((m: any, mi: number) => (m.tracks || []).forEach((tk: any) => byPos.set((m.position || mi + 1) + '|' + tk.position, tk)));
    let filled = 0;
    for (const tr of tracks || []) {
      if (tr.tag_source === 'tags' || !tr.track_no) continue;
      const tk = byPos.get((tr.disc_no || 1) + '|' + tr.track_no);
      if (!tk) continue;
      const { error: ue } = await db.from('music_tracks').update({
        title: tk.title, artist: credit(tk['artist-credit']) || row.mb_artist, year: year, tag_source: 'online',
      }).eq('id', tr.id);
      if (!ue) filled++;
    }
    return { album: row, filled };
  }

  try {
    // ================= status / settings =================
    if (action === 'status') {
      const out: Record<string, unknown> = { connected, is_admin: isAdmin };
      if (isAdmin) out.settings = await settings();
      return json(out);
    }
    if (action === 'settings_save') {
      if (!isAdmin) return adminOnly();
      const p = mediaPath(body.music_folder);
      if (!p) return json({ error: 'The Music folder must be inside /_Media (for example ' + DEFAULTS.music_folder + ').' }, 400);
      let check = '';
      if (connected) {
        try { const m = await dbx('files/get_metadata', { path: p }); if (m['.tag'] !== 'folder') return json({ error: p + ' is not a folder.' }, 400); check = 'found'; }
        catch (e) { return json({ error: notFound(e) ? 'Dropbox has no folder ' + p : (e as Error).message }, 400); }
      }
      const { error } = await db.from('integration_secrets').upsert({ name: 'music_settings', data: { music_folder: p }, updated_at: new Date().toISOString() });
      if (error) throw error;
      await audit('music_settings', 'Music folder ' + p);
      return json({ ok: true, settings: { music_folder: p }, check });
    }

    // ================= MusicBrainz (admins; no Dropbox needed) =================
    if (action.startsWith('mb_')) {
      if (!isAdmin) return adminOnly();
      const key = String(body.album_key || '');
      if (action === 'mb_search') {
        if (!String(body.album || '').trim()) return json({ error: 'Type the album name to search for.' }, 400);
        return json({ releases: await mbSearch(String(body.artist || ''), String(body.album || '')) });
      }
      if (!key) return json({ error: 'Which album?' }, 400);
      if (action === 'mb_apply') {
        const id = String(body.release_id || '');
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Unknown release.' }, 400);
        const r = await mbApply(key, id);
        await audit('music_match', 'Matched ' + (r.album.mb_artist || '') + ' - ' + (r.album.mb_title || '') + ' (MusicBrainz ' + id + ')');
        return json(r);
      }
      if (action === 'mb_clear') {
        const { error } = await db.from('music_albums').delete().eq('album_key', key);
        if (error) throw error;
        return json({ ok: true });
      }
      if (action === 'mb_auto') {
        const album = String(body.album || ''), artist = String(body.artist || ''), count = intOrNull(body.tracks);
        const mark = (status: 'none') => db.from('music_albums').upsert({ album_key: key, mb_status: status, checked_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'album_key' });
        if (!album) { await mark('none'); return json({ matched: false }); }
        const list = await mbSearch(artist, album);
        const various = !artist || /^various( artists)?$/i.test(artist);
        const fits = list.filter((r: any) => r.score >= 90 && loose(r.title) === loose(album)
          && (various || loose(r.artist) === loose(artist) || loose(r.artist).includes(loose(artist)))
          && (!count || r.tracks == null || Math.abs(r.tracks - count) <= 1));
        fits.sort((a: any, b: any) => (count ? Math.abs((a.tracks ?? count) - count) - Math.abs((b.tracks ?? count) - count) : 0)
          || (b.status === 'Official' ? 1 : 0) - (a.status === 'Official' ? 1 : 0) || b.score - a.score);
        if (!fits.length) { await mark('none'); return json({ matched: false }); }
        await sleep(1100);                           // MusicBrainz: about one request a second
        const r = await mbApply(key, fits[0].id);
        return json({ matched: true, ...r });
      }
      return json({ error: 'Unknown action: ' + action }, 400);
    }

    if (!connected) return json({ error: 'The Media Dropbox connection is not set up yet. An admin can connect it on ADMIN › Settings.', not_connected: true }, 409);

    // ================= scan: what is in the music folder? (admins) =================
    if (action === 'scan') {
      if (!isAdmin) return adminOnly();
      const root = mediaPath((await settings()).music_folder);
      if (!root) return json({ error: 'The Music folder setting is not inside /_Media.' }, 400);
      const files: { path: string; path_lower: string; size: number; hash: string; modified: string }[] = [];
      const pics = new Map<string, { folder: string; art: string; score: number }>();
      let page: any;
      try { page = await dbx('files/list_folder', { path: root, recursive: true, limit: 2000 }); }
      catch (e) { if (notFound(e)) return json({ error: 'Dropbox has no folder ' + root + '. Check ADMIN › Settings › Music.' }, 400); throw e; }
      for (;;) {
        for (const e of page.entries || []) {
          if (e['.tag'] !== 'file') continue;
          if (AUDIO.test(e.name)) files.push({ path: e.path_display, path_lower: e.path_lower, size: e.size, hash: e.content_hash || '', modified: e.server_modified || e.client_modified || null });
          else if (IMAGE.test(e.name)) {
            const fl = dirName(e.path_lower), score = artScore(e.name), cur = pics.get(fl);
            if (!cur || score < cur.score) pics.set(fl, { folder: dirName(e.path_display), art: e.path_display, score });
          }
        }
        if (!page.has_more) break;
        page = await dbx('files/list_folder/continue', { cursor: page.cursor });
      }
      // what is already saved
      const have = new Map<string, string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from('music_tracks').select('path_lower, content_hash').order('path_lower').range(from, from + 999);
        if (error) throw error;
        for (const r of data || []) have.set(r.path_lower, r.content_hash || '');
        if (!data || data.length < 1000) break;
      }
      const seen = new Set(files.map((f) => f.path_lower));
      const gone = [...have.keys()].filter((k) => !seen.has(k));
      for (let i = 0; i < gone.length; i += 200) {
        const { error } = await db.from('music_tracks').delete().in('path_lower', gone.slice(i, i + 200));
        if (error) throw error;
      }
      const todo = files.filter((f) => have.get(f.path_lower) !== f.hash || !have.has(f.path_lower))
        .map((f) => ({ path: f.path, size: f.size, hash: f.hash, modified: f.modified }));
      // cover pictures: replace the whole list
      const picRows = [...pics.entries()].map(([k, v]) => ({ folder_lower: k, folder: v.folder, art_path: v.art }));
      const { error: de } = await db.from('music_folders').delete().neq('folder_lower', '');
      if (de) throw de;
      for (let i = 0; i < picRows.length; i += 500) {
        const { error } = await db.from('music_folders').insert(picRows.slice(i, i + 500));
        if (error) throw error;
      }
      await audit('music_scan', 'Scanned ' + root + ': ' + files.length + ' files, ' + todo.length + ' new or changed, ' + gone.length + ' removed');
      return json({ folder: root, files: files.length, unchanged: files.length - todo.length, removed: gone.length, pictures: picRows.length, todo });
    }

    // ================= index: read tags + save (admins) =================
    if (action === 'index') {
      if (!isAdmin) return adminOnly();
      const root = mediaPath((await settings()).music_folder)!;
      const list = (Array.isArray(body.files) ? body.files : []).slice(0, 25) as any[];
      const failed: { path: string; error: string }[] = [];
      const rows = await pool(list, 5, async (f) => {
        const path = mediaPath(f.path);
        if (!path || !path.toLowerCase().startsWith(root.toLowerCase() + '/')) { failed.push({ path: String(f.path), error: 'outside the music folder' }); return null; }
        const ext = extOf(path), size = Number(f.size) || 0;
        let tags: Awaited<ReturnType<typeof readTags>> = {};
        try { tags = await readTags(await reader(path, size), ext); } catch (e) { tags = { error: (e as Error).message }; }
        if (tags.error && !tags.title) failed.push({ path, error: tags.error });
        const fn = fromPath(path, root);
        const album = tags.album || (fn.album as string) || null;
        const albumArtist = tags.album_artist || null;
        return {
          path, path_lower: path.toLowerCase(), content_hash: String(f.hash || '') || null, size: size || null, modified: f.modified || null, ext,
          title: tags.title || (fn.title as string) || stem(baseName(path)),
          artist: tags.artist || (fn.artist as string) || albumArtist,
          album_artist: albumArtist, album,
          track_no: intOrNull(tags.track_no ?? fn.track_no, 10000), track_total: intOrNull(tags.track_total, 10000),
          disc_no: intOrNull(tags.disc_no ?? fn.disc_no, 1000), disc_total: intOrNull(tags.disc_total, 1000),
          year: intOrNull(tags.year ?? fn.year, 3000), genre: tags.genre || null, composer: tags.composer || null,
          duration_seconds: tags.duration_seconds && Number.isFinite(tags.duration_seconds) && tags.duration_seconds < 1e7 ? Math.round(tags.duration_seconds * 100) / 100 : null,
          bitrate: intOrNull(tags.bitrate, 100000), sample_rate: intOrNull(tags.sample_rate, 10000000), bits: intOrNull(tags.bits, 65), channels: intOrNull(tags.channels, 65),
          has_art: !!tags.has_art, album_key: albumKey(path, album, albumArtist, root.toLowerCase()),
          tag_source: tags.title ? 'tags' : 'filename', indexed_at: new Date().toISOString(),
        };
      });
      const good = rows.filter(Boolean);
      if (good.length) {
        const { error } = await db.from('music_tracks').upsert(good, { onConflict: 'path_lower' });
        if (error) throw error;
      }
      return json({ done: good.length, failed });
    }

    // ================= play / download / covers (members who can see the music) =================
    if (action === 'link') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Unknown track.' }, 400);
      const { data: t, error } = await asUser.from('music_tracks').select('path').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!t) return json({ error: 'That song is not in a library you can see.' }, 404);
      const p = mediaPath(t.path);
      const link = p ? await tempLink(p) : null;
      if (!link) return json({ error: 'The file is no longer in Dropbox - an admin can run Scan Dropbox.' }, 404);
      return json(link);
    }
    if (action === 'art_links') {
      const paths = (Array.isArray(body.paths) ? body.paths : []).map(String).slice(0, 60);
      if (!paths.length) return json({ links: {} });
      const { data, error } = await asUser.from('music_folders').select('art_path').in('art_path', paths);
      if (error) throw error;
      const links: Record<string, string | null> = {};
      await pool((data || []).map((r) => r.art_path as string), 8, async (p) => {
        const mp = mediaPath(p);
        try { links[p] = mp ? (await tempLink(mp))?.url || null : null; } catch { links[p] = null; }
      });
      return json({ links });
    }
    if (action === 'art') {
      const id = String(body.track_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Unknown track.' }, 400);
      const { data: t, error } = await asUser.from('music_tracks').select('path, ext, size, has_art').eq('id', id).maybeSingle();
      if (error) throw error;
      const p = t && t.has_art ? mediaPath(t.path) : null;
      if (!p) return json({ error: 'No picture.' }, 404);
      const tags = await readTags(await reader(p, Number(t!.size) || 0), t!.ext || extOf(p), true);
      if (!tags.picture || tags.picture.data.length > 8 << 20) return json({ error: 'No picture.' }, 404);
      return new Response(tags.picture.data, { headers: { ...cors, 'Content-Type': tags.picture.mime, 'Cache-Control': 'private, max-age=86400' } });
    }

    return json({ error: 'Unknown action: ' + action }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || (e as any)?.message || 'Something went wrong.' }, 500);
  }
});
