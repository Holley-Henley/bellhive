/* ============================================================
 * Chrisware / bellhive99.com - vehicles/inventory.js
 * RESOURCES > Inventory. Cloned from HHB Project Exchange (modules/equipment.js, Heavy
 * Equipment & Vehicles > Inventory, 261028.03-.10) and restyled for bellhive.
 *
 * 261031.05, per Chris: one Inventory for everything the family keeps up, modeled on the
 * _Allthing workbook's Data & Specifications tab. Each item has a Class -
 *   Vehicles · Equipment · Home & Appliances · Pets   (the workbook's DATA TYPE A / OPE / R / P)
 * - with class tabs, and the Add / Edit form shows the fields that class uses (odometer and
 * VIN for vehicles, address for the house, breed / sex / birthday for pets, ...).
 *
 *  - Owner: an item belongs to a family member; only the owner and admins see it (database
 *    rule). Members add their own; admins can add for anyone and change the owner.
 *  - Photos live in the site's Dropbox app folder (uploads) or are pasted Dropbox links.
 *  - NHTSA VIN lookup + recalls for vehicles.
 * ============================================================ */
const mc = document.getElementById('mc');
const esc = VH.esc;

let vhRows = [];
let vhProfile = {};      // item id -> its profile photo row
let vhPhotoCount = {};
let vhNoteCount = {};
let vhMaint = {};        // item id -> { n, last, cost }
let vhYearCost = {};     // 'YYYY' -> { all, vehicle, ... }
let vhSortCol = 'name', vhSortDir = 1;
let vhClass = new URLSearchParams(location.search).get('class') || '';
let vhShow = 'inuse', vhType = '', vhOwner = '';
let vhNotesOpen = null;
let vhInfoId = null, vhEditId = null;
let vhSaving = false;

const vhFindRow = (id) => vhRows.find((r) => r.id === id);
window.vhFindRow = vhFindRow;
VH.gallery.vehicle = vhFindRow;
VH.gallery.onChanged = (vid, profileId, count) => {
  vhPhotoCount[vid] = count;
  const list = VH.gallery.cache[vid] || [];
  vhProfile[vid] = list.find((p) => p.id === profileId) || null;
  vhRender();
  if (vhInfoId === vid && VH.isOpen('vh-info')) vhRenderInfo();
  if (vhEditId === vid && VH.isOpen('vh-edit')) vhEditHead();
};
const vhIsAdmin = () => BH.isAdmin();
const vhShowOwner = () => vhIsAdmin() || vhRows.some((r) => r.owner_id !== BH.user.id);

/* ---------- data ---------- */
async function vhLoad() {
  const [rows, photos, notes, maint] = await Promise.all([
    BH.sb.from('equipment').select('*').order('unit_number'),
    BH.sb.from('equipment_photos').select('id, equipment_id, kind, storage_path, rotation, filename'),
    BH.sb.from('equipment_notes').select('equipment_id'),
    BH.sb.from('equipment_maintenance').select('equipment_id, service_date, cost'),
  ]);
  if (rows.error) throw new Error('Could not load the inventory: ' + rows.error.message);
  vhRows = rows.data || [];
  vhPhotoCount = {}; vhProfile = {}; vhNoteCount = {}; vhMaint = {}; vhYearCost = {};
  const byId = {};
  (photos.data || []).forEach((p) => { vhPhotoCount[p.equipment_id] = (vhPhotoCount[p.equipment_id] || 0) + 1; byId[p.id] = p; });
  vhRows.forEach((r) => { if (r.profile_photo_id && byId[r.profile_photo_id]) vhProfile[r.id] = byId[r.profile_photo_id]; });
  (notes.data || []).forEach((n) => { vhNoteCount[n.equipment_id] = (vhNoteCount[n.equipment_id] || 0) + 1; });
  (maint.data || []).forEach((m) => {
    const s = vhMaint[m.equipment_id] || (vhMaint[m.equipment_id] = { n: 0, last: null, cost: 0 });
    s.n++; s.cost += Number(m.cost) || 0;
    if (!s.last || m.service_date > s.last) s.last = m.service_date;
    const r = vhFindRow(m.equipment_id), y = String(m.service_date).slice(0, 4);
    const yc = vhYearCost[y] || (vhYearCost[y] = { all: 0 });
    yc.all += Number(m.cost) || 0;
    if (r) yc[r.class] = (yc[r.class] || 0) + (Number(m.cost) || 0);
  });
}

async function vhStart() {
  if (!await VH.boot('vehicles-inventory', mc)) return;
  try { await vhLoad(); } catch (e) { mc.innerHTML = '<div class="bh-alert">' + esc(e.message) + '</div>'; return; }
  vhBuildActs();
  vhRender();
  await VH.loadLinks(Object.values(vhProfile));
  vhRender();
  const open = new URLSearchParams(location.search).get('info');
  if (open && vhFindRow(open)) vhOpenInfo(open);
}

/* ---------- header buttons ---------- */
function vhBuildActs() {
  document.getElementById('vh-acts').innerHTML =
    '<a class="bh-btn" href="maintenance.html" style="text-decoration:none"><i class="ti ti-tool"></i> Maintenance</a>' +
    '<button class="bh-btn" type="button" onclick="vhPrint()"><i class="ti ti-printer"></i> Print Report</button>' +
    (vhIsAdmin() ? '<button class="bh-btn" type="button" onclick="vhOpenLists()" title="Type, Status, Service Category and Service lists"><i class="ti ti-list-details"></i> Lists</button>' : '') +
    '<button class="bh-btn primary" type="button" onclick="vhOpenAdd()"><i class="ti ti-plus"></i> Add Item</button>';
}
function vhSetClass(c) {
  vhClass = c; vhType = '';
  history.replaceState(null, '', location.pathname + (c ? '?class=' + c : ''));
  vhRender();
}

/* ---------- filter / sort ---------- */
function vhFiltered() {
  const q = VH.norm(document.getElementById('vh-search') && document.getElementById('vh-search').value);
  return vhRows.filter((r) => {
    if (vhClass && r.class !== vhClass) return false;
    if (vhShow === 'inuse' && !VH.inUse(r)) return false;
    if (vhShow !== 'inuse' && vhShow !== 'all' && r.status_id !== vhShow) return false;
    if (vhType && r.type_id !== vhType) return false;
    if (vhOwner && r.owner_id !== vhOwner) return false;
    if (!q) return true;
    return [r.unit_number, r.code, VH.desc(r), r.nickname, r.address, r.color, r.engine, r.specifications, r.vin, r.license_plate, r.purchased_from,
      VH.memberName(r.owner_id), VH.optLabel(r.type_id), VH.optLabel(r.status_id)].some((v) => VH.norm(v).includes(q));
  });
}
function vhSorted(items) {
  const ord = (id) => { const o = VH.opt(id); return o ? o.sort_order : 9999; };
  const cord = (c) => VH.CLASSES.findIndex((x) => x.id === c);
  const key = (r) => {
    switch (vhSortCol) {
      case 'desc': return VH.norm(VH.desc(r));
      case 'type': return cord(r.class) + String(ord(r.type_id)).padStart(5, '0');
      case 'owner': return VH.norm(VH.memberName(r.owner_id));
      case 'meter': return r.class === 'pet' ? -(new Date(r.birth_date || '2100-01-01')) / 1e11 : Number(r.odometer != null ? r.odometer : r.hours != null ? r.hours : -1);
      case 'registration': return r.registration_expires || '9999-12-31';
      case 'service': return (vhMaint[r.id] && vhMaint[r.id].last) || '0000';
      case 'status': return ord(r.status_id);
      default: return String(r.unit_number || '');
    }
  };
  return items.slice().sort((a, b) => {
    const va = key(a), vb = key(b);
    const c = typeof va === 'number' ? va - vb : vhSortCol === 'name' ? va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' }) : va < vb ? -1 : va > vb ? 1 : 0;
    return c ? c * vhSortDir : String(a.unit_number).localeCompare(String(b.unit_number), undefined, { numeric: true });
  });
}
function vhSetSort(col) {
  if (vhSortCol === col) vhSortDir *= -1;
  else { vhSortCol = col; vhSortDir = col === 'meter' || col === 'service' ? -1 : 1; }
  vhRenderTable();
}
function vhRegDays(r) {
  if (!r.registration_expires) return null;
  return Math.round((new Date(r.registration_expires + 'T12:00:00') - new Date(VH.today() + 'T12:00:00')) / 86400000);
}

