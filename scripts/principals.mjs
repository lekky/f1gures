// scripts/principals.mjs
// Hand-curated team-principal tenures + pure helpers used by
// scripts/build-archive.mjs to attach a `principals` field to curated
// team docs. Same pattern as lineages.mjs: data lives here, the stats
// are derived from the already-built team/race archive at build time.
//
// Shape: PRINCIPALS[constructorRef] = tenures[], oldest → newest.
//   { name, from, to }            year-granular tenure (inclusive; to: null = current)
//   { fromRound, toRound }        optional round precision for mid-season
//                                 handovers (e.g. Horner → Mekies, 2025 R13).
//                                 Stats for a round-cut year are computed from
//                                 the race archive docs instead of perSeason.
//   { role }                      optional label; defaults to 'Team Principal'.
//   { alsoRefs }                  optional extra archive refs whose perSeason
//                                 rows merge into the stats window. Ergast
//                                 splits 1960s constructors by engine (Lotus-
//                                 Climax, Brabham-Repco, McLaren-Ford...), so
//                                 without this Chapman's Lotus would miss the
//                                 whole Clark era. Wins/titles sum safely
//                                 across refs (a result row belongs to exactly
//                                 one entry); races takes the busiest ref per
//                                 year, since the same physical race appears
//                                 once per engine entry. Incompatible with
//                                 fromRound/toRound cuts (cut years walk race
//                                 docs on the primary ref only).
//
// Curation rules (keep these when editing):
//   - Only permanent (or season-plus) appointments; short caretaker stints
//     (Bob Bell '09, Simon Roberts '20-21) are left as gaps, not rows.
//   - Gaps are fine - the strip renders tenures, it doesn't claim a complete
//     timeline. Genuinely murky eras (Jaguar '00-04, Toyota, Caterham '14)
//     are omitted entirely rather than guessed at.
//   - A championship is credited to the tenure in charge at the season's
//     final round (so a mid-season sacking hands title credit to the
//     incoming boss - consistent, if occasionally debatable).
//   - Historical tenures are finished facts; only the current grid can go
//     stale. Verified against reporting up to Aug 2026.

