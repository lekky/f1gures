// scripts/social/caption.mjs
//
// Turns a chosen candidate into the words that ship: a short headline (also
// used as the card title and the TikTok post title), the caption body, alt
// text, and hashtags.
//
// Every sentence here is assembled from numbers the candidate already carries.
// There is no generative step and no claim that is not in the archive - that is
// what makes it safe to post unattended. Two phrasings are deliberate:
//
//   - Birthdays are always "born on this day in YYYY", never "turns N today".
//     Ergast carries no date of death, so an age claim would eventually be
//     written about someone who has died.
//   - Nothing is called a "record" unless it is literally row 1 of a records
//     leaderboard.

import { longDate, dayMonth, ordinal, plural, possessive, clamp } from './format.mjs';

export const SITE = 'https://f1gures.app';

// Platform ceilings we compose against.
export const LIMITS = {
  instagram: { caption: 2200, hashtags: 30 },
  facebook: { caption: 5000, hashtags: 30 },
  tiktok: { title: 90, description: 4000, hashtags: 30 },
};

const BASE_TAGS = ['F1', 'Formula1', 'f1gures'];

/** Strip a name/word down to a usable hashtag token. */
function tag(...parts) {
  const raw = parts.filter(Boolean).join(' ');
  const cleaned = raw
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // dérive accents -> ascii
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
  return cleaned.length >= 2 ? cleaned : null;
}

function tagsFor(extra = []) {
  const seen = new Set();
  const out = [];
  for (const t of [...BASE_TAGS, ...extra]) {
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, LIMITS.instagram.hashtags);
}

const driverName = (d) => (d ? `${d.forename} ${d.surname}`.trim() : '');

/**
 * Join body lines, keeping deliberate '' spacers but dropping absent ones
 * (null/false from a conditional). A plain .filter(Boolean) would eat the
 * blank lines that give the caption its shape.
 */
function lines(...parts) {
  return parts
    .filter((l) => l !== null && l !== undefined && l !== false)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')   // collapse gaps left by dropped conditionals
    .trim();
}

/** Champion years from a driver's per-season rows, e.g. [1998, 1999]. */
function championYears(driver) {
  return (driver?.perSeason || [])
    .filter((s) => s.position === 1)
    .map((s) => s.year)
    .sort((a, b) => a - b);
}

/** "P1 Max Verstappen (Red Bull)" style podium line. */
function podiumLines(rows) {
  return rows.map((r) => `P${r.position} ${r.driverName}${r.constructorName ? ` (${r.constructorName})` : ''}`);
}