/* ---------- render ---------- */
function vhRender() {
  if (!document.getElementById('vh-shell')) {
    mc.innerHTML = '<div id="vh-tabs"></div><div id="vh-tiles"></div><div class="vh-bar"><div class="vh-filters" id="vh-filters"></div>' +
      '<div class="vh-search-box"><i class="ti ti-search"></i><input class="vh-search" id="vh-search" type="search" placeholder="Search name, code, make, model, VIN, breed…" oninput="vhRenderTable()"></div></div>' +
      '<div id="vh-shell"></div>';
  }
  const inUse = vhRows.filter(VH.inUse);
  const counts = { all: inUse.length };
  VH.CLASSES.forEach((c) => { counts[c.id] = inUse.filter((r) => r.class === c.id).length; });
  document.getElementById('vh-tabs').innerHTML = VH.classTabsHtml(vhClass, counts, 'vhSetClass');

  const scope = inUse.filter((r) => !vhClass || r.class === vhClass);
  const year = VH.today().slice(0, 4);
  const yc = vhYearCost[year] || {};
  const regDue = scope.filter((r) => { const d = vhRegDays(r); return d != null && d <= 30; }).length;
  const types = VH.opts.type.filter((o) => (!vhClass || o.class === vhClass)).map((o) => ({ o, n: scope.filter((r) => r.type_id === o.id).length })).filter((x) => x.n);
  document.getElementById('vh-tiles').innerHTML = '<div class="vh-tiles">' +
    (vhClass
      ? '<div class="vh-tile"><div class="l">' + esc(VH.cls(vhClass).label) + '</div><div class="v">' + scope.length + '</div><div class="s">in use</div></div>' +
        types.slice(0, 4).map((x) => '<div class="vh-tile c-blue click" onclick="vhType=\'' + x.o.id + '\';vhRender()"><div class="l">' + esc(x.o.label) + '</div><div class="v">' + x.n + '</div></div>').join('')
      : '<div class="vh-tile"><div class="l">In Use</div><div class="v">' + inUse.length + '</div><div class="s">' + (vhRows.length > inUse.length ? (vhRows.length - inUse.length) + ' gone' : (vhIsAdmin() ? 'everyone\'s' : 'yours')) + '</div></div>' +
        VH.CLASSES.map((c) => '<div class="vh-tile c-blue click" onclick="vhSetClass(\'' + c.id + '\')"><div class="l"><i class="ti ' + c.icon + '"></i> ' + esc(c.label) + '</div><div class="v">' + counts[c.id] + '</div></div>').join('')) +
    (!vhClass || vhClass === 'vehicle' || vhClass === 'equipment'
      ? '<div class="vh-tile ' + (regDue ? 'c-red' : 'c-dim') + '" title="Tag / registration expired or expiring within 30 days"><div class="l">Tags Due</div><div class="v">' + regDue + '</div></div>' : '') +
    '<div class="vh-tile c-orange" title="Maintenance cost logged this year"><div class="l">Upkeep ' + year + '</div><div class="v" style="font-size:22px;padding-top:4px">' + (VH.money(vhClass ? yc[vhClass] || 0 : yc.all || 0) || '$0.00') + '</div></div>' +
    '</div>';

  const opt = (cur, v, l) => '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>';
  const typeList = VH.opts.type.filter((o) => (o.active || o.id === vhType) && (!vhClass || o.class === vhClass));
  document.getElementById('vh-filters').innerHTML = 'Show ' +
    '<select class="vh-select" onchange="vhShow=this.value;vhRenderTable()">' + opt(vhShow, 'inuse', 'In Use') + opt(vhShow, 'all', 'Everything') +
      VH.opts.status.filter((o) => o.active).map((o) => opt(vhShow, o.id, o.label)).join('') + '</select>' +
    '<select class="vh-select" onchange="vhType=this.value;vhRenderTable()">' + opt(vhType, '', 'All types') +
      typeList.map((o) => opt(vhType, o.id, (vhClass ? '' : VH.cls(o.class).one + ': ') + o.label)).join('') + '</select>' +
    (vhShowOwner()
      ? '<select class="vh-select" onchange="vhOwner=this.value;vhRenderTable()">' + opt(vhOwner, '', 'Everyone\'s') +
          Array.from(new Set(vhRows.map((r) => r.owner_id).filter(Boolean))).map((id) => [id, VH.memberName(id)]).sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, n]) => opt(vhOwner, id, n)).join('') + '</select>'
      : '<span class="vh-scope"><i class="ti ti-lock"></i> Only you and the admins see your items</span>');
  vhRenderTable();
}

