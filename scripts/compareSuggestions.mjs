// Compare-suggestions generator — builds the rotating pool of head-to-heads for
// the /compare/ launcher. Runs as a final pass of build-archive.mjs and writes
// public/data/archive/_compare-suggestions.json ({ driver: [...], team: [...] }).
//
// Design goals:
//  - MANY different, meaningful pairings so the featured picks never feel canned.
//    The launcher fetches this pool and shuffles it client-side on every load.
//  - Data-derived reasons: five strategies mine the archive (teammate duels,
//    title twins, same-nation greats, win-list neighbours, cross-era champions).
//  - A small hand-curated seed (src/data/compareMatchups.js) is folded in FIRST
//    so signature rivalries / bloodlines / cross-generation pairings — the ones
//    raw stats can't phrase — always outrank a generated pair on the same slug.
//  - DETERMINISTIC: no Math.random here (that would break reproducible builds and
//    the OG/feed caches). All rotation happens client-side.
//  - Only entities WITH a face/logo are eligible, so every card shows an image.

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const cmpRef = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const yearsLabel = (a, b) => (a === b ? `${a}` : `${a}–${b}`);

// Round-robin drain: take one fresh (unseen) pair from each list in turn so the
// final pool is a diverse blend rather than 300 of the same generator, up to cap.
function interleave(lists, seen, out, cap) {
  const queues = lists.map((l) => l.slice());
  let progressed = true;
  while (out.length < cap && progressed) {
    progressed = false;
    for (const q of queues) {
      while (q.length) {
        const m = q.shift();
        const k = pairKey(m.a, m.b);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(m);
        progressed = true;
        break;
      }
      if (out.length >= cap) break;
    }
  }
  return out;
}

