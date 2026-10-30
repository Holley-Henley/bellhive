/* bellhive99.com - shared sign-in + account module.
 *
 * Every page that needs a signed-in user loads, in order:
 *   https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
 *   <root>/auth/config.js
 *   <root>/auth/auth.js   data-root="<root>"   (e.g. data-root="../" from a sub-folder)
 *
 * Then:  const { user, profile } = await BH.init();      // null user = not signed in
 *        BH.requireLogin()                               // send to the site login and come back
 */
(function () {
  const script = document.currentScript;
  const ROOT = (script && script.dataset.root) || '';
  const C = window.BH_CONFIG || {};
  const BH = (window.BH = { root: ROOT, user: null, profile: null, sb: null });

  if (C.supabaseUrl && C.supabaseKey && window.supabase) {
    BH.sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'bh99-auth' },
    });
  }

  let initPromise = null;
  BH.init = function () {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (!BH.sb) throw new Error('Supabase is not configured (auth/config.js) or could not load.');
      const { data } = await BH.sb.auth.getSession();
      BH.user = data.session ? data.session.user : null;
      if (BH.user) await loadProfile();
      return { user: BH.user, profile: BH.profile };
    })();
    return initPromise;
  };

  async function loadProfile() {
    const { data, error } = await BH.sb.from('profiles').select('*').eq('id', BH.user.id).maybeSingle();
    if (error) throw new Error('Could not load your profile: ' + error.message);
    BH.profile = data || { id: BH.user.id, email: BH.user.email, full_name: (BH.user.email || '').split('@')[0], role: 'member', active: true };
    if (BH.profile.active === false) {
      await BH.sb.auth.signOut();
      BH.user = null; BH.profile = null;
      throw new Error('This account has been deactivated. Ask an admin to turn it back on.');
    }
    return BH.profile;
  }
  BH.reloadProfile = loadProfile;

  BH.isAdmin = () => !!(BH.profile && BH.profile.role === 'admin' && BH.profile.active !== false);
  BH.displayName = () => (BH.profile && BH.profile.full_name) || (BH.user && BH.user.email) || '';
  BH.initials = (name) => String(name || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('') || '?';

  BH.signIn = async function (email, password) {
    const { data, error } = await BH.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
    BH.user = data.user;
    await loadProfile();
    initPromise = Promise.resolve({ user: BH.user, profile: BH.profile });
    return BH.profile;
  };
  BH.signOut = async function () {
    try { await BH.sb.auth.signOut(); } catch (e) { /* already gone */ }
    BH.user = null; BH.profile = null; initPromise = null;
  };
  BH.sendResetEmail = async function (email) {
    const { error } = await BH.sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl() + 'index.html' });
    if (error) throw new Error(error.message);
  };
  BH.changePassword = async function (pw) {
    if (!pw || pw.length < 8) throw new Error('Password must be at least 8 characters.');
    const { error } = await BH.sb.auth.updateUser({ password: pw });
    if (error) throw new Error(error.message);
    if (BH.profile && BH.profile.must_change_password) {
      await BH.sb.from('profiles').update({ must_change_password: false }).eq('id', BH.user.id);
      BH.profile.must_change_password = false;
    }
  };
  BH.updateMyProfile = async function (fields) {
    const { data, error } = await BH.sb.from('profiles').update(fields).eq('id', BH.user.id).select().single();
    if (error) throw new Error(error.message);
    BH.profile = data;
    return data;
  };

  /* Admin actions that need the service key run in the admin-users edge function. */
  BH.adminCall = async function (action, payload) {
    const { data } = await BH.sb.auth.getSession();
    const token = data.session && data.session.access_token;
    if (!token) throw new Error('Your session expired - sign in again.');
    let resp;
    try {
      resp = await fetch(C.supabaseUrl + '/functions/v1/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, apikey: C.supabaseKey },
        body: JSON.stringify(Object.assign({ action }, payload)),
      });
    } catch (e) {
      throw new Error('Could not reach the admin-users function. Has it been deployed? (' + e.message + ')');
    }
    let out = {};
    try { out = await resp.json(); } catch (e) { /* non-JSON */ }
    if (resp.status === 404) throw new Error('The admin-users edge function is not deployed yet.');
    if (!resp.ok || out.error) throw new Error(out.error || ('Request failed (' + resp.status + ')'));
    return out;
  };

  /* Not signed in? Go to the site login, then come back here. */
  BH.requireLogin = function () {
    const here = location.pathname + location.search + location.hash;
    const target = ROOT + 'index.html?next=' + encodeURIComponent(here);
    (window.top || window).location.href = target;
    return new Promise(() => {}); // page is navigating away
  };

  function siteUrl() {
    const a = document.createElement('a');
    a.href = ROOT || './';
    return a.href.replace(/[^/]*$/, '');
  }
  BH.siteUrl = siteUrl;

  /* ---------- tiny UI kit shared by site pages (modal, toast, password form) ---------- */
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k in e) e[k] = v;
      else e.setAttribute(k, v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) e.appendChild(c instanceof Node ? c : document.createTextNode(c)); });
    return e;
  }
  function toast(msg, kind) {
    const t = el('div', { class: 'bh-toast ' + (kind || '') }, msg);
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
  }
  /* modal({title, body: Node|[Node], buttons:[{label, primary, onClick(close)}], closable}) */
  function modal(opts) {
    const overlay = el('div', { class: 'bh-overlay' });
    const close = () => overlay.remove();
    const head = el('div', { class: 'bh-mhead' }, el('span', null, opts.title || ''),
      opts.closable === false ? null : el('button', { class: 'bh-x', type: 'button', 'aria-label': 'Close', onclick: close }, '×'));
    const foot = el('div', { class: 'bh-mfoot' }, (opts.buttons || []).map((b) =>
      el('button', { class: 'bh-btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), type: 'button', onclick: () => b.onClick ? b.onClick(close) : close() }, b.label)));
    overlay.appendChild(el('div', { class: 'bh-modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' }, head, el('div', { class: 'bh-mbody' }, opts.body), foot));
    if (opts.closable !== false) overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    const first = overlay.querySelector('input, select, textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return { close, overlay };
  }
  /* Change / set / forced password dialog. Resolves true once saved. */
  function passwordModal(kind) {
    return new Promise((resolve) => {
      const titles = { change: 'Change Password', forced: 'Set Your Password', recovery: 'Set New Password' };
      const notes = {
        change: "Set a new password for your account. You'll stay signed in.",
        forced: 'For security, set your own password before continuing. This only takes a moment.',
        recovery: 'Enter a new password for your account.',
      };
      const pw = el('input', { type: 'password', placeholder: 'At least 8 characters', autocomplete: 'new-password' });
      const pw2 = el('input', { type: 'password', placeholder: 'Confirm password', autocomplete: 'new-password' });
      const err = el('div', { class: 'bh-err' });
      const save = async (close) => {
        err.textContent = '';
        if (pw.value.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
        if (pw.value !== pw2.value) { err.textContent = 'Passwords do not match.'; return; }
        try { await BH.changePassword(pw.value); close(); toast('Password updated', 'ok'); resolve(true); }
        catch (e) { err.textContent = e.message; }
      };
      const m = modal({
        title: titles[kind], closable: kind === 'change',
        body: [el('p', { class: 'bh-note' }, notes[kind]),
          el('label', { class: 'bh-field' }, el('span', null, 'New Password'), pw),
          el('label', { class: 'bh-field' }, el('span', null, 'Confirm New Password'), pw2), err],
        buttons: (kind === 'change' ? [{ label: 'Cancel', onClick: (c) => { c(); resolve(false); } }] : [])
          .concat([{ label: kind === 'forced' ? 'Set Password & Continue' : 'Set Password', primary: true, onClick: save }]),
      });
      [pw, pw2].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(m.close); }));
    });
  }
  function fmtWhen(ts) {
    if (!ts) return 'Never';
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  BH.ui = { el, toast, modal, passwordModal, fmtWhen };
})();
