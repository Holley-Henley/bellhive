/* ============================================================
 * Chrisware / bellhive99.com - admin/settings.js
 * ADMIN > Settings
 *   Media (Dropbox)    the read-only Bellhive99_Media app: connect once, see the account,
 *                      disconnect. The site never looks outside /_Media with it.
 *   Audiobook Library  which /_Media folders the Library scans and plays from:
 *                      Library folder (m4b), MP3 folder (same names, .mp3), OpenAudible books.json.
 * All of it goes through the audiobooks edge function; the keys never come back to the browser.
 * ============================================================ */
(function () {
  const { el, toast } = BH.ui;
  const box = document.getElementById('st');
  const call = (action, payload) => BH.callFunction('audiobooks', Object.assign({ action }, payload));
  const ico = (name) => el('i', { class: 'ti ti-' + name, 'aria-hidden': 'true' });
  let S = null;

  async function start() {
    try {
      const { user } = await BH.init();
      if (!user) return BH.requireLogin();
    } catch (e) { box.replaceChildren(el('div', { class: 'bh-alert' }, e.message)); return; }
    if (!BH.isAdmin()) { box.replaceChildren(el('div', { class: 'bh-card bh-empty' }, 'Access restricted - admins only.')); return; }
    await refresh();
  }
  async function refresh() {
    try { S = await call('media_status'); }
    catch (e) { box.replaceChildren(el('div', { class: 'bh-alert' }, 'Could not load settings: ' + e.message)); return; }
    render();
  }
  function render() {
    box.replaceChildren(mediaCard(), libraryCard());
  }

  /* ---------- Media (Dropbox) ---------- */
  function mediaCard() {
    const head = el('div', { class: 'st-head' }, el('h2', null, ico('brand-dropbox'), 'Media (Dropbox)'),
      el('span', { class: 'st-pill ' + (S.connected ? 'on' : 'off') }, S.connected ? 'Connected' : 'Not connected'));
    if (S.connected) {
      let armed = false;
      const dis = el('button', { class: 'bh-btn danger', type: 'button', onclick: async () => {
        if (!armed) { armed = true; dis.textContent = 'Click again to disconnect'; setTimeout(() => { armed = false; dis.textContent = 'Disconnect'; }, 4000); return; }
        try { await call('media_disconnect'); toast('Media Dropbox disconnected', 'ok'); await refresh(); } catch (e) { toast(e.message, 'error'); }
      } }, 'Disconnect');
      return el('div', { class: 'bh-card bh-card-pad' }, head,
        el('dl', { class: 'bh-kv st-kv' },
          el('dt', null, 'Account'), el('dd', null, S.account || 'Connected'),
          el('dt', null, 'Reaches'), el('dd', null, el('code', null, '/_Media'), ' and the folders inside it, read-only')),
        el('p', { class: 'bh-note' }, 'Used by AUDIOBOOKS › Library to scan for new books and to play or download them. Disconnecting stops those; nothing in Dropbox is touched.'),
        dis);
    }
    const key = el('input', { placeholder: 'App key', autocomplete: 'off' });
    const sec = el('input', { placeholder: 'App secret', autocomplete: 'off', type: 'password' });
    const code = el('input', { placeholder: 'Paste the access code here', autocomplete: 'off' });
    const err = el('div', { class: 'bh-err st-err' });
    const step2 = el('div', { class: 'st-step2 bh-gone' });
    const go = el('button', { class: 'bh-btn primary', type: 'button', onclick: async () => {
      err.textContent = ''; go.disabled = true;
      try {
        const r = await call('media_connect_start', { app_key: key.value.trim(), app_secret: sec.value.trim() });
        const finish = el('button', { class: 'bh-btn primary', type: 'button', onclick: async () => {
          err.textContent = ''; finish.disabled = true;
          try {
            const done = await call('media_connect_finish', { code: code.value.trim() });
            toast('Media Dropbox connected' + (done.account ? ' - ' + done.account : ''), 'ok');
            await refresh();
          } catch (x) { err.textContent = x.message; finish.disabled = false; }
        } }, 'Finish Connecting');
        step2.replaceChildren(
          el('p', { class: 'bh-note' }, 'Now open Dropbox, sign in as ', el('b', null, 'your'), ' account (the one with the _Media folder), click ', el('b', null, 'Allow'), ', and copy the code it shows you.'),
          el('a', { class: 'bh-btn', href: r.authorize_url, target: '_blank', rel: 'noopener' }, 'Open Dropbox to Allow ↗'),
          el('label', { class: 'bh-field st-gap' }, el('span', null, 'Access Code'), code),
          finish);
        step2.classList.remove('bh-gone');
      } catch (x) { err.textContent = x.message; }
      go.disabled = false;
    } }, 'Continue');
    const li = (...k) => el('li', null, ...k);
    const c = (t) => el('code', null, t);
    return el('div', { class: 'bh-card bh-card-pad' }, head,
      el('p', { class: 'bh-note' }, 'One-time setup. Lets the site read your media folders in Dropbox so the Library can find new books and play them for anyone signed in. It is read-only and the site never looks outside ', c('/_Media'), '.'),
      el('ol', { class: 'st-steps' },
        li('In the ', el('a', { class: 'bh-link', href: 'https://www.dropbox.com/developers/apps', target: '_blank', rel: 'noopener' }, 'Dropbox App Console'), ', open ', el('b', null, 'Bellhive99_Media'), ' (Scoped access, Full Dropbox).'),
        li('On its ', el('b', null, 'Permissions'), ' tab, only ', c('files.metadata.read'), ' and ', c('files.content.read'), ' should be ticked - no write permissions. Click ', el('b', null, 'Submit'), ' after any change.'),
        li('On its ', el('b', null, 'Settings'), ' tab, copy the ', el('b', null, 'App key'), ' and ', el('b', null, 'App secret'), ' (click Show) into the boxes below.')),
      el('div', { class: 'bh-grid2' },
        el('label', { class: 'bh-field' }, el('span', null, 'App Key'), key),
        el('label', { class: 'bh-field' }, el('span', null, 'App Secret'), sec)),
      S.has_key ? el('p', { class: 'bh-note' }, 'A key is already saved - leave both boxes empty to reuse it.') : null,
      go, step2, err);
  }

  /* ---------- Audiobook Library folders ---------- */
  function libraryCard() {
    const s = S.settings || {};
    const f = {};
    const row = (k, label, help, ph) => el('label', { class: 'bh-field' }, el('span', null, label),
      (f[k] = el('input', { value: s[k] || '', placeholder: ph, spellcheck: false, autocomplete: 'off' })),
      el('small', { class: 'st-help' }, help));
    const err = el('div', { class: 'bh-err st-err' });
    const result = el('div', { class: 'st-result' });
    const save = el('button', { class: 'bh-btn primary', type: 'button', onclick: async () => {
      err.textContent = ''; result.innerHTML = ''; save.disabled = true; save.textContent = S.connected ? 'Checking folders…' : 'Saving…';
      try {
        const r = await call('media_settings_save', { library_folder: f.library_folder.value, mp3_folder: f.mp3_folder.value, books_json: f.books_json.value });
        S.settings = r.settings;
        Object.keys(f).forEach((k) => { f[k].value = r.settings[k] || ''; });
        const ck = r.check || {};
        const parts = ['Saved.'];
        if (Object.keys(ck).length) {
          parts.push(' Library folder: ', el('b', null, ck.library_folder || '—'));
          if (r.settings.mp3_folder) parts.push('; MP3 folder: ', el('b', null, ck.mp3_folder || '—'));
          if (r.settings.books_json) parts.push('; books.json ', el('b', null, ck.books_json || '—'));
          parts.push('.');
        } else parts.push(' Folders are checked once Dropbox is connected.');
        result.append(el('div', { class: 'bh-info' }, ico('circle-check'), el('div', null, parts)));
        toast('Settings saved', 'ok');
      } catch (e) { err.textContent = e.message; }
      save.disabled = false; save.textContent = 'Save';
    } }, 'Save');
    return el('div', { class: 'bh-card bh-card-pad' },
      el('div', { class: 'st-head' }, el('h2', null, ico('books'), 'Audiobook Library')),
      el('p', { class: 'bh-note' }, 'Folders in your Dropbox, starting with ', el('code', null, '/_Media'), '. They are used by ',
        el('a', { class: 'bh-link', href: '../audiobooks/library.html' }, 'AUDIOBOOKS › Library'), ' for Scan Dropbox, Play and MP3 downloads.'),
      row('library_folder', 'Library folder', 'Where OpenAudible saves the m4b files. Scan Dropbox lists files here that no book links to yet.', '/_Media/Audiobooks/Audible_m4b/books'),
      row('mp3_folder', 'MP3 folder', 'Optional. MP3 copies with the same names - a book gets an MP3 download when its twin is here.', '/_Media/Audiobooks/Audible_mp3/books'),
      row('books_json', 'OpenAudible books.json', 'Optional. OpenAudible\'s own catalog; Scan Dropbox reads book details from it.', '/_Media/Audiobooks/Audible_m4b/books.json'),
      save, err, result);
  }

  start();
})();
