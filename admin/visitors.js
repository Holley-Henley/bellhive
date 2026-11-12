/* bellhive99.com - ADMIN > Visitors: where people landing on the site are coming from.
 * Locations are approximate (city level, from the visitor's internet address). */
(function () {
  const { el } = BH.ui;
  const mc = document.getElementById('mc');
  const RANGES = [['1', 'Last 24 hours', 1], ['7', 'Last 7 days', 7], ['30', 'Last 30 days', 30], ['90', 'Last 90 days', 90], ['365', 'Last 12 months', 365], ['all', 'All time', null]];
  const WHO = [['', 'Everyone'], ['anon', 'Signed-out visitors'], ['member', 'Signed-in members']];
  const PAGE_LABEL = { login: 'Sign-in page', home: 'Home', pictures: 'Pictures', workout: 'Workout', bloodpressure: 'Blood Pressure', account: 'My Account', guestbook: 'Guest Book', fileshare: 'File Share', 'vehicles-inventory': 'Inventory', 'vehicles-maintenance': 'Maintenance' };
  const state = { range: '30', who: '', bots: false };
  let all = [], names = {}, map = null, layer = null;

  const flag = (cc) => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');
  const placeOf = (v) => [v.city, v.region && v.region !== v.city ? v.region : null, v.country_code === 'US' ? null : v.country].filter(Boolean).join(', ') || v.country || 'Unknown location';
  const fmtWhen = (ts) => { const d = new Date(ts); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
  const fmt = (n) => n.toLocaleString('en-US');

  async function start() {
    try {
      const { user } = await BH.init();
      if (!user) return BH.requireLogin();
    } catch (e) { mc.replaceChildren(el('div', { class: 'bh-alert' }, e.message)); return; }
    if (!BH.isAdmin()) { mc.replaceChildren(el('div', { class: 'bh-card bh-empty' }, 'Access restricted - admins only.')); return; }
    BH.pageOpen('Admin › Visitors', 'admin');
    const { data: profs } = await BH.sb.from('profiles').select('id, full_name, email');
    (profs || []).forEach((p) => { names[p.id] = p.full_name || p.email; });
    drawFilters();
    await load();
  }

  async function load() {
    const r = RANGES.find((x) => x[0] === state.range);
    let q = BH.sb.from('site_visits').select('*').order('created_at', { ascending: false }).limit(5000);
    if (r[2]) q = q.gte('created_at', new Date(Date.now() - r[2] * 864e5).toISOString());
    const { data, error } = await q;
    if (error) {
      const missing = /site_visits/.test(error.message) && /(does not exist|schema cache|not find)/i.test(error.message);
      mc.replaceChildren(el('div', { class: 'bh-alert' }, missing ? 'The visitors table has not been created yet - run supabase/visitors.sql in the Supabase SQL Editor.' : 'Error: ' + error.message));
      return;
    }
    all = data || [];
    render();
  }

  function drawFilters() {
    const sel = (value, opts, on, label) => el('select', { 'aria-label': label, onchange: (e) => on(e.target.value) }, opts.map(([v, t]) => el('option', { value: v, selected: v === value }, t)));
    document.getElementById('vz-filters').replaceChildren(el('div', { class: 'vz-filters' },
      sel(state.range, RANGES, (v) => { state.range = v; load(); }, 'Date range'),
      sel(state.who, WHO, (v) => { state.who = v; render(); }, 'Who'),
      el('label', { class: 'vz-check' }, el('input', { type: 'checkbox', checked: state.bots, onchange: (e) => { state.bots = e.target.checked; render(); } }), 'Include bots & crawlers'),
      el('button', { class: 'bh-btn sm', type: 'button', onclick: load, style: 'margin-left:auto' }, 'Refresh')));
  }

  function filtered() {
    return all.filter((v) => (state.bots || !v.is_bot) && (!state.who || (state.who === 'member' ? v.signed_in : !v.signed_in)));
  }

  function render() {
    const list = filtered();
    const uniq = new Set(list.map((v) => v.visitor_hash || v.id)).size;
    const countries = new Set(list.map((v) => v.country).filter(Boolean)).size;
    const places = {};
    list.forEach((v) => {
      const key = v.lat != null && v.lon != null ? v.lat.toFixed(2) + ',' + v.lon.toFixed(2) : 'unknown';
      const p = places[key] || (places[key] = { key, name: placeOf(v), cc: v.country_code, lat: v.lat, lon: v.lon, visits: 0, people: new Set(), members: new Set(), last: v.created_at });
      p.visits++; p.people.add(v.visitor_hash || v.id);
      if (v.user_id) p.members.add(names[v.user_id] || 'member');
      if (v.created_at > p.last) p.last = v.created_at;
    });
    const placeList = Object.values(places).sort((a, b) => b.visits - a.visits);

    const tiles = el('div', { class: 'vz-tiles' },
      tile(fmt(list.length), 'Page views'), tile(fmt(uniq), 'Unique visitors'),
      tile(fmt(placeList.filter((p) => p.key !== 'unknown').length), 'Places'), tile(fmt(countries), countries === 1 ? 'Country' : 'Countries'));

    const mapBox = el('div', { id: 'vz-map', role: 'img', 'aria-label': 'Map of visitor locations' });
    const maxV = Math.max(1, ...placeList.map((p) => p.visits));
    const mapCard = el('div', { class: 'bh-card vz-map-card' }, mapBox,
      el('div', { class: 'vz-map-note' },
        el('span', { class: 'vz-key' }, el('i', { style: 'width:10px;height:10px' }), '1 view'),
        el('span', { class: 'vz-key' }, el('i', { style: 'width:22px;height:22px' }), fmt(maxV) + ' views'),
        el('span', null, 'Circle size = page views from that place. Locations are approximate (city level).')));

    const topTable = el('div', { class: 'bh-card' }, el('div', { class: 'vz-card-head' }, el('h2', null, 'Top places')),
      el('div', { class: 'vz-scroll' }, el('table', { class: 'vz-table' },
        el('thead', null, el('tr', null, el('th', null, 'Place'), el('th', { class: 'num' }, 'Views'), el('th', { class: 'num' }, 'Visitors'))),
        el('tbody', null, placeList.length ? placeList.slice(0, 100).map((p) => el('tr', { class: p.lat != null ? 'vz-click' : '', onclick: () => p.lat != null && map && map.flyTo([p.lat, p.lon], 8) },
          el('td', null, el('span', { class: 'vz-flag' }, flag(p.cc)), p.name, p.members.size ? el('div', { class: 'vz-small' }, [...p.members].join(', ')) : null),
          el('td', { class: 'num' }, fmt(p.visits)), el('td', { class: 'num' }, fmt(p.people.size))))
          : el('tr', null, el('td', { colSpan: 3, class: 'bh-empty' }, 'No visits in this range yet.'))))));

    const recent = el('div', { class: 'bh-card' }, el('div', { class: 'vz-card-head' }, el('h2', null, 'Recent visits')),
      el('div', { class: 'vz-scroll' }, el('table', { class: 'vz-table' },
        el('thead', null, el('tr', null, el('th', null, 'When'), el('th', null, 'Who'), el('th', null, 'Where'), el('th', null, 'Page'))),
        el('tbody', null, list.length ? list.slice(0, 200).map((v) => el('tr', null,
          el('td', { class: 'vz-when' }, fmtWhen(v.created_at)),
          el('td', null, v.signed_in ? el('span', { class: 'vz-who' }, names[v.user_id] || 'Member') : el('span', { class: 'vz-anon' }, 'Visitor'),
            v.is_bot ? el('span', { class: 'vz-bot' }, 'BOT') : null,
            el('div', { class: 'vz-small' }, [v.device, v.browser].filter(Boolean).join(' · '))),
          el('td', null, el('span', { class: 'vz-flag' }, flag(v.country_code)), placeOf(v),
            v.isp || v.referrer ? el('div', { class: 'vz-small' }, [v.isp, v.referrer ? 'from ' + v.referrer : null].filter(Boolean).join(' · ')) : null),
          el('td', null, PAGE_LABEL[v.page] || v.page)))
          : el('tr', null, el('td', { colSpan: 4, class: 'bh-empty' }, 'No visits in this range yet.'))))));

    if (map) { map.remove(); map = null; }
    mc.replaceChildren(tiles, mapCard, el('div', { class: 'vz-cols' }, topTable, recent));
    drawMap(mapBox, placeList.filter((p) => p.lat != null), maxV);
  }

  function drawMap(box, pts, maxV) {
    if (!window.L) { box.replaceChildren(el('div', { class: 'bh-empty' }, 'The map library could not load.')); return; }
    map = L.map(box, { worldCopyJump: true, scrollWheelZoom: false }).setView([30, -20], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_4ytz_1_cedcda8513a48e7d58375612', {
      maxZoom: 18, subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    pts.slice().sort((a, b) => b.visits - a.visits).forEach((p) => {
      const r = 5 + 17 * Math.sqrt(p.visits / maxV);    // area ~ visits
      L.circleMarker([p.lat, p.lon], { radius: r, color: '#c27a10', weight: 2, fillColor: '#d68a16', fillOpacity: 0.35 })
        .bindTooltip(`<b>${esc(p.name)}</b>${fmt(p.visits)} view${p.visits === 1 ? '' : 's'} · ${fmt(p.people.size)} visitor${p.people.size === 1 ? '' : 's'}${p.members.size ? '<br>' + esc([...p.members].join(', ')) : ''}`, { className: 'vz-tip', direction: 'top', offset: [0, -r] })
        .addTo(layer);
    });
    if (pts.length === 1) map.setView([pts[0].lat, pts[0].lon], 6);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lon])).pad(0.3), { maxZoom: 6 });
  }

  function tile(v, label) { return el('div', { class: 'vz-tile' }, el('b', null, v), el('span', null, label)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  start();
})();
