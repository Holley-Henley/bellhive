/* bellhive99.com - Chat helpers shared by the chat window (chat.js) and the
 * site bar alerts (notify.js). Load after auth/auth.js. */
(function () {
  const BH = window.BH;
  if (!BH) return;
  const PREF_KEY = 'bh99-chat-prefs';
  const C = (BH.chat = BH.chat || {});

  C.ROOM = 'family';
  C.TOPIC = 'bh-chat';           // private realtime channel for "who's here" + "typing"
  C.COLS = 'id,user_id,sender_name,body,created_at';

  /* --- this browser's alert settings (sound on by default, desktop alerts opt-in) --- */
  C.prefs = function () {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { /* storage blocked */ }
    return { sound: p.sound !== false, desktop: !!p.desktop };
  };
  C.setPref = function (k, v) {
    const p = C.prefs(); p[k] = v;
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
    return p;
  };

  /* --- soft two-note chime, no audio file needed --- */
  let ctx = null;
  C.chime = function () {
    if (!C.prefs().sound) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      [[880, 0], [1318.5, 0.11]].forEach(([f, d]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.16, t + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.45);
        o.connect(g).connect(ctx.destination); o.start(t + d); o.stop(t + d + 0.5);
      });
    } catch (e) { /* browser blocked audio until the page is clicked */ }
  };

  /* --- quick soft "swoop" when your own message goes out (quieter than the incoming chime) --- */
  C.sentSound = function () {
    if (!C.prefs().sound) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(1040, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.2);
    } catch (e) { /* audio blocked */ }
  };

  /* --- desktop notification (only when this tab isn't being looked at) --- */
  C.canDesktop = () => 'Notification' in window;
  C.desktop = function (msg, onClick) {
    try {
      if (!C.prefs().desktop || !C.canDesktop() || Notification.permission !== 'granted') return;
      const n = new Notification((msg.sender_name || 'Someone') + ' · Chat', {
        body: String(msg.body || '').slice(0, 180), tag: 'bh99-chat', renotify: true,
        icon: BH.root + 'chat/icon.png',
      });
      n.onclick = () => { try { window.focus(); if (onClick) onClick(); } catch (e) { /* ignore */ } n.close(); };
    } catch (e) { /* not allowed here */ }
  };

  /* --- people --- */
  const PALETTE = ['#c07b12', '#3f7d5a', '#8a4f9e', '#2f6f9f', '#b5523b', '#6b7a1f', '#a23f6b', '#4b5c8f'];
  C.color = function (uid) {
    let h = 0; for (const ch of String(uid || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  };
  C.first = (name) => String(name || 'Someone').split(/[\s@]+/)[0];

  /* --- "read up to" marker, kept per account in user_prefs --- */
  C.getLastRead = async function () {
    const { data } = await BH.sb.from('user_prefs').select('value').eq('user_id', BH.user.id).eq('key', 'chat_last_read').maybeSingle();
    return (data && Number(data.value)) || 0;
  };
  let saveTimer = null, pendingRead = 0;
  C.saveLastRead = function (id) {
    if (!id || id <= pendingRead) return;
    pendingRead = id;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      BH.sb.from('user_prefs').upsert({ user_id: BH.user.id, key: 'chat_last_read', value: pendingRead }, { onConflict: 'user_id,key' })
        .then((r) => { if (r.error) console.warn('chat read marker:', r.error.message); });
    }, 600);
  };

  /* --- realtime needs the signed-in token for the private channel --- */
  C.realtimeAuth = async function () {
    const { data } = await BH.sb.auth.getSession();
    const token = data.session && data.session.access_token;
    if (token) await BH.sb.realtime.setAuth(token);
    return token;
  };

  /* Join the private "bh-chat" channel: tracks me as here, reports everyone here,
   * and carries typing pings. onPeople([{id,name}]), onTyping({id,name}). */
  C.joinPresence = function (onPeople, onTyping) {
    const ch = BH.sb.channel(C.TOPIC, { config: { private: true, presence: { key: BH.user.id } } });
    const me = { id: BH.user.id, name: BH.displayName() };
    function people() {
      const st = ch.presenceState(); const out = [];
      Object.keys(st).forEach((k) => { const m = st[k] && st[k][0]; if (m) out.push({ id: k, name: m.name || 'Someone' }); });
      return out;
    }
    ch.on('presence', { event: 'sync' }, () => onPeople && onPeople(people()));
    if (onTyping) ch.on('broadcast', { event: 'typing' }, ({ payload }) => { if (payload && payload.id !== BH.user.id) onTyping(payload); });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') { try { await ch.track({ name: me.name, at: Date.now() }); } catch (e) { /* retry on next join */ } }
    });
    return {
      channel: ch,
      typing() { ch.send({ type: 'broadcast', event: 'typing', payload: me }); },
      leave() { try { BH.sb.removeChannel(ch); } catch (e) { /* gone */ } },
    };
  };

  /* "Kim is here" / "Kim and Ian are here" / "Just you" */
  C.hereText = function (people) {
    const others = people.filter((p) => p.id !== BH.user.id).map((p) => C.first(p.name));
    if (!others.length) return 'Just you right now';
    if (others.length === 1) return others[0] + ' is here';
    if (others.length === 2) return others[0] + ' and ' + others[1] + ' are here';
    return others.slice(0, -1).join(', ') + ' and ' + others[others.length - 1] + ' are here';
  };
})();
