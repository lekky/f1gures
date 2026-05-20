# Snippet to add to your repo's `CLAUDE.md`

Paste the block below into the existing `CLAUDE.md` at the root of the
`f1gures` repo — probably near the top, after the build-pipeline section.
Adjust the path (`design-system/`) to wherever you drop the folder.

---

```md
## Design system

The canonical design reference for f1gures lives at `design-system/`.

**Before touching any UI:**

1. Skim `design-system/TOKENS.md` — single-file reference for every token,
   component class name + role, and the drift to avoid. Loads fast.
2. For visual reference, open `design-system/index.html` in a browser —
   the same content rendered with live examples, in both themes.

**Authoring rules:**

- Never hardcode hex. Use the CSS custom properties defined in
  `public/css/app.css`. The light-mode override (`html.light`) remaps
  the same names — hardcoded values break theme parity.
- Two themes are required. Verify dark and `html.light` before merging.
- Don't introduce new card / table variants. Five card classes and two
  table classes already exist — see `design-system/audit.html` for the
  drift to avoid and the migration order.
- The records hero card pattern (`.card-accent` + `.card-bars`) is the
  "colourful and dynamic" pattern to copy for any new leaderboard
  surface (circuit all-time records, home page top-3, etc.).
- Team colour goes on a strip (3 px left), rule (2–4 px top), dot
  (8–12 px round), chip left-edge, or bar fill — never as a panel
  background. The collisions with `--accent` (Ferrari), `--pos`
  (Sauber), and Williams ↔ Racing Bulls are documented in
  `design-system/teams.html`.

When in doubt: the system favors data density, hard corners, condensed
uppercase labels, mono numerics, and `--accent` red used at most once
per screen as a signal of "now / active / leader".
```

---

## File layout after you drop it in

```
f1gures/
├── CLAUDE.md                    ← add the snippet above
├── public/
│   └── css/
│       ├── app.css              (unchanged, the source of truth)
│       └── site.css
└── design-system/               ← move the contents of system/ here
    ├── TOKENS.md                ← the AI-friendly reference
    ├── index.html               ← human-friendly overview
    ├── foundations.html
    ├── colors.html
    ├── teams.html
    ├── components.html
    ├── patterns.html
    ├── audit.html
    ├── ds.css                   ← docs-only chrome, depends on app.css
    └── ds.js
```

The HTML files reference `../public/css/app.css` and `../public/css/site.css`
with relative paths — moving them under `design-system/` at the repo root
will keep those references correct.

## Optional next steps for Claude Code

- Add `design-system/` to your repo's allowlist if you have one — Claude
  Code should always be able to read it.
- If you ever update `app.css`, regenerate `TOKENS.md` so the values stay
  in sync. (The HTML pages stay in sync automatically because they import
  `app.css` directly.)
- The audit page's PR list (1 → 5) is a ready-made backlog if you want
  Claude Code to start landing the cleanup commits.
