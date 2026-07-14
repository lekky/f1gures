// Aggregates all-time F1 driver achievements by the driver's home country, for
// the /map/ world-map island. Pure functions (no fs) so it's unit-testable and
// callable from the build-archive final pass, where fully-merged driver docs
// (post-Ergast bundles included) are already in memory.
//
// Output shape (written to public/data/archive/_countries.json):
//   {
//     metrics: ['drivers','wins','poles','podiums','championships','dnfs'],
//     countries: {
//       GB: {
//         country: 'GB', nationality: 'British', flag: '🇬🇧',
//         drivers, wins, poles, podiums, championships, dnfs,
//         top: { wins: {driverRef,name,value}, poles: {...}, ... }
//       }, ...
//     }
//   }
//
// A "country" merges every demonym that resolves to the same ISO-2 code
// (American + American-Italian → US, German + East German → DE, etc.).

export const COUNTRY_METRICS = ['drivers', 'wins', 'poles', 'podiums', 'championships', 'dnfs'];

// Career DNF rule — mirrors the per-race tally in build-archive.mjs: a result
// counts as a retirement unless the driver was classified "Finished" or a
// lapped "+N Lap(s)" finisher.
export function isRetirement(status) {
  const s = (status || '').trim();
  if (!s) return false;
  if (s === 'Finished') return false;
  if (/^\+\d+ Lap/.test(s)) return false;
  return true;
}

function fullName(doc) {
  return `${doc.forename || ''} ${doc.surname || ''}`.trim() || doc.driverRef;
}

// Metrics whose per-driver value we can read straight off doc.career.
const CAREER_KEYS = { wins: 'wins', poles: 'poles', podiums: 'podiums', championships: 'championships' };

/**
 * @param {Array} driverDocs  fully-merged driver docs, each with `natInfo`
 *   ({country, flag}) attached, plus `career` totals and `perRace` rows.
 * @returns {{metrics: string[], countries: Object}}
 */
export function buildCountryStats(driverDocs) {
  const byCountry = new Map();

  for (const doc of driverDocs) {
    const info = doc.natInfo || {};
    const iso = info.country;
    if (!iso) continue; // unknown nationality — nothing to place on the map

    let entry = byCountry.get(iso);
    if (!entry) {
      entry = {
        country: iso,
        flag: info.flag && info.flag !== '🏳' ? info.flag : null,
        // demonym vote: the most common nationality string resolving to this ISO
        _natVotes: new Map(),
        drivers: 0,
        wins: 0,
        poles: 0,
        podiums: 0,
        championships: 0,
        dnfs: 0,
        top: {},
      };
      byCountry.set(iso, entry);
    }

    if (doc.nationality) {
      entry._natVotes.set(doc.nationality, (entry._natVotes.get(doc.nationality) || 0) + 1);
    }
    if (!entry.flag && info.flag && info.flag !== '🏳') entry.flag = info.flag;

    entry.drivers += 1;

    const career = doc.career || {};
    const dnfs = (doc.perRace || []).reduce((n, r) => n + (isRetirement(r.status) ? 1 : 0), 0);
    const values = {
      wins: career.wins || 0,
      poles: career.poles || 0,
      podiums: career.podiums || 0,
      championships: career.championships || 0,
      dnfs,
    };

    for (const metric of Object.keys(values)) {
      const v = values[metric];
      entry[metric] += v;
      if (v > 0) {
        const cur = entry.top[metric];
        if (!cur || v > cur.value) {
          entry.top[metric] = { driverRef: doc.driverRef, name: fullName(doc), value: v };
        }
      }
    }
  }

  const countries = {};
  for (const [iso, entry] of byCountry) {
    // Resolve representative demonym (highest vote, ties broken alphabetically).
    let nationality = null;
    let best = -1;
    for (const [nat, votes] of [...entry._natVotes].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (votes > best) { best = votes; nationality = nat; }
    }
    delete entry._natVotes;
    entry.nationality = nationality;
    countries[iso] = entry;
  }

  return { metrics: COUNTRY_METRICS, countries };
}
