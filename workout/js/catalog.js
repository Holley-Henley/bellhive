/* What can be tracked, the starter exercises, and how sets are summarized. */
window.WL = window.WL || {};

WL.catalog = (function () {
  const u = WL.u;

  /* Built-in fields an exercise can track. Custom fields (any number, any unit)
     are added per exercise and stored in set.extra. */
  const FIELDS = {
    reps:     { label: 'Reps',     unit: '',   kind: 'int',      step: 1 },
    weight:   { label: 'Weight',   unit: 'lb', kind: 'num',      step: 5 },
    duration: { label: 'Time',     unit: '',   kind: 'duration', step: 15 },
    distance: { label: 'Distance', unit: 'mi', kind: 'num',      step: 0.1 },
  };
  const FIELD_ORDER = ['reps', 'weight', 'duration', 'distance'];

  const CATEGORIES = {
    weights:    { label: 'Weights',    fields: ['reps', 'weight'] },
    bodyweight: { label: 'Bodyweight', fields: ['reps'] },
    timed:      { label: 'Timed hold', fields: ['duration'] },
    cardio:     { label: 'Cardio',     fields: ['duration', 'distance'] },
    other:      { label: 'Other',      fields: ['reps'] },
  };

  /* Starter set, matching the rows of the old spreadsheet. `key` links imported history. */
  const DEFAULT_EXERCISES = [
    { key: 'bench',    name: 'Bench Press', category: 'weights',    fields: ['reps', 'weight'],       target: { sets: 7, reps: 10, weight: 135 } },
    { key: 'pushups',  name: 'Push-ups',    category: 'bodyweight', fields: ['reps'],                 target: { sets: 7, reps: 12 } },
    { key: 'curls',    name: 'Curls',       category: 'weights',    fields: ['reps', 'weight'],       target: { sets: 7, reps: 10, weight: 80 } },
    { key: 'plank',    name: 'Plank',       category: 'timed',      fields: ['duration'],             target: { sets: 7, duration: 120 } },
    { key: 'legpress', name: 'Leg Press',   category: 'weights',    fields: ['reps', 'weight'],       target: { sets: 7, reps: 10 } },
    { key: 'bike',     name: 'Bike',        category: 'cardio',     fields: ['duration', 'distance'], target: { sets: 1, duration: 1560, distance: 4.25 } },
    { key: 'hike',     name: 'Hike',        category: 'cardio',     fields: ['duration', 'distance'], target: { sets: 1, distance: 2 } },
    { key: 'chop',     name: 'Chop Wood',   category: 'cardio',     fields: ['duration'],             target: { sets: 1, duration: 1800 } },
  ];

  const DEFAULT_METRICS = [
    { key: 'body_weight', name: 'Body weight', unit: 'lb', agg: 'avg', step: 0.2 },
    { key: 'beers',       name: 'Beers',       unit: '',   agg: 'sum', step: 1 },
  ];

  function fieldsOf(ex) {
    const f = FIELD_ORDER.filter((k) => (ex.fields || []).includes(k)).map((k) => Object.assign({ key: k, builtin: true }, FIELDS[k]));
    (ex.custom || []).forEach((c) => f.push({ key: c.key, label: c.label, unit: c.unit || '', kind: 'num', step: c.step || 1, builtin: false }));
    return f;
  }
  function valueOf(set, key) { return FIELDS[key] ? set[key] : (set.extra || {})[key]; }

  /* "10 @ 135", "12", "2:00", "26:00 · 4.28 mi" */
  function setLabel(ex, s) {
    const f = ex.fields || [];
    const parts = [];
    let main = '';
    if (f.includes('reps') && s.reps != null) main = String(s.reps);
    if (f.includes('weight') && s.weight != null) main += (main ? ' @ ' : '@ ') + u.fmtNum(s.weight);
    if (main) parts.push(main);
    if (f.includes('duration') && s.duration != null) parts.push(u.fmtDuration(s.duration));
    if (f.includes('distance') && s.distance != null) parts.push(u.fmtNum(s.distance, 2) + ' mi');
    (ex.custom || []).forEach((c) => {
      const v = (s.extra || {})[c.key];
      if (v != null) parts.push(u.fmtNum(v, 2) + ' ' + (c.unit || c.label.toLowerCase()));
    });
    return parts.join(' · ') || '—';
  }
  /* Groups repeated identical sets: "3×10 @ 115, 4×10 @ 135" */
  function summarize(ex, sets) {
    if (!sets.length) return '';
    const out = [];
    sets.forEach((s) => {
      const l = setLabel(ex, s);
      const last = out[out.length - 1];
      if (last && last.l === l) last.n++; else out.push({ l, n: 1 });
    });
    return out.map((g) => (g.n > 1 ? g.n + '×' + g.l : g.l)).join(', ');
  }
  function targetLabel(ex) {
    const t = ex.target || {};
    const f = ex.fields || [];
    const bits = [];
    let one = '';
    if (f.includes('reps') && t.reps) one = String(t.reps);
    if (f.includes('weight') && t.weight) one += (one ? ' @ ' : '@ ') + t.weight + ' lb';
    if (f.includes('duration') && t.duration) one += (one ? ' · ' : '') + u.fmtDuration(t.duration);
    if (f.includes('distance') && t.distance) one += (one ? ' · ' : '') + t.distance + ' mi';
    if (t.sets && t.sets > 1) bits.push(t.sets + ' sets');
    if (one) bits.push(one);
    return bits.join(' × ') || 'No target set';
  }

  /* Weekly stats available for an exercise, used by Week totals and Progress charts */
  function statsFor(ex) {
    const f = ex.fields || [];
    const st = [{ key: 'sets', label: 'Sets', unit: '', calc: (ss) => ss.length }];
    if (f.includes('reps')) st.push({ key: 'reps', label: 'Total reps', unit: '', calc: (ss) => ss.reduce((a, s) => a + (s.reps || 0), 0) });
    if (f.includes('weight')) {
      st.push({ key: 'top', label: 'Top weight', unit: 'lb', agg: 'max', calc: (ss) => ss.reduce((a, s) => Math.max(a, s.weight || 0), 0) || null });
      if (f.includes('reps')) st.push({ key: 'volume', label: 'Volume', unit: 'lb', calc: (ss) => ss.reduce((a, s) => a + (s.reps || 0) * (s.weight || 0), 0) });
    }
    if (f.includes('duration')) st.push({ key: 'minutes', label: 'Minutes', unit: 'min', calc: (ss) => Math.round(ss.reduce((a, s) => a + (s.duration || 0), 0) / 6) / 10 });
    if (f.includes('distance')) st.push({ key: 'miles', label: 'Miles', unit: 'mi', calc: (ss) => Math.round(ss.reduce((a, s) => a + (s.distance || 0), 0) * 100) / 100 });
    (ex.custom || []).forEach((c) => st.push({ key: c.key, label: c.label + ' (total)', unit: c.unit || '', calc: (ss) => ss.reduce((a, s) => a + ((s.extra || {})[c.key] || 0), 0) }));
    return st;
  }
  /* The headline weekly number shown in the Week view */
  function headline(ex) {
    const st = statsFor(ex);
    return st.find((s) => s.key === 'volume') || st.find((s) => s.key === 'miles') || st.find((s) => s.key === 'reps') || st.find((s) => s.key === 'minutes') || st[0];
  }

  return { FIELDS, FIELD_ORDER, CATEGORIES, DEFAULT_EXERCISES, DEFAULT_METRICS, fieldsOf, valueOf, setLabel, summarize, targetLabel, statsFor, headline };
})();