function vhRenderTable() {
  const shell = document.getElementById('vh-shell');
  if (!shell) return;
  const list = vhSorted(vhFiltered());
  const showOwner = vhShowOwner();
  const showTag = !vhClass || vhClass === 'vehicle' || vhClass === 'equipment';
  const meterLabel = vhClass === 'pet' ? 'Age' : (vhClass === 'home' ? '' : vhClass ? 'Meter' : 'Meter / Age');
  const cols = 9 + (showOwner ? 1 : 0) + (showTag ? 1 : 0) + (meterLabel ? 1 : 0);
  const th = (col, label, st) => '<th class="sortable' + (vhSortCol === col ? ' sort-active' : '') + '" style="' + (st || '') + '" onclick="vhSetSort(\'' + col + '\')">' + label + VH.sortArrow(vhSortCol === col, vhSortDir === 1) + '</th>';
  const empty = vhRows.length ? 'Nothing matches.' : 'Nothing here yet. Click <b>Add Item</b> to add the first one.';
  shell.innerHTML = '<div class="vh-tbl-wrap"><table class="vh-tbl"><thead><tr>' +
    '<th style="width:56px"></th>' + th('name', 'Name') + th('desc', 'Description') + th('type', vhClass ? 'Type' : 'Class / Type') +
    (showOwner ? th('owner', 'Owner') : '') + (meterLabel ? th('meter', meterLabel) : '') + th('service', vhClass === 'pet' ? 'Last Visit' : 'Last Service') +
    (showTag ? th('registration', 'Tag / Registration') : '') + th('status', 'Status') +
    '<th style="text-align:center">Notes</th><th style="text-align:center">Pictures</th><th></th></tr></thead><tbody>' +
    (list.length ? list.map((r) => vhRow(r, showOwner, showTag, !!meterLabel, cols)).join('') : '<tr><td colspan="' + cols + '"><div class="vh-empty"><i class="ti ' + (vhClass ? VH.cls(vhClass).icon : 'ti-clipboard-list') + '"></i>' + empty + '</div></td></tr>') +
    '</tbody></table></div>';
  if (vhNotesOpen && vhFindRow(vhNotesOpen)) VH.notes.render('vehicle', vhNotesOpen, 'vh-xnotes-' + vhNotesOpen, (n) => vhNotesCount(vhNotesOpen, n));
}
function vhRow(r, showOwner, showTag, showMeter, cols) {
  const rd = vhRegDays(r);
  const regColor = rd == null ? 'var(--bh-text3)' : rd < 0 ? 'var(--bh-red)' : rd <= 30 ? '#b8650f' : 'var(--bh-text3)';
  const m = vhMaint[r.id];
  const meter = r.class === 'pet' ? (r.birth_date ? VH.age(r.birth_date) + '<div class="sub">born ' + VH.fmtDate(r.birth_date) + '</div>' : '')
    : VH.meterLines(r).length ? VH.meterLines(r).join('<br>') + (r.meter_date ? '<div class="sub">as of ' + VH.fmtDate(r.meter_date) + '</div>' : '') : '';
  const sub = r.class === 'pet' ? [r.nickname ? '"' + r.nickname + '"' : '', r.color].filter(Boolean).join(' · ')
    : [r.code, r.color].filter(Boolean).join(' · ');
  const desc2 = r.class === 'home' ? (r.make || r.model ? r.address : '') : r.class === 'pet' ? '' : r.engine;
  return '<tr class="' + (VH.inUse(r) ? '' : 'dim') + '">' +
    '<td>' + VH.gallery.avatarHtml(r, 'vh-thumb', vhProfile[r.id]) + '</td>' +
    '<td><span class="vh-name" onclick="vhOpenInfo(\'' + r.id + '\')">' + esc(r.unit_number) + '</span>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</td>' +
    '<td>' + esc(VH.desc(r)) + (desc2 ? '<div class="sub">' + esc(desc2) + '</div>' : '') + '</td>' +
    '<td>' + (vhClass ? esc(VH.optLabel(r.type_id)) : '<i class="ti ' + VH.cls(r.class).icon + '" style="color:#b8862a;margin-right:4px"></i>' + esc(VH.cls(r.class).one) + '<div class="sub">' + esc(VH.optLabel(r.type_id)) + '</div>') + '</td>' +
    (showOwner ? '<td>' + esc(VH.memberName(r.owner_id)) + '</td>' : '') +
    (showMeter ? '<td>' + meter + '</td>' : '') +
    '<td>' + (m ? '<a class="vh-name" style="font-weight:600" href="maintenance.html?unit=' + r.id + '">' + VH.fmtDate(m.last) + '</a><div class="sub">' + m.n + ' entr' + (m.n === 1 ? 'y' : 'ies') + '</div>' : '<span class="sub">none yet</span>') + '</td>' +
    (showTag ? '<td>' + esc(r.license_plate || '') + (r.registration_expires ? '<div class="sub" style="color:' + regColor + '">' + (rd < 0 ? 'expired ' : 'exp. ') + VH.fmtDate(r.registration_expires) + '</div>' : '') + '</td>' : '') +
    '<td>' + VH.statusPill(r.status_id) + '</td>' +
    '<td style="text-align:center">' + VH.notes.cellHtml('vehicle', r.id, vhNoteCount[r.id], 'vhToggleNotes') + '</td>' +
    '<td style="text-align:center"><span class="vh-cnt' + (vhPhotoCount[r.id] ? ' has' : '') + '" title="Gallery" onclick="VH.gallery.show(\'' + r.id + '\')"><i class="ti ti-library-photo"></i>' + (vhPhotoCount[r.id] || '') + '</span></td>' +
    '<td class="acts">' +
      '<button class="vh-ib" type="button" title="Info" onclick="vhOpenInfo(\'' + r.id + '\')"><i class="ti ti-info-circle"></i></button>' +
      '<button class="vh-ib" type="button" title="Edit" onclick="vhOpenEdit(\'' + r.id + '\')"><i class="ti ti-edit"></i></button>' +
      '<a class="vh-ib" title="' + (r.class === 'pet' ? 'Vet visits' : 'Maintenance log') + '" href="maintenance.html?unit=' + r.id + '"><i class="ti ti-' + (r.class === 'pet' ? 'stethoscope' : 'tool') + '"></i></a>' +
      '<button class="vh-ib red" type="button" title="Delete" onclick="vhDelete(\'' + r.id + '\')"><i class="ti ti-trash"></i></button>' +
    '</td></tr>' +
    (vhNotesOpen === r.id ? '<tr class="vh-xrow"><td colspan="' + cols + '"><div class="vh-xpanel"><div class="xh"><span><i class="ti ti-notes"></i> Notes: ' + esc(r.unit_number) + '</span>' +
      '<button class="vh-ib" type="button" onclick="vhToggleNotes(\'' + r.id + '\')" title="Close"><i class="ti ti-x"></i></button></div><div id="vh-xnotes-' + r.id + '"><div class="vh-hint">Loading notes…</div></div></div></td></tr>' : '');
}
function vhToggleNotes(id) { vhNotesOpen = vhNotesOpen === id ? null : id; vhRenderTable(); }
function vhNotesCount(id, n) {
  if ((vhNoteCount[id] || 0) === n) return;
  vhNoteCount[id] = n;
  vhRenderTable();
}

