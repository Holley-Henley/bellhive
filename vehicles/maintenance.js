/* ============================================================
 * Chrisware / bellhive99.com - vehicles/maintenance.js
 * RESOURCES > Maintenance. Cloned from HHB Project Exchange (modules/equipment-maintenance.js,
 * 261028.05) and restyled for bellhive: the dated service log - summary tiles, filters,
 * sortable log, Add window, right-side Edit panel, invoices / receipts (Dropbox), notes,
 * Print Report.
 *
 * 261031.05, per Chris: ONE maintenance log for every class (Vehicles, Equipment, Home &
 * Appliances, Pets), replacing the workbook's Maintenance - Automotive / Misc / Home and Pets
 * tabs. Class tabs filter it; the form adapts to the item's class:
 *  - Service Category (the workbook's SERVICE TYPE) then the Services under it (the
 *    workbook's Service Classification tab), one list per class.
 *  - Mileage / Hours only for vehicles and equipment; a vehicle's "Odometer Reading"
 *    category logs a reading with nothing else.
 *  - Pets: "Vet / Clinic" and "Reason" wording.
 *  - Purchased From and Part Make / Model (the workbook's columns) on every entry.
 *  - An entry follows its item: you see it when you can see the item (owner or admin).
 *  - A saved reading moves the item's meter forward when it is the newest (database trigger).
 *  - maintenance.html?unit=<item id> opens filtered to one item with its header card.
 * ============================================================ */
const mc = document.getElementById('mc');
const esc = VH.esc;

let mtRows = [], mtUnits = [], mtServices = {}, mtNoteCount = {}, mtFileCount = {}, mtProfile = {};
let mtUnitFilter = new URLSearchParams(location.search).get('unit') || '';
let mtClass = new URLSearchParams(location.search).get('class') || '';
let mtYearFilter = '', mtCatFilter = '';
let mtSortCol = 'date', mtSortDir = -1;
let mtNotesOpen = null, mtFilesOpen = null, mtEditId = null, mtSaving = false;
let mtPendingFiles = [], mtPendingLinks = [];

const mtFind = (id) => mtRows.find((r) => r.id === id);
const mtUnit = (id) => mtUnits.find((u) => u.id === id);
const mtClassOf = (r) => (mtUnit(r.equipment_id) || {}).class || 'vehicle';
VH.gallery.vehicle = mtUnit;
VH.gallery.onChanged = (vid, profileId) => {
  mtProfile[vid] = (VH.gallery.cache[vid] || []).find((p) => p.id === profileId) || null;
  mtRender();
};
const mtTypeLabels = (id) => (mtServices[id] || []).map((o) => VH.optLabel(o)).filter(Boolean);
const mtMeterText = (r) => [r.odometer != null ? VH.num(r.odometer, 0) + ' mi' : '', r.hours != null ? VH.num(r.hours) + ' hrs' : ''].filter(Boolean).join('<br>');
const mtIsReading = (r) => /odometer reading/i.test(VH.optLabel(r.service_category_id));

/* ---------- data ---------- */
async function mtLoad() {
  const [u, e, s, ph] = await Promise.all([
    BH.sb.from('equipment').select('id, class, code, unit_number, owner_id, status_id, type_id, year, make, model, trim_level, color, vin, engine, meter_type, odometer, hours, meter_date, profile_photo_id, birth_date, address, nickname').order('unit_number'),
    BH.sb.from('equipment_maintenance').select('*').order('service_date', { ascending: false }),
    BH.sb.from('equipment_maintenance_services').select('*'),
    BH.sb.from('equipment_photos').select('id, equipment_id, kind, storage_path, rotation, filename'),
  ]);
  if (u.error) throw new Error('Could not load the inventory: ' + u.error.message);
  if (e.error) throw new Error('Could not load maintenance: ' + e.error.message);
  mtUnits = u.data || [];
  mtRows = e.data || [];
  mtServices = {};
  (s.data || []).forEach((x) => (mtServices[x.maintenance_id] = mtServices[x.maintenance_id] || []).push(x.option_id));
  const byId = {};
  (ph.data || []).forEach((p) => { byId[p.id] = p; });
  mtProfile = {};
  mtUnits.forEach((v) => { if (v.profile_photo_id && byId[v.profile_photo_id]) mtProfile[v.id] = byId[v.profile_photo_id]; });
  const ids = mtRows.map((r) => r.id);
  [mtNoteCount, mtFileCount] = await Promise.all([VH.notes.counts('entry', ids), VH.files.counts(ids)]);
  if (mtUnitFilter && !mtUnit(mtUnitFilter)) mtUnitFilter = '';
  if (mtUnitFilter) mtClass = mtUnit(mtUnitFilter).class;
}
async function mtStart() {
  if (!await VH.boot('vehicles-maintenance', mc)) return;
  try { await mtLoad(); } catch (e) { mc.innerHTML = '<div class="bh-alert">' + esc(e.message) + '</div>'; return; }
  document.getElementById('vh-acts').innerHTML =
    '<a class="bh-btn" href="inventory.html" style="text-decoration:none"><i class="ti ti-clipboard-list"></i> Inventory</a>' +
    '<button class="bh-btn" type="button" onclick="mtPrint()"><i class="ti ti-printer"></i> Print Report</button>' +
    '<button class="bh-btn primary" type="button" onclick="mtOpenAdd()"><i class="ti ti-plus"></i> Add Entry</button>';
  mtRender();
  await VH.loadLinks(Object.values(mtProfile));
  mtRender();
}

