/* ============================================================
 * Chrisware / bellhive99.com - music/library.js
 * MUSIC > Library: the shared music collection in Dropbox.
 *
 * Data (supabase/music.sql), all read-only from here:
 *   music_tracks   one row per audio file - details from the file's own tags, else from its
 *                  folder / file name, else from MusicBrainz (tag_source says which)
 *   music_albums   MusicBrainz matches and Cover Art Archive covers
 *   music_folders  cover pictures found in the music folders (cover.jpg, folder.jpg, ...)
 *   music_libraries one row per library: each folder directly inside the music root
 *                  (/_Media/Music/Music, /_Media/Music/_Streamripper, ...). Every row above
 *                  carries `library`; the Library picker shows one at a time (default: Music,
 *                  set on ADMIN > Settings; the last one picked is remembered per browser).
 *                  Admins also see folders that were never scanned, so new ones appear by themselves.
 * Everyone with Music > Library switched on sees all of it. Admins get Scan Dropbox (reads new
 * and changed files) and Match Online / Look Up Online (MusicBrainz). Play / Download use
 * short-lived Dropbox links from the music edge function.
 * Player: pick a song and either play just it or keep going with what follows (the "Play:"
 * choice, remembered per browser); Play / Shuffle / Add to queue on albums and song lists.
 * ============================================================ */