/* ---------- Info panel ---------- */
function vhOpenInfo(id) {
  if (!vhFindRow(id)) return;
  vhInfoId = id;
  VH.drawer({ id: 'vh-info', head: '', body: '', onClose: () => { vhInfoId = null; } });
  vhRenderInfo();
}
function vhRenderInfo() {
  const r = vhFindRow(vhInfoId);
  const head = document.getElementById('vh-info-head'), body = document.getElementById('vh-info-body');
  if (!r || !head || !body) return;
  const C = r.class;
  head.innerHTML = VH.drawerHead(VH.gallery.avatarHtml(r, 'vh-av', vhProfile[r.id]), esc(r.unit_number),
    esc(VH.desc(r) || VH.cls(C).one) + ' ' + VH.statusPill(r.status_id), 'vh-info');
  const f = (k, v, wide) => '<div' + (wide ? ' class="wide"' : '') + '><div class="k">' + k + '</div><div class="v">' + (v == null || v === '' ? VH.dash : v) + '</div></div>';
  const rd = vhRegDays(r);
  const reg = r.registration_expires ? VH.fmtDate(r.registration_expires) + (rd < 0 ? ' <span style="color:var(--bh-red)">(expired)</span>' : rd <= 30 ? ' <span style="color:#b8650f">(due in ' + rd + ' day' + (rd === 1 ? '' : 's') + ')</span>' : '') : '';
  const m = vhMaint[r.id];
  const OWN = { owned: 'Owned', financed: 'Financed', leased: 'Leased' }, MET = { miles: 'Miles', hours: 'Hours', both: 'Miles and Hours', none: 'None' };
  const ident = C === 'pet'
    ? f('Species', esc(VH.optLabel(r.type_id))) + f('Breed', esc(r.model || '')) + f('Owner', esc(VH.memberName(r.owner_id))) +
      f('Nickname', esc(r.nickname || '')) + f('Sex', r.sex ? (r.sex === 'female' ? 'Female' : 'Male') : '') + f('Color', esc(r.color || '')) +
      f('Born', r.birth_date ? VH.fmtDate(r.birth_date) + ' <span class="vh-dash">(' + VH.age(r.birth_date) + ')</span>' : '') + f('Code', esc(r.code || '')) + '<div></div>'
    : f('Class', esc(VH.cls(C).one)) + f('Type', esc(VH.optLabel(r.type_id))) + f('Owner', esc(VH.memberName(r.owner_id))) +
      (C === 'home' && r.address ? f('Address', esc(r.address), true) : '') +
      (r.year || r.make || r.model ? f('Year', r.year != null ? String(r.year) : '') + f(C === 'home' ? 'Brand' : 'Make', esc(r.make || '')) + f('Model', esc(r.model || '')) : '') +
      (C === 'vehicle' ? f('Trim', esc(r.trim_level || '')) + f('Series', esc(r.series || '')) + f('Color', esc(r.color || '')) : '') +
      (r.vin || C === 'vehicle' ? f(C === 'vehicle' ? 'VIN' : 'Serial #', r.vin ? '<span class="mono">' + esc(r.vin) + '</span>' : '') : '') +
      (r.engine || VH.hasMeter(C) ? f('Engine', esc(r.engine || '')) : '') + f('Code', esc(r.code || ''));
  body.innerHTML =
    '<div class="vh-sec">' + esc(VH.cls(C).one) + '</div><div class="vh-kv">' + ident +
      (r.specifications ? f(C === 'pet' ? 'Notes' : 'Specifications', esc(r.specifications), true) : '') + '</div>' +
    (VH.hasMeter(C) ? '<div class="vh-sec">Meter &amp; Service</div><div class="vh-kv">' +
      f('Counts', MET[r.meter_type] || '') + f('Reading', VH.meterLines(r).join('<br>')) + f('As Of', VH.fmtDate(r.meter_date)) +
      f('Last Service', m ? VH.fmtDate(m.last) : '') + f('Entries', m ? String(m.n) : '0') + f('Total Upkeep', m ? VH.money(m.cost) : '') + '</div>'
      : '<div class="vh-sec">' + (C === 'pet' ? 'Vet Visits' : 'Service') + '</div><div class="vh-kv">' +
      f(C === 'pet' ? 'Last Visit' : 'Last Service', m ? VH.fmtDate(m.last) : '') + f('Entries', m ? String(m.n) : '0') + f('Total Cost', m ? VH.money(m.cost) : '') + '</div>') +
    '<div class="vh-sec">' + (C === 'pet' ? 'Adoption &amp; Insurance' : (VH.hasMeter(C) ? 'Tag, Insurance &amp; Ownership' : 'Purchase &amp; Insurance')) + '</div><div class="vh-kv">' +
      (VH.hasMeter(C) ? f('License Plate', esc(r.license_plate || '')) + f('Registration Expires', reg) : '') +
      f('Insurance', esc(r.insurance || '')) +
      (VH.hasMeter(C) ? f('Ownership', OWN[r.ownership] || '') + f('Financed By', esc(r.financed_by || '')) : '') +
      f(C === 'pet' ? 'Adopted' : 'Purchase Date', VH.fmtDate(r.purchase_date)) + f(C === 'pet' ? 'From' : 'Purchased From', esc(r.purchased_from || '')) +
      f(C === 'pet' ? 'Cost' : 'Purchase Price', VH.money(r.purchase_price)) + '</div>' +
    (C === 'vehicle' && VH.nhtsa.isVin(r.vin) ? '<div class="vh-sec">Safety Recalls (NHTSA)</div>' + VH.nhtsa.sectionHtml(r) : '') +
    '<div class="vh-sec">Record</div><div class="vh-kv">' +
      f('Date Entered', VH.fmtDate(VH.localDate(r.created_at)) + (r.created_by ? ' by ' + esc(VH.memberName(r.created_by)) : '')) +
      f('Last Changed', r.updated_at && r.updated_at !== r.created_at ? VH.fmtDate(VH.localDate(r.updated_at)) : '') + '<div></div></div>' +
    '<div class="vh-sec">Notes</div><div id="vh-info-notes"><div class="vh-hint">Loading notes…</div></div>' +
    '<div style="display:flex;gap:8px;margin-top:18px;padding-top:12px;border-top:1px solid var(--bh-border);flex-wrap:wrap">' +
      '<button class="bh-btn primary" type="button" onclick="VH.closeModal(\'vh-info\');vhOpenEdit(\'' + r.id + '\')"><i class="ti ti-edit"></i> Edit</button>' +
      '<button class="bh-btn" type="button" onclick="VH.gallery.show(\'' + r.id + '\')"><i class="ti ti-library-photo"></i> Gallery (' + (vhPhotoCount[r.id] || 0) + ')</button>' +
      '<a class="bh-btn" style="text-decoration:none" href="maintenance.html?unit=' + r.id + '"><i class="ti ti-' + (C === 'pet' ? 'stethoscope' : 'tool') + '"></i> ' + (C === 'pet' ? 'Vet Visits' : 'Maintenance Log') + '</a></div>';
  VH.notes.render('vehicle', r.id, 'vh-info-notes', (n) => vhNotesCount(r.id, n));
  if (C === 'vehicle') VH.nhtsa.load(r);
}

/* ---------- form (Add window and Edit panel) ----------
 * Every field carries data-cls (the classes that use it); vhApplyClass() shows / hides them and
 * swaps labels (data-l-<class>) when the Class changes. */
const ALL = 'vehicle equipment home pet';
const vhLbl = (o) => Object.entries((o && o.lbl) || {}).map(([c, l]) => ' data-l-' + c + '="' + esc(l) + '"').join('');
const vhIn = (p, field, label, value, o) => {
  o = o || {};
  return '<div class="vh-fg" id="' + p + '-' + field + '-wrap" data-cls="' + (o.cls || ALL) + '"' + (o.hidden ? ' data-hide="1"' : '') + '><label data-l="' + esc(label) + '"' + vhLbl(o) + '>' + label + (o.req ? ' <span class="req">*</span>' : '') + '</label>' +
    '<input type="' + (o.type || 'text') + '" id="' + p + '-' + field + '" value="' + esc(value == null ? '' : value) + '"' +
    (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.list ? ' list="' + o.list + '"' : '') + (o.im ? ' inputmode="' + o.im + '"' : '') +
    (o.type === 'date' ? ' min="1900-01-01" max="2100-12-31"' : '') + (o.mono ? ' style="font-family:Consolas,monospace"' : '') + '></div>';
};
const vhSel = (p, field, label, value, choices, o) => {
  o = o || {};
  return '<div class="vh-fg" data-cls="' + (o.cls || ALL) + '"><label data-l="' + esc(label) + '"' + vhLbl(o) + '>' + label + (o.req ? ' <span class="req">*</span>' : '') + '</label><select id="' + p + '-' + field + '"' + (o.onchange ? ' onchange="' + o.onchange + '"' : '') + '>' +
    choices.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(value == null ? '' : value) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>';
};
const vhSec = (title, cls, note, lbl) => '<div class="vh-sec" data-cls="' + (cls || ALL) + '"' + vhLbl({ lbl }) + ' data-l="' + esc(title) + '">' + title + (note ? ' <small>' + note + '</small>' : '') + '</div>';

