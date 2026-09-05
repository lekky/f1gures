#!/usr/bin/env node
// scripts/publish-social-post.mjs
//
// Sends what build-social-post.mjs produced to Metricool, then appends each
// post to data/social/history.json so future picks know what has run.
//
//   node scripts/publish-social-post.mjs --dry-run   # print, send nothing
//   node scripts/publish-social-post.mjs             # schedule (draft per config)
//   node scripts/publish-social-post.mjs --live      # override config.draft
//
// Settings live in scripts/social/config.mjs. The cards must already be
// reachable at --base-url: Instagram, TikTok and Facebook all pull media from
// a public URL rather than accepting bytes, so the workflow uploads first.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './social/sources.mjs';
import { readConfig, schedulePost, MetricoolError } from './social/publish/metricool.mjs';
import { appendHistory, readHistory } from './social/history.mjs';
import { SOCIAL_CONFIG, withUtm } from './social/config.mjs';

const cfg = SOCIAL_CONFIG;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [flag, value] = raw.split('=');
    switch (flag) {
      case '--in': args.in = value; break;
      case '--base-url': args.baseUrl = value; break;
      case '--networks': args.networks = value.split(',').map((n) => n.trim()).filter(Boolean); break;
      case '--dry-run': args.dryRun = true; break;
      case '--draft': args.draft = true; break;
      case '--live': args.live = true; break;
      case '--force': args.force = true; break;
      case '--help': args.help = true; break;
      default:
        throw new Error(`Unknown flag "${flag}". Try --help.`);
    }
  }
  return args;
}

const USAGE = `
Publish built social posts through Metricool. Settings: scripts/social/config.mjs

  --in=<dir>        build output directory (default: .social-out)
  --base-url=<url>  public URL the cards were uploaded under
                    (default: $SOCIAL_MEDIA_BASE_URL or https://f1gures.app/social)
  --networks=a,b    override config.networks (${cfg.networks.join(',')})
  --draft / --live  override config.draft (currently ${cfg.draft ? 'draft' : 'live'})
  --dry-run         print what would be sent, send nothing
  --force           publish even if history already has a post for that date
`.trim();

/**
 * Rewrite every f1gures.app URL in a caption for one network.
 *
 * Only Facebook linkifies URLs in a post, so only Facebook gets campaign tags;
 * on Instagram and TikTok the URL is unclickable text and a long ?utm_ string
 * is just clutter.
 */
function captionFor(caption, network) {
  return caption.replace(/https:\/\/f1gures\.app\/\S*/g, (url) => {
    // Trailing punctuation is part of the sentence, not the URL.
    const trailing = url.match(/[.,)]+$/)?.[0] || '';
    const clean = trailing ? url.slice(0, -trailing.length) : url;
    return withUtm(clean, network, cfg) + trailing;
  });
}

/**
 * Metricool takes one media URL per post, so networks wanting different card
 * shapes are sent as separate posts. Facebook is always its own post because
 * its caption carries different (tagged) links.
 */
function planFor(post, networks, baseUrl) {
  const byFormat = new Map(post.cards.map((c) => [c.format, c]));
  const groups = new Map();

  for (const network of networks) {
    const format = cfg.formatForNetwork[network] || 'portrait';
    if (!byFormat.has(format)) {
      throw new Error(`${post.date}: no "${format}" card rendered for ${network}.`);
    }
    const caption = captionFor(post.caption, network);
    const groupKey = `${format}::${caption}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { format, caption, networks: [], imageUrl: `${baseUrl}/${byFormat.get(format).file}` });
    }
    groups.get(groupKey).networks.push(network);
  }
  return [...groups.values()];
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const inDir = path.resolve(ROOT, args.in || '.social-out');
  const manifestPath = path.join(inDir, 'batch.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No batch.json in ${path.relative(ROOT, inDir)} - run build-social-post.mjs first.`);
  }
  const batch = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const networks = args.networks || cfg.networks;
  const draft = args.live ? false : args.draft ? true : cfg.draft;
  const baseUrl = (args.baseUrl || process.env.SOCIAL_MEDIA_BASE_URL || 'https://f1gures.app/social').replace(/\/$/, '');

  const history = readHistory();
  const todo = batch.posts.filter((p) => args.force || !history.some((h) => h.date === p.date));
  const alreadyLogged = batch.posts.length - todo.length;

  if (!todo.length) {
    console.log(`[social] nothing to send${alreadyLogged ? ` (${alreadyLogged} already in the history log)` : ''}.`);
    return;
  }

  if (args.dryRun) {
    console.log(`[dry-run] ${todo.length} post(s), ${draft ? 'as DRAFT' : 'LIVE'}, ${cfg.timezone}\n`);
    for (const post of todo) {
      console.log(`═══ ${post.date} ${post.publishAt.slice(11, 16)} · ${post.angle} · ${post.headline}`);
      for (const g of planFor(post, networks, baseUrl)) {
        // Print each group's own caption - Facebook's carries campaign-tagged
        // links, the others do not, and that difference is the thing to check.
        console.log(`\n  → ${g.networks.join(', ')} (${g.format})  ${g.imageUrl}`);
        console.log(g.caption.split('\n').map((l) => `    ${l}`).join('\n'));
      }
      console.log('');
    }
    return;
  }

  const metricool = readConfig();
  if (!metricool) {
    throw new Error('Metricool is not configured - set METRICOOL_USER_TOKEN, METRICOOL_USER_ID and METRICOOL_BLOG_ID.');
  }

  let sent = 0;
  let failedPosts = 0;

  for (const post of todo) {
    const results = {};
    let anyOk = false;

    for (const group of planFor(post, networks, baseUrl)) {
      try {
        const res = await schedulePost(metricool, {
          text: group.caption,
          imageUrl: group.imageUrl,
          networks: group.networks,
          publishAt: post.publishAt,
          timezone: post.timezone || cfg.timezone,
          draft,
          tiktokTitle: post.tiktokTitle,
        });
        for (const n of group.networks) results[n] = { ok: true, id: res.id, draft, imageUrl: group.imageUrl };
        anyOk = true;
        console.log(`[social] ${post.date} → ${group.networks.join(', ')}${draft ? ' (draft)' : ''}${res.id ? ` — id ${res.id}` : ''}`);
      } catch (err) {
        for (const n of group.networks) results[n] = { ok: false, error: err.message };
        console.error(`[social] ${post.date} FAILED ${group.networks.join(', ')}: ${err.message}`);
        if (err instanceof MetricoolError && err.body) {
          console.error(`[social] response: ${JSON.stringify(err.body)}`);
        }
      }
    }

    // Log whatever landed, so a partial success still counts against the
    // cooldowns and the next pick does not repeat this subject.
    if (anyOk) {
      appendHistory({ ...post, platforms: results });
      sent++;
    } else {
      failedPosts++;
    }
  }

  console.log(`[social] ${sent} scheduled, ${failedPosts} failed${alreadyLogged ? `, ${alreadyLogged} skipped as already logged` : ''}.`);
  if (sent === 0) throw new Error('nothing was scheduled - see the responses above');
}

main().catch((err) => {
  console.error(`[social] ${err.message}`);
  process.exit(1);
});
