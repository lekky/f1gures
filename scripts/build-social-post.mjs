#!/usr/bin/env node
// scripts/build-social-post.mjs
//
// Picks posts, renders their cards, and writes a manifest. It publishes
// nothing - publish-social-post.mjs does that - so this is always safe to run
// and is what you run to see what is coming.
//
// Two modes:
//
//   --days=N   BATCH. Builds the next N days of evergreen posts in one go
//              (records, on-this-day, birthdays, spotlights, previews...),
//              skipping the days around a race, which the live job owns
//              because their results do not exist yet.
//
//   (default)  ONE post for a single date. What the live race-weekend job runs.
//
//   node scripts/build-social-post.mjs --days=14          # a fortnight
//   node scripts/build-social-post.mjs                    # today
//   node scripts/build-social-post.mjs --date=2026-09-06
//   node scripts/build-social-post.mjs --angles=race-result,quali-result
//   node scripts/build-social-post.mjs --list             # what is available
//
// Output lands in .social-out/ (gitignored): the PNGs plus batch.json.

import fs from 'node:fs';
import path from 'node:path';
import { assertArchive, ROOT, racesIndex } from './social/sources.mjs';
import { pickPost, hydrate, collectCandidates, ANGLE_IDS } from './social/angles.mjs';
import { composeCaption } from './social/caption.mjs';
import { renderCards } from './social/card.mjs';
import { FORMATS } from './social/cardkit.mjs';
import { readHistory } from './social/history.mjs';
import { SOCIAL_CONFIG, publishAtFor, raceOwnedDates } from './social/config.mjs';

const cfg = SOCIAL_CONFIG;

/** The card shapes actually needed by the configured networks. */
function neededFormats() {
  return [...new Set(cfg.networks.map((n) => cfg.formatForNetwork[n] || 'portrait'))];
}

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [flag, value] = raw.split('=');
    switch (flag) {
      case '--date': args.date = value; break;
      case '--days': args.days = Number(value); break;
      case '--angle': args.angles = [value]; break;
      case '--angles': args.angles = value.split(',').map((a) => a.trim()).filter(Boolean); break;
      case '--key': args.key = value; break;
      case '--out': args.out = value; break;
      case '--formats': args.formats = value.split(',').map((f) => f.trim()).filter(Boolean); break;
      case '--include-race-days': args.includeRaceDays = true; break;
      case '--list': args.list = true; break;
      case '--json': args.json = true; break;
      case '--help': args.help = true; break;
      default:
        throw new Error(`Unknown flag "${flag}". Try --help.`);
    }
  }
  return args;
}

const USAGE = `
Build f1gures social posts. Settings live in scripts/social/config.mjs.

  --days=N              batch mode: build the next N days (config: ${cfg.batchDays})
  --date=YYYY-MM-DD     single post for this date (default: today, UTC)
  --angles=a,b          restrict to these angles
  --angle=<id>          force one angle: ${ANGLE_IDS.join(', ')}
  --key=<candidate>     force one exact candidate (re-render a past post)
  --formats=a,b         card formats (default: from config — ${neededFormats().join(',')}); available: ${Object.keys(FORMATS).join(', ')}
  --include-race-days   batch mode: do not skip the days the live job owns
  --out=<dir>           output directory (default: .social-out)
  --list                print every candidate for the date, then exit
  --json                print the manifest as JSON only
`.trim();

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (date, n) => iso(new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000));

async function buildOne({ date, history, angles, key, formats, outDir }) {
  const chosen = pickPost({ date, history, angle: angles || null, key: key || null });
  if (!chosen) return null;

  const candidate = hydrate(chosen);
  const copy = composeCaption(candidate);
  const cards = await renderCards(candidate, copy, formats);

  const files = cards.map((card) => {
    const name = `${date}-${card.format}.png`;
    fs.writeFileSync(path.join(outDir, name), card.buffer);
    return { format: card.format, file: name, width: card.width, height: card.height, bytes: card.buffer.length };
  });

  return {
    date,
    publishAt: publishAtFor(date, cfg),
    timezone: cfg.timezone,
    angle: candidate.angle,
    key: candidate.key,
    subject: candidate.subject,
    headline: copy.headline,
    kicker: copy.kicker,
    caption: copy.caption,
    body: copy.body,
    hashtagLine: copy.hashtagLine,
    tiktokTitle: copy.tiktokTitle,
    alt: copy.alt,
    link: copy.link,
    hashtags: copy.tags,
    cards: files,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(USAGE);
    return;
  }

  assertArchive();

  const today = new Date().toISOString().slice(0, 10);
  const startDate = args.date || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error(`--date must be YYYY-MM-DD, got "${startDate}"`);

  if (args.list) {
    const byAngle = collectCandidates(startDate, { only: args.angles || null });
    for (const [angle, list] of byAngle) {
      console.log(`\n${angle} (${list.length})`);
      for (const c of [...list].sort((a, b) => b.weight - a.weight).slice(0, 8)) {
        console.log(`  ${String(c.weight).padStart(4)}  ${c.key}`);
      }
    }
    return;
  }

  const formats = args.formats || neededFormats();
  const outDir = path.resolve(ROOT, args.out || '.social-out');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // The committed log, plus this run's own picks, so a batch does not repeat
  // itself inside its own fortnight.
  const history = readHistory();
  const posts = [];
  const skipped = [];

  if (args.days) {
    const owned = args.includeRaceDays ? new Set() : raceOwnedDates(racesIndex(), cfg);
    for (let i = 0; i < args.days; i++) {
      const date = addDays(startDate, i);
      if (owned.has(date)) {
        skipped.push({ date, reason: 'race weekend — the live job owns this day' });
        continue;
      }
      if (history.some((p) => p.date === date)) {
        skipped.push({ date, reason: 'already posted' });
        continue;
      }
      const post = await buildOne({ date, history, angles: args.angles, formats, outDir });
      if (!post) {
        skipped.push({ date, reason: 'no candidate' });
        continue;
      }
      posts.push(post);
      // Feed each pick straight back in, so tomorrow's draw sees it.
      history.push({ date, angle: post.angle, key: post.key, subject: post.subject });
    }
  } else {
    const post = await buildOne({ date: startDate, history, angles: args.angles, key: args.key, formats, outDir });
    if (post) posts.push(post);
  }

  const manifest = { generatedAt: new Date().toISOString(), draft: cfg.draft, posts, skipped };
  fs.writeFileSync(path.join(outDir, 'batch.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  if (args.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  if (!posts.length) {
    console.log(`[social] nothing to post${args.angles ? ` for angles: ${args.angles.join(', ')}` : ''}.`);
    for (const s of skipped) console.log(`  ${s.date}  skipped — ${s.reason}`);
    return;
  }

  console.log(`\n${posts.length} post${posts.length === 1 ? '' : 's'} → ${path.relative(ROOT, outDir)}/\n`);
  for (const p of posts) {
    console.log(`  ${p.date}  ${p.angle.padEnd(20)} ${p.headline}`);
  }
  if (skipped.length) {
    console.log(`\nskipped ${skipped.length}:`);
    for (const s of skipped) console.log(`  ${s.date}  ${s.reason}`);
  }
  if (posts.length === 1) {
    console.log(`\n${posts[0].caption}\n`);
  }
}

main().catch((err) => {
  console.error(`[social] ${err.message}`);
  process.exit(1);
});
