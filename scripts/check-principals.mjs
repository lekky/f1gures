#!/usr/bin/env node
// scripts/check-principals.mjs
// Watchdog for the hand-curated team-principal data (scripts/principals.mjs).
// Only the current grid's open-ended tenures can go stale, so this checks
// exactly those: for each ref with a `to: null` tenure, fetch the team's
// English Wikipedia article and assert the curated boss's surname appears in
// the infobox's principal-ish parameter(s).
//
// Deliberately FLAG-ONLY: it never edits principals.mjs. Scraped text going
// straight into committed data is how a vandalised infobox ends up on the
// site; a principal change is rare enough (1-3/year grid-wide) that a human
// reviewing a GitHub issue is the right cost. The check-principals.yml
// workflow runs this daily and opens a (deduped) issue when the report needs
// attention.
//
// Node built-ins only (global fetch) - the workflow skips npm install.
//
// Exit codes: 0 = all confirmed; 1 = something needs attention (drift,
// missing infobox param, or fetch failure). Report is markdown on stdout.

import { pathToFileURL } from 'node:url';
import { PRINCIPALS } from './principals.mjs';

// ref → English Wikipedia article for the team (redirects are resolved), plus
// optional extra accepted names for refs where the day-to-day boss and the
// infobox's listed principal legitimately differ (e.g. Alpine's Briatore/
// Nielsen split).
export const WIKI_ARTICLES = {
  red_bull:     { article: 'Red Bull Racing' },
  ferrari:      { article: 'Scuderia Ferrari' },
  mercedes:     { article: 'Mercedes-Benz in Formula One' },
  mclaren:      { article: 'McLaren Racing' },
  aston_martin: { article: 'Aston Martin in Formula One' },
  alpine:       { article: 'Alpine F1 Team', accept: ['Flavio Briatore'] },
  williams:     { article: 'Williams Racing' },
  rb:           { article: 'Racing Bulls' },
  audi:         { article: 'Audi in Formula One' },
  haas:         { article: 'Haas F1 Team' },
  cadillac:     { article: 'Cadillac in Formula One' },
};

// Every infobox parameter whose name mentions "principal" (Team Principal,
// Team Principal(s), Principal...), with continuation lines folded in until
// the next |param= or the closing }}.
export function extractPrincipalValues(wikitext) {
  const lines = wikitext.split('\n');
  const values = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*\|[^=\n]*principal[^=\n]*=(.*)$/i.exec(lines[i]);
    if (!m) continue;
    let value = m[1];
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (/^\s*\|[^=\n]*=/.test(next) || /^\s*\}\}/.test(next)) break;
      value += '\n' + next;
    }
    const cleaned = cleanWikiValue(value);
    if (cleaned) values.push(cleaned);
  }
  return values;
}

// Human-readable-ish version of a wikitext infobox value: refs and comments
// dropped, [[target|label]] → label, light template unwrapping.
export function cleanWikiValue(value) {
  return value
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]/g, '$1')
    .replace(/\{\{\s*(?:unbulleted list|ubl|plainlist|hlist)\s*\|/gi, '')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/[{}|]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Surname containment, diacritic-insensitive - robust to "L. Mekies" vs
// "Laurent Mekies" and to multiple people listed in one value.
export function nameMatches(value, name) {
  const surname = fold(name.trim().split(/\s+/).at(-1));
  return fold(value).includes(surname);
}

async function fetchWikitext(article) {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2'
    + '&prop=revisions&rvprop=content&rvslots=main&redirects=1'
    + `&titles=${encodeURIComponent(article)}`;
  const res = await fetch(url, {
    headers: { 'user-agent': 'f1gures-principals-watchdog (https://f1gures.app)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const page = json?.query?.pages?.[0];
  if (!page || page.missing) throw new Error('page not found');
  const content = page.revisions?.[0]?.slots?.main?.content;
  if (!content) throw new Error('no revision content');
  return content;
}

export async function checkTeam(ref, tenure, config) {
  if (!config) return { ref, status: 'attention', detail: 'no Wikipedia article mapped in check-principals.mjs' };
  const accepted = [tenure.name, ...(config.accept || [])];
  let wikitext;
  try {
    wikitext = await fetchWikitext(config.article);
  } catch (err) {
    return { ref, status: 'attention', detail: `fetch failed for "${config.article}": ${err.message}` };
  }
  const values = extractPrincipalValues(wikitext);
  if (!values.length) {
    return { ref, status: 'attention', detail: `no principal-ish infobox param found on "${config.article}"` };
  }
  const joined = values.join(' / ');
  if (accepted.some(name => nameMatches(joined, name))) {
    return { ref, status: 'ok', detail: `"${tenure.name}" confirmed (infobox: ${joined})` };
  }
  return {
    ref,
    status: 'attention',
    detail: `curated boss "${tenure.name}" NOT in "${config.article}" infobox - it says: ${joined}`,
  };
}

async function main() {
  const targets = [];
  for (const [ref, tenures] of Object.entries(PRINCIPALS)) {
    const open = tenures.find(t => t.to == null);
    if (open) targets.push({ ref, tenure: open });
  }

  const results = [];
  for (const { ref, tenure } of targets) {
    results.push(await checkTeam(ref, tenure, WIKI_ARTICLES[ref]));
  }
  const needsAttention = results.filter(r => r.status !== 'ok');

  console.log('## Team principal watchdog report');
  console.log('');
  console.log(needsAttention.length
    ? `**${needsAttention.length} of ${results.length} teams need a look.** If a principal really changed, update the tenure rows in \`scripts/principals.mjs\` (close the old row with \`to\`/\`toRound\`, add the new open-ended one). If Wikipedia is wrong or renamed an article, fix \`WIKI_ARTICLES\` in \`scripts/check-principals.mjs\` instead. Infobox text below is scraped data - verify against real reporting before editing.`
    : `All ${results.length} current-grid principals confirmed against Wikipedia.`);
  console.log('');
  for (const r of results) {
    console.log(`- ${r.status === 'ok' ? '✅' : '⚠️'} \`${r.ref}\`: ${r.detail}`);
  }
  process.exitCode = needsAttention.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
