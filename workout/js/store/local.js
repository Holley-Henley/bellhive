/* Local backend: keeps each person's log in this browser's localStorage.
 * Every method returns a Promise so the Supabase backend is a drop-in swap. */
window.WL = window.WL || {};

WL.LocalStore = function (user) {
  const u = WL.u;
  const KEY = 'wl:data:' + user.id;
  let db = u.ls.get(KEY, null) || { exercises: [], sets: [], metrics: [], daily: {}, meta: {} };

  function save() {
    if (!u.ls.set(KEY, db)) throw new Error('Browser storage is full - export a backup and switch to Supabase.');
  }
  const ok = (v) => Promise.resolve(v);
  const byDateTime = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.setNo || 0) - (b.setNo || 0));
  const copy = (o) => JSON.parse(JSON.stringify(o));

  return {
    kind: 'local',
    label: 'This browser only',

    /* ---- exercises ---- */
    listExercises() { return ok(copy(db.exercises).sort((a, b) => (a.sort || 0) - (b.sort || 0))); },
    saveExercise(ex) {
      ex = copy(ex);
      if (!ex.id) { ex.id = u.uid(); ex.sort = ex.sort != null ? ex.sort : db.exercises.length; db.exercises.push(ex); }
      else { const i = db.exercises.findIndex((e) => e.id === ex.id); if (i >= 0) db.exercises[i] = ex; else db.exercises.push(ex); }
      save(); return ok(ex);
    },
    deleteExercise(id) {
      db.exercises = db.exercises.filter((e) => e.id !== id);
      db.sets = db.sets.filter((s) => s.exerciseId !== id);
      save(); return ok(true);
    },

    /* ---- sets ---- */
    listSets(q) {
      q = q || {};
      let r = db.sets;
      if (q.exerciseId) r = r.filter((s) => s.exerciseId === q.exerciseId);
      if (q.from) r = r.filter((s) => s.date >= q.from);
      if (q.to) r = r.filter((s) => s.date <= q.to);
      return ok(copy(r).sort(byDateTime));
    },
    lastSet(exerciseId) {
      let best = null;
      for (const s of db.sets) if (s.exerciseId === exerciseId && (!best || byDateTime(s, best) > 0)) best = s;
      return ok(best ? copy(best) : null);
    },
    addSet(s) { s = copy(s); s.id = u.uid(); db.sets.push(s); save(); return ok(s); },
    updateSet(s) { const i = db.sets.findIndex((x) => x.id === s.id); if (i >= 0) db.sets[i] = copy(s); save(); return ok(s); },
    deleteSet(id) { db.sets = db.sets.filter((s) => s.id !== id); save(); return ok(true); },

    /* ---- daily trackers (body weight, beers, ...) ---- */
    listMetrics() { return ok(copy(db.metrics).sort((a, b) => (a.sort || 0) - (b.sort || 0))); },
    saveMetric(m) {
      m = copy(m);
      if (!m.id) { m.id = u.uid(); m.sort = m.sort != null ? m.sort : db.metrics.length; db.metrics.push(m); }
      else { const i = db.metrics.findIndex((x) => x.id === m.id); if (i >= 0) db.metrics[i] = m; else db.metrics.push(m); }
      save(); return ok(m);
    },
    deleteMetric(id) {
      db.metrics = db.metrics.filter((m) => m.id !== id);
      for (const d in db.daily) delete db.daily[d][id];
      save(); return ok(true);
    },
    /* returns { 'YYYY-MM-DD': { metricId: value } } */
    listDaily(q) {
      q = q || {};
      const out = {};
      for (const d in db.daily) if ((!q.from || d >= q.from) && (!q.to || d <= q.to)) out[d] = Object.assign({}, db.daily[d]);
      return ok(out);
    },
    setDaily(date, metricId, value) {
      db.daily[date] = db.daily[date] || {};
      if (value == null) delete db.daily[date][metricId]; else db.daily[date][metricId] = value;
      if (!Object.keys(db.daily[date]).length) delete db.daily[date];
      save(); return ok(true);
    },

    /* ---- bulk ---- */
    getMeta(k) { return ok(db.meta[k]); },
    setMeta(k, v) { db.meta[k] = v; save(); return ok(true); },
    bulkInsert(sets, daily) {
      sets.forEach((s) => { s.id = u.uid(); db.sets.push(s); });
      daily.forEach((d) => { db.daily[d.date] = db.daily[d.date] || {}; db.daily[d.date][d.metricId] = d.value; });
      save(); return ok(true);
    },
    exportAll() { return ok(copy(db)); },
    wipe() { db = { exercises: [], sets: [], metrics: [], daily: {}, meta: {} }; save(); return ok(true); },
  };
};
