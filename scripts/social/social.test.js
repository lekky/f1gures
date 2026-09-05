import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { longDate, dayMonth, ordinal, plural, yearsBetween, daysBetween, possessive, clamp } from './format.mjs';
import {
  makeRng, weightedPick, selectFromCandidates,
  ANGLE_WEIGHTS, ANGLE_IDS, KEY_COOLDOWN_DAYS, SUBJECT_COOLDOWN_DAYS,
} from './angles.mjs';
import { composeCaption, LIMITS } from './caption.mjs';
import { readHistory, appendHistory, hasPostFor } from './history.mjs';
import { fitFontSize, alpha, contrastText, metrics, FORMATS } from './cardkit.mjs';
import { SOCIAL_CONFIG, publishAtFor, withUtm, raceOwnedDates } from './config.mjs';

// ── format helpers ──

describe('format helpers', () => {
  it('formats dates', () => {
    expect(longDate('1976-08-01')).toBe('1 August 1976');
    expect(dayMonth('1976-08-01')).toBe('1 August');
    expect(longDate('nonsense')).toBe('');
  });

  it('ordinals handle the teens', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(21)).toBe('21st');
  });

  it('pluralises', () => {
    expect(plural(1, 'win')).toBe('1 win');
    expect(plural(3, 'win')).toBe('3 wins');
    expect(plural(0, 'win')).toBe('0 wins');
  });

  it('counts years without over-counting before the anniversary', () => {
    expect(yearsBetween('2000-06-15', '2010-06-15')).toBe(10);
    expect(yearsBetween('2000-06-15', '2010-06-14')).toBe(9);
    expect(yearsBetween('2000-06-15', '2010-06-16')).toBe(10);
  });

  it('counts days', () => {
    expect(daysBetween('2026-09-05', '2026-09-06')).toBe(1);
    expect(daysBetween('2026-09-06', '2026-09-05')).toBe(-1);
    expect(daysBetween('2026-09-05', '2026-09-05')).toBe(0);
  });

  it('makes possessives, including names ending in s', () => {
    expect(possessive('Hamilton')).toBe("Hamilton's");
    expect(possessive('Villeneuve')).toBe("Villeneuve's");
    expect(possessive('Jenks')).toBe("Jenks'");
  });

  it('clamps on a word boundary', () => {
    expect(clamp('short', 20)).toBe('short');
    const out = clamp('the quick brown fox jumps over the lazy dog', 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('…')).toBe(true);
  });
});

// ── selection ──

const candidate = (angle, key, weight, subject) => ({ angle, key, weight, subject, layout: 'fact', link: '/', data: {} });

