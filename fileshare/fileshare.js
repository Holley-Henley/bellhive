/* bellhive99.com - File Share
 *
 * Send a file to one person, a few people, or everyone. The file itself goes straight
 * from the browser to Dropbox (this site's app folder) using a one-time link from the
 * fileshare edge function; the list of files lives in Supabase.
 *
 * Who sees a file: the sender, the people it was sent to, or everyone signed in when
 * it was shared with Everyone. Nobody else - admins included.
 */
(function () {
  const { el, toast, modal, fmtWhen } = BH.ui;
  const mc = document.getElementById('mc');
  const headActs = document.getElementById('fs-head-acts');
  const call = (action, payload) => BH.callFunction('fileshare', Object.assign({ action }, payload));
  const SEEN_KEY = 'fileshare_seen_at';

  const S = {
    status: null,       // from the edge function
    members: [],        // [{id, name}] from member_directory()
    files: [],          // shared_files rows visible to me
    recips: {},         // file_id -> [user_id]
    downloads: {},      // file_id -> [{user_id, user_name, downloaded_at, times}]
    seenAt: null,       // when I last opened File Share (for "New" tags)
    filter: 'all',      // all | mine | sent
    links: {},          // file_id -> download link, in case the browser blocks the download
  };

  /* ---------- helpers ---------- */
  function fmtSize(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(n < 10485760 ? 1 : 0) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  }
  function ago(ts) {
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
    if (s < 7 * 86400) { const d = Math.floor(s / 86400); return d + (d === 1 ? ' day ago' : ' days ago'); }
    return fmtWhen(ts);
  }
  function kind(name, mime) {
    const ext = (String(name).split('.').pop() || '').toLowerCase();
    if (/^image\//.test(mime || '') || /^(jpe?g|png|gif|heic|webp|bmp|tiff?)$/.test(ext)) return ['img', 'Photo'];
    if (/^video\//.test(mime || '') || /^(mp4|mov|avi|mkv|wmv|m4v)$/.test(ext)) return ['vid', 'Video'];
    if (/^audio\//.test(mime || '') || /^(mp3|m4a|wav|flac|aac|ogg|m4b)$/.test(ext)) return ['aud', 'Audio'];
    if (ext === 'pdf') return ['pdf', 'PDF'];
    if (/^(zip|7z|rar|gz|tar)$/.test(ext)) return ['zip', 'Archive'];
    if (/^(xlsx?|xlsm|csv|numbers)$/.test(ext)) return ['xls', 'Spreadsheet'];
    if (/^(docx?|rtf|txt|pages|odt)$/.test(ext)) return ['doc', 'Document'];
    if (/^(pptx?|key)$/.test(ext)) return ['ppt', 'Slides'];
    return ['file', ext ? ext.toUpperCase() : 'File'];
  }
  const ICONS = {
    img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
    vid: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2"/>',
    aud: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    pdf: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 15h8M8 18h5"/>',
    zip: '<path d="M21 8v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8"/><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M10 12h4"/>',
    xls: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
    doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h8"/>',
    ppt: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  };
  const svg = (paths, cls) => el('span', { class: cls || '', html: '<svg viewBox="0 0 24 24">' + paths + '</svg>' });
  const fname = (f) => f.bhName || f.name;   // dropped folders give their files a "folder/" prefix
  const memberName = (id) => (S.members.find((m) => m.id === id) || {}).name || 'someone';
  const isNew = (f) => f.sender_id !== BH.user.id && (!S.seenAt || new Date(f.created_at) > new Date(S.seenAt))
    && !(S.downloads[f.id] || []).some((d) => d.user_id === BH.user.id);

  /* ---------- data ---------- */
  async function loadSeen() {
    const { data } = await BH.sb.from('user_prefs').select('value').eq('key', SEEN_KEY).maybeSingle();
    S.seenAt = data && data.value ? String(data.value) : null;
  }
  async function markSeen() {
    const now = new Date().toISOString();
    await BH.sb.from('user_prefs').upsert({ user_id: BH.user.id, key: SEEN_KEY, value: now }, { onConflict: 'user_id,key' });
    try { if (window.parent && window.parent !== window) window.parent.postMessage({ bhFileShareSeen: true }, '*'); } catch (e) { /* ignore */ }
    try { const menu = window.top.frames['contents']; if (menu) menu.postMessage({ bhFileShareSeen: true }, '*'); } catch (e) { /* ignore */ }
  }
  async function loadFiles() {
    const { data, error } = await BH.sb.from('shared_files')
      .select('id, created_at, sender_id, sender_name, file_name, size_bytes, mime, note, everyone, download_count, last_download_at')
      .order('created_at', { ascending: false }).limit(500);
    if (error) throw new Error('Could not load files: ' + error.message);
    S.files = data || [];
    S.recips = {}; S.downloads = {};
    const ids = S.files.map((f) => f.id);
    if (!ids.length) return;
    const [r, d] = await Promise.all([
      BH.sb.from('shared_file_recipients').select('file_id, user_id').in('file_id', ids),
      BH.sb.from('shared_file_downloads').select('file_id, user_id, user_name, downloaded_at, times').in('file_id', ids),
    ]);
    (r.data || []).forEach((x) => (S.recips[x.file_id] = S.recips[x.file_id] || []).push(x.user_id));
    (d.data || []).forEach((x) => (S.downloads[x.file_id] = S.downloads[x.file_id] || []).push(x));
  }

  /* ---------- page ---------- */
  async function start() {
    try {
      const { user } = await BH.init();
      if (!user) return BH.requireLogin();
    } catch (e) { mc.replaceChildren(el('div', { class: 'bh-alert' }, e.message)); return; }
    if (BH.track) BH.track('fileshare');
    try {
      const [st, mem] = await Promise.all([
        call('status').catch((e) => ({ error: e.message })),
        BH.sb.rpc('member_directory'),
        loadSeen(),
      ]);
      S.status = st;
      S.members = (mem && mem.data) || [];
      if (st.connected) await loadFiles();
    } catch (e) { mc.replaceChildren(el('div', { class: 'bh-alert' }, e.message)); return; }
    render();
    if (S.status.connected) markSeen();
    window.addEventListener('focus', refreshQuiet);
  }
  let refreshing = false;
  async function refreshQuiet() {
    if (refreshing || !S.status || !S.status.connected || document.querySelector('.fs-uploading')) return;
    refreshing = true;
    try { await loadFiles(); renderList(); } catch (e) { /* keep what we have */ } finally { refreshing = false; }
  }

  function render() {
    const st = S.status || {};
    headActs.replaceChildren();
    if (st.error && !st.connected) {
      mc.replaceChildren(el('div', { class: 'bh-alert' }, st.error));
      return;
    }
    if (!st.connected) {
      mc.replaceChildren(st.is_admin ? connectCard() :
        el('div', { class: 'bh-card bh-card-pad' }, el('h2', null, 'Almost ready'),
          el('p', { class: 'bh-note', style: 'margin:0' }, 'File Share is not hooked up to Dropbox yet. An admin needs to connect it once, then it is ready for everyone.')));
      return;
    }
    if (st.is_admin) headActs.appendChild(el('button', { class: 'bh-btn sm', type: 'button', onclick: settingsModal }, 'Dropbox Settings'));
    mc.replaceChildren(sendCard(), el('div', { id: 'fs-list' }));
    renderList();
  }

  /* ---------- send a file ---------- */
  function sendCard() {
    let picked = [];
    const toEveryone = el('input', { type: 'checkbox' });
    const people = S.members.filter((m) => m.id !== BH.user.id);
    const boxes = people.map((m) => ({ m, box: el('input', { type: 'checkbox', value: m.id }) }));
    const announce = el('input', { type: 'checkbox' });
    const note = el('textarea', { rows: 2, maxLength: 1000, placeholder: 'Add a note (optional) - e.g. "Pictures from Thanksgiving"' });
    const err = el('div', { class: 'bh-err', style: 'text-align:left' });
    const fileInput = el('input', { type: 'file', multiple: true, style: 'display:none' });
    const pickedBox = el('div', { class: 'fs-picked' });
    const progress = el('div', { class: 'fs-progress' });
    const maxB = (S.status && S.status.max_bytes) || 150 * 1024 * 1024;

    function showPicked() {
      pickedBox.replaceChildren(...picked.map((f, i) => {
        const [k] = kind(f.name, f.type);
        const big = f.size > maxB, empty = f.size === 0;
        return el('div', { class: 'fs-chip' + (big || empty ? ' bad' : '') }, svg(ICONS[k], 'fs-ico sm k-' + k),
          el('span', { class: 'n' }, fname(f)), el('span', { class: 's' }, big ? 'too big (' + fmtSize(maxB) + ' max)' : empty ? 'empty - remove it' : fmtSize(f.size)),
          el('button', { class: 'bh-x', type: 'button', title: 'Remove', onclick: () => { picked.splice(i, 1); showPicked(); } }, '×'));
      }));
      drop.classList.toggle('has', picked.length > 0);
    }
    function add(list) {
      for (const f of list) if (!picked.some((p) => fname(p) === fname(f) && p.size === f.size)) picked.push(f);
      showPicked();
    }
    /* A dragged folder arrives as one empty "file". Open it up and add the files inside
       (sub-folders too), named "folder/file.ext" so you can tell where they came from.
       The entries must be read right away, while the drop event is still live. */
    async function filesFromDrop(dt) {
      const entries = [...(dt.items || [])].filter((i) => i.kind === 'file').map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
      if (!entries.some((en) => en && en.isDirectory)) return [...dt.files];
      const out = [];
      async function walk(en, prefix) {
        if (out.length >= 200) return;
        if (en.isFile) {
          const f = await new Promise((res, rej) => en.file(res, rej));
          if (prefix) f.bhName = prefix + f.name;
          out.push(f);
        } else if (en.isDirectory) {
          const reader = en.createReader();
          let batch;
          do {
            batch = await new Promise((res, rej) => reader.readEntries(res, rej));
            for (const child of batch) await walk(child, prefix + en.name + '/');
          } while (batch.length);
        }
      }
      for (const en of entries) if (en) await walk(en, '');
      if (out.length >= 200) toast('Only the first 200 files were added', 'error');
      return out;
    }
    fileInput.addEventListener('change', () => { add(fileInput.files); fileInput.value = ''; });
    const drop = el('div', { class: 'fs-drop', onclick: () => fileInput.click() },
      svg('<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>', 'fs-drop-ico'),
      el('div', { class: 'fs-drop-t' }, 'Drop files here or ', el('span', { class: 'bh-link' }, 'choose files')),
      el('div', { class: 'fs-drop-s' }, 'Up to ' + fmtSize(maxB) + ' each · any kind of file'));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => {
      if (!e.dataTransfer) return;
      filesFromDrop(e.dataTransfer).then(add).catch(() => add(e.dataTransfer.files));
    });

    function syncTo() {
      const all = toEveryone.checked;
      boxes.forEach(({ box }) => { box.disabled = all; if (all) box.checked = false; });
      peopleWrap.classList.toggle('dim', all);
      announce.checked = all;   // a heads-up in family chat makes sense for Everyone; private shares stay quiet
    }
    toEveryone.addEventListener('change', syncTo);
    const peopleWrap = el('div', { class: 'fs-people' },
      people.length ? boxes.map(({ m, box }) => el('label', { class: 'fs-person' }, box,
        el('span', { class: 'bh-av sm' }, BH.initials(m.name)), el('span', null, m.name)))
        : el('span', { class: 'bh-note', style: 'margin:0' }, 'No one else has an account yet - add family under ADMIN > Users.'));

    const sendBtn = el('button', { class: 'bh-btn primary', type: 'submit' }, 'Send');
    const form = el('form', { class: 'bh-card bh-card-pad fs-send', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      const recipients = boxes.filter((b) => b.box.checked).map((b) => b.m.id);
      if (!picked.length) { err.textContent = 'Choose a file to send.'; return; }
      if (picked.some((f) => f.size > maxB)) { err.textContent = 'Remove the files marked "too big" - ' + fmtSize(maxB) + ' is the most for one file.'; return; }
      if (picked.some((f) => f.size === 0)) { err.textContent = 'Remove the files marked "empty" - there is nothing in them to send.'; return; }
      if (!toEveryone.checked && !recipients.length) { err.textContent = 'Choose who the file is for - one or more people, or Everyone.'; return; }
      sendBtn.disabled = true; form.classList.add('fs-uploading');
      const files = picked.slice();
      const sentNames = [], failed = [];
      for (const f of files) {
        try {
          // the chat heads-up is posted once for the whole batch below, not per file
          await uploadOne(f, { recipients, everyone: toEveryone.checked, note: note.value.trim(), announce: false }, progress);
          sentNames.push(fname(f));
          picked = picked.filter((p) => p !== f); showPicked();
        } catch (x) {
          failed.push(fname(f) + ': ' + x.message);   // keep going with the rest
        }
      }
      sendBtn.disabled = false; form.classList.remove('fs-uploading');
      if (failed.length) err.replaceChildren(...failed.map((m) => el('div', null, m)));
      if (sentNames.length) {
        const to = toEveryone.checked ? 'everyone' : recipients.map(memberName).join(', ');
        toast((sentNames.length === 1 ? 'Sent to ' : sentNames.length + ' files sent to ') + to, 'ok');
        if (announce.checked) {
          const list = sentNames.length === 1 ? '"' + sentNames[0] + '"'
            : sentNames.length + ' files (' + sentNames.slice(0, 3).join(', ') + (sentNames.length > 3 ? ', and ' + (sentNames.length - 3) + ' more' : '') + ')';
          const { error } = await BH.sb.from('chat_messages').insert({ room: 'family', body: '📎 Shared ' + list + ' with ' + to + (sentNames.length === 1 ? " - it's" : " - they're") + ' in File Share on the menu.' });
          if (error) console.warn('chat heads-up:', error.message);
        }
        if (!picked.length) { note.value = ''; }
        await loadFiles().catch(() => {}); renderList();
      }
    } },
      el('h2', null, 'Send a File'),
      drop, fileInput, pickedBox,
      el('div', { class: 'fs-to' },
        el('div', { class: 'fs-label' }, 'Send to'),
        el('label', { class: 'fs-person everyone' }, toEveryone, el('span', { class: 'bh-av sm all' }, '★'), el('span', null, 'Everyone')),
        peopleWrap),
      el('label', { class: 'bh-field', style: 'margin:12px 0 6px' }, el('span', null, 'Note'), note),
      el('div', { class: 'fs-foot' },
        el('label', { class: 'fs-check' }, announce, ' Post a heads-up in Chat'),
        el('span', { style: 'flex:1' }),
        sendBtn),
      progress, err);
    return form;
  }

  /* one file: get a link, send the bytes to Dropbox, then tell the server it's there */
  async function uploadOne(file, opts, progressBox) {
    const row = el('div', { class: 'fs-prog-row' }, el('span', { class: 'n' }, fname(file)), el('span', { class: 'p' }, 'Starting…'));
    const bar = el('div', { class: 'fs-bar' }, el('i'));
    row.appendChild(bar);
    progressBox.appendChild(row);
    const setPct = (p, label) => { bar.firstChild.style.width = p + '%'; row.querySelector('.p').textContent = label; };
    let id = null;
    try {
      const start = await call('upload_start', {
        name: fname(file), size: file.size, mime: file.type || '', note: opts.note,
        everyone: opts.everyone, recipients: opts.recipients, announce: opts.announce,
      });
      id = start.id;
      if (start.chunked) await uploadChunked(file, start, setPct);
      else await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', start.link);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100), Math.round((e.loaded / e.total) * 100) + '% of ' + fmtSize(e.total)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Dropbox did not accept the file (' + xhr.status + ').')));
        xhr.onerror = () => reject(new Error('The upload was interrupted - check your connection and try again.'));
        xhr.send(file);
      });
      setPct(100, 'Finishing…');
      await call('upload_finish', { id });
      row.classList.add('done'); setPct(100, 'Sent');
      setTimeout(() => row.remove(), 2500);
    } catch (e) {
      row.classList.add('fail'); row.querySelector('.p').textContent = 'Failed';
      if (id) call('upload_cancel', { id }).catch(() => {});
      throw e;
    }
  }

  /* Files over 150 MB: a Dropbox upload session, 8 MB at a time, using a short-lived token
   * from the server (it reaches this site's app folder only). Each piece is retried a few
   * times, and a token that runs out partway through a long upload is swapped for a fresh one. */
  const CHUNK = 8 * 1024 * 1024;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Dropbox-API-Arg is an HTTP header, so anything outside plain ASCII must be \u-escaped
  const apiArg = (o) => JSON.stringify(o).replace(/[\u007f-\uffff]/g, (c) => '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4));
  async function uploadChunked(file, start, setPct) {
    let token = start.token;
    const total = file.size;
    function send(endpoint, arg, blob, base) {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://content.dropboxapi.com/2/files/' + endpoint);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('Dropbox-API-Arg', apiArg(arg));
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const pct = Math.min(99, Math.floor(((base + e.loaded) / total) * 100));
          setPct(pct, pct + '% of ' + fmtSize(total));
        };
        xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
        xhr.onerror = () => resolve({ status: 0, text: '' });
        xhr.send(blob);
      });
    }
    // send one piece; returns the parsed reply, or { skipped: true } when Dropbox already had it
    async function piece(endpoint, arg, blob, base) {
      for (let attempt = 1; ; attempt++) {
        const r = await send(endpoint, arg, blob, base);
        if (r.status >= 200 && r.status < 300) { try { return JSON.parse(r.text || 'null') || {}; } catch (e) { return {}; } }
        let j = null;
        try { j = JSON.parse(r.text); } catch (e) { /* not json */ }
        // a retry of a piece Dropbox actually received the first time
        const lk = j && j.error && j.error.lookup_failed;
        if (r.status === 409 && arg.cursor && lk && lk['.tag'] === 'incorrect_offset' && lk.correct_offset === arg.cursor.offset + blob.size) return { skipped: true };
        // a retried finish that Dropbox already completed - upload_finish checks the file is there
        if (r.status === 409 && attempt > 1 && /finish$/.test(endpoint)) return { skipped: true };
        if (r.status === 401 && attempt <= 2) { token = (await call('upload_token', { id: start.id })).token; continue; }
        if ((r.status === 0 || r.status === 429 || r.status >= 500) && attempt <= 5) { await sleep(1500 * attempt); continue; }
        const msg = (j && j.error_summary) || (r.text || '').slice(0, 120);
        throw new Error(r.status === 0 ? 'The upload was interrupted - check your connection and try again.'
          : 'Dropbox did not accept the file (' + r.status + (msg ? ': ' + msg : '') + ').');
      }
    }
    const first = await piece('upload_session/start', { close: false }, file.slice(0, CHUNK), 0);
    const session = first && first.session_id;
    if (!session) throw new Error('Dropbox did not start the upload - try again.');
    let offset = Math.min(CHUNK, total);
    while (total - offset > CHUNK) {
      await piece('upload_session/append_v2', { cursor: { session_id: session, offset }, close: false }, file.slice(offset, offset + CHUNK), offset);
      offset += CHUNK;
    }
    await piece('upload_session/finish', {
      cursor: { session_id: session, offset },
      commit: { path: start.path, mode: 'add', autorename: true, mute: false },
    }, file.slice(offset), offset);
  }

  /* ---------- the list ---------- */
  function renderList() {
    const box = document.getElementById('fs-list');
    if (!box) return;
    const me = BH.user.id;
    const forMe = S.files.filter((f) => f.sender_id !== me);
    const sent = S.files.filter((f) => f.sender_id === me);
    const newCount = forMe.filter(isNew).length;
    const shown = S.filter === 'mine' ? forMe : S.filter === 'sent' ? sent : S.files;
    const tab = (key, label, n, badge) => el('button', { class: 'fs-tab' + (S.filter === key ? ' on' : ''), type: 'button', onclick: () => { S.filter = key; renderList(); } },
      label, el('span', { class: 'c' }, String(n)), badge ? el('span', { class: 'fs-new-dot' }, badge + ' new') : null);
    box.replaceChildren(el('div', { class: 'bh-card fs-list' },
      el('div', { class: 'fs-tabs' },
        tab('all', 'All Files', S.files.length),
        tab('mine', 'Shared with Me', forMe.length, newCount),
        tab('sent', 'Sent by Me', sent.length),
        el('span', { style: 'flex:1' }),
        el('button', { class: 'bh-ib', type: 'button', title: 'Refresh', onclick: async (e) => { e.currentTarget.disabled = true; await loadFiles().catch((x) => toast(x.message, 'error')); renderList(); } },
          svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'))),
      shown.length ? shown.map(fileRow) : el('div', { class: 'bh-empty' },
        S.filter === 'sent' ? "You haven't shared anything yet." : S.filter === 'mine' ? 'Nothing has been shared with you yet.' : 'No files yet - send the first one above.')));
  }

  function fileRow(f) {
    const me = BH.user.id;
    const mine = f.sender_id === me;
    const [k, kLabel] = kind(f.file_name, f.mime);
    const rec = S.recips[f.id] || [];
    const dls = (S.downloads[f.id] || []).slice().sort((a, b) => new Date(b.downloaded_at) - new Date(a.downloaded_at));
    const to = f.everyone ? 'Everyone' : rec.map((u) => (u === me ? 'you' : memberName(u))).join(', ') || '—';
    const fresh = isNew(f);

    const dlBtn = el('button', { class: 'bh-btn sm primary', type: 'button', onclick: () => download(f, dlBtn) },
      svg('<path d="M12 4v12m0 0-4-4m4 4 4-4"/><path d="M4 18v2h16v-2"/>', 'bi'), 'Download');
    const acts = el('div', { class: 'fs-acts' }, dlBtn,
      (mine || (BH.isAdmin() && f.everyone)) ? el('button', { class: 'bh-ib red', type: 'button', title: 'Remove', onclick: () => removeFile(f) },
        svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')) : null);

    let status = null;
    if (mine) {
      if (dls.length) status = el('div', { class: 'fs-dl ok' }, '✓ Downloaded by ' + dls.map((d) => d.user_name || memberName(d.user_id)).join(', ') + ' · ' + ago(dls[0].downloaded_at));
      else status = el('div', { class: 'fs-dl' }, 'Not downloaded yet');
    }
    const fallback = S.links[f.id] ? el('div', { class: 'fs-dl' }, "Download didn't start? ", el('a', { class: 'bh-link', href: S.links[f.id], target: '_blank', rel: 'noopener' }, 'Open the file')) : null;

    return el('div', { class: 'fs-row' + (fresh ? ' fresh' : '') },
      svg(ICONS[k], 'fs-ico k-' + k),
      el('div', { class: 'fs-main' },
        el('div', { class: 'fs-name' }, f.file_name, fresh ? el('span', { class: 'fs-new' }, 'New') : null),
        el('div', { class: 'fs-meta' },
          el('span', null, kLabel), el('span', null, fmtSize(f.size_bytes)),
          el('span', null, (mine ? 'You' : f.sender_name || 'Someone') + ' → ' + to),
          el('span', { title: fmtWhen(f.created_at) }, ago(f.created_at))),
        f.note ? el('div', { class: 'fs-note' }, f.note) : null,
        status, fallback),
      acts);
  }

  async function download(f, btn) {
    btn.disabled = true;
    const label = btn.lastChild.textContent;
    btn.lastChild.textContent = 'Getting…';
    try {
      const r = await call('download', { id: f.id });
      S.links[f.id] = r.link;
      // a hidden frame lets the browser save it without leaving the page
      const frame = el('iframe', { style: 'display:none', src: r.link });
      document.body.appendChild(frame);
      setTimeout(() => frame.remove(), 60000);
      if (f.sender_id !== BH.user.id) {
        (S.downloads[f.id] = S.downloads[f.id] || []).push({ user_id: BH.user.id, user_name: BH.displayName(), downloaded_at: new Date().toISOString(), times: 1 });
      }
      toast('Downloading ' + f.file_name, 'ok');
      renderList();
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false; btn.lastChild.textContent = label;
    }
  }

  function removeFile(f) {
    modal({
      title: 'Remove File',
      body: el('p', { class: 'bh-note' }, 'Remove "' + f.file_name + '"? It is deleted from Dropbox and nobody will be able to download it.'),
      buttons: [{ label: 'Cancel' }, { label: 'Remove', danger: true, onClick: async (close) => {
        try { await call('delete', { id: f.id }); close(); toast('Removed', 'ok'); S.files = S.files.filter((x) => x.id !== f.id); renderList(); }
        catch (e) { toast(e.message, 'error'); }
      } }],
    });
  }

  /* ---------- admin: connect Dropbox (one time) ---------- */
  function connectCard() {
    const key = el('input', { placeholder: 'App key', autocomplete: 'off' });
    const sec = el('input', { placeholder: 'App secret', autocomplete: 'off', type: 'password' });
    const code = el('input', { placeholder: 'Paste the access code here', autocomplete: 'off' });
    const err = el('div', { class: 'bh-err', style: 'text-align:left' });
    const step2 = el('div', { class: 'fs-step2 bh-gone' });
    const go = el('button', { class: 'bh-btn primary', type: 'button', onclick: async () => {
      err.textContent = ''; go.disabled = true;
      try {
        const r = await call('connect_start', { app_key: key.value.trim(), app_secret: sec.value.trim() });
        step2.replaceChildren(
          el('p', { class: 'bh-note' }, 'Now open Dropbox, sign in as the account that should hold the files, click ', el('b', null, 'Allow'), ', and copy the code it shows you.'),
          el('a', { class: 'bh-btn', href: r.authorize_url, target: '_blank', rel: 'noopener' }, 'Open Dropbox to Allow ↗'),
          el('label', { class: 'bh-field', style: 'margin-top:12px' }, el('span', null, 'Access Code'), code),
          el('button', { class: 'bh-btn primary', type: 'button', onclick: async (e) => {
            err.textContent = ''; e.currentTarget.disabled = true;
            try {
              const done = await call('connect_finish', { code: code.value.trim() });
              toast('Dropbox connected' + (done.account ? ' - ' + done.account : ''), 'ok');
              S.status = await call('status'); await loadFiles(); render();
            } catch (x) { err.textContent = x.message; e.currentTarget.disabled = false; }
          } }, 'Finish Connecting'));
        step2.classList.remove('bh-gone');
      } catch (x) { err.textContent = x.message; }
      go.disabled = false;
    } }, 'Continue');
    const li = (...k) => el('li', null, ...k);
    return el('div', { class: 'bh-card bh-card-pad fs-connect' },
      el('h2', null, 'Connect Dropbox'),
      el('p', { class: 'bh-note' }, 'One-time setup. File Share keeps files in its own folder in your Dropbox (Apps › the app name you pick) and can\'t see anything else in your Dropbox.'),
      el('ol', { class: 'fs-steps' },
        li('Go to ', el('a', { class: 'bh-link', href: 'https://www.dropbox.com/developers/apps/create', target: '_blank', rel: 'noopener' }, 'dropbox.com/developers/apps/create'), '.'),
        li('Choose ', el('b', null, 'Scoped access'), ', then ', el('b', null, 'App folder'), ', and name it something like ', el('b', null, 'Bellhive File Share'), '. Click Create app.'),
        li('On the ', el('b', null, 'Permissions'), ' tab, tick ', el('code', null, 'files.metadata.read'), ', ', el('code', null, 'files.content.write'), ' and ', el('code', null, 'files.content.read'), ', then click ', el('b', null, 'Submit'), '.'),
        li('Back on the ', el('b', null, 'Settings'), ' tab, copy the ', el('b', null, 'App key'), ' and ', el('b', null, 'App secret'), ' (click Show) into the boxes below.')),
      el('div', { class: 'bh-grid2' },
        el('label', { class: 'bh-field' }, el('span', null, 'App Key'), key),
        el('label', { class: 'bh-field' }, el('span', null, 'App Secret'), sec)),
      go, step2, err);
  }

  function settingsModal() {
    const st = S.status || {};
    const sp = st.space;
    modal({
      title: 'Dropbox Settings',
      body: [
        el('dl', { class: 'bh-kv' },
          el('dt', null, 'Account'), el('dd', null, st.account || 'Connected'),
          el('dt', null, 'Dropbox space'), el('dd', null, sp ? fmtSize(sp.used) + ' used' + (sp.allocated ? ' of ' + fmtSize(sp.allocated) : '') : '—'),
          el('dt', null, 'Files here'), el('dd', null, String(S.files.length) + ' you can see'),
          el('dt', null, 'Per-file limit'), el('dd', null, fmtSize(st.max_bytes || 0))),
        el('p', { class: 'bh-note', style: 'margin-top:14px' }, 'Disconnecting stops uploads and downloads. Files already in Dropbox stay there.'),
      ],
      buttons: [
        { label: 'Disconnect', danger: true, onClick: async (close) => {
          if (!confirmDisconnect()) return;
          try { await call('disconnect'); close(); toast('Dropbox disconnected', 'ok'); S.status = await call('status'); render(); }
          catch (e) { toast(e.message, 'error'); }
        } },
        { label: 'Close', primary: true },
      ],
    });
  }
  let armed = false;
  function confirmDisconnect() {
    if (armed) return true;
    armed = true; toast('Click Disconnect again to confirm', '');
    setTimeout(() => (armed = false), 4000);
    return false;
  }

  start();
})();