export const PRINCIPALS = {
  // ── Current grid ────────────────────────────────────────────────────
  red_bull: [
    { name: 'Christian Horner', from: 2005, to: 2025, toRound: 12 },      // sacked after 2025 British GP
    { name: 'Laurent Mekies',   from: 2025, fromRound: 13, to: null, role: 'Team Principal & CEO' },
  ],
  ferrari: [
    { name: 'Enzo Ferrari',       from: 1950, to: 1988, role: 'Founder' },
    { name: 'Jean Todt',          from: 1993, to: 2007 },
    { name: 'Stefano Domenicali', from: 2008, to: 2014, toRound: 3 },     // resigned Apr 2014 after Bahrain
    { name: 'Marco Mattiacci',    from: 2014, fromRound: 4, to: 2014 },
    { name: 'Maurizio Arrivabene', from: 2015, to: 2018 },
    { name: 'Mattia Binotto',     from: 2019, to: 2022 },
    { name: 'Fred Vasseur',       from: 2023, to: null },
  ],
  mercedes: [
    { name: 'Ross Brawn', from: 2010, to: 2013 },                          // held the TP title through 2013
    { name: 'Toto Wolff', from: 2014, to: null, role: 'Team Principal & CEO' },
  ],
  mclaren: [
    { name: 'Bruce McLaren',     from: 1966, to: 1970, role: 'Founder',
      alsoRefs: ['mclaren-ford', 'mclaren-brm', 'mclaren-seren', 'mclaren-alfa_romeo'] },
    { name: 'Teddy Mayer',       from: 1971, to: 1980 },
    { name: 'Ron Dennis',        from: 1981, to: 2008 },
    { name: 'Martin Whitmarsh',  from: 2009, to: 2013 },
    { name: 'Eric Boullier',     from: 2014, to: 2018, role: 'Racing Director' },
    { name: 'Andreas Seidl',     from: 2019, to: 2022 },
    { name: 'Andrea Stella',     from: 2023, to: null },
  ],
  williams: [
    { name: 'Frank Williams',  from: 1977, to: 2012, role: 'Founder' },
    { name: 'Claire Williams', from: 2013, to: 2020, role: 'Deputy Team Principal' },
    { name: 'Jost Capito',     from: 2021, to: 2022 },
    { name: 'James Vowles',    from: 2023, to: null },
  ],
  aston_martin: [
    { name: 'Otmar Szafnauer', from: 2021, to: 2021 },
    { name: 'Mike Krack',      from: 2022, to: 2024 },
    { name: 'Andy Cowell',     from: 2025, to: 2025, role: 'CEO & Team Principal' },
    { name: 'Adrian Newey',    from: 2026, to: null },                     // announced Nov 2025
  ],
  alpine: [
    // 2021 had no team principal (Brivio/Budkowski split) - left as a gap.
    { name: 'Otmar Szafnauer', from: 2022, to: 2023, toRound: 12 },        // out after 2023 Belgian GP
    { name: 'Bruno Famin',     from: 2023, fromRound: 13, to: 2024, toRound: 14, role: 'Interim Team Principal' },
    { name: 'Oliver Oakes',    from: 2024, fromRound: 15, to: 2025, toRound: 6 }, // resigned after Miami 2025
    { name: 'Flavio Briatore', from: 2025, fromRound: 7, to: 2025, toRound: 15, role: 'Executive Advisor' },
    { name: 'Steve Nielsen',   from: 2025, fromRound: 16, to: null, role: 'Managing Director' }, // day-to-day boss from Sept 2025
  ],
  rb: [
    { name: 'Laurent Mekies', from: 2024, to: 2025, toRound: 12 },
    { name: 'Alan Permane',   from: 2025, fromRound: 13, to: null },
  ],
  audi: [
    { name: 'Jonathan Wheatley', from: 2026, to: 2026, toRound: 2 },       // left two races into 2026
    { name: 'Mattia Binotto',    from: 2026, fromRound: 3, to: null, role: 'Head of Audi F1 Project' },
  ],
  haas: [
    { name: 'Guenther Steiner', from: 2016, to: 2023 },
    { name: 'Ayao Komatsu',     from: 2024, to: null },
  ],
  cadillac: [
    { name: 'Graeme Lowdon',     from: 2026, to: 2026, toRound: 11 },    // sacked before the 2026 Dutch GP
    { name: 'Marcin Budkowski',  from: 2026, fromRound: 12, to: null },
  ],

  // ── Lineage ancestors of the current grid ───────────────────────────
  racing_point: [
    { name: 'Otmar Szafnauer', from: 2019, to: 2020 },
  ],
  force_india: [
    { name: 'Colin Kolles',    from: 2008, to: 2008 },
    { name: 'Vijay Mallya',    from: 2009, to: 2018, toRound: 12, role: 'Team Principal & Owner' },
    { name: 'Otmar Szafnauer', from: 2018, fromRound: 13, to: 2018 },      // Racing Point era from Spa 2018
  ],
  jordan: [
    { name: 'Eddie Jordan', from: 1991, to: 2004, role: 'Founder' },
    { name: 'Colin Kolles', from: 2005, to: 2005 },
  ],
  mf1:    [{ name: 'Colin Kolles', from: 2006, to: 2006 }],
  spyker: [{ name: 'Colin Kolles', from: 2007, to: 2007 }],
  benetton: [
    { name: 'Flavio Briatore', from: 1989, to: 1997, role: 'Managing Director' },
    { name: 'David Richards',  from: 1998, to: 1998 },
    { name: 'Rocco Benetton',  from: 1999, to: 2000 },
    { name: 'Flavio Briatore', from: 2001, to: 2001, role: 'Managing Director' },
  ],
  renault: [
    { name: 'Flavio Briatore', from: 2002, to: 2009, toRound: 13, role: 'Managing Director' }, // out post-Crashgate, Sept 2009
    { name: 'Eric Boullier',   from: 2010, to: 2011 },
    { name: 'Fred Vasseur',    from: 2016, to: 2016 },
    { name: 'Cyril Abiteboul', from: 2017, to: 2020, role: 'Managing Director' },
  ],
  lotus_f1: [
    { name: 'Eric Boullier', from: 2012, to: 2013 },
    { name: 'Gerard Lopez',  from: 2014, to: 2015, role: 'Owner & Team Principal' },
  ],
  toro_rosso: [{ name: 'Franz Tost', from: 2006, to: 2019 }],
  alphatauri: [{ name: 'Franz Tost', from: 2020, to: 2023 }],
  minardi: [
    { name: 'Giancarlo Minardi', from: 1985, to: 1996, role: 'Founder' },
    { name: 'Paul Stoddart',     from: 2001, to: 2005, role: 'Owner & Team Principal' },
  ],
  sauber: [
    { name: 'Peter Sauber',            from: 1993, to: 2005, role: 'Founder' },
    { name: 'Peter Sauber',            from: 2010, to: 2012, role: 'Founder' },
    { name: 'Monisha Kaltenborn',      from: 2013, to: 2017, toRound: 7 }, // left June 2017 after Canada
    { name: 'Fred Vasseur',            from: 2017, fromRound: 10, to: 2018 },
    { name: 'Alessandro Alunni Bravi', from: 2024, to: 2025, toRound: 2, role: 'Team Representative' },
    { name: 'Jonathan Wheatley',       from: 2025, fromRound: 3, to: 2025 }, // started Apr 2025
  ],
  bmw_sauber: [
    { name: 'Mario Theissen', from: 2006, to: 2009, role: 'BMW Motorsport Director' },
  ],
  alfa: [
    { name: 'Fred Vasseur',            from: 2019, to: 2022 },
    { name: 'Alessandro Alunni Bravi', from: 2023, to: 2023, role: 'Team Representative' },
  ],
  bar: [
    { name: 'Craig Pollock', from: 1999, to: 2001 },
    { name: 'David Richards', from: 2002, to: 2004 },
    { name: 'Nick Fry',       from: 2005, to: 2005 },
  ],
  honda: [{ name: 'Nick Fry', from: 2006, to: 2008 }],
  brawn: [{ name: 'Ross Brawn', from: 2009, to: 2009, role: 'Founder & Team Principal' }],
  tyrrell: [{ name: 'Ken Tyrrell', from: 1968, to: 1997, role: 'Founder' }],
  stewart: [{ name: 'Jackie Stewart', from: 1997, to: 1999, role: 'Founder' }],

  // ── Standalone notables ─────────────────────────────────────────────
  prost:       [{ name: 'Alain Prost', from: 1997, to: 2001, role: 'Founder' }],
  arrows:      [{ name: 'Tom Walkinshaw', from: 1997, to: 2002, role: 'Owner & Team Principal' }],
  super_aguri: [{ name: 'Aguri Suzuki', from: 2006, to: 2008, role: 'Founder' }],
  virgin:      [{ name: 'John Booth', from: 2010, to: 2011 }],
  marussia:    [{ name: 'John Booth', from: 2012, to: 2014 }],
  manor: [
    { name: 'John Booth', from: 2015, to: 2015 },
    { name: 'Dave Ryan',  from: 2016, to: 2016, role: 'Racing Director' },
  ],
  team_lotus: [
    { name: 'Colin Chapman', from: 1958, to: 1982, role: 'Founder',
      alsoRefs: ['lotus-climax', 'lotus-ford', 'lotus-brm', 'lotus-borgward', 'lotus-maserati', 'lotus-pw'] },
  ],
  brabham: [
    { name: 'Jack Brabham',      from: 1962, to: 1969, role: 'Founder',
      alsoRefs: ['brabham-climax', 'brabham-brm', 'brabham-repco', 'brabham-ford'] },
    { name: 'Ron Tauranac',      from: 1970, to: 1971, role: 'Owner', alsoRefs: ['brabham-ford'] },
    { name: 'Bernie Ecclestone', from: 1972, to: 1987, role: 'Owner',
      alsoRefs: ['brabham-ford', 'brabham-alfa_romeo'] },
  ],
};

