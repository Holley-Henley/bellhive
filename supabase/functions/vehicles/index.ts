// bellhive99.com - vehicles edge function (RESOURCES > Vehicles and Equipment)
//
// Photos (gallery + profile picture) and maintenance invoices are kept in the site's
// Dropbox app folder - the same connection File Share uses - under
//   /Vehicles/<vehicle id>/photos/<upload id>/<name>
//   /Vehicles/<vehicle id>/maintenance/<entry id>/<upload id>/<name>
// The browser never sees the Dropbox key. It asks this function for a one-time upload link,
// sends the bytes straight to Dropbox, then calls *_finish so the row is written. To show a
// picture it asks for short-lived direct links (Dropbox temporary links, 4 hours), which work
// as a plain <img src> just like Supabase signed URLs.
//
// Every action checks the vehicle / entry through the CALLER's own database session, so the
// same row level security as the pages decides (owner or admin).
//
//   status                                              -> { connected }
//   photo_upload_start  { equipment_id, name, size }   -> { path, link }   (POST the bytes to link)
//   photo_upload_finish { equipment_id, path, rotation } -> { photo }
//   file_upload_start   { maintenance_id, name, size } -> { path, link }
//   file_upload_finish  { maintenance_id, path }       -> { file }
//   links   { photo_ids[], file_ids[] }                 -> { photos: {id: url}, files: {id: url} }
//   delete_photo   { id }      delete_file  { id }
//   delete_vehicle { id }      delete_entry { id }      (row + its Dropbox folder)
//
// Deploy with "Verify JWT" OFF - the function checks the caller itself.
import { createClient } from 'npm:@supabase/supabase-js@2';

const API = 'https://api.dropboxapi.com';
const MAX_BYTES = 150 * 1024 * 1024;   // Dropbox's limit for one temporary-link upload

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const isId = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const safeName = (n: string) =>
  n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, 180) || 'file';

