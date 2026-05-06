# f1gures

Plain HTML/CSS/JSX multi-page F1 stats app. No build step — files are served directly. React is loaded via CDN; JSX is compiled at runtime.

## Key files
- `js/shell.jsx` — shared Chrome (nav, mobile bar, bot nav), theme/year hooks, reusable components
- `css/app.css` — design tokens (CSS vars) and global styles
- `css/site.css` — deployment-specific overrides, responsive breakpoints
- `js/screens/` — per-page screen components
- `*.html` — one HTML file per page, each loads shell + screen

## Conventions
- **Versioning**: increment `APP_VERSION` in `js/shell.jsx` for every new branch. Format: `1.NNN` (e.g. `1.006`). Start of main is `1.005`. Also update `?v=X.XXX` in all `*.html` CSS `<link>` tags to match — this busts the browser cache on deploy.
- **Branch naming**: `fix/`, `feat/`, `chore/` prefixes
- **No build step**: edits to `.jsx`/`.css` are live immediately via the dev server (`node serve.js`, port 8080)
- **Dark mode tokens**: `:root` holds dark defaults; `html.light` overrides for light mode. Keep surface steps visibly distinct — `--bg-2` must contrast against `--bg-1`.

## Dev server
```
node serve.js
```
Serves from repo root on http://localhost:8080/
