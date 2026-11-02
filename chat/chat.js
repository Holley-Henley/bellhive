/* bellhive99.com - Chat window (chat/index.html).
 * Live messages come from the chat_messages table (Supabase realtime); "who's here" and
 * "typing…" ride the private bh-chat channel. When this window is inside the site's home
 * page it tells the site bar what has been read, so the unread badge clears. */
(function () {
  const $ = (id) => document.getElementById(id);
  const BH = window.BH, C = BH && BH.chat;
  const list = $('ch-list'), input = $('ch-input'), send = $('ch-send');
  const PAGE = 60, GROUP_MS = 5 * 60 * 1000;

  const embedded = window.top !== window;
  if (!embedded) document.body.classList.add('standalone');

  let msgs = [];            // sorted by id
  const byId = new Map();
  let lastRead = 0, newLineAt = 0, hasMore = false, loadingOlder = false;
  let presence = null, dbChannel = null, people = [];
  const typers = new Map();
  let seen = true;          // is the chat on screen right now?
  let tempSeq = 0;

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function linkify(s) {
    return esc(s).replace(/\b(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function dayLabel(d) {
    const now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
    if (dayKey(d) === dayKey(now)) return 'Today';
    if (dayKey(d) === dayKey(y)) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  function timeLabel(d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  function nearBottom() { return list.scrollHeight - list.scrollTop - list.clientHeight < 80; }
  function toBottom() { list.scrollTop = list.scrollHeight; $('ch-jump').classList.add('bh-gone'); }
  function status(text, err) { list.innerHTML = ''; const d = document.createElement('div'); d.className = 'ch-status' + (err ? ' err' : ''); d.textContent = text; list.appendChild(d); }
  function tell(msg) { if (embedded) { try { window.top.postMessage(Object.assign({ bhChat: true }, msg), '*'); } catch (e) { /* top gone */ } } }

  /* ---------------- rendering ---------------- */
  function render(opts) {
    opts = opts || {};
    const keep = opts.keepScroll ? list.scrollHeight - list.scrollTop : null;
    list.innerHTML = '';
    if (hasMore) {
      const b = document.createElement('button');
      b.className = 'bh-btn sm ch-more'; b.type = 'button'; b.textContent = 'Load earlier messages';
      b.onclick = loadOlder; list.appendChild(b);
    }
    if (!msgs.length) {
      list.insertAdjacentHTML('beforeend', '<div class="ch-empty"><b>No messages yet</b>Say hi — everyone signed in will see it right away.</div>');
      return;
    }
    let prev = null, lastDay = '', newShown = false;
    msgs.forEach((m, i) => {
      const d = new Date(m.created_at);
      if (dayKey(d) !== lastDay) { lastDay = dayKey(d); prev = null; list.insertAdjacentHTML('beforeend', '<div class="ch-day">' + esc(dayLabel(d)) + '</div>'); }
      if (!newShown && newLineAt && m.id > newLineAt && m.user_id !== BH.user.id && typeof m.id === 'number') {
        newShown = true; prev = null; list.insertAdjacentHTML('beforeend', '<div class="ch-new">New</div>');
      }
      const next = msgs[i + 1];
      const first = !prev || prev.user_id !== m.user_id || d - new Date(prev.created_at) > GROUP_MS;
      const last = !next || next.user_id !== m.user_id || new Date(next.created_at) - d > GROUP_MS || dayKey(new Date(next.created_at)) !== lastDay;
      list.appendChild(row(m, first, last));
      prev = m;
    });
    if (keep != null) list.scrollTop = list.scrollHeight - keep;
  }

  function row(m, first, last) {
    const mine = m.user_id === BH.user.id;
    const d = new Date(m.created_at);
    const el = document.createElement('div');
    el.className = 'ch-msg' + (mine ? ' mine' : '') + (first ? ' first' : '') + (last ? ' last' : '') +
      (m._pending ? ' pending' : '') + (m._failed ? ' failed' : '') + (m._fresh ? ' fresh' : '');
    el.dataset.id = m.id;
    const name = m.sender_name || 'Someone';
    el.innerHTML =
      '<span class="ch-av" style="background:' + C.color(m.user_id) + '" title="' + esc(name) + '">' + esc(BH.initials(name)) + '</span>' +
      '<div class="ch-col">' +
        (first ? '<div class="ch-meta">' + (mine ? '' : '<b>' + esc(C.first(name)) + '</b>') + esc(timeLabel(d)) + '</div>' : '') +
        '<div class="ch-bubble">' + linkify(m.body) + '</div>' +
        (m._failed ? '<div class="ch-fail">Didn\'t send — tap to try again</div>' : '') +
      '</div>' +
      (first ? '' : '<span class="ch-time">' + esc(timeLabel(d)) + '</span>') +
      ((mine || BH.isAdmin()) && !m._pending ? '<button class="ch-del" type="button" title="Delete message" aria-label="Delete message">×</button>' : '');
    const del = el.querySelector('.ch-del');
    if (del) del.onclick = () => removeMsg(m);
    const fail = el.querySelector('.ch-fail');
    if (fail) fail.onclick = () => { drop(m.id); render(); sendText(m.body); };
    m._fresh = false;
    return el;
  }

  /* ---------------- data ---------------- */
  function add(m, fresh) {
    if (byId.has(m.id)) return false;
    if (fresh) m._fresh = true;
    byId.set(m.id, m);
    msgs.push(m);
    msgs.sort((a, b) => (typeof a.id === 'number' ? a.id : Infinity) - (typeof b.id === 'number' ? b.id : Infinity));
    return true;
  }
  function drop(id) { if (!byId.has(id)) return; byId.delete(id); msgs = msgs.filter((x) => x.id !== id); }
  function newestId() { for (let i = msgs.length - 1; i >= 0; i--) if (typeof msgs[i].id === 'number') return msgs[i].id; return 0; }

  async function loadLatest() {
    const { data, error } = await BH.sb.from('chat_messages').select(C.COLS).eq('room', C.ROOM).order('id', { ascending: false }).limit(PAGE);
    if (error) throw error;
    hasMore = data.length === PAGE;
    data.reverse().forEach((m) => add(m));
  }
  async function loadOlder() {
    if (loadingOlder) return;
    const oldest = msgs.find((m) => typeof m.id === 'number');
    if (!oldest) return;
    loadingOlder = true;
    const { data, error } = await BH.sb.from('chat_messages').select(C.COLS).eq('room', C.ROOM).lt('id', oldest.id).order('id', { ascending: false }).limit(PAGE);
    loadingOlder = false;
    if (error) { BH.ui.toast('Could not load older messages', 'error'); return; }
    hasMore = data.length === PAGE;
    data.forEach((m) => add(m));
    render({ keepScroll: true });
  }
  /* after a dropped connection or a sleeping laptop: pick up anything missed */
  async function catchUp() {
    const since = newestId();
    if (!since) return;
    const { data } = await BH.sb.from('chat_messages').select(C.COLS).eq('room', C.ROOM).gt('id', since).order('id').limit(200);
    if (!data || !data.length) return;
    const stick = nearBottom();
    data.forEach((m) => add(m, true));
    render();
    if (stick) toBottom(); else $('ch-jump').classList.remove('bh-gone');
    markRead();
  }

  function incoming(m) {
    // my own message coming back: swap the "sending…" copy for the real one
    const temp = msgs.find((x) => x._pending && x.user_id === m.user_id && x.body === m.body);
    if (temp) drop(temp.id);
    const stick = nearBottom() || m.user_id === BH.user.id;
    if (!add(m, true)) return;
    if (m.user_id !== BH.user.id) typers.delete(m.user_id), showTyping();
    render();
    if (stick) toBottom(); else $('ch-jump').classList.remove('bh-gone');
    if (m.user_id !== BH.user.id) {
      if (!seen || document.visibilityState !== 'visible') {
        // standalone page (e.g. on a phone): this window does the alerting itself.
        // Inside the home page the site bar (notify.js) alerts instead.
        if (!embedded) { C.chime(); if (document.visibilityState !== 'visible') C.desktop(m); bumpTitle(); }
      }
    }
    markRead();
  }

  function markRead() {
    if (!seen || document.visibilityState !== 'visible' || !nearBottom()) return;
    const id = newestId();
    if (id > lastRead) { lastRead = id; C.saveLastRead(id); }
    tell({ read: id });
    if (!embedded) resetTitle();
  }

  /* ---------------- sending / deleting ---------------- */
  async function sendText(text) {
    text = String(text || '').trim();
    if (!text) return;
    const temp = { id: 'tmp' + (++tempSeq), user_id: BH.user.id, sender_name: BH.displayName(), body: text, created_at: new Date().toISOString(), _pending: true };
    add(temp, true); render(); toBottom();
    const { data, error } = await BH.sb.from('chat_messages').insert({ room: C.ROOM, body: text }).select(C.COLS).single();
    if (error) {
      temp._pending = false; temp._failed = true; render();
      BH.ui.toast('Message not sent: ' + error.message, 'error');
      return;
    }
    drop(temp.id);
    add(data);
    render(); toBottom(); markRead();
    C.sentSound();
  }
  async function removeMsg(m) {
    if (!confirmDelete()) return;
    drop(m.id); render({ keepScroll: true });
    const { error } = await BH.sb.from('chat_messages').delete().eq('id', m.id);
    if (error) { add(m); render({ keepScroll: true }); BH.ui.toast('Could not delete: ' + error.message, 'error'); }
  }
  function confirmDelete() { return window.confirm('Delete this message for everyone?'); }

  /* ---------------- typing + who's here ---------------- */
  let lastPing = 0;
  function pingTyping() { const now = Date.now(); if (presence && now - lastPing > 2500) { lastPing = now; presence.typing(); } }
  function showTyping() {
    const now = Date.now();
    for (const [k, v] of typers) if (now - v.at > 4000) typers.delete(k);
    const names = [...typers.values()].map((v) => C.first(v.name));
    $('ch-typing').innerHTML = names.length
      ? esc(names.length === 1 ? names[0] + ' is typing' : names.join(' and ') + ' are typing') + ' <span class="dots"><i></i><i></i><i></i></span>'
      : '';
  }
  setInterval(showTyping, 1500);

  function showPeople(p) {
    people = p;
    const here = $('ch-here');
    here.classList.add('live');
    here.classList.toggle('others', p.some((x) => x.id !== BH.user.id));
    $('ch-here-txt').textContent = C.hereText(p);
    here.title = p.length ? 'On the site now: ' + p.map((x) => x.name).join(', ') : '';
  }

  /* ---------------- title badge when standalone ---------------- */
  const baseTitle = document.title; let unseen = 0;
  function bumpTitle() { unseen++; document.title = '(' + unseen + ') ' + baseTitle; }
  function resetTitle() { unseen = 0; document.title = baseTitle; }

  /* ---------------- header buttons ---------------- */
  const ICON_BELL = '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
  const ICON_BELL_OFF = '<svg viewBox="0 0 24 24"><path d="M13.7 21a2 2 0 0 1-3.4 0"/><path d="M18.6 13A17 17 0 0 1 18 8"/><path d="M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.3-5"/><path d="M2 2l20 20"/></svg>';
  const ICON_SOUND = '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
  const ICON_MUTE = '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M23 9l-6 6"/><path d="M17 9l6 6"/></svg>';
  function paintTools() {
    const p = C.prefs();
    const deskOn = p.desktop && C.canDesktop() && Notification.permission === 'granted';
    $('ch-bell').innerHTML = deskOn ? ICON_BELL : ICON_BELL_OFF;
    $('ch-bell').classList.toggle('on', deskOn);
    $('ch-bell').title = deskOn ? 'Desktop alerts are on — click to turn off' : 'Turn on desktop alerts for when you are in another tab or app';
    $('ch-sound').innerHTML = p.sound ? ICON_SOUND : ICON_MUTE;
    $('ch-sound').classList.toggle('on', p.sound);
    $('ch-sound').title = p.sound ? 'Sounds are on (sent + new message) — click to mute' : 'Sounds are off — click to turn on';
  }
  $('ch-sound').onclick = () => { const p = C.setPref('sound', !C.prefs().sound); paintTools(); if (p.sound) { C.sentSound(); setTimeout(C.chime, 350); } };
  $('ch-bell').onclick = async () => {
    if (!C.canDesktop()) { BH.ui.toast('This browser does not support desktop alerts', 'error'); return; }
    if (C.prefs().desktop && Notification.permission === 'granted') { C.setPref('desktop', false); paintTools(); return; }
    let perm = Notification.permission;
    if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; } }
    if (perm === 'granted') { C.setPref('desktop', true); BH.ui.toast('Desktop alerts on for this browser', 'ok'); }
    else BH.ui.toast('Alerts are blocked — allow notifications for bellhive99.com in your browser settings', 'error');
    paintTools();
  };

  /* ---------------- composer ---------------- */
  function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight + 2, 120) + 'px'; send.disabled = !input.value.trim(); }
  input.addEventListener('input', () => { grow(); if (input.value.trim()) pingTyping(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('ch-form').requestSubmit(); }
  });
  $('ch-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    if (!text.trim()) return;
    input.value = ''; grow();
    sendText(text);
  });
  $('ch-jump').onclick = () => { toBottom(); markRead(); };
  list.addEventListener('scroll', () => {
    if (nearBottom()) { $('ch-jump').classList.add('bh-gone'); markRead(); }
    if (hasMore && list.scrollTop < 40) loadOlder();
  });

  /* ---------------- on screen? ---------------- */
  function setSeen(v) { if (v === seen) return; seen = v; tell({ open: true, visible: seen && document.visibilityState === 'visible' }); if (seen) markRead(); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((ents) => setSeen(ents[0].intersectionRatio > 0.35), { threshold: [0, 0.35, 0.7] }).observe(document.querySelector('.ch'));
  }
  document.addEventListener('visibilitychange', () => {
    tell({ open: true, visible: seen && document.visibilityState === 'visible' });
    if (document.visibilityState === 'visible') { markRead(); catchUp(); }
  });
  window.addEventListener('pagehide', () => tell({ open: false }));
  window.addEventListener('focus', () => { if (!embedded) markRead(); });
  /* the site bar asks us to show up (clicked "Chat") */
  window.addEventListener('message', (e) => {
    if (e.data && e.data.bhChatFocus) { toBottom(); input.focus(); markRead(); }
  });

  /* ---------------- start ---------------- */
  async function start() {
    paintTools();
    try {
      const { user } = await BH.init();
      if (!user) {
        if (embedded) { status('Sign in to see Chat.'); return; }
        await BH.requireLogin(); return;
      }
      lastRead = await C.getLastRead().catch(() => 0);
      newLineAt = lastRead;
      await loadLatest();
      render(); toBottom();
      input.disabled = false; grow();
      if (!embedded || location.hash === '#focus') input.focus();

      await C.realtimeAuth();
      dbChannel = BH.sb.channel('chat-db-' + Math.random().toString(36).slice(2, 8))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'room=eq.' + C.ROOM }, (p) => incoming(p.new))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (p) => { if (p.old && byId.has(p.old.id)) { drop(p.old.id); render({ keepScroll: true }); } })
        .subscribe((s) => { if (s === 'SUBSCRIBED') catchUp(); });
      presence = C.joinPresence(showPeople, (who) => { typers.set(who.id, { name: who.name, at: Date.now() }); showTyping(); });
      setTimeout(() => { if (!people.length) $('ch-here-txt').textContent = 'Live'; $('ch-here').classList.add('live'); }, 4000);

      tell({ open: true, visible: seen && document.visibilityState === 'visible' });
      markRead();
      if (!embedded) { if (BH.track) BH.track('chat'); if (BH.pageOpen) BH.pageOpen('Chat', 'chat'); }
    } catch (err) {
      status('Chat could not load: ' + (err.message || err), true);
      $('ch-here-txt').textContent = 'Offline';
    }
  }
  start();
})();
