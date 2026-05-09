#!/usr/bin/env node
// Build-time OG image generator. Renders one PNG per detail page using Satori
// + @resvg/resvg-js. Output: public/images/og/<type>/<slug>.png.

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

// Load Inter font from Google Fonts. Cached in node_modules/.cache so we
// only fetch once per install.
async function loadFont() {
  const cacheDir = path.join(ROOT, 'node_modules/.cache/og-fonts');
  fs.mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, 'inter-700.ttf');
  if (!fs.existsSync(cachePath)) {
    // Use the fontsource static TTF for Inter 700 — Satori's opentype parser
    // chokes on the variable-font axes in the upstream Google Fonts file.
    const ttfUrl = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf';
    const resp = await fetch(ttfUrl);
    if (!resp.ok) throw new Error(`Failed to fetch Inter font: ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(cachePath, buf);
  }
  return fs.readFileSync(cachePath);
}

async function renderPng(tree, fontData) {
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

async function generateRaceOgs(fontData) {
  const indexPath = path.join(ARCHIVE, '_races-index.json');
  if (!fs.existsSync(indexPath)) {
    console.warn('[og] no race index found, skipping race OGs');
    return 0;
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const outDir = path.join(OUT_BASE, 'races');
  ensureDir(outDir);

  let count = 0;
  const batchSize = 20;
  for (let i = 0; i < index.length; i += batchSize) {
    const batch = index.slice(i, i + batchSize);
    await Promise.all(batch.map(async (entry) => {
      const racePath = path.join(ARCHIVE, 'races', String(entry.year), `${entry.round}.json`);
      if (!fs.existsSync(racePath)) return;
      const race = JSON.parse(fs.readFileSync(racePath, 'utf8'));
      const png = await renderPng(renderRaceOg(race), fontData);
      const out = path.join(outDir, `${entry.year}-${entry.round}.png`);
      fs.writeFileSync(out, png);
      count++;
    }));
  }
  return count;
}

async function generateDriverOgs(fontData) {
  const indexPath = path.join(ARCHIVE, '_drivers-index.json');
  if (!fs.existsSync(indexPath)) {
    console.warn('[og] no driver index found, skipping driver OGs');
    return 0;
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const outDir = path.join(OUT_BASE, 'drivers');
  ensureDir(outDir);

  const { renderDriverOg } = await import('./og-templates/og-driver.mjs');
  let count = 0;
  const batchSize = 20;
  for (let i = 0; i < index.length; i += batchSize) {
    const batch = index.slice(i, i + batchSize);
    await Promise.all(batch.map(async (entry) => {
      const driverPath = path.join(ARCHIVE, 'drivers', `${entry.driverRef}.json`);
      if (!fs.existsSync(driverPath)) return;
      const driver = JSON.parse(fs.readFileSync(driverPath, 'utf8'));
      const png = await renderPng(renderDriverOg(driver), fontData);
      const out = path.join(outDir, `${entry.driverRef}.png`);
      fs.writeFileSync(out, png);
      count++;
    }));
  }
  return count;
}

async function generateCircuitOgs(fontData) {
  const indexPath = path.join(ARCHIVE, '_circuits-index.json');
  if (!fs.existsSync(indexPath)) return 0;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const outDir = path.join(OUT_BASE, 'circuits');
  ensureDir(outDir);
  const { renderCircuitOg } = await import('./og-templates/og-circuit.mjs');
  let count = 0;
  for (let i = 0; i < index.length; i += 20) {
    const batch = index.slice(i, i + 20);
    await Promise.all(batch.map(async (entry) => {
      const p = path.join(ARCHIVE, 'circuits', `${entry.circuitRef}.json`);
      if (!fs.existsSync(p)) return;
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      const png = await renderPng(renderCircuitOg(data), fontData);
      fs.writeFileSync(path.join(outDir, `${entry.circuitRef}.png`), png);
      count++;
    }));
  }
  return count;
}

async function generateTeamOgs(fontData) {
  const indexPath = path.join(ARCHIVE, '_teams-index.json');
  if (!fs.existsSync(indexPath)) return 0;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const outDir = path.join(OUT_BASE, 'teams');
  ensureDir(outDir);
  const { renderTeamOg } = await import('./og-templates/og-team.mjs');
  let count = 0;
  for (let i = 0; i < index.length; i += 20) {
    const batch = index.slice(i, i + 20);
    await Promise.all(batch.map(async (entry) => {
      const p = path.join(ARCHIVE, 'teams', `${entry.constructorRef}.json`);
      if (!fs.existsSync(p)) return;
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      const png = await renderPng(renderTeamOg(data), fontData);
      fs.writeFileSync(path.join(outDir, `${entry.constructorRef}.png`), png);
      count++;
    }));
  }
  return count;
}

async function main() {
  console.log('[og] starting OG image generation');
  const fontData = await loadFont();
  ensureDir(OUT_BASE);

  const races = await generateRaceOgs(fontData);
  console.log(`[og] generated ${races} race OG images`);

  const drivers = await generateDriverOgs(fontData);
  console.log(`[og] generated ${drivers} driver OG images`);

  const circuits = await generateCircuitOgs(fontData);
  console.log(`[og] generated ${circuits} circuit OG images`);

  const teams = await generateTeamOgs(fontData);
  console.log(`[og] generated ${teams} team OG images`);
}

main().catch(err => {
  console.error('[og] failed:', err);
  process.exit(1);
});