// ── driver generators ────────────────────────────────────────────
function driverStrategies(enrich, driverDocs) {
  const all = [...enrich.values()];
  const notable = (d) => d.wins >= 1 || d.champs >= 1;
  // "established" keeps long-career journeymen (Hülkenberg, Sutil) but drops
  // one-season backmarkers, so a teammate card is never a star vs a nobody.
  const established = (d) => d.wins >= 1 || d.champs >= 1 || d.races >= 50;

  // 1) Teammate duels — every driver doc lists its team-mates with real H2H.
  const teammates = [];
  for (const doc of driverDocs) {
    const a = doc.driverRef;
    const ea = enrich.get(a);
    if (!ea) continue;
    for (const m of doc.teammates?.byMate || []) {
      const eb = enrich.get(m.driverRef);
      if (!eb || (m.weekends || 0) < 8) continue;
      // both must have a real career, and at least one must be genuinely notable
      if (!established(ea) || !established(eb) || (!notable(ea) && !notable(eb))) continue;
      teammates.push({
        a, b: m.driverRef, tag: 'Teammates',
        reason: `${m.weekends} weekends in the same garage (${yearsLabel(m.firstYear, m.lastYear)}).`,
        _w: ea.wins + eb.wins + (ea.champs + eb.champs) * 20 + (m.weekends || 0) * 0.05,
      });
    }
  }

  // 2) Title twins — champions grouped by exact championship count.
  const titleTwins = [];
  const tiers = new Map();
  for (const d of all) if (d.champs >= 1) (tiers.get(d.champs) || tiers.set(d.champs, []).get(d.champs)).push(d);
  for (const [t, arr] of [...tiers.entries()].sort((x, y) => y[0] - x[0])) {
    arr.sort((a, b) => b.score - a.score || cmpRef(a.ref, b.ref));
    for (let i = 0; i < arr.length; i++) {
      for (let k = 1; k <= 3 && i + k < arr.length; k++) {
        const a = arr[i], b = arr[i + k];
        titleTwins.push({
          a: a.ref, b: b.ref, tag: `${t}× champions`,
          reason: `Both ${t}-time World Champion${t > 1 ? 's' : ''}.`, _w: a.score + b.score,
        });
      }
    }
  }

  // 3) Same-nation greats — race winners sharing a nationality.
  const sameNation = [];
  const nats = new Map();
  for (const d of all) if (d.wins >= 3 && d.nat) (nats.get(d.nat) || nats.set(d.nat, []).get(d.nat)).push(d);
  for (const [nat, arr] of nats) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => b.score - a.score || cmpRef(a.ref, b.ref));
    for (let i = 0; i < arr.length; i++) {
      for (let k = 1; k <= 2 && i + k < arr.length; k++) {
        const a = arr[i], b = arr[i + k];
        sameNation.push({
          a: a.ref, b: b.ref, tag: nat.length <= 12 ? nat : 'Same nation',
          reason: `Two of the finest ${nat} drivers, wheel to wheel.`, _w: a.score + b.score,
        });
      }
    }
  }

  // 4) Win-list neighbours — adjacent on the all-time wins order.
  const winNeighbours = [];
  const byWins = all.filter((d) => d.wins >= 8).sort((a, b) => b.wins - a.wins || cmpRef(a.ref, b.ref));
  for (let i = 0; i + 1 < byWins.length; i++) {
    const a = byWins[i], b = byWins[i + 1];
    winNeighbours.push({
      a: a.ref, b: b.ref, tag: 'Win list',
      reason: `${a.wins} wins vs ${b.wins} — side by side on the all-time list.`, _w: a.wins + b.wins,
    });
  }

  // 5) Cross-era champions — title-holders whose careers never overlapped.
  const crossEra = [];
  const champs = all.filter((d) => d.champs >= 1).sort((a, b) => a.first - b.first || cmpRef(a.ref, b.ref));
  for (let i = 0; i < champs.length; i++) {
    let taken = 0;
    for (let j = i + 1; j < champs.length && taken < 3; j++) {
      const a = champs[i], b = champs[j];
      if (a.last >= b.first) continue;                 // careers overlapped — skip
      crossEra.push({
        a: a.ref, b: b.ref, tag: 'Across eras',
        reason: `${a.champs}× champion vs ${b.champs}× — careers ${b.first - a.last} years apart.`,
        _w: (a.champs + b.champs) * 10 + (b.first - a.last),
      });
      taken++;
    }
  }

  return [teammates, titleTwins, sameNation, winNeighbours, crossEra]
    .map((l) => l.sort((x, y) => y._w - x._w || cmpRef(pairKey(x.a, x.b), pairKey(y.a, y.b))));
}

// ── team generators ──────────────────────────────────────────────
function teamStrategies(enrich) {
  const all = [...enrich.values()];

  const titleTwins = [];
  const tiers = new Map();
  for (const d of all) if (d.champs >= 1) (tiers.get(d.champs) || tiers.set(d.champs, []).get(d.champs)).push(d);
  for (const [t, arr] of tiers) {
    arr.sort((a, b) => b.wins - a.wins || cmpRef(a.ref, b.ref));
    for (let i = 0; i < arr.length; i++) for (let k = 1; k <= 3 && i + k < arr.length; k++) {
      const a = arr[i], b = arr[i + k];
      titleTwins.push({ a: a.ref, b: b.ref, tag: `${t}× champions`, reason: `Both ${t}-time Constructors' Champions.`, _w: a.wins + b.wins });
    }
  }

  const eraRivals = [];
  const winners = all.filter((d) => d.wins >= 5);
  for (let i = 0; i < winners.length; i++) for (let j = i + 1; j < winners.length; j++) {
    const a = winners[i], b = winners[j];
    const os = Math.max(a.first, b.first), oe = Math.min(a.last, b.last);
    if (os > oe) continue;                             // never active together
    const decade = Math.floor(((os + oe) / 2) / 10) * 10;
    eraRivals.push({ a: a.ref, b: b.ref, tag: 'Era rivals', reason: `Rivals of the ${decade}s.`, _w: a.wins + b.wins });
  }

  const winNeighbours = [];
  const byWins = all.filter((d) => d.wins >= 3).sort((a, b) => b.wins - a.wins || cmpRef(a.ref, b.ref));
  for (let i = 0; i + 1 < byWins.length; i++) {
    const a = byWins[i], b = byWins[i + 1];
    winNeighbours.push({ a: a.ref, b: b.ref, tag: 'Win list', reason: `${a.wins} wins vs ${b.wins}, marque against marque.`, _w: a.wins + b.wins });
  }

  return [titleTwins, eraRivals, winNeighbours]
    .map((l) => l.sort((x, y) => y._w - x._w || cmpRef(pairKey(x.a, x.b), pairKey(y.a, y.b))));
}