describe('angle selection', () => {
  it('is deterministic for the same date and history', () => {
    const byAngle = new Map([
      ['trivia', [candidate('trivia', 't1', 5, 's1'), candidate('trivia', 't2', 5, 's2')]],
      ['record-board', [candidate('record-board', 'r1', 12, 's3')]],
    ]);
    const a = selectFromCandidates(byAngle, { date: '2026-04-01', history: [] });
    const b = selectFromCandidates(byAngle, { date: '2026-04-01', history: [] });
    expect(a.key).toBe(b.key);
  });

  it('produces different picks on different dates', () => {
    const byAngle = new Map([
      ['trivia', Array.from({ length: 40 }, (_, i) => candidate('trivia', `t${i}`, 5, `s${i}`))],
    ]);
    const keys = new Set(
      Array.from({ length: 25 }, (_, i) => selectFromCandidates(byAngle, { date: `2026-04-${String(i + 1).padStart(2, '0')}`, history: [] }).key),
    );
    expect(keys.size).toBeGreaterThan(10);
  });

  it('never repeats a key inside the key cooldown', () => {
    const used = candidate('trivia', 'used', 500, 'sA');
    const fresh = candidate('trivia', 'fresh', 1, 'sB');
    const byAngle = new Map([['trivia', [used, fresh]]]);
    const history = [{ date: '2026-04-01', angle: 'trivia', key: 'used', subject: 'sA' }];

    // Well inside the cooldown, the heavily-weighted used key must be skipped.
    const picked = selectFromCandidates(byAngle, { date: '2026-04-10', history });
    expect(picked.key).toBe('fresh');
    expect(KEY_COOLDOWN_DAYS).toBeGreaterThan(90);
  });

  it('falls back rather than returning nothing when everything is on cooldown', () => {
    const only = candidate('trivia', 'only', 10, 'sA');
    const byAngle = new Map([['trivia', [only]]]);
    const history = [{ date: '2026-04-01', angle: 'trivia', key: 'only', subject: 'sA' }];
    const picked = selectFromCandidates(byAngle, { date: '2026-04-02', history });
    expect(picked).not.toBeNull();
    expect(picked.key).toBe('only');
  });

  it('damps a subject used recently', () => {
    const sameSubject = candidate('trivia', 'a', 10, 'driver:x');
    const other = candidate('trivia', 'b', 10, 'driver:y');
    const byAngle = new Map([['trivia', [sameSubject, other]]]);
    const history = [{ date: '2026-04-01', angle: 'record-board', key: 'zzz', subject: 'driver:x' }];

    // Across many dates the damped subject should be picked far less often.
    let damped = 0;
    for (let i = 2; i <= 20; i++) {
      const d = `2026-04-${String(i).padStart(2, '0')}`;
      if (selectFromCandidates(byAngle, { date: d, history }).key === 'a') damped++;
    }
    expect(damped).toBeLessThan(8);
    expect(SUBJECT_COOLDOWN_DAYS).toBeGreaterThan(7);
  });

  it('returns null with no candidates', () => {
    expect(selectFromCandidates(new Map(), { date: '2026-04-01', history: [] })).toBeNull();
    expect(selectFromCandidates(new Map([['trivia', []]]), { date: '2026-04-01', history: [] })).toBeNull();
  });

  it('gives every angle a weight', () => {
    for (const id of ANGLE_IDS) expect(ANGLE_WEIGHTS[id]).toBeGreaterThan(0);
    // Race-weekend angles must outrank the evergreen filler.
    expect(ANGLE_WEIGHTS['race-result']).toBeGreaterThan(ANGLE_WEIGHTS.trivia);
    expect(ANGLE_WEIGHTS['quali-result']).toBeGreaterThan(ANGLE_WEIGHTS['driver-spotlight']);
  });
});

describe('rng and weighted pick', () => {
  it('is seeded and repeatable', () => {
    const a = Array.from({ length: 5 }, makeRng('seed'));
    const r1 = makeRng('seed');
    const r2 = makeRng('seed');
    expect(Array.from({ length: 5 }, r1)).toEqual(Array.from({ length: 5 }, r2));
    expect(a.length).toBe(5);
  });

  it('respects weights', () => {
    const items = [{ id: 'heavy', weight: 99 }, { id: 'light', weight: 1 }];
    const rng = makeRng('x');
    const counts = { heavy: 0, light: 0 };
    for (let i = 0; i < 400; i++) counts[weightedPick(items, rng).id]++;
    expect(counts.heavy).toBeGreaterThan(counts.light * 5);
  });

  it('ignores zero-weight items and empty lists', () => {
    expect(weightedPick([{ id: 'a', weight: 0 }], makeRng('x'))).toBeNull();
    expect(weightedPick([], makeRng('x'))).toBeNull();
  });
});

// ── captions ──

const DRIVER = {
  driverRef: 'senna', forename: 'Ayrton', surname: 'Senna', nationality: 'Brazilian', dob: '1960-03-21',
  career: { firstYear: 1984, lastYear: 1994, races: 161, wins: 41, poles: 65, podiums: 80, championships: 3 },
  perSeason: [{ year: 1988, position: 1, constructorName: 'McLaren' }, { year: 1990, position: 1, constructorName: 'McLaren' }],
};

const RACE = {
  year: 1991, round: 1, name: 'Brazilian Grand Prix', date: '1991-03-24',
  circuit: { name: 'Interlagos', countryName: 'Brazil' },
};

const PODIUM = [
  { position: 1, driverName: 'Ayrton Senna', driverRef: 'senna', constructorName: 'McLaren', constructorColor: '#FF8000', code: 'SEN', points: 10, grid: 1, time: '1:38:28.128', q3: '1:16.392' },
  { position: 2, driverName: 'Riccardo Patrese', driverRef: 'patrese', constructorName: 'Williams', constructorColor: '#64C4FF', code: 'PAT', points: 6, time: '+2.991' },
  { position: 3, driverName: 'Gerhard Berger', driverRef: 'berger', constructorName: 'McLaren', constructorColor: '#FF8000', code: 'BER', points: 4, time: '+5.416' },
];

