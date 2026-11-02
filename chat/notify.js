/* bellhive99.com - "something's going on" alerts for Chat, on the home page site bar.
 *
 * index.html loads it after auth/auth.js (and track.js):
 *   <script src="chat/common.js"></script>
 *   <script src="chat/notify.js"></script>
 * It starts itself once someone is signed in and stops on sign-out. It adds:
 *   - a Chat button on the site bar with an unread count and who else is on the site
 *   - the unread count in the browser tab title (flashes when the tab is in the background)
 *   - a pop-up with the new message (click it to jump to the chat)
 *   - a chime, and desktop alerts if turned on with the bell in the chat window
 * Nothing pops up when the chat window is already on screen - you're reading it. */
(function () {
  const BH = window.BH, C = BH && BH.chat;
  if (!BH || !C) return;

  const CSS = `
  .bh-chat-pill { position: relative; display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 10px 0 8px; border-radius: 14px;
    border: 1px solid rgba(255,255,255,.22); background: rgba(255,255,255,.1); color: rgba(255,255,255,.92); font: 600 12px var(--bh-font); cursor: pointer; white-space: nowrap; }
  .bh-chat-pill:hover { background: rgba(255,255,255,.2); }
  .bh-chat-pill svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linejoin: round; }
  .bh-chat-pill .ppl { display: inline-flex; }
  .bh-chat-pill .ppl i { width: 18px; height: 18px; border-radius: 50%; margin-left: -5px; border: 2px solid var(--bh-brand); font: 700 8px/14px var(--bh-font); font-style: normal; color: #fff; text-align: center; position: relative; }
  .bh-chat-pill .ppl i:first-child { margin-left: 0; }
  .bh-chat-pill .ppl i::after { content: ''; position: absolute; right: -3px; bottom: -3px; width: 6px; height: 6px; border-radius: 50%; background: #4cd07d; border: 1.5px solid var(--bh-brand); }
  .bh-chat-pill .cnt { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--bh-red); color: #fff; font: 700 11px/18px var(--bh-font); text-align: center; }
  .bh-chat-pill.unread { background: var(--bh-accent); border-color: var(--bh-accent); color: var(--bh-accent-ink); animation: bh-chat-glow 1.6s ease-in-out infinite; }
  .bh-chat-pill.unread .ppl i { border-color: var(--bh-accent); }
  .bh-chat-pill.unread .ppl i::after { border-color: var(--bh-accent); }
  @keyframes bh-chat-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(242,177,52,.0); } 50% { box-shadow: 0 0 0 5px rgba(242,177,52,.35); } }
  .bh-chat-pill.bump { animation: bh-chat-bump .5s ease-out; }
  .bh-chat-pill.unread.bump { animation: bh-chat-bump .5s ease-out, bh-chat-glow 1.6s ease-in-out .5s infinite; }
  @keyframes bh-chat-bump { 0% { transform: scale(1); } 30% { transform: scale(1.14); } 100% { transform: scale(1); } }
  @media (max-width: 640px) { .bh-chat-pill .lbl { display: none; } }

  .bh-chat-pop { position: fixed; top: 52px; right: 14px; z-index: 980; width: 320px; max-width: calc(100vw - 28px); display: flex; gap: 10px; align-items: flex-start;
    padding: 11px 12px; background: #fff; border: 1px solid var(--bh-border2); border-left: 4px solid var(--bh-accent); border-radius: 10px; box-shadow: 0 12px 34px rgba(30,24,14,.28);
    font: 13px/1.35 var(--bh-font); color: var(--bh-text); cursor: pointer; transform: translateX(16px); opacity: 0; transition: .25s; }
  .bh-chat-pop.show { transform: none; opacity: 1; }
  .bh-chat-pop .av { width: 30px; height: 30px; flex: none; border-radius: 50%; color: #fff; font: 700 11px/30px var(--bh-font); text-align: center; }
  .bh-chat-pop .tx { min-width: 0; flex: 1; }
  .bh-chat-pop b { display: block; font-size: 12px; color: var(--bh-text2); }
  .bh-chat-pop .bd { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; }
  .bh-chat-pop .go { display: block; margin-top: 4px; font-size: 11px; font-weight: 600; color: #9a6a10; }
  .bh-chat-pop .x { border: 0; background: none; color: var(--bh-text3); font-size: 18px; line-height: 1; cursor: pointer; padding: 0 0 0 4px; }`;

  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.6-4.6A8 8 0 1 1 21 12z"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let started = false, starting = false, pill = null, pop = null, popTimer = null;
  let dbCh = null, presence = null, people = [];
  const unread = new Map();          // id -> message from someone else, not read yet
  let lastRead = 0;
  let chatWin = null, chatOpen = false, chatVisible = false, wantFocus = false;
  let baseTitle = document.title, flashTimer = null, flashOn = false;

  function mainFrame() { return document.querySelector('iframe[name=main]'); }

  /* ---------------- site bar button ---------------- */
  function makePill() {
    const bar = document.querySelector('.bh-bar');
    if (!bar) return null;
    if (!document.getElementById('bh-chat-css')) {
      const st = document.createElement('style'); st.id = 'bh-chat-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'bh-chat-pill'; b.id = 'bh-chat-pill';
    b.addEventListener('click', openChat);
    bar.insertBefore(b, document.getElementById('bh-av') || null);
    return b;
  }
  function paint() {
    if (!pill) return;
    const n = unread.size;
    const others = people.filter((p) => p.id !== BH.user.id);
    pill.classList.toggle('unread', n > 0);
    pill.innerHTML = ICON +
      (others.length ? '<span class="ppl">' + others.slice(0, 3).map((p) =>
        '<i style="background:' + C.color(p.id) + '">' + esc(BH.initials(p.name)) + '</i>').join('') + '</span>' : '') +
      '<span class="lbl">' + (n ? 'New in Chat' : 'Chat') + '</span>' +
      (n ? '<span class="cnt">' + (n > 99 ? '99+' : n) + '</span>' : '');
    const bits = [];
    if (n) bits.push(n + ' unread message' + (n === 1 ? '' : 's'));
    bits.push(others.length ? C.hereText(people) : 'Nobody else is on the site right now');
    pill.title = bits.join(' · ') + ' — click to open Chat';
    paintTitle();
  }

  /* ---------------- tab title ---------------- */
  function paintTitle() {
    const n = unread.size;
    if (!n) { stopFlash(); document.title = baseTitle; return; }
    if (document.visibilityState === 'hidden') { startFlash(); return; }
    stopFlash();
    document.title = '(' + n + ') ' + baseTitle;
  }
  function startFlash() {
    if (flashTimer) return;
    flashTimer = setInterval(() => {
      flashOn = !flashOn;
      const latest = [...unread.values()].pop();
      document.title = flashOn && latest ? '💬 ' + C.first(latest.sender_name) + ' says…' : '(' + unread.size + ') ' + baseTitle;
    }, 1400);
  }
  function stopFlash() { clearInterval(flashTimer); flashTimer = null; flashOn = false; }
  document.addEventListener('visibilitychange', () => { if (started) paintTitle(); });

  /* ---------------- pop-up ---------------- */
  function showPop(m) {
    if (!pop) { pop = document.createElement('div'); pop.className = 'bh-chat-pop'; pop.setAttribute('role', 'status'); document.body.appendChild(pop); }
    const name = m.sender_name || 'Someone';
    pop.innerHTML = '<span class="av" style="background:' + C.color(m.user_id) + '">' + esc(BH.initials(name)) + '</span>' +
      '<div class="tx"><b>' + esc(C.first(name)) + ' · Chat</b><div class="bd">' + esc(m.body) + '</div><span class="go">Open chat →</span></div>' +
      '<button class="x" type="button" aria-label="Dismiss">×</button>';
    pop.onclick = (e) => { hidePop(); if (!e.target.classList.contains('x')) openChat(); };
    requestAnimationFrame(() => pop.classList.add('show'));
    clearTimeout(popTimer);
    popTimer = setTimeout(hidePop, 8000);
  }
  function hidePop() { if (pop) pop.classList.remove('show'); clearTimeout(popTimer); }

  /* ---------------- open the chat in the main frame ---------------- */
  function openChat() {
    hidePop();
    if (chatAlive()) {
      try { chatWin.frameElement && chatWin.frameElement.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* file:// */ }
      chatWin.postMessage({ bhChatFocus: true }, '*');
      return;
    }
    const f = mainFrame();
    wantFocus = true;
    if (f) f.src = 'INDEXB.HTM#chat';
    else location.href = 'chat/index.html#focus';
  }

  /* is the chat window still there? (it can vanish without saying goodbye when the menu loads another page) */
  function chatAlive() {
    if (!chatOpen || !chatWin) return false;
    let alive = true;
    try { alive = !chatWin.closed && !!chatWin.document && chatWin.document.querySelector('.ch') != null; } catch (e) { alive = !chatWin.closed; }
    if (!alive) { chatOpen = false; chatWin = null; chatVisible = false; }
    return alive;
  }

  /* ---------------- messages from the chat window ---------------- */
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.bhChat !== true) return;
    if ('open' in d) {
      chatOpen = !!d.open; chatWin = d.open ? e.source : null;
      chatVisible = !!(d.open && d.visible);
      if (chatOpen && wantFocus) { wantFocus = false; e.source.postMessage({ bhChatFocus: true }, '*'); }
    }
    if (d.read) markRead(d.read);
  });
  function markRead(id) {
    if (id > lastRead) lastRead = id;
    for (const k of [...unread.keys()]) if (k <= id) unread.delete(k);
    paint();
    if (!unread.size) hidePop();
  }

  /* ---------------- live feed ---------------- */
  function incoming(m) {
    if (!m || m.user_id === BH.user.id || m.id <= lastRead || unread.has(m.id)) return;
    const looking = chatVisible && document.visibilityState === 'visible' && chatAlive();
    if (looking) return;                    // the chat window marks it read
    unread.set(m.id, m);
    paint();
    if (pill) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
    C.chime();
    if (document.visibilityState === 'visible') showPop(m);
    else C.desktop(m, openChat);
  }

  async function loadUnread() {
    lastRead = await C.getLastRead().catch(() => 0);
    const { data } = await BH.sb.from('chat_messages').select(C.COLS).eq('room', C.ROOM)
      .gt('id', lastRead).neq('user_id', BH.user.id).order('id').limit(99);
    (data || []).forEach((m) => unread.set(m.id, m));
  }

  async function start() {
    if (started || starting) return;
    starting = true;
    try {
      for (let i = 0; i < 100 && !BH.profile; i++) await new Promise((r) => setTimeout(r, 100)); // signing in…
      if (!BH.user || !BH.profile) return;
      baseTitle = document.title.replace(/^\(\d+\+?\)\s*/, '');
      pill = document.getElementById('bh-chat-pill') || makePill();
      await loadUnread();
      paint();
      await C.realtimeAuth();
      dbCh = BH.sb.channel('chat-bar-' + Math.random().toString(36).slice(2, 8))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'room=eq.' + C.ROOM }, (p) => incoming(p.new))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (p) => { if (p.old && unread.delete(p.old.id)) paint(); })
        .subscribe();
      presence = C.joinPresence((p) => { people = p; paint(); });
      started = true;
      if (unread.size) setTimeout(() => { if (pill) pill.classList.add('bump'); }, 600);
    } catch (e) {
      console.warn('chat alerts:', e);
    } finally { starting = false; }
  }

  function stop() {
    started = false;
    try { if (dbCh) BH.sb.removeChannel(dbCh); } catch (e) { /* gone */ }
    if (presence) presence.leave();
    dbCh = null; presence = null; people = []; unread.clear(); lastRead = 0;
    chatOpen = false; chatWin = null; chatVisible = false;
    hidePop(); stopFlash(); document.title = baseTitle;
    if (pill) { pill.remove(); pill = null; }
  }

  BH.chatNotify = { start, stop, open: openChat };

  /* start/stop by themselves with the site sign-in */
  if (BH.sb) {
    BH.sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setTimeout(stop, 0);
      else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') setTimeout(() => { if (BH.user || event === 'SIGNED_IN') start(); }, 0);
    });
  }
  BH.init && BH.init().then(({ user }) => { if (user) start(); }).catch(() => {});
})();