const DEFAULT_ROLE = 'Team Principal';

export function validatePrincipals(data, teamsIndex) {
  const refSet = new Set(teamsIndex.map(t => t.constructorRef));
  for (const [ref, tenures] of Object.entries(data)) {
    if (!refSet.has(ref)) throw new Error(`principals: unknown constructorRef "${ref}"`);
    if (!Array.isArray(tenures) || tenures.length === 0) {
      throw new Error(`principals: "${ref}" has no tenures`);
    }
    let prev = null;
    for (const t of tenures) {
      if (!t.name) throw new Error(`principals: "${ref}" tenure missing name`);
      if (!Number.isInteger(t.from)) throw new Error(`principals: "${ref}" ${t.name} missing from year`);
      if (t.to != null && t.to < t.from) throw new Error(`principals: "${ref}" ${t.name} has to < from`);
      for (const also of t.alsoRefs || []) {
        if (!refSet.has(also)) throw new Error(`principals: "${ref}" ${t.name} has unknown alsoRef "${also}"`);
      }
      if (t.alsoRefs?.length && (t.fromRound != null || t.toRound != null)) {
        throw new Error(`principals: "${ref}" ${t.name} combines alsoRefs with round cuts (unsupported)`);
      }
      if (prev) {
        if (prev.to == null) {
          throw new Error(`principals: "${ref}" open-ended tenure must be last (${prev.name})`);
        }
        if (t.from < prev.to) {
          throw new Error(`principals: "${ref}" ${t.name} overlaps ${prev.name}`);
        }
        if (t.from === prev.to && (prev.toRound == null || t.fromRound == null || t.fromRound <= prev.toRound)) {
          throw new Error(`principals: "${ref}" same-year handover ${prev.name} → ${t.name} needs disjoint toRound/fromRound`);
        }
      }
      prev = t;
    }
  }
}

