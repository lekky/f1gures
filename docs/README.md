# f1gures docs

Reference docs for the project. Code-level conventions live in [CLAUDE.md](../CLAUDE.md); this folder is for higher-level "what does the app do and how does data flow through it" notes.

- [features.md](features.md) - every route, what it renders, and which parts are React islands vs static Astro
- [data-flow.md](data-flow.md) - the build-time pipeline (CSV archive, season bundles, weather, app feed) and the few client-side fetches
- [app-data-feed.md](app-data-feed.md) - the versioned JSON contract the native mobile apps consume - **read before touching `scripts/build-app-feed.mjs`**
- [fastf1-pipeline.md](fastf1-pipeline.md) - the FastF1 weekend pipeline + the race pages' Weekend Analysis / Visualisation Explorer - **read before touching `scripts/fetch-fastf1.py` or the raceweekend island**
- [tech-debt.md](tech-debt.md) - the verified tech-debt / refactoring register, ranked, with reasons
- [seo/strategy.md](seo/strategy.md) - off-page SEO playbook (Search Console, link building)
- `superpowers/` - historical plans/specs from past feature work (point-in-time documents, not kept current)

If something here goes stale, update it as part of the same PR that changes the behaviour. These docs are short on purpose so that's cheap.
