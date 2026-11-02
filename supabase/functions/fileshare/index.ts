// bellhive99.com - fileshare edge function (File Share page)
//
// Files live in Dropbox, in this site's own app folder (Dropbox/Apps/<app name>/...).
// The browser never sees the long-lived Dropbox key. Files up to 150 MB go up through a
// one-time upload link; bigger ones go up in pieces with a short-lived token (good for
// this app folder only). Either way the bytes go straight to Dropbox, never through Supabase.
//
// Signed-in, active bellhive99 users:
//   status                                              -> { connected, account, used, allocated, is_admin }
//   upload_start  { name, size, mime, note, everyone, recipients[], announce }
//                                                       -> { id, link }  (POST the file bytes to link), or for
//                                                          files over 150 MB { id, chunked, path, token }: the
//                                                          browser uploads in pieces with a short-lived Dropbox
//                                                          token (it can reach this app folder only, ~4 hours)
//   upload_token  { id }                                -> { token }  fresh token for a long chunked upload
//   upload_finish { id }                                -> { file }
//   upload_cancel { id }
//   download      { id }                                -> { link, name }
//   delete        { id }                                (sender, or an admin for an Everyone share)
// Admins only (one-time connection, same idea as SmugMug):
//   connect_start  { app_key, app_secret }  -> { authorize_url }
//   connect_finish { code }                 -> trades the code Dropbox shows for a long-lived refresh token
//   disconnect
//
// Deploy with "Verify JWT" OFF - the function checks the caller itself.
import { createClient } from 'npm:@supabase/supabase-js@2';

const API = 'https://api.dropboxapi.com';
const DIRECT_BYTES = 150 * 1024 * 1024;      // Dropbox's limit for a single temporary-link upload
const MAX_BYTES = 20 * 1024 * 1024 * 1024;    // bigger files go up in pieces (upload session), up to this

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// short-lived Dropbox access token, reused while this instance is warm
let tokenCache: { token: string; until: number; refresh: string } | null = null;