const CASES = {
  'race-result': { race: RACE, session: 'race', podium: PODIUM, top: PODIUM },
  'quali-result': { race: RACE, session: 'qualifying', podium: PODIUM, top: PODIUM },
  'sprint-result': { race: RACE, session: 'sprint', podium: PODIUM, top: PODIUM },
  'race-preview': { race: { ...RACE, circuitRef: 'interlagos' }, circuit: { name: 'Interlagos', location: 'São Paulo', countryName: 'Brazil', raceCount: 40, mostWins: [{ name: 'Alain Prost', count: 6 }] }, lastWinner: { winnerName: 'Nelson Piquet', year: 1990 }, inDays: 1 },
  'on-this-day': { race: RACE, podium: PODIUM, top: PODIUM, age: 35, isFirstWin: false, isFinale: false, champion: null },
  'driver-birthday': { driver: DRIVER, bornYear: 1960, age: 66 },
  'driver-spotlight': { driver: DRIVER },
  'record-board': { config: { id: 'wins', title: 'Most race wins', blurb: 'Career grand prix victories.' }, rows: [{ rank: 1, name: 'Lewis Hamilton', value: 106, valueLabel: '106 wins', teamColor: '#27F4D2', driverRef: 'hamilton', context: '2007-present' }] },
  'standings-snapshot': { year: 2026, afterRound: 12, afterRaceName: 'Dutch Grand Prix', roundsDone: 12, roundsTotal: 23, rows: [{ position: 1, points: 242, driver: { first: 'Kimi', last: 'Antonelli', team: 'mercedes', code: 'ANT', jolpicaId: 'antonelli' } }, { position: 2, points: 183, driver: { first: 'George', last: 'Russell', team: 'mercedes', code: 'RUS', jolpicaId: 'russell' } }] },
  'team-spotlight': { team: { constructorRef: 'ferrari', name: 'Ferrari', nationality: 'Italian', color: '#E80020', career: { seasons: 77, firstYear: 1950, lastYear: 2026, races: 1136, wins: 251, podiums: 857, championships: 16 }, bestSeason: { year: 2002, wins: 15, races: 17 }, topDrivers: [{ name: 'Michael Schumacher', wins: 72 }] } },
  'circuit-spotlight': { circuit: { circuitRef: 'monza', name: 'Monza', location: 'Monza', countryName: 'Italy', raceCount: 75, firstYear: 1950, lastYear: 2026, mostWins: [{ name: 'Lewis Hamilton', count: 5 }], mostPoles: [{ name: 'Lewis Hamilton', count: 7 }], races: [{ year: 2025, winnerName: 'Max Verstappen' }] } },
  'head-to-head': { type: 'driver', matchup: { a: 'senna', b: 'prost', aLabel: 'Senna', bLabel: 'Prost', aName: 'Ayrton Senna', bName: 'Alain Prost', aColor: '#FF8000', bColor: '#FF8000', tag: 'The rivalry', reason: 'Teammates turned enemies.' }, a: DRIVER, b: { ...DRIVER, forename: 'Alain', surname: 'Prost' } },
  trivia: { fact: { text: 'Ferrari has entered every world championship season since 1950.', category: 'milestone' }, index: 0 },
};

describe('caption composition', () => {
  it('composes every angle', () => {
    for (const [angle, data] of Object.entries(CASES)) {
      const copy = composeCaption({ angle, data, link: '/test/', key: `${angle}:x`, subject: 's' });
      expect(copy.headline, angle).toBeTruthy();
      expect(copy.caption, angle).toBeTruthy();
      expect(copy.alt, angle).toBeTruthy();
      expect(copy.caption.length, angle).toBeLessThanOrEqual(LIMITS.instagram.caption);
      expect(copy.tiktokTitle.length, angle).toBeLessThanOrEqual(LIMITS.tiktok.title);
      expect(copy.tags.length, angle).toBeLessThanOrEqual(LIMITS.instagram.hashtags);
      // Hashtags must be usable: no spaces, no punctuation, no duplicates.
      for (const t of copy.tags) expect(t, `${angle} tag ${t}`).toMatch(/^[A-Za-z0-9]+$/);
      expect(new Set(copy.tags.map((t) => t.toLowerCase())).size, angle).toBe(copy.tags.length);
    }
  });

  it('covers every angle that can be selected', () => {
    for (const id of ANGLE_IDS) expect(Object.keys(CASES), `missing caption case for ${id}`).toContain(id);
  });

  it('frames birthdays by birth year, never by a current age', () => {
    const copy = composeCaption({ angle: 'driver-birthday', data: CASES['driver-birthday'], link: '/', key: 'k', subject: 's' });
    expect(copy.caption).toContain('born on this day in 1960');
    // Ergast carries no date of death, so an age claim could be written about
    // someone who has died.
    expect(copy.caption).not.toMatch(/turns \d+/i);
    expect(copy.caption).not.toMatch(/\b66\b/);
  });

  it('strips accents when building hashtags', () => {
    const copy = composeCaption({ angle: 'race-preview', data: CASES['race-preview'], link: '/', key: 'k', subject: 's' });
    expect(copy.tags.some((t) => /Sao|Brazil/i.test(t)) || copy.tags.length > 0).toBe(true);
    for (const t of copy.tags) expect(t).not.toMatch(/[^\x00-\x7F]/);
  });

  it('keeps blank-line spacing in the body', () => {
    const copy = composeCaption({ angle: 'record-board', data: CASES['record-board'], link: '/', key: 'k', subject: 's' });
    expect(copy.body).toContain('\n\n');
    expect(copy.body).not.toMatch(/\n{3,}/);
  });
});