// ── orchestrator ─────────────────────────────────────────────────
/**
 * @param {object}   o
 * @param {object[]} o.driverIndex   _drivers-index.json entries
 * @param {object[]} o.teamsIndex    _teams-index.json entries
 * @param {object[]} o.driverDocs    full driver docs (for teammates.byMate)
 * @param {(ref:string)=>boolean} o.hasDriverFace
 * @param {(ref:string)=>boolean} o.hasTeamLogo
 * @param {object[]} o.curatedDrivers  seed [{a,b,tag,reason}]
 * @param {object[]} o.curatedTeams
 * @param {{driver?:number, team?:number}} [o.caps]
 */
export function buildCompareSuggestions({
  driverIndex, teamsIndex, driverDocs = [],
  hasDriverFace = () => true, hasTeamLogo = () => true,
  curatedDrivers = [], curatedTeams = [], caps = {},
}) {
  const driverEnrich = new Map();
  for (const e of driverIndex) {
    if (!e.driverRef || !hasDriverFace(e.driverRef)) continue;
    driverEnrich.set(e.driverRef, {
      ref: e.driverRef, label: e.surname, name: `${e.forename} ${e.surname}`.trim(),
      color: e.teamColor || '#888', champs: e.championships || 0, wins: e.wins || 0,
      races: e.races || 0, first: e.firstYear || 0, last: e.lastYear || 0, nat: e.nationality || '',
      score: (e.championships || 0) * 1000 + (e.wins || 0) * 10 + (e.races || 0),
    });
  }
  const teamEnrich = new Map();
  for (const e of teamsIndex) {
    if (!e.constructorRef || !hasTeamLogo(e.constructorRef)) continue;
    if ((e.championships || 0) < 1 && (e.wins || 0) < 1) continue;   // notable marques only
    teamEnrich.set(e.constructorRef, {
      ref: e.constructorRef, label: e.name, name: e.name,
      color: e.color || '#888', champs: e.championships || 0, wins: e.wins || 0,
      first: e.firstYear || 0, last: e.lastYear || 0, nat: e.nationality || '',
    });
  }

  const finalize = (raw, enrich) => {
    const e = (ref) => enrich.get(ref);
    const out = [];
    for (const m of raw) {
      const a = e(m.a), b = e(m.b);
      if (!a || !b || a.ref === b.ref) continue;
      out.push({
        a: a.ref, b: b.ref,
        aLabel: a.label, bLabel: b.label,
        aName: a.name, bName: b.name,
        aColor: a.color, bColor: b.color,
        tag: m.tag, reason: m.reason,
      });
    }
    return out;
  };

  const assemble = (curated, strategies, enrich, cap) => {
    const seen = new Set();
    const out = [];
    // curated first: validated against enrich, wins dedup on any shared slug
    for (const c of curated) {
      if (!enrich.has(c.a) || !enrich.has(c.b) || c.a === c.b) continue;
      const k = pairKey(c.a, c.b);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
    interleave(strategies, seen, out, cap);
    return finalize(out, enrich);
  };

  return {
    driver: assemble(curatedDrivers, driverStrategies(driverEnrich, driverDocs), driverEnrich, caps.driver ?? 400),
    team: assemble(curatedTeams, teamStrategies(teamEnrich), teamEnrich, caps.team ?? 90),
  };
}