function vhFormHtml(p, r) {
  const defStatus = (VH.opts.status.find((o) => o.active) || {}).id || '';
  const cls0 = (r && r.class) || vhClass || 'vehicle';
  const row = r || { class: cls0, meter_type: cls0 === 'vehicle' ? 'miles' : 'none', status_id: defStatus, owner_id: BH.user.id };
  const makes = Array.from(new Set(['Ford', 'Chevrolet', 'GMC', 'Ram', 'Toyota', 'Honda', 'Nissan', 'Jeep', 'Hyundai', 'Kia', 'Subaru', 'John Deere', 'Kubota', 'Husqvarna', 'Toro', 'Whirlpool', 'GE', 'LG', 'Samsung'].concat(vhRows.map((x) => x.make).filter(Boolean)))).sort();
  const owners = [[BH.user.id, BH.displayName() + ' (me)']].concat(VH.members.filter((m) => m.id !== BH.user.id).map((m) => [m.id, m.name]));
  if (row.owner_id && !owners.some((o) => o[0] === row.owner_id)) owners.push([row.owner_id, VH.memberName(row.owner_id)]);
  return '<datalist id="' + p + '-make-list">' + makes.map((m) => '<option value="' + esc(m) + '">').join('') + '</datalist>' +
    '<div class="vh-sec">Item</div>' +
    '<div class="vh-g3">' + vhSel(p, 'class', 'Class', row.class, VH.CLASSES.map((c) => [c.id, c.one]), { req: true, onchange: 'vhApplyClass(\'' + p + '\', true)' }) +
      vhSel(p, 'type', 'Type', row.type_id || '', VH.optChoices('type', row.type_id, '(not set)', row.class), { lbl: { pet: 'Species' } }) +
      vhSel(p, 'status', 'Status', row.status_id || '', VH.optChoices('status', row.status_id, '(not set)')) + '</div>' +
    '<div class="vh-g3">' + vhIn(p, 'name', 'Name', row.unit_number, { req: true, ph: 'e.g. 2021 Toyota Tacoma, Berkley' }) +
      vhIn(p, 'code', 'Code', row.code, { ph: 'e.g. 2021TAC' }) +
      (vhIsAdmin() ? vhSel(p, 'owner', 'Owner', row.owner_id || '', owners) : '<div class="vh-fg"><label>Owner</label><input value="' + esc(VH.memberName(row.owner_id || BH.user.id)) + '" readonly style="background:var(--bh-surface2);color:var(--bh-text2)"></div>') + '</div>' +
    vhSec('Description', ALL, '', { pet: 'About' }) +
    '<div class="vh-g3" data-cls="pet">' + vhIn(p, 'nickname', 'Nickname', row.nickname, { cls: 'pet' }) +
      vhSel(p, 'sex', 'Sex', row.sex || '', [['', '(not set)'], ['female', 'Female'], ['male', 'Male']], { cls: 'pet' }) +
      vhIn(p, 'birth', 'Birthday', row.birth_date, { type: 'date', cls: 'pet' }) + '</div>' +
    vhIn(p, 'address', 'Address', row.address, { cls: 'home', ph: 'Street, city, state ZIP (for a house)' }) +
    '<div class="vh-g2" data-cls="vehicle equipment home"><div data-cls="vehicle equipment home">' + vhIn(p, 'vin', 'VIN / Serial #', row.vin, { mono: true, cls: 'vehicle equipment home', lbl: { vehicle: 'VIN', equipment: 'Serial #', home: 'Serial #' } }) +
      '<div data-cls="vehicle">' + VH.nhtsa.buttonHtml(p) + '</div></div>' +
      vhIn(p, 'engine', 'Engine', row.engine, { cls: 'vehicle equipment', ph: 'e.g. 3.5L V6 Gas, Honda GC190' }) + '</div>' +
    '<div class="vh-g3">' + vhIn(p, 'year', 'Year', row.year, { im: 'numeric', cls: 'vehicle equipment home', lbl: { home: 'Year (built / bought)' } }) +
      vhIn(p, 'make', 'Make', row.make, { list: p + '-make-list', cls: 'vehicle equipment home', lbl: { home: 'Brand' } }) +
      vhIn(p, 'model', 'Model', row.model, { lbl: { pet: 'Breed' } }) + '</div>' +
    '<div class="vh-g3">' + vhIn(p, 'trim', 'Trim', row.trim_level, { cls: 'vehicle', ph: 'e.g. SR5, EX' }) +
      vhIn(p, 'series', 'Series', row.series, { cls: 'vehicle' }) +
      vhIn(p, 'color', 'Color', row.color, { cls: 'vehicle equipment pet' }) + '</div>' +
    '<div class="vh-fg" data-cls="' + ALL + '"><label data-l="Specifications" data-l-pet="Notes (vet, meds, food…)">Specifications</label><textarea id="' + p + '-specs" rows="3" placeholder="Anything worth remembering">' + esc(row.specifications || '') + '</textarea></div>' +
    vhSec('Meter', 'vehicle equipment', '(Maintenance entries keep this current)') +
    '<div class="vh-g2" data-cls="vehicle equipment">' + vhSel(p, 'meter', 'Counts', row.meter_type || 'miles', [['miles', 'Miles'], ['hours', 'Hours'], ['both', 'Miles and Hours'], ['none', 'None']], { cls: 'vehicle equipment', onchange: 'vhMeterChanged(\'' + p + '\')' }) +
      vhIn(p, 'meterdate', 'Reading As Of', row.meter_date, { type: 'date', cls: 'vehicle equipment' }) + '</div>' +
    '<div class="vh-g2" data-cls="vehicle equipment">' + vhIn(p, 'odometer', 'Odometer (miles)', row.odometer == null ? '' : VH.num(row.odometer, 1), { im: 'decimal', cls: 'vehicle equipment', hidden: !VH.usesMiles(row) }) +
      vhIn(p, 'hours', 'Hours', row.hours == null ? '' : VH.num(row.hours, 1), { im: 'decimal', cls: 'vehicle equipment', hidden: !VH.usesHours(row) }) + '</div>' +
    vhSec('Tag, Insurance &amp; Ownership', ALL, '', { home: 'Purchase &amp; Insurance', pet: 'Adoption &amp; Insurance' }) +
    '<div class="vh-g3" data-cls="vehicle equipment">' + vhIn(p, 'plate', 'License Plate', row.license_plate, { cls: 'vehicle equipment' }) +
      vhIn(p, 'regexp', 'Registration Expires', row.registration_expires, { type: 'date', cls: 'vehicle equipment' }) +
      vhSel(p, 'ownership', 'Ownership', row.ownership || '', [['', '(not set)'], ['owned', 'Owned'], ['financed', 'Financed'], ['leased', 'Leased']], { cls: 'vehicle equipment' }) + '</div>' +
    '<div class="vh-g2">' + vhIn(p, 'insurance', 'Insurance', row.insurance, { ph: 'Company / policy #', lbl: { pet: 'Pet Insurance' } }) +
      vhIn(p, 'financed', 'Financed By', row.financed_by, { cls: 'vehicle equipment', ph: 'Lender' }) + '</div>' +
    '<div class="vh-g3">' + vhIn(p, 'pdate', 'Purchase Date', row.purchase_date, { type: 'date', lbl: { pet: 'Adopted' } }) +
      vhIn(p, 'pfrom', 'Purchased From', row.purchased_from, { lbl: { pet: 'From' } }) +
      vhIn(p, 'pprice', 'Purchase Price', row.purchase_price == null ? '' : Number(row.purchase_price).toFixed(2), { im: 'decimal', ph: '$', lbl: { pet: 'Cost' } }) + '</div>';
}
// Show the fields this class uses, relabel, and refresh the Type list.
function vhApplyClass(p, changed) {
  const box = document.getElementById(p === 'vh-add' ? 'vh-add-body' : 'vh-edit-body');
  const sel = document.getElementById(p + '-class');
  if (!box || !sel) return;
  const c = sel.value;
  box.querySelectorAll('[data-cls]').forEach((el) => {
    el.style.display = el.dataset.cls.split(' ').includes(c) && !el.dataset.hide ? '' : 'none';
  });
  box.querySelectorAll('[data-l]').forEach((el) => {
    const t = el.getAttribute('data-l-' + c) || el.dataset.l;
    const req = el.querySelector('.req'), small = el.querySelector('small');
    el.innerHTML = t + (req ? ' <span class="req">*</span>' : '') + (small ? ' ' + small.outerHTML : '');
  });
  if (changed) {
    const ts = document.getElementById(p + '-type'), cur = ts.value;
    ts.innerHTML = VH.optChoices('type', null, '(not set)', c).map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('');
    if ([...ts.options].some((o) => o.value === cur)) ts.value = cur;
    const ms = document.getElementById(p + '-meter');
    if (!VH.hasMeter(c)) ms.value = 'none'; else if (ms.value === 'none' && c === 'vehicle') ms.value = 'miles';
    vhMeterChanged(p);
  }
}
function vhMeterChanged(p) {
  const t = document.getElementById(p + '-meter').value;
  const c = document.getElementById(p + '-class').value;
  const o = document.getElementById(p + '-odometer-wrap'), h = document.getElementById(p + '-hours-wrap');
  if (t === 'miles' || t === 'both') delete o.dataset.hide; else o.dataset.hide = '1';
  if (t === 'hours' || t === 'both') delete h.dataset.hide; else h.dataset.hide = '1';
  o.style.display = VH.hasMeter(c) && !o.dataset.hide ? '' : 'none';
  h.style.display = VH.hasMeter(c) && !h.dataset.hide ? '' : 'none';
}
function vhReadForm(p) {
  const v = (f) => { const el = document.getElementById(p + '-' + f); return el ? el.value : ''; };
  const c = v('class') || 'vehicle';
  const uses = (list) => list.split(' ').includes(c);
  const meter = VH.hasMeter(c) ? v('meter') || 'miles' : 'none';
  const yr = String(v('year') || '').trim();
  const vin = uses('vehicle equipment home') ? VH.clean(v('vin')) : null;
  const out = {
    class: c, code: VH.clean(v('code')), unit_number: VH.clean(v('name')),
    status_id: v('status') || null, type_id: v('type') || null,
    year: !uses('vehicle equipment home') || yr === '' ? null : Number(yr),
    make: uses('vehicle equipment home') ? VH.clean(v('make')) : null, model: VH.clean(v('model')),
    trim_level: uses('vehicle') ? VH.clean(v('trim')) : null, series: uses('vehicle') ? VH.clean(v('series')) : null,
    color: uses('vehicle equipment pet') ? VH.clean(v('color')) : null,
    vin: vin ? vin.toUpperCase() : null, engine: uses('vehicle equipment') ? VH.clean(v('engine')) : null, specifications: VH.clean(v('specs')),
    nickname: uses('pet') ? VH.clean(v('nickname')) : null, sex: uses('pet') ? v('sex') || null : null, birth_date: uses('pet') ? v('birth') || null : null,
    address: uses('home') ? VH.clean(v('address')) : null,
    meter_type: meter,
    odometer: meter === 'miles' || meter === 'both' ? VH.parseNum(v('odometer')) : null,
    hours: meter === 'hours' || meter === 'both' ? VH.parseNum(v('hours')) : null,
    meter_date: VH.hasMeter(c) ? v('meterdate') || null : null,
    license_plate: uses('vehicle equipment') ? VH.clean(v('plate')) : null, registration_expires: uses('vehicle equipment') ? v('regexp') || null : null,
    ownership: uses('vehicle equipment') ? v('ownership') || null : null, financed_by: uses('vehicle equipment') ? VH.clean(v('financed')) : null,
    insurance: VH.clean(v('insurance')), purchase_date: v('pdate') || null, purchased_from: VH.clean(v('pfrom')), purchase_price: VH.parseNum(v('pprice')),
  };
  if (vhIsAdmin() && document.getElementById(p + '-owner')) out.owner_id = v('owner') || BH.user.id;
  return out;
}
function vhValidate(u, selfId, ownerId) {
  const okDate = (d) => !d || (d >= '1900-01-01' && d <= '2100-12-31');
  if (!u.unit_number) return 'Name is required';
  if (u.year != null && (!Number.isInteger(u.year) || u.year < 1900 || u.year > 2100)) return 'Year must be a 4-digit year';
  if (Number.isNaN(u.odometer) || (u.odometer != null && u.odometer < 0)) return 'Odometer must be a number';
  if (Number.isNaN(u.hours) || (u.hours != null && u.hours < 0)) return 'Hours must be a number';
  if (Number.isNaN(u.purchase_price) || (u.purchase_price != null && u.purchase_price < 0)) return 'Price must be a dollar amount';
  if (![u.meter_date, u.registration_expires, u.purchase_date, u.birth_date].every(okDate)) return 'Dates must be between 1900 and 2100';
  if (u.meter_date && u.meter_date > VH.today()) return 'The reading date is in the future';
  const owner = u.owner_id || ownerId;
  if (vhRows.some((x) => x.id !== selfId && x.owner_id === owner && VH.norm(x.unit_number) === VH.norm(u.unit_number))) return 'There is already an item named ' + u.unit_number;
  if (u.vin) { const c = vhRows.find((x) => x.id !== selfId && x.vin && x.vin.toUpperCase() === u.vin); if (c) return 'That VIN / serial # is already on ' + c.unit_number; }
  return null;
}

