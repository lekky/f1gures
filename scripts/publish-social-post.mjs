#!/usr/bin/env node
// scripts/publish-social-post.mjs
//
// Takes what build-social-post.mjs produced and sends it to Metricool, then
// appends the result to data/social/history.json so tomorrow's pick knows what
// today did.
//
//   node scripts/publish-social-post.mjs --dry-run     # print the exact request
//   node scripts/publish-social-post.mjs --draft       # park it in the calendar
//   node scripts/publish-social-post.mjs               # publish
//
// The cards must already be reachable at --base-url: Instagram, TikTok and
// Facebook all pull media from a public URL rather than accepting bytes, so the
// workflow uploads them before calling this.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './social/sources.mjs';
import { readConfig, schedulePost, NETWORKS, MetricoolError } from './social/publish/metricool.mjs';
import { appendHistory, hasPostFor } from './social/history.mjs';

// Portrait is the best-performing Instagram/Facebook size; story is what
// TikTok's photo post wants.
const FORMAT_FOR_NETWORK = { instagram: 'portrait', facebook: 'portrait', tiktok: 'story' };

function parseArgs(argv) {
  const args = { networks: NETWORKS };
  for (const raw of argv.slice(2)) {
    const [flag, value] = raw.split('=');
    switch (flag) {
      case '--in': args.in = value; break;
      case '--base-url': args.baseUrl = value; break;
      case '--networks': args.networks = value.split(',').map((n) => n.trim()).filter(Boolean); break;
      case '--at': args.at = value; break;
      case '--dry-run': args.dryRun = true; break;
      case '--draft': args.draft = true; break;
      case '--force': args.force = true; break;
      case '--help': args.help = true; break;
      default:
        throw new Error(`Unknown flag "${flag}". Try --help.`);
    }
  }
  return args;
}

const USAGE = `
Publish the built social post through Metricool.

  --in=<dir>        build output directory (default: .social-out)
  --base-url=<url>  public URL the cards were uploaded under
                    (default: $SOCIAL_MEDIA_BASE_URL or https://f1gures.app/social)
  --networks=a,b    default: ${NETWORKS.join(',')}
  --at=<datetime>   local publish time, no offset (default: now)
  --draft           park in the Metricool calendar instead of publishing
  --dry-run         print the request that would be sent, send nothing
  --force           publish even if history already has a post for this date
`.trim();

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const inDir = path.resolve(ROOT, args.in || '.social-out');
  const manifestPath = path.join(inDir, 'post.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No post.json in ${path.relative(ROOT, inDir)} - run build-social-post.mjs first.`);
  }
  const post = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (!args.force && !args.dryRun && hasPostFor(post.date)) {
    console.log(`[social] ${post.date} already has a logged post - nothing to do (use --force to override).`);
    return;
  }

  const baseUrl = (args.baseUrl || process.env.SOCIAL_MEDIA_BASE_URL || 'https://f1gures.app/social').replace(/\/$/, '');
  const byFormat = new Map(post.cards.map((c) => [c.format, c]));

  // Every requested network needs its preferred card to actually exist.
  const missing = args.networks.filter((n) => !byFormat.has(FORMAT_FOR_NETWORK[n] || 'portrait'));
  if (missing.length) {
    throw new Error(`No rendered card for: ${missing.join(', ')} (needs ${missing.map((n) => FORMAT_FOR_NETWORK[n]).join(', ')}).`);
  }

  // Metricool takes one media URL per post, so networks that want different
  // aspect ratios are sent as separate posts.
  const groups = new Map();
  for (const network of args.networks) {
    const format = FORMAT_FOR_NETWORK[network] || 'portrait';
    if (!groups.has(format)) groups.set(format, []);
    groups.get(format).push(network);
  }

  const publishAt = args.at || new Date().toISOString().slice(0, 19);
  const timezone = process.env.SOCIAL_TIMEZONE || 'Europe/London';

  const planned = [...groups.entries()].map(([format, networks]) => ({
    format,
    networks,
    imageUrl: `${baseUrl}/${byFormat.get(format).file}`,
    text: post.caption,
    tiktokTitle: post.tiktokTitle,
    publishAt,
    timezone,
    draft: Boolean(args.draft),
  }));

  if (args.dryRun) {
    console.log(`[dry-run] ${post.date} · ${post.angle} · ${post.headline}\n`);
    for (const p of planned) {
      console.log(`→ ${p.networks.join(', ')}  (${p.format})`);
      console.log(`  image: ${p.imageUrl}`);
      console.log(`  draft: ${p.draft}`);
      console.log(`  text:\n${p.text.split('\n').map((l) => `    ${l}`).join('\n')}\n`);
    }
    return;
  }

  const cfg = readConfig();
  if (!cfg) {
    throw new Error('Metricool is not configured - set METRICOOL_USER_TOKEN, METRICOOL_USER_ID and METRICOOL_BLOG_ID.');
  }

  const results = {};
  const failures = [];
  for (const p of planned) {
    try {
      const res = await schedulePost(cfg, p);
      for (const n of p.networks) results[n] = { ok: true, id: res.id, draft: p.draft, imageUrl: p.imageUrl };
      console.log(`[social] scheduled ${p.networks.join(', ')} (${p.format})${p.draft ? ' as draft' : ''}${res.id ? ` — id ${res.id}` : ''}`);
    } catch (err) {
      for (const n of p.networks) results[n] = { ok: false, error: err.message };
      failures.push(err);
      console.error(`[social] FAILED ${p.networks.join(', ')}: ${err.message}`);
      if (err instanceof MetricoolError && err.body) {
        console.error(`[social] response: ${JSON.stringify(err.body)}`);
      }
    }
  }

  // Log whatever landed, so a partial success still counts against the
  // cooldowns and tomorrow does not repeat today's subject.
  if (Object.values(results).some((r) => r.ok)) {
    appendHistory({ ...post, platforms: results });
    console.log(`[social] history updated for ${post.date}`);
  }

  if (failures.length === planned.length) {
    throw new Error('every network failed - see the responses above');
  }
}

main().catch((err) => {
  console.error(`[social] ${err.message}`);
  process.exit(1);
});
