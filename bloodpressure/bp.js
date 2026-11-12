/* bellhive99.com - Blood Pressure log
 *
 * Quick entry: when (defaults to now), systolic / diastolic and an optional note. The last few
 * readings show underneath so a typo can be spotted and deleted right away.
 *
 * Table: public.bp_readings (supabase/blood-pressure.sql). Row level security keeps every
 * person to their own readings - admins included. The Audit Log notes that a reading was
 * added or deleted, never the numbers.
 */
(function () {
  const { el, toast, modal } = BH.ui;
  const root = document.getElementById('bp');
  const RECENT = 5;
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const S = { recent: [] };

  const svg = (paths) => el('span', { html: '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths + '</svg>' }).firstChild;
  const ICON = {
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  };
  const pad = (n) => String(n).padStart(2, '0');
  /* value for <input type="datetime-local"> in this computer's time zone */
  const localNow = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fmtWhen = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const friendly = (err) => {
    const m = (err && err.message) || String(err || 'Something went wrong');
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Could not reach the database. Check your connection and try again.';
    if (/check constraint|violates/i.test(m)) return 'Those numbers don’t look right - please check them and try again.';
    return m;
  };

  /* ------------------------------------------------------------------ page */
  function shell() {
    if (!inFrame) {
      document.body.prepend(el('div', { class: 'bh-bar bp-topbar' },
        el('a', { class: 'bh-wordmark', href: '../index.html', title: 'Home', html: 'bell<b>hive</b>99' }),
        el('span', { class: 'spacer' }),
        el('a', { class: 'bh-bar-btn', href: '../index.html' }, 'Home')));
    }
    root.replaceChildren(el('div', { class: 'bh-page-wrap bp-wrap' },
      el('div', { class: 'bh-page-head' },
        el('div', null, el('div', { class: 'crumb' }, 'Health and Fitness'), el('h1', null, 'Blood Pressure')),
        el('div', { class: 'bp-head-note' }, 'Only you can see your readings')),
      entryCard(),
      el('div', { id: 'bp-recent' }, el('div', { class: 'bh-empty' }, 'Loading…'))));
  }

  function entryCard() {
    const when = el('input', { type: 'datetime-local', value: localNow(), max: localNow(), required: true });
    const num = (ph) => el('input', { type: 'number', inputMode: 'numeric', min: 1, max: 300, step: 1, placeholder: ph, required: true });
    const sys = num('120'), dia = num('80');
    const notes = el('textarea', { rows: 2, maxLength: 500, placeholder: 'Notes (optional) - e.g. after coffee, left arm, felt stressed' });
    const err = el('div', { class: 'bh-err bp-err' });
    const btn = el('button', { class: 'bh-btn primary bp-save', type: 'submit' }, svg(ICON.heart), 'Save Reading');

    // typing 3 digits of systolic moves on to diastolic
    sys.addEventListener('input', () => { if (sys.value.length >= 3) dia.focus(); });

    const form = el('form', { class: 'bh-card bh-card-pad bp-entry', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const s = parseInt(sys.value, 10), d = parseInt(dia.value, 10);
      if (!(s >= 50 && s <= 300)) { err.textContent = 'Systolic (top number) should be between 50 and 300.'; sys.focus(); return; }
      if (!(d >= 30 && d <= 200)) { err.textContent = 'Diastolic (bottom number) should be between 30 and 200.'; dia.focus(); return; }
      if (s <= d) { err.textContent = 'The top number (systolic) should be higher than the bottom number (diastolic).'; sys.focus(); return; }
      const at = when.value ? new Date(when.value) : new Date();
      if (isNaN(at)) { err.textContent = 'Pick the date and time of the reading.'; when.focus(); return; }
      btn.disabled = true;
      try {
        const { error } = await BH.sb.from('bp_readings').insert({ taken_at: at.toISOString(), systolic: s, diastolic: d, notes: notes.value.trim() || null });
        if (error) throw error;
        toast('Saved ' + s + '/' + d, 'ok');
        sys.value = ''; dia.value = ''; notes.value = '';
        when.value = localNow(); when.max = localNow();
        await refresh(true);
        sys.focus();
      } catch (ex) { err.textContent = friendly(ex); }
      finally { btn.disabled = false; }
    } },
      el('label', { class: 'bh-field bp-when' }, el('span', null, 'When'), when),
      el('div', { class: 'bp-nums' },
        el('label', { class: 'bh-field' }, el('span', null, 'Systolic', el('small', null, ' top number')), sys),
        el('div', { class: 'bp-slash', 'aria-hidden': 'true' }, '/'),
        el('label', { class: 'bh-field' }, el('span', null, 'Diastolic', el('small', null, ' bottom number')), dia)),
      el('label', { class: 'bh-field' }, el('span', null, 'Notes'), notes),
      err, btn);
    setTimeout(() => sys.focus(), 50);
    return form;
  }

  /* ------------------------------------------------------------------ recent readings */
  async function refresh(justSaved) {
    const box = document.getElementById('bp-recent');
    try {
      const { data, error } = await BH.sb.from('bp_readings')
        .select('id, taken_at, systolic, diastolic, notes')
        .order('taken_at', { ascending: false }).limit(RECENT);
      if (error) throw error;
      S.recent = data || [];
    } catch (ex) {
      box.replaceChildren(el('div', { class: 'bh-alert' }, 'Could not load your readings: ' + friendly(ex)));
      return;
    }
    if (!S.recent.length) {
      box.replaceChildren(el('div', { class: 'bh-card bh-empty bp-empty' }, 'No readings yet - your first one will show here.'));
      return;
    }
    box.replaceChildren(
      el('div', { class: 'bp-recent-t' }, 'Latest readings'),
      ...S.recent.map((r, i) => el('div', { class: 'bp-row' + (justSaved && i === 0 ? ' pop' : '') },
        el('div', { class: 'bp-val' }, String(r.systolic), el('span', null, '/'), String(r.diastolic)),
        el('div', { class: 'bp-main' },
          el('div', { class: 'bp-when-t' }, fmtWhen(r.taken_at)),
          r.notes ? el('div', { class: 'bp-note' }, r.notes) : null),
        el('button', { class: 'bh-ib red', type: 'button', title: 'Delete this reading', onclick: () => remove(r) }, svg(ICON.trash)))));
  }

  function remove(r) {
    modal({
      title: 'Delete Reading',
      body: el('p', { class: 'bh-note' }, 'Delete ' + r.systolic + '/' + r.diastolic + ' from ' + fmtWhen(r.taken_at) + '? This can’t be undone.'),
      buttons: [{ label: 'Cancel' }, { label: 'Delete', danger: true, onClick: async (close) => {
        const { error } = await BH.sb.from('bp_readings').delete().eq('id', r.id);
        if (error) { toast(friendly(error), 'error'); return; }
        close();
        toast('Reading deleted', 'ok');
        refresh();
      } }],
    });
  }

  /* ------------------------------------------------------------------ start */
  (async function start() {
    let user = null;
    try { ({ user } = await BH.init()); } catch (e) { /* not configured / deactivated */ }
    if (!user) { BH.requireLogin(); return; }
    if (BH.track) BH.track('bloodpressure');
    BH.pageOpen('Blood Pressure', 'bloodpressure');
    shell();
    refresh();
  })();
})();
