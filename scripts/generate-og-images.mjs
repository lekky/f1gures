#!/usr/bin/env node
// Build-time OG image generator. Renders one PNG per detail page using Satori
// + @resvg/resvg-js. Output: public/images/og/<type>/<slug>.png.
//
// Skip-if-exists: when a target PNG already exists on disk, the entity is
// skipped. CI restores public/images/og/ from a content-hashed cache, so
// unchanged data → 100% skip → no font fetch → near-instant build:og step.
//
// Set OG_FORCE=1 to force regenerate everything (e.g. after editing a
// template under scripts/og-templates/ locally).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { OG_WIDTH, OG_HEIGHT } from './og-templates/og-shared.mjs';
import { renderRaceOg } from './og-templates/og-race.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ARCHIVE = path.join(ROOT, 'public/data/archive');
const OUT_BASE = path.join(ROOT, 'public/images/og');
const FORCE = process.env.OG_FORCE === '1';

// Lazy font loader — only fetched if at least one entity actually needs
// rendering. When the OG cache is fully restored in CI, this is never
// called and we save the network round-trip.
let _fontPromise = null;
function getFont() {
  if (!_fontPromise) _fontPromise = loadFont();
  return _fontPromise;
}

async function loadFont() {
  const cacheDir = path.join(ROOT, 'node_modules/.cache/og-fonts');
  fs.mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, 'inter-700.ttf');
  if (!fs.existsSync(cachePath)) {
    // Use the fontsource static TTF for Inter 700 — Satori's opentype parser
    // chokes on the variable-font axes in the upstream Google Fonts file.
    // Pinned to a specific Fontsource version for reproducible builds. Bump
    // deliberately when verifying glyph metrics haven't changed.
    const ttfUrl = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@5.1.0/latin-700-normal.ttf';
    const resp = await fetch(ttfUrl);
    if (!resp.ok) throw new Error(`Failed to fetch Inter font: ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(cachePath, buf);
  }
  return fs.readFileSync(cachePath);
}

async function renderPng(tree) {
  const fontData = await getFont();
  const svg = await satori(tree, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [{ name: 'Inter', data: fontData, weight: 700, style: 'normal' }],
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } });
  return resvg.render().asPng();
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function generateRaceOgs() {
  const indexPath = path.join(ARCHIVE, '_races-index.json');
  if (!fs.existsSync(indexPath)) {
    console.warn('[og] no race index found, skipping race OGs');
    return { count: 0, skipped: 0, failed: 0 };
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const outDir = path.join(OUT_BASE, 'races');
  ensureDir(outDir);

  let count = 0;
  let skipped = 0;
  let failed = 0;
  const batchSize = 20;
  for (let i = 0; i < index.length; i += batchSize) {
    const batch = index.slice(i, i + batchSize);
    await Promise.all(batch.map(async (entry) => {
      try {
        const out = path.join(outDir, `${entry.year}-${entry.round}.png`);
        const stateFile = `${out}.state`;
        const wantState = entry.completed === false ? 'upcoming' : 'completed';

        if (!FORCE && fs.existsSync(out)) {
          if (fs.existsSync(stateFile)) {
            const have = fs.readFileSync(stateFile, 'utf8').trim();
            if (have === wantState) { skipped++; return; }
            // state mismatch — fall through to regenerate
          } else {
            // Backfill: PNG exists but no sidecar yet (pre-PR images). The cached
            // PNG was generated against the JSON's current shape; write the sidecar
            // to match wantState without regenerating. Future runs hit the cache.
            fs.writeFileSync(stateFile, wantState);
            skipped++;
            return;
          }
        }

        const racePath = path.join(ARCHIVE, 'races', String(entry.year), `${entry.round}.json`);
        if (!fs.existsSync(racePath)) return;
        const race = JSON.parse(fs.readFileSync(racePath, 'utf8'));
        const png = await renderPng(renderRaceOg(race));
        fs.writeFileSync(out, png);
        fs.writeFileSync(stateFile, wantState);
        count++;
      } catch (err) {
        failed++;
        console.warn(`[og] race ${entry.year}/${entry.round} failed: ${err.message}`);
      }
    }));
  }
  return { count, skipped, failed };
}

async function generateDriverOgs() {
  const indexPath = path.join(ARCHIVE, '_drivers-index.json');
  if (!fs.existsSync(indexPath)) {
    console.warn('[og] no driver index found, skipping driver OGs');
    return { count: 0, skipped: 0, failed: 0 };
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const outDir = path.join(OUT_BASE, 'drivers');
  ensureDir(outDir);

  const { renderDriverOg } = await import('./og-templates/og-driver.mjs');
  let count = 0;
  let skipped = 0;
  let failed = 0;
  const batchSize = 20;
  for (let i = 0; i < index.length; i += batchSize) {
    const batch = index.slice(i, i + batchSize);
    await Promise.all(batch.map(async (entry) => {
      try {
        const out = path.join(outDir, `${entry.driverRef}.png`);
        if (!FORCE && fs.existsSync(out)) { skipped++; return; }
        const driverPath = path.join(ARCHIVE, 'drivers', `${entry.driverRef}.json`);
        if (!fs.existsSync(driverPath)) return;
        const driver = JSON.parse(fs.readFileSync(driverPath, 'utf8'));
        const png = await renderPng(renderDriverOg(driver));
        fs.writeFileSync(out, png);
        count++;
      } catch (err) {
        failed++;
        console.warn(`[og] driver ${entry.driverRef} failed: ${err.message}`);
      }
    }));
  }
  return { count, skipped, failed };
}

async function generateCircuitOgs() {
  const indexPath = path.join(ARCHIVE, '_circuits-index.json');
  if (!fs.existsSync(indexPath)) return { count: 0, skipped: 0, failed: 0 };
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const outDir = path.join(OUT_BASE, 'circuits');
  ensureDir(outDir);
  const { renderCircuitOg } = await import('./og-templates/og-circuit.mjs');
  let count = 0;
  let skipped = 0;
  let failed = 0;
  for (let i = 0; i < index.length; i += 20) {
    const batch = index.slice(i, i + 20);
    await Promise.all(batch.map(async (entry) => {
      try {
        const out = path.join(outDir, `${entry.circuitRef}.png`);
        if (!FORCE && fs.existsSync(out)) { skipped++; return; }
        const p = path.join(ARCHIVE, 'circuits', `${entry.circuitRef}.json`);
        if (!fs.existsSync(p)) return;
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        const png = await renderPng(renderCircuitOg(data));
        fs.writeFileSync(out, png);
        count++;
      } catch (err) {
        failed++;
        console.warn(`[og] circuit ${entry.circuitRef} failed: ${err.message}`);
      }
    }));
  }
  return { count, skipped, failed };
}

async function generateTeamOgs() {
  const indexPath = path.join(ARCHIVE, '_teams-index.json');
  if (!fs.existsSync(indexPath)) return { count: 0, skipped: 0, failed: 0 };
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const outDir = path.join(OUT_BASE, 'teams');
  ensureDir(outDir);
  const { renderTeamOg } = await import('./og-templates/og-team.mjs');
  let count = 0;
  let skipped = 0;
  let failed = 0;
  for (let i = 0; i < index.length; i += 20) {
    const batch = index.slice(i, i + 20);
    await Promise.all(batch.map(async (entry) => {
      try {
        const out = path.join(outDir, `${entry.constructorRef}.png`);
        if (!FORCE && fs.existsSync(out)) { skipped++; return; }
        const p = path.join(ARCHIVE, 'teams', `${entry.constructorRef}.json`);
        if (!fs.existsSync(p)) return;
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        const png = await renderPng(renderTeamOg(data));
        fs.writeFileSync(out, png);
        count++;
      } catch (err) {
        failed++;
        console.warn(`[og] team ${entry.constructorRef} failed: ${err.message}`);
      }
    }));
  }
  return { count, skipped, failed };
}

function summarise(label, r) {
  const parts = [`generated ${r.count}`];
  if (r.skipped > 0) parts.push(`${r.skipped} cached`);
  if (r.failed > 0) parts.push(`${r.failed} failed`);
  console.log(`[og] ${label}: ${parts.join(', ')}`);
}

async function main() {
  console.log(`[og] starting OG image generation${FORCE ? ' (forced)' : ''}`);
  ensureDir(OUT_BASE);

  summarise('races', await generateRaceOgs());
  summarise('drivers', await generateDriverOgs());
  summarise('circuits', await generateCircuitOgs());
  summarise('teams', await generateTeamOgs());
}

main().catch(err => {
  console.error('[og] failed:', err);
  process.exit(1);
});
