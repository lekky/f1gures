// scripts/publish-social-post.mjs
//
// Takes what build-social-post.mjs produced and gets it to Metricool, by one of
// two routes (scripts/social/config.mjs → publishVia):
//
//   mcp   Park the finished posts in data/social/pending.json. A Claude session
//         with the Metricool MCP connected schedules them (/social-schedule).
//         Works on any Metricool plan. This is the default.
//   api   Schedule them here over the REST API, fully unattended. Needs
//         Metricool Advanced or Custom plus the three METRICOOL_* secrets.
//
//   node scripts/publish-social-post.mjs --dry-run   # print, change nothing
//   node scripts/publish-social-post.mjs             # queue (or send, on api)
//   node scripts/publish-social-post.mjs --confirm --dates=2026-09-08,...
//                                                    # mark queued posts done
//
// The cards must already be reachable at --base-url: Instagram, TikTok and
// Facebook all pull media from a public URL rather than accepting bytes.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './social/sources.mjs';
import { readConfig, schedulePost, MetricoolError } from './social/publish/metricool.mjs';
import { appendHistory, readHistory } from './social/history.mjs';
import { readPending, writePending, queuePending, clearPending, reslotPending, slotOf } from './social/pending.mjs';
import { SOCIAL_CONFIG, withUtm, localWallClock, imageTypeFor, tiktokAutoAddMusic } from './social/config.mjs';

const cfg = SOCIAL_CONFIG;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [flag, value] = raw.split('=');
    switch (flag) {
      case '--in': args.in = value; break;
      case '--base-url': args.baseUrl = value; break;
      case '--networks': args.networks = value.split(',').map((n) => n.trim()).filter(Boolean); break;
      case '--via': args.via = value; break;
      case '--dates': args.dates = value.split(',').map((d) => d.trim()).filter(Boolean); break;
      case '--slots': args.slots = value.split(',').map((d) => d.trim()).filter(Boolean); break;
      case '--confirm': args.confirm = true; break;
      case '--dry-run': args.dryRun = true; break;
      case '--draft': args.draft = true; break;
      case '--live': args.live = true; break;
      case '--force': args.force = true; break;
      case '--reslot': args.reslot = true; break;
      case '--help': args.help = true; break;
      default:
        throw new Error(`Unknown flag "${flag}". Try --help.`);
    }
  }
  return args;
}

const USAGE = `
Get built social posts to Metricool. Settings: scripts/social/config.mjs

  --via=mcp|api     override config.publishVia (currently ${cfg.publishVia})
  --in=<dir>        build output directory (default: .social-out)
  --base-url=<url>  public URL the cards were uploaded under
                    (default: $SOCIAL_MEDIA_BASE_URL or https://f1gures.app/social)
  --networks=a,b    override config.networks (${cfg.networks.join(',')})
  --draft / --live  override config.draft (currently ${cfg.draft ? 'draft' : 'live'})
  --dry-run         print what would happen, change nothing
  --force           include dates already in the history log

  --reslot          mcp route: push any queued publishAt that has gone past
                    (or is inside config.minLeadMinutes) forward to the soonest
                    time the scheduler will accept. Run it before placing.

  --confirm --dates=YYYY-MM-DD,...
                    mcp route: mark those queued posts as scheduled - moves them
                    from the pending queue into the history log. Confirms EVERY
                    post on those dates, which is what you want on an ordinary
                    day (there is only one).
  --confirm --slots=YYYY-MM-DD:key,...
                    confirm individual posts instead. A race weekend queues
                    several for one date (FP1, FP2, qualifying, the race), so
                    name the slots when only some of them were placed.
`.trim();

/**
 * Rewrite every f1gures URL in a caption for one network.
 *
 * Only Facebook linkifies URLs in a post, so only Facebook gets campaign tags;
 * on Instagram and TikTok the URL is unclickable text and a long ?utm_ string
 * is just clutter.
 */
