#!/usr/bin/env node
/**
 * Seed a local (or staging) PocketBase with enough fantasy data to develop
 * against: one season, five rounds (three already locked, two upcoming), a
 * 20-car entry list, published tiers for every round, two verified test users,
 * and three weekends of history so the usage-cap rules actually bite.
 *
 * Zero dependencies — Node 18+ global fetch only, so this runs with no
 * `npm install`.
 *
 *   node seed-dev.mjs            # idempotent upsert
 *   node seed-dev.mjs --reset    # delete existing fantasy rows first
 *
 * Env:
 *   PB_URL                 default http://127.0.0.1:8090
 *   PB_SUPERUSER_EMAIL     default dev@f1gures.local
 *   PB_SUPERUSER_PASSWORD  default fantasy-dev-1234
 *
 * The superuser is created for you by dev.ps1 / dev.sh. To make one by hand:
 *   ./bin/pocketbase superuser upsert dev@f1gures.local fantasy-dev-1234 \
 *       --dir ./pb_data --migrationsDir ./pb_migrations --hooksDir ./pb_hooks
 */

const PB_URL = (process.env.PB_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '');
const SUPER_EMAIL = process.env.PB_SUPERUSER_EMAIL || 'dev@f1gures.local';
const SUPER_PASSWORD = process.env.PB_SUPERUSER_PASSWORD || 'fantasy-dev-1234';
const RESET = process.argv.includes('--reset');

// ---------------------------------------------------------------- seed data

const SEASON_YEAR = 2026;

/** Dev caps are deliberately tiny (3 / 2) so cap + emergency paths are easy
 *  to hit by hand. Production values come from the rulebook: 5 / 4. */
const SEASON = {
  year: SEASON_YEAR,
  status: 'active',
  capDriver: 3,
  capConstructor: 2,
  splitLength: 6,
  tierCount: 4,
  rulesVersion: '0.2',
  seedYear: SEASON_YEAR,
};

const DAY = 24 * 60 * 60 * 1000;

/** offsetDays is relative to "now" so the fixture never goes stale. */
const ROUNDS = [
  { round: 1, name: 'Bahrain Grand Prix',       isSprint: false, lockDays: -21, status: 'final' },
  { round: 2, name: 'Saudi Arabian Grand Prix', isSprint: false, lockDays: -14, status: 'final' },
  { round: 3, name: 'Australian Grand Prix',    isSprint: true,  lockDays: -7,  status: 'final' },
  { round: 4, name: 'Japanese Grand Prix',      isSprint: false, lockDays: 7,   status: 'upcoming' },
  { round: 5, name: 'Chinese Grand Prix',       isSprint: false, lockDays: 14,  status: 'upcoming' },
];

// Team ids are the season-bundle vocabulary from public/data/2026.json
// (`teams[].id`) — the same strings the scorer writes into
// fantasy_picks.constructor and fantasy_constructor_scores.teamId in
// production. Do not invent ids here; a mismatch would make dev picks
// unscoreable against real data.
const TEAMS = {
  alpine: 'Alpine F1 Team',
  aston: 'Aston Martin',
  audi: 'Audi',
  ferrari: 'Ferrari',
  haas: 'Haas F1 Team',
  mclaren: 'McLaren',
  mercedes: 'Mercedes',
  rb: 'RB F1 Team',
  redbull: 'Red Bull',
  williams: 'Williams',
  // cadillac (BOT, PER) is in the real 2026 bundle but left out here so the
  // fixture is a tidy 10 teams x 2 cars = 20 entries, 5 per tier.
};