(function () {
  const { el, toast, modal } = BH.ui;
  const COLS = 'id, path, ext, size, title, artist, album_artist, album, track_no, disc_no, year, genre, duration_seconds, bitrate, sample_rate, bits, has_art, album_key, tag_source, indexed_at';
  const MIME = { mp3: 'audio/mpeg', mp2: 'audio/mpeg', flac: 'audio/flac', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', alac: 'audio/mp4',
    ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg; codecs=opus', wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff', aifc: 'audio/aiff' };
  const LOSSLESS = /^(flac|wav|aiff?|aifc|alac|ape|wv|dsf|dff|tak)$/;
  const DISC = /^(cd|disc|disk|part)\s*[-_.]?\s*\d+\b/i;
  const SORTS = {
    albums: {
      artist: { label: 'Artist', fn: (a, b) => cmp(sortName(a.artist), sortName(b.artist)) || (a.year || 0) - (b.year || 0) || cmp(a.title, b.title) },
      title: { label: 'Album', fn: (a, b) => cmp(sortName(a.title), sortName(b.title)) },
      year: { label: 'Newest', fn: (a, b) => (b.year || 0) - (a.year || 0) || cmp(a.title, b.title) },
      added: { label: 'Recently added', fn: (a, b) => cmp(b.added, a.added) },
    },
    songs: {
      artist: { label: 'Artist', fn: (a, b) => cmp(sortName(a.artist), sortName(b.artist)) || cmp(a.album, b.album) || (a.disc_no || 1) - (b.disc_no || 1) || (a.track_no || 999) - (b.track_no || 999) },
      title: { label: 'Title', fn: (a, b) => cmp(sortName(a.title), sortName(b.title)) },
      album: { label: 'Album', fn: (a, b) => cmp(a.album, b.album) || (a.disc_no || 1) - (b.disc_no || 1) || (a.track_no || 999) - (b.track_no || 999) },
      length: { label: 'Longest', fn: (a, b) => (b.duration_seconds || 0) - (a.duration_seconds || 0) },
      added: { label: 'Recently added', fn: (a, b) => cmp(b.indexed_at, a.indexed_at) },
    },
    artists: {
      name: { label: 'Name', fn: (a, b) => cmp(sortName(a.name), sortName(b.name)) },
      songs: { label: 'Most songs', fn: (a, b) => b.songs - a.songs || cmp(a.name, b.name) },
    },
  };
  const S = {
    user: null, admin: false, status: { connected: false },
    lib: '', libs: [], libDefault: 'music', libError: '',
    tracks: [], albums: [], albumByKey: new Map(), folders: new Map(), extra: new Map(), artists: [],
    view: 'albums', q: '', genre: '', artist: '', sort: { albums: 'artist', songs: 'artist', artists: 'name' }, limit: 120, cont: true,
  };
  const root = document.getElementById('mu');
  const acts = document.getElementById('mu-acts');
  const bar = document.getElementById('mu-player');
  const call = (action, payload) => BH.callFunction('music', Object.assign({ action }, payload));
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
  (function () {
    const p = store('bh-music') || {};
    if (['albums', 'artists', 'songs'].includes(p.view)) S.view = p.view;
    if (p.sort) Object.keys(S.sort).forEach((k) => { if (SORTS[k][p.sort[k]]) S.sort[k] = p.sort[k]; });
    if (p.cont === false) S.cont = false;
    if (typeof p.lib === 'string') S.lib = p.lib;
  })();
  const remember = () => store('bh-music', { view: S.view, sort: S.sort, cont: S.cont, lib: S.lib });
  const libInfo = () => S.libs.find((l) => l.library === S.lib) || null;

  /* ---------- helpers ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const cmp = (a, b) => String(a || '￿').localeCompare(String(b || '￿'), 'en', { sensitivity: 'base', numeric: true });
  const sortName = (s) => String(s || '').replace(/^(the|a)\s+/i, '');
  const ico = (name) => el('i', { class: 'ti ti-' + name, 'aria-hidden': 'true' });
  const len = (s) => { if (s == null) return '—'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? h + ':' + pad(m) + ':' + pad(s % 60) : m + ':' + pad(s % 60); };
  const hrs = (s) => (s >= 36000 ? Math.round(s / 3600).toLocaleString('en-US') : (s / 3600).toFixed(1));
  const fileSize = (n) => (n >= 1099511627776 ? (n / 1099511627776).toFixed(2) + ' TB' : n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : Math.round(n / 1048576) + ' MB');
  const dirOf = (p) => String(p || '').replace(/\/[^/]*$/, '');
  const baseOf = (p) => String(p || '').split('/').pop() || '';
  const genre1 = (g) => (g ? String(g).split(';')[0].trim() : '');
  const plural = (n, one, many) => n.toLocaleString('en-US') + ' ' + (n === 1 ? one : many || one + 's');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shuffled = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fmtBadge = (t) => el('span', { class: 'mu-fmt' + (LOSSLESS.test(t.ext || '') ? ' hq' : ''), title: quality(t) }, t.ext || '?');
  const quality = (t) => [t.ext && t.ext.toUpperCase(), t.bitrate && t.bitrate + ' kbps', t.sample_rate && (t.sample_rate / 1000) + ' kHz', t.bits && t.bits + '-bit'].filter(Boolean).join(' · ');
  function fail(e) { console.error(e); toast(e.message || String(e), 'error'); }

  /* ---------- data ---------- */
  /* every row of one library */
  async function pageAll(table, cols, order) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await BH.sb.from(table).select(cols).eq('library', S.lib).order(order).range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }
  async function load() {
    try {
      const [tracks, albums, folders] = await Promise.all([
        pageAll('music_tracks', COLS, 'path_lower'), pageAll('music_albums', '*', 'album_key'), pageAll('music_folders', 'folder_lower, art_path', 'folder_lower')]);
      S.tracks = tracks;
      S.extra = new Map(albums.map((a) => [a.album_key, a]));
      S.folders = new Map(folders.map((f) => [f.folder_lower, f.art_path]));
    } catch (e) {
      if (/music_(tracks|albums|folders|libraries)|library/.test(e.message || '') && /exist|schema cache/.test(e.message || '')) throw new Error('The music tables are not set up for libraries yet. Run supabase/music.sql on the bellhive99 project.');
      throw e;
    }
    build();
  }
  /* which libraries there are; keeps the one picked if it is still there, else the default */
  async function loadLibraries() {
    let r;
    try { r = await call('libraries'); }
    catch (e) {
      // no edge function to ask: fall back to the scanned libraries row level security shows
      const { data, error } = await BH.sb.from('music_libraries').select('library, name, folder, files, scanned_at').order('library');
      if (error) throw error;
      r = { default: 'music', libraries: data || [], root_error: e.message };
    }
    S.libs = r.libraries || [];
    S.libDefault = r.default || 'music';
    S.libError = r.root_error || '';
    const has = (k) => S.libs.some((l) => l.library === k);
    if (!has(S.lib)) S.lib = has(S.libDefault) ? S.libDefault : (S.libs[0] && S.libs[0].library) || S.libDefault;
  }
  async function switchLibrary(key) {
    if (key === S.lib) return;
    S.lib = key; S.q = ''; S.artist = ''; S.genre = ''; S.limit = 120;
    remember();
    ART.clear(); ARTP.clear();
    renderHead();
    const body = document.getElementById('mu-body');
    if (body) body.replaceChildren(el('div', { class: 'bh-empty' }, 'Loading…'));
    try { await load(); } catch (e) { fail(e); S.tracks = []; build(); }
    renderHead(); renderAll();
  }
  function build() {
    const groups = new Map();
    for (const t of S.tracks) {
      t.hay = [t.title, t.artist, t.album_artist, t.album, t.genre, t.year].join(' ').toLowerCase();
      let g = groups.get(t.album_key);
      if (!g) groups.set(t.album_key, (g = []));
      g.push(t);
    }
    S.albums = [...groups.entries()].map(([key, tracks]) => {
      tracks.sort((a, b) => (a.disc_no || 1) - (b.disc_no || 1) || (a.track_no || 9999) - (b.track_no || 9999) || cmp(a.path, b.path));
      const most = (f) => { const c = new Map(); tracks.forEach((t) => { if (t[f]) c.set(t[f], (c.get(t[f]) || 0) + 1); }); let best = null, n = 0; c.forEach((k, v) => { if (k > n) { n = k; best = v; } }); return best; };
      const x = S.extra.get(key) || null;
      const artists = new Set(tracks.map((t) => t.artist).filter(Boolean));
      const dir = dirOf(tracks[0].path);
      const albumDir = DISC.test(baseOf(dir)) ? dirOf(dir) : dir;
      let artPath = null;
      for (const d of new Set([albumDir, ...tracks.map((t) => dirOf(t.path))])) { const f = S.folders.get(d.toLowerCase()); if (f) { artPath = f; break; } }
      const years = tracks.map((t) => t.year).filter(Boolean);
      const a = {
        key, tracks, dir: albumDir, artPath, extra: x,
        title: most('album') || baseOf(albumDir) || 'Unknown album',
        artist: most('album_artist') || (artists.size === 1 ? [...artists][0] : artists.size > 1 ? 'Various Artists' : (x && x.mb_artist) || 'Unknown artist'),
        year: years.length ? Math.min(...years) : (x && x.mb_year) || null,
        genre: most('genre') || (x && x.mb_genre) || '',
        artTrack: tracks.find((t) => t.has_art) || null,
        seconds: tracks.reduce((s, t) => s + (Number(t.duration_seconds) || 0), 0),
        bytes: tracks.reduce((s, t) => s + (Number(t.size) || 0), 0),
        added: tracks.reduce((m, t) => (t.indexed_at > m ? t.indexed_at : m), ''),
        exts: [...new Set(tracks.map((t) => (t.ext || '').toUpperCase()))].join(' + '),
      };
      a.hay = [a.title, a.artist, a.year, a.genre].join(' ').toLowerCase() + ' ' + tracks.map((t) => t.hay).join(' ');
      tracks.forEach((t) => { t.al = a; });
      return a;
    });
    S.albumByKey = new Map(S.albums.map((a) => [a.key, a]));
    const art = new Map();
    for (const a of S.albums) {
      const names = a.artist === 'Various Artists' ? new Set(a.tracks.map((t) => t.artist).filter(Boolean)) : new Set([a.artist]);
      names.forEach((n) => {
        let r = art.get(n);
        if (!r) art.set(n, (r = { name: n, albums: [], songs: 0 }));
        if (!r.albums.includes(a)) r.albums.push(a);
        r.songs += a.artist === 'Various Artists' ? a.tracks.filter((t) => t.artist === n).length : a.tracks.length;
      });
    }
    S.artists = [...art.values()];
  }

  /* ---------- filtering ---------- */
  const words = () => S.q.toLowerCase().split(/\s+/).filter(Boolean);
  function albumsShown() {
    const w = words();
    return S.albums.filter((a) => {
      if (S.artist && a.artist !== S.artist && !a.tracks.some((t) => t.artist === S.artist)) return false;
      if (S.genre && genre1(a.genre) !== S.genre && !a.tracks.some((t) => genre1(t.genre) === S.genre)) return false;
      return w.every((x) => a.hay.includes(x));
    }).sort(SORTS.albums[S.sort.albums].fn);
  }
  function songsShown() {
    const w = words();
    return S.tracks.filter((t) => {
      if (S.artist && t.artist !== S.artist && t.al.artist !== S.artist) return false;
      if (S.genre && genre1(t.genre) !== S.genre) return false;
      return w.every((x) => t.hay.includes(x));
    }).sort(SORTS.songs[S.sort.songs].fn);
  }
  function artistsShown() {
    const w = words();
    return S.artists.filter((r) => {
      if (S.genre && !r.albums.some((a) => genre1(a.genre) === S.genre)) return false;
      return w.every((x) => r.name.toLowerCase().includes(x));
    }).sort(SORTS.artists[S.sort.artists].fn);
  }

  /* ---------- covers ---------- */
  const ART = new Map(), ARTP = new Map();
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    const box = e.target;
    loadArt(box._a).then((u) => { if (u) box.replaceChildren(el('img', { src: u, alt: '' })); });
  }), { rootMargin: '300px' });
  function artBox(a, cls) {
    const box = el('div', { class: 'mu-art ' + (cls || '') }, ico('disc'));
    if (!a) return box;
    const done = ART.get(a.key);
    if (done) box.replaceChildren(el('img', { src: done, alt: '' }));
    else if (done !== null) { box._a = a; io.observe(box); }
    return box;
  }
  const imgOk = (u) => new Promise((res) => { const i = new Image(); const t = setTimeout(() => res(false), 10000); i.onload = () => { clearTimeout(t); res(true); }; i.onerror = () => { clearTimeout(t); res(false); }; i.src = u; });
  function loadArt(a) {
    if (ARTP.has(a.key)) return ARTP.get(a.key);
    const p = (async () => {
      if (a.extra && a.extra.cover_url && await imgOk(a.extra.cover_url)) return a.extra.cover_url;
      if (a.artPath) { const u = await folderArt(a.artPath); if (u && await imgOk(u)) return u; }
      if (a.artTrack) { const u = await embeddedArt(a.artTrack.id); if (u) return u; }
      return null;
    })().catch(() => null).then((u) => { ART.set(a.key, u); return u; });
    ARTP.set(a.key, p);
    return p;
  }
  const forgetArt = (key) => { ART.delete(key); ARTP.delete(key); };
  /* folder pictures: links are asked for in batches */
  const pend = new Map();
  let flushT = null;
  function folderArt(path) {
    return new Promise((res) => {
      if (!pend.has(path)) pend.set(path, []);
      pend.get(path).push(res);
      if (!flushT) flushT = setTimeout(flushArt, 80);
    });
  }
  async function flushArt() {
    flushT = null;
    const batch = [...pend.entries()].slice(0, 60);
    batch.forEach(([p]) => pend.delete(p));
    if (pend.size) flushT = setTimeout(flushArt, 80);
    let links = {};
    try { links = (await call('art_links', { paths: batch.map(([p]) => p) })).links || {}; } catch (e) { /* no pictures */ }
    batch.forEach(([p, ws]) => ws.forEach((r) => r(links[p] || null)));
  }
  /* pictures inside the files: three at a time */
  let embRun = 0;
  const embQ = [];
  function embeddedArt(id) { return new Promise((res) => { embQ.push({ id, res }); pumpArt(); }); }
  function pumpArt() {
    while (embRun < 3 && embQ.length) {
      const { id, res } = embQ.shift();
      embRun++;
      fetchArt(id).then(res, () => res(null)).finally(() => { embRun--; pumpArt(); });
    }
  }
  async function fetchArt(id) {
    const { data } = await BH.sb.auth.getSession();
    const token = data.session && data.session.access_token;
    const C = window.BH_CONFIG || {};
    if (!token) return null;
    const r = await fetch(C.supabaseUrl + '/functions/v1/music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, apikey: C.supabaseKey },
      body: JSON.stringify({ action: 'art', track_id: id }),
    });
    if (!r.ok || !/^image\//.test(r.headers.get('Content-Type') || '')) return null;
    return URL.createObjectURL(await r.blob());
  }

  /* ---------- page ---------- */
  function renderHead() {
    acts.innerHTML = '';
    const search = el('input', { type: 'search', class: 'lb-search', placeholder: 'Search songs, artists, albums…', value: S.q });
    let t = null;
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { S.q = search.value; S.limit = 120; renderBody(); }, 150); });
    const libs = S.libs.length ? S.libs : [{ library: S.lib, name: S.lib || 'Music' }];
    const libLabel = (l) => l.name + (l.in_dropbox === false ? ' (folder gone)' : !l.scanned_at ? ' (not scanned)' : l.files != null ? ' (' + Number(l.files).toLocaleString('en-US') + ')' : '');
    acts.append(el('select', { class: 'ty-select mu-lib', 'aria-label': 'Library', title: 'Which music library to show - each folder in ' + (S.libs[0] ? dirOf(S.libs[0].folder) : 'the music root') + ' is its own',
      onchange: (e) => switchLibrary(e.target.value) },
      libs.map((l) => el('option', { value: l.library, selected: l.library === S.lib }, 'Library: ' + libLabel(l)))));
    const cur = libInfo();
    if (S.admin && cur && cur.in_dropbox === false) {
      acts.append(el('button', { class: 'bh-btn danger', type: 'button', title: 'The folder is no longer in Dropbox - remove its songs from the site', onclick: forgetLibrary }, ico('trash'), 'Remove Library'));
    }
    if (S.admin) {
      const off = !S.status.connected || !!(cur && cur.in_dropbox === false);
      acts.append(
        el('button', { class: 'bh-btn', type: 'button', disabled: off, title: off ? 'Connect the Media Dropbox on ADMIN › Settings first' : 'Read new and changed files in ' + ((cur && cur.folder) || 'this library\'s folder'), onclick: openScan }, ico('folder-search'), 'Scan Dropbox'),
        el('button', { class: 'bh-btn', type: 'button', disabled: !S.albums.length, title: 'Look albums up in MusicBrainz for covers and missing details', onclick: openMatch }, ico('world-search'), 'Match Online'));
    }
    acts.append(search);
  }

  function forgetLibrary() {
    const l = libInfo();
    if (!l) return;
    modal({
      title: 'Remove Library',
      body: [el('p', null, el('b', null, l.folder), ' is no longer in Dropbox. Remove its ' + plural(Number(l.files) || 0, 'song') + ', albums and online matches from the site? Nothing in Dropbox is touched, and scanning the folder again brings it back if it returns.')],
      buttons: [
        { label: 'Cancel' },
        { label: 'Remove', danger: true, onClick: async (close) => {
          try {
            await call('library_forget', { library: l.library });
            close();
            toast('Library removed', 'ok');
            S.lib = '';
            await loadLibraries();
            remember();
            ART.clear(); ARTP.clear();
            await load(); renderHead(); renderAll();
          } catch (e) { fail(e); }
        } }],
    });
  }

  function renderStats() {
    const box = document.getElementById('mu-stats');
    const secs = S.tracks.reduce((s, t) => s + (Number(t.duration_seconds) || 0), 0);
    const bytes = S.tracks.reduce((s, t) => s + (Number(t.size) || 0), 0);
    const lossless = S.tracks.filter((t) => LOSSLESS.test(t.ext || '')).length;
    box.replaceChildren(el('div', { class: 'ty-tiles' },
      tile('Songs', S.tracks.length.toLocaleString('en-US'), lossless ? lossless.toLocaleString('en-US') + ' lossless' : ''),
      tile('Albums', S.albums.length.toLocaleString('en-US'), ''),
      tile('Artists', S.artists.length.toLocaleString('en-US'), ''),
      tile('Listening', hrs(secs) + ' h', bytes ? fileSize(bytes) : '')));
  }
  const tile = (label, value, sub) => el('div', { class: 'ty-tile' }, el('div', { class: 'ty-tile-label' }, label), el('div', { class: 'ty-tile-val' }, value), el('div', { class: 'ty-tile-sub' }, sub || ' '));

  function renderBody() {
    const body = document.getElementById('mu-body');
    if (!body) return;
    body.innerHTML = '';
    if (!S.tracks.length) {
      body.append(el('div', { class: 'bh-card bh-empty' },
        el('div', null, ico('music'), ' The ' + ((libInfo() && libInfo().name) || 'music') + ' library is empty.'),
        el('div', { class: 'ty-sub lb-wrap', style: 'margin-top:6px' }, S.admin
          ? (S.libError ? S.libError
            : S.status.connected ? 'Click Scan Dropbox to read ' + ((libInfo() && libInfo().folder) || 'this library\'s folder') + '. Every folder in the music root (ADMIN › Settings › Music) is its own library - pick one above.'
            : 'Connect the Media Dropbox on ADMIN › Settings first, then click Scan Dropbox.')
          : 'An admin needs to scan this library first.')));
      return;
    }
    const tab = (k, label, icon, n) => el('button', { type: 'button', class: S.view === k ? 'on' : '', onclick: () => { S.view = k; S.limit = 120; remember(); renderBody(); } }, ico(icon), label + ' ', el('span', { class: 'ty-sub' }, n.toLocaleString('en-US')));
    const sortSel = el('select', { class: 'ty-select', 'aria-label': 'Sort', onchange: (e) => { S.sort[S.view] = e.target.value; remember(); renderBody(); } },
      Object.keys(SORTS[S.view]).map((k) => el('option', { value: k, selected: k === S.sort[S.view] }, 'Sort: ' + SORTS[S.view][k].label)));
    const genres = new Map();
    S.tracks.forEach((t) => { const g = genre1(t.genre); if (g) genres.set(g, (genres.get(g) || 0) + 1); });
    const genreSel = el('select', { class: 'ty-select lb-genre', 'aria-label': 'Genre', onchange: (e) => { S.genre = e.target.value; S.limit = 120; renderBody(); } },
      el('option', { value: '' }, 'All genres'),
      [...genres.keys()].sort(cmp).map((g) => el('option', { value: g, selected: g === S.genre }, g + ' (' + genres.get(g) + ')')));
    const contSel = el('select', { class: 'ty-select', title: 'What happens when you pick a song', onchange: (e) => { S.cont = e.target.value === '1'; remember(); } },
      el('option', { value: '1', selected: S.cont }, 'Play: song + what follows'),
      el('option', { value: '0', selected: !S.cont }, 'Play: just that song'));
    const albums = albumsShown(), songs = songsShown(), artists = artistsShown();
    body.append(el('div', { class: 'mu-bar' },
      el('div', { class: 'mu-tabs' }, tab('albums', 'Albums', 'disc', albums.length), tab('artists', 'Artists', 'microphone-2', artists.length), tab('songs', 'Songs', 'music', songs.length)),
      S.artist ? el('span', { class: 'mu-filter-chip' }, 'Artist: ' + S.artist, el('button', { type: 'button', title: 'Show every artist', onclick: () => { S.artist = ''; renderBody(); } }, '×')) : null,
      el('span', { class: 'sp' }), contSel, genreSel, sortSel));
    if (S.view === 'albums') body.append(albumGrid(albums));
    else if (S.view === 'artists') body.append(artistGrid(artists));
    else body.append(songList(songs));
    markNow();
  }
  function more(total, n) {
    return total > n ? el('div', { class: 'lb-more' }, el('button', { class: 'bh-btn', type: 'button', onclick: () => { S.limit += 240; renderBody(); } }, 'Show more (' + (total - n).toLocaleString('en-US') + ' left)')) : null;
  }

  function albumGrid(list) {
    if (!list.length) return el('div', { class: 'bh-card bh-empty' }, 'No albums match.');
    const shown = list.slice(0, S.limit);
    return el('div', null,
      el('div', { class: 'lb-grid' }, shown.map((a) => el('div', { class: 'lb-card', role: 'button', tabindex: '0', onclick: () => openAlbum(a), onkeydown: (e) => { if (e.key === 'Enter') openAlbum(a); } },
        el('div', { class: 'lb-cover-wrap' }, artBox(a),
          a.extra && a.extra.mb_status === 'matched' && S.admin ? el('span', { class: 'mu-mb', title: 'Matched in MusicBrainz' }, 'MB') : null,
          el('button', { class: 'mu-hover-play', type: 'button', title: 'Play album', onclick: (e) => { e.stopPropagation(); playList(a.tracks); } }, ico('player-play-filled'))),
        el('div', { class: 'lb-card-title' }, a.title),
        el('div', { class: 'ty-sub' }, a.artist),
        el('div', { class: 'ty-sub' }, [a.year, plural(a.tracks.length, 'song')].filter(Boolean).join(' · '))))),
      more(list.length, shown.length));
  }

  function artistGrid(list) {
    if (!list.length) return el('div', { class: 'bh-card bh-empty' }, 'No artists match.');
    const shown = list.slice(0, S.limit * 2);
    return el('div', null,
      el('div', { class: 'mu-artists' }, shown.map((r) => el('button', { class: 'mu-artist', type: 'button', onclick: () => { S.artist = r.name; S.view = 'albums'; S.q = ''; S.limit = 120; remember(); renderHead(); renderBody(); } },
        artBox(r.albums.find((a) => a.artPath || a.artTrack || (a.extra && a.extra.cover_url)) || r.albums[0]),
        el('div', null, el('b', null, r.name), el('div', { class: 'ty-sub' }, plural(r.albums.length, 'album') + ' · ' + plural(r.songs, 'song')))))),
      more(list.length, shown.length));
  }

  function songList(list) {
    if (!list.length) return el('div', { class: 'bh-card bh-empty' }, 'No songs match.');
    const shown = list.slice(0, S.limit * 2);
    return el('div', null,
      el('div', { class: 'mu-bar' },
        el('button', { class: 'bh-btn primary sm', type: 'button', onclick: () => playList(list) }, ico('player-play'), 'Play ' + (list.length === S.tracks.length ? 'all' : 'these')),
        el('button', { class: 'bh-btn sm', type: 'button', onclick: () => playList(list, 0, true) }, ico('arrows-shuffle'), 'Shuffle'),
        el('button', { class: 'bh-btn sm', type: 'button', onclick: () => addToQueue(list) }, ico('playlist-add'), 'Add to queue'),
        el('span', { class: 'ty-sub' }, plural(list.length, 'song') + ' · ' + len(list.reduce((s, t) => s + (Number(t.duration_seconds) || 0), 0)))),
      el('div', { class: 'bh-card' },
        el('div', { class: 'mu-row head' }, el('span'), el('span', null, 'Title'), el('span', null, 'Album'), el('span', { class: 'r' }, 'Length'), el('span', null, 'Format'), el('span')),
        shown.map((t, i) => el('div', { class: 'mu-row', 'data-tid': t.id, ondblclick: () => pick(list, i) },
          artBox(t.al, 'sm'),
          el('div', { class: 'ty-title' }, el('div', { class: 'ty-name' }, t.title || baseOf(t.path)), el('div', { class: 'ty-sub' }, t.artist || '—')),
          el('button', { class: 'mu-link ty-sub', type: 'button', title: 'Open album', onclick: () => openAlbum(t.al) }, t.al.title),
          el('span', { class: 'r ty-len' }, len(t.duration_seconds)),
          fmtBadge(t),
          trackActs(list, i)))),
      more(list.length, shown.length));
  }
  function trackActs(list, i) {
    const t = list[i];
    return el('div', { class: 'mu-acts' },
      el('button', { class: 'bh-ib', type: 'button', disabled: !canPlay(t), title: canPlay(t) ? (S.cont ? 'Play from here' : 'Play') : 'This browser can\'t play ' + (t.ext || '').toUpperCase() + ' - use Download', onclick: () => pick(list, i) }, ico('player-play')),
      el('button', { class: 'bh-ib', type: 'button', disabled: !canPlay(t), title: 'Add to queue', onclick: () => addToQueue([t]) }, ico('playlist-add')),
      el('button', { class: 'bh-ib', type: 'button', title: 'Download' + (t.size ? ' (' + fileSize(t.size) + ')' : ''), onclick: (e) => download(t, e.currentTarget) }, ico('download')));
  }
  /* picking a song: just it, or it and everything after it (the "Play:" choice) */
  const pick = (list, i) => (S.cont ? playList(list, i) : playList([list[i]]));

  /* ---------- album window ---------- */
  function openAlbum(a) {
    if (!a) return;
    const x = a.extra && a.extra.mb_status === 'matched' ? a.extra : null;
    let m = null;
    const reopen = () => { if (m) m.close(); openAlbum(S.albumByKey.get(a.key)); };
    const discs = new Set(a.tracks.map((t) => t.disc_no || 1)).size > 1;
    const rows = [];
    let disc = null;
    a.tracks.forEach((t, i) => {
      if (discs && (t.disc_no || 1) !== disc) { disc = t.disc_no || 1; rows.push(el('div', { class: 'mu-disc' }, 'Disc ' + disc)); }
      rows.push(el('div', { class: 'mu-trk', 'data-tid': t.id, ondblclick: () => pick(a.tracks, i) },
        el('span', { class: 'n' }, t.track_no || ''),
        el('div', { class: 'ty-title' }, el('div', { class: 'ty-name' }, t.title || baseOf(t.path)),
          t.artist && t.artist !== a.artist ? el('div', { class: 'ty-sub' }, t.artist) : null),
        el('span', { class: 'ty-len' }, len(t.duration_seconds)),
        fmtBadge(t),
        trackActs(a.tracks, i)));
    });
    const info = [a.year, plural(a.tracks.length, 'song'), len(a.seconds), a.exts, a.bytes ? fileSize(a.bytes) : ''].filter(Boolean).join(' · ');
    const filenames = a.tracks.filter((t) => t.tag_source === 'filename').length;
    m = modal({
      title: 'Album', wide: true,
      body: [
        el('div', { class: 'mu-album-head' }, artBox(a, 'lg'),
          el('div', null,
            el('div', { class: 'ty-info-title' }, a.title),
            el('div', { class: 'lb-by' }, 'by ', el('button', { class: 'mu-link', type: 'button', title: 'Show this artist', onclick: () => { m.close(); S.artist = a.artist; S.view = 'albums'; remember(); renderBody(); } }, el('b', null, a.artist))),
            el('div', { class: 'ty-sub lb-wrap' }, info),
            a.genre ? el('div', { class: 'ty-sub lb-wrap' }, a.genre) : null,
            el('div', { class: 'mu-album-acts' },
              el('button', { class: 'bh-btn sm primary', type: 'button', onclick: () => playList(a.tracks) }, ico('player-play'), 'Play'),
              el('button', { class: 'bh-btn sm', type: 'button', onclick: () => playList(a.tracks, 0, true) }, ico('arrows-shuffle'), 'Shuffle'),
              el('button', { class: 'bh-btn sm', type: 'button', onclick: () => addToQueue(a.tracks) }, ico('playlist-add'), 'Add to queue'),
              S.admin ? el('button', { class: 'bh-btn sm', type: 'button', onclick: () => openLookup(a, reopen) }, ico('world-search'), 'Look Up Online') : null))),
        el('div', { class: 'mu-tracks' }, rows),
        x || (S.admin && filenames) ? el('div', { class: 'mu-online' },
          x ? [ico('world'), 'Details and cover from ', el('a', { class: 'bh-link', href: 'https://musicbrainz.org/release/' + x.mb_release_id, target: '_blank', rel: 'noopener' }, 'MusicBrainz'),
            x.mb_artist || x.mb_title ? ' (' + [x.mb_artist, x.mb_title].filter(Boolean).join(' – ') + ')' : '',
            S.admin ? el('button', { class: 'bh-link mu-link', type: 'button', onclick: async () => {
              try { await call('mb_clear', { library: S.lib, album_key: a.key }); S.extra.delete(a.key); forgetArt(a.key); build(); renderAll(); reopen(); toast('Match removed', 'ok'); } catch (e) { fail(e); }
            } }, 'Remove match') : null] : null,
          S.admin && filenames ? el('span', null, plural(filenames, 'song') + ' had no tags - the details come from the file names.') : null) : null,
      ],
      buttons: [{ label: 'Close' }],
    });
    markNow();
  }

  /* ---------- MusicBrainz (admins) ---------- */
  function openLookup(a, after) {
    const artist = el('input', { value: a.artist === 'Various Artists' || a.artist === 'Unknown artist' ? '' : a.artist, placeholder: 'Artist' });
    const album = el('input', { value: a.title, placeholder: 'Album' });
    const out = el('div', { class: 'mu-mb-list' });
    const err = el('div', { class: 'bh-err' });
    let m = null;
    const item = (r) => {
      const img = el('img', { src: 'https://coverartarchive.org/release/' + r.id + '/front-250', alt: '', loading: 'lazy' });
      img.onerror = () => img.replaceWith(el('div', { class: 'ph mu-art' }, ico('disc')));
      const use = el('button', { class: 'bh-btn sm primary', type: 'button', onclick: async () => {
        use.disabled = true; use.textContent = 'Saving…'; err.textContent = '';
        try {
          const res = await call('mb_apply', { library: S.lib, album_key: a.key, release_id: r.id });
          S.extra.set(a.key, res.album);
          forgetArt(a.key);
          if (res.filled) await load(); else build();
          renderAll();
          m.close();
          toast('Matched' + (res.filled ? ' - ' + plural(res.filled, 'song title') + ' filled in' : ''), 'ok');
          if (after) after();
        } catch (e) { err.textContent = e.message; use.disabled = false; use.textContent = 'Use this'; }
      } }, 'Use this');
      return el('div', { class: 'mu-mb-item' }, img,
        el('div', null, el('b', null, r.title),
          el('div', { class: 'ty-sub' }, [r.artist, r.date, r.country, r.tracks != null ? plural(r.tracks, 'track') : '', r.formats, r.type].filter(Boolean).join(' · '))),
        el('div', { style: 'text-align:right' }, el('div', { class: 'ty-sub' }, r.score + '% match'), use));
    };
    const search = async () => {
      err.textContent = '';
      out.replaceChildren(el('div', { class: 'ty-sub' }, 'Searching MusicBrainz…'));
      try {
        const r = await call('mb_search', { artist: artist.value.trim(), album: album.value.trim() });
        out.replaceChildren(...(r.releases.length ? r.releases.map(item) : [el('div', { class: 'ty-sub' }, 'Nothing found. Try fewer or different words.')]));
      } catch (e) { out.innerHTML = ''; err.textContent = e.message; }
    };
    const enter = (e) => { if (e.key === 'Enter') search(); };
    artist.addEventListener('keydown', enter); album.addEventListener('keydown', enter);
    m = modal({
      title: 'Look Up Online', wide: true,
      body: [
        el('p', { class: 'bh-note' }, 'Searches MusicBrainz, the open music database. The one you pick gives this album its cover (from Cover Art Archive), and fills in titles for ' + plural(a.tracks.length, 'song') + ' only where the files had no tags. Tags in your files are never overwritten.'),
        el('div', { class: 'bh-grid2' }, el('label', { class: 'bh-field' }, el('span', null, 'Artist'), artist), el('label', { class: 'bh-field' }, el('span', null, 'Album'), album)),
        el('button', { class: 'bh-btn', type: 'button', onclick: search }, ico('search'), 'Search'),
        err, out],
      buttons: [{ label: 'Close' }],
    });
    search();
  }

  function openMatch() {
    let running = false, stop = false;
    const retry = el('input', { type: 'checkbox' });
    const count = el('div', { class: 'ty-sub' });
    const msg = el('div', { class: 'ty-sub lb-wrap' });
    const prog = el('div', { class: 'mu-prog bh-gone' }, el('span'));
    const list = () => S.albums.filter((a) => a.tracks.some((t) => t.album) && (!a.extra || (retry.checked && a.extra.mb_status === 'none')));
    const showCount = () => { count.textContent = plural(list().length, 'album') + ' to look up' + (list().length ? ' - about ' + Math.max(1, Math.round(list().length * 2.3 / 60)) + ' min' : ''); };
    retry.addEventListener('change', showCount);
    const btn = el('button', { class: 'bh-btn primary', type: 'button', onclick: async () => {
      if (running) { stop = true; btn.textContent = 'Stopping…'; btn.disabled = true; return; }
      running = true; stop = false; btn.textContent = 'Stop'; retry.disabled = true; prog.classList.remove('bh-gone');
      const todo = list(), lib = S.lib;
      let done = 0, matched = 0, none = 0, errors = 0;
      const update = () => { msg.textContent = 'Looked up ' + done + ' of ' + todo.length + ': ' + matched + ' matched, ' + none + ' no sure match' + (errors ? ', ' + errors + ' errors' : '') + '.'; prog.firstChild.style.width = (todo.length ? (100 * done) / todo.length : 100) + '%'; };
      update();
      for (const a of todo) {
        if (stop || lib !== S.lib) break;
        try {
          const r = await call('mb_auto', { library: lib, album_key: a.key, artist: a.artist, album: a.title, tracks: a.tracks.length });
          if (r.matched) { matched++; S.extra.set(a.key, r.album); forgetArt(a.key); } else { none++; S.extra.set(a.key, { album_key: a.key, mb_status: 'none' }); }
        } catch (e) { errors++; if (/busy/i.test(e.message || '')) await wait(5000); }
        done++; update();
        await wait(1100);
      }
      running = false; btn.disabled = false; btn.textContent = 'Start'; retry.disabled = false;
      msg.textContent = (stop ? 'Stopped. ' : 'Finished. ') + msg.textContent + (none ? ' Use Look Up Online on an album to pick a match yourself.' : '');
      await load().catch(fail);
      renderAll(); showCount();
    } }, 'Start');
    showCount();
    modal({
      title: 'Match Online', closable: true,
      body: [
        el('p', { class: 'bh-note' }, 'Looks each album up in MusicBrainz (about one a second, as they ask) and keeps only near-certain matches: same album name, same artist and the same number of songs. A match gives the album a cover and fills in titles for songs that had no tags; tags in your files are never overwritten.'),
        el('label', { class: 'bh-check', style: 'display:flex;gap:8px;align-items:center;margin:6px 0' }, retry, el('span', null, 'Also retry albums that had no sure match before')),
        count, prog, msg, el('div', { style: 'margin-top:12px' }, btn)],
      buttons: [{ label: 'Close', onClick: (close) => { stop = true; close(); } }],
    });
  }

  /* ---------- Scan Dropbox (admins) ---------- */
  function openScan() {
    let stop = false;
    const msg = el('div', { class: 'lb-wrap' }, 'Reading the list of files in Dropbox… a big collection can take a minute.');
    const prog = el('div', { class: 'mu-prog bh-gone' }, el('span'));
    const fails = el('div', { class: 'mu-fail bh-gone' });
    const btn = el('button', { class: 'bh-btn', type: 'button', onclick: () => { stop = true; btn.disabled = true; btn.textContent = 'Stopping after this batch…'; } }, 'Stop');
    const m = modal({
      title: 'Scan Dropbox', closable: false,
      body: [el('p', { class: 'bh-note' }, 'Finds new, changed and removed music files and reads their tags (files without tags are read from their folder and file names). Unchanged files are skipped, so a later scan only does what is new. You can stop at any time and pick up where you left off.'),
        msg, prog, fails, el('div', { style: 'margin-top:12px' }, btn)],
      buttons: [],
    });
    const finish = async () => {
      btn.replaceWith(el('button', { class: 'bh-btn primary', type: 'button', onclick: () => m.close() }, 'Close'));
      try { await load(); renderHead(); renderAll(); } catch (e) { fail(e); }
    };
    (async () => {
      try {
        const lib = S.lib;
        const r = await call('scan', { library: lib });
        loadLibraries().then(() => renderHead()).catch(() => {});
        const total = r.todo.length;
        const head = plural(r.files, 'music file') + ' in ' + r.folder + (r.removed ? ' · ' + r.removed + ' removed' : '') + ' · ' + plural(r.pictures, 'cover picture');
        if (!total) { msg.textContent = head + '. Everything is up to date.'; return finish(); }
        prog.classList.remove('bh-gone');
        let next = 0, done = 0, problems = 0;
        const update = () => { msg.textContent = head + ' - read ' + done.toLocaleString('en-US') + ' of ' + total.toLocaleString('en-US') + ' new or changed' + (problems ? ' (' + problems + ' read from the file name)' : '') + '.'; prog.firstChild.style.width = (100 * done) / total + '%'; };
        update();
        await Promise.all([0, 1, 2].map(async () => {
          while (!stop && next < total) {
            const batch = r.todo.slice(next, next + 12);
            next += 12;
            let res = null;
            for (let tries = 0; !res; tries++) {
              try { res = await call('index', { library: lib, files: batch }); }
              catch (e) { if (tries >= 2) res = { done: 0, failed: batch.map((f) => ({ path: f.path, error: e.message })) }; else await wait(2000 * (tries + 1)); }
            }
            done += batch.length; problems += res.failed.length;
            res.failed.forEach((f) => { fails.classList.remove('bh-gone'); fails.append(el('div', { title: f.path + ' - ' + f.error }, baseOf(f.path) + ' - ' + f.error)); });
            update();
          }
        }));
        msg.textContent = (stop ? 'Stopped. ' : 'Done. ') + msg.textContent;
      } catch (e) { msg.textContent = e.message || String(e); }
      finish();
    })();
  }

  /* ---------- player ---------- */
  const audio = new Audio();
  audio.preload = 'auto';
  const P = { q: [], i: -1, orig: null, shuffle: false, repeat: 'off', ended: false, turn: 0, errors: 0, el: null };
  const LINKS = new Map();
  const canPlay = (t) => { const mt = MIME[t.ext]; return !!mt && audio.canPlayType(mt) !== ''; };
  async function linkFor(t) {
    const c = LINKS.get(t.id);
    if (c && c.until > Date.now()) return c.url;
    const r = await call('link', { id: t.id });
    LINKS.set(t.id, { url: r.url, until: Date.now() + 3.5 * 3600 * 1000 });
    return r.url;
  }
  function playable(list) {
    const ok = list.filter(canPlay), n = list.length - ok.length;
    if (n) toast(plural(n, 'song') + ' in a format this browser can\'t play ' + (n === 1 ? 'was' : 'were') + ' left out - Download still works.');
    return ok;
  }
  function playList(list, start = 0, shuffle = false) {
    const first = list[start];
    let q = playable(list);
    if (!q.length) return;
    let i = first ? Math.max(0, q.indexOf(first)) : 0;
    P.shuffle = shuffle;
    P.orig = q.slice();
    if (shuffle) { q = shuffled(q); i = 0; }
    P.q = q; P.i = i;
    go();
  }
  function addToQueue(list) {
    const q = playable(list);
    if (!q.length) return;
    P.q.push(...q);
    if (P.orig) P.orig.push(...q);
    toast(q.length === 1 ? 'Added to the queue' : 'Added ' + q.length + ' songs to the queue', 'ok');
    if (P.i < 0) { P.i = 0; go(); }
    else if (P.ended) { P.i++; go(); }
    else renderPlayer();
  }
  async function go() {
    const t = P.q[P.i];
    if (!t) return;
    const turn = ++P.turn;
    P.ended = false;
    audio.pause();
    renderPlayer(); markNow();
    let u;
    try { u = await linkFor(t); }
    catch (e) { if (turn === P.turn) { toast('Could not play ' + (t.title || 'that song') + ': ' + e.message, 'error'); if (++P.errors < 3) next('skip'); } return; }
    if (turn !== P.turn) return;
    audio.src = u;
    audio.play().then(() => { P.errors = 0; }).catch((e) => { if (e.name === 'NotAllowedError') renderPlayer(); });
    const n = P.q[P.i + 1];
    if (n) linkFor(n).catch(() => {});
    session(t);
  }
  function next(why) {
    if (why === 'auto' && P.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    if (P.i + 1 < P.q.length) { P.i++; go(); }
    else if (P.repeat === 'all' && P.q.length) { P.i = 0; go(); }
    else { if (why !== 'auto') audio.pause(); P.ended = true; renderPlayer(); markNow(); }
  }
  function prev() {
    if (audio.currentTime > 3 || P.i <= 0) { audio.currentTime = 0; return; }
    P.i--; go();
  }
  function toggle() {
    if (P.ended) { P.i = 0; go(); return; }
    if (!audio.src) { go(); return; }
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }
  function toggleShuffle() {
    const cur = P.q[P.i];
    P.shuffle = !P.shuffle;
    if (P.shuffle) { P.orig = P.q.slice(); const rest = shuffled(P.q.filter((t, k) => k !== P.i)); P.q = cur ? [cur, ...rest] : rest; P.i = cur ? 0 : -1; }
    else if (P.orig) { P.q = P.orig.slice(); P.i = cur ? P.q.indexOf(cur) : -1; }
    renderPlayer();
  }
  audio.addEventListener('ended', () => next('auto'));
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    const t = P.q[P.i];
    toast('Could not play ' + ((t && t.title) || 'that song') + '.', 'error');
    if (++P.errors < 3) setTimeout(() => next('skip'), 800);
  });
  audio.addEventListener('play', () => renderPlayer());
  audio.addEventListener('pause', () => renderPlayer());

  function initPlayer() {
    const pb = (icon, title, fn, cls) => el('button', { class: 'mu-pb ' + (cls || ''), type: 'button', title, 'aria-label': title, onclick: fn }, ico(icon));
    const seek = el('input', { type: 'range', min: 0, max: 1000, value: 0, step: 1, 'aria-label': 'Position' });
    const cur = el('span', null, '0:00'), dur = el('span', null, '0:00');
    let dragging = false;
    seek.addEventListener('input', () => { dragging = true; if (audio.duration) cur.textContent = len((seek.value / 1000) * audio.duration); });
    seek.addEventListener('change', () => { if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; dragging = false; });
    audio.addEventListener('timeupdate', () => {
      if (dragging || !audio.duration) return;
      seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
      cur.textContent = len(audio.currentTime); dur.textContent = len(audio.duration);
    });
    audio.addEventListener('loadedmetadata', () => { dur.textContent = len(audio.duration); });
    const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: store('bh-music-vol') ?? 1, 'aria-label': 'Volume' });
    audio.volume = Number(vol.value);
    vol.addEventListener('input', () => { audio.volume = Number(vol.value); store('bh-music-vol', audio.volume); });
    const E = {
      art: el('div', { class: 'mu-art', title: 'Open album' }, ico('disc')),
      title: el('div', { class: 'mu-now-t' }), artist: el('div', { class: 'mu-now-a' }),
      play: pb('player-play-filled', 'Play', toggle, 'big'),
      shuffle: pb('arrows-shuffle', 'Shuffle', toggleShuffle),
      repeat: pb('repeat', 'Repeat', () => { P.repeat = P.repeat === 'off' ? 'all' : P.repeat === 'all' ? 'one' : 'off'; renderPlayer(); }),
      artKey: null,
    };
    E.art.addEventListener('click', () => { const t = P.q[P.i]; if (t) openAlbum(t.al); });
    bar.append(
      el('div', { class: 'mu-now' }, E.art, el('div', null, E.title, E.artist)),
      el('div', { class: 'mu-ctl' },
        el('div', { class: 'mu-btns' }, E.shuffle, pb('player-skip-back-filled', 'Previous', prev), E.play, pb('player-skip-forward-filled', 'Next', () => next('manual')), E.repeat),
        el('div', { class: 'mu-seek' }, cur, seek, dur)),
      el('div', { class: 'mu-right' },
        ico('volume'), vol,
        pb('download', 'Download this song', (e) => { const t = P.q[P.i]; if (t) download(t, e.currentTarget); }),
        pb('playlist', 'Queue', openQueue),
        pb('x', 'Stop and clear the queue', () => { audio.pause(); audio.removeAttribute('src'); audio.load(); P.q = []; P.i = -1; P.orig = null; renderPlayer(); markNow(); })));
    P.el = E;
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      const on = (k, fn) => { try { ms.setActionHandler(k, fn); } catch (e) { /* not supported */ } };
      on('play', toggle); on('pause', () => audio.pause());
      on('previoustrack', prev); on('nexttrack', () => next('manual'));
      on('seekto', (d) => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
    }
  }
  function renderPlayer() {
    const E = P.el;
    if (!E) return;
    if (!P.q.length) { bar.classList.add('bh-gone'); return; }
    bar.classList.remove('bh-gone');
    const t = P.q[Math.max(0, P.i)] || P.q[0];
    E.title.textContent = t.title || baseOf(t.path);
    E.artist.textContent = [t.artist, t.al.title].filter(Boolean).join(' — ') + (P.q.length > 1 ? '  ·  ' + (P.i + 1) + ' of ' + P.q.length : '');
    if (E.artKey !== t.al.key) { E.artKey = t.al.key; const box = artBox(t.al); E.art.replaceChildren(...box.childNodes); if (box._a) { E.art._a = box._a; io.observe(E.art); } }
    const playing = !audio.paused && !P.ended;
    E.play.replaceChildren(ico(playing ? 'player-pause-filled' : 'player-play-filled'));
    E.play.title = playing ? 'Pause' : 'Play';
    E.shuffle.classList.toggle('on', P.shuffle);
    E.repeat.classList.toggle('on', P.repeat !== 'off');
    E.repeat.replaceChildren(ico(P.repeat === 'one' ? 'repeat-once' : 'repeat'));
    E.repeat.title = { off: 'Repeat: off', all: 'Repeat: the whole queue', one: 'Repeat: this song' }[P.repeat];
  }
  function markNow() {
    const id = P.q[P.i] && !P.ended ? P.q[P.i].id : null;
    document.querySelectorAll('[data-tid]').forEach((r) => r.classList.toggle('now', r.dataset.tid === id));
  }
  function session(t) {
    if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
    const set = (u) => { try { navigator.mediaSession.metadata = new MediaMetadata({ title: t.title || '', artist: t.artist || '', album: t.al.title || '', artwork: u ? [{ src: u }] : [] }); } catch (e) { /* ignore */ } };
    set(ART.get(t.al.key));
    loadArt(t.al).then((u) => { if (P.q[P.i] === t && u) set(u); });
  }
  function openQueue() {
    const box = el('div', { class: 'mu-queue' });
    const draw = () => {
      box.replaceChildren(...P.q.map((t, k) => el('div', { class: 'mu-q' + (k === P.i ? ' now' : k < P.i ? ' past' : ''), onclick: () => { P.i = k; go(); draw(); } },
        el('span', { class: 'n' }, k + 1), artBox(t.al, 'sm'),
        el('div', { class: 'ty-title' }, el('div', { class: 'ty-name' }, t.title || baseOf(t.path)), el('div', { class: 'ty-sub' }, [t.artist, t.al.title].filter(Boolean).join(' — '))),
        el('span', { class: 'ty-len' }, len(t.duration_seconds)),
        el('button', { class: 'bh-ib', type: 'button', title: 'Remove', onclick: (e) => {
          e.stopPropagation();
          if (k === P.i) return toast('That one is playing - skip it first.');
          P.q.splice(k, 1);
          if (P.orig) { const o = P.orig.indexOf(t); if (o >= 0) P.orig.splice(o, 1); }
          if (k < P.i) P.i--;
          draw(); renderPlayer();
        } }, ico('x')))));
      if (!P.q.length) box.append(el('div', { class: 'bh-empty' }, 'The queue is empty.'));
      const now = box.querySelector('.now');
      if (now) setTimeout(() => now.scrollIntoView({ block: 'center' }), 30);
    };
    draw();
    modal({
      title: 'Queue · ' + plural(P.q.length, 'song'), wide: true, body: [box],
      buttons: [
        { label: 'Clear upcoming', onClick: () => { P.q.splice(P.i + 1); if (P.orig) P.orig = P.q.slice(); draw(); renderPlayer(); } },
        { label: 'Close', primary: true }],
    });
  }
  async function download(t, btn) {
    const w = window.open('', '_blank');
    if (btn) btn.disabled = true;
    try {
      const u = await linkFor(t);
      if (w) w.location.href = u;
      else toast('Your browser blocked the new tab - allow pop-ups for this site to download.', 'error');
    } catch (e) { if (w) w.close(); fail(e); }
    if (btn) btn.disabled = false;
  }

  function renderAll() { renderStats(); renderBody(); }

  /* ---------- boot ---------- */
  (async function () {
    try {
      const { user } = await BH.init();
      if (!user) return BH.requireLogin();
      S.user = user;
      S.admin = BH.isAdmin();
      if (BH.track) BH.track('music-library');
      initPlayer();
      try { S.status = await call('status'); } catch (e) { S.status = { connected: false, error: e.message }; }
      await loadLibraries();
      await load();
      renderHead();
      root.replaceChildren(el('div', { id: 'mu-stats' }), el('div', { id: 'mu-body' }));
      if (S.status.error && S.admin) root.prepend(el('div', { class: 'bh-alert' }, 'Music function: ' + S.status.error));
      renderStats();
      renderBody();
    } catch (e) {
      root.replaceChildren(el('div', { class: 'bh-alert' }, e.message || String(e)));
    }
  })();
})();
