# f1gures

Plain HTML/CSS/JSX multi-page F1 stats app. No build step — files are served directly. React is loaded via CDN; JSX is compiled at runtime.

## Key files
- `js/shell.jsx` — shared Chrome (nav, mobile bar, bot nav), theme/year hooks, reusable components
- `css/app.css` — design tokens (CSS vars) and global styles
- `css/site.css` — deployment-specific overrides, responsive breakpoints
- `js/screens/` — per-page screen components
- `*.html` — one HTML file per page, each loads shell + screen
- `js/data.js` — static fallback data; sets `window.F1_DATA` synchronously at load
- `js/api.js` — loads `data/<year>.json` for past seasons, Jolpica API for current; **replaces** `window.F1_DATA` and resolves `window.F1_READY`
- `data/<year>.json` — pre-fetched season bundles; preferred over the API when present

## Conventions
- **Versioning**: increment `APP_VERSION` in `js/shell.jsx` for every new branch. Format: `1.NNN` (e.g. `1.006`). Also update `?v=X.XXX` in all `*.html` CSS `<link>` tags to match — this busts the browser cache on deploy.
- **Never capture `window.F1_DATA` at module scope** — Babel evaluates module-level code before the async data load resolves, so you get the static fallback instead of live/historic data. Always read `window.F1_DATA` inside the component body.
- **Branch naming**: `fix/`, `feat/`, `chore/` prefixes
- **No build step**: edits to `.jsx`/`.css` are live immediately via the dev server (`node serve.js`, port 8080)
- **Dark mode tokens**: `:root` holds dark defaults; `html.light` overrides for light mode. Keep surface steps visibly distinct — `--bg-2` must contrast against `--bg-1`.

## Dev server
```
node serve.js
```
Serves from repo root on http://localhost:8080/

The user works across two machines: one has Node installed, one doesn't. If `node` isn't on PATH, fall back to the PowerShell static server: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .claude\serve.ps1 -Port 8080`. Same root, same port, same behavior — fine for previews.

## Adding a historic season
```
node scripts/fetch-season.mjs 2024
```
Writes `data/2024.json`. Once committed, `api.js` will load it instead of hitting the network for that year. Requires Node 18+.

## Deploy
FTP via GitHub Actions on push to `main`. No manual steps — merge the PR and the site updates automatically.

## Useful URL flags
- `?year=YYYY` — load a specific season (e.g. `index.html?year=2019`)
- `?offline=1` — skip API fetch entirely, use only static fallback data (useful for debugging)