// code, driverRef, name, teamId, tier, rank
// Driver -> team pairings also mirror public/data/2026.json.
const ENTRIES = [
  ['NOR', 'norris',        'Lando Norris',            'mclaren',  'A', 1],
  ['PIA', 'piastri',       'Oscar Piastri',           'mclaren',  'A', 2],
  ['VER', 'max_verstappen', 'Max Verstappen',         'redbull',  'A', 3],
  ['LEC', 'leclerc',       'Charles Leclerc',         'ferrari',  'A', 4],
  ['RUS', 'russell',       'George Russell',          'mercedes', 'A', 5],

  ['HAM', 'hamilton',      'Lewis Hamilton',          'ferrari',  'B', 6],
  ['ANT', 'antonelli',     'Andrea Kimi Antonelli',   'mercedes', 'B', 7],
  ['ALO', 'alonso',        'Fernando Alonso',         'aston',    'B', 8],
  ['ALB', 'albon',         'Alexander Albon',         'williams', 'B', 9],
  ['SAI', 'sainz',         'Carlos Sainz',            'williams', 'B', 10],

  ['GAS', 'gasly',         'Pierre Gasly',            'alpine',   'C', 11],
  ['TSU', 'tsunoda',       'Yuki Tsunoda',            'rb',       'C', 12],
  ['HAD', 'hadjar',        'Isack Hadjar',            'redbull',  'C', 13],
  ['OCO', 'ocon',          'Esteban Ocon',            'haas',     'C', 14],
  ['HUL', 'hulkenberg',    'Nico Hülkenberg',         'audi',     'C', 15],

  ['STR', 'stroll',        'Lance Stroll',            'aston',    'D', 16],
  ['COL', 'colapinto',     'Franco Colapinto',        'alpine',   'D', 17],
  ['LIN', 'lindblad',      'Arvid Lindblad',          'rb',       'D', 18],
  ['BEA', 'bearman',       'Oliver Bearman',          'haas',     'D', 19],
  ['BOR', 'bortoleto',     'Gabriel Bortoleto',       'audi',     'D', 20],
];

const USERS = [
  { email: 'fantasy1@example.com', password: 'fantasy-dev-1234', displayName: 'Test Player One' },
  { email: 'fantasy2@example.com', password: 'fantasy-dev-1234', displayName: 'Test Player Two' },
];

/**
 * History for the three locked rounds.
 *
 * Player One starts NOR in all three (capDriver 3 -> NOR is capped) and
 * McLaren twice (capConstructor 2 -> McLaren is capped). That is exactly the
 * fixture the cap / emergency HTTP checks in the README rely on.
 */
const HISTORY = {
  'fantasy1@example.com': [
    { round: 1, A: 'NOR', B: 'HAM', C: 'GAS', D: 'STR', constructor: 'mclaren', boost: 'D', total: 214 },
    { round: 2, A: 'NOR', B: 'ANT', C: 'TSU', D: 'COL', constructor: 'mclaren', boost: 'D', total: 187 },
    { round: 3, A: 'NOR', B: 'ALO', C: 'HAD', D: 'LIN', constructor: 'ferrari', boost: 'C', total: 241 },
  ],
  'fantasy2@example.com': [
    { round: 1, A: 'VER', B: 'SAI', C: 'HUL', D: 'BOR', constructor: 'redbull',  boost: 'D', total: 176 },
    { round: 2, A: 'LEC', B: 'ALB', C: 'OCO', D: 'BEA', constructor: 'ferrari',  boost: 'C', total: 203 },
    { round: 3, A: 'RUS', B: 'HAM', C: 'GAS', D: 'STR', constructor: 'mercedes', boost: 'D', total: 198 },
  ],
};

// ----------------------------------------------------------------- plumbing

let token = '';

async function api(method, path, body, opts = {}) {
  const res = await fetch(PB_URL + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    if (opts.allow404 && res.status === 404) return null;
    const detail = json ? JSON.stringify(json) : text;
    throw new Error(`${method} ${path} -> ${res.status} ${detail}`);
  }
  return json;
}

const q = (o) =>
  '?' +
  Object.entries(o)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

async function findOne(collection, filter) {
  const out = await api(
    'GET',
    `/api/collections/${collection}/records${q({ filter, perPage: 1, skipTotal: true })}`
  );
  return out?.items?.[0] || null;
}