// Dropbox refuses some characters in names; keep the rest of the name as typed
const safeName = (n: string) =>
  n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, 200) || 'file';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let secret = '';
  try { secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')['default'] || ''; } catch { /* fall back */ }
  if (!secret) secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!secret) return json({ error: 'Server key is not configured.' }, 500);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---- who is calling? ----
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Not signed in.' }, 401);
  const { data: who, error: whoErr } = await db.auth.getUser(jwt);
  if (whoErr || !who?.user) return json({ error: 'Not signed in.' }, 401);
  const uid = who.user.id;
  const { data: me } = await db.from('profiles').select('role, active, full_name, email').eq('id', uid).single();
  if (!me || !me.active) return json({ error: 'Account not active.' }, 403);
  const isAdmin = me.role === 'admin';
  const myName = (me.full_name || '').trim() || String(me.email || '').split('@')[0];
  const audit = async (type: string, detail: string, ref: string | null = null) => {
    const { error } = await db.from('audit_log').insert({
      user_id: uid, user_name: me.full_name || me.email, user_role: me.role, module: 'fileshare',
      action_type: type, action_detail: detail, item_reference: ref, source: 'server',
    });
    if (error) console.error('audit failed', error.message);
  };

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
  const conn = await getRow('dropbox');
  const connected = !!(conn.app_key && conn.app_secret && conn.refresh_token);

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
  // JSON RPC call to the Dropbox API
  async function dbx(endpoint: string, args: unknown, tokenOverride?: string) {
    const token = tokenOverride || await accessToken();
    const r = await fetch(API + '/2/' + endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
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

  // the file row, if this user may see it (same rule as the database policy)
  async function visibleFile(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data: f } = await db.from('shared_files').select('*').eq('id', id).maybeSingle();
    if (!f) return null;
    if (f.sender_id === uid || f.everyone) return f;
    const { data: r } = await db.from('shared_file_recipients').select('user_id').eq('file_id', id).eq('user_id', uid).maybeSingle();
    return r ? f : null;
  }

  try {
    if (action === 'status') {
      let space: { used: number; allocated: number | null } | null = null;
      if (connected && isAdmin) {
        try {
          const s = await dbx('users/get_space_usage', null);
          space = { used: s.used, allocated: s.allocation?.allocated ?? null };
        } catch { /* not fatal */ }
      }
      return json({ connected, account: conn.account_name || null, is_admin: isAdmin, has_key: !!(conn.app_key && conn.app_secret), max_bytes: MAX_BYTES, direct_bytes: DIRECT_BYTES, space });
    }

    // ---------- admin: connect ----------
    if (action === 'connect_start' || action === 'connect_finish' || action === 'disconnect') {
      if (!isAdmin) return json({ error: 'Admins only.' }, 403);
      if (action === 'disconnect') {
        await db.from('integration_secrets').delete().eq('name', 'dropbox');
        tokenCache = null;
        await audit('dropbox_disconnect', 'disconnected Dropbox' + (conn.account_name ? ' account ' + conn.account_name : ''));
        return json({ ok: true });
      }
      if (action === 'connect_start') {
        const key = String(body.app_key || conn.app_key || '').trim();
        const sec = String(body.app_secret || conn.app_secret || '').trim();
        if (!key || !sec) return json({ error: 'Enter the Dropbox App key and App secret.' }, 400);
        await putRow('dropbox', { app_key: key, app_secret: sec });
        const url = 'https://www.dropbox.com/oauth2/authorize?client_id=' + encodeURIComponent(key) + '&response_type=code&token_access_type=offline';
        return json({ ok: true, authorize_url: url });
      }
      // connect_finish
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
      await putRow('dropbox', { app_key: conn.app_key, app_secret: conn.app_secret, refresh_token: t.refresh_token, account_name: account });
      tokenCache = null;
      await audit('dropbox_connect', 'connected Dropbox' + (account ? ' account ' + account : ''));
      return json({ ok: true, account });
    }

    if (!connected) return json({ error: 'File Share is not connected to Dropbox yet. An admin needs to connect it.', not_connected: true }, 409);

    // ---------- upload: step 1 - make the row and a one-time upload link ----------
    if (action === 'upload_start') {
      const name = String(body.name || '').trim();
      const size = Number(body.size) || 0;
      const everyone = !!body.everyone;
      const note = String(body.note || '').trim().slice(0, 1000) || null;
      if (!name) return json({ error: 'Pick a file.' }, 400);
      if (size <= 0) return json({ error: 'That file is empty.' }, 400);
      if (size > MAX_BYTES) return json({ error: 'Files can be up to 20 GB each.' }, 400);
      let recipients = Array.isArray(body.recipients) ? [...new Set((body.recipients as unknown[]).map(String))] : [];
      recipients = recipients.filter((r) => r !== uid && /^[0-9a-f-]{36}$/i.test(r));
      if (!everyone) {
        if (!recipients.length) return json({ error: 'Choose who the file is for.' }, 400);
        const { data: ok } = await db.from('profiles').select('id').in('id', recipients).eq('active', true);
        recipients = (ok || []).map((p: { id: string }) => p.id);
        if (!recipients.length) return json({ error: 'None of those people have active accounts.' }, 400);
      } else recipients = [];

      // tidy up any of this user's uploads that never finished
      const stale = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      await db.from('shared_files').delete().eq('sender_id', uid).eq('status', 'pending').lt('created_at', stale);

      const id = crypto.randomUUID();
      const month = new Date().toISOString().slice(0, 7);
      const path = '/' + month + '/' + id + '/' + safeName(name);
      const { error: insErr } = await db.from('shared_files').insert({
        id, sender_id: uid, sender_name: myName, file_name: name.slice(0, 255), size_bytes: size,
        mime: String(body.mime || '').slice(0, 120) || null, note, everyone, status: 'pending', dropbox_path: path,
        announce: !!body.announce,
      });
      if (insErr) return json({ error: 'Could not start the upload: ' + insErr.message }, 500);
      if (recipients.length) await db.from('shared_file_recipients').insert(recipients.map((r) => ({ file_id: id, user_id: r })));

      if (size > DIRECT_BYTES) return json({ id, chunked: true, path, token: await accessToken() });
      const t = await dbx('files/get_temporary_upload_link', { commit_info: { path, mode: 'add', autorename: true, mute: false }, duration: 14400 });
      return json({ id, link: t.link });
    }

    // a long chunked upload outlived its token - hand out a fresh one for the sender's own pending upload
    if (action === 'upload_token') {
      const { data: f } = await db.from('shared_files').select('id').eq('id', String(body.id || '')).eq('sender_id', uid).eq('status', 'pending').maybeSingle();
      if (!f) return json({ error: 'That upload was not found.' }, 404);
      tokenCache = null;
      return json({ token: await accessToken() });
    }

    // ---------- upload: step 2 - check Dropbox has it and show it to people ----------
    if (action === 'upload_finish') {
      const id = String(body.id || '');
      const { data: f } = await db.from('shared_files').select('*').eq('id', id).eq('sender_id', uid).maybeSingle();
      if (!f) return json({ error: 'That upload was not found.' }, 404);
      if (f.status === 'ready') return json({ file: f });
      // Dropbox may have renamed it on a clash, so look in the file's own folder
      const folder = f.dropbox_path.replace(/\/[^/]+$/, '');
      const list = await dbx('files/list_folder', { path: folder });
      const meta = (list.entries || []).find((e: any) => e['.tag'] === 'file');
      if (!meta) return json({ error: 'Dropbox does not have the file yet - try the upload again.' }, 409);
      const { data: done, error: upErr } = await db.from('shared_files')
        .update({ status: 'ready', size_bytes: meta.size, dropbox_path: meta.path_display || f.dropbox_path, created_at: new Date().toISOString() })
        .eq('id', id).select().single();
      if (upErr) return json({ error: upErr.message }, 500);

      const { data: rec } = await db.from('shared_file_recipients').select('user_id').eq('file_id', id);
      let toNames = 'everyone';
      if (!f.everyone) {
        const { data: names } = await db.from('profiles').select('full_name, email').in('id', (rec || []).map((r: any) => r.user_id));
        toNames = (names || []).map((p: any) => (p.full_name || '').trim() || String(p.email).split('@')[0]).join(', ');
      }
      await audit('file_shared', 'shared ' + f.file_name + ' with ' + toNames, id);

      if (f.announce) {
        const who = f.everyone ? 'everyone' : toNames;
        await db.from('chat_messages').insert({ room: 'family', user_id: uid, body: '📎 Shared "' + f.file_name + '" with ' + who + ' - it\'s in File Share on the menu.' });
      }
      return json({ file: done });
    }

    if (action === 'upload_cancel') {
      const id = String(body.id || '');
      await db.from('shared_files').delete().eq('id', id).eq('sender_id', uid).eq('status', 'pending');
      return json({ ok: true });
    }

    // ---------- download ----------
    if (action === 'download') {
      const f = await visibleFile(String(body.id || ''));
      if (!f || f.status !== 'ready') return json({ error: 'That file is not shared with you.' }, 404);
      let t;
      try { t = await dbx('files/get_temporary_link', { path: f.dropbox_path }); }
      catch (e) {
        if (/not_found/.test((e as any).summary || '')) return json({ error: 'That file is no longer in Dropbox.' }, 410);
        throw e;
      }
      if (f.sender_id !== uid) {
        const { data: prev } = await db.from('shared_file_downloads').select('times').eq('file_id', f.id).eq('user_id', uid).maybeSingle();
        await db.from('shared_file_downloads').upsert({ file_id: f.id, user_id: uid, user_name: myName, downloaded_at: new Date().toISOString(), times: (prev?.times || 0) + 1 });
        await db.from('shared_files').update({ download_count: (f.download_count || 0) + 1, last_download_at: new Date().toISOString() }).eq('id', f.id);
      }
      await audit('file_download', 'downloaded ' + f.file_name + (f.sender_id !== uid ? ' from ' + (f.sender_name || 'someone') : ''), f.id);
      return json({ link: t.link, name: f.file_name });
    }

    // ---------- delete ----------
    if (action === 'delete') {
      const f = await visibleFile(String(body.id || ''));
      if (!f) return json({ error: 'That file was not found.' }, 404);
      if (f.sender_id !== uid && !(isAdmin && f.everyone)) return json({ error: 'Only the person who shared it can remove it.' }, 403);
      const folder = String(f.dropbox_path || '').replace(/\/[^/]+$/, '');
      if (folder) {
        try { await dbx('files/delete_v2', { path: folder }); }
        catch (e) { if (!/not_found/.test((e as any).summary || '')) throw e; }
      }
      await db.from('shared_files').delete().eq('id', f.id);
      await audit('file_deleted', 'removed shared file ' + f.file_name, f.id);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || 'Server error.' }, 502);
  }
});
