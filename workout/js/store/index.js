/* Picks the backend from config and seeds a brand-new user's starter exercises. */
window.WL = window.WL || {};

WL.openStore = async function (user, sbClient) {
  const store = WL.CONFIG.backend === 'supabase' ? WL.SupabaseStore(user, sbClient) : WL.LocalStore(user);

  const exercises = await store.listExercises();
  if (!exercises.length && !(await store.getMeta('seeded'))) {
    for (let i = 0; i < WL.catalog.DEFAULT_EXERCISES.length; i++) {
      await store.saveExercise(Object.assign({ custom: [], archived: false, sort: i }, JSON.parse(JSON.stringify(WL.catalog.DEFAULT_EXERCISES[i]))));
    }
    for (let i = 0; i < WL.catalog.DEFAULT_METRICS.length; i++) {
      await store.saveMetric(Object.assign({ archived: false, sort: i }, WL.catalog.DEFAULT_METRICS[i]));
    }
    await store.setMeta('seeded', true);
  }
  return store;
};

/* Imports the old spreadsheet (data/history.js) into the signed-in user's log. */
WL.importHistory = async function (store, onProgress) {
  if (!WL.HISTORY) await WL.u.loadScript('data/history.js');
  const H = WL.HISTORY;
  let exercises = await store.listExercises();
  let metrics = await store.listMetrics();
  const exByKey = {}, mByKey = {};
  exercises.forEach((e) => { if (e.key) exByKey[e.key] = e; });
  metrics.forEach((m) => { if (m.key) mByKey[m.key] = m; });

  /* recreate any starter exercise / tracker the user has deleted */
  for (const def of WL.catalog.DEFAULT_EXERCISES) {
    if (!exByKey[def.key]) exByKey[def.key] = await store.saveExercise(Object.assign({ custom: [], archived: false, sort: exercises.length + 1 }, JSON.parse(JSON.stringify(def))));
  }
  for (const def of WL.catalog.DEFAULT_METRICS) {
    if (!mByKey[def.key]) mByKey[def.key] = await store.saveMetric(Object.assign({ archived: false }, def));
  }

  const sets = H.sets.map((r) => ({
    exerciseId: exByKey[r[0]].id, date: r[1], time: r[2], setNo: r[3],
    reps: r[4], weight: r[5], duration: r[6], distance: r[7], extra: {}, note: 'Imported from spreadsheet',
  }));
  const daily = H.daily.map((r) => ({ date: r[0], metricId: mByKey[r[1]].id, value: r[2] }));
  await store.bulkInsert(sets, daily, onProgress);
  await store.setMeta('imported', { at: new Date().toISOString(), sets: sets.length, daily: daily.length });
  return { sets: sets.length, daily: daily.length };
};
