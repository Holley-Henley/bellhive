/* App shell: sign-in, navigation, hash routing, shared cached lists. */
window.WL = window.WL || {};

WL.app = (function () {
  const u = WL.u, h = u.h;
  const TABS = [
    { id: 'log', label: 'Log', icon: '<path d="M5 12h14M12 5v14"/>' },
    { id: 'week', label: 'Week', icon: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>' },
    { id: 'progress', label: 'Progress', icon: '<path d="M4 19l5-6 4 3 7-9"/><path d="M4 4v15h16"/>' },
    { id: 'setup', label: 'Setup', icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>' },
  ];
  const app = { store: null, user: null, exercises: [], metrics: [] };
  let root, main, navEl;

  app.reload = async function () {
    [app.exercises, app.metrics] = await Promise.all([app.store.listExercises(), app.store.listMetrics()]);
  };
  app.activeExercises = () => app.exercises.filter((e) => !e.archived);
  app.activeMetrics = () => app.metrics.filter((m) => !m.archived);
  app.exercise = (id) => app.exercises.find((e) => e.id === id);

  app.go = function (route) { if (location.hash === '#' + route) render(); else location.hash = route; };

  function parseHash() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return { view: parts[0] || 'log', args: parts.slice(1) };
  }

  let renderToken = 0;
  async function render() {
    const { view, args } = parseHash();
    const v = WL.views[view] || WL.views.log;
    const tab = TABS.find((t) => t.id === (WL.views[view] ? view : 'log'));
    if (window.BH && BH.pageOpen && BH.user) BH.pageOpen('Workout › ' + (tab ? tab.label : view), 'workout');
    navEl.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.view === (WL.views[view] ? view : 'log')));
    const token = ++renderToken;
    const container = h('div.view.view-' + view);
    try {
      await v.render(container, args, app);
    } catch (err) {
      console.error(err);
      container.innerHTML = '';
      container.appendChild(h('div.empty', h('strong', 'Something went wrong'), h('p', err.message)));
    }
    if (token !== renderToken) return;
    main.replaceChildren(container);
    window.scrollTo(0, 0);
  }
  app.render = render;

  async function start() {
    root = document.getElementById('app');
    try {
      app.user = await WL.auth.init();
    } catch (err) {
      root.replaceChildren(h('div.login', h('div.login-card', h('h1.login-title', 'Setup needed'), h('p', err.message))));
      return;
    }
    if (!app.user) app.user = await WL.auth.screen(root);
    root.innerHTML = '';
    root.appendChild(h('div.loading', 'Loading your log…'));
    app.store = await WL.openStore(app.user, WL.auth.client());
    await app.reload();

    navEl = h('nav.tabs', TABS.map((t) => h('a', { href: '#' + t.id, 'data-view': t.id, html: '<svg viewBox="0 0 24 24" aria-hidden="true">' + t.icon + '</svg><span>' + t.label + '</span>' })));
    const header = h('header.top',
      h('a.brand', { href: WL.CONFIG.siteHome, title: 'Back to bellhive99.com' }, h('span.brand-mark', 'b99'), h('span.brand-name', 'Workout Log')),
      navEl,
      h('div.who',
        h('span.who-name', app.user.name),
        h('button.btn.ghost.small', {
          onclick: () => WL.auth.signOut(),
        }, 'Sign out')));
    main = h('main.main');
    root.replaceChildren(header, main);
    window.addEventListener('hashchange', render);
    render();
  }

  document.addEventListener('DOMContentLoaded', start);
  return app;
})();

WL.views = WL.views || {};
