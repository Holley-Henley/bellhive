/* Supabase backend: same interface as LocalStore, backed by the tables in sql/schema.sql.
 * Row level security limits every query to the signed-in user, so no user_id
 * filters are needed here; user_id defaults to auth.uid() on insert. */
window.WL = window.WL || {};

WL.SupabaseStore = function (user, sb) {
  const PAGE = 1000;

  const exIn = (r) => ({ id: r.id, key: r.key, name: r.name, category: r.category, fields: r.fields || [], custom: r.custom || [], target: r.target || {}, sort: r.sort, archived: r.archived });
  const exOut = (e) => ({ id: e.id, key: e.key || null, name: e.name, category: e.category, fields: e.fields || [], custom: e.custom || [], target: e.target || {}, sort: e.sort || 0, archived: !!e.archived });
  const setIn = (r) => ({ id: r.id, exerciseId: r.exercise_id, date: r.performed_on, time: r.performed_at, setNo: r.set_no, reps: r.reps, weight: r.weight == null ? null : Number(r.weight), duration: r.duration_sec, distance: r.distance == null ? null : Number(r.distance), extra: r.extra || {}, note: r.note });
  const setOut = (s) => ({ exercise_id: s.exerciseId, performed_on: s.date, performed_at: s.time || null, set_no: s.setNo, reps: s.reps, weight: s.weight, duration_sec: s.duration, distance: s.distance, extra: s.extra || {}, note: s.note || null });
  const mIn = (r) => ({ id: r.id, key: r.key, name: r.name, unit: r.unit, agg: r.agg, step: r.step == null ? null : Number(r.step), sort: r.sort, archived: r.archived });
  const mOut = (m) => ({ key: m.key || null, name: m.name, unit: m.unit || '', agg: m.agg || 'sum', step: m.step, sort: m.sort || 0, archived: !!m.archived });

  function check(res) { if (res.error) throw new Error(res.error.message); return res.data; }
  async function all(build) {
    let out = [], from = 0;
    for (;;) {
      const rows = check(await build().range(from, from + PAGE - 1));
      out = out.concat(rows);
      if (rows.length < PAGE) return out;
      from += PAGE;
    }
  }

  return {
    kind: 'supabase',
    label: 'Supabase (synced)',

    async listExercises() { return (await all(() => sb.from('exercises').select('*').order('sort'))).map(exIn); },
    async saveExercise(ex) {
      const row = exOut(ex);
      const res = ex.id ? await sb.from('exercises').update(row).eq('id', ex.id).select().single()
                        : await sb.from('exercises').insert(row).select().single();
      return exIn(check(res));
    },
    async deleteExercise(id) { check(await sb.from('exercises').delete().eq('id', id)); return true; },

    async listSets(q) {
      q = q || {};
      const rows = await all(() => {
        let b = sb.from('sets').select('*');
        if (q.exerciseId) b = b.eq('exercise_id', q.exerciseId);
        if (q.from) b = b.gte('performed_on', q.from);
        if (q.to) b = b.lte('performed_on', q.to);
        return b.order('performed_on').order('set_no');
      });
      return rows.map(setIn);
    },
    async lastSet(exerciseId) {
      const rows = check(await sb.from('sets').select('*').eq('exercise_id', exerciseId)
        .order('performed_on', { ascending: false }).order('set_no', { ascending: false }).limit(1));
      return rows[0] ? setIn(rows[0]) : null;
    },
    async addSet(s) { return setIn(check(await sb.from('sets').insert(setOut(s)).select().single())); },
    async updateSet(s) { return setIn(check(await sb.from('sets').update(setOut(s)).eq('id', s.id).select().single())); },
    async deleteSet(id) { check(await sb.from('sets').delete().eq('id', id)); return true; },

    async listMetrics() { return (await all(() => sb.from('daily_metrics').select('*').order('sort'))).map(mIn); },
    async saveMetric(m) {
      const res = m.id ? await sb.from('daily_metrics').update(mOut(m)).eq('id', m.id).select().single()
                       : await sb.from('daily_metrics').insert(mOut(m)).select().single();
      return mIn(check(res));
    },
    async deleteMetric(id) { check(await sb.from('daily_metrics').delete().eq('id', id)); return true; },
    async listDaily(q) {
      q = q || {};
      const rows = await all(() => {
        let b = sb.from('daily_entries').select('metric_id,entry_date,value');
        if (q.from) b = b.gte('entry_date', q.from);
        if (q.to) b = b.lte('entry_date', q.to);
        return b.order('entry_date');
      });
      const out = {};
      rows.forEach((r) => { (out[r.entry_date] = out[r.entry_date] || {})[r.metric_id] = Number(r.value); });
      return out;
    },
    async setDaily(date, metricId, value) {
      if (value == null) check(await sb.from('daily_entries').delete().eq('metric_id', metricId).eq('entry_date', date));
      else check(await sb.from('daily_entries').upsert({ metric_id: metricId, entry_date: date, value }, { onConflict: 'metric_id,entry_date' }));
      return true;
    },

    async getMeta(k) {
      const rows = check(await sb.from('user_prefs').select('value').eq('key', k).limit(1));
      return rows[0] ? rows[0].value : undefined;
    },
    async setMeta(k, v) { check(await sb.from('user_prefs').upsert({ key: k, value: v }, { onConflict: 'user_id,key' })); return true; },
    async bulkInsert(sets, daily, onProgress) {
      const rows = sets.map(setOut);
      for (let i = 0; i < rows.length; i += 500) {
        check(await sb.from('sets').insert(rows.slice(i, i + 500)));
        if (onProgress) onProgress(Math.min(i + 500, rows.length), rows.length);
      }
      const d = daily.map((x) => ({ metric_id: x.metricId, entry_date: x.date, value: x.value }));
      for (let i = 0; i < d.length; i += 500) check(await sb.from('daily_entries').upsert(d.slice(i, i + 500), { onConflict: 'metric_id,entry_date' }));
      return true;
    },
    async exportAll() {
      const [exercises, sets, metrics, daily] = await Promise.all([this.listExercises(), this.listSets(), this.listMetrics(), this.listDaily()]);
      return { exercises, sets, metrics, daily };
    },
    async wipe() {
      check(await sb.from('exercises').delete().not('id', 'is', null));
      check(await sb.from('daily_metrics').delete().not('id', 'is', null));
      check(await sb.from('user_prefs').delete().not('key', 'is', null));
      return true;
    },
  };
};
