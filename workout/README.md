# Workout Log (proof of concept)

A phone-first workout logger for bellhive99.com. Each signed-in person keeps their own log.

**Open it:** double-click `index.html`, or visit `bellhive99.com/workout/` once it's pushed.
Sign in on the bellhive99 home page. Each account keeps its own log.

## Screens
- **Log**: tap an exercise, then tap **Log set**. It fills in last time's numbers and stamps the time. There are also daily trackers (body weight, beers).
- **Week**: exercises × Mon–Sun with weekly totals, like the old spreadsheet. Tap any cell to log that day.
- **Progress**: weekly charts per exercise (sets, reps, top weight, volume, minutes, miles) plus the daily trackers.
- **Setup**: add or edit exercises: what to track (reps / weight / time / distance plus any custom number), and target sets and reps. Also daily trackers, the spreadsheet import, backup and erase.

## Files
| Path | What it does |
|---|---|
| `index.html` | Page shell; loads the modules below in order |
| `css/workout.css` | All styling |
| `js/config.js` | Backend switch (`supabase` = site login, `local` = offline demo) |
| `js/util.js` | Date helpers, formatting, small DOM builder |
| `js/catalog.js` | Trackable fields, starter exercises, set summaries, weekly stats |
| `js/auth.js` | Gets the signed-in user from the site login (or a profile picker in local mode) |
| `js/store/local.js` | Browser-storage backend |
| `js/store/supabase.js` | Supabase backend (same interface) |
| `js/store/index.js` | Picks the backend, seeds starter exercises, reads and imports the history file |
| `js/chart.js` | SVG bar/line charts with hover tooltips and table view |
| `js/views/*.js` | One file per screen: log, week, progress, setup |
| `sql/schema.sql` | Supabase tables and row-level security |

## Sign-in and Supabase
The workout log uses the **site login** (`../index.html`, `../auth/`), not a login of its own.
Supabase settings are in `../auth/config.js`. If nobody is signed in, the page sends you to the site login and brings you back afterward.
Set `backend: 'local'` in `js/config.js` for an offline demo with no sign-in.

Database setup: run `../supabase/site-schema.sql`, then `sql/schema.sql`, in the Supabase SQL editor.

## Spreadsheet history
The old WorkOutSchedule sheet was converted to `workout-history-2024-2026.json` (1,876 sets, Feb 2024 – Apr 2026).
It's kept on your computer, **not** on the website, so it can't be downloaded publicly. Import it from Setup → Import spreadsheet history.
