/* bellhive99.com - Guest Book
 *
 * Signed in (from the left menu):  the whole book, newest first, grouped by year, with a
 *   "Sign the Guest Book" box at the top. The eight entries from the original FrontPage guest
 *   log (2000-2001) are marked "Original guest book". Delete your own entries; admins can also
 *   hide/show or delete anyone's.
 * Signed out (from the sign-in screen):  a sign-in-style card where a visitor leaves their name,
 *   where they're from and a note. Guests can't read the book.
 *
 * Table: public.guestbook_entries (supabase/guestbook.sql). The database stamps the time, the
 * name of a signed-in member and the guest flag, limits how often a guest can post, and writes
 * every signing / hide / delete to the Audit Log.
 */
(function () {
  const { el, toast, modal } = BH.ui;
  const root = document.getElementById('gb');
  const MAX = 2000;
  const SEEN_KEY = 'guestbook_seen_at';
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const PALETTE = ['#c07b12', '#3f7d5a', '#8a4f9e', '#2f6f9f', '#b5523b', '#6b7a1f', '#a23f6b', '#4b5c8f'];

  const S = { entries: [], seenAt: null, me: null };

  function color(key) {
    let h = 0; for (const ch of String(key || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  const svg = (paths) => el('span', { html: '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths + '</svg>' }).firstChild;
  const ICON = {
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-7 0-11-7-11-7a19.8 19.8 0 0 1 5.1-5.9M9.9 4.2A10 10 0 0 1 12 4c7 0 11 7 11 7a19.9 19.9 0 0 1-2.2 3.2"/><path d="M1 1l22 22"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/><path d="M9 7h7M9 11h5"/>',
  };
  function fmtWhen(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function counter(ta, out) {
    const upd = () => {
      const left = MAX - ta.value.length;
      out.textContent = left < 300 ? left + ' left' : '';
      out.classList.toggle('low', left < 50);
    };
    ta.addEventListener('input', upd); upd();
  }
  function autoGrow(ta) {
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 360) + 'px'; };
    ta.addEventListener('input', fit); setTimeout(fit, 0);
  }
  const friendly = (err) => {
    const m = (err && err.message) || String(err || 'Something went wrong');
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Could not reach the guest book. Check your connection and try again.';
    if (/check constraint|violates/i.test(m)) return 'That note is too long or is missing something - please check it and try again.';
    return m;
  };

  /* =================================================================== guests */
  function guestView() {
    document.body.classList.add('gb-guest');
    const startedAt = Date.now();
    const name = el('input', { type: 'text', maxLength: 80, placeholder: 'So we know who stopped by', autocomplete: 'name', required: true });
    const from = el('input', { type: 'text', maxLength: 80, placeholder: 'e.g. Montgomery, AL (optional)', autocomplete: 'address-level2' });
    const msg = el('textarea', { rows: 5, maxLength: MAX, placeholder: 'Say hello, share a memory, tell us what you’ve been up to…', required: true });
    const trap = el('input', { type: 'text', name: 'website', tabIndex: -1, autocomplete: 'off' });   // bots fill this in
    const left = el('span', { class: 'gb-left' });
    const err = el('div', { class: 'bh-err' });
    const btn = el('button', { class: 'bh-login-btn gb-sign-btn', type: 'submit' }, svg(ICON.pen), 'Sign the Guest Book');
    counter(msg, left); autoGrow(msg);

    const form = el('form', { class: 'bh-login-box gb-guest-box', autocomplete: 'on', onsubmit: submit },
      el('div', { class: 'bh-logo' },
        el('a', { class: 'bh-wordmark', href: '../index.html', html: 'bell<b>hive</b>99' }),
        el('div', { class: 'sub' }, 'Chris & Kim’s Guest Book'),
        el('div', { class: 'bar' })),
      el('p', { class: 'gb-guest-intro' }, 'Not a member? You can still leave us a note.'),
      el('label', { class: 'bh-field' }, el('span', null, 'Your Name'), name),
      el('label', { class: 'bh-field' }, el('span', null, 'Where are you from?'), from),
      el('label', { class: 'bh-field' }, el('span', null, 'Your Note', left), msg),
      el('label', { class: 'gb-trap', 'aria-hidden': 'true' }, 'Website', trap),
      err, btn,
      el('div', { class: 'bh-forgot' }, el('a', { href: '../index.html' }, '← Back to member sign in')));

    async function submit(e) {
      e.preventDefault();
      err.textContent = '';
      const n = name.value.trim(), m = msg.value.trim();
      if (!n) { err.textContent = 'Please tell us your name.'; name.focus(); return; }
      if (!m) { err.textContent = 'Please write a note.'; msg.focus(); return; }
      btn.disabled = true; btn.lastChild.textContent = 'Signing…';
      try {
        // a bot filled the hidden field or submitted inhumanly fast: pretend it worked
        if (!trap.value && Date.now() - startedAt > 2500) {
          const { error } = await BH.sb.from('guestbook_entries').insert({ name: n, location: from.value.trim() || null, message: m });
          if (error) throw error;
        }
        thanks(n);
      } catch (ex) {
        err.textContent = friendly(ex);
      } finally {
        btn.disabled = false; btn.lastChild.textContent = 'Sign the Guest Book';
      }
    }

    function thanks(who) {
      const first = who.split(/\s+/)[0];
      root.replaceChildren(el('div', { class: 'bh-login' },
        el('div', { class: 'bh-login-box gb-guest-box gb-thanks' },
          el('div', { class: 'gb-thanks-ico' }, svg(ICON.check)),
          el('div', { class: 'gb-thanks-t' }, 'Thank you, ' + first + '!'),
          el('p', null, 'Your note is in the guest book. Chris and Kim will see it the next time they stop by.'),
          el('button', { class: 'bh-login-btn', type: 'button', onclick: () => { msg.value = ''; mount(); } }, 'Write Another Note'),
          el('div', { class: 'bh-forgot' }, el('a', { href: '../index.html' }, '← Back to member sign in')))));
    }
    function mount() { root.replaceChildren(el('div', { class: 'bh-login' }, form)); setTimeout(() => (name.value ? msg : name).focus(), 30); }
    mount();
  }

  /* =================================================================== members */
  async function loadEntries() {
    const { data, error } = await BH.sb.from('guestbook_entries')
      .select('id, created_at, user_id, is_guest, name, location, message, source, hidden')
      .order('created_at', { ascending: false }).limit(1000);
    if (error) throw error;
    S.entries = data || [];
  }
  async function loadSeen() {
    const { data } = await BH.sb.from('user_prefs').select('value').eq('user_id', BH.user.id).eq('key', SEEN_KEY).maybeSingle();
    S.seenAt = data && data.value ? new Date(String(data.value)) : null;
  }
  async function markSeen() {
    await BH.sb.from('user_prefs').upsert({ user_id: BH.user.id, key: SEEN_KEY, value: new Date().toISOString() }, { onConflict: 'user_id,key' });
    try { const menu = window.top.frames['contents']; if (menu) menu.postMessage({ bhGuestbookSeen: true }, '*'); } catch (e) { /* ignore */ }
  }
  const isNew = (e) => S.seenAt && e.source === 'site' && e.user_id !== BH.user.id && new Date(e.created_at) > S.seenAt;

  function memberShell() {
    const wrap = el('div', { class: 'bh-page-wrap gb-wrap' });
    if (!inFrame) {
      document.body.prepend(el('div', { class: 'bh-bar gb-topbar' },
        el('a', { class: 'bh-wordmark', href: '../index.html', title: 'Home', html: 'bell<b>hive</b>99' }),
        el('span', { class: 'spacer' }),
        el('a', { class: 'bh-bar-btn', href: '../index.html' }, 'Home')));
    }
    wrap.append(
      el('div', { class: 'bh-page-head' },
        el('div', null, el('div', { class: 'crumb' }, 'bellhive99'), el('h1', null, 'Guest Book')),
        el('div', { class: 'gb-head-note', id: 'gb-tally' })),
      signCard(),
      el('div', { id: 'gb-list' }, el('div', { class: 'bh-empty' }, 'Loading the guest book…')));
    root.replaceChildren(wrap);
  }

  function signCard() {
    const who = BH.displayName();
    const from = el('input', { type: 'text', maxLength: 80, placeholder: 'Where are you writing from? (optional)' });
    const msg = el('textarea', { rows: 3, maxLength: MAX, placeholder: 'Write something in the guest book…' });
    const left = el('span', { class: 'gb-left' });
    const err = el('div', { class: 'bh-err gb-err' });
    const btn = el('button', { class: 'bh-btn primary', type: 'submit' }, svg(ICON.pen), 'Sign the Guest Book');
    counter(msg, left); autoGrow(msg);
    msg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });

    const form = el('form', { class: 'bh-card bh-card-pad gb-sign', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const m = msg.value.trim();
      if (!m) { err.textContent = 'Write a note first.'; msg.focus(); return; }
      btn.disabled = true;
      try {
        const { error } = await BH.sb.from('guestbook_entries').insert({ location: from.value.trim() || null, message: m, name: who || 'Member' });
        if (error) throw error;
        msg.value = ''; from.value = ''; msg.dispatchEvent(new Event('input'));
        toast('Signed - thank you!', 'ok');
        await refresh(true);
      } catch (ex) { err.textContent = friendly(ex); }
      finally { btn.disabled = false; }
    } },
      el('div', { class: 'gb-sign-head' },
        el('span', { class: 'bh-av', style: 'background:' + color(BH.user.id) + ';color:#fff' }, BH.initials(who)),
        el('div', null, el('div', { class: 'gb-sign-t' }, 'Sign the Guest Book'), el('div', { class: 'gb-sign-s' }, 'Signing as ' + who))),
      msg,
      el('div', { class: 'gb-sign-foot' }, from, left, btn),
      err);
    return form;
  }

  function render(justSigned) {
    const list = document.getElementById('gb-list');
    const tally = document.getElementById('gb-tally');
    const shown = S.entries.filter((e) => !e.hidden);
    const oldest = S.entries.length ? S.entries[S.entries.length - 1].created_at : null;
    tally.textContent = shown.length
      ? shown.length + ' entr' + (shown.length === 1 ? 'y' : 'ies') + (oldest ? ' since ' + new Date(oldest).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '')
      : '';
    if (!S.entries.length) {
      list.replaceChildren(el('div', { class: 'bh-card bh-empty gb-empty' }, el('b', null, 'No entries yet'), 'Be the first to sign!'));
      return;
    }
    const kids = [];
    let year = null;
    S.entries.forEach((e, i) => {
      const y = new Date(e.created_at).getFullYear();
      if (y !== year) {
        if (year !== null && year - y > 1) {
          const gap = year - y - 1;
          kids.push(el('div', { class: 'gb-gap' }, '· · ·  ' + gap + ' quiet year' + (gap === 1 ? '' : 's') + '  · · ·'));
        }
        year = y;
        const vintage = S.entries.filter((x) => new Date(x.created_at).getFullYear() === y).every((x) => x.source === 'frontpage');
        kids.push(el('div', { class: 'gb-year' }, String(y), vintage ? el('span', { class: 'gb-year-note' }, 'from the original guest book') : null));
      }
      kids.push(entryRow(e, justSigned && i === 0 && e.user_id === BH.user.id));
    });
    list.replaceChildren(...kids);
  }

  function entryRow(e, pop) {
    const mine = e.user_id && e.user_id === BH.user.id;
    const vintage = e.source === 'frontpage';
    const acts = el('div', { class: 'gb-acts' });
    if (BH.isAdmin()) {
      acts.append(el('button', { class: 'bh-ib', type: 'button', title: e.hidden ? 'Show this entry to everyone again' : 'Hide from members (admins still see it)',
        onclick: () => setHidden(e, !e.hidden) }, svg(e.hidden ? ICON.eye : ICON.eyeOff)));
    }
    if (mine || BH.isAdmin()) {
      acts.append(el('button', { class: 'bh-ib red', type: 'button', title: 'Delete this entry', onclick: () => remove(e) }, svg(ICON.trash)));
    }
    const tags = [];
    if (vintage) tags.push(el('span', { class: 'gb-tag old', title: 'Imported from the old FrontPage guest log (guestlog.htm)' }, 'Original guest book'));
    else if (e.is_guest) tags.push(el('span', { class: 'gb-tag guest' }, 'Guest'));
    if (e.hidden) tags.push(el('span', { class: 'gb-tag hid' }, 'Hidden'));
    if (isNew(e)) tags.push(el('span', { class: 'gb-new' }, 'New'));

    return el('article', { class: 'gb-entry' + (vintage ? ' vintage' : '') + (e.is_guest && !vintage ? ' guest' : '') + (e.hidden ? ' hidden' : '') + (isNew(e) ? ' fresh' : '') + (pop ? ' pop' : '') },
      el('span', { class: 'bh-av gb-av' + (e.is_guest ? ' g' : ''), style: e.is_guest ? '' : 'background:' + color(e.user_id) + ';color:#fff' }, BH.initials(e.name)),
      el('div', { class: 'gb-main' },
        el('div', { class: 'gb-top' },
          el('span', { class: 'gb-name' }, e.name),
          e.location ? el('span', { class: 'gb-from' }, 'from ' + e.location) : null,
          ...tags),
        el('div', { class: 'gb-when' }, fmtWhen(e.created_at)),
        el('div', { class: 'gb-msg' }, e.message)),
      acts);
  }

  async function setHidden(e, hidden) {
    const { error } = await BH.sb.from('guestbook_entries').update({ hidden }).eq('id', e.id);
    if (error) { toast(friendly(error), 'error'); return; }
    e.hidden = hidden;
    toast(hidden ? 'Hidden from members' : 'Showing to everyone again', 'ok');
    render();
  }
  function remove(e) {
    const mine = e.user_id === BH.user.id;
    modal({
      title: 'Delete Entry',
      body: [el('p', { class: 'bh-note' }, mine ? 'Delete your guest book entry? This can’t be undone.'
        : 'Delete ' + e.name + '’s entry from ' + new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '? This can’t be undone.' +
          (BH.isAdmin() ? ' (To keep it but take it out of view, use Hide instead.)' : '')),
        el('div', { class: 'gb-quote' }, e.message.length > 240 ? e.message.slice(0, 240) + '…' : e.message)],
      buttons: [{ label: 'Cancel' }, { label: 'Delete', danger: true, onClick: async (close) => {
        const { error } = await BH.sb.from('guestbook_entries').delete().eq('id', e.id);
        if (error) { toast(friendly(error), 'error'); return; }
        close();
        S.entries = S.entries.filter((x) => x.id !== e.id);
        toast('Entry deleted', 'ok');
        render();
      } }],
    });
  }

  async function refresh(justSigned) {
    try { await loadEntries(); render(justSigned); }
    catch (ex) { document.getElementById('gb-list').replaceChildren(el('div', { class: 'bh-alert' }, 'Could not load the guest book: ' + friendly(ex))); }
  }

  async function memberView() {
    memberShell();
    await loadSeen().catch(() => {});
    await refresh();
    markSeen().catch(() => {});
    window.addEventListener('focus', () => refresh());
  }

  /* =================================================================== start */
  (async function start() {
    let signedIn = false;
    try { const { user } = await BH.init(); signedIn = !!user; }
    catch (e) { signedIn = false; }   // not configured / deactivated: treat as a guest
    if (BH.track) BH.track('guestbook');
    if (signedIn) {
      BH.pageOpen('Guest Book', 'guestbook');
      memberView();
    } else {
      guestView();
    }
  })();
})();
