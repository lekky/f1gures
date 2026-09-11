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
//              skipping the days around a race (the live job owns those,
//              because their results do not exist yet) and any date already
//              posted or already sitting in the pending queue.
//
//              The scheduled job runs --days=1, one evening ahead. Anything
//              larger is a manual backfill: a card is a picture of the archive
//              at the moment it was rendered, so a fortnight-wide batch posts
//              fortnight-old numbers. See docs/social-posts.md.
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
import sharp from 'sharp';
import path from 'node:path';
import { assertArchive, ROOT, racesIndex } from './social/sources.mjs';
import { pickPost, hydrate, collectCandidates, ANGLE_IDS } from './social/angles.mjs';
import { composeCaption } from './social/caption.mjs';
import { renderCards } from './social/card.mjs';
import { FORMATS } from './social/cardkit.mjs';
import { readHistory } from './social/history.mjs';
import { readPending } from './social/pending.mjs';
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
      case '--asap': args.asap = true; break;
      case '--max': args.max = Number(value); break;
      case '--append': args.append = true; break;
      case '--all': args.all = true; break;
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
  --asap                publish as soon as the scheduler allows rather than at
                        config.postTime - what the live (result) job uses
  --append              keep whatever is already in the output directory and add
                        to its batch.json, rather than wiping it. Lets one job
                        build a result post and an evergreen one in two passes.
  --all                 build EVERY eligible candidate for the date instead of
                        drawing one. What the result passes use: a race weekend
                        runs several sessions in a day and each is its own post.
                        Skips anything already posted or queued, and caps at
                        --max (default 3) so nothing can flood a feed.
  --out=<dir>           output directory (default: .social-out)
  --list                print every candidate for the date, then exit
  --json                print the manifest as JSON only
