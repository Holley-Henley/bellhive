/* ============================================================
 * Chrisware / bellhive99.com - vehicles/nhtsa.js
 * NHTSA lookups for Inventory (Vehicles class). Cloned from HHB Project Exchange
 * (modules/equipment-nhtsa.js, 261028.07 / .08). Loads after vehicles/common.js.
 *
 * 1. LOOK UP VIN (Add / Edit): decodes the VIN with NHTSA vPIC (free, no key). Add fills
 *    only the BLANK boxes; Edit shows what's saved next to what the VIN says and asks which
 *    to update.
 * 2. SAFETY RECALLS (Info panel): every recall campaign for the VIN's year / make / model.
 *    That list is model-level, so each campaign can be marked Done (repaired) or Not
 *    Affected after checking the VIN at nhtsa.gov/recalls; only those marks are stored
 *    (equipment_recalls).
 * Both NHTSA services allow browser calls (CORS). Equipment serial numbers aren't VINs, so
 * both only run for a 17-character VIN.
 * ============================================================ */
(function () {
  const esc = VH.esc;
  const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/';
  const RECALLS = 'https://api.nhtsa.gov/recalls/recallsByVehicle';
  const decodeCache = {}, recallCache = {};
  const NH = (VH.nhtsa = { marks: {} });

  NH.isVin = (v) => /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(v || '').trim());
  const title = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const cap = (s) => title(s).replace(/\(Usa\)/, '(USA)').replace(/\bLlc\b/, 'LLC').replace(/\bAg\b/, 'AG');

  NH.decode = async function (vin) {
    vin = String(vin || '').trim().toUpperCase();
    if (decodeCache[vin]) return decodeCache[vin];
    const res = await fetch(VPIC + encodeURIComponent(vin) + '?format=json');
    if (!res.ok) throw new Error('NHTSA decoder replied ' + res.status);
    const row = ((await res.json()).Results || [])[0];
    if (!row) throw new Error('NHTSA decoder returned nothing');
    return (decodeCache[vin] = row);
  };
  NH.engineText = function (d) {
    const cyl = d.EngineCylinders ? String(d.EngineCylinders) : '';
    const cfg = /v-shaped/i.test(d.EngineConfiguration || '') ? 'V' + cyl : /in-line/i.test(d.EngineConfiguration || '') ? 'I' + cyl : (cyl ? cyl + '-cyl' : '');
    const fuel = d.FuelTypePrimary ? (/gasoline/i.test(d.FuelTypePrimary) ? 'Gas' : d.FuelTypePrimary.replace(/\s*\(.*\)$/, '')) : '';
    return [d.DisplacementL ? Number(d.DisplacementL).toString() + 'L' : '', cfg, /yes/i.test(d.Turbo || '') ? 'Turbo' : '', fuel].filter(Boolean).join(' ');
  };
  NH.specText = function (d) {
    const v = (k) => { const x = String(d[k] == null ? '' : d[k]).trim(); return x && x !== 'Not Applicable' && x !== '0' ? x : ''; };
    const num = (x) => Number(x).toLocaleString('en-US', { maximumFractionDigits: 1 });
    const parts = [];
    const add = (label, value) => { if (value) parts.push(label + ': ' + value); };
    add('Trim', [v('Trim'), v('Trim2')].filter(Boolean).join(' '));
    add('Series', [v('Series'), v('Series2')].filter(Boolean).join(' '));
    add('Body', [v('BodyClass'), v('BodyCabType') ? v('BodyCabType') + ' cab' : '', v('Doors') ? v('Doors') + ' doors' : ''].filter(Boolean).join(', '));
    add('Bed', [v('BedType'), v('BedLengthIN') ? num(v('BedLengthIN')) + ' in' : ''].filter(Boolean).join(', '));
    add('Drive', v('DriveType'));
    add('Engine', [NH.engineText(d), v('EngineModel') ? '(' + v('EngineModel') + ')' : '', v('EngineHP') ? v('EngineHP') + (v('EngineHP_to') ? '-' + v('EngineHP_to') : '') + ' HP' : ''].filter(Boolean).join(' '));
    add('Fuel', [v('FuelTypePrimary'), v('FuelTypeSecondary')].filter(Boolean).join(' / '));
    add('Transmission', [v('TransmissionStyle'), v('TransmissionSpeeds') ? v('TransmissionSpeeds') + '-speed' : ''].filter(Boolean).join(', '));
    add('GVWR', v('GVWR').replace(/\s*\([^)]*kg\)/i, ''));
    add('Curb Weight', v('CurbWeightLB') ? num(v('CurbWeightLB')) + ' lb' : '');
    add('Wheelbase', v('WheelBaseShort') ? num(v('WheelBaseShort')) + (v('WheelBaseLong') && v('WheelBaseLong') !== v('WheelBaseShort') ? '-' + num(v('WheelBaseLong')) : '') + ' in' : '');
    add('Seats', [v('Seats'), v('SeatRows') ? v('SeatRows') + ' rows' : ''].filter(Boolean).join(', '));
    const safety = [['ABS', 'ABS'], ['ESC', 'ESC'], ['TractionControl', 'Traction Control'], ['TPMS', 'TPMS'], ['RearVisibilitySystem', 'Backup Camera'],
      ['BlindSpotMon', 'Blind Spot'], ['ForwardCollisionWarning', 'Forward Collision Warning'], ['CIB', 'Auto Emergency Braking'],
      ['LaneDepartureWarning', 'Lane Departure'], ['AdaptiveCruiseControl', 'Adaptive Cruise']]
      .filter(([k]) => v(k) && !/^not|^no$/i.test(v(k))).map(([, l]) => l);
    add('Safety', safety.join(', '));
    add('Built', [cap(v('PlantCity')), cap(v('PlantState')), cap(v('PlantCountry'))].filter(Boolean).join(', '));
    add('Base Price (new)', v('BasePrice') ? '$' + Number(v('BasePrice')).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '');
    return parts.join(' · ');
  };

  /* ---------- 1. Look up VIN ---------- */
  NH.buttonHtml = (prefix) =>
    '<button type="button" class="bh-btn sm" style="margin-top:5px" onclick="VH.nhtsa.lookup(\'' + prefix + '\')"><i class="ti ti-search"></i> Look up VIN</button>' +
    '<div id="' + prefix + '-vin-result" class="vh-hint"></div>';
  function fields(prefix, d) {
    const out = [];
    const add = (field, label, value) => { if (value) out.push({ field, label, kind: 'input', value: String(value), text: String(value) }); };
    const opt = (field, label, test) => {
      const sel = document.getElementById(prefix + '-' + field);
      const o = sel && Array.from(sel.options).find((x) => x.value && test(x.textContent));
      if (o) out.push({ field, label, kind: 'select', value: o.value, text: o.textContent });
    };
    add('name', 'Name', [d.ModelYear, d.Model].filter(Boolean).join(' '));
    add('year', 'Year', d.ModelYear);
    add('make', 'Make', title(d.Make));
    add('model', 'Model', d.Model);
    add('trim', 'Trim', [d.Trim, d.Trim2].filter(Boolean).join(' '));
    add('series', 'Series', d.Series);
    add('engine', 'Engine', NH.engineText(d));
    add('specs', 'Specifications', NH.specText(d));
    const vt = d.VehicleType || '', bc = d.BodyClass || '';
    if (/trailer/i.test(vt)) opt('type', 'Type', (t) => /^trailer/i.test(t));
    else if (/motorcycle/i.test(vt)) opt('type', 'Type', (t) => /^motorcycle/i.test(t));
    else if (/pickup/i.test(bc)) opt('type', 'Type', (t) => /^pickup/i.test(t));
    else if (/van/i.test(bc)) opt('type', 'Type', (t) => /^van/i.test(t));
    else if (/sport utility|suv/i.test(bc)) opt('type', 'Type', (t) => /^suv/i.test(t));
    else if (/sedan|coupe|hatchback|convertible|wagon|crossover/i.test(bc)) opt('type', 'Type', (t) => /^(automobile|car)/i.test(t));
    return out;
  }
  const now = (prefix, f) => {
    const el = document.getElementById(prefix + '-' + f.field);
    if (!el) return { value: '', text: '' };
    if (f.kind === 'select') return { value: el.value, text: el.value ? ((el.selectedOptions[0] || {}).textContent || '') : '' };
    return { value: String(el.value || '').trim(), text: String(el.value || '').trim() };
  };
  const same = (a, b) => String(a || '').trim().toLowerCase().replace(/\s+/g, ' ') === String(b || '').trim().toLowerCase().replace(/\s+/g, ' ');

  NH.lookup = async function (prefix) {
    const vinEl = document.getElementById(prefix + '-vin');
    const out = document.getElementById(prefix + '-vin-result');
    const vin = (vinEl && vinEl.value || '').trim().toUpperCase();
    if (!out) return;
    out.className = 'vh-hint';
    if (!NH.isVin(vin)) { out.className = 'vh-hint bad'; out.textContent = 'Enter a 17-character VIN first (equipment serial numbers can\'t be looked up).'; return; }
    out.innerHTML = '<i class="ti ti-loader"></i> Looking up ' + esc(vin) + '…';
    let d;
    try { d = await NH.decode(vin); } catch (e) { out.className = 'vh-hint bad'; out.textContent = 'Lookup failed: ' + e.message; return; }
    if (!d.Make && !d.Model) { out.className = 'vh-hint bad'; out.textContent = 'NHTSA couldn\'t decode this VIN. ' + (d.ErrorText || ''); return; }
    vinEl.value = vin;
    const desc = [d.ModelYear, title(d.Make), d.Model, d.Series ? '(' + d.Series + ')' : '', d.BodyClass, NH.engineText(d), d.DriveType].filter(Boolean).join(' · ');
    const found = '<div style="color:var(--bh-text2)"><i class="ti ti-circle-check" style="color:var(--bh-green)"></i> ' + esc(desc) + '</div>';
    const list = fields(prefix, d);
    if (prefix === 'vh-edit') { out.innerHTML = found; compare(prefix, list.filter((f) => f.field !== 'name'), vin); return; }
    const filled = [];
    list.forEach((f) => {
      const el = document.getElementById(prefix + '-' + f.field);
      if (el && !now(prefix, f).value) { el.value = f.value; el.classList.add('vh-filled'); filled.push(f.label); }
    });
    if (filled.includes('Category') && typeof window.vhFormChanged === 'function') window.vhFormChanged(prefix);
    out.innerHTML = found + '<div>' + (filled.length ? 'Filled in: ' + esc(filled.join(', ')) + '.' : 'Nothing filled in; those boxes already have values.') + '</div>';
  };

  function compare(prefix, rows, vin) {
    const diffs = rows.filter((f) => !same(now(prefix, f).text, f.text)).length;
    const lines = rows.map((f, i) => {
      const n = now(prefix, f), eq = same(n.text, f.text);
      return '<tr><td style="font-weight:600;white-space:nowrap">' + esc(f.label) + '</td>' +
        '<td>' + (n.text ? esc(n.text) : '<span class="vh-dash">(blank)</span>') + '</td>' +
        '<td style="color:' + (eq ? 'var(--bh-text3)' : '#8a5a00') + '">' + esc(f.text) + '</td>' +
        '<td style="text-align:center">' + (eq ? '<i class="ti ti-check" style="color:var(--bh-green)" title="Already matches"></i>' : '<input type="checkbox" class="vh-cmp-cb" data-i="' + i + '"' + (n.value ? '' : ' checked') + '>') + '</td></tr>';
    }).join('');
    VH.modal({
      id: 'vh-vin-cmp', width: 'vh-w760', icon: 'ti-search', title: 'Update from VIN?', noFocus: true,
      body: '<p class="bh-note">NHTSA decoded VIN <span class="mono">' + esc(vin) + '</span>. ' + (diffs ? 'Tick the fields to update. Blank fields are ticked; fields you already filled in are not.' : 'Everything already matches the VIN.') + '</p>' +
        '<table class="vh-cmp"><thead><tr><th>Field</th><th>Saved now</th><th>From the VIN</th><th style="text-align:center">Update</th></tr></thead><tbody>' + lines + '</tbody></table>',
      foot: '<button class="bh-btn" type="button" onclick="VH.closeModal(\'vh-vin-cmp\')">Cancel</button>' + (diffs ? '<button class="bh-btn primary" type="button" id="vh-vin-apply"><i class="ti ti-check"></i> Update Selected</button>' : ''),
    });
    const btn = document.getElementById('vh-vin-apply');
    if (btn) btn.onclick = () => {
      const done = [];
      document.querySelectorAll('.vh-cmp-cb:checked').forEach((cb) => {
        const f = rows[Number(cb.dataset.i)];
        const el = f && document.getElementById(prefix + '-' + f.field);
        if (!el) return;
        el.value = f.value; el.classList.add('vh-filled'); done.push(f.label);
      });
      VH.closeModal('vh-vin-cmp');
      const out = document.getElementById(prefix + '-vin-result');
      if (out) out.insertAdjacentHTML('beforeend', done.length ? '<div style="color:#8a5a00;font-weight:600">Updated ' + esc(done.join(', ')) + ' from the VIN. Click Save to keep the changes.</div>' : '<div>Nothing updated.</div>');
    };
  }

  /* ---------- 2. Safety recalls (Info panel) ---------- */
  NH.recallsFor = async function (make, model, year) {
    const key = [make, model, year].join('|').toUpperCase();
    if (recallCache[key]) return recallCache[key];
    for (const m of [model, model + ' SD']) {
      const res = await fetch(RECALLS + '?make=' + encodeURIComponent(make) + '&model=' + encodeURIComponent(m) + '&modelYear=' + encodeURIComponent(year));
      if (!res.ok && res.status !== 400) throw new Error('NHTSA recalls replied ' + res.status);
      const list = res.ok ? ((await res.json()).results || []) : [];
      if (list.length) return (recallCache[key] = { model: m, list });
    }
    return (recallCache[key] = { model, list: [] });
  };
  NH.sectionHtml = (v) => (NH.isVin(v.vin) ? '<div id="vh-recalls-' + v.id + '"><div class="vh-hint"><i class="ti ti-loader"></i> Checking NHTSA for recalls…</div></div>' : '');
  NH.load = async function (v) {
    const el = () => document.getElementById('vh-recalls-' + v.id);
    if (!el() || !NH.isVin(v.vin)) return;
    try {
      const d = await NH.decode(v.vin);
      if (!d.Make || !d.Model || !d.ModelYear) { el().innerHTML = '<div class="vh-hint">NHTSA couldn\'t decode this VIN, so recalls can\'t be looked up.</div>'; return; }
      const [rec, marks] = await Promise.all([NH.recallsFor(d.Make, d.Model, d.ModelYear), BH.sb.from('equipment_recalls').select('*').eq('equipment_id', v.id)]);
      NH.marks[v.id] = {};
      (marks.data || []).forEach((m) => { NH.marks[v.id][m.campaign_number] = m; });
      if (el()) draw(v, d, rec);
    } catch (e) {
      if (el()) el().innerHTML = '<div class="vh-hint bad">Couldn\'t reach NHTSA: ' + esc(e.message) + '</div>';
    }
  };
  function draw(v, d, rec) {
    const el = document.getElementById('vh-recalls-' + v.id);
    if (!el) return;
    const marks = NH.marks[v.id] || {};
    const list = rec.list.slice().sort((a, b) => String(b.NHTSACampaignNumber).localeCompare(String(a.NHTSACampaignNumber)));
    const open = list.filter((x) => !marks[x.NHTSACampaignNumber]).length;
    if (typeof window.vhRecallCount === 'function') window.vhRecallCount(v.id, open);
    const top = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
      '<div style="font-size:12.5px;color:var(--bh-text2)">' + list.length + ' campaign' + (list.length === 1 ? '' : 's') + ' for the ' + esc([d.ModelYear, title(d.Make), rec.model].join(' ')) +
        (list.length ? ' &middot; <b style="color:' + (open ? 'var(--bh-red)' : 'var(--bh-green)') + '">' + open + ' to check</b>' : '') + '</div>' +
      '<a class="bh-btn sm" style="text-decoration:none" href="https://www.nhtsa.gov/recalls?vin=' + encodeURIComponent(v.vin) + '" target="_blank" rel="noopener" onclick="try{navigator.clipboard.writeText(\'' + esc(v.vin) + '\')}catch(e){}" title="Opens NHTSA\'s recall lookup; the VIN is copied, paste it if it isn\'t filled in"><i class="ti ti-external-link"></i> Check this VIN at NHTSA</a></div>';
    if (!list.length) { el.innerHTML = top + '<div style="font-size:12.5px;color:var(--bh-green)"><i class="ti ti-circle-check"></i> No recalls on file at NHTSA for this model year.</div>'; return; }
    const short = (t) => { t = String(t || ''); return t.length > 260 ? t.slice(0, 260) + '…' : t; };
    el.innerHTML = top + '<div class="vh-hint" style="margin:-2px 0 8px">This list is for the model year, not this exact vehicle. Check the VIN at NHTSA to see which apply and are still open, then mark each one Done or Not Affected.</div>' +
      list.map((x) => {
        const cn = x.NHTSACampaignNumber, m = marks[cn];
        const stat = m ? (m.status === 'done' ? '<span class="vh-pill green">Done</span>' : '<span class="vh-pill gray">Not Affected</span>') : '<span class="vh-pill red">To Check</span>';
        const urgent = (x.parkIt ? '<span class="vh-pill solid-red">Park It</span>' : '') + (x.parkOutSide ? '<span class="vh-pill orange">Park Outside</span>' : '');
        const a = 'data-u="' + v.id + '" data-c="' + esc(cn) + '"';
        return '<div class="vh-recall' + (m ? ' marked' : '') + '"><div class="h">' + stat + urgent +
            '<a class="mono" href="https://www.nhtsa.gov/recalls?nhtsaId=' + encodeURIComponent(cn) + '" target="_blank" rel="noopener">' + esc(cn) + '</a>' +
            '<span class="vh-dash">' + esc(x.ReportReceivedDate || '') + '</span><b style="color:var(--bh-text2)">' + esc(x.Component || '') + '</b></div>' +
          '<div class="sum">' + esc(short(x.Summary)) + '</div>' +
          '<details><summary style="cursor:pointer">Consequence and remedy</summary><div style="margin-top:4px"><b>Consequence:</b> ' + esc(x.Consequence || '') + '</div><div style="margin-top:4px"><b>Remedy:</b> ' + esc(x.Remedy || '') + '</div></details>' +
          (m ? '<div class="vh-hint">Marked ' + (m.status === 'done' ? 'Done' : 'Not Affected') + ' ' + esc(VH.fmtDate(VH.localDate(m.checked_at))) + (m.note ? ': ' + esc(m.note) : '') + '</div>' : '') +
          '<div class="acts">' + (m
            ? '<button class="bh-btn sm" type="button" ' + a + ' onclick="VH.nhtsa.mark(this.dataset.u,this.dataset.c,null)"><i class="ti ti-arrow-back-up"></i> Undo</button>'
            : '<button class="bh-btn sm" type="button" ' + a + ' onclick="VH.nhtsa.mark(this.dataset.u,this.dataset.c,\'done\')"><i class="ti ti-check"></i> Done (repaired)</button>' +
              '<button class="bh-btn sm" type="button" ' + a + ' onclick="VH.nhtsa.mark(this.dataset.u,this.dataset.c,\'not_affected\')"><i class="ti ti-circle-minus"></i> Not Affected</button>') +
          '</div></div>';
      }).join('');
  }
  NH.mark = async function (vid, campaign, status) {
    const v = window.vhFindRow ? window.vhFindRow(vid) : null;
    if (!v) return;
    let note = null;
    if (status === 'done') { note = prompt('Optional note (e.g. "Fixed at the dealer, invoice 40387"):', ''); if (note === null) return; note = note.trim() || null; }
    const q = status
      ? BH.sb.from('equipment_recalls').upsert({ equipment_id: vid, campaign_number: campaign, status, note, checked_by: BH.user.id, checked_at: new Date().toISOString() }, { onConflict: 'equipment_id,campaign_number' })
      : BH.sb.from('equipment_recalls').delete().eq('equipment_id', vid).eq('campaign_number', campaign);
    const { error } = await q;
    if (error) { VH.toast('Not saved: ' + error.message, 'error'); return; }
    VH.toast(status ? 'Recall marked' : 'Mark cleared', 'ok');
    await NH.load(v);
  };
})();
