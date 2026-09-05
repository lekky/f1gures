#!/usr/bin/env node
// scripts/build-social-post.mjs
//
// Picks the day's angle, renders the cards, writes the caption, and emits a
// manifest. It publishes nothing - publish-social-post.mjs does that - so this
// is always safe to run and is the thing to run when you want to see what
// tomorrow would look like.
//
//   node scripts/build-social-post.mjs                     # today
//   node scripts/build-social-post.mjs --date=2026-09-06
//   node scripts/build-social-post.mjs --angle=on-this-day
//   node scripts/build-social-post.mjs --list              # what is available today
//   node scripts/build-social-post.mjs --formats=portrait
//
// Output lands in .social-out/ (gitignored): one PNG per format plus post.json.

import fs from 'node:fs';
import path from 'node:path';
import { assertArchive, ROOT } from './social/sources.mjs';
import { pickPost, hydrate, collectCandidates, ANGLE_IDS } from './social/angles.mjs';
import { composeCaption } from './social/caption.mjs';
import { renderCards } from './social/card.mjs';
import { DEFAULT_FORMATS, FORMATS } from './social/cardkit.mjs';
import { readHistory } from './social/history.mjs';

function parseArgs(argv) {
  const args = { formats: DEFAULT_FORMATS };
  for (const raw of argv.slice(2)) {
    const [flag, value] = raw.split('=');
    switch (flag) {
      case '--date': args.date = value; break;
      case '--angle': args.angle = value; break;
      case '--key': args.key = value; break;
      case '--out': args.out = value; break;
      case '--formats': args.formats = value.split(',').map((f) => f.trim()).filter(Boolean); break;
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
Build the daily f1gures social post.

  --date=YYYY-MM-DD   post date (default: today, UTC)
  --angle=<id>        force an angle: ${ANGLE_IDS.join(', ')}
  --key=<candidate>   force one exact candidate (re-render a past post)
  --formats=a,b       card formats (default: ${DEFAULT_FORMATS.join(',')}); available: ${Object.keys(FORMATS).join(', ')}
  --out=<dir>         output directory (default: .social-out)
  --list              print every candidate available for the date, then exit
  --json              print the manifest as JSON only
`.trim();

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(USAGE);
    return;
  }

  assertArchive();

  const date = args.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date must be YYYY-MM-DD, got "${date}"`);

  if (args.list) {
    const byAngle = collectCandidates(date, { only: args.angle || null });
    for (const [angle, list] of byAngle) {
      console.log(`\n${angle} (${list.length})`);
      for (const c of [...list].sort((a, b) => b.weight - a.weight).slice(0, 8)) {
        console.log(`  ${String(c.weight).padStart(4)}  ${c.key}`);
      }
    }
    return;
  }

  const history = readHistory();
  const chosen = pickPost({ date, history, angle: args.angle || null, key: args.key || null });
  if (!chosen) {
    throw new Error(`No candidate found for ${date}${args.angle ? ` (angle "${args.angle}")` : ''}.`);
  }

  const candidate = hydrate(chosen);
  const copy = composeCaption(candidate);
  const cards = await renderCards(candidate, copy, args.formats);

  const outDir = path.resolve(ROOT, args.out || '.social-out');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const files = cards.map((card) => {
    const name = `${date}-${card.format}.png`;
    fs.writeFileSync(path.join(outDir, name), card.buffer);
    return { format: card.format, file: name, width: card.width, height: card.height, bytes: card.buffer.length };
  });

  const manifest = {
    date,
    angle: candidate.angle,
    key: candidate.key,
    subject: candidate.subject,
    headline: copy.headline,
    kicker: copy.kicker,
    caption: copy.caption,
    tiktokTitle: copy.tiktokTitle,
    alt: copy.alt,
    link: copy.link,
    hashtags: copy.tags,
    cards: files,
  };
  fs.writeFileSync(path.join(outDir, 'post.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  if (args.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  console.log(`\n[${date}] ${candidate.angle} — ${copy.headline}`);
  console.log(`key: ${candidate.key}`);
  console.log(`\n${copy.caption}\n`);
  console.log(`cards → ${path.relative(ROOT, outDir)}/`);
  for (const f of files) console.log(`  ${f.file}  ${f.width}x${f.height}  ${(f.bytes / 1024).toFixed(0)}kb`);
}

main().catch((err) => {
  console.error(`[social] ${err.message}`);
  process.exit(1);
});
