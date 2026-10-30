/* Workout Logger - configuration
 *
 * backend: 'supabase' -> uses the bellhive99.com site login (../auth/) and the site's
 *                        Supabase project (../auth/config.js); one log per signed-in user.
 *          'local'    -> offline demo: data stays in this browser, no sign-in.
 */
window.WL = window.WL || {};

WL.CONFIG = {
  backend: 'supabase',
  weekStartsOn: 1,              // 1 = Monday, matching the old spreadsheet
  siteHome: '../index.html',    // bellhive99.com home (and login)
};
