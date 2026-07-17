// Cheap pre-gate for .github/workflows/fetch-fastf1.yml: decides in <1s
// (Node built-ins only, no npm install) whether any session of the current
// season has finished recently but has no JSON yet under public/data/fastf1/.
// Prints "true" or "false" to stdout (details go to stderr) so the workflow
// can skip the whole Python setup on the ~90% of weekend polls where there is
// nothing to fetch — that's what makes a 15-minute cron affordable.
//
// Keep the timing constants in sync with scripts/fetch-fastf1.py
// (SESSION_MINUTES / GRACE_MINUTES): both must agree on when a session counts
// as "finished", or the gate and the fetcher will disagree forever.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SESSION_MINUTES = {
  fp1: 60, fp2: 60, fp3: 60,
  sprintQuali: 45, q: 60, sprint: 70, race: 150,
};
const GRACE_MINUTES = 40;
// Only sessions that ended within this window keep the gate hot. Older gaps
// (FastF1 never published, pre-2018 rounds) are a manual-backfill problem —
// without this cap a single permanently-missing session would make every
// weekend poll run the full Python fetch forever.
const LOOKBACK_HOURS = 30;

const year = new Date().getUTCFullYear();
const bundlePath = resolve(process.cwd(), 'public', 'data', `${year}.json`);
if (!existsSync(bundlePath)) {
  console.error(`no season bundle for ${year}`);
  console.log('false');
  process.exit(0);
}

const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
const now = Date.now();
const pending = [];

for (const entry of bundle.calendar || []) {
  for (const [sid, v] of Object.entries(entry.sessions || {})) {
    if (!v || !v.date || !v.time) continue;
    const start = Date.parse(`${v.date}T${v.time}`);
    if (!Number.isFinite(start)) continue;
    const end = start + (SESSION_MINUTES[sid] ?? 90) * 60_000 + GRACE_MINUTES * 60_000;
    if (now < end) continue; // not finished yet
    if (now - end > LOOKBACK_HOURS * 3_600_000) continue; // too old — manual backfill territory
    const out = resolve(process.cwd(), 'public', 'data', 'fastf1', String(year), String(entry.round), `${sid}.json`);
    if (!existsSync(out)) pending.push(`R${entry.round}/${sid}`);
  }
}

console.error(pending.length ? `pending: ${pending.join(', ')}` : 'nothing pending');
console.log(pending.length ? 'true' : 'false');