/* ---------- filters ---------- */
function mtYears() {
  const ys = new Set(mtRows.map((r) => String(r.service_date || '').slice(0, 4)).filter(Boolean));
  ys.add(VH.today().slice(0, 4));
  return Array.from(ys).sort().reverse();
}
function mtFiltered() {
  const q = VH.norm(document.getElementById('mt-search') && document.getElementById('mt-search').value);
  return mtRows.filter((r) => {
    if (mtClass && mtClassOf(r) !== mtClass) return false;
    if (mtUnitFilter && r.equipment_id !== mtUnitFilter) return false;
    if (mtYearFilter && !String(r.service_date || '').startsWith(mtYearFilter)) return false;
    if (mtCatFilter && r.service_category_id !== mtCatFilter) return false;
    if (!q) return true;
    const u = mtUnit(r.equipment_id);
    return [u && u.unit_number, u && u.code, VH.desc(u), r.work_performed, r.performed_by_name, r.purchased_from, r.part_info, r.invoice_number,
      VH.optLabel(r.service_category_id), mtTypeLabels(r.id).join(' ')].some((v) => VH.norm(v).includes(q));
  });
}
function mtSorted(items) {
  const key = (r) => {
    switch (mtSortCol) {
      case 'unit': return String((mtUnit(r.equipment_id) || {}).unit_number || '');
      case 'meter': return Number(r.odometer != null ? r.odometer : r.hours != null ? r.hours : -1);
      case 'performed': return VH.norm(r.performed_by_name || r.purchased_from);
      case 'cost': return Number(r.cost != null ? r.cost : -1);
      case 'invoice': return String(r.invoice_number || '');
      default: return r.service_date || '';
    }
  };
  return items.slice().sort((a, b) => {
    const va = key(a), vb = key(b);
    const c = typeof va === 'number' ? va - vb : (mtSortCol === 'unit' || mtSortCol === 'invoice') ? va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' }) : va < vb ? -1 : va > vb ? 1 : 0;
    return c ? c * mtSortDir : String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}
function mtSetSort(col) {
  if (mtSortCol === col) mtSortDir *= -1;
  else { mtSortCol = col; mtSortDir = col === 'date' || col === 'cost' || col === 'meter' ? -1 : 1; }
  mtRenderTable();
}
function mtSetClass(c) {
  mtClass = c; mtCatFilter = '';
  if (mtUnitFilter && (mtUnit(mtUnitFilter) || {}).class !== c) mtUnitFilter = '';
  mtUrl(); mtRender();
}
function mtPickUnit(id) {
  mtUnitFilter = id || '';
  if (mtUnitFilter) mtClass = mtUnit(mtUnitFilter).class;
  mtUrl(); mtRender();
  window.scrollTo(0, 0);
}
function mtUrl() {
  history.replaceState(null, '', location.pathname + (mtUnitFilter ? '?unit=' + mtUnitFilter : mtClass ? '?class=' + mtClass : ''));
}

/* ---------- render ---------- */
function mtRender() {
  if (!document.getElementById('mt-shell')) {
    mc.innerHTML = '<div id="mt-tabs"></div><div id="mt-tiles"></div><div id="mt-card"></div><div class="vh-bar"><div class="vh-filters" id="mt-filters"></div>' +
      '<div class="vh-search-box"><i class="ti ti-search"></i><input class="vh-search" id="mt-search" type="search" placeholder="Search item, work, shop, part, invoice #…" oninput="mtRenderTable()"></div></div><div id="mt-shell"></div>';
  }
  const counts = { all: mtRows.length };
  VH.CLASSES.forEach((c) => { counts[c.id] = mtRows.filter((r) => mtClassOf(r) === c.id).length; });
  document.getElementById('mt-tabs').innerHTML = VH.classTabsHtml(mtClass, counts, 'mtSetClass');
  const opt = (cur, v, l) => '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>';
  const units = mtUnits.filter((u) => (!mtClass || u.class === mtClass) && (VH.inUse(u) || u.id === mtUnitFilter || mtRows.some((r) => r.equipment_id === u.id)));
  const cats = VH.opts.service_category.filter((o) => (o.active || o.id === mtCatFilter) && (!mtClass || o.class === mtClass));
  document.getElementById('mt-filters').innerHTML = 'Show ' +
    '<select class="vh-select" onchange="mtPickUnit(this.value)">' + opt(mtUnitFilter, '', mtClass ? 'All ' + VH.cls(mtClass).label.toLowerCase() : 'Everything') +
      units.map((u) => opt(mtUnitFilter, u.id, u.unit_number + (u.code ? ' (' + u.code + ')' : ''))).join('') + '</select>' +
    '<select class="vh-select" onchange="mtYearFilter=this.value;mtRenderTable()">' + opt(mtYearFilter, '', 'All years') + mtYears().map((y) => opt(mtYearFilter, y, y)).join('') + '</select>' +
    '<select class="vh-select" onchange="mtCatFilter=this.value;mtRenderTable()">' + opt(mtCatFilter, '', 'All categories') +
      cats.map((o) => opt(mtCatFilter, o.id, (mtClass ? '' : VH.cls(o.class).one + ': ') + o.label)).join('') + '</select>';
  document.getElementById('mt-card').innerHTML = mtUnitCardHtml();
  mtRenderTable();
}
function mtTiles(list) {
  const sum = (rows) => rows.reduce((t, r) => t + (Number(r.cost) || 0), 0);
  const year = VH.today().slice(0, 4), d30 = VH.dateAdd(VH.today(), -30);
  const scope = mtRows.filter((r) => (!mtClass || mtClassOf(r) === mtClass) && (!mtUnitFilter || r.equipment_id === mtUnitFilter));
  const yearRows = scope.filter((r) => String(r.service_date || '').startsWith(year));
  const last30 = scope.filter((r) => r.service_date >= d30).length;
  document.getElementById('mt-tiles').innerHTML = '<div class="vh-tiles">' +
    '<div class="vh-tile c-blue"><div class="l">Entries Shown</div><div class="v">' + list.length + '</div></div>' +
    '<div class="vh-tile"><div class="l">Cost Shown</div><div class="v" style="font-size:22px;padding-top:4px">' + (VH.money(sum(list)) || '$0.00') + '</div></div>' +
    '<div class="vh-tile c-orange"><div class="l">Cost in ' + year + '</div><div class="v" style="font-size:22px;padding-top:4px">' + (VH.money(sum(yearRows)) || '$0.00') + '</div><div class="s">' + yearRows.length + ' entr' + (yearRows.length === 1 ? 'y' : 'ies') + '</div></div>' +
    '<div class="vh-tile c-green"><div class="l">Last 30 Days</div><div class="v">' + last30 + '</div><div class="s">entries</div></div>' +
    '<div class="vh-tile c-dim"><div class="l">Items Serviced</div><div class="v">' + new Set(list.map((r) => r.equipment_id)).size + '</div><div class="s">in the entries shown</div></div></div>';
}
// One item picked: its details and total cost, like the top of the old spreadsheet.
function mtUnitCardHtml() {
  const u = mtUnit(mtUnitFilter);
  if (!u) return '';
  const rows = mtRows.filter((r) => r.equipment_id === u.id);
  const total = rows.reduce((t, r) => t + (Number(r.cost) || 0), 0);
  const meter = VH.meterLines(u).join(' · ');
  const f = (k, v) => '<div><div class="k">' + k + '</div><div class="v">' + (v || VH.dash) + '</div></div>';
  const facts = u.class === 'pet'
    ? f('Species', esc(VH.optLabel(u.type_id))) + f('Breed', esc(u.model || '')) + f('Age', u.birth_date ? esc(VH.age(u.birth_date)) : '') + f('Nickname', esc(u.nickname || ''))
    : u.class === 'home' && u.address
      ? f('Type', esc(VH.optLabel(u.type_id))) + f('Address', esc(u.address)) + f('Year', u.year != null ? String(u.year) : '')
      : f('Make', esc(u.make || '')) + f('Model', esc(u.model || '')) + f('Year', u.year != null ? String(u.year) : '') +
        f(u.class === 'vehicle' ? 'VIN' : 'Serial #', u.vin ? '<span class="mono">' + esc(u.vin) + '</span>' : '') + (u.engine ? f('Engine', esc(u.engine)) : '') +
        (VH.hasMeter(u.class) ? f('Current Meter', meter ? meter + (u.meter_date ? ' <span class="vh-dash">(' + VH.fmtDate(u.meter_date) + ')</span>' : '') : '') : '');
  return '<div class="vh-unit-card">' + VH.gallery.avatarHtml(u, 'vh-av', mtProfile[u.id]) + '<div class="body">' +
    '<div class="top"><div class="nm">' + esc(u.unit_number) + '<span>' + esc(u.code || '') + '</span></div>' +
      '<div style="display:flex;gap:6px"><a class="bh-btn sm" style="text-decoration:none" href="inventory.html?info=' + u.id + '"><i class="ti ti-info-circle"></i> Item Info</a>' +
      '<button class="bh-btn sm" type="button" onclick="mtPickUnit(\'\')"><i class="ti ti-x"></i> All</button></div></div>' +
    '<div class="vh-kv">' + facts + f('Owner', esc(VH.memberName(u.owner_id))) +
      f('Total Cost', '<b>' + (VH.money(total) || '$0.00') + '</b> <span class="vh-dash">(' + rows.length + ' entr' + (rows.length === 1 ? 'y' : 'ies') + ')</span>') + '</div></div></div>';
}
function mtRenderTable() {
  const shell = document.getElementById('mt-shell');
  if (!shell) return;
  const list = mtFiltered();
  mtTiles(list);
  const sorted = mtSorted(list);
  const showMeter = !mtClass || VH.hasMeter(mtClass);
  const cols = 9 + (showMeter ? 1 : 0);
  const th = (col, label, st) => '<th class="sortable' + (mtSortCol === col ? ' sort-active' : '') + '" style="' + (st || '') + '" onclick="mtSetSort(\'' + col + '\')">' + label + VH.sortArrow(mtSortCol === col, mtSortDir === 1) + '</th>';
  const empty = mtRows.length ? 'No entries match.' : (mtUnits.length ? 'No maintenance entries yet. Click <b>Add Entry</b> to log the first one.' : 'Add an item on the Inventory page first.');
  shell.innerHTML = '<div class="vh-tbl-wrap"><table class="vh-tbl"><thead><tr>' +
    th('date', 'Date') + th('unit', mtClass === 'pet' ? 'Pet' : 'Item') + (showMeter ? th('meter', 'Meter') : '') + '<th style="min-width:260px">' + (mtClass === 'pet' ? 'Reason / Visit' : 'Work Performed') + '</th>' +
    th('performed', mtClass === 'pet' ? 'Vet / Clinic' : 'Performed By / From') +
    th('cost', 'Cost', 'text-align:right') + th('invoice', 'Invoice #') + '<th style="text-align:center">Notes</th><th style="text-align:center">Files</th><th></th></tr></thead><tbody>' +
    (sorted.length ? sorted.map((r) => mtRow(r, showMeter, cols)).join('') : '<tr><td colspan="' + cols + '"><div class="vh-empty"><i class="ti ti-tool"></i>' + empty + '</div></td></tr>') +
    (sorted.length > 1 ? '<tr><td colspan="' + (showMeter ? 5 : 4) + '" style="text-align:right;font-weight:700;color:var(--bh-text2)">Total</td><td class="num" style="font-weight:700">' + VH.money(list.reduce((t, r) => t + (Number(r.cost) || 0), 0)) + '</td><td colspan="4"></td></tr>' : '') +
    '</tbody></table></div>';
  if (mtNotesOpen && mtFind(mtNotesOpen)) VH.notes.render('entry', mtNotesOpen, 'mt-xnotes-' + mtNotesOpen, (n) => mtCount('notes', mtNotesOpen, n));
  if (mtFilesOpen && mtFind(mtFilesOpen)) VH.files.render(mtFilesOpen, 'mt-xfiles-' + mtFilesOpen, (n) => mtCount('files', mtFilesOpen, n));
}
function mtRow(r, showMeter, cols) {
  const u = mtUnit(r.equipment_id);
  const types = mtTypeLabels(r.id), cat = VH.optLabel(r.service_category_id);
  const memberLink = r.performed_by_user ? ' <i class="ti ti-user" style="font-size:12px;color:var(--bh-text3)" title="Family member"></i>' : '';
  const x = (kind, icon, title) => '<tr class="vh-xrow"><td colspan="' + cols + '"><div class="vh-xpanel"><div class="xh"><span><i class="ti ' + icon + '"></i> ' + title + ': ' + esc((u ? u.unit_number : '') + ', ' + VH.fmtDate(r.service_date)) + '</span>' +
    '<button class="vh-ib" type="button" title="Close" onclick="mtToggle(\'' + kind + '\',\'' + r.id + '\')"><i class="ti ti-x"></i></button></div><div id="mt-x' + kind + '-' + r.id + '"><div class="vh-hint">Loading…</div></div></div></td></tr>';
  const extra = [r.part_info ? '<b>Part:</b> ' + esc(r.part_info) : ''].filter(Boolean).join(' · ');
  return '<tr' + (mtIsReading(r) ? ' class="dim"' : '') + '>' +
    '<td style="white-space:nowrap"><span class="vh-name" onclick="mtOpenEdit(\'' + r.id + '\')">' + esc(VH.fmtDate(r.service_date)) + '</span></td>' +
    '<td><div style="display:flex;align-items:center;gap:8px">' + (u ? '<span style="transform:scale(.8);transform-origin:left center;margin-right:-8px">' + VH.gallery.avatarHtml(u, 'vh-thumb', mtProfile[u.id]) + '</span>' : '') +
      '<div><span class="vh-name" style="font-weight:600" onclick="mtPickUnit(\'' + r.equipment_id + '\')" title="Show only this item">' + esc(u ? u.unit_number : '') + '</span>' +
      (u ? '<div class="sub">' + esc(u.code || VH.cls(u.class).one) + '</div>' : '') + '</div></div></td>' +
    (showMeter ? '<td style="white-space:nowrap">' + mtMeterText(r) + '</td>' : '') +
    '<td style="max-width:440px">' + ((cat || types.length) ? '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:' + (r.work_performed || extra ? '4px' : '0') + '">' +
        (cat ? '<span class="vh-pill cat">' + esc(cat) + '</span>' : '') + types.filter((t) => t !== cat).map((t) => '<span class="vh-pill honey">' + esc(t) + '</span>').join('') + '</div>' : '') +
      (r.work_performed ? '<div style="font-size:12.5px">' + esc(r.work_performed) + '</div>' : '') +
      (extra ? '<div class="vh-xinfo">' + extra + '</div>' : '') + '</td>' +
    '<td>' + esc(r.performed_by_name || '') + memberLink + (r.purchased_from ? '<div class="sub">' + (r.performed_by_name ? 'from ' : 'bought at ') + esc(r.purchased_from) + '</div>' : '') + '</td>' +
    '<td class="num mono">' + VH.money(r.cost) + '</td>' +
    '<td class="mono">' + esc(r.invoice_number || '') + '</td>' +
    '<td style="text-align:center">' + VH.notes.cellHtml('entry', r.id, mtNoteCount[r.id], 'mtToggleNotes') + '</td>' +
    '<td style="text-align:center">' + VH.files.cellHtml(r.id, mtFileCount[r.id], 'mtToggleFiles') + '</td>' +
    '<td class="acts"><button class="vh-ib" type="button" title="Edit" onclick="mtOpenEdit(\'' + r.id + '\')"><i class="ti ti-edit"></i></button>' +
      '<button class="vh-ib red" type="button" title="Delete" onclick="mtDelete(\'' + r.id + '\')"><i class="ti ti-trash"></i></button></td></tr>' +
    (mtNotesOpen === r.id ? x('notes', 'ti-notes', 'Notes') : '') +
    (mtFilesOpen === r.id ? x('files', 'ti-paperclip', 'Invoices, Receipts &amp; Photos') : '');
}
function mtToggle(kind, id) {
  if (kind === 'notes') mtNotesOpen = mtNotesOpen === id ? null : id; else mtFilesOpen = mtFilesOpen === id ? null : id;
  mtRenderTable();
}
const mtToggleNotes = (id) => mtToggle('notes', id);
const mtToggleFiles = (id) => mtToggle('files', id);
function mtCount(kind, id, n) {
  const m = kind === 'notes' ? mtNoteCount : mtFileCount;
  if ((m[id] || 0) === n) return;
  m[id] = n;
  mtRenderTable();
}

/* ---------- form (Add window and Edit panel) ---------- */
const MT_LBL = {
  pet: { unit: 'Pet', cat: 'Visit Type', svc: 'Done at the Visit', work: 'Reason / Notes', pb: 'Vet / Clinic', pbph: 'e.g. Ark Animal Clinic' },
  home: { unit: 'Item', cat: 'Category', svc: 'Services', work: 'Description', pb: 'Performed By', pbph: 'A company or person, or pick a family member' },
  def: { unit: 'Item', cat: 'Category', svc: 'Services', work: 'Description', pb: 'Performed By', pbph: 'A shop, or pick a family member (start typing)' },
};
function mtFormHtml(p, r) {
  const row = r || { service_date: VH.today(), equipment_id: mtUnitFilter || '' };
  const units = mtUnits.filter((u) => VH.inUse(u) || u.id === row.equipment_id);   // grouped by class below
  const names = Array.from(new Set(VH.members.map((m) => m.name).concat(mtRows.map((x) => x.performed_by_name).filter(Boolean)))).sort((a, b) => a.localeCompare(b));
  const shops = Array.from(new Set(mtRows.map((x) => x.purchased_from).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const inp = (f, label, value, extra) => '<div class="vh-fg" id="' + p + '-' + f + '-wrap"><label id="' + p + '-' + f + '-lbl">' + label + '</label><input id="' + p + '-' + f + '" value="' + esc(value == null ? '' : value) + '"' + (extra || '') + '></div>';
  const grouped = VH.CLASSES.map((c) => {
    const list = units.filter((u) => u.class === c.id);
    return list.length ? '<optgroup label="' + esc(c.label) + '">' + list.map((u) => '<option value="' + u.id + '"' + (u.id === row.equipment_id ? ' selected' : '') + '>' + esc(u.unit_number + (u.code ? ' (' + u.code + ')' : '')) + '</option>').join('') + '</optgroup>' : '';
  }).join('');
  return '<datalist id="' + p + '-pb-list">' + names.map((n) => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
    '<datalist id="' + p + '-from-list">' + shops.map((n) => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
    '<div class="vh-g2">' + inp('date', 'Date <span class="req">*</span>', row.service_date, ' type="date" min="1900-01-01" max="2100-12-31"') +
      '<div class="vh-fg"><label id="' + p + '-unit-lbl">Item <span class="req">*</span></label><select id="' + p + '-unit" onchange="mtUnitChanged(\'' + p + '\', true)">' +
        '<option value="">' + (units.length ? '(pick one)' : '(add it on Inventory first)') + '</option>' + grouped + '</select></div></div>' +
    '<div class="vh-g2" id="' + p + '-meter-row">' + inp('odometer', 'Mileage at Service', row.odometer == null ? '' : VH.num(row.odometer, 1), ' inputmode="decimal" placeholder="e.g. 50,478"') +
      inp('hours', 'Hours at Service', row.hours == null ? '' : VH.num(row.hours, 1), ' inputmode="decimal" placeholder="e.g. 240"') + '</div>' +
    '<div id="' + p + '-meter-hint" class="vh-hint" style="margin-top:-6px"></div>' +
    '<div class="vh-sec" id="' + p + '-work-sec">Work Performed</div>' +
    '<div class="vh-fg"><label id="' + p + '-cat-lbl">Category</label><select id="' + p + '-cat" onchange="mtCatChanged(\'' + p + '\')"></select></div>' +
    '<div id="' + p + '-svc-box"></div>' +
    '<div class="vh-fg"><label id="' + p + '-work-lbl">Description</label><textarea id="' + p + '-work" rows="3" placeholder="What was done">' + esc(row.work_performed || '') + '</textarea></div>' +
    '<div class="vh-sec">Who, Parts &amp; Cost</div>' +
    '<div class="vh-g2"><div class="vh-fg"><label id="' + p + '-pb-lbl">Performed By</label><input id="' + p + '-pb" list="' + p + '-pb-list" autocomplete="off" value="' + esc(row.performed_by_name || '') + '"></div>' +
      inp('from', 'Purchased From', row.purchased_from, ' list="' + p + '-from-list" placeholder="e.g. Amazon.com, Walmart"') + '</div>' +
    inp('part', 'Part Make / Model', row.part_info, ' placeholder="e.g. NGK Iridium IX, FRAM CA11895"') +
    '<div class="vh-g2">' + inp('cost', 'Cost', row.cost == null ? '' : Number(row.cost).toFixed(2), ' inputmode="decimal" placeholder="$"') + inp('invoice', 'Invoice / Order #', row.invoice_number, '') + '</div>';
}
// The item decides the class: meter boxes, category list, services and wording.
function mtUnitChanged(p, changed) {
  const u = mtUnit(document.getElementById(p + '-unit').value);
  const c = u ? u.class : (mtClass || 'vehicle');
  const L = MT_LBL[c] || MT_LBL.def;
  const set = (id, t) => { const el = document.getElementById(p + '-' + id + '-lbl'); if (el) el.innerHTML = t; };
  set('unit', L.unit + ' <span class="req">*</span>'); set('cat', L.cat); set('work', L.work); set('pb', L.pb);
  document.getElementById(p + '-pb').placeholder = L.pbph;
  document.getElementById(p + '-work-sec').textContent = c === 'pet' ? 'Visit' : 'Work Performed';
  const meterRow = document.getElementById(p + '-meter-row');
  meterRow.style.display = !u || VH.hasMeter(c) ? '' : 'none';
  document.getElementById(p + '-odometer-wrap').style.display = !u || VH.usesMiles(u) ? '' : 'none';
  document.getElementById(p + '-hours-wrap').style.display = u && VH.usesHours(u) ? '' : 'none';
  if (u && VH.hasMeter(c) && !VH.usesMiles(u) && !VH.usesHours(u)) meterRow.style.display = 'none';
  const last = u ? VH.meterLines(u).join(' / ') : '';
  document.getElementById(p + '-meter-hint').textContent = last && meterRow.style.display !== 'none' ? 'Last reading: ' + last + (u.meter_date ? ' on ' + VH.fmtDate(u.meter_date) : '') : '';
  // category list for this class
  const cs = document.getElementById(p + '-cat');
  const keep = changed ? cs.value : (p === 'mt-edit' ? (mtFind(mtEditId) || {}).service_category_id || '' : '');
  const cats = VH.opts.service_category.filter((o) => o.class === c && (o.active || o.id === keep));
  cs.innerHTML = '<option value="">(pick one)</option>' + cats.map((o) => '<option value="' + o.id + '">' + esc(o.label) + '</option>').join('');
  cs.value = cats.some((o) => o.id === keep) ? keep : '';
  mtCatChanged(p);
}
// Services: the ones under the picked category (all of the class's when none is picked).
function mtCatChanged(p) {
  const u = mtUnit(document.getElementById(p + '-unit').value);
  const c = u ? u.class : (mtClass || 'vehicle');
  const cat = document.getElementById(p + '-cat').value;
  const box = document.getElementById(p + '-svc-box');
  const was = new Set(Array.from(box.querySelectorAll('input:checked')).map((el) => el.value));
  if (!box.dataset.init && p === 'mt-edit') { (mtServices[mtEditId] || []).forEach((id) => was.add(id)); box.dataset.init = '1'; }
  const list = VH.opts.service_type.filter((o) => o.class === c && (o.active || was.has(o.id)) && (!cat || o.parent_id === cat || was.has(o.id)));
  const L = MT_LBL[c] || MT_LBL.def;
  box.innerHTML = list.length
    ? '<div class="vh-fg" style="margin-bottom:2px"><label>' + L.svc + '</label></div><div class="vh-checks">' + list.map((o) => '<label><input type="checkbox" class="' + p + '-svc" value="' + o.id + '"' + (was.has(o.id) ? ' checked' : '') + '>' + esc(o.label) + '</label>').join('') + '</div>'
    : '';
}
function mtReadForm(p) {
  const v = (f) => { const el = document.getElementById(p + '-' + f); return el ? el.value : ''; };
  const u = mtUnit(v('unit'));
  const c = u ? u.class : 'vehicle';
  const pb = (v('pb') || '').trim().replace(/\s+/g, ' ');
  const member = pb ? VH.members.find((m) => VH.norm(m.name) === VH.norm(pb)) : null;
  return {
    entry: {
      service_date: v('date') || null,
      equipment_id: v('unit') || null,
      service_category_id: v('cat') || null,
      odometer: VH.hasMeter(c) && VH.usesMiles(u) ? VH.parseNum(v('odometer')) : null,
      hours: VH.hasMeter(c) && VH.usesHours(u) ? VH.parseNum(v('hours')) : null,
      work_performed: (v('work') || '').trim() || null,
      performed_by_name: pb || null,
      performed_by_user: member ? member.id : null,
      purchased_from: VH.clean(v('from')),
      part_info: VH.clean(v('part')),
      cost: VH.parseNum(v('cost')),
      invoice_number: (v('invoice') || '').trim() || null,
    },
    services: Array.from(document.querySelectorAll('.' + p + '-svc:checked')).map((el) => el.value),
  };
}
function mtValidate(f) {
  const e = f.entry;
  if (!e.service_date) return 'Date is required';
  if (e.service_date < '1900-01-01' || e.service_date > '2100-12-31') return 'Date must be between 1900 and 2100';
  if (e.service_date > VH.today()) return 'The date is in the future';
  if (!e.equipment_id || !mtUnit(e.equipment_id)) return 'Pick the item';
  if (Number.isNaN(e.odometer) || (e.odometer != null && e.odometer < 0)) return 'Mileage must be a number';
  if (Number.isNaN(e.hours) || (e.hours != null && e.hours < 0)) return 'Hours must be a number';
  if (Number.isNaN(e.cost) || (e.cost != null && e.cost < 0)) return 'Cost must be a dollar amount';
  if (!e.service_category_id && !e.work_performed && !f.services.length) return 'Pick a category or describe the work';
  if (/odometer reading/i.test(VH.optLabel(e.service_category_id)) && e.odometer == null && e.hours == null) return 'Enter the reading';
  return null;
}
// Readings should only go up over time. Lists anything out of order.
function mtMeterProblems(e, selfId) {
  const out = [], u = mtUnit(e.equipment_id);
  [['odometer', 'Mileage', 0], ['hours', 'Hours', 1]].forEach(([k, label, dec]) => {
    const val = e[k];
    if (val == null) return;
    const others = mtRows.filter((r) => r.equipment_id === e.equipment_id && r.id !== selfId && r[k] != null);
    const before = others.filter((r) => r.service_date <= e.service_date && Number(r[k]) > val).sort((a, b) => Number(b[k]) - Number(a[k]))[0];
    const after = others.filter((r) => r.service_date > e.service_date && Number(r[k]) < val).sort((a, b) => Number(a[k]) - Number(b[k]))[0];
    if (before) out.push(label + ' ' + VH.num(val, dec) + ' is lower than ' + VH.num(before[k], dec) + ' on ' + VH.fmtDate(before.service_date) + '.');
    else if (u && u[k] != null && u.meter_date && u.meter_date <= e.service_date && Number(u[k]) > val) out.push(label + ' ' + VH.num(val, dec) + ' is lower than the reading of ' + VH.num(u[k], dec) + ' on ' + VH.fmtDate(u.meter_date) + '.');
    if (after) out.push(label + ' ' + VH.num(val, dec) + ' is higher than ' + VH.num(after[k], dec) + ' on the later entry of ' + VH.fmtDate(after.service_date) + '.');
  });
  return out;
}

/* ---------- Add ---------- */
function mtOpenAdd() {
  mtPendingFiles = []; mtPendingLinks = [];
  VH.modal({
    id: 'mt-add', width: 'vh-w760', icon: 'ti-tool', title: 'Add Maintenance Entry',
    body: mtFormHtml('mt-add', null) +
      '<div class="vh-sec">Invoices, Receipts &amp; Photos <small>(saved when you click Add Entry)</small></div><div id="mt-add-pend"></div>' + VH.files.addRowHtml('mt-addf'),
    foot: '<button class="bh-btn" type="button" onclick="VH.closeModal(\'mt-add\')">Cancel</button><button class="bh-btn primary" type="button" id="mt-add-save" onclick="mtSave(\'add\')"><i class="ti ti-check"></i> Add Entry</button>',
  });
  mtUnitChanged('mt-add', false);
  VH.files.wire('mt-addf', (files) => { mtPendingFiles.push(...files.filter((f) => f.size <= 150 * 1024 * 1024)); mtRenderPending(); },
    (url, name) => { mtPendingLinks.push({ url, name }); mtRenderPending(); });
  mtRenderPending();
}
function mtRenderPending() {
  const el = document.getElementById('mt-add-pend');
  if (!el) return;
  const rows = mtPendingFiles.map((f, i) => ({ icon: 'ti-file', n: f.name, s: VH.fileSize(f.size), k: 'f', i })).concat(mtPendingLinks.map((l, i) => ({ icon: 'ti-link link', n: l.name, s: 'Link', k: 'l', i })));
  el.innerHTML = rows.length ? '<div class="vh-files">' + rows.map((r) => '<div class="vh-file"><i class="ti ' + r.icon + '"></i><span class="n">' + esc(r.n) + '</span><span class="s">' + esc(r.s) + '</span>' +
    '<button class="vh-ib red" type="button" title="Remove" onclick="mtPendRemove(\'' + r.k + '\',' + r.i + ')"><i class="ti ti-x"></i></button></div>').join('') + '</div>' : '';
}
function mtPendRemove(k, i) { (k === 'f' ? mtPendingFiles : mtPendingLinks).splice(i, 1); mtRenderPending(); }

/* ---------- Edit panel ---------- */
function mtOpenEdit(id) {
  const r = mtFind(id);
  if (!r) return;
  mtEditId = id;
  const u = mtUnit(r.equipment_id);
  VH.drawer({
    id: 'mt-edit', onClose: () => { mtEditId = null; },
    head: VH.drawerHead(u ? VH.gallery.avatarHtml(u, 'vh-av', mtProfile[u.id]) : '', esc(VH.fmtDate(r.service_date)) + ' · ' + esc(u ? u.unit_number : ''),
      esc([VH.optLabel(r.service_category_id)].concat(mtTypeLabels(r.id)).filter(Boolean).join(', ') || 'Maintenance entry') + (r.cost != null ? ' · ' + VH.money(r.cost) : ''), 'mt-edit'),
    body: '<div class="vh-hint" style="margin-top:10px"><b>Entered:</b> ' + VH.fmtDate(VH.localDate(r.created_at)) + (r.created_by ? ' by ' + esc(VH.memberName(r.created_by)) : '') +
      (r.updated_at && r.updated_at !== r.created_at ? ' · last changed ' + VH.fmtDate(VH.localDate(r.updated_at)) : '') + '</div>' +
      '<div class="vh-sec">Entry</div>' + mtFormHtml('mt-edit', r) +
      '<div class="vh-sec">Invoices, Receipts &amp; Photos <small>(saved at once)</small></div><div id="mt-edit-files"></div>' +
      '<div class="vh-sec">Notes</div><div id="mt-edit-notes"></div>',
    foot: '<button class="bh-btn primary" type="button" id="mt-edit-save" onclick="mtSave(\'edit\')"><i class="ti ti-check"></i> Save</button>' +
      '<button class="bh-btn" type="button" onclick="VH.closeModal(\'mt-edit\')">Close</button>',
  });
  mtUnitChanged('mt-edit', false);
  VH.files.render(id, 'mt-edit-files', (n) => mtCount('files', id, n));
  VH.notes.render('entry', id, 'mt-edit-notes', (n) => mtCount('notes', id, n));
}

/* ---------- Save ---------- */
async function mtSave(mode, force) {
  if (mtSaving) return;
  const p = mode === 'edit' ? 'mt-edit' : 'mt-add';
  const row = mode === 'edit' ? mtFind(mtEditId) : null;
  if (mode === 'edit' && !row) return;
  const f = mtReadForm(p);
  const problem = mtValidate(f);
  if (problem) { VH.toast(problem, 'error'); return; }
  if (!force) {
    const issues = mtMeterProblems(f.entry, row ? row.id : null);
    if (issues.length) {
      const ok = await VH.confirm('Check the Reading', '<ul style="margin:0 0 8px;padding-left:18px">' + issues.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>Readings normally only go up. Save anyway?', 'Save Anyway');
      if (!ok) return;
    }
  }
  mtSaving = true;
  const btn = document.getElementById(p + '-save'), html = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Saving…'; }
  const done = () => { mtSaving = false; if (btn) { btn.disabled = false; btn.innerHTML = html; } };
  const res = row
    ? await BH.sb.from('equipment_maintenance').update(f.entry).eq('id', row.id).select().single()
    : await BH.sb.from('equipment_maintenance').insert(f.entry).select().single();
  if (res.error) { done(); VH.toast('Save failed: ' + res.error.message, 'error'); return; }
  const saved = res.data;
  const had = new Set(row ? mtServices[row.id] || [] : []), want = new Set(f.services);
  const gone = [...had].filter((x) => !want.has(x)), add = [...want].filter((x) => !had.has(x));
  if (gone.length) await BH.sb.from('equipment_maintenance_services').delete().eq('maintenance_id', saved.id).in('option_id', gone);
  if (add.length) {
    const r2 = await BH.sb.from('equipment_maintenance_services').insert(add.map((o) => ({ maintenance_id: saved.id, option_id: o })));
    if (r2.error) VH.toast('Services not all saved: ' + r2.error.message, 'error');
  }
  mtServices[saved.id] = f.services;
  if (row) { const i = mtRows.findIndex((x) => x.id === row.id); mtRows[i] = saved; }
  else mtRows.push(saved);
  let note = '';
  if (!row && (mtPendingFiles.length || mtPendingLinks.length)) {
    if (btn) btn.innerHTML = '<i class="ti ti-loader"></i> Adding files…';
    let got = mtPendingFiles.length ? await VH.files.uploadAll(saved.id, mtPendingFiles, 'mt-addf-up') : 0;
    for (const l of mtPendingLinks) if (await VH.files.insertLink(saved.id, l.url, l.name)) got++;
    mtFileCount[saved.id] = got;
    note = ' with ' + got + ' file' + (got === 1 ? '' : 's');
  }
  const v = await BH.sb.from('equipment').select('id, odometer, hours, meter_date').eq('id', saved.equipment_id).maybeSingle();
  if (v.data) Object.assign(mtUnit(saved.equipment_id) || {}, v.data);
  done();
  if (row) VH.toast('Entry saved', 'ok'); else { VH.closeModal('mt-add'); VH.toast('Entry added' + note, 'ok'); }
  mtRender();
}

/* ---------- Delete ---------- */
async function mtDelete(id) {
  const r = mtFind(id);
  if (!r) return;
  const u = mtUnit(r.equipment_id), files = mtFileCount[id] || 0, notes = mtNoteCount[id] || 0;
  const ok = await VH.confirm('Permanently Delete Entry', 'Delete the <b>' + esc(VH.fmtDate(r.service_date)) + '</b> entry on <b>' + esc(u ? u.unit_number : '') + '</b>?' +
    (files || notes ? '<div class="vh-hint" style="margin-top:8px">Its ' + [files ? files + ' file' + (files === 1 ? '' : 's') : '', notes ? notes + ' note' + (notes === 1 ? '' : 's') : ''].filter(Boolean).join(' and ') + ' go with it.</div>' : ''), 'Permanently Delete', true);
  if (!ok) return;
  try { await VH.call('delete_entry', { id }); }
  catch (e) {
    const { error } = await BH.sb.from('equipment_maintenance').delete().eq('id', id);
    if (error) { VH.toast('Delete failed: ' + (e.message || error.message), 'error'); return; }
  }
  mtRows = mtRows.filter((x) => x.id !== id);
  if (mtEditId === id) VH.closeModal('mt-edit');
  VH.toast('Entry deleted', 'error');
  mtRender();
}

/* ---------- Print ---------- */
function mtPrint() {
  const list = mtSorted(mtFiltered());
  const u = mtUnit(mtUnitFilter);
  const total = list.reduce((t, r) => t + (Number(r.cost) || 0), 0);
  const label = (u ? u.unit_number : mtClass ? VH.cls(mtClass).label : 'Everything') + (mtYearFilter ? ' · ' + mtYearFilter : '') + (mtCatFilter ? ' · ' + VH.optLabel(mtCatFilter) : '') + ' · ' + list.length + ' entr' + (list.length === 1 ? 'y' : 'ies');
  const card = u ? '<div class="card">' + [['Item', u.unit_number + (u.code ? ' (' + u.code + ')' : '')], ['Description', VH.desc(u)], [u.class === 'vehicle' ? 'VIN' : 'Serial #', u.vin || ''], ['Engine', u.engine || ''],
    ['Owner', VH.memberName(u.owner_id)], ['Current Meter', VH.meterLines(u).join(' · ')], ['Total Cost', VH.money(total) || '$0.00'], ['Entries', String(list.length)]]
    .map(([k, v]) => '<div><div class="k">' + esc(k) + '</div><div>' + esc(v) + '</div></div>').join('') + '</div>' : '';
  const rows = list.map((r) => { const uu = mtUnit(r.equipment_id); return '<tr><td>' + VH.fmtDate(r.service_date) + '</td>' + (u ? '' : '<td>' + esc(uu ? uu.unit_number : '') + '</td>') +
    '<td>' + mtMeterText(r) + '</td><td><b>' + esc(VH.optLabel(r.service_category_id)) + '</b>' + (mtTypeLabels(r.id).length ? ': ' + esc(mtTypeLabels(r.id).join(', ')) : '') +
      (r.work_performed ? '<div class="sub">' + esc(r.work_performed) + '</div>' : '') + (r.part_info ? '<div class="sub">Part: ' + esc(r.part_info) + '</div>' : '') + '</td>' +
    '<td>' + esc(r.performed_by_name || '') + (r.purchased_from ? '<div class="sub">' + esc(r.purchased_from) + '</div>' : '') + '</td><td class="r">' + VH.money(r.cost) + '</td><td>' + esc(r.invoice_number || '') + '</td></tr>'; }).join('') +
    '<tr><td colspan="' + (u ? 4 : 5) + '" class="r"><b>Total</b></td><td class="r"><b>' + (VH.money(total) || '$0.00') + '</b></td><td></td></tr>';
  VH.printReport('Maintenance Log', label, ['Date'].concat(u ? [] : ['Item']).concat(['Meter', 'Work Performed', 'By / From', { t: 'Cost', r: true }, 'Invoice #']), rows, card);
}

mtStart();
