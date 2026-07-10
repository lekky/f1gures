import {
  OG_HEIGHT, COLORS, absCard, ogImg, wordmarkEl, urlBottomLeft, barRowsCard, loadFace, loadFlagCC, loadFadedFlagCC,
} from './og-shared.mjs';

const div = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const txt = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)).toUpperCase();
  } catch {
    return iso;
  }
}

// race shape: { name, year, round, date, circuit:{name,country,countryName}, results[] }
export async function renderRaceOg(race) {
  const results = race.results || [];
  // GP name may embed the year (e.g. "British Grand Prix 2024"); the year lives
  // in the kicker, so strip a trailing 4-digit year from the title.
  const gp = (race.name || '').replace(/\s*\d{4}\s*$/, '').trim();
  const circuitShort = (race.circuit?.name || '').replace(/ Circuit$/, '');

  // ── completed: podium top-3 bar rows ──
  if (results.length > 0) {
    const podium = results.slice(0, 3);
    const faces = await Promise.all(podium.map((p) => loadFace(p.driverRef, 96, 96)));
    const rows = podium.map((p, i) => ({
      rank: i + 1,
      name: p.driverName,
      sub: p.constructorName,
      color: p.constructorColor,
      img: faces[i],
      valueMain: p.points,
      valueUnit: 'pts',
    }));
    return barRowsCard({
      kicker: `${race.year} · Round ${race.round}`,
      title: circuitShort ? `${gp} · ${circuitShort}` : gp,
      rows,
    });
  }

  // ── upcoming: date + circuit + flag wash ──
  const cc = race.circuit?.country;
  const [flagChip, flagWash] = await Promise.all([
    loadFlagCC(cc, 46, 31),
    loadFadedFlagCC(cc, 900, OG_HEIGHT, { dir: 'left', maxAlpha: 0.16 }),
  ]);
  const nameSize = gp.length > 20 ? 72 : gp.length > 15 ? 82 : 92;

  const body = div({ flexDirection: 'column', position: 'absolute', top: 148, left: 60, width: 940 }, [
    txt({ fontSize: 28, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.08em' }, `${race.year} · Round ${race.round} · Upcoming`),
    txt({ fontSize: nameSize, fontWeight: 700, lineHeight: 1.02, marginTop: 8 }, gp),
    div({ alignItems: 'center', gap: 14, marginTop: 18 }, [
      flagChip ? ogImg(flagChip, 46, 31, { borderRadius: 4 }) : div({}, []),
      txt({ fontSize: 32, color: COLORS.muted }, race.circuit?.name || ''),
    ]),
    race.date
      ? div({ marginTop: 42, alignItems: 'baseline', gap: 14 }, [
          txt({ fontSize: 20, color: COLORS.fg3, textTransform: 'uppercase', letterSpacing: '0.08em' }, 'Lights out'),
          txt({ fontSize: 40, fontWeight: 700 }, fmtDate(race.date)),
        ])
      : div({}, []),
  ]);

  const wash = flagWash
    ? div({ position: 'absolute', top: 0, left: 0, width: 900, height: OG_HEIGHT }, [ogImg(flagWash, 900, OG_HEIGHT, { objectFit: 'cover' })])
    : div({}, []);
  const wm = div({ position: 'absolute', top: 44, left: 60 }, [wordmarkEl()]);

  return absCard([wash, body, wm, urlBottomLeft()]);
}