/** "106 wins · 104 poles · 7 titles" - only the non-zero parts. */
function careerLine(career = {}) {
  const bits = [];
  if (career.championships) bits.push(plural(career.championships, 'title'));
  if (career.wins) bits.push(plural(career.wins, 'win'));
  if (career.poles) bits.push(plural(career.poles, 'pole'));
  if (career.podiums) bits.push(plural(career.podiums, 'podium'));
  if (!bits.length && career.races) bits.push(plural(career.races, 'start'));
  return bits.join(' · ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-angle composers. Each returns { headline, kicker, body, tags, alt }.
// ─────────────────────────────────────────────────────────────────────────────

const COMPOSERS = {
  'race-result'({ race, podium }) {
    const winner = podium[0];
    const rows = podiumLines(podium);
    return {
      kicker: `${race.year} · Round ${race.round}`,
      headline: `${winner.driverName} wins the ${race.name}`,
      body: lines(
        `${winner.driverName} takes victory at ${race.circuit?.name || race.name}.`,
        '',
        ...rows,
        '',
        winner.grid ? `Started ${ordinal(winner.grid)} on the grid.` : null,
      ),
      tags: tagsFor([
        tag(race.name), tag(winner.driverName), tag(winner.constructorName),
        tag(race.circuit?.countryName), 'GrandPrix',
      ]),
      alt: `Result card: ${winner.driverName} won the ${race.year} ${race.name}. ${rows.join(', ')}.`,
    };
  },

  'quali-result'({ race, podium }) {
    const pole = podium[0];
    const rows = podium.map((r) => `P${r.position} ${r.driverName}${r.constructorName ? ` (${r.constructorName})` : ''}`);
    return {
      kicker: `${race.year} · Qualifying`,
      headline: `${pole.driverName} takes pole for the ${race.name}`,
      body: lines(
        `${pole.driverName} starts the ${race.name} from pole${pole.q3 ? `, with a ${pole.q3}` : ''}.`,
        '',
        ...rows,
        '',
        `Full grid and session times: ${SITE}/races/${race.year}/${race.round}/`,
      ),
      tags: tagsFor([
        tag(race.name), tag(pole.driverName), tag(pole.constructorName),
        'Qualifying', 'Pole', 'GrandPrix',
      ]),
      alt: `Qualifying card: ${pole.driverName} on pole for the ${race.year} ${race.name}. ${rows.join(', ')}.`,
    };
  },

  'sprint-result'({ race, podium }) {
    const winner = podium[0];
    const rows = podium.map((r) => `P${r.position} ${r.driverName}${r.constructorName ? ` (${r.constructorName})` : ''}`);
    return {
      kicker: `${race.year} · Sprint`,
      headline: `${winner.driverName} wins the ${race.name} sprint`,
      body: lines(
        `${winner.driverName} takes the sprint at ${race.circuit?.name || race.name}.`,
        '',
        ...rows,
        '',
        `Full weekend analysis: ${SITE}/races/${race.year}/${race.round}/`,
      ),
      tags: tagsFor([
        tag(race.name), tag(winner.driverName), tag(winner.constructorName),
        'F1Sprint', 'GrandPrix',
      ]),
      alt: `Sprint result card: ${winner.driverName} won the ${race.year} ${race.name} sprint. ${rows.join(', ')}.`,
    };
  },

  'race-preview'({ race, circuit, lastWinner, inDays }) {
    const when = inDays === 0 ? 'today' : inDays === 1 ? 'tomorrow' : `in ${plural(inDays, 'day')}`;
    const venue = circuit?.name || race.name;
    const most = (circuit?.mostWins || [])[0];
    return {
      kicker: `${race.year} · Round ${race.round}`,
      headline: `Next up: the ${race.name}`,
      body: lines(
        `Round ${race.round} of the ${race.year} season goes racing ${when} at ${venue}.`,
        lastWinner ? `Last time out here: ${lastWinner.winnerName} won in ${lastWinner.year}.` : null,
        most ? `All-time wins at this circuit: ${most.name} with ${most.count}.` : null,
        '',
        `Session times, weather and the full form guide: ${SITE}/races/${race.year}/${race.round}/`,
      ),
      tags: tagsFor([
        tag(race.name), tag(circuit?.countryName || race.circuitRef), 'RaceWeek', 'GrandPrix',
      ]),
      alt: `Preview card for the ${race.year} ${race.name} at ${venue}.`,
    };
  },

  'on-this-day'({ race, podium, age, isFirstWin, isFinale, champion }) {
    const winner = podium[0];
    const rows = podiumLines(podium);
    return {
      kicker: `On this day · ${race.year}`,
      headline: `${winner.driverName} wins the ${race.year} ${race.name}`,
      body: lines(
        `On this day in ${race.year} — ${plural(age, 'year')} ago — ${winner.driverName} won the ${race.name} at ${race.circuit?.name || 'the circuit'}.`,
        isFirstWin ? `It was the first grand prix win of ${possessive(winner.driverName)} career.` : null,
        isFinale && champion ? `It closed the ${race.year} season, with ${champion} taking the title.` : null,
        '',
        ...rows,
      ),
      tags: tagsFor([
        'OnThisDay', tag(winner.driverName), tag(winner.constructorName),
        tag(race.name), tag(race.circuit?.countryName), 'F1History',
      ]),
      alt: `On this day card: ${winner.driverName} won the ${race.year} ${race.name}. ${rows.join(', ')}.`,
    };
  },

  'driver-birthday'({ driver, bornYear }) {
    const name = driverName(driver);
    const c = driver.career || {};
    const titles = championYears(driver);
    return {
      kicker: 'Born on this day',
      headline: name,
      body: lines(
        `${name} was born on this day in ${bornYear}.`,
        `${driver.nationality || ''} · ${c.firstYear}–${c.lastYear} · ${plural(c.races || 0, 'start')}`.trim(),
        careerLine(c),
        titles.length ? `World champion in ${titles.join(', ')}.` : null,
        '',
        `Full career record: ${SITE}/drivers/${driver.driverRef}/`,
      ),
      tags: tagsFor([tag(name), tag(driver.nationality), 'F1History', 'OnThisDay']),
      alt: `Card marking ${name}, born ${longDate(driver.dob)}. ${careerLine(c)}.`,
    };
  },

  'record-board'({ config, rows }) {
    const listed = rows.map((r, i) => `${i + 1}. ${r.name} — ${r.valueLabel || r.value}`);
    return {
      kicker: 'All-time record',
      headline: config.title,
      body: lines(
        `${config.title} — the all-time top five.`,
        '',
        ...listed,
        '',
        `Full top 50, plus modern and classic era splits: ${SITE}/records/${config.id}/`,
      ),
      tags: tagsFor([
        'F1Records', 'F1Stats', ...rows.slice(0, 3).map((r) => tag(r.name)),
      ]),
      alt: `Leaderboard card: ${config.title}. ${listed.join('. ')}.`,
    };
  },

  'standings-snapshot'({ year, roundsDone, roundsTotal, rows, afterRaceName }) {
    const listed = rows.map((r, i) => {
      const d = r.driver || {};
      return `${i + 1}. ${d.first ? `${d.first} ${d.last}` : d.last || ''} — ${r.points} pts`;
    });
    const gap = rows.length > 1 ? rows[0].points - rows[1].points : 0;
    const leader = rows[0]?.driver?.last || 'The leader';
    return {
      kicker: `${year} championship`,
      headline: `After ${plural(roundsDone, 'round')}`,
      body: lines(
        `The ${year} drivers' championship after ${afterRaceName ? `the ${afterRaceName}` : `round ${roundsDone}`} — ${roundsDone} of ${roundsTotal} rounds done.`,
        '',
        ...listed,
        '',
        gap > 0 ? `${leader} leads by ${plural(gap, 'point')}.` : 'The top two are level on points.',
        `Live standings: ${SITE}/standings-drivers/`,
      ),
      tags: tagsFor([`F1${year}`, 'F1Standings', 'Championship', ...rows.slice(0, 3).map((r) => tag(r.driver?.last))]),
      alt: `Standings card: ${year} drivers' championship after ${roundsDone} rounds. ${listed.join('. ')}.`,
    };
  },

  'driver-spotlight'({ driver }) {
    const name = driverName(driver);
    const c = driver.career || {};
    const titles = championYears(driver);
    const best = (driver.perSeason || []).filter((s) => s.position).sort((a, b) => a.position - b.position)[0];
    return {
      kicker: 'Driver profile',
      headline: name,
      body: lines(
        `${name} — ${driver.nationality || ''}, ${c.firstYear}–${c.lastYear}.`.replace(' — ,', ' —'),
        careerLine(c),
        titles.length
          ? `World champion in ${titles.join(', ')}.`
          : best ? `Best championship finish: ${ordinal(best.position)} in ${best.year} with ${best.constructorName}.` : null,
        '',
        `Every race, every teammate duel: ${SITE}/drivers/${driver.driverRef}/`,
      ),
      tags: tagsFor([tag(name), tag(driver.nationality), 'F1Stats', 'F1History']),
      alt: `Driver card for ${name}. ${careerLine(c)}.`,
    };
  },

  'team-spotlight'({ team }) {
    const c = team.career || {};
    const bs = team.bestSeason;
    const topDriver = (team.topDrivers || [])[0];
    return {
      kicker: 'Constructor profile',
      headline: team.name,
      body: lines(
        `${team.name} — ${c.firstYear}–${c.lastYear}, ${plural(c.seasons || 0, 'season')} in Formula 1.`,
        careerLine(c),
        bs ? `Best season: ${bs.year} — ${plural(bs.wins, 'win')} from ${plural(bs.races, 'race')}.` : null,
        topDriver ? `Most wins for the team: ${topDriver.name} with ${topDriver.wins}.` : null,
        '',
        `Full team history: ${SITE}/teams/${team.constructorRef}/`,
      ),
      tags: tagsFor([tag(team.name), tag(team.nationality), 'F1Teams', 'F1History']),
      alt: `Constructor card for ${team.name}. ${careerLine(c)}.`,
    };
  },

  'circuit-spotlight'({ circuit }) {
    const most = (circuit.mostWins || [])[0];
    const pole = (circuit.mostPoles || [])[0];
    const latest = (circuit.races || [])[0];
    return {
      kicker: 'Circuit profile',
      headline: circuit.name,
      body: lines(
        `${circuit.name} — ${circuit.location}, ${circuit.countryName}.`,
        `${plural(circuit.raceCount || 0, 'world championship race')} held here, ${circuit.firstYear}–${circuit.lastYear}.`,
        most ? `Most wins: ${most.name} (${most.count}).` : null,
        pole ? `Most poles: ${pole.name} (${pole.count}).` : null,
        latest ? `Last winner: ${latest.winnerName} in ${latest.year}.` : null,
        '',
        `Track guide and full race history: ${SITE}/circuits/${circuit.circuitRef}/`,
      ),
      tags: tagsFor([tag(circuit.name), tag(circuit.countryName), 'F1Circuits', 'GrandPrix']),
      alt: `Circuit card for ${circuit.name} in ${circuit.location}, ${circuit.countryName}.`,
    };
  },

  'head-to-head'({ matchup, a, b }) {
    const ac = a?.career || {};
    const bc = b?.career || {};
    const line = (d, c) => `${driverName(d)} — ${careerLine(c)}`;
    return {
      kicker: matchup.tag || 'Head to head',
      headline: `${matchup.aLabel} vs ${matchup.bLabel}`,
      body: lines(
        matchup.reason || `${matchup.aName} against ${matchup.bName}.`,
        '',
        line(a, ac),
        line(b, bc),
        '',
        `Compare them side by side: ${SITE}/compare/?type=driver&a=${matchup.a}&b=${matchup.b}`,
      ),
      tags: tagsFor([tag(matchup.aName), tag(matchup.bName), 'F1Rivalry', 'HeadToHead', 'F1History']),
      alt: `Head-to-head card: ${matchup.aName} versus ${matchup.bName}.`,
    };
  },

  trivia({ fact }) {
    return {
      kicker: 'Did you know?',
      headline: clamp(fact.text, 120),
      body: lines(
        fact.text,
        '',
        `More F1 numbers than you can use: ${SITE}`,
      ),
      tags: tagsFor(['F1Facts', 'DidYouKnow', 'F1History', 'F1Stats']),
      alt: `Fact card: ${fact.text}`,
    };
  },
};

/**
 * Compose the post copy for a hydrated candidate.
 * @returns {{headline, kicker, body, alt, tags, link, caption, tiktokTitle}}
 */
export function composeCaption(candidate) {
  const composer = COMPOSERS[candidate.angle];
  if (!composer) throw new Error(`No caption composer for angle "${candidate.angle}"`);
  const parts = composer(candidate.data);

  const link = candidate.link ? `${SITE}${candidate.link}` : SITE;
  const hashtagLine = parts.tags.map((t) => `#${t}`).join(' ');

  // Instagram does not linkify captions, so the URL is included as readable
  // text and repeated in the body where it is most useful.
  const caption = clamp(
    [parts.body, '', hashtagLine].join('\n').trim(),
    LIMITS.instagram.caption,
  );

  return {
    ...parts,
    link,
    caption,
    hashtagLine,
    tiktokTitle: clamp(parts.headline, LIMITS.tiktok.title),
  };
}
