/* Setup view: create and configure exercises (what to track, target sets/reps),
 * daily trackers, and data import/export. */
window.WL = window.WL || {};
WL.views = WL.views || {};

WL.views.setup = (function () {
  const u = WL.u, h = u.h, C = WL.catalog;
  const audit = (type, detail, ref) => { if (window.BH && BH.audit) BH.audit(type, detail, ref, 'workout'); };

  async function render(container, args, app) {
    const store = app.store;
    const mode = args[0];

    if (mode === 'exercise') return container.appendChild(exerciseForm(app, args[1] ? app.exercise(args[1]) : null));
    if (mode === 'metric') return container.appendChild(metricForm(app, args[1] ? app.metrics.find((m) => m.id === args[1]) : null));

    /* ---- exercises ---- */
    const exs = app.exercises;
    const move = async (i, dir) => {
      const j = i + dir; if (j < 0 || j >= exs.length) return;
      const a = exs[i], b = exs[j];
      [a.sort, b.sort] = [j, i];
      exs.forEach((e, k) => { if (e !== a && e !== b) e.sort = k; });
      await Promise.all(exs.map((e) => store.saveExercise(e)));
      await app.reload(); app.render();
    };
    container.appendChild(h('section.card',
      h('div.card-head', h('h2', 'Exercises'), h('a.btn.primary.small', { href: '#setup/exercise' }, '+ New exercise')),
      h('ul.setup-list', exs.map((ex, i) => h('li' + (ex.archived ? '.archived' : ''),
        h('div.setup-main',
          h('b', ex.name, ex.archived ? h('em.tag', 'Hidden') : null),
          h('span', (C.CATEGORIES[ex.category] || C.CATEGORIES.other).label + ' · ' + C.fieldsOf(ex).map((f) => f.label).join(', ') + ' · ' + C.targetLabel(ex))),
        h('div.setup-actions',
          h('button.icon-btn.small', { onclick: () => move(i, -1), disabled: i === 0, 'aria-label': 'Move up' }, '↑'),
          h('button.icon-btn.small', { onclick: () => move(i, 1), disabled: i === exs.length - 1, 'aria-label': 'Move down' }, '↓'),
          h('a.btn.ghost.small', { href: '#setup/exercise/' + ex.id }, 'Edit')))))));

    /* ---- daily trackers ---- */
    container.appendChild(h('section.card',
      h('div.card-head', h('h2', 'Daily trackers'), h('a.btn.primary.small', { href: '#setup/metric' }, '+ New tracker')),
      h('p.card-sub', 'One number per day, like body weight. Shown on the Log and Week screens.'),
      h('ul.setup-list', app.metrics.map((m) => h('li' + (m.archived ? '.archived' : ''),
        h('div.setup-main', h('b', m.name, m.archived ? h('em.tag', 'Hidden') : null), h('span', (m.unit || 'count') + ' · weekly ' + (m.agg === 'avg' ? 'average' : 'total'))),
        h('div.setup-actions', h('a.btn.ghost.small', { href: '#setup/metric/' + m.id }, 'Edit')))))));

    /* ---- data ---- */
    const imported = await store.getMeta('imported');
    const status = h('p.card-sub');
    const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    const importBtn = h('button.btn' + (imported ? '.ghost' : '.primary'), {
      onclick: () => {
        if (imported && !confirmInline(importBtn, 'Import again? This adds a second copy. Tap again to confirm.')) return;
        fileInput.value = ''; fileInput.click();
      },
    }, imported ? 'Import again' : 'Import spreadsheet history…');
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      status.textContent = '';
      importBtn.disabled = true; importBtn.textContent = 'Reading file…';
      try {
        const H = WL.parseHistoryFile(await file.text());
        importBtn.textContent = 'Importing…';
        const r = await WL.importHistory(store, (n, total) => { importBtn.textContent = 'Importing ' + n + ' / ' + total; }, H);
        audit('workout_import', 'imported spreadsheet history (' + r.sets + ' sets, ' + r.daily + ' daily entries)', file.name);
        await app.reload();
        u.toast('Imported ' + u.fmtNum(r.sets) + ' sets and ' + r.daily + ' daily entries');
        const lastDate = H.sets[H.sets.length - 1][1];
        app.go('week/' + lastDate);
      } catch (e) { importBtn.disabled = false; importBtn.textContent = imported ? 'Import again' : 'Import spreadsheet history…'; status.textContent = e.message; }
    });
    container.appendChild(h('section.card',
      h('div.card-head', h('h2', 'Data')),
      h('p.card-sub', imported
        ? 'Spreadsheet history imported ' + u.fmtDate(u.iso(new Date(imported.at)), { year: true }) + ' (' + u.fmtNum(imported.sets) + ' sets).'
        : 'Brings in the old WorkOutSchedule sheet (Feb 2024 – Apr 2026: bench, push-ups, curls, plank, bike, hike, body weight and beers). Choose the file workout-history-2024-2026.json from your computer.'),
      h('div.btn-row', importBtn, fileInput,
        h('button.btn.ghost', {
          onclick: async () => {
            const data = await store.exportAll();
            const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: 'workout-log-' + app.user.name.toLowerCase() + '-' + u.today() + '.json' });
            document.body.appendChild(a); a.click(); a.remove();
          },
        }, 'Download backup'),
        h('button.btn.ghost.danger', {
          onclick: async (e) => {
            if (!confirmInline(e.currentTarget, 'Erase all of ' + app.user.name + "'s data? Tap again to confirm.")) return;
            await audit('workout_erase', 'erased all workout data');
            await store.wipe(); location.reload();
          },
        }, 'Erase my data')),
      status,
      h('p.fine', 'Storage: ' + store.label + '. Signed in as ' + app.user.name + '.')));
  }

  /* two-tap confirm without browser dialogs */
  function confirmInline(btn, msg) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = '1';
    const old = btn.textContent;
    btn.textContent = 'Tap again to confirm';
    btn.title = msg;
    u.toast(msg, 3000);
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 4000);
    return false;
  }

  function exerciseForm(app, ex) {
    const isNew = !ex;
    ex = ex ? JSON.parse(JSON.stringify(ex)) : { name: '', category: 'weights', fields: ['reps', 'weight'], custom: [], target: { sets: 3, reps: 10 }, archived: false };
    ex.target = ex.target || {};
    ex.custom = ex.custom || [];

    const name = h('input', { value: ex.name, placeholder: 'e.g. Shoulder Press', required: true });
    const cat = h('select', Object.keys(C.CATEGORIES).map((k) => h('option', { value: k, selected: ex.category === k }, C.CATEGORIES[k].label)));
    const checks = {};
    const fieldBox = h('div.check-row', C.FIELD_ORDER.map((k) => {
      checks[k] = h('input', { type: 'checkbox', checked: ex.fields.includes(k), onchange: drawTargets });
      return h('label.check', checks[k], C.FIELDS[k].label + (C.FIELDS[k].unit ? ' (' + C.FIELDS[k].unit + ')' : ''));
    }));
    cat.addEventListener('change', () => {
      const f = C.CATEGORIES[cat.value].fields;
      C.FIELD_ORDER.forEach((k) => { checks[k].checked = f.includes(k); });
      drawTargets();
    });

    /* custom fields */
    const customBox = h('div.custom-list');
    function drawCustom() {
      customBox.innerHTML = '';
      ex.custom.forEach((c, i) => {
        const lab = h('input', { value: c.label, placeholder: 'Label (e.g. Incline)', oninput: (e) => { c.label = e.target.value; } });
        const unit = h('input.short', { value: c.unit || '', placeholder: 'Unit', oninput: (e) => { c.unit = e.target.value; } });
        customBox.appendChild(h('div.custom-row', lab, unit, h('button.icon-btn.small.danger', { type: 'button', onclick: () => { ex.custom.splice(i, 1); drawCustom(); drawTargets(); }, 'aria-label': 'Remove field' }, '✕')));
      });
      customBox.appendChild(h('button.btn.ghost.small', { type: 'button', onclick: () => { ex.custom.push({ key: 'c_' + u.uid().slice(0, 8), label: '', unit: '' }); drawCustom(); } }, '+ Add custom field'));
    }

    /* targets */
    const tSets = h('input', { type: 'number', min: 0, max: 50, value: ex.target.sets == null ? '' : ex.target.sets, inputMode: 'numeric' });
    const tInputs = {};
    const targetBox = h('div.target-grid');
    function drawTargets() {
      targetBox.innerHTML = '';
      targetBox.appendChild(h('label.field', h('span', 'Sets'), tSets));
      C.FIELD_ORDER.filter((k) => checks[k].checked).forEach((k) => {
        const F = C.FIELDS[k];
        const cur = tInputs[k] ? tInputs[k].value : (ex.target[k] == null ? '' : F.kind === 'duration' ? u.fmtDuration(ex.target[k]) : ex.target[k]);
        tInputs[k] = h('input', { value: cur, placeholder: F.kind === 'duration' ? 'm:ss' : '', inputMode: F.kind === 'duration' ? 'text' : 'decimal' });
        targetBox.appendChild(h('label.field', h('span', F.label + (F.unit ? ' (' + F.unit + ')' : '')), tInputs[k]));
      });
    }

    const msg = h('p.form-msg');
    const form = h('form.card.form', {
      onsubmit: async (e) => {
        e.preventDefault();
        ex.name = name.value.trim();
        if (!ex.name) { msg.textContent = 'Give it a name.'; return; }
        ex.category = cat.value;
        ex.fields = C.FIELD_ORDER.filter((k) => checks[k].checked);
        ex.custom = ex.custom.filter((c) => c.label.trim()).map((c) => ({ key: c.key, label: c.label.trim(), unit: (c.unit || '').trim() }));
        if (!ex.fields.length && !ex.custom.length) { msg.textContent = 'Pick at least one thing to track.'; return; }
        const t = { sets: u.num(tSets.value) };
        ex.fields.forEach((k) => {
          const raw = tInputs[k] ? tInputs[k].value : '';
          t[k] = C.FIELDS[k].kind === 'duration' ? u.parseDuration(raw) : u.num(raw);
        });
        Object.keys(t).forEach((k) => { if (t[k] == null) delete t[k]; });
        ex.target = t;
        if (isNew) ex.sort = app.exercises.length;
        await app.store.saveExercise(ex);
        audit(isNew ? 'exercise_create' : 'exercise_update', (isNew ? 'added exercise ' : 'edited exercise ') + ex.name, C.targetLabel(ex));
        await app.reload();
        u.toast(isNew ? ex.name + ' added' : 'Saved');
        app.go('setup');
      },
    },
      h('div.card-head', h('h2', isNew ? 'New exercise' : 'Edit ' + ex.name), h('a.btn.ghost.small', { href: '#setup' }, 'Back')),
      h('label.field', h('span', 'Name'), name),
      h('label.field', h('span', 'Type'), cat),
      h('div.field', h('span', 'Track each set by'), fieldBox),
      h('div.field', h('span', 'Custom fields'), h('small.help', 'Anything else worth a number: incline, band color, resistance level…'), customBox),
      h('div.field', h('span', 'Target per session'), h('small.help', 'Used to pre-fill the log and show progress pips.'), targetBox),
      msg,
      h('div.btn-row',
        h('button.btn.primary', { type: 'submit' }, isNew ? 'Add exercise' : 'Save'),
        !isNew ? h('button.btn.ghost', {
          type: 'button',
          onclick: async () => { ex.archived = !ex.archived; await app.store.saveExercise(ex); audit('exercise_update', (ex.archived ? 'hid exercise ' : 'showed exercise ') + ex.name); await app.reload(); app.go('setup'); },
        }, ex.archived ? 'Show again' : 'Hide (keep history)') : null,
        !isNew ? h('button.btn.ghost.danger', {
          type: 'button',
          onclick: async (e) => {
            if (!confirmInline(e.currentTarget, 'Delete ' + ex.name + ' and every set logged for it?')) return;
            await app.store.deleteExercise(ex.id); audit('exercise_delete', 'deleted exercise ' + ex.name + ' and its sets'); await app.reload(); app.go('setup');
          },
        }, 'Delete') : null));
    drawCustom(); drawTargets();
    return form;
  }

  function metricForm(app, m) {
    const isNew = !m;
    m = m ? Object.assign({}, m) : { name: '', unit: '', agg: 'sum', step: 1, archived: false };
    const name = h('input', { value: m.name, placeholder: 'e.g. Water (glasses)', required: true });
    const unit = h('input', { value: m.unit || '', placeholder: 'e.g. lb, glasses, hrs' });
    const step = h('input', { type: 'number', step: 'any', value: m.step || 1 });
    const agg = h('select', h('option', { value: 'sum', selected: m.agg !== 'avg' }, 'Add up (total)'), h('option', { value: 'avg', selected: m.agg === 'avg' }, 'Average'));
    const form = h('form.card.form', {
      onsubmit: async (e) => {
        e.preventDefault();
        m.name = name.value.trim(); if (!m.name) return;
        m.unit = unit.value.trim(); m.agg = agg.value; m.step = u.num(step.value) || 1;
        if (isNew) m.sort = app.metrics.length;
        await app.store.saveMetric(m); audit(isNew ? 'tracker_create' : 'tracker_update', (isNew ? 'added daily tracker ' : 'edited daily tracker ') + m.name); await app.reload(); app.go('setup');
      },
    },
      h('div.card-head', h('h2', isNew ? 'New daily tracker' : 'Edit ' + m.name), h('a.btn.ghost.small', { href: '#setup' }, 'Back')),
      h('label.field', h('span', 'Name'), name),
      h('label.field', h('span', 'Unit'), unit),
      h('label.field', h('span', 'Each week'), agg),
      h('label.field', h('span', '+/− step'), step),
      h('div.btn-row',
        h('button.btn.primary', { type: 'submit' }, isNew ? 'Add tracker' : 'Save'),
        !isNew ? h('button.btn.ghost', { type: 'button', onclick: async () => { m.archived = !m.archived; await app.store.saveMetric(m); await app.reload(); app.go('setup'); } }, m.archived ? 'Show again' : 'Hide') : null,
        !isNew ? h('button.btn.ghost.danger', {
          type: 'button',
          onclick: async (e) => { if (!confirmInline(e.currentTarget, 'Delete ' + m.name + ' and its entries?')) return; await app.store.deleteMetric(m.id); audit('tracker_delete', 'deleted daily tracker ' + m.name); await app.reload(); app.go('setup'); },
        }, 'Delete') : null));
    return form;
  }

  return { render };
})();
