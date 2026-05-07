# f1gures

Plain HTML/CSS/JSX multi-page F1 stats app. No build step — files are served directly. React is loaded via CDN; JSX is compiled at runtime.

For higher-level docs (per-page features, the API/cache/static decision tree, retry behaviour, live driver-career fetch path) see [docs/](docs/README.md). Update those alongside any change to the data flow.

## Key files
- `js/shell.jsx` — shared Chrome (nav, mobile bar, bot nav), theme/year hooks, reusable components
- `css/app.css` — design tokens (CSS vars) and global styles
- `css/site.css` — deployment-specific overrides, responsive breakpoints
- `js/screens/` — per-page screen components
- `*.html` — one HTML file per page, each loads shell + screen
- `js/data.js` — static fallback data; sets `window.F1_DATA` synchronously at load
- `js/api.js` — loads `data/<year>.json` for past seasons, Jolpica API for current; **replaces** `window.F1_DATA` and resolves `window.F1_READY`
- `data/<year>.json` — pre-fetched season bundles; preferred over the API when present
- `data/careers/<jolpicaId>.json` — pre-fetched driver career totals; refreshed nightly by GitHub Actions (`scripts/fetch-careers.mjs` + `.github/workflows/refresh-careers.yml`). The driver page tries these first and only falls back to live Jolpica on miss.
- `images/drivers/<jolpicaId>.webp` — driver headshots used by `DriverSilhouette` in `shell.jsx`. SVG silhouette renders for any driver without a photo.
- `images/circuits/{black-outline,white-outline}/<circuitId>.svg` — track maps; CSS picks the variant by theme (`html.light` → black-outline). Source: julesr0y/f1-circuits-svg.

## Conventions
- **Versioning**: increment `APP_VERSION` in `js/shell.jsx` for every new branch. Format: `1.NNN` (e.g. `1.006`). Also update `?v=X.XXX` in all `*.html` CSS `<link>` tags to match — this busts the browser cache on deploy.
- **Never capture `window.F1_DATA` at module scope** — Babel evaluates module-level code before the async data load resolves, so you get the static fallback instead of live/historic data. Always read `window.F1_DATA` inside the component body.
- **Branch naming**: `fix/`, `feat/`, `chore/` prefixes
- **No build step**: edits to `.jsx`/`.css` are live immediately via the dev server (`node serve.js`, port 8080)
- **Dark mode tokens**: `:root` holds dark defaults; `html.light` overrides for light mode. Keep surface steps visibly distinct — `--bg-2` must contrast against `--bg-1`.
- **Buy Me a Coffee widget**: every `*.html` ends with the BMC `<script>` tag (data-id `f1gures`). Restyled in `css/app.css` (`#bmc-wbtn` overrides) from a 64×64 circle into a rectangular `[☕ icon] SUPPORT` CTA. Don't `display: none` the FAB — BMC's modal won't open if you do.

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

## Refreshing driver career stats
```
node scripts/fetch-careers.mjs
```
Writes/updates `data/careers/<jolpicaId>.json`. Runs nightly via GitHub Actions; trigger manually with `gh workflow run refresh-careers.yml` or this command locally. Polite with Jolpica's rate limit (sequential drivers, retries on 429/503/network errors). Skips writes when stats are unchanged.

## Deploy
FTP via GitHub Actions on push to `main`. No manual steps — merge the PR and the site updates automatically.

## Useful URL flags
- `?year=YYYY` — load a specific season (e.g. `index.html?year=2019`)
- `?offline=1` — skip API fetch entirely, use only static fallback data (useful for debugging)
