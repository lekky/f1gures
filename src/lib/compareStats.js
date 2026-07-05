// compareStats — pure comparison logic for Compare Mode (the driver/team "VS"
// feature). Takes two full archive docs (the drivers/<ref>.json or
// teams/<ref>.json shape) and returns a structured comparison: grouped metric
// rows (each with both values + a winner), a rivalry "context" derived by
// JOINING the two docs (teammate duel / on-track head-to-head / shared-season
// title race), and a verdict tally.
//
// Plain ESM so both the React island and vitest import it. No scoring math is
// re-implemented here — career totals come straight off the docs' `career`
// aggregate; only rates and the join-derived context are computed.

// ── shared helpers ───────────────────────────────────────────────
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const sum = (arr, pick) => arr.reduce((s, x) => s + num(pick(x)), 0);

/** A perRace row is a *classified* finish when it has a real numeric position
 *  (Ergast marks retirements with a letter code in positionText). Mirrors the
 *  waffleKind logic in DriverPage.astro. */
export function isClassified(r) {
  return r && r.position != null && (r.positionText == null || /^\d+$/.test(String(r.positionText)));
}

const pct = (w, l) => {
  const n = w + l;
  return n > 0 ? (w / n) * 100 : null;
};
const rate = (n, d) => (d > 0 ? (n / d) * 100 : null);

/** Decide the winning side of a row. Returns 'a' | 'b' | null (tie / n/a). */
function winnerOf(a, b, better) {
  if (a == null || b == null) return null;
  if (a === b) return null;
  if (better === 'lo') return a < b ? 'a' : 'b';
  return a > b ? 'a' : 'b';
}

/** Build one comparison row. `better` defaults to 'hi'. `fmt` controls display
 *  ('int' | 'pct' | 'dec1'). A row where both sides are null is dropped by the
 *  caller. */
function row(key, label, unit, aVal, bVal, { better = 'hi', fmt = 'int', verdict = true } = {}) {
  return { key, label, unit, a: aVal, b: bVal, better, fmt, verdict, winner: winnerOf(aVal, bVal, better) };
}

/** Tally row winners into a verdict. Only rows that count toward the verdict
 *  (verdict !== false) and have a decided winner are scored. */
function tallyVerdict(rows) {
  let a = 0, b = 0, decided = 0;
  for (const r of rows) {
    if (r.verdict === false) continue;
    if (r.winner === 'a') { a += 1; decided += 1; }
    else if (r.winner === 'b') { b += 1; decided += 1; }
  }
  const lead = a === b ? null : a > b ? 'a' : 'b';
  return { a, b, of: decided, lead };
}

const yearOf = (dob) => {
  if (!dob) return null;
  const y = parseInt(String(dob).slice(0, 4), 10);
  return isFinite(y) ? y : null;
};

// ── driver comparison ────────────────────────────────────────────

/** Career + rate rows for a single driver doc, in two groups. */
function driverRows(a, b) {
  const ac = a.career || {}, bc = b.career || {};
  const aPts = sum(a.perSeason || [], (s) => s.points);
  const bPts = sum(b.perSeason || [], (s) => s.points);

  const aClass = (a.perRace || []).filter(isClassified);
  const bClass = (b.perRace || []).filter(isClassified);
  const aAvgFin = aClass.length ? sum(aClass, (r) => r.position) / aClass.length : null;
  const bAvgFin = bClass.length ? sum(bClass, (r) => r.position) / bClass.length : null;
  const aStarts = (a.perRace || []).length;
  const bStarts = (b.perRace || []).length;
  const aDnf = aStarts ? ((aStarts - aClass.length) / aStarts) * 100 : null;
  const bDnf = bStarts ? ((bStarts - bClass.length) / bStarts) * 100 : null;

  const standard = [
    row('championships', 'Titles', 'world', num(ac.championships), num(bc.championships)),
    row('wins', 'Wins', 'grands prix', num(ac.wins), num(bc.wins)),
    row('podiums', 'Podiums', 'top 3', num(ac.podiums), num(bc.podiums)),
    row('poles', 'Poles', 'P1 starts', num(ac.poles), num(bc.poles)),
    row('fastestLaps', 'Fastest laps', 'purple', num(ac.fastestLaps), num(bc.fastestLaps)),
    row('races', 'Starts', 'races', num(ac.races), num(bc.races)),
    row('points', 'Career points', 'all-time', aPts, bPts),
  ].map((r) => ({ ...r, group: 'standard' }));

  const rates = [
    { ...row('winRate', 'Win rate', '% of starts', rate(num(ac.wins), num(ac.races)), rate(num(bc.wins), num(bc.races)), { fmt: 'pct' }) },
    { ...row('podiumRate', 'Podium rate', '% of starts', rate(num(ac.podiums), num(ac.races)), rate(num(bc.podiums), num(bc.races)), { fmt: 'pct' }) },
    { ...row('poleRate', 'Pole rate', '% of starts', rate(num(ac.poles), num(ac.races)), rate(num(bc.poles), num(bc.races)), { fmt: 'pct' }) },
    { ...row('ppr', 'Points / start', 'avg', num(ac.races) ? aPts / num(ac.races) : null, num(bc.races) ? bPts / num(bc.races) : null, { fmt: 'dec1' }) },
    { ...row('avgFinish', 'Avg finish', 'classified', aAvgFin, bAvgFin, { better: 'lo', fmt: 'dec1' }) },
    { ...row('dnfRate', 'DNF rate', '% of starts', aDnf, bDnf, { better: 'lo', fmt: 'pct', verdict: false }) },
  ].map((r) => ({ ...r, group: 'rates' }));

  return { standard, rates };
}

