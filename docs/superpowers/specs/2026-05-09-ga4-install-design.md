# GA4 install

**Status:** approved 2026-05-09
**Scope:** [src/layouts/BaseLayout.astro](../../../src/layouts/BaseLayout.astro) only.

## Problem

No analytics on the site. We want a basic visitor count and page-view distribution without engineering effort or a consent banner.

## Solution

Drop the standard `gtag.js` snippet into `BaseLayout.astro`'s `<head>`, gated by `import.meta.env.PROD` so dev runs don't pollute the data. No consent banner, no Consent Mode wiring - the site has no logins, no user-identifying data, and no ads. Upgrade later if needed.

## Implementation

In `src/layouts/BaseLayout.astro`, after the pre-hydration `is:inline` scripts (theme + year guard) and before `</head>`, add:

```astro
{import.meta.env.PROD && (
  <>
    <script is:inline async src="https://www.googletagmanager.com/gtag/js?id=G-17WG173FST"></script>
    <script is:inline>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-17WG173FST');
    </script>
  </>
)}
```

**Why these decisions:**

- **`is:inline`** - Astro bundles inline `<script>` blocks by default. The GA snippet must execute as-is in `<head>`, not be hoisted into a bundled module that loads after parsing. `is:inline` opts out, matching the pattern used for the existing theme + year-guard scripts.
- **`import.meta.env.PROD`** - Vite evaluates this at build time. The astro build inside `deploy.yml` runs with `PROD=true`; `npm run dev` runs with `PROD=false`. Build-time gate, no runtime branch in the shipped HTML.
- **Placement after pre-hydration scripts** - the theme and year-guard scripts must run synchronously before paint. GA is `async` and order-independent, so it sits after them.
- **Hardcoded measurement ID** - single property, no second site or environment to switch between. A `.env` indirection would just be ceremony.

## Out of scope

- Consent banner / Consent Mode v2 wiring.
- Custom event tracking (clicks, scroll depth, year-picker changes, timezone toggle, etc.). GA4's enhanced measurement covers the basics automatically.
- A separate GA property for staging - there is no staging.
- IP anonymisation flag - GA4 anonymises IPs by default; the `anonymize_ip` parameter is a no-op carried over from UA.

## Verification

1. `npm run dev` - `view-source:http://localhost:4321/` should NOT contain `googletagmanager.com`.
2. `npm run build && npm run preview` - `view-source:http://localhost:4173/` SHOULD contain the two `<script>` blocks with `G-17WG173FST`.
3. After deploy, load `https://f1gures.app/` with devtools Network tab open - confirm a request to `googletagmanager.com/gtag/js?id=G-17WG173FST` and a `collect` beacon to `google-analytics.com/g/collect`.
4. GA4 realtime view shows the visit within ~30 seconds.

## Edge cases

- **Ad blockers** - uBlock/Brave/etc. block the gtag.js request. Expected and unavoidable; GA underreports accordingly.
- **No-JS visitors** - no analytics signal. Acceptable.
- **The Astro `<></>` fragment** - required because Astro's expression-mode template wants a single root inside `{...}`. Two sibling `<script>` tags need wrapping.
