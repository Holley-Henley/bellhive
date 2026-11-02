/* ============================================================
 * Chrisware / bellhive99.com - vehicles/common.js
 * RESOURCES > Inventory and Maintenance (vehicles, equipment, home & appliances, pets): shared pieces.
 * Cloned from HHB Project Exchange (shared/gallery.js, notes.js, files.js and the
 * equipment modules' helpers) and rebuilt on the bellhive site kit (auth/auth.js).
 *
 *  - VH.boot(page)        sign-in check, option lists, family names, Dropbox status
 *  - VH.call(action, {})  the vehicles edge function (Dropbox photos / invoices)
 *  - VH.gallery           photo gallery + profile picture (Dropbox uploads or pasted links)
 *  - VH.notes             notes on a vehicle or a maintenance entry
 *  - VH.files             invoices / receipts on a maintenance entry
 *
 * Who sees what is decided by the database (supabase/vehicles.sql): a vehicle's owner and
 * admins. Everything on this page follows from the rows the database returns.
 * ============================================================ */
(function () {
  const VH = (window.VH = {});
  const toast = (m, k) => BH.ui.toast(m, k);
  VH.toast = toast;

  /* ---------- small helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  VH.esc = esc;
  VH.clean = (v) => { const t = String(v == null ? '' : v).trim().replace(/\s+/g, ' '); return t || null; };
  VH.norm = (v) => String(v == null ? '' : v).toLowerCase().trim();
  VH.today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  VH.dateAdd = (iso, days) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
  VH.localDate = (ts) => { if (!ts) return ''; const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  VH.fmtDate = (iso) => { if (!iso) return ''; const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  VH.num = (n, dec) => (n == null || n === '' ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: dec == null ? 1 : dec }));
  VH.money = (n) => (n == null || n === '' ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  VH.parseNum = (v) => { const t = String(v == null ? '' : v).replace(/[$,\s]/g, ''); if (!t) return null; const n = Number(t); return isNaN(n) ? NaN : n; };
  VH.fileSize = (n) => (n == null ? '' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  /* Classes (the workbook's DATA TYPE: A / OPE / R / P). One Inventory + one Maintenance for all four. */
  VH.CLASSES = [
    { id: 'vehicle', label: 'Vehicles', one: 'Vehicle', icon: 'ti-car' },
    { id: 'equipment', label: 'Equipment', one: 'Equipment', icon: 'ti-tools' },
    { id: 'home', label: 'Home & Appliances', one: 'Home / Appliance', icon: 'ti-home' },
    { id: 'pet', label: 'Pets', one: 'Pet', icon: 'ti-paw' },
  ];
  VH.cls = (id) => VH.CLASSES.find((c) => c.id === id) || VH.CLASSES[0];
  VH.hasMeter = (c) => c === 'vehicle' || c === 'equipment';
  // "12 yrs 5 mos" from a birth date
  VH.age = (birth) => {
    if (!birth) return '';
    const b = new Date(birth + 'T12:00:00'), n = new Date();
    let m = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth() - (n.getDate() < b.getDate() ? 1 : 0);
    if (m < 0) return '';
    const y = Math.floor(m / 12); m %= 12;
    return (y ? y + ' yr' + (y === 1 ? '' : 's') : '') + (m || !y ? (y ? ' ' : '') + m + ' mo' + (m === 1 ? '' : 's') : '');
  };
  VH.desc = (r) => {
    if (!r) return '';
    if (r.class === 'pet') return [VH.optLabel(r.type_id), r.model, VH.age(r.birth_date)].filter(Boolean).join(' · ');
    if (r.class === 'home' && !r.make && !r.model) return r.address || '';
    return [r.year, r.make, r.model, r.trim_level].filter(Boolean).join(' ');
  };
  // tab strip: All / Vehicles / Equipment / Home & Appliances / Pets, with counts
  VH.classTabsHtml = (cur, counts, fn) => '<div class="vh-ctabs">' +
    [{ id: '', label: 'All', icon: 'ti-layout-grid' }].concat(VH.CLASSES).map((c) =>
      '<button type="button" class="vh-ctab' + (c.id === cur ? ' on' : '') + '" onclick="' + fn + '(\'' + c.id + '\')"><i class="ti ' + c.icon + '"></i>' + esc(c.label) +
      '<span class="c">' + (counts[c.id || 'all'] || 0) + '</span></button>').join('') + '</div>';
  VH.usesMiles = (r) => !!r && (r.meter_type === 'miles' || r.meter_type === 'both');
  VH.usesHours = (r) => !!r && (r.meter_type === 'hours' || r.meter_type === 'both');
  VH.meterLines = (r) => {
    const out = [];
    if (VH.usesMiles(r) && r.odometer != null) out.push(VH.num(r.odometer, 0) + ' mi');
    if (VH.usesHours(r) && r.hours != null) out.push(VH.num(r.hours) + ' hrs');
    return out;
  };
  VH.sortArrow = (on, asc) => (on ? '<span class="arr">' + (asc ? '▲' : '▼') + '</span>' : '');
  VH.dash = '<span class="vh-dash">—</span>';
  VH.safeUrl = (u) => (/^https:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
  // A Dropbox share link shown as the file itself (raw=1) instead of Dropbox's page. Keeps rlkey.
  VH.dropboxRaw = (url) => {
    url = String(url || '');
    if (!/dropbox\.com/i.test(url)) return url;
    if (/[?&](dl|raw)=/.test(url)) return url.replace(/([?&])(dl|raw)=[^&]*/g, '$1raw=1');
    return url + (url.includes('?') ? '&' : '?') + 'raw=1';
  };
  VH.dropboxView = (url) => String(url || '').replace(/([?&])(dl|raw)=[^&]*/g, '$1dl=0');
  VH.linkName = (url) => { try { const p = decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); return p || 'Dropbox link'; } catch (e) { return 'Dropbox link'; } };

  /* ---------- option lists + family ---------- */
  VH.opts = { category: [], type: [], status: [], service_category: [], service_type: [] };
  VH.opt = (id) => { if (!id) return null; for (const k in VH.opts) { const o = VH.opts[k].find((x) => x.id === id); if (o) return o; } return null; };
  VH.optLabel = (id) => (VH.opt(id) || {}).label || '';
  VH.optChoices = (kind, currentId, blank, cls) => {
    const list = VH.opts[kind].filter((o) => (o.active && (!cls || !o.class || o.class === cls)) || o.id === currentId);
    return [['', blank]].concat(list.map((o) => [o.id, o.label + (o.active ? '' : ' (hidden)')]));
  };
  VH.statusPill = (id) => { const o = VH.opt(id); return o ? '<span class="vh-pill ' + esc(o.color || 'gray') + '">' + esc(o.label) + '</span>' : VH.dash; };
  VH.inUse = (r) => { const s = VH.opt(r && r.status_id); return !s || s.counts !== false; };
  VH.loadOptions = async function () {
    const { data, error } = await BH.sb.from('equipment_options').select('*').order('sort_order');
    if (error) throw new Error('Could not load the lists: ' + error.message);
    VH.opts = { category: [], type: [], status: [], service_category: [], service_type: [] };
    (data || []).forEach((o) => { if (VH.opts[o.kind]) VH.opts[o.kind].push(o); });
  };
  VH.members = [];
  VH.memberName = (id) => { if (!id) return ''; if (BH.user && id === BH.user.id) return BH.displayName(); const m = VH.members.find((x) => x.id === id); return m ? m.name : '(former member)'; };

  /* ---------- the vehicles edge function ---------- */
  VH.call = (action, payload) => BH.callFunction('vehicles', Object.assign({ action }, payload || {}));
  VH.dropboxOk = false;

  /* ---------- page start ---------- */
  VH.boot = async function (page, mc) {
    try {
      const { user } = await BH.init();
      if (!user) { await BH.requireLogin(); return false; }
    } catch (e) { mc.innerHTML = '<div class="bh-alert">' + esc(e.message) + '</div>'; return false; }
    if (BH.track) BH.track(page);
    BH.pageOpen(page === 'vehicles-maintenance' ? 'Maintenance' : 'Inventory', 'vehicles');
    try {
      const [, mem, st] = await Promise.all([
        VH.loadOptions(),
        BH.sb.rpc('member_directory'),
        VH.call('status').catch(() => ({ connected: false })),
      ]);
      VH.members = (mem && mem.data) || [];
      VH.dropboxOk = !!(st && st.connected);
    } catch (e) {
      const missing = /equipment_options/.test(e.message) && /(does not exist|schema cache|not find)/i.test(e.message);
      mc.innerHTML = '<div class="bh-alert">' + esc(missing ? 'The Inventory tables have not been created yet - run supabase/vehicles.sql in the Supabase SQL Editor.' : e.message) + '</div>';
      return false;
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') VH.closeTop(); });
    return true;
  };

  /* ---------- modal + side panel (bellhive look) ---------- */
  const stack = [];   // open overlays, newest last: { el, onClose }
  VH.modal = function (o) {
    // o: { id, title, icon, body (html), foot (html), width: 'vh-w640' | ..., onClose }
    VH.closeModal(o.id, true);
    const ov = document.createElement('div');
    ov.className = 'bh-overlay';
    ov.id = o.id;
    ov.innerHTML = '<div class="bh-modal ' + (o.width || '') + '" role="dialog" aria-modal="true">' +
      '<div class="bh-mhead"><span>' + (o.icon ? '<i class="ti ' + o.icon + '"></i>' : '') + o.title + '</span>' +
      '<button class="bh-x" type="button" aria-label="Close" data-close>×</button></div>' +
      '<div class="bh-mbody" id="' + o.id + '-body">' + (o.body || '') + '</div>' +
      (o.foot ? '<div class="bh-mfoot" id="' + o.id + '-foot">' + o.foot + '</div>' : '') + '</div>';
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) VH.closeModal(o.id); });
    ov.querySelector('[data-close]').onclick = () => VH.closeModal(o.id);
    document.body.appendChild(ov);
    stack.push({ id: o.id, el: ov, onClose: o.onClose });
    const first = ov.querySelector('.bh-mbody input:not([type=hidden]):not([type=checkbox]):not([type=file]), .bh-mbody textarea');
    if (first && !o.noFocus) setTimeout(() => first.focus(), 30);
    return ov;
  };
  VH.closeModal = function (id, quiet) {
    const i = stack.findIndex((s) => s.id === id);
    if (i < 0) return;
    const s = stack.splice(i, 1)[0];
    if (s.drawer) { s.el.classList.remove('open'); s.ov.classList.remove('open'); setTimeout(() => { s.el.remove(); s.ov.remove(); }, 220); }
    else s.el.remove();
    if (!quiet && s.onClose) s.onClose();
  };
  VH.closeTop = function () {
    if (document.querySelector('.vh-light')) { VH.gallery.closeLight(); return; }
    const s = stack[stack.length - 1];
    if (s) VH.closeModal(s.id);
  };
  VH.isOpen = (id) => stack.some((s) => s.id === id);
  VH.drawer = function (o) {
    // o: { id, head (html), body (html), foot (html), onClose }
    VH.closeModal(o.id, true);
    const ov = document.createElement('div');
    ov.className = 'vh-drawer-ov';
    const el = document.createElement('div');
    el.className = 'vh-drawer';
    el.id = o.id;
    el.innerHTML = '<div class="vh-dh" id="' + o.id + '-head">' + o.head + '</div><div class="vh-db" id="' + o.id + '-body">' + (o.body || '') + '</div>' +
      (o.foot ? '<div class="vh-df" id="' + o.id + '-foot">' + o.foot + '</div>' : '');
    ov.onclick = () => VH.closeModal(o.id);
    document.body.appendChild(ov);
    document.body.appendChild(el);
    stack.push({ id: o.id, el, ov, drawer: true, onClose: o.onClose });
    requestAnimationFrame(() => { ov.classList.add('open'); el.classList.add('open'); });
    return el;
  };
  VH.drawerHead = (avatarHtml, title, sub, closeId) =>
    (avatarHtml || '') + '<div style="min-width:0"><div class="t">' + title + '</div><div class="s">' + (sub || '') + '</div></div>' +
    '<button class="x" type="button" aria-label="Close" onclick="VH.closeModal(\'' + closeId + '\')">×</button>';

  // "Are you sure?" with a styled box. Resolves true / false.
  VH.confirm = function (title, html, okLabel, danger) {
    return new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (done) return; done = true; VH.closeModal('vh-confirm', true); resolve(v); };
      VH.modal({
        id: 'vh-confirm', title, icon: danger ? 'ti-alert-triangle' : 'ti-help-circle', body: '<div style="font-size:14px">' + html + '</div>',
        foot: '<button class="bh-btn" type="button" id="vh-confirm-no">Cancel</button><button class="bh-btn ' + (danger ? 'danger' : 'primary') + '" type="button" id="vh-confirm-yes">' + (okLabel || 'OK') + '</button>',
        onClose: () => fin(false), noFocus: true,
      });
      document.getElementById('vh-confirm-no').onclick = () => fin(false);
      document.getElementById('vh-confirm-yes').onclick = () => fin(true);
    });
  };

  /* ---------- Dropbox upload: start -> PUT bytes -> finish ---------- */
  // ids: { equipment_id } or { maintenance_id }. onProgress(0..1). Resolves the finish result.
  VH.upload = async function (kind, ids, file, extra, onProgress) {
    const start = await VH.call(kind + '_upload_start', Object.assign({ name: file.name, size: file.size, mime: file.type }, ids));
    await new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', start.link);
      x.setRequestHeader('Content-Type', 'application/octet-stream');
      x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error('Dropbox upload failed (' + x.status + ')')));
      x.onerror = () => reject(new Error('Network error while uploading'));
      x.send(file);
    });
    return VH.call(kind + '_upload_finish', Object.assign({ path: start.path, name: file.name, mime: file.type }, ids, extra || {}));
  };
  // Little progress list: returns { row(name) -> { set(f), done(), fail(msg) } }
  VH.progress = function (holder) {
    return {
      row(name) {
        const r = document.createElement('div');
        r.className = 'vh-up-row';
        r.innerHTML = '<span class="n">' + esc(name) + '</span><span class="p">0%</span><span class="b"><i></i></span>';
        if (holder) holder.appendChild(r);
        return {
          set: (f) => { r.querySelector('.p').textContent = Math.round(f * 100) + '%'; r.querySelector('i').style.width = Math.round(f * 100) + '%'; },
          done: () => r.remove(),
          fail: (m) => { r.classList.add('fail'); r.querySelector('.p').textContent = m; },
        };
      },
    };
  };

  /* ---------- photo URLs (Dropbox temporary links last 4 hours; refresh after 3) ---------- */
  const urlCache = {};   // photo / file id -> { url, at }
  VH.photoSrc = (p) => (p.kind === 'link' ? VH.safeUrl(VH.dropboxRaw(p.storage_path)) : ((urlCache[p.id] && urlCache[p.id].url) || ''));
  VH.loadLinks = async function (photos, files) {
    const fresh = (id) => urlCache[id] && Date.now() - urlCache[id].at < 3 * 3600 * 1000;
    const pids = (photos || []).filter((p) => p && p.kind === 'dropbox' && !fresh(p.id)).map((p) => p.id);
    const fids = (files || []).filter((f) => f && f.kind === 'dropbox' && !fresh(f.id)).map((f) => f.id);
    if (!pids.length && !fids.length) return;
    try {
      const out = await VH.call('links', { photo_ids: pids, file_ids: fids });
      const now = Date.now();
      Object.entries(out.photos || {}).forEach(([id, url]) => { urlCache[id] = { url, at: now }; });
      Object.entries(out.files || {}).forEach(([id, url]) => { urlCache[id] = { url, at: now }; });
    } catch (e) { console.warn('[Vehicles] links:', e.message); }
  };
  VH.fileUrl = (f) => (f.kind === 'link' ? VH.safeUrl(f.storage_path) : ((urlCache[f.id] && urlCache[f.id].url) || ''));

  // A picture filling its box (cropped), turned. The box needs container-type:size.
  VH.rot = (p) => { const r = Number(p && p.rotation) || 0; return ((r % 360) + 360) % 360; };
  VH.coverImg = function (url, alt, rot) {
    const base = 'display:block;object-fit:cover;';
    const st = rot === 90 || rot === 270
      ? base + 'position:absolute;top:50%;left:50%;width:100cqh;height:100cqw;transform:translate(-50%,-50%) rotate(' + rot + 'deg)'
      : base + 'width:100%;height:100%' + (rot ? ';transform:rotate(' + rot + 'deg)' : '');
    return '<img src="' + esc(url || '') + '" alt="' + esc(alt || '') + '" loading="lazy" style="' + st + '" onerror="this.replaceWith(Object.assign(document.createElement(\'i\'),{className:\'ti ti-photo-off\'}))">';
  };
  VH.isPhoto = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(f.name);
  VH.isHeic = (f) => /\.(heic|heif)$/i.test(f.name) || /hei[cf]/i.test(f.type);

  /* ============================================================
   * GALLERY - photos + profile picture for one vehicle
   * ============================================================ */
  const G = (VH.gallery = { cache: {}, open: null, onChanged: null });
  // onChanged(vehicleId, profilePhotoId, count) is set by the page.
  G.load = async function (vid) {
    const { data, error } = await BH.sb.from('equipment_photos').select('*').eq('equipment_id', vid).order('uploaded_at');
    if (error) throw error;
    G.cache[vid] = data || [];
    return G.cache[vid];
  };
  G.notify = function (vid, profileId) {
    if (typeof G.onChanged === 'function') G.onChanged(vid, profileId, (G.cache[vid] || []).length);
  };
  // The profile-picture box (Info / Edit panel header, table thumbnail).
  G.avatarHtml = function (v, cls, photo) {
    const inner = photo ? VH.coverImg(VH.photoSrc(photo), 'Profile picture', VH.rot(photo)) : '<i class="ti ' + (cls === 'vh-thumb' ? VH.cls(v.class).icon : 'ti-camera-plus') + '"></i>';
    return '<span class="' + (cls || 'vh-av') + '" title="' + (photo ? 'Open the gallery' : 'Gallery: add a profile picture') + '" onclick="event.stopPropagation();VH.gallery.show(\'' + v.id + '\')">' + inner + '</span>';
  };

  G.show = async function (vid) {
    const v = G.vehicle ? G.vehicle(vid) : null;
    if (!v) return;
    G.open = { id: vid, view: null };
    VH.modal({
      id: 'vh-gallery', width: 'vh-w980', icon: 'ti-library-photo', noFocus: true,
      title: 'Gallery: ' + esc(v.unit_number) + (VH.desc(v) ? ' <span style="font:400 14px var(--bh-font);color:var(--bh-text3);margin-left:8px">' + esc(VH.desc(v)) + '</span>' : ''),
      body: '<div id="vh-gal-body"><div class="vh-empty">Loading photos…</div></div>',
      onClose: () => { G.open = null; },
    });
    try { await G.load(vid); } catch (e) { document.getElementById('vh-gal-body').innerHTML = '<div class="bh-alert">' + esc(e.message) + '</div>'; return; }
    await G.render();
  };
  G.render = async function () {
    const g = G.open, body = document.getElementById('vh-gal-body');
    if (!g || !body) return;
    const v = G.vehicle(g.id);
    const photos = G.cache[g.id] || [];
    await VH.loadLinks(photos);
    if (!G.open || !document.getElementById('vh-gal-body')) return;
    const profile = v && v.profile_photo_id;
    const tile = (p, i) => {
      const src = VH.photoSrc(p);
      const isProf = p.id === profile;
      return '<div class="vh-ph' + (isProf ? ' profile' : '') + '">' +
        '<div class="pic" onclick="VH.gallery.light(' + i + ')">' +
          (src ? VH.coverImg(src, p.filename, VH.rot(p)) : '<div class="broken"><i class="ti ti-photo-off" style="font-size:22px"></i>Not found in Dropbox</div>') + '</div>' +
        (isProf ? '<span class="tag vh-pill solid-red" style="background:var(--bh-accent);color:var(--bh-accent-ink)"><i class="ti ti-photo-star"></i> Profile</span>' : '') +
        (p.kind === 'link' ? '<span class="tag2 vh-pill blue" title="Shown from a Dropbox link"><i class="ti ti-link"></i></span>' : '') +
        '<div class="bar"><span class="n" title="' + esc(p.filename) + '">' + esc(p.filename) + '</span>' +
          '<button type="button" class="' + (isProf ? 'on' : '') + '" title="' + (isProf ? 'Stop using this as the profile picture' : 'Use as the profile picture') + '" onclick="VH.gallery.setProfile(' + (isProf ? 'null' : '\'' + p.id + '\'') + ')"><i class="ti ti-photo-star"></i></button>' +
          '<button type="button" title="Rotate left" onclick="VH.gallery.rotate(\'' + p.id + '\',-90)"><i class="ti ti-rotate-2"></i></button>' +
          '<button type="button" title="Rotate right" onclick="VH.gallery.rotate(\'' + p.id + '\',90)"><i class="ti ti-rotate-clockwise-2"></i></button>' +
          '<button type="button" class="red" title="Delete photo" onclick="VH.gallery.remove(\'' + p.id + '\')"><i class="ti ti-trash"></i></button>' +
        '</div></div>';
    };
    body.innerHTML = G.addRowHtml('vh-gal') +
      (photos.length
        ? '<div class="vh-gal">' + photos.map(tile).join('') + '</div>' +
          '<div class="vh-hint" style="margin-top:10px">Click a photo to see it large. The star-photo button picks the profile picture shown in the list and at the top of Info and Edit.</div>'
        : '<div class="vh-empty"><i class="ti ti-library-photo"></i>No photos yet. Add one and it becomes the profile picture.</div>');
    G.wireAddRow('vh-gal', (files) => G.addFiles(files), (url, name) => G.addLink(url, name));
  };

  // Upload / drop / paste-a-link row, shared by the gallery and the Add Vehicle form.
  G.addRowHtml = function (key) {
    return '<div class="vh-addrow">' +
        (VH.dropboxOk
          ? '<label class="bh-btn primary" style="cursor:pointer"><i class="ti ti-camera-plus"></i> Upload Photo(s)<input type="file" id="' + key + '-input" accept="image/*" multiple style="display:none"></label>' +
            '<div class="vh-drop" id="' + key + '-drop"><i class="ti ti-cloud-upload"></i> Drag photos here (saved to Dropbox)</div>'
          : '<div class="vh-hint" style="flex:1;align-self:center">Uploading needs the site\'s Dropbox connection (an admin sets it up on File Share). Pasting a Dropbox link works now.</div>') +
        '<button type="button" class="bh-btn" id="' + key + '-linkbtn"><i class="ti ti-link"></i> Paste Dropbox Link</button>' +
      '</div>' +
      '<div class="vh-linkbox" id="' + key + '-linkbox"><div class="row">' +
        '<input type="text" id="' + key + '-url" placeholder="Paste a Dropbox share link to ONE photo (https://www.dropbox.com/scl/fi/...)">' +
        '<button type="button" class="bh-btn primary sm" id="' + key + '-linkadd"><i class="ti ti-check"></i> Add</button></div>' +
        '<div class="vh-hint">In Dropbox: Share → Copy link (anyone with the link can view). Folder links won\'t show as a picture.</div></div>' +
      '<div class="vh-up" id="' + key + '-up"></div>';
  };
  G.wireAddRow = function (key, onFiles, onLink) {
    const $ = (s) => document.getElementById(key + '-' + s);
    const input = $('input'), drop = $('drop');
    if (input) input.onchange = () => { onFiles(Array.from(input.files || [])); input.value = ''; };
    if (drop) {
      drop.onclick = () => input && input.click();
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); onFiles(Array.from(e.dataTransfer.files || [])); };
    }
    $('linkbtn').onclick = () => { $('linkbox').classList.toggle('open'); if ($('linkbox').classList.contains('open')) $('url').focus(); };
    const add = () => {
      const url = VH.safeUrl($('url').value);
      if (!url) { toast('Paste a link that starts with https://', 'error'); return; }
      if (/dropbox\.com\/(home|sh\/)/i.test(url) || /\/scl\/fo\//i.test(url)) { toast('That looks like a folder link. Share one photo and paste its link.', 'error'); return; }
      onLink(url, VH.linkName(url));
      $('url').value = ''; $('linkbox').classList.remove('open');
    };
    $('linkadd').onclick = add;
    $('url').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  };
  G.screen = function (files) {
    const photos = files.filter(VH.isPhoto);
    if (files.length && !photos.length) { toast('Only photos go in the gallery.', 'error'); return []; }
    const ok = photos.filter((f) => {
      if (f.size > 150 * 1024 * 1024) { toast(f.name + ' is over 150 MB', 'error'); return false; }
      return true;
    });
    if (ok.some(VH.isHeic)) toast('iPhone HEIC photos only show in Safari. Export as JPG (or set Camera > Formats > Most Compatible) for everyone to see them.', '');
    return ok;
  };
  G.addFiles = async function (files) {
    const g = G.open;
    if (!g) return;
    files = G.screen(files);
    if (!files.length) return;
    const prog = VH.progress(document.getElementById('vh-gal-up'));
    let got = 0;
    for (const f of files) {
      const row = prog.row(f.name);
      try {
        const v = G.vehicle(g.id);
        const res = await VH.upload('photo', { equipment_id: g.id }, f, { make_profile: !(v && v.profile_photo_id) }, row.set);
        row.done(); got++;
        if (v && !v.profile_photo_id && res.photo) v.profile_photo_id = res.photo.id;
      } catch (e) { row.fail(e.message); }
    }
    if (got) {
      toast(got + ' photo' + (got === 1 ? '' : 's') + ' added', 'ok');
      await G.reload(g.id);
    }
  };
  G.addLink = async function (url, name) {
    const g = G.open;
    if (!g) return;
    const row = await G.insertLink(g.id, url, name, 0);
    if (!row) return;
    const v = G.vehicle(g.id);
    if (v && !v.profile_photo_id) await G.setProfileFor(g.id, row.id);
    toast('Photo link added', 'ok');
    await G.reload(g.id);
  };
  G.insertLink = async function (vid, url, name, rotation) {
    const { data, error } = await BH.sb.from('equipment_photos')
      .insert({ equipment_id: vid, kind: 'link', filename: (name || 'Dropbox photo').slice(0, 200), storage_path: url, rotation: rotation || 0 }).select().single();
    if (error) { toast('Link not saved: ' + error.message, 'error'); return null; }
    return data;
  };
  G.reload = async function (vid) {
    await G.load(vid);
    const v = G.vehicle(vid);
    G.notify(vid, v && v.profile_photo_id);
    if (G.open && G.open.id === vid) await G.render();
  };
  G.setProfileFor = async function (vid, photoId) {
    const { error } = await BH.sb.from('equipment').update({ profile_photo_id: photoId }).eq('id', vid);
    if (error) { toast('Profile picture not saved: ' + error.message, 'error'); return false; }
    const v = G.vehicle(vid);
    if (v) v.profile_photo_id = photoId;
    return true;
  };
  G.setProfile = async function (photoId) {
    const g = G.open;
    if (!g || !await G.setProfileFor(g.id, photoId)) return;
    toast(photoId ? 'Profile picture set' : 'Profile picture cleared', 'ok');
    G.notify(g.id, photoId);
    await G.render();
  };
  G.rotate = async function (photoId, dir) {
    const g = G.open;
    const p = g && (G.cache[g.id] || []).find((x) => x.id === photoId);
    if (!p) return;
    const rotation = (VH.rot(p) + (dir < 0 ? 270 : 90)) % 360;
    const { error } = await BH.sb.from('equipment_photos').update({ rotation }).eq('id', photoId);
    if (error) { toast('Rotate not saved: ' + error.message, 'error'); return; }
    p.rotation = rotation;
    const v = G.vehicle(g.id);
    G.notify(g.id, v && v.profile_photo_id);
    await G.render();
  };
  G.remove = async function (photoId) {
    const g = G.open;
    const p = g && (G.cache[g.id] || []).find((x) => x.id === photoId);
    if (!p) return;
    const ok = await VH.confirm('Delete Photo', 'Delete <b>' + esc(p.filename) + '</b>?' + (p.kind === 'dropbox' ? ' It is also removed from the site\'s Dropbox folder.' : ' (The photo stays in your Dropbox; only the link is removed.)'), 'Delete', true);
    if (!ok) return;
    try {
      if (p.kind === 'dropbox') await VH.call('delete_photo', { id: p.id });
      else { const { error } = await BH.sb.from('equipment_photos').delete().eq('id', p.id); if (error) throw error; }
    } catch (e) { toast('Delete failed: ' + e.message, 'error'); return; }
    const v = G.vehicle(g.id);
    if (v && v.profile_photo_id === p.id) v.profile_photo_id = null;   // the database clears it too
    toast('Photo deleted', 'ok');
    await G.reload(g.id);
  };

  /* lightbox */
  G.light = function (i) {
    const g = G.open;
    const list = g ? G.cache[g.id] || [] : [];
    if (!list.length) return;
    i = (i + list.length) % list.length;
    G.lightIdx = i;
    const p = list[i], src = VH.photoSrc(p), rot = VH.rot(p);
    let box = document.querySelector('.vh-light');
    if (!box) { box = document.createElement('div'); box.className = 'vh-light'; document.body.appendChild(box); box.onclick = (e) => { if (e.target === box) G.closeLight(); }; }
    const open = p.kind === 'link' ? VH.dropboxView(p.storage_path) : src;
    const q = rot === 90 || rot === 270;
    const st = rot ? ' style="transform:rotate(' + rot + 'deg)' + (q ? ';max-width:80vh;max-height:90vw' : '') + '"' : '';
    box.innerHTML = '<div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;width:100%">' +
      (src ? '<img src="' + esc(src) + '" alt="' + esc(p.filename) + '"' + st + '>' : '<div style="color:#fff">Not found in Dropbox</div>') + '</div>' +
      '<div class="cap">' + esc(p.filename) + ' &middot; ' + (i + 1) + ' of ' + list.length + (open ? ' &middot; <a href="' + esc(open) + '" target="_blank" rel="noopener">Open original</a>' : '') + '</div>' +
      (list.length > 1 ? '<button class="nav l" type="button" onclick="VH.gallery.light(VH.gallery.lightIdx-1)">‹</button><button class="nav r" type="button" onclick="VH.gallery.light(VH.gallery.lightIdx+1)">›</button>' : '') +
      '<button class="close" type="button" onclick="VH.gallery.closeLight()">×</button>';
    if (!G.lightKeys) {
      G.lightKeys = (e) => { if (!document.querySelector('.vh-light')) return; if (e.key === 'ArrowLeft') G.light(G.lightIdx - 1); if (e.key === 'ArrowRight') G.light(G.lightIdx + 1); };
      document.addEventListener('keydown', G.lightKeys);
    }
  };
  G.closeLight = () => { const b = document.querySelector('.vh-light'); if (b) b.remove(); };

  /* Pending photos on the Add Vehicle form: they go up after the vehicle is saved. */
  G.pending = [];
  G.pendingReset = () => { G.pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)); G.pending = []; };
  G.pendingRender = function () {
    const el = document.getElementById('vh-addgal-pend');
    if (!el) return;
    el.innerHTML = G.pending.length
      ? '<div class="vh-pend">' + G.pending.map((p, i) =>
          '<div class="vh-ph' + (i === 0 ? ' profile' : '') + '"><div class="pic">' + VH.coverImg(p.file ? p.preview : VH.dropboxRaw(p.url), p.name, VH.rot(p)) + '</div>' +
          (i === 0 ? '<span class="tag vh-pill" style="background:var(--bh-accent);color:var(--bh-accent-ink)">Profile</span>' : '') +
          '<div class="bar"><span class="n">' + esc(p.name) + '</span>' +
          '<button type="button" title="Rotate right" onclick="VH.gallery.pendingRotate(' + i + ')"><i class="ti ti-rotate-clockwise-2"></i></button>' +
          '<button type="button" class="red" title="Remove" onclick="VH.gallery.pendingRemove(' + i + ')"><i class="ti ti-x"></i></button></div></div>').join('') + '</div>'
      : '<div class="vh-hint" style="margin-bottom:8px">No photos yet. The first one becomes the profile picture.</div>';
  };
  G.pendingWire = function () {
    G.wireAddRow('vh-addgal',
      (files) => { G.screen(files).forEach((f) => { let preview = null; try { preview = URL.createObjectURL(f); } catch (e) { /* ignore */ } G.pending.push({ file: f, name: f.name, preview, rotation: 0 }); }); G.pendingRender(); },
      (url, name) => { G.pending.push({ url, name, rotation: 0 }); G.pendingRender(); });
    G.pendingRender();
  };
  G.pendingRotate = (i) => { const p = G.pending[i]; if (p) { p.rotation = (VH.rot(p) + 90) % 360; G.pendingRender(); } };
  G.pendingRemove = (i) => { const p = G.pending[i]; if (p && p.preview) URL.revokeObjectURL(p.preview); G.pending.splice(i, 1); G.pendingRender(); };
  G.savePending = async function (vid) {
    const list = G.pending.slice();
    let got = 0, first = null;
    const prog = VH.progress(document.getElementById('vh-addgal-up'));
    for (const p of list) {
      if (p.file) {
        const row = prog.row(p.name);
        try { const r = await VH.upload('photo', { equipment_id: vid }, p.file, { rotation: VH.rot(p) }, row.set); row.done(); got++; if (!first) first = r.photo; }
        catch (e) { row.fail(e.message); }
      } else {
        const r = await G.insertLink(vid, p.url, p.name, VH.rot(p));
        if (r) { got++; if (!first) first = r; }
      }
    }
    if (first) await G.setProfileFor(vid, first.id);
    G.pendingReset();
    delete G.cache[vid];
    return { got, want: list.length };
  };

  /* ============================================================
   * NOTES - on a vehicle (equipment_notes) or an entry (equipment_maintenance_notes)
   * ============================================================ */
  const N = (VH.notes = {});
  const NT = { vehicle: { table: 'equipment_notes', fk: 'equipment_id' }, entry: { table: 'equipment_maintenance_notes', fk: 'maintenance_id' } };
  N.counts = async function (type, ids) {
    const c = NT[type], out = {};
    if (!ids.length) return out;
    const { data } = await BH.sb.from(c.table).select(c.fk).in(c.fk, ids);
    (data || []).forEach((r) => { out[r[c.fk]] = (out[r[c.fk]] || 0) + 1; });
    return out;
  };
  N.cellHtml = (type, id, n, toggleFn) =>
    '<span class="vh-cnt' + (n ? ' has' : '') + '" title="Notes" onclick="' + toggleFn + '(\'' + id + '\')"><i class="ti ti-notes"></i>' + (n || '') + '</span>';
  // render(type, id, holderId, onCount(n))
  N.render = async function (type, id, holderId, onCount) {
    const c = NT[type], el = document.getElementById(holderId);
    if (!el) return;
    const { data, error } = await BH.sb.from(c.table).select('*').eq(c.fk, id).order('created_at', { ascending: false });
    if (!document.getElementById(holderId)) return;
    if (error) { el.innerHTML = '<div class="bh-alert">' + esc(error.message) + '</div>'; return; }
    const list = data || [];
    if (onCount) onCount(list.length);
    const mine = (n) => n.user_id === BH.user.id || BH.isAdmin();
    el.innerHTML =
      '<div class="vh-note-add"><textarea rows="2" id="' + holderId + '-new" placeholder="Add a note…"></textarea>' +
      '<button class="bh-btn primary sm" type="button" id="' + holderId + '-add"><i class="ti ti-plus"></i> Add</button></div>' +
      '<div class="vh-notes" style="margin-top:8px">' +
      (list.length ? list.map((n) =>
        '<div class="vh-note" data-id="' + n.id + '"><div class="h"><b>' + esc(n.user_name || 'Someone') + '</b><span>' + esc(BH.ui.fmtWhen(n.created_at)) + (n.edited_at ? ' · edited' : '') + '</span><span class="sp"></span>' +
          (mine(n) ? '<button type="button" title="Edit" data-act="edit"><i class="ti ti-pencil"></i></button><button type="button" title="Delete" data-act="del"><i class="ti ti-trash"></i></button>' : '') +
        '</div><div class="t">' + esc(n.note_text) + '</div></div>').join('')
        : '<div class="vh-hint">No notes yet.</div>') + '</div>';
    const add = async () => {
      const ta = document.getElementById(holderId + '-new');
      const text = (ta.value || '').trim();
      if (!text) return;
      const row = { note_text: text, user_id: BH.user.id };
      row[c.fk] = id;
      const { error: e } = await BH.sb.from(c.table).insert(row);
      if (e) { toast('Note not saved: ' + e.message, 'error'); return; }
      N.render(type, id, holderId, onCount);
    };
    document.getElementById(holderId + '-add').onclick = add;
    document.getElementById(holderId + '-new').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(); };
    el.querySelectorAll('.vh-note button').forEach((b) => {
      b.onclick = async () => {
        const box = b.closest('.vh-note'), nid = box.dataset.id, n = list.find((x) => x.id === nid);
        if (b.dataset.act === 'del') {
          if (!await VH.confirm('Delete Note', 'Delete this note?', 'Delete', true)) return;
          const { error: e } = await BH.sb.from(c.table).delete().eq('id', nid);
          if (e) { toast('Delete failed: ' + e.message, 'error'); return; }
          N.render(type, id, holderId, onCount);
          return;
        }
        const t = box.querySelector('.t');
        t.innerHTML = '<textarea rows="3">' + esc(n.note_text) + '</textarea><div style="display:flex;gap:6px;margin-top:6px"><button class="bh-btn primary sm" type="button">Save</button><button class="bh-btn sm" type="button">Cancel</button></div>';
        const [save, cancel] = t.querySelectorAll('button');
        cancel.onclick = () => N.render(type, id, holderId, onCount);
        save.onclick = async () => {
          const text = t.querySelector('textarea').value.trim();
          if (!text) return;
          const { error: e } = await BH.sb.from(c.table).update({ note_text: text }).eq('id', nid);
          if (e) { toast('Not saved: ' + e.message, 'error'); return; }
          N.render(type, id, holderId, onCount);
        };
        t.querySelector('textarea').focus();
      };
    });
  };

  /* ============================================================
   * FILES - invoices / receipts on a maintenance entry
   * ============================================================ */
  const F = (VH.files = {});
  F.counts = async function (ids) {
    const out = {};
    if (!ids.length) return out;
    const { data } = await BH.sb.from('equipment_maintenance_files').select('maintenance_id').in('maintenance_id', ids);
    (data || []).forEach((r) => { out[r.maintenance_id] = (out[r.maintenance_id] || 0) + 1; });
    return out;
  };
  F.cellHtml = (id, n, toggleFn) =>
    '<span class="vh-cnt' + (n ? ' has' : '') + '" title="Invoices / files" onclick="' + toggleFn + '(\'' + id + '\')"><i class="ti ti-paperclip"></i>' + (n || '') + '</span>';
  F.render = async function (entryId, holderId, onCount) {
    const el = document.getElementById(holderId);
    if (!el) return;
    const { data, error } = await BH.sb.from('equipment_maintenance_files').select('*').eq('maintenance_id', entryId).order('uploaded_at');
    if (!document.getElementById(holderId)) return;
    if (error) { el.innerHTML = '<div class="bh-alert">' + esc(error.message) + '</div>'; return; }
    const list = data || [];
    if (onCount) onCount(list.length);
    el.innerHTML =
      '<div class="vh-files">' + (list.length ? list.map((f) =>
        '<div class="vh-file" data-id="' + f.id + '"><i class="ti ' + (f.kind === 'link' ? 'ti-link link' : /pdf/i.test(f.content_type || f.filename) ? 'ti-file-type-pdf' : /^image/.test(f.content_type || '') ? 'ti-photo' : 'ti-file') + '"></i>' +
          '<span class="n"><a data-act="open">' + esc(f.filename) + '</a></span><span class="s">' + (f.kind === 'link' ? 'Dropbox link' : VH.fileSize(f.file_size)) + ' · ' + esc(VH.fmtDate(VH.localDate(f.uploaded_at))) + '</span>' +
          '<button class="vh-ib red" type="button" title="Delete" data-act="del"><i class="ti ti-trash"></i></button></div>').join('')
        : '<div class="vh-hint">No invoices or receipts yet.</div>') + '</div>' +
      F.addRowHtml(holderId + '-add');
    F.wire(holderId + '-add', (files) => F.uploadAll(entryId, files, holderId + '-add-up').then(() => F.render(entryId, holderId, onCount)),
      async (url, name) => { if (await F.insertLink(entryId, url, name)) F.render(entryId, holderId, onCount); });
    el.querySelectorAll('.vh-file [data-act]').forEach((b) => {
      b.onclick = async () => {
        const f = list.find((x) => x.id === b.closest('.vh-file').dataset.id);
        if (!f) return;
        if (b.dataset.act === 'open') { F.open(f); return; }
        if (!await VH.confirm('Delete File', 'Delete <b>' + esc(f.filename) + '</b>?' + (f.kind === 'dropbox' ? ' It is also removed from the site\'s Dropbox folder.' : ''), 'Delete', true)) return;
        try {
          if (f.kind === 'dropbox') await VH.call('delete_file', { id: f.id });
          else { const { error: e } = await BH.sb.from('equipment_maintenance_files').delete().eq('id', f.id); if (e) throw e; }
        } catch (e) { toast('Delete failed: ' + e.message, 'error'); return; }
        F.render(entryId, holderId, onCount);
      };
    });
  };
  F.open = async function (f) {
    const w = window.open('', '_blank');
    if (f.kind === 'dropbox') await VH.loadLinks([], [f]);
    const url = f.kind === 'link' ? VH.safeUrl(f.storage_path) : VH.fileUrl(f);
    if (!url) { if (w) w.close(); toast('That file is no longer in Dropbox.', 'error'); return; }
    if (w) { w.opener = null; w.location = url; } else location.href = url;
  };
  F.addRowHtml = (key) =>
    '<div class="vh-addrow">' +
      (VH.dropboxOk
        ? '<label class="bh-btn primary sm" style="cursor:pointer"><i class="ti ti-upload"></i> Upload File(s)<input type="file" id="' + key + '-input" multiple style="display:none"></label>' +
          '<div class="vh-drop" id="' + key + '-drop"><i class="ti ti-cloud-upload"></i> Drag invoices / receipts here</div>'
        : '') +
      '<button type="button" class="bh-btn sm" id="' + key + '-linkbtn"><i class="ti ti-link"></i> Add Link</button></div>' +
    '<div class="vh-linkbox" id="' + key + '-linkbox"><div class="row"><input type="text" id="' + key + '-url" placeholder="Paste a Dropbox (or other https) link">' +
      '<button type="button" class="bh-btn primary sm" id="' + key + '-linkadd"><i class="ti ti-check"></i> Add</button></div></div>' +
    '<div class="vh-up" id="' + key + '-up"></div>';
  F.wire = function (key, onFiles, onLink) {
    const $ = (s) => document.getElementById(key + '-' + s);
    const input = $('input'), drop = $('drop');
    if (input) input.onchange = () => { onFiles(Array.from(input.files || [])); input.value = ''; };
    if (drop) {
      drop.onclick = () => input && input.click();
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); onFiles(Array.from(e.dataTransfer.files || [])); };
    }
    $('linkbtn').onclick = () => { $('linkbox').classList.toggle('open'); if ($('linkbox').classList.contains('open')) $('url').focus(); };
    const add = () => {
      const url = VH.safeUrl($('url').value);
      if (!url) { toast('Paste a link that starts with https://', 'error'); return; }
      onLink(url, VH.linkName(url));
      $('url').value = ''; $('linkbox').classList.remove('open');
    };
    $('linkadd').onclick = add;
    $('url').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  };
  F.insertLink = async function (entryId, url, name) {
    const { error } = await BH.sb.from('equipment_maintenance_files').insert({ maintenance_id: entryId, kind: 'link', filename: name.slice(0, 200), storage_path: url });
    if (error) { toast('Link not saved: ' + error.message, 'error'); return false; }
    return true;
  };
  F.uploadAll = async function (entryId, files, progId) {
    const prog = VH.progress(document.getElementById(progId));
    let got = 0;
    for (const f of files) {
      if (f.size > 150 * 1024 * 1024) { toast(f.name + ' is over 150 MB', 'error'); continue; }
      const row = prog.row(f.name);
      try { await VH.upload('file', { maintenance_id: entryId }, f, null, row.set); row.done(); got++; }
      catch (e) { row.fail(e.message); }
    }
    return got;
  };

  /* ---------- print: a clean report in a new window ---------- */
  VH.printReport = function (title, filterLabel, headCells, rowsHtml, extraHtml) {
    const w = window.open('', '_blank');
    if (!w) { toast('Allow pop-ups for this site to print.', 'error'); return; }
    const gen = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(title) + ' · bellhive99</title><style>' +
      '@page{size:landscape;margin:.5in}body{font:12px "Segoe UI",Arial,sans-serif;color:#1e1a14;margin:0;padding:20px}' +
      '.lh{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #f2b134;padding-bottom:8px;margin-bottom:12px}' +
      '.co{font:700 24px "Arial Narrow",Arial,sans-serif}.co b{color:#c98f12}.rt{font:700 18px "Arial Narrow",Arial,sans-serif;text-align:right}.meta{font-size:11px;color:#5f5747;text-align:right}' +
      'table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#5f5747;background:#faf8f4;border-bottom:1.5px solid #d3ccbd;padding:6px}' +
      'td{padding:6px;border-bottom:1px solid #e6e1d6;vertical-align:top}.r{text-align:right}.sub{color:#948a77;font-size:10.5px}tfoot td{font-weight:700;border-top:1.5px solid #d3ccbd}' +
      '.foot{margin-top:14px;font-size:10px;color:#948a77;display:flex;justify-content:space-between}.card{border:1px solid #e6e1d6;border-radius:8px;padding:10px 12px;margin-bottom:12px;display:grid;grid-template-columns:repeat(4,1fr);gap:6px 14px}.card .k{font-size:9.5px;text-transform:uppercase;color:#948a77}' +
      '</style></head><body>' +
      '<div class="lh"><div class="co">bell<b>hive</b>99 <span style="font-weight:400;font-size:14px;color:#5f5747">· The Bell Family</span></div>' +
      '<div><div class="rt">' + esc(title) + '</div><div class="meta">' + esc(filterLabel) + ' · ' + gen + '</div></div></div>' +
      (extraHtml || '') +
      '<table><thead><tr>' + headCells.map((h) => '<th' + (h.r ? ' class="r"' : '') + '>' + esc(h.t || h) + '</th>').join('') + '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
      '<div class="foot"><span>Printed by ' + esc(BH.displayName()) + '</span><span>bellhive99.com</span></div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    w.document.close();
  };
})();