/* ---------- Add ---------- */
function vhOpenAdd() {
  VH.gallery.pendingReset();
  VH.modal({
    id: 'vh-add', width: 'vh-w760', icon: 'ti-plus', title: 'Add Item',
    body: vhFormHtml('vh-add', null) +
      '<div class="vh-sec">Photos <small>(saved to the gallery when you click Add Item)</small></div>' +
      '<div id="vh-addgal-pend"></div>' + VH.gallery.addRowHtml('vh-addgal'),
    foot: '<button class="bh-btn" type="button" onclick="VH.closeModal(\'vh-add\')">Cancel</button>' +
      '<button class="bh-btn primary" type="button" id="vh-add-save" onclick="vhSave(\'add\')"><i class="ti ti-check"></i> Add Item</button>',
  });
  vhApplyClass('vh-add', false);
  VH.gallery.pendingWire();
}

/* ---------- Edit panel ---------- */
function vhOpenEdit(id) {
  const r = vhFindRow(id);
  if (!r) return;
  vhEditId = id;
  VH.drawer({
    id: 'vh-edit', head: '', onClose: () => { vhEditId = null; },
    body: '<div class="vh-hint" style="margin-top:10px"><b>Date Entered:</b> ' + VH.fmtDate(VH.localDate(r.created_at)) + (r.created_by ? ' by ' + esc(VH.memberName(r.created_by)) : '') +
      (r.updated_at && r.updated_at !== r.created_at ? ' · last changed ' + VH.fmtDate(VH.localDate(r.updated_at)) : '') + '</div>' +
      vhFormHtml('vh-edit', r) + '<div class="vh-sec">Notes <small>(saved as soon as you add one)</small></div><div id="vh-edit-notes"></div>',
    foot: '<button class="bh-btn primary" type="button" id="vh-edit-save" onclick="vhSave(\'edit\')"><i class="ti ti-check"></i> Save</button>' +
      '<button class="bh-btn" type="button" onclick="VH.gallery.show(\'' + r.id + '\')"><i class="ti ti-library-photo"></i> Gallery</button>' +
      '<button class="bh-btn" type="button" onclick="VH.closeModal(\'vh-edit\')">Close</button>',
  });
  vhApplyClass('vh-edit', false);
  vhEditHead();
  VH.notes.render('vehicle', id, 'vh-edit-notes', (n) => vhNotesCount(id, n));
}
function vhEditHead() {
  const r = vhFindRow(vhEditId), head = document.getElementById('vh-edit-head');
  if (!r || !head) return;
  head.innerHTML = VH.drawerHead(VH.gallery.avatarHtml(r, 'vh-av', vhProfile[r.id]), 'Edit: ' + esc(r.unit_number),
    esc([VH.cls(r.class).one, VH.optLabel(r.type_id), VH.desc(r)].filter(Boolean).join('  ·  ')) + ' ' + VH.statusPill(r.status_id), 'vh-edit');
}