`.trim();

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (date, n) => iso(new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000));

async function buildOne({ date, history, angles, key, formats, outDir, timeOfDay }) {
  const chosen = pickPost({ date, history, angle: angles || null, key: key || null });
  if (!chosen) return null;

  const candidate = hydrate(chosen);
  const copy = composeCaption(candidate);
  const cards = await renderCards(candidate, copy, formats);

  // Both file types, every time. TikTok refuses image/png on a photo post and
  // the others prefer PNG, so rather than deciding here - where the network is
  // not known - each card is written twice and the publisher picks per network.
  const files = [];
  // The basename carries the candidate, not just the date. Keying on the date
  // alone was fine while a day held one post; with several (FP1, FP2,
  // qualifying, the race) the second render silently overwrote the first and
  // both manifest entries pointed at the same image.
  const slug = String(candidate.key).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  for (const card of cards) {
    const base = `${date}-${slug}-${card.format}`;
    fs.writeFileSync(path.join(outDir, `${base}.png`), card.buffer);
    // 4:4:4 chroma: the cards are condensed type and hairline rules on a dark
    // ground, which is exactly what subsampling smears.
    const jpeg = await sharp(card.buffer).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
    fs.writeFileSync(path.join(outDir, `${base}.jpg`), jpeg);
    files.push({
      format: card.format,
      file: `${base}.png`,
      png: `${base}.png`,
      jpeg: `${base}.jpg`,
      width: card.width,
      height: card.height,
      bytes: card.buffer.length,
      jpegBytes: jpeg.length,
    });
  }

  return {
    date,
    publishAt: publishAtFor(date, cfg, new Date(), timeOfDay),
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
  const manifestPath = path.join(outDir, 'batch.json');

  // --append keeps an earlier pass's cards and posts. One job builds a result
  // post and then tomorrow's evergreen one, and a second wipe would delete the
  // PNGs the first pass just rendered.
  let carried = [];
  if (args.append && fs.existsSync(manifestPath)) {
    try {
      carried = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).posts || [];
    } catch {
      carried = [];
    }
  } else {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  // The committed log, plus this run's own picks, so a batch does not repeat
  // itself inside its own fortnight.
  // Result posts go out now; evergreen ones wait for the evening slot.
  const timeOfDay = args.asap ? cfg.livePostTime : cfg.postTime;

  // Two different questions, so two different lists.
  //
  //   logged   - has this DATE already been posted? (the date-skip below)
  //   history  - has this SUBJECT/KEY been used recently? (the cooldowns)
  //
  // The cooldowns must also see posts that are built but not yet placed,
  // otherwise a result queued on Sunday is not "used" until a Claude session
  // schedules it, and Monday's run builds the same podium again in the window
  // between the two. Pending entries and this run's own earlier pass both
  // count as used.
  const logged = readHistory();
  const pendingEntries = readPending().map((p) => ({ date: p.date, angle: p.angle, key: p.key, subject: p.subject }));
  const history = [...logged, ...pendingEntries, ...carried.map((p) => ({ date: p.date, angle: p.angle, key: p.key, subject: p.subject }))];
  const posts = [];
  const skipped = [];

  if (args.days) {
    const owned = args.includeRaceDays ? new Set() : raceOwnedDates(racesIndex(), cfg);
    const queued = new Set(pendingEntries.map((p) => p.date));
    for (let i = 0; i < args.days; i++) {
      const date = addDays(startDate, i);
      if (owned.has(date)) {
        skipped.push({ date, reason: 'race weekend — the live job owns this day' });
        continue;
      }
      if (logged.some((p) => p.date === date)) {
        skipped.push({ date, reason: 'already posted' });
        continue;
      }
      // Built but not yet placed. On the mcp route a post sits in the queue
      // until a Claude session schedules it, so the history log alone would let
      // the next run rebuild the same day and replace a card mid-hand-off.
      if (queued.has(date)) {
        skipped.push({ date, reason: 'already queued, waiting to be scheduled' });
        continue;
      }
      const post = await buildOne({ date, history, angles: args.angles, formats, outDir, timeOfDay });
      if (!post) {
        skipped.push({ date, reason: 'no candidate' });
        continue;
      }
      posts.push(post);
      // Feed each pick straight back in, so tomorrow's draw sees it.
      history.push({ date, angle: post.angle, key: post.key, subject: post.subject });
    }
  } else if (args.all) {
    // Every eligible candidate, not a draw. The date is shared, so each post is
    // told apart by its key - see slotOf() in pending.mjs.
    const spent = new Set(history.map((p) => `${p.date}:${p.key}`));
    const usedKeys = new Set(history.map((p) => p.key));
    const byAngle = collectCandidates(startDate, { only: args.angles || null });
    const eligible = [...byAngle.values()]
      .flat()
      // A session already posted is not news twice, whichever day it went out.
      .filter((c) => !usedKeys.has(c.key) && !spent.has(`${startDate}:${c.key}`))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, Number.isFinite(args.max) ? args.max : 3);

    for (const c of eligible) {
      const post = await buildOne({ date: startDate, history, key: c.key, formats, outDir, timeOfDay });
      if (!post) continue;
      posts.push(post);
      history.push({ date: startDate, angle: post.angle, key: post.key, subject: post.subject });
    }
    if (!eligible.length) skipped.push({ date: startDate, reason: 'no unposted candidate' });
  } else {
    const post = await buildOne({ date: startDate, history, angles: args.angles, key: args.key, formats, outDir, timeOfDay });
    if (post) posts.push(post);
  }

  const allPosts = [...carried, ...posts].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const manifest = { generatedAt: new Date().toISOString(), draft: cfg.draft, posts: allPosts, skipped };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (args.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  if (!posts.length) {
    console.log(`[social] nothing new to post${args.angles ? ` for angles: ${args.angles.join(', ')}` : ''}.`);
    for (const s of skipped) console.log(`  ${s.date}  skipped — ${s.reason}`);
    if (carried.length) console.log(`[social] ${carried.length} post(s) carried from an earlier pass remain in batch.json.`);
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
  if (carried.length) {
    console.log(`\ncarried from an earlier pass: ${carried.map((p) => p.date).join(', ')}`);
  }
  if (posts.length === 1) {
    console.log(`\n${posts[0].caption}\n`);
  }
}

main().catch((err) => {
  console.error(`[social] ${err.message}`);
  process.exit(1);
});
