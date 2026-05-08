// Fetch career stats for the curated driver list and write each to
// data/careers/<jolpicaId>.json. The client (js/api.js fetchDriverCareer)
// tries the static file first and only falls back to live Jolpica on miss,
// so this gives us a free cross-user cache that refreshes nightly via
// .github/workflows/refresh-careers.yml.
//
// Usage:
//   node scripts/fetch-careers.mjs
//
// Requires Node 18+ (native fetch). Be polite with Jolpica — process
// drivers sequentially, cap inflight per driver, retry 429/503/network
// errors with exponential backoff.

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.jolpi.ca/ergast/f1';
const OUT_DIR = join(ROOT, 'public', 'data', 'careers');

// ── Driver ID source ─────────────────────────────────────────
// Union of:
//   - jolpicaIds from js/data.js (current grid)
//   - jolpicaIds from data/<year>.json bundles (recent seasons)
function collectJolpicaIds() {
  const ids = new Set();

  // Pull from src/data/buildFallback.js (the ported current-grid module)
  try {
    const dataJs = readFileSync(join(ROOT, 'src', 'data', 'buildFallback.js'), 'utf8');
    const re = /jolpicaId:\s*'([^']+)'/g;
    let m; while ((m = re.exec(dataJs))) ids.add(m[1]);
  } catch (e) {
    console.warn('  ⚠ could not read src/data/buildFallback.js:', e.message);
  }

  // Pull from each season bundle in public/data/
  const dataDir = join(ROOT, 'public', 'data');
  if (existsSync(dataDir)) {
    for (const f of readdirSync(dataDir)) {
      if (!/^\d{4}\.json$/.test(f)) continue;
      try {
        const bundle = JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
        for (const d of bundle.drivers || []) {
          if (d.jolpicaId) ids.add(d.jolpicaId);
        }
      } catch (e) {
        console.warn(`  ⚠ skipping ${f}:`, e.message);
      }
    }
  }

  return [...ids].sort();
}

// ── Concurrency gate (per-driver fan-out) ────────────────────
const MAX_INFLIGHT = 4;
let inflight = 0;
const queue = [];
function acquire() {
  if (inflight < MAX_INFLIGHT) { inflight++; return Promise.resolve(); }
  return new Promise(res => queue.push(res));
}
function release() {
  inflight--;
  if (queue.length) { inflight++; queue.shift()(); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── HTTP helper with retry on 429/503/network errors ─────────
async function get(path) {
  await acquire();
  try {
    const url = BASE + path;
    let lastErr;
    for (let attempt = 0; attempt < 6; attempt++) {
      let res;
      try {
        res = await fetch(url, { headers: { Accept: 'application/json' } });
      } catch (e) {
        lastErr = e;
        const wait = Math.min(750 * Math.pow(2, attempt), 8000);
        await sleep(wait);
        continue;
      }
      if (res.ok) return res.json();
      if (res.status === 429 || res.status === 503) {
        const ra = parseFloat(res.headers.get('Retry-After'));
        const wait = (isFinite(ra) && ra > 0) ? Math.min(ra * 1000, 15000) : Math.min(750 * Math.pow(2, attempt), 8000);
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${path}`);
    }
    throw lastErr || new Error(`exhausted retries for ${path}`);
  } finally {
    release();
  }
}

// ── Career fetch (mirrors js/api.js fetchDriverCareer) ───────
async function fetchCareer(jolpicaId) {
  const base = `/drivers/${jolpicaId}`;
  const totalOf = async (path) => {
    const j = await get(path);
    return parseInt(j.MRData.total, 10) || 0;
  };

  const [seasons, races, wins, p2, p3, poles, fl, seasonsListJson] = await Promise.all([
    totalOf(`${base}/seasons/?limit=1`),
    totalOf(`${base}/races/?limit=1`),
    totalOf(`${base}/results/1/?limit=1`),
    totalOf(`${base}/results/2/?limit=1`),
    totalOf(`${base}/results/3/?limit=1`),
    totalOf(`${base}/qualifying/1/?limit=1`),
    totalOf(`${base}/fastest/1/results/?limit=1`),
    get(`${base}/seasons/?limit=100`),
  ]);

  const years = (seasonsListJson.MRData.SeasonTable?.Seasons || []).map(s => s.season);
  const standings = await Promise.all(
    years.map(y => get(`/${y}/drivers/${jolpicaId}/driverstandings/?limit=1`).catch(() => null))
  );
  let champs = 0;
  for (const s of standings) {
    const ds = s?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings?.[0];
    if (ds?.position === '1') champs++;
  }

  return { seasons, races, wins, podiums: wins + p2 + p3, poles, fl, champs };
}

// ── Compare-without-timestamp helper ─────────────────────────
function sameStats(a, b) {
  if (!a || !b) return false;
  const keys = ['seasons','races','wins','podiums','poles','fl','champs'];
  return keys.every(k => a[k] === b[k]);
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const ids = collectJolpicaIds();
  console.log(`\nRefreshing career stats for ${ids.length} drivers...\n`);

  mkdirSync(OUT_DIR, { recursive: true });

  let written = 0, unchanged = 0, failed = 0;
  for (const id of ids) {
    process.stdout.write(`  ${id.padEnd(22)} `);
    try {
      const stats = await fetchCareer(id);
      const outPath = join(OUT_DIR, `${id}.json`);
      let prev = null;
      if (existsSync(outPath)) {
        try { prev = JSON.parse(readFileSync(outPath, 'utf8')); } catch {}
      }
      if (sameStats(prev, stats)) {
        console.log(`unchanged (${stats.seasons}s ${stats.wins}w ${stats.champs}c)`);
        unchanged++;
      } else {
        const payload = { updatedAt: new Date().toISOString(), jolpicaId: id, ...stats };
        writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
        console.log(`✓ ${stats.seasons}s ${stats.wins}w ${stats.champs}c`);
        written++;
      }
    } catch (e) {
      console.log(`✗ ${e.message}`);
      failed++;
    }
    await sleep(750); // breathing room between drivers
  }

  console.log(`\nDone. ${written} written, ${unchanged} unchanged, ${failed} failed.\n`);
  if (failed && written + unchanged === 0) process.exit(1);
}

main().catch(e => { console.error('\n✗', e.stack || e.message); process.exit(1); });