/* ---------- Save ---------- */
async function vhSave(mode) {
  if (vhSaving) return;
  const p = mode === 'edit' ? 'vh-edit' : 'vh-add';
  const row = mode === 'edit' ? vhFindRow(vhEditId) : null;
  if (mode === 'edit' && !row) return;
  const u = vhReadForm(p);
  const problem = vhValidate(u, row ? row.id : null, row ? row.owner_id : BH.user.id);
  if (problem) { VH.toast(problem, 'error'); return; }
  let send = u;
  if (row) {
    send = {};
    Object.keys(u).forEach((k) => {
      const a = u[k] == null ? null : u[k], b = row[k] == null ? null : row[k];
      if (String(a) !== String(b) && !(typeof a === 'number' && Number(b) === a)) send[k] = u[k];
    });
    if (!Object.keys(send).length) { VH.toast('No changes to save', ''); return; }
  }
  vhSaving = true;
  const btn = document.getElementById(p + '-save'), html = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Saving…'; }
  const res = row
    ? await BH.sb.from('equipment').update(send).eq('id', row.id).select().single()
    : await BH.sb.from('equipment').insert(Object.assign({ owner_id: BH.user.id }, u)).select().single();
  vhSaving = false;
  if (res.error) {
    if (btn) { btn.disabled = false; btn.innerHTML = html; }
    const e = res.error;
    VH.toast(e.code === '23505' ? (/vin/i.test(e.message) ? 'That VIN / serial # is already on another item' : 'There is already an item with that name') : 'Save failed: ' + e.message, 'error');
    return;
  }
  const saved = res.data;
  if (row) {
    const i = vhRows.findIndex((x) => x.id === row.id);
    if (i >= 0) vhRows[i] = saved;
    if (btn) { btn.disabled = false; btn.innerHTML = html; }
    VH.toast(saved.unit_number + ' saved', 'ok');
    vhEditHead();
  } else {
    vhRows.push(saved);
    let note = '';
    if (VH.gallery.pending.length) {
      if (btn) btn.innerHTML = '<i class="ti ti-loader"></i> Adding photos…';
      const pics = await VH.gallery.savePending(saved.id);
      const fresh = await VH.gallery.load(saved.id);
      vhPhotoCount[saved.id] = fresh.length;
      const s2 = await BH.sb.from('equipment').select('*').eq('id', saved.id).single();
      if (s2.data) { const i = vhRows.findIndex((x) => x.id === saved.id); vhRows[i] = s2.data; }
      vhProfile[saved.id] = fresh.find((x) => x.id === vhRows.find((y) => y.id === saved.id).profile_photo_id) || null;
      await VH.loadLinks(vhProfile[saved.id] ? [vhProfile[saved.id]] : []);
      note = ' with ' + pics.got + ' photo' + (pics.got === 1 ? '' : 's') + (pics.got < pics.want ? ' (' + (pics.want - pics.got) + ' failed - add them from the gallery)' : '');
    }
    VH.closeModal('vh-add');
    VH.toast(saved.unit_number + ' added' + note, 'ok');
  }
  vhRender();
}

/* ---------- Delete ---------- */
async function vhDelete(id) {
  const r = vhFindRow(id);
  if (!r) return;
  const m = vhMaint[r.id], ph = vhPhotoCount[r.id] || 0, no = vhNoteCount[r.id] || 0;
  const goes = [ph ? ph + ' photo' + (ph === 1 ? '' : 's') : '', no ? no + ' note' + (no === 1 ? '' : 's') : '', m ? m.n + ' maintenance entr' + (m.n === 1 ? 'y' : 'ies') : ''].filter(Boolean);
  const ok = await VH.confirm('Permanently Delete',
    'Delete <b>' + esc(r.unit_number) + '</b>' + (VH.desc(r) ? ' (' + esc(VH.desc(r)) + ')' : '') + '?' +
    (goes.length ? '<div class="bh-info" style="margin-top:10px"><i class="ti ti-alert-triangle"></i><span>Its ' + esc(goes.join(', ')) + ' go with it, and uploaded photos and invoices are removed from Dropbox.</span></div>' : '') +
    '<div class="vh-hint" style="margin-top:8px">Sold, retired or passed? Set its Status to <b>Gone</b> instead to keep its history.</div>', 'Permanently Delete', true);
  if (!ok) return;
  try { await VH.call('delete_vehicle', { id }); }
  catch (e) {
    const { error } = await BH.sb.from('equipment').delete().eq('id', id);
    if (error) { VH.toast('Delete failed: ' + (e.message || error.message), 'error'); return; }
  }
  vhRows = vhRows.filter((x) => x.id !== id);
  if (vhEditId === id) VH.closeModal('vh-edit');
  if (vhInfoId === id) VH.closeModal('vh-info');
  VH.toast(r.unit_number + ' deleted', 'error');
  vhRender();
}