// The records library's era boundary (modern >= 1981). Kept here so the
// per-tenure `classic` sub-stats line up with the records era toggle.
import { MODERN_ERA_START_YEAR } from './records/helpers.mjs';

// Per-tenure stats from the team doc's perSeason rows. Full seasons come
// straight from perSeason; a year cut mid-season by fromRound/toRound is
// recomputed round-by-round from the race archive (helpers.loadRaceResults),
// so "wins under Horner" excludes the Mekies races. Championships (WCC via
// perSeason.position, WDC via perSeason.drivers[].position) are credited to
// the tenure in charge at the final round, and never for the in-progress
// season (mirrors eraStats in lineages.mjs).
//
// When a tenure touches pre-1981 seasons, the result carries a `classic`
// sub-bucket (same five fields, classic-era share only) so the records
// leaderboards can split all-time / modern / classic exactly - modern is
// simply total minus classic, component-wise. Round-cut years are all
// post-2013, so cut-year contributions never land in the classic bucket.
export function tenureStats(teamDoc, tenure, helpers) {
  const { roundsForYear, loadRaceResults, currentYear, lookupTeam } = helpers;
  const out = { seasons: 0, races: 0, wins: 0, titles: 0, driverTitles: 0 };
  const classic = { seasons: 0, races: 0, wins: 0, titles: 0, driverTitles: 0 };
  if (!teamDoc) return out;
  const toYear = tenure.to ?? Infinity;

  // Group perSeason rows by year across the primary doc plus any alsoRefs
  // (engine-split archive refs that hold part of the era - see header note).
  const docs = [teamDoc];
  for (const ref of tenure.alsoRefs || []) {
    const extra = lookupTeam ? lookupTeam(ref) : null;
    if (extra) docs.push(extra);
  }
  const byYear = new Map();
  for (const doc of docs) {
    for (const s of doc.perSeason || []) {
      if (s.year < tenure.from || s.year > toYear) continue;
      if (!byYear.has(s.year)) byYear.set(s.year, []);
      byYear.get(s.year).push(s);
    }
  }

  for (const [year, rows] of byYear) {
    const isClassic = year < MODERN_ERA_START_YEAR;
    out.seasons += 1;
    if (isClassic) classic.seasons += 1;

    const cutStart = year === tenure.from && tenure.fromRound != null && tenure.fromRound > 1;
    const cutEnd = tenure.to != null && year === tenure.to && tenure.toRound != null;
    let yearRaces = 0;
    let yearWins = 0;
    if (!cutStart && !cutEnd) {
      yearRaces = Math.max(...rows.map(s => s.races || 0));
      yearWins = rows.reduce((sum, s) => sum + (s.wins || 0), 0);
    } else {
      const lo = cutStart ? tenure.fromRound : 1;
      const hi = cutEnd ? tenure.toRound : Infinity;
      for (const round of roundsForYear(year) || []) {
        if (round < lo || round > hi) continue;
        const results = loadRaceResults(year, round);
        if (!results) continue;
        const teamRows = results.filter(r => r.constructorRef === teamDoc.constructorRef);
        if (!teamRows.length) continue;
        yearRaces += 1;
        if (teamRows.some(r => r.position === 1)) yearWins += 1;
      }
    }
    out.races += yearRaces;
    out.wins += yearWins;
    if (isClassic) {
      classic.races += yearRaces;
      classic.wins += yearWins;
    }

    if (year >= currentYear) continue;
    const rounds = roundsForYear(year) || [];
    const lastRound = rounds.length ? rounds[rounds.length - 1] : null;
    if (cutEnd && lastRound != null && tenure.toRound < lastRound) continue;
    if (rows.some(s => s.position === 1)) {
      out.titles += 1;
      if (isClassic) classic.titles += 1;
    }
    if (rows.some(s => (s.drivers || []).some(d => d.position === 1))) {
      out.driverTitles += 1;
      if (isClassic) classic.driverTitles += 1;
    }
  }
  if (Object.values(classic).some(v => v > 0)) out.classic = classic;
  return out;
}

export function buildPrincipalsAttachment(doc, tenures, helpers) {
  return tenures.map(t => ({
    name: t.name,
    role: t.role ?? DEFAULT_ROLE,
    from: t.from,
    fromRound: t.fromRound ?? null,
    to: t.to ?? null,
    toRound: t.toRound ?? null,
    current: t.to == null,
    ...tenureStats(doc, t, helpers),
  }));
}
