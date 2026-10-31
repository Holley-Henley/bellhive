/* bellhive99.com - ADMIN > Users
 * Same workflow as HHB Project Exchange's User Management: sortable roster,
 * Add User with a temporary password (forced change at first sign-in), Edit,
 * Activate / Deactivate, and password reset by email or set directly. */
(function () {
  const { el, toast, modal, fmtWhen } = BH.ui;
  const mc = document.getElementById('mc');
  const ICON = {
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
    off: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M3 21v-1a6 6 0 0 1 9.5-4.9"/><path d="M16 16l5 5M21 16l-5 5"/></svg>',
    on: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M3 21v-1a6 6 0 0 1 9.5-4.9"/><path d="M15 19l2 2 4-4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="4"/><path d="M3 21v-1a6 6 0 0 1 12 0v1M19 8v6M16 11h6"/></svg>',
  };
  const ROLE_LABEL = { admin: 'Admin', member: 'Member' };
  let users = [];
  let sortCol = 'full_name', sortDir = 1;

  async function start() {
    try {
      const { user } = await BH.init();
      if (!user) return BH.requireLogin();
    } catch (e) {
      mc.replaceChildren(el('div', { class: 'bh-alert' }, e.message)); return;
    }
    if (!BH.isAdmin()) { mc.replaceChildren(el('div', { class: 'bh-card bh-empty' }, 'Access restricted - admins only.')); return; }
    document.getElementById('um-actions').replaceChildren(
      el('button', { class: 'bh-btn primary', type: 'button', onclick: openAdd, html: ICON.plus + ' Add User' }));
    await load();
  }

  async function load() {
    const { data, error } = await BH.sb.from('profiles').select('*').order('full_name');
    if (error) { mc.replaceChildren(el('div', { class: 'bh-alert' }, 'Error: ' + error.message)); return; }
    users = data || [];
    render();
  }

  function sorted() {
    const val = (u) => {
      switch (sortCol) {
        case 'role': return ROLE_LABEL[u.role] || '';
        case 'active': return u.active ? 1 : 0;
        case 'last_sign_in_at': return u.last_sign_in_at || '';
        default: return (u.full_name || u.email || '').toLowerCase();
      }
    };
    return users.slice().sort((a, b) => (val(a) < val(b) ? -sortDir : val(a) > val(b) ? sortDir : 0));
  }
  function th(col, label) {
    const arrow = sortCol !== col ? '<span style="opacity:.3">&#8597;</span>' : sortDir === 1 ? '&#8593;' : '&#8595;';
    return el('div', { class: 'sortable' + (sortCol === col ? ' sort-active' : ''), html: label + ' ' + arrow,
      onclick: () => { if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = 1; } render(); } });
  }

  function render() {
    const me = BH.user.id;
    const rows = sorted().map((u) => el('div', { class: 'bh-user-row' },
      el('div', null,
        el('div', { class: 'name' }, u.full_name || '—', u.id === me ? el('span', { class: 'bh-you' }, 'YOU') : null),
        el('div', { class: 'email' }, u.email || '')),
      el('div', null, el('span', { class: 'bh-badge ' + (u.role === 'admin' ? 'admin' : 'member') }, ROLE_LABEL[u.role] || u.role)),
      el('div', null, el('span', { class: 'bh-badge ' + (u.active ? 'on' : 'off') }, u.active ? 'Active' : 'Inactive')),
      el('div', { class: 'when' }, fmtWhen(u.last_sign_in_at)),
      el('div', { class: 'acts' },
        el('button', { class: 'bh-ib', type: 'button', title: 'Edit', 'aria-label': 'Edit ' + (u.full_name || ''), html: ICON.edit, onclick: () => openEdit(u) }),
        u.id === me ? null : el('button', { class: 'bh-ib red', type: 'button', title: u.active ? 'Deactivate' : 'Activate',
          'aria-label': (u.active ? 'Deactivate ' : 'Activate ') + (u.full_name || ''), html: u.active ? ICON.off : ICON.on, onclick: () => toggleActive(u) }))));
    mc.replaceChildren(el('div', { class: 'bh-card' },
      el('div', { class: 'bh-user-row header' }, th('full_name', 'Name / Email'), th('role', 'Role'), th('active', 'Status'), th('last_sign_in_at', 'Last Log In'), el('div')),
      rows.length ? rows : el('div', { class: 'bh-empty' }, 'No users found.')));
  }

  /* ---------- form helpers ---------- */
  const field = (label, input) => el('label', { class: 'bh-field' }, el('span', null, label), input);
  const roleSelect = (v) => el('select', null,
    el('option', { value: 'member', selected: v !== 'admin' }, 'Member - uses the site and modules'),
    el('option', { value: 'admin', selected: v === 'admin' }, 'Admin - can also manage users'));
  function busy(btnLabel, fn) {
    return async (close) => {
      const btn = [...document.querySelectorAll('.bh-mfoot .bh-btn.primary')].pop();
      const old = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = btnLabel; }
      try { await fn(close); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = old; } }
    };
  }

  function openAdd() {
    const name = el('input', { placeholder: 'Full name' });
    const email = el('input', { type: 'email', placeholder: 'name@email.com' });
    const phone = el('input', { placeholder: '(334) 555-0100' });
    const role = roleSelect('member');
    const pw = el('input', { type: 'password', placeholder: 'At least 8 characters', autocomplete: 'new-password' });
    const pw2 = el('input', { type: 'password', placeholder: 'Confirm password', autocomplete: 'new-password' });
    const err = el('div', { class: 'bh-err' });
    modal({
      title: 'Add User', wide: true,
      body: [
        el('div', { class: 'bh-grid2' }, field('Full Name *', name), field('Email *', email)),
        el('div', { class: 'bh-grid2' }, field('Phone', phone), field('Role *', role)),
        el('div', { class: 'bh-grid2' }, field('Password *', pw), field('Confirm Password *', pw2)),
        el('div', { class: 'bh-info' }, "They can sign in right away with this password, and will be asked to set their own before doing anything else."),
        err,
      ],
      buttons: [
        { label: 'Cancel' },
        { label: 'Create User', primary: true, onClick: busy('Creating…', async (close) => {
          err.textContent = '';
          if (!name.value.trim() || !email.value.trim()) { err.textContent = 'Name and email are required.'; return; }
          if (pw.value.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
          if (pw.value !== pw2.value) { err.textContent = 'Passwords do not match.'; return; }
          try {
            await BH.adminCall('create', { full_name: name.value.trim(), email: email.value.trim(), phone: phone.value.trim() || null, role: role.value, password: pw.value });
            BH.audit('user_create', 'created user ' + name.value.trim() + ' (' + ROLE_LABEL[role.value] + ')', email.value.trim(), 'admin');
            close(); toast('User created - give ' + name.value.trim() + " the password; they'll change it at first sign-in.", 'ok');
            await load();
          } catch (e) { err.textContent = e.message; }
        }) },
      ],
    });
  }

  function openEdit(u) {
    const isMe = u.id === BH.user.id;
    const name = el('input', { value: u.full_name || '' });
    const email = el('input', { value: u.email || '', readOnly: true, title: 'Email is the sign-in name and can be changed in the Supabase dashboard' });
    const phone = el('input', { value: u.phone || '', placeholder: '(334) 555-0100' });
    const role = roleSelect(u.role);
    const err = el('div', { class: 'bh-err' });

    /* password controls (as in Project Exchange) */
    const npw = el('input', { type: 'password', placeholder: 'At least 8 characters', autocomplete: 'new-password' });
    const npw2 = el('input', { type: 'password', placeholder: 'Confirm password', autocomplete: 'new-password' });
    const pwErr = el('div', { class: 'bh-err' });
    const inline = el('div', { style: 'display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--bh-border)' },
      el('div', { class: 'bh-grid2' }, field('New Password', npw), field('Confirm New Password', npw2)), pwErr,
      el('button', { class: 'bh-btn primary sm', type: 'button', onclick: async (e) => {
        pwErr.textContent = '';
        if (npw.value.length < 8) { pwErr.textContent = 'Password must be at least 8 characters.'; return; }
        if (npw.value !== npw2.value) { pwErr.textContent = 'Passwords do not match.'; return; }
        const b = e.currentTarget; b.disabled = true; b.textContent = 'Saving…';
        try {
          await BH.adminCall('set_password', { user_id: u.id, password: npw.value });
          BH.audit('user_password', 'set a new password for ' + (u.full_name || u.email), u.email, 'admin');
          npw.value = npw2.value = ''; inline.style.display = 'none';
          toast('Password updated for ' + (u.full_name || u.email) + " - they'll change it at next sign-in.", 'ok');
        } catch (x) { pwErr.textContent = x.message; }
        finally { b.disabled = false; b.textContent = 'Set Password'; }
      } }, 'Set Password'));
    const pwBox = el('div', { class: 'bh-section' },
      el('div', { class: 'bh-section-title' }, 'Password'),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        el('button', { class: 'bh-btn sm', type: 'button', onclick: async () => {
          if (!u.email) { toast('No email on file for this user', 'error'); return; }
          try { await BH.sendResetEmail(u.email); toast('Password reset email sent to ' + u.email, 'ok'); BH.audit('user_password', 'sent a password reset email to ' + (u.full_name || u.email), u.email, 'admin'); }
          catch (x) { toast('Failed to send: ' + x.message, 'error'); }
        } }, 'Send Reset Email'),
        el('button', { class: 'bh-btn sm', type: 'button', onclick: () => { inline.style.display = inline.style.display === 'none' ? '' : 'none'; } }, 'Set New Password Directly')),
      inline);

    modal({
      title: 'Edit User', wide: true,
      body: [
        el('div', { class: 'bh-grid2' }, field('Full Name *', name), field('Email', email)),
        el('div', { class: 'bh-grid2' }, field('Phone', phone), field('Role *', role)),
        pwBox,
        el('p', { class: 'bh-note', style: 'margin-top:10px' }, 'Last log in: ' + fmtWhen(u.last_sign_in_at) + ' · Added ' + fmtWhen(u.created_at)),
        err,
      ],
      buttons: [
        { label: 'Cancel' },
        { label: 'Save Changes', primary: true, onClick: busy('Saving…', async (close) => {
          err.textContent = '';
          if (!name.value.trim()) { err.textContent = 'Name is required.'; return; }
          /* don't let the last admin demote themselves */
          if (isMe && u.role === 'admin' && role.value !== 'admin' && !users.some((x) => x.id !== u.id && x.role === 'admin' && x.active)) {
            err.textContent = "You're the only admin - make someone else an admin first."; return;
          }
          const { error } = await BH.sb.from('profiles').update({ full_name: name.value.trim(), phone: phone.value.trim() || null, role: role.value }).eq('id', u.id);
          if (error) { err.textContent = error.message; return; }
          const changes = [];
          if ((u.full_name || '') !== name.value.trim()) changes.push('name');
          if ((u.phone || '') !== (phone.value.trim() || '')) changes.push('phone');
          if (u.role !== role.value) changes.push('role ' + ROLE_LABEL[u.role] + ' → ' + ROLE_LABEL[role.value]);
          BH.audit('user_update', 'updated user ' + name.value.trim() + (changes.length ? ' (' + changes.join(', ') + ')' : ' (no changes)'), u.email, 'admin');
          close(); toast('User updated', 'ok');
          if (isMe) await BH.reloadProfile();
          await load();
        }) },
      ],
    });
  }

  function toggleActive(u) {
    const turningOff = !!u.active;
    modal({
      title: turningOff ? 'Deactivate User' : 'Activate User',
      body: el('p', { class: 'bh-note' }, turningOff
        ? (u.full_name || u.email) + " won't be able to sign in. Their data is kept, and you can turn the account back on any time."
        : (u.full_name || u.email) + ' will be able to sign in again.'),
      buttons: [
        { label: 'Cancel' },
        { label: turningOff ? 'Deactivate' : 'Activate', primary: true, onClick: busy('Saving…', async (close) => {
          try {
            await BH.adminCall('set_active', { user_id: u.id, active: !turningOff });
            BH.audit('user_status', (turningOff ? 'deactivated ' : 'activated ') + (u.full_name || u.email), u.email, 'admin');
            close(); toast((u.full_name || u.email) + (turningOff ? ' deactivated' : ' activated'), 'ok');
            await load();
          } catch (e) { close(); toast(e.message, 'error'); }
        }) },
      ],
    });
  }

  start();
})();