/* ---------- Lists (admins): Type / Status / Service Category / Service ---------- */
let vhListKind = 'type', vhListClass = 'vehicle';
function vhOpenLists() {
  VH.modal({ id: 'vh-lists', width: 'vh-w760', icon: 'ti-list-details', title: 'Lists', noFocus: true, body: '<div id="vh-lists-body"></div>',
    foot: '<button class="bh-btn primary" type="button" onclick="VH.closeModal(\'vh-lists\')">Done</button>', onClose: () => vhRender() });
  vhRenderLists();
}
function vhRenderLists() {
  const el = document.getElementById('vh-lists-body');
  if (!el) return;
  const K = { type: 'Types', status: 'Status', service_category: 'Service Categories', service_type: 'Services' };
  const perClass = vhListKind !== 'status';
  const list = VH.opts[vhListKind].filter((o) => !perClass || o.class === vhListClass)
    .sort((a, b) => (vhListKind === 'service_type' ? (VH.optLabel(a.parent_id) || '').localeCompare(VH.optLabel(b.parent_id) || '') : 0) || a.sort_order - b.sort_order);
  const cats = VH.opts.service_category.filter((o) => o.class === vhListClass);
  const colors = ['green', 'blue', 'orange', 'red', 'gray', 'purple', 'honey'];
  el.innerHTML = '<div class="vh-tabs">' + Object.entries(K).map(([k, l]) => '<button type="button" class="vh-tab' + (k === vhListKind ? ' on' : '') + '" onclick="vhListKind=\'' + k + '\';vhRenderLists()">' + l + '</button>').join('') + '</div>' +
    (perClass ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:-4px 0 10px">' + VH.CLASSES.map((c) => '<button type="button" class="bh-btn sm' + (c.id === vhListClass ? ' primary' : '') + '" onclick="vhListClass=\'' + c.id + '\';vhRenderLists()"><i class="ti ' + c.icon + '"></i> ' + esc(c.label) + '</button>').join('') + '</div>' : '') +
    (vhListKind === 'status' ? '<div class="vh-hint" style="margin:-4px 0 8px">"In Use list" decides what shows under Show: In Use (untick it for Gone).</div>' : '') +
    (vhListKind === 'service_type' ? '<div class="vh-hint" style="margin:-4px 0 8px">Services are the checkboxes on a maintenance entry, grouped under a Service Category.</div>' : '') +
    list.map((o, i) => '<div class="vh-opt' + (o.active ? '' : ' off') + '" data-id="' + o.id + '">' +
      (vhListKind === 'service_type' ? '<select data-f="parent_id">' + cats.map((c) => '<option value="' + c.id + '"' + (c.id === o.parent_id ? ' selected' : '') + '>' + esc(c.label) + '</option>').join('') + '</select>' : '') +
      '<input type="text" value="' + esc(o.label) + '" data-f="label">' +
      (vhListKind === 'status' ? '<select data-f="color">' + colors.map((c) => '<option' + (o.color === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select>' +
        '<label><input type="checkbox" data-f="counts"' + (o.counts ? ' checked' : '') + '> In Use list</label>' : '') +
      '<button class="vh-ib" type="button" title="Move up" data-mv="-1"' + (i ? '' : ' disabled') + '><i class="ti ti-arrow-up"></i></button>' +
      '<button class="vh-ib" type="button" title="Move down" data-mv="1"' + (i < list.length - 1 ? '' : ' disabled') + '><i class="ti ti-arrow-down"></i></button>' +
      '<button class="vh-ib" type="button" title="' + (o.active ? 'Hide (kept where already used)' : 'Show again') + '" data-f="active"><i class="ti ti-eye' + (o.active ? '' : '-off') + '"></i></button>' +
    '</div>').join('') +
    '<div class="vh-opt">' + (vhListKind === 'service_type' ? '<select id="vh-opt-parent">' + cats.map((c) => '<option value="' + c.id + '">' + esc(c.label) + '</option>').join('') + '</select>' : '') +
      '<input type="text" id="vh-opt-new" placeholder="Add to ' + esc(K[vhListKind]) + (perClass ? ' (' + esc(VH.cls(vhListClass).label) + ')' : '') + '…">' +
      '<button class="bh-btn primary sm" type="button" onclick="vhOptAdd()"><i class="ti ti-plus"></i> Add</button></div>';
  el.querySelectorAll('.vh-opt[data-id]').forEach((rowEl) => {
    const id = rowEl.dataset.id, o = list.find((x) => x.id === id);
    const save = async (patch) => {
      const { error } = await BH.sb.from('equipment_options').update(patch).eq('id', id);
      if (error) { VH.toast('Not saved: ' + error.message, 'error'); return false; }
      Object.assign(o, patch); return true;
    };
    rowEl.querySelector('[data-f=label]').onchange = async (e) => { const t = e.target.value.trim(); if (!t) { e.target.value = o.label; return; } if (await save({ label: t })) VH.toast('Renamed', 'ok'); };
    const c = rowEl.querySelector('select[data-f=color]'); if (c) c.onchange = () => save({ color: c.value });
    const pr = rowEl.querySelector('select[data-f=parent_id]'); if (pr) pr.onchange = async () => { if (await save({ parent_id: pr.value })) vhRenderLists(); };
    const ct = rowEl.querySelector('input[data-f=counts]'); if (ct) ct.onchange = () => save({ counts: ct.checked });
    rowEl.querySelector('button[data-f=active]').onclick = async () => { if (await save({ active: !o.active })) vhRenderLists(); };
    rowEl.querySelectorAll('[data-mv]').forEach((b) => {
      b.onclick = async () => {
        const i = list.indexOf(o), j = i + Number(b.dataset.mv);
        if (j < 0 || j >= list.length) return;
        list.splice(i, 1); list.splice(j, 0, o);
        await Promise.all(list.map((x, n) => (x.sort_order !== n + 1 ? BH.sb.from('equipment_options').update({ sort_order: n + 1 }).eq('id', x.id).then(() => { x.sort_order = n + 1; }) : null)));
        vhRenderLists();
      };
    });
  });
  const nw = document.getElementById('vh-opt-new');
  nw.onkeydown = (e) => { if (e.key === 'Enter') vhOptAdd(); };
}
async function vhOptAdd() {
  const el = document.getElementById('vh-opt-new');
  const label = (el.value || '').trim();
  if (!label) return;
  const perClass = vhListKind !== 'status';
  const row = { kind: vhListKind, label, sort_order: 999, color: vhListKind === 'status' ? 'gray' : null, class: perClass ? vhListClass : null };
  if (vhListKind === 'service_type') {
    row.parent_id = (document.getElementById('vh-opt-parent') || {}).value || null;
    if (!row.parent_id) { VH.toast('Add a Service Category for this class first', 'error'); return; }
  }
  const { data, error } = await BH.sb.from('equipment_options').insert(row).select().single();
  if (error) { VH.toast(error.code === '23505' ? 'That is already on the list' : 'Not added: ' + error.message, 'error'); return; }
  VH.opts[vhListKind].push(data);
  vhRenderLists();
  const nw = document.getElementById('vh-opt-new'); if (nw) nw.focus();
}

/* ---------- Print ---------- */
function vhPrint() {
  const list = vhSorted(vhFiltered());
  const showOwner = vhShowOwner();
  const label = (vhClass ? VH.cls(vhClass).label : 'Everything') + ' · ' + (vhShow === 'inuse' ? 'In Use' : vhShow === 'all' ? 'All statuses' : VH.optLabel(vhShow)) +
    (vhType ? ' · ' + VH.optLabel(vhType) : '') + (vhOwner ? ' · ' + VH.memberName(vhOwner) : '') + ' · ' + list.length + ' item' + (list.length === 1 ? '' : 's');
  const rows = list.map((r) => { const m = vhMaint[r.id]; return '<tr><td><b>' + esc(r.unit_number) + '</b>' + (r.code ? '<div class="sub">' + esc(r.code) + '</div>' : '') + '</td>' +
    '<td>' + esc(VH.desc(r)) + (r.engine ? '<div class="sub">' + esc(r.engine) + '</div>' : '') + '</td>' +
    '<td>' + esc(VH.cls(r.class).one) + '<div class="sub">' + esc(VH.optLabel(r.type_id)) + '</div></td>' + (showOwner ? '<td>' + esc(VH.memberName(r.owner_id)) + '</td>' : '') +
    '<td style="font-family:Consolas,monospace;font-size:10.5px">' + esc(r.vin || '') + '</td><td>' + (r.class === 'pet' ? esc(VH.age(r.birth_date)) : VH.meterLines(r).join('<br>')) + '</td>' +
    '<td>' + esc(r.license_plate || '') + (r.registration_expires ? '<div class="sub">exp. ' + VH.fmtDate(r.registration_expires) + '</div>' : '') + '</td>' +
    '<td>' + (m ? VH.fmtDate(m.last) : '') + '</td><td>' + esc(VH.optLabel(r.status_id)) + '</td></tr>'; }).join('');
  VH.printReport('Inventory', label,
    ['Name', 'Description', 'Class / Type'].concat(showOwner ? ['Owner'] : []).concat(['VIN / Serial #', 'Meter / Age', 'Tag', 'Last Service', 'Status']), rows);
}

vhStart();