let tokenCache: { token: string; until: number; refresh: string } | null = null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  let secret = '', anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  try { secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')['default'] || ''; } catch { /* fall back */ }
  try { anon = anon || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')['default'] || ''; } catch { /* fall back */ }
  if (!secret) secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!secret || !anon) return json({ error: 'Server keys are not configured.' }, 500);
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---- who is calling? ----
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Not signed in.' }, 401);
  const { data: who, error: whoErr } = await db.auth.getUser(jwt);
  if (whoErr || !who?.user) return json({ error: 'Not signed in.' }, 401);
  const uid = who.user.id;
  const { data: me } = await db.from('profiles').select('role, active, full_name, email').eq('id', uid).single();
  if (!me || !me.active) return json({ error: 'Account not active.' }, 403);
  // the caller's own session: row level security decides what they can reach
  const asUser = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: 'Bearer ' + jwt } },
  });
  const audit = async (type: string, detail: string, ref: string | null = null) => {
    const { error } = await db.from('audit_log').insert({
      user_id: uid, user_name: me.full_name || me.email, user_role: me.role, module: 'vehicles',
      action_type: type, action_detail: detail.slice(0, 500), item_reference: ref, source: 'server',
    });
    if (error) console.error('audit failed', error.message);
  };

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || '');

  // ---- Dropbox (File Share's connection) ----
  const { data: connRow } = await db.from('integration_secrets').select('data').eq('name', 'dropbox').maybeSingle();
  const conn = (connRow?.data || {}) as Record<string, string>;
  const connected = !!(conn.app_key && conn.app_secret && conn.refresh_token);
  async function accessToken() {
    if (tokenCache && tokenCache.refresh === conn.refresh_token && Date.now() < tokenCache.until) return tokenCache.token;
    const r = await fetch(API + '/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token, client_id: conn.app_key, client_secret: conn.app_secret }),
    });
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
  const dbxDelete = async (path: string) => {
    try { await dbx('files/delete_v2', { path }); }
    catch (e) { if (!/not_found/.test((e as any).summary || '')) console.error('dropbox delete failed', path, (e as Error).message); }
  };
  const folderOf = (p: string) => p.replace(/\/[^/]+$/, '');

  // ---- rows the caller may reach (through their own session) ----
  const vehicle = async (id: unknown) => {
    if (!isId(id)) return null;
    const { data } = await asUser.from('equipment').select('id, unit_number, profile_photo_id').eq('id', id).maybeSingle();
    return data;
  };
  const entry = async (id: unknown) => {
    if (!isId(id)) return null;
    const { data } = await asUser.from('equipment_maintenance').select('id, equipment_id, service_date').eq('id', id).maybeSingle();
    return data;
  };

  try {
    if (action === 'status') return json({ connected });
    if (!connected) return json({ error: 'Dropbox is not connected yet. An admin can connect it on the File Share page.' }, 409);

    // ---------- upload: step 1 - a one-time Dropbox upload link ----------
    if (action === 'photo_upload_start' || action === 'file_upload_start') {
      const photo = action === 'photo_upload_start';
      const name = String(body.name || '').trim();
      const size = Number(body.size) || 0;
      if (!name) return json({ error: 'Pick a file.' }, 400);
      if (size <= 0) return json({ error: 'That file is empty.' }, 400);
      if (size > MAX_BYTES) return json({ error: 'Files can be up to 150 MB each.' }, 400);
      let path: string;
      if (photo) {
        const v = await vehicle(body.equipment_id);
        if (!v) return json({ error: 'That vehicle was not found.' }, 404);
        path = '/Vehicles/' + v.id + '/photos/' + crypto.randomUUID() + '/' + safeName(name);
      } else {
        const m = await entry(body.maintenance_id);
        if (!m) return json({ error: 'That maintenance entry was not found.' }, 404);
        path = '/Vehicles/' + m.equipment_id + '/maintenance/' + m.id + '/' + crypto.randomUUID() + '/' + safeName(name);
      }
      const t = await dbx('files/get_temporary_upload_link', { commit_info: { path, mode: 'add', autorename: true, mute: true }, duration: 14400 });
      return json({ path, link: t.link });
    }

    // ---------- upload: step 2 - check Dropbox has it, write the row ----------
    if (action === 'photo_upload_finish' || action === 'file_upload_finish') {
      const photo = action === 'photo_upload_finish';
      const path = String(body.path || '');
      let prefix: string, v: any = null, m: any = null;
      if (photo) {
        v = await vehicle(body.equipment_id);
        if (!v) return json({ error: 'That vehicle was not found.' }, 404);
        prefix = '/Vehicles/' + v.id + '/photos/';
      } else {
        m = await entry(body.maintenance_id);
        if (!m) return json({ error: 'That maintenance entry was not found.' }, 404);
        prefix = '/Vehicles/' + m.equipment_id + '/maintenance/' + m.id + '/';
      }
      // only a folder this function handed out: <prefix><uuid>/<name>
      if (!path.startsWith(prefix) || !/^[0-9a-f-]{36}\/[^/]+$/i.test(path.slice(prefix.length))) return json({ error: 'Bad upload path.' }, 400);
      const list = await dbx('files/list_folder', { path: folderOf(path) }).catch(() => null);
      const meta = (list?.entries || []).find((e: any) => e['.tag'] === 'file');
      if (!meta) return json({ error: 'Dropbox does not have the file yet - try the upload again.' }, 409);
      const name = String(body.name || meta.name).slice(0, 200);
      const mime = String(body.mime || '').slice(0, 120) || null;
      if (photo) {
        const rot = [0, 90, 180, 270].includes(Number(body.rotation)) ? Number(body.rotation) : 0;
        const { data: row, error } = await db.from('equipment_photos').insert({
          equipment_id: v.id, kind: 'dropbox', filename: name, storage_path: meta.path_display || path,
          file_size: meta.size, content_type: mime, rotation: rot, uploaded_by: uid,
        }).select().single();
        if (error) { await dbxDelete(folderOf(path)); return json({ error: error.message }, 500); }
        if (body.make_profile && !v.profile_photo_id) await db.from('equipment').update({ profile_photo_id: row.id }).eq('id', v.id);
        await audit('vehicle_photo', 'uploaded a photo to ' + v.unit_number + ': ' + name, v.unit_number);
        return json({ photo: row });
      }
      const { data: row, error } = await db.from('equipment_maintenance_files').insert({
        maintenance_id: m.id, kind: 'dropbox', filename: name, storage_path: meta.path_display || path,
        file_size: meta.size, content_type: mime, uploaded_by: uid,
      }).select().single();
      if (error) { await dbxDelete(folderOf(path)); return json({ error: error.message }, 500); }
      const { data: q } = await db.from('equipment').select('unit_number').eq('id', m.equipment_id).maybeSingle();
      await audit('maint_file', 'uploaded an invoice on ' + (q?.unit_number || 'a vehicle') + ' (' + m.service_date + '): ' + name, q?.unit_number || null);
      return json({ file: row });
    }

    // ---------- short-lived links to show / open Dropbox-stored photos and invoices ----------
    if (action === 'links') {
      const pids = (Array.isArray(body.photo_ids) ? body.photo_ids : []).filter(isId).slice(0, 200);
      const fids = (Array.isArray(body.file_ids) ? body.file_ids : []).filter(isId).slice(0, 200);
      const out: { photos: Record<string, string>; files: Record<string, string>; missing: string[] } = { photos: {}, files: {}, missing: [] };
      const [p, f] = await Promise.all([
        pids.length ? asUser.from('equipment_photos').select('id, storage_path').in('id', pids).eq('kind', 'dropbox') : { data: [] },
        fids.length ? asUser.from('equipment_maintenance_files').select('id, storage_path').in('id', fids).eq('kind', 'dropbox') : { data: [] },
      ]);
      const jobs: Promise<void>[] = [];
      const one = (bucket: Record<string, string>) => (r: { id: string; storage_path: string }) =>
        jobs.push(dbx('files/get_temporary_link', { path: r.storage_path })
          .then((t) => { bucket[r.id] = t.link; })
          .catch(() => { out.missing.push(r.id); }));
      ((p as any).data || []).forEach(one(out.photos));
      ((f as any).data || []).forEach(one(out.files));
      await Promise.all(jobs);
      return json(out);
    }

    // ---------- deletes: the row (through the caller's session), then its Dropbox folder ----------
    if (action === 'delete_photo' || action === 'delete_file') {
      const photo = action === 'delete_photo';
      if (!isId(body.id)) return json({ error: 'Bad id.' }, 400);
      const table = photo ? 'equipment_photos' : 'equipment_maintenance_files';
      const { data: row } = await asUser.from(table).select('*').eq('id', body.id).maybeSingle();
      if (!row) return json({ error: 'Not found.' }, 404);
      const { error } = await asUser.from(table).delete().eq('id', row.id);
      if (error) return json({ error: error.message }, 403);
      if (row.kind === 'dropbox') await dbxDelete(folderOf(row.storage_path));
      return json({ ok: true });
    }
    if (action === 'delete_vehicle' || action === 'delete_entry') {
      const veh = action === 'delete_vehicle';
      const row = veh ? await vehicle(body.id) : await entry(body.id);
      if (!row) return json({ error: 'Not found.' }, 404);
      const { error } = await asUser.from(veh ? 'equipment' : 'equipment_maintenance').delete().eq('id', row.id);
      if (error) return json({ error: error.message }, 403);
      await dbxDelete(veh ? '/Vehicles/' + row.id : '/Vehicles/' + (row as any).equipment_id + '/maintenance/' + row.id);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || 'Server error.' }, 502);
  }
});
