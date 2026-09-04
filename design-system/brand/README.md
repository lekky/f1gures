# Brand assets

`source/` holds the logo artwork exactly as the designer supplied it — three
flat, opaque rasters:

| file                  | size      | what it is                                     |
|-----------------------|-----------|------------------------------------------------|
| `wordmark-dark.png`   | 2172×724  | the F1GURES lockup on a black plate             |
| `wordmark-light.png`  | 2172×724  | the same lockup on a white plate                |
| `icon.png`            | 1254×1254 | the square "F1." mark on black                  |

Nothing on the site loads these. Every shipped file is derived from them by:

```
npm run build:brand      # scripts/build-brand-assets.mjs
```

which writes (and which you should re-run, rather than hand-editing, whenever
the source art changes):

```
public/images/logo/f1gures-wordmark-dark.png    791×264, transparent
public/images/logo/f1gures-wordmark-light.png   809×264, transparent
public/images/logo/icon-512.png                 maskable, full-bleed
public/images/logo/icon-192.png                 maskable, full-bleed
public/apple-touch-icon.png                     180×180, full-bleed
public/favicon.png                              256×256, rounded tile
public/favicon-32x32.png                        rounded tile, larger glyphs
public/favicon-16x16.png                        rounded tile, larger glyphs
```

Two things the script does that a resize would not:

- **Keys the plate out.** The glow around the speed streaks is a gradient into
  the plate colour, so a colour-key would leave a halo. The script treats the
  plate as the zero point of an alpha ramp and un-premultiplies against it, which
  recovers the ink colour at every alpha — the streaks then fade cleanly over any
  background, not just black or white.
- **Matches the two wordmarks' cap heights.** The two sources are cropped and
  scaled differently. Output geometry is laid out in multiples of the measured
  letter cap height, so the letters don't change size when the theme toggles.

Two files are **not** produced here and need a manual pass after a rebrand:

- `public/images/og-default.png` — the OG fallback and the JSON-LD Organization
  logo. Re-bake it through `renderPageOg` in `scripts/og-templates/og-page.mjs`.
- `docs/` and `design-system/` screenshots, if any show the old mark.

Sizing note: the lockup's streaks take about two thirds of the wordmark PNG's
height, so it has to be drawn ~1.6× taller than the plate wordmark it replaced
for the letters to read at the same size. `src/lib/brandMark.mjs` holds that
factor and the `wordmarkRect()` helper the canvas share cards use; the CSS and
the OG template carry the same factor inline.