function captionFor(caption, network) {
  return caption.replace(/https:\/\/f1gures\.app\/\S*/g, (url) => {
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
    const card = byFormat.get(format);
    const type = imageTypeFor(network, cfg);
    // Older queues carry only `file`; new ones carry both.
    const fileName = (type === 'jpeg' ? card.jpeg : card.png) || card.file;
    if (!fileName) {
      throw new Error(`${post.date}: no ${type} card rendered for ${network}.`);
    }
    const caption = captionFor(post.caption, network);
    // Type is part of the key: two networks sharing a shape still need separate
    // posts when one of them will not take the other's file type.
    const groupKey = `${format}::${type}::${caption}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { format, caption, networks: [], imageUrl: `${baseUrl}/${fileName}` });
    }
    groups.get(groupKey).networks.push(network);
  }
  return [...groups.values()];
}

/** Read the queue, re-slot anything stale (see reslotPending), write it back. */
function reslot(cfg = SOCIAL_CONFIG, now = new Date()) {
  const pending = readPending();
  if (!pending.length) {
    console.log('[social] nothing in the pending queue.');
    return [];
  }
  const earliest = localWallClock(new Date(now.getTime() + (cfg.minLeadMinutes ?? 20) * 60000), cfg.timezone);
  const { posts: next, moved } = reslotPending(pending, earliest);
  if (!moved.length) {
    console.log(`[social] ${pending.length} queued post(s), all still ahead of ${earliest} - nothing to re-slot.`);
    return [];
  }
  writePending(next);
  for (const m of moved) console.log(`[social] re-slotted ${m.date}: ${m.from} -> ${m.to} (${cfg.timezone})`);
  return moved;
}

/** Mark queued posts as scheduled: pending → history. */
function confirm(args) {
  const pending = readPending();
  if (!pending.length) {
    console.log('[social] nothing in the pending queue.');
    return;
  }
  // Slots name individual posts; dates name every post on a day. Neither given
  // confirms the lot, which is the old behaviour.
  const wanted = [...(args.slots || []), ...(args.dates || [])];
  const done = wanted.length
    ? pending.filter((p) => wanted.includes(slotOf(p)) || wanted.includes(p.date))
    : pending;
  if (!done.length) {
    console.log(`[social] no queued posts match ${wanted.join(', ')}.`);
    return;
  }
  for (const post of done) {
    appendHistory({
      date: post.date,
      angle: post.angle,
      key: post.key,
      subject: post.subject,
      headline: post.headline,
      link: post.link,
      platforms: Object.fromEntries(post.groups.flatMap((g) => g.networks.map((n) => [n, { ok: true, via: 'mcp', draft: post.draft }]))),
    });
  }
  const left = clearPending(done.map(slotOf));
  console.log(`[social] confirmed ${done.length} post(s): ${done.map(slotOf).join(', ')}`);
  console.log(`[social] ${left.length} still queued.`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (args.reslot) {
    reslot();
    return;
  }
  if (args.confirm) {
    confirm(args);
    return;
  }

  const inDir = path.resolve(ROOT, args.in || '.social-out');
  const manifestPath = path.join(inDir, 'batch.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No batch.json in ${path.relative(ROOT, inDir)} - run build-social-post.mjs first.`);
  }
  const batch = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const via = args.via || cfg.publishVia;
  const networks = args.networks || cfg.networks;
  const draft = args.live ? false : args.draft ? true : cfg.draft;
  const baseUrl = (args.baseUrl || process.env.SOCIAL_MEDIA_BASE_URL || 'https://f1gures.app/social').replace(/\/$/, '');

  const history = readHistory();
  // Match on the slot, not the date. Filtering by date alone meant the second
  // post on any day was silently dropped, so a race weekend could never carry
  // qualifying AND the race - or FP1 and FP2.
  const logged = new Set(history.map(slotOf));
  const todo = batch.posts.filter((p) => args.force || !logged.has(slotOf(p)));
  const alreadyLogged = batch.posts.length - todo.length;

  if (!todo.length) {
    console.log(`[social] nothing to send${alreadyLogged ? ` (${alreadyLogged} already in the history log)` : ''}.`);
    return;
  }

  const prepared = todo.map((post) => ({
    date: post.date,
    publishAt: post.publishAt,
    timezone: post.timezone || cfg.timezone,
    angle: post.angle,
    key: post.key,
    subject: post.subject,
    headline: post.headline,
    link: post.link,
    tiktokTitle: post.tiktokTitle,
    // Queued explicitly rather than left for whoever places the post to
    // remember: on the mcp route the scheduling happens in another session.
    tiktokAutoAddMusic: tiktokAutoAddMusic(cfg),
    alt: post.alt,
    draft,
    groups: planFor(post, networks, baseUrl),
  }));

  if (args.dryRun) {
    console.log(`[dry-run] ${prepared.length} post(s) via ${via}, ${draft ? 'as DRAFT' : 'LIVE'}, ${cfg.timezone}\n`);
    for (const post of prepared) {
      console.log(`═══ ${post.date} ${post.publishAt.slice(11, 16)} · ${post.angle} · ${post.headline}`);
      for (const g of post.groups) {
        console.log(`\n  → ${g.networks.join(', ')} (${g.format})  ${g.imageUrl}`);
        console.log(g.caption.split('\n').map((l) => `    ${l}`).join('\n'));
      }
      console.log('');
    }
    return;
  }

  // ── mcp: park them for a human-driven session to schedule ──
  if (via === 'mcp') {
    queuePending(prepared);
    console.log(`[social] queued ${prepared.length} post(s) for the Metricool MCP hand-off:\n`);
    for (const p of prepared) {
      console.log(`  ${p.date}  ${p.publishAt.slice(11, 16)}  ${p.angle.padEnd(20)} ${p.headline}`);
    }
    console.log(`\n  → ${cfg.pendingPath}`);
    console.log('  → next: open a Claude session with the Metricool MCP connected and run /social-schedule');
    return;
  }

  // ── api: schedule them here ──
  const metricool = readConfig();
  if (!metricool) {
    throw new Error('Metricool is not configured - set METRICOOL_USER_TOKEN, METRICOOL_USER_ID and METRICOOL_BLOG_ID (Advanced plan or above), or use publishVia: "mcp".');
  }

  let sent = 0;
  let failedPosts = 0;
  for (const post of prepared) {
    const results = {};
    let anyOk = false;
    for (const group of post.groups) {
      try {
        const res = await schedulePost(metricool, {
          text: group.caption,
          imageUrl: group.imageUrl,
          networks: group.networks,
          publishAt: post.publishAt,
          timezone: post.timezone,
          draft: post.draft,
          tiktokTitle: post.tiktokTitle,
          tiktokAutoAddMusic: post.tiktokAutoAddMusic,
        });
        for (const n of group.networks) results[n] = { ok: true, id: res.id, draft: post.draft, imageUrl: group.imageUrl };
        anyOk = true;
        console.log(`[social] ${post.date} → ${group.networks.join(', ')}${post.draft ? ' (draft)' : ''}${res.id ? ` — id ${res.id}` : ''}`);
      } catch (err) {
        for (const n of group.networks) results[n] = { ok: false, error: err.message };
        console.error(`[social] ${post.date} FAILED ${group.networks.join(', ')}: ${err.message}`);
        if (err instanceof MetricoolError && err.body) {
          console.error(`[social] response: ${JSON.stringify(err.body)}`);
        }
      }
    }
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
