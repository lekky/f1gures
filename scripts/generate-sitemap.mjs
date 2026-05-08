// Generate sitemap.xml from the bundled F1 data.
// Usage: node scripts/generate-sitemap.mjs
//
// Reads js/data.js as text (it's an IIFE that assigns window.F1_DATA, not a
// module), extracts the driver/circuit/team/calendar lists with light regex
// parsing, and writes a sitemap covering all crawlable URLs (static pages plus
// every ?id=/?round= variant). Re-run after adding a driver, circuit or round.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const ORIGIN = 'https://f1gures.app';

const dataSrc = fs.readFileSync(path.join(root, 'js/data.js'), 'utf8');

// Pull `id: '...'` values out of the drivers, teams and calendar literal arrays
// and the keys of the circuits object. Lightweight but good enough for a file
// the human author controls.
function pickIds(srcSection) {
  return [...srcSection.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
}
function sliceBetween(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) return '';
  const j = src.indexOf(endMarker, i);
  return src.slice(i, j < 0 ? src.length : j);
}

const driversBlock = sliceBetween(dataSrc, 'const drivers = [', '];');
const teamsBlock   = sliceBetween(dataSrc, 'const teams = [',   '];');
const calBlock     = sliceBetween(dataSrc, 'const calendar = [', '];');

const drivers = pickIds(driversBlock);
const teams   = pickIds(teamsBlock);
const rounds  = [...calBlock.matchAll(/round:\s*(\d+)/g)].map(m => Number(m[1]));

const circuitsBlock = sliceBetween(dataSrc, 'const circuits = {', '\n  };');
const circuits = [...circuitsBlock.matchAll(/^\s{4}([a-z][a-z0-9]*):\s*\{/gm)].map(m => m[1]);

if (!drivers.length || !circuits.length || !rounds.length) {
  console.error('Parse failed:', { drivers: drivers.length, circuits: circuits.length, rounds: rounds.length, teams: teams.length });
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const urls = [];
const push = (loc, priority, changefreq) => urls.push({ loc, priority, changefreq, lastmod: today });

push(`${ORIGIN}/`,                              '1.0', 'daily');
push(`${ORIGIN}/standings-drivers.html`,        '0.9', 'daily');
push(`${ORIGIN}/standings-constructors.html`,   '0.9', 'daily');
push(`${ORIGIN}/calendar.html`,                 '0.8', 'weekly');
push(`${ORIGIN}/circuits.html`,                 '0.7', 'monthly');

for (const id of drivers) push(`${ORIGIN}/driver.html?id=${encodeURIComponent(id)}`, '0.7', 'weekly');
for (const id of teams)   push(`${ORIGIN}/team.html?id=${encodeURIComponent(id)}`,   '0.6', 'weekly');
for (const id of circuits) push(`${ORIGIN}/circuit.html?id=${encodeURIComponent(id)}`, '0.6', 'monthly');
for (const r  of rounds)  push(`${ORIGIN}/race.html?round=${r}`,                     '0.7', 'weekly');

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map(u =>
    `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
  ),
  '</urlset>',
  ''
].join('\n');

fs.writeFileSync(path.join(root, 'sitemap.xml'), xml);
console.log(`Wrote sitemap.xml — ${urls.length} URLs (${drivers.length} drivers, ${teams.length} teams, ${circuits.length} circuits, ${rounds.length} races).`);
