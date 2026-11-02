// bellhive99.com - admin-users edge function
// Admin-only actions that need the service role key (never shipped to the browser):
//   create        { email, password, full_name, role }   -> new account, must change password at first sign-in
//   set_password  { user_id, password }                  -> admin sets a new password directly
//   set_active    { user_id, active }                    -> deactivate (blocks sign-in) / reactivate
// Every action writes its own entry to the audit log (source 'server'), so it is recorded
// even if the admin's page never gets the chance to.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function -> name it "admin-users",
// paste this file, turn OFF "Verify JWT" (this function checks the caller itself), deploy.
// SUPABASE_URL and SUPABASE_SECRET_KEYS are provided automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  let secret = '';
  try { secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')['default'] || ''; } catch { /* fall back */ }
  if (!secret) secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!secret) return json({ error: 'Server key is not configured.' }, 500);
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  // Who is calling, and are they an active admin?
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in.' }, 401);
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user) return json({ error: 'Not signed in.' }, 401);
  const { data: me } = await admin.from('profiles').select('role, active, full_name, email').eq('id', who.user.id).single();
  if (!me || me.role !== 'admin' || !me.active) return json({ error: 'Admins only.' }, 403);

  // audit entry written by the server, on behalf of the calling admin
  const audit = async (type: string, detail: string, ref: string | null, oldValues: unknown = null, newValues: unknown = null) => {
    const { error } = await admin.from('audit_log').insert({
      user_id: who.user!.id, user_name: me.full_name || me.email, user_role: me.role, module: 'admin',
      action_type: type, action_detail: detail, item_reference: ref, source: 'server',
      old_values: oldValues, new_values: newValues,
    });
    if (error) console.error('audit failed', error.message);
  };
  const target = async (id: string) => {
    const { data } = await admin.from('profiles').select('full_name, email, active').eq('id', id).maybeSingle();
    return { name: data?.full_name || data?.email || id, email: data?.email || null, active: data?.active };
  };

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Bad request body.' }, 400); }
  const action = String(body.action || '');

  try {
    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const full_name = String(body.full_name || '').trim();
      const role = body.role === 'admin' ? 'admin' : 'member';
      if (!email || !full_name) return json({ error: 'Name and email are required.' }, 400);
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
      if (error) return json({ error: error.message }, 400);
      const id = data.user!.id;
      // profile row is created by the on_auth_user_created trigger; fill in the rest
      await admin.from('profiles').upsert({ id, email, full_name, role, active: true, must_change_password: true, phone: body.phone || null });
      await audit('user_create', 'created user ' + full_name + ' (' + (role === 'admin' ? 'Admin' : 'Member') + ') with a temporary password', email,
        null, { name: full_name, email, role, phone: body.phone || null });
      return json({ ok: true, user_id: id });
    }

    if (action === 'set_password') {
      const id = String(body.user_id || '');
      const password = String(body.password || '');
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      await admin.from('profiles').update({ must_change_password: true }).eq('id', id);
      const t = await target(id);
      await audit('user_password', 'set a new password for ' + t.name + ' (must change it at next sign-in)', t.email);
      return json({ ok: true });
    }

    if (action === 'set_active') {
      const id = String(body.user_id || '');
      const active = !!body.active;
      if (id === who.user.id && !active) return json({ error: "You can't deactivate your own account." }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' });
      if (error) return json({ error: error.message }, 400);
      const before = await target(id);
      await admin.from('profiles').update({ active }).eq('id', id);
      await audit('user_status', (active ? 'activated ' : 'deactivated ') + before.name, before.email,
        { active: before.active }, { active });
      return json({ ok: true });
    }

    return json({ error: 'Unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || 'Server error.' }, 500);
  }
});