async function upsert(collection, filter, data) {
  const existing = await findOne(collection, filter);
  if (existing) {
    return api('PATCH', `/api/collections/${collection}/records/${existing.id}`, data);
  }
  return api('POST', `/api/collections/${collection}/records`, data);
}

async function deleteAll(collection, filter) {
  for (;;) {
    const out = await api(
      'GET',
      `/api/collections/${collection}/records${q({ filter: filter || '', perPage: 200, skipTotal: true })}`
    );
    const items = out?.items || [];
    if (!items.length) return;
    for (const item of items) {
      await api('DELETE', `/api/collections/${collection}/records/${item.id}`);
    }
    if (items.length < 200) return;
  }
}

const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', 'Z');

// --------------------------------------------------------------------- main

async function main() {
  console.log(`PocketBase: ${PB_URL}`);

  const auth = await api('POST', '/api/collections/_superusers/auth-with-password', {
    identity: SUPER_EMAIL,
    password: SUPER_PASSWORD,
  });
  token = auth.token;
  console.log(`Authenticated as superuser ${SUPER_EMAIL}`);

  if (RESET) {
    console.log('--reset: clearing fantasy rows...');
    // Order matters only for readability — every relation cascades.
    for (const c of [
      'fantasy_pick_scores',
      'fantasy_picks',
      'fantasy_standings',
      'fantasy_scores',
      'fantasy_constructor_scores',
      'fantasy_tiers',
      'fantasy_rounds',
      'fantasy_entries',
      'fantasy_seasons',
      'fantasy_league_members',
      'fantasy_leagues',
    ]) {
      await deleteAll(c, '');
    }
  }

  // ------------------------------------------------------------ season
  const season = await upsert('fantasy_seasons', `year=${SEASON_YEAR}`, SEASON);
  console.log(`season ${SEASON.year}  ${season.id}  (capDriver ${SEASON.capDriver}, capConstructor ${SEASON.capConstructor})`);

  // ------------------------------------------------------------ rounds
  const now = Date.now();
  const roundIds = {};
  for (const r of ROUNDS) {
    const lockAt = now + r.lockDays * DAY;
    const raceAt = lockAt + 1 * DAY;
    const rec = await upsert(
      'fantasy_rounds',
      `season="${season.id}" && round=${r.round}`,
      {
        season: season.id,
        round: r.round,
        name: r.name,
        isSprint: r.isSprint,
        lockAt: iso(lockAt),
        raceAt: iso(raceAt),
        status: r.status,
        finalAt: r.status === 'final' ? iso(raceAt + 7 * DAY) : '',
        scored: r.status === 'final' ? { rulesVersion: '0.2', seeded: true } : null,
      }
    );
    roundIds[r.round] = rec.id;
  }
  console.log(`rounds     ${ROUNDS.length}  (locked: ${ROUNDS.filter((r) => r.lockDays < 0).map((r) => r.round).join(', ')} | open: ${ROUNDS.filter((r) => r.lockDays > 0).map((r) => r.round).join(', ')})`);

  // ----------------------------------------------------------- entries
  const entryIds = {};
  for (const [code, driverRef, name, teamId] of ENTRIES) {
    const rec = await upsert(
      'fantasy_entries',
      `season="${season.id}" && code="${code}"`,
      {
        season: season.id,
        code,
        driverRef,
        name,
        teamId,
        teamName: TEAMS[teamId],
        active: true,
      }
    );
    entryIds[code] = rec.id;
  }
  console.log(`entries    ${ENTRIES.length}`);

  // ------------------------------------------------------------- tiers
  let tierCount = 0;
  for (const r of ROUNDS) {
    for (const [code, , , , tier, rank] of ENTRIES) {
      await upsert(
        'fantasy_tiers',
        `round="${roundIds[r.round]}" && entry="${entryIds[code]}"`,
        {
          round: roundIds[r.round],
          entry: entryIds[code],
          tier,
          rank,
          avgPts: Math.round((21 - rank) * 4.5 * 10) / 10,
        }
      );
      tierCount++;
    }
  }
  console.log(`tiers      ${tierCount}  (${ENTRIES.length} per round x ${ROUNDS.length} rounds)`);

  // ------------------------------------------------------------- users
  const userIds = {};
  for (const u of USERS) {
    const existing = await findOne('users', `email="${u.email}"`);
    let rec;
    if (existing) {
      rec = await api('PATCH', `/api/collections/users/records/${existing.id}`, {
        verified: true,
        displayName: u.displayName,
      });
    } else {
      rec = await api('POST', '/api/collections/users/records', {
        email: u.email,
        password: u.password,
        passwordConfirm: u.password,
        verified: true,
        emailVisibility: false,
        displayName: u.displayName,
      });
    }
    userIds[u.email] = rec.id;
  }
  console.log(`users      ${USERS.length}  (${USERS.map((u) => u.email).join(', ')} / ${USERS[0].password})`);

  // ------------------------------------------- history: picks + scores
  let pickCount = 0;
  for (const [email, picks] of Object.entries(HISTORY)) {
    const uid = userIds[email];
    let seasonPts = 0;
    let best = 0;

    for (const p of picks) {
      const rid = roundIds[p.round];
      await upsert('fantasy_picks', `user="${uid}" && round="${rid}"`, {
        user: uid,
        round: rid,
        driverA: entryIds[p.A],
        driverB: entryIds[p.B],
        driverC: entryIds[p.C],
        driverD: entryIds[p.D],
        constructor: p.constructor,
        boost: p.boost,
        emergency: {},
        carriedForward: false,
        refunded: [],
      });
      pickCount++;

      await upsert('fantasy_pick_scores', `user="${uid}" && round="${rid}"`, {
        user: uid,
        round: rid,
        total: p.total,
        breakdown: {
          A: { code: p.A, base: 0, final: 0 },
          B: { code: p.B, base: 0, final: 0 },
          C: { code: p.C, base: 0, final: 0 },
          D: { code: p.D, base: 0, final: 0 },
          constructor: { teamId: p.constructor, total: 0 },
          note: 'seeded placeholder — the scorer overwrites this',
        },
      });

      seasonPts += p.total;
      best = Math.max(best, p.total);
    }

    for (const scope of ['season', 'split-1']) {
      await upsert(
        'fantasy_standings',
        `season="${season.id}" && scope="${scope}" && user="${uid}"`,
        {
          season: season.id,
          scope,
          user: uid,
          points: seasonPts,
          bestWeekend: best,
          weeksTop: 0,
          splitWins: 0,
        }
      );
    }
  }
  console.log(`picks      ${pickCount}  (locked rounds 1-3, written as superuser so the hook is bypassed)`);

  // ------------------------------------------------------------ report
  const capped = HISTORY['fantasy1@example.com'].filter((p) => p.A === 'NOR').length;
  console.log('');
  console.log('Ready. Useful facts for manual testing:');
  console.log(`  season id            ${season.id}`);
  console.log(`  open round (4) id    ${roundIds[4]}`);
  console.log(`  locked round (1) id  ${roundIds[1]}`);
  console.log(`  NOR entry id         ${entryIds.NOR}   used ${capped}/${SEASON.capDriver} by Player One -> AT CAP`);
  console.log(`  PIA entry id         ${entryIds.PIA}   used 0/${SEASON.capDriver} -> Tier A is NOT exhausted`);
  console.log(`  HAM entry id         ${entryIds.HAM}   Tier B (use it in slot A to trigger the tier error)`);
  console.log(`  mclaren              used 2/${SEASON.capConstructor} by Player One -> AT CAP`);
  console.log(`  ferrari              used 1/${SEASON.capConstructor} -> legal`);
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
