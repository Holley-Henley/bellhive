/* Who is using the workout log.
 * Supabase mode: the bellhive99.com site login (../auth/auth.js) - nothing to sign in to here;
 *                if nobody is signed in we go to the site login and come straight back.
 * Local mode:    a simple "who's working out?" picker for offline demos. */
window.WL = window.WL || {};

WL.auth = (function () {
  const u = WL.u, h = u.h;
  let user = null;
  const siteMode = () => WL.CONFIG.backend === 'supabase';

  async function init() {
    if (siteMode()) {
      if (!window.BH) throw new Error('The site login (../auth/auth.js) did not load.');
      await BH.init();
      if (!BH.user || (BH.profile && BH.profile.must_change_password)) return BH.requireLogin();
      user = { id: BH.user.id, email: BH.user.email, name: BH.displayName() };
      if (BH.track) BH.track('workout');
      return user;
    }
    const id = u.ls.get('wl:currentProfile', null);
    user = profiles().find((p) => p.id === id) || null;
    return user;
  }
  function profiles() { return u.ls.get('wl:profiles', [{ id: 'chris', name: 'Chris' }, { id: 'kim', name: 'Kim' }]); }

  async function signOut() {
    if (siteMode()) { await BH.signOut(); location.href = WL.CONFIG.siteHome; return; }
    u.ls.del('wl:currentProfile');
    user = null;
    location.hash = ''; location.reload();
  }

  /* Local-mode profile picker. Resolves with the chosen profile. */
  function screen(root) {
    return new Promise((resolve) => {
      root.innerHTML = '';
      const card = h('div.login-card',
        h('a.brand-home', { href: WL.CONFIG.siteHome }, 'bellhive99'),
        h('h1.login-title', 'Workout Log'),
        h('p.login-sub', "Who's working out?"));
      root.appendChild(h('div.login', card));
      const list = h('div.profile-list');
      const draw = () => {
        list.innerHTML = '';
        profiles().forEach((p) => list.appendChild(h('button.profile', {
          onclick: () => { u.ls.set('wl:currentProfile', p.id); user = p; resolve(p); },
        }, h('span.avatar', p.name.slice(0, 1).toUpperCase()), h('span', p.name))));
        const input = h('input', { placeholder: 'Name', maxLength: 30 });
        const addForm = h('form.profile-add-form', {
          hidden: true,
          onsubmit: (e) => {
            e.preventDefault();
            const name = input.value.trim();
            if (!name) return;
            const all = profiles();
            all.push({ id: u.slug(name) + '-' + Date.now().toString(36), name });
            u.ls.set('wl:profiles', all); draw();
          },
        }, input, h('button.btn.primary', { type: 'submit' }, 'Add'));
        list.appendChild(h('button.profile.add', {
          onclick: (e) => { e.currentTarget.hidden = true; addForm.hidden = false; input.focus(); },
        }, h('span.avatar', '+'), h('span', 'Add person')));
        list.appendChild(addForm);
      };
      draw();
      card.appendChild(list);
      card.appendChild(h('p.login-note', 'Offline demo: logs are saved in this browser only.'));
    });
  }

  return { init, screen, signOut, current: () => user, client: () => (window.BH ? BH.sb : null) };
})();
