/* Log view: record today's sets (or any day's) one tap at a time, plus daily trackers. */
window.WL = window.WL || {};
WL.views = WL.views || {};

WL.views.log = (function () {
  const u = WL.u, h = u.h, C = WL.catalog;
  let timerHandle = null;

  /* A numeric / duration input with − and + buttons. */
  function stepper(field, value) {
    const isDur = field.kind === 'duration';
    const fmt = (v) => (v == null ? '' : isDur ? u.fmtDuration(v) : u.fmtNum(v, field.kind === 'int' ? 0 : 2).replace(/,/g, ''));
    const parse = (s) => (isDur ? u.parseDuration(s) : u.num(String(s).replace(/,/g, '')));
    const input = h('input.step-input', { type: 'text', inputMode: isDur ? 'text' : 'decimal', value: fmt(value), placeholder: isDur ? 'm:ss' : '0', 'aria-label': field.label });
    const stepOf = (v) => (isDur ? ((v || 0) >= 600 ? 60 : 15) : field.step || 1);
    const bump = (dir) => {
      const cur = parse(input.value) || 0;
      let next = Math.max(0, cur + dir * stepOf(cur + (dir < 0 ? -1 : 0)));
      next = Math.round(next * 100) / 100;
      input.value = fmt(next);
      input.dispatchEvent(new Event('change'));
    };
    const el = h('label.stepper',
      h('span.step-label', field.label, field.unit ? h('em', ' ' + field.unit) : null),
      h('span.step-row',
        h('button.step-btn', { type: 'button', onclick: () => bump(-1), 'aria-label': 'Less' }, '−'),
        input,
        h('button.step-btn', { type: 'button', onclick: () => bump(1), 'aria-label': 'More' }, '+')));
    return { el, input, get: () => parse(input.value) };
  }

  function pips(done, target) {
    const n = Math.max(done, target || 0);
    if (!n || !done) return null;
    const wrap = h('span.pips');
    for (let i = 0; i < Math.min(n, 12); i++) wrap.appendChild(h('i' + (i < done ? '.on' : '') + (i >= (target || 0) ? '.extra' : '')));
    return wrap;
  }

  async function render(container, args, app) {
    const store = app.store;
    const date = args[0] && /^\d{4}-\d{2}-\d{2}$/.test(args[0]) ? args[0] : u.today();
    const isToday = date === u.today();
    let openId = args[1] || null;
    let editing = null;          // set being edited
    let sets = await store.listSets({ from: date, to: date });
    const daily = (await store.listDaily({ from: date, to: date }))[date] || {};
    const lastCache = {};

    const dateBar = h('div.datebar',
      h('button.icon-btn', { onclick: () => app.go('log/' + u.addDays(date, -1)), 'aria-label': 'Previous day' }, '‹'),
      h('div.datebar-mid',
        h('div.datebar-day', isToday ? 'Today' : u.fmtDate(date, { weekday: true })),
        isToday
          ? h('div.datebar-sub', u.fmtDate(date, { weekday: true }) + ', ' + u.parse(date).getFullYear())
          : h('div.datebar-sub', u.parse(date).getFullYear() + ' · ', h('a', { href: '#log' }, 'Back to today')),
        h('input.date-pick', { type: 'date', value: date, 'aria-label': 'Pick a date', onchange: (e) => e.target.value && app.go('log/' + e.target.value) })),
      h('button.icon-btn', { onclick: () => app.go('log/' + u.addDays(date, 1)), 'aria-label': 'Next day' }, '›'));

    const list = h('div.ex-list');
    const dailyBox = h('section.daily');
    container.append(dateBar, h('h2.section-title', 'Exercises'), list, h('h2.section-title', 'Daily'), dailyBox);

    function setsFor(exId) { return sets.filter((s) => s.exerciseId === exId).sort((a, b) => a.setNo - b.setNo); }

    async function draw() {
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
      list.innerHTML = '';
      const active = app.activeExercises();
      if (!active.length) list.appendChild(h('div.empty', 'No exercises yet. Add some in ', h('a', { href: '#setup' }, 'Setup'), '.'));
      /* exercises done today float to the top, then the rest in your order */
      const ordered = active.slice().sort((a, b) => (setsFor(b.id).length ? 1 : 0) - (setsFor(a.id).length ? 1 : 0) || (a.sort || 0) - (b.sort || 0));
      for (const ex of ordered) list.appendChild(await card(ex));
    }

    async function card(ex) {
      const mine = setsFor(ex.id);
      const open = openId === ex.id;
      const target = (ex.target || {}).sets || 0;
      const head = h('button.ex-head', { onclick: () => { openId = open ? null : ex.id; editing = null; draw(); } },
        h('span.ex-head-main',
          h('span.ex-name', ex.name),
          h('span.ex-sub', mine.length ? C.summarize(ex, mine) : C.targetLabel(ex))),
        h('span.ex-head-side', pips(mine.length, target), h('span.ex-count', mine.length ? mine.length + (target ? '/' + target : '') : '')));
      const el = h('article.ex-card' + (open ? '.open' : '') + (mine.length ? '.has' : '') + (target && mine.length >= target ? '.done' : ''), head);
      if (!open) return el;

      /* existing sets */
      const rows = h('ol.set-rows');
      mine.forEach((s) => rows.appendChild(h('li.set-row' + (editing && editing.id === s.id ? '.editing' : ''),
        h('span.set-no', '#' + s.setNo),
        h('span.set-val', C.setLabel(ex, s)),
        h('span.set-time', u.fmtTime(s.time)),
        h('button.link', { onclick: () => { editing = s; draw(); } }, 'Edit'),
        h('button.icon-btn.small.danger', {
          'aria-label': 'Delete set',
          onclick: async () => {
            await store.deleteSet(s.id);
            sets = sets.filter((x) => x.id !== s.id);
            /* renumber the rest */
            const rest = setsFor(ex.id);
            for (let i = 0; i < rest.length; i++) if (rest[i].setNo !== i + 1) { rest[i].setNo = i + 1; await store.updateSet(rest[i]); }
            editing = null; draw();
          },
        }, '✕'))));
      if (mine.length) el.appendChild(rows);

      /* prefill: the set being edited, else the last set today, else the last time ever, else the target */
      let src = editing || mine[mine.length - 1];
      if (!src) {
        if (!(ex.id in lastCache)) lastCache[ex.id] = await store.lastSet(ex.id);
        src = lastCache[ex.id];
      }
      const t = ex.target || {};
      const fields = C.fieldsOf(ex).map((f) => {
        let v = src ? C.valueOf(src, f.key) : null;
        if (v == null) v = f.builtin ? t[f.key] : (t.extra || {})[f.key];
        return Object.assign(stepper(f, v == null ? null : v), { field: f });
      });
      const nextNo = editing ? editing.setNo : mine.length + 1;
      const save = h('button.btn.primary.big', {
        onclick: async () => {
          const s = editing ? Object.assign({}, editing) : { exerciseId: ex.id, date, time: isToday ? u.nowTime() : null, setNo: nextNo, extra: {} };
          s.extra = Object.assign({}, s.extra);
          fields.forEach((f) => { const v = f.get(); if (f.field.builtin) s[f.field.key] = v; else if (v == null) delete s.extra[f.field.key]; else s.extra[f.field.key] = v; });
          if (editing) {
            await store.updateSet(s);
            sets = sets.map((x) => (x.id === s.id ? s : x));
          } else {
            sets.push(await store.addSet(s));
            if (navigator.vibrate) navigator.vibrate(30);
          }
          editing = null; draw();
        },
      }, editing ? 'Save set #' + nextNo : 'Log set #' + nextNo);

      const body = h('div.ex-body',
        h('div.fields', fields.map((f) => f.el)),
        h('div.ex-actions', save, editing ? h('button.btn.ghost', { onclick: () => { editing = null; draw(); } }, 'Cancel') : null));
      el.appendChild(body);

      /* rest timer since the last set (today only) */
      const last = mine[mine.length - 1];
      if (isToday && last && last.time && !editing) {
        const tEl = h('span.rest');
        const tick = () => {
          const [hh, mm, ss] = last.time.split(':').map(Number);
          const then = new Date(); then.setHours(hh, mm, ss || 0, 0);
          const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
          tEl.textContent = 'Since last set ' + u.fmtDuration(secs);
        };
        tick(); timerHandle = setInterval(tick, 1000);
        body.appendChild(h('div.rest-row', tEl));
      }
      return el;
    }

    function drawDaily() {
      dailyBox.innerHTML = '';
      const ms = app.activeMetrics();
      if (!ms.length) { dailyBox.appendChild(h('div.empty.small', 'No daily trackers. Add them in ', h('a', { href: '#setup' }, 'Setup'), '.')); return; }
      ms.forEach((m) => {
        const st = stepper({ label: m.name, unit: m.unit, kind: 'num', step: m.step || 1 }, daily[m.id]);
        let t = null;
        st.input.addEventListener('change', () => {
          clearTimeout(t);
          t = setTimeout(async () => {
            const v = st.get();
            await store.setDaily(date, m.id, v);
            daily[m.id] = v;
            st.el.classList.add('saved'); setTimeout(() => st.el.classList.remove('saved'), 900);
          }, 350);
        });
        dailyBox.appendChild(h('div.daily-item', st.el));
      });
    }

    await draw();
    drawDaily();
  }

  return { render };
})();
