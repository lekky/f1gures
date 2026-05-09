// Single source of truth for the app version + CSS cache-bust query.
// Bump here on every PR that ships visible changes. Format: 'X.YYY' (zero-
// padded patch, e.g. '2.003'). Imported by Chrome.astro (chrome label) and
// BaseLayout.astro (?v=… on /css/*.css).
//
// NOTE: the legacy detail pages still in public/ — race.html, circuit.html,
// team.html — also link /css/*.css with their own hard-coded ?v= values.
// They need a matching bump until PR 2b/2c ports them to Astro routes and
// they get deleted.

export const APP_VERSION = '2.009';