/** JOIN both drivers' per-race logs to find the real rivalry. Priority:
 *  (1) direct teammate duel if they ever shared a garage, else
 *  (2) on-track head-to-head across every race they both started, else
 *  (3) different-eras (never shared a grid). Always returns era-span info. */
export function driverContext(a, b) {
  const aSpan = { from: a.career?.firstYear ?? null, to: a.career?.lastYear ?? null };
  const bSpan = { from: b.career?.firstYear ?? null, to: b.career?.lastYear ?? null };
  const overlap =
    aSpan.from != null && bSpan.from != null &&
    aSpan.from <= (bSpan.to ?? aSpan.from) && bSpan.from <= (aSpan.to ?? bSpan.from);

  // (1) teammate — a's teammate index keyed by rival ref
  const mate = (a.teammates?.byMate || []).find((m) => m.driverRef === b.driverRef);
  if (mate) {
    return {
      type: 'teammate',
      aSpan, bSpan, overlap,
      weekends: mate.weekends,
      years: mate.firstYear === mate.lastYear ? `${mate.firstYear}` : `${mate.firstYear}–${mate.lastYear}`,
      quali: mate.quali,
      race: mate.race,
    };
  }

  // (2) on-track — intersect perRace by year+round
  const bByKey = new Map();
  for (const r of b.perRace || []) bByKey.set(`${r.year}-${r.round}`, r);
  let shared = 0, decided = 0, aAhead = 0, bAhead = 0;
  for (const r of a.perRace || []) {
    const rb = bByKey.get(`${r.year}-${r.round}`);
    if (!rb) continue;
    shared += 1;
    if (isClassified(r) && isClassified(rb)) {
      decided += 1;
      if (r.position < rb.position) aAhead += 1;
      else if (rb.position < r.position) bAhead += 1;
    }
  }
  if (shared > 0) {
    return { type: 'rival', aSpan, bSpan, overlap, shared, decided, aAhead, bAhead };
  }

  // (3) different eras
  return { type: 'era', aSpan, bSpan, overlap: false };
}

/** Fun / novelty facts. Kept separate so the UI can tuck them below the fold. */
function driverExtras(a, b) {
  const out = [];
  const aBorn = yearOf(a.dob), bBorn = yearOf(b.dob);
  if (aBorn && bBorn && aBorn !== bBorn) {
    const gap = Math.abs(aBorn - bBorn);
    const olderRef = aBorn < bBorn ? a.driverRef : b.driverRef;
    out.push({ key: 'genGap', label: 'Generation gap', value: gap, unit: 'years apart', olderRef, aBorn, bBorn });
  }
  const aTeams = new Set((a.perSeason || []).map((s) => s.constructorRef).filter(Boolean));
  const bTeams = new Set((b.perSeason || []).map((s) => s.constructorRef).filter(Boolean));
  out.push({ key: 'teamCount', label: 'Teams driven for', a: aTeams.size, b: bTeams.size, better: 'hi' });
  return out;
}

/** Top-level driver comparison. `a` is the page's driver, `b` the picked rival.
 *  Both are full driver docs. */
export function compareDrivers(a, b) {
  const { standard, rates } = driverRows(a, b);
  const allRows = [...standard, ...rates].filter((r) => r.a != null || r.b != null);
  return {
    kind: 'driver',
    a: identity(a, 'driver'),
    b: identity(b, 'driver'),
    groups: [
      { key: 'standard', title: 'The tale of the tape', rows: standard },
      { key: 'rates', title: 'Rate for rate', rows: rates.filter((r) => r.a != null || r.b != null) },
    ],
    context: driverContext(a, b),
    extras: driverExtras(a, b),
    verdict: tallyVerdict(allRows),
  };
}

// ── team comparison ──────────────────────────────────────────────