// ── history ──

describe('history log', () => {
  const tmpFiles = [];
  const tmp = () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'f1g-social-')), 'history.json');
    tmpFiles.push(f);
    return f;
  };
  afterEach(() => {
    for (const f of tmpFiles.splice(0)) fs.rmSync(path.dirname(f), { recursive: true, force: true });
  });

  it('reads an empty history for a missing file', () => {
    expect(readHistory(path.join(os.tmpdir(), 'definitely-not-here.json'))).toEqual([]);
  });

  it('appends and reads back', () => {
    const f = tmp();
    appendHistory({ date: '2026-01-01', angle: 'trivia', key: 'trivia:1', subject: 's', headline: 'h', link: '/' }, f);
    const posts = readHistory(f);
    expect(posts).toHaveLength(1);
    expect(posts[0].key).toBe('trivia:1');
    expect(posts[0].postedAt).toBeTruthy();
    expect(hasPostFor('2026-01-01', f)).toBe(true);
    expect(hasPostFor('2026-01-02', f)).toBe(false);
  });

  it('replaces rather than duplicates on a same-day re-run', () => {
    const f = tmp();
    const entry = { date: '2026-01-01', angle: 'trivia', key: 'trivia:1', subject: 's', headline: 'h', link: '/' };
    appendHistory(entry, f);
    appendHistory(entry, f);
    expect(readHistory(f)).toHaveLength(1);
  });

  it('keeps entries in date order', () => {
    const f = tmp();
    appendHistory({ date: '2026-01-03', angle: 'a', key: 'k3', subject: 's' }, f);
    appendHistory({ date: '2026-01-01', angle: 'a', key: 'k1', subject: 's' }, f);
    expect(readHistory(f).map((p) => p.date)).toEqual(['2026-01-01', '2026-01-03']);
  });
});

// ── card toolkit ──

describe('card toolkit', () => {
  it('fits long single words on one line', () => {
    // The bug this guards: sizing by total length alone clipped "VERSTAPPEN",
    // because words do not break.
    const size = fitFontSize('MAX VERSTAPPEN', { maxWidth: 475, maxLines: 2, max: 113, min: 40 });
    expect(size * 'VERSTAPPEN'.length * 0.42).toBeLessThanOrEqual(475);
  });

  it('honours the min and max clamps', () => {
    expect(fitFontSize('x', { maxWidth: 10000, maxLines: 1, max: 90, min: 20 })).toBe(90);
    expect(fitFontSize('a'.repeat(500), { maxWidth: 100, maxLines: 1, max: 90, min: 20 })).toBe(20);
  });

  it('converts hex to rgba and picks readable ink', () => {
    expect(alpha('#E8002D', 0.5)).toBe('rgba(232,0,45,0.5)');
    expect(alpha(null, 0.5)).toBe('rgba(255,255,255,0.5)');
    expect(contrastText('#FFD700')).toBe('#0a0a0a');
    expect(contrastText('#060709')).toBe('#ffffff');
  });

  it('derives sane geometry for every format', () => {
    for (const [name, dims] of Object.entries(FORMATS)) {
      const m = metrics(name);
      expect(m.w).toBe(dims.w);
      expect(m.h).toBe(dims.h);
      expect(m.inner).toBeLessThan(m.w);
      expect(m.inner).toBeGreaterThan(0);
      expect(m.safeTop + m.safeBottom).toBeLessThan(m.h / 2);
    }
  });
});

// ── config ──

describe('config', () => {
  it('builds an offset-free publish datetime (the timezone field carries it)', () => {
    expect(publishAtFor('2026-09-06')).toBe('2026-09-06T10:00:00');
    expect(publishAtFor('2026-09-06', { ...SOCIAL_CONFIG, postTime: '7:5' })).toBe('2026-09-06T07:05:00');
  });

  it('tags links for Facebook only', () => {
    // Instagram and TikTok render URLs as unclickable text, so a utm string
    // there is clutter that buys nothing.
    const url = 'https://f1gures.app/records/wins/';
    expect(withUtm(url, 'facebook')).toContain('utm_source=facebook');
    expect(withUtm(url, 'instagram')).toBe(url);
    expect(withUtm(url, 'tiktok')).toBe(url);
  });

  it('preserves an existing query string when tagging', () => {
    const tagged = withUtm('https://f1gures.app/compare/?type=driver&a=senna', 'facebook');
    expect(tagged).toContain('type=driver');
    expect(tagged).toContain('a=senna');
    expect(tagged).toContain('utm_campaign=daily-post');
  });

  it('leaves an unparseable url alone', () => {
    expect(withUtm('not a url', 'facebook')).toBe('not a url');
  });

  it('reserves the days around a race for the live job', () => {
    const owned = raceOwnedDates([{ date: '2026-09-06' }]);
    expect([...owned].sort()).toEqual(['2026-09-05', '2026-09-06', '2026-09-07']);
    expect(owned.has('2026-09-04')).toBe(false);
    expect(owned.has('2026-09-08')).toBe(false);
  });

  it('ignores undated calendar rows', () => {
    expect(raceOwnedDates([{ date: null }, { date: 'nonsense' }]).size).toBe(0);
  });

  it('renders a card shape for every configured network', () => {
    for (const n of SOCIAL_CONFIG.networks) {
      expect(SOCIAL_CONFIG.formatForNetwork[n], `no format for ${n}`).toBeTruthy();
      expect(Object.keys(FORMATS)).toContain(SOCIAL_CONFIG.formatForNetwork[n]);
    }
  });

  it('only allows the live job angles that genuinely cannot be scheduled ahead', () => {
    for (const a of SOCIAL_CONFIG.liveAngles) expect(ANGLE_IDS).toContain(a);
    // A preview IS knowable in advance (the calendar is fixed), so it belongs
    // to the batch job, not the live one.
    expect(SOCIAL_CONFIG.liveAngles).not.toContain('race-preview');
  });
});

// ── batch behaviour ──

describe('batch selection', () => {
  it('never schedules the same post twice inside one batch', () => {
    // The bug this guards: when every candidate in the drawn angle was on key
    // cooldown, selection fell back to "post it anyway" and produced two
    // identical posts a week apart in the same fortnight.
    const byAngle = new Map([
      // A single-candidate angle is the trap - once used, it has nothing left.
      ['standings-snapshot', [candidate('standings-snapshot', 'standings:2026-12', 100, 'standings:2026')]],
      ['record-board', Array.from({ length: 12 }, (_, i) => candidate('record-board', `rec${i}`, 12, `record:${i}`))],
      ['trivia', Array.from({ length: 12 }, (_, i) => candidate('trivia', `t${i}`, 5, `trivia:${i}`))],
    ]);
    // 25 candidates for 14 days: comfortably more supply than horizon, which is
    // the real case (the live pools carry 600+). With fewer candidates than
    // days a repeat is unavoidable, and the last-resort branch below covers it.

    const history = [];
    const seen = [];
    let day = Date.parse('2026-09-05T00:00:00Z');
    for (let i = 0; i < 14; i++) {
      const date = new Date(day + i * 86400000).toISOString().slice(0, 10);
      const picked = selectFromCandidates(byAngle, { date, history });
      expect(picked, date).not.toBeNull();
      seen.push(picked.key);
      history.push({ date, angle: picked.angle, key: picked.key, subject: picked.subject });
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('still returns a post once every candidate is exhausted', () => {
    const byAngle = new Map([['trivia', [candidate('trivia', 'only', 5, 's')]]]);
    const history = [{ date: '2026-09-05', angle: 'trivia', key: 'only', subject: 's' }];
    const picked = selectFromCandidates(byAngle, { date: '2026-09-06', history });
    expect(picked?.key).toBe('only');
  });
});