function teamRows(a, b) {
  const ac = a.career || {}, bc = b.career || {};
  const aPts = sum(a.perSeason || [], (s) => s.points);
  const bPts = sum(b.perSeason || [], (s) => s.points);
  const bestPos = (t) => {
    const ps = (t.perSeason || []).map((s) => s.position).filter((p) => p != null);
    return ps.length ? Math.min(...ps) : null;
  };

  const standard = [
    row('championships', 'Titles', 'constructors', num(ac.championships), num(bc.championships)),
    row('wins', 'Wins', 'grands prix', num(ac.wins), num(bc.wins)),
    row('podiums', 'Podiums', 'top 3', num(ac.podiums), num(bc.podiums)),
    row('races', 'Races', 'entered', num(ac.races), num(bc.races)),
    row('seasons', 'Seasons', 'in F1', num(ac.seasons), num(bc.seasons)),
    row('driverCount', 'Drivers', 'all-time', num(ac.driverCount), num(bc.driverCount), { verdict: false }),
    row('points', 'Points', 'all-time', aPts, bPts),
  ].map((r) => ({ ...r, group: 'standard' }));

  const rates = [
    { ...row('winRate', 'Win rate', '% of races', rate(num(ac.wins), num(ac.races)), rate(num(bc.wins), num(bc.races)), { fmt: 'pct' }) },
    { ...row('podiumRate', 'Podium rate', '% of races', rate(num(ac.podiums), num(ac.races)), rate(num(bc.podiums), num(bc.races)), { fmt: 'pct' }) },
    { ...row('winsPerSeason', 'Wins / season', 'avg', num(ac.seasons) ? num(ac.wins) / num(ac.seasons) : null, num(bc.seasons) ? num(bc.wins) / num(bc.seasons) : null, { fmt: 'dec1' }) },
    { ...row('bestFinish', 'Best title finish', 'peak', bestPos(a), bestPos(b), { better: 'lo' }) },
  ].map((r) => ({ ...r, group: 'rates' }));

  return { standard, rates };
}

/** JOIN both teams: shared-season constructors'-title record + drivers who
 *  raced for both. */
export function teamContext(a, b) {
  const bByYear = new Map();
  for (const s of b.perSeason || []) bByYear.set(s.year, s);
  let shared = 0, aAhead = 0, bAhead = 0;
  for (const s of a.perSeason || []) {
    const sb = bByYear.get(s.year);
    if (!sb) continue;
    if (s.position != null && sb.position != null) {
      shared += 1;
      if (s.position < sb.position) aAhead += 1;
      else if (sb.position < s.position) bAhead += 1;
    }
  }

  // drivers who raced for both — union of per-season rosters
  const rosterOf = (t) => {
    const m = new Map();
    for (const s of t.perSeason || []) for (const d of s.drivers || []) m.set(d.driverRef, d.name);
    return m;
  };
  const aRoster = rosterOf(a), bRoster = rosterOf(b);
  const sharedDrivers = [];
  for (const [ref, name] of aRoster) if (bRoster.has(ref)) sharedDrivers.push({ driverRef: ref, name });

  return {
    type: 'teams',
    shared, aAhead, bAhead,
    sharedDrivers,
    bestA: a.bestSeason || null,
    bestB: b.bestSeason || null,
  };
}

export function compareTeams(a, b) {
  const { standard, rates } = teamRows(a, b);
  const allRows = [...standard, ...rates].filter((r) => r.a != null || r.b != null);
  return {
    kind: 'team',
    a: identity(a, 'team'),
    b: identity(b, 'team'),
    groups: [
      { key: 'standard', title: 'The tale of the tape', rows: standard },
      { key: 'rates', title: 'Rate for rate', rows: rates.filter((r) => r.a != null || r.b != null) },
    ],
    context: teamContext(a, b),
    verdict: tallyVerdict(allRows),
  };
}

// ── identity (display header for each side) ──────────────────────

function identity(doc, kind) {
  if (kind === 'team') {
    return {
      ref: doc.constructorRef,
      name: doc.name,
      short: doc.short || null,
      color: doc.color || null,
      nationality: doc.nationality || null,
      span: spanLabel(doc.career),
    };
  }
  const latest = (doc.perSeason || [])[0] || null;
  return {
    ref: doc.driverRef,
    name: `${doc.forename} ${doc.surname}`,
    surname: doc.surname,
    code: doc.code || null,
    nationality: doc.nationality || null,
    team: latest?.constructorName || null,
    teamRef: latest?.constructorRef || null,
    span: spanLabel(doc.career),
  };
}

function spanLabel(career) {
  if (!career) return null;
  const { firstYear, lastYear } = career;
  if (firstYear == null) return null;
  return firstYear === lastYear ? `${firstYear}` : `${firstYear}–${lastYear}`;
}

/** Format a row value for display. */
export function fmtVal(v, fmt) {
  if (v == null) return '–';
  if (fmt === 'pct') return `${v.toFixed(1)}%`;
  if (fmt === 'dec1') return v.toFixed(1);
  return v >= 10000 ? v.toLocaleString('en-US') : String(Math.round(v));
}
