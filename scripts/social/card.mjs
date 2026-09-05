// scripts/social/card.mjs
//
// Renders a chosen candidate to branded PNG cards.
//
// Eleven angles share four layouts - hero, leaderboard, fact and versus - so
// the feed reads as one publication rather than eleven one-off templates, and
// so a new angle usually needs no new drawing code at all.

import { loadFace, loadLogo, loadFlag, loadTrackMap } from '../og-templates/og-shared.mjs';
import { seasonBundle } from './sources.mjs';
import {
  FORMATS, DEFAULT_FORMATS, renderPng, metrics, card, div, txt, img,
  statBlock, barRow, eyebrow, fitFontSize, alpha, ADVANCE, COLORS, PODIUM_COLORS,
} from './cardkit.mjs';
import { plural } from './format.mjs';

/** "106 wins" -> "wins". Records ship a combined label; the row wants them apart. */
function unitOf(valueLabel, value) {
  const s = String(valueLabel ?? '');
  const stripped = s.replace(String(value ?? ''), '').trim();
  return stripped || '';
}

/** bundle team id -> colour, for standings rows (which carry only the id). */
function teamColors(year) {
  const bundle = seasonBundle(year);
  const map = new Map();
  for (const t of bundle?.teams || []) map.set(t.id, t.color);
  return map;
}

// Every headshot in public/images/drivers is 360x440. Cover-cropping into a
// box near that aspect keeps the whole head; a wider box cuts it at the eyes.
const FACE_ASPECT = 360 / 440;

/** Bars are read against the leader, so the top row always fills. */
function withPct(rows, valueKey = 'rawValue') {
  const top = Math.max(...rows.map((r) => Number(r[valueKey]) || 0), 0);
  return rows.map((r) => ({ ...r, pct: top > 0 ? (Number(r[valueKey]) || 0) / top : 0 }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Layouts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hero: a bleeding subject image, an uppercase condensed headline, and a mono
 * stat strip. Driver / team / circuit spotlights, birthdays, race previews.
 */
async function heroLayout(m, { kicker, headline, sub, stats, accent, faceRef, trackRef, logoRef, nationality, footerRight, ghost }) {
  const faceW = Math.round(m.w * 0.5);
  const faceH = Math.round(faceW / FACE_ASPECT);
  const bandH = trackRef || logoRef ? Math.round(m.h * 0.3) : faceH;

  const [face, track, logo, flag] = await Promise.all([
    faceRef ? loadFace(faceRef, faceW, faceH) : null,
    trackRef ? loadTrackMap(trackRef, Math.round(m.inner * 0.95), bandH) : null,
    logoRef ? loadLogo(logoRef, Math.round(bandH * 0.72)) : null,
    nationality ? loadFlag(nationality, Math.round(m.body * 1.45), Math.round(m.body)) : null,
  ]);

  let hero;
  if (face) {
    // Bleeding off the right edge behind a gradient, so the headline below has
    // clean ground to sit on and the portrait is never boxed or chin-cropped.
    hero = div({
      width: m.w, height: faceH, marginLeft: -m.pad, marginRight: -m.pad,
      position: 'relative', flexShrink: 0, justifyContent: 'flex-end',
    }, [
      img(face, faceW, faceH, { objectFit: 'cover' }),
      // Three overlays dissolve every edge of the crop into the ground. The
      // horizontal stop has to start fading *inside* the image (it begins at
      // m.w - faceW), or its hard left edge stays visible as a seam.
      div({ position: 'absolute', top: 0, left: 0, width: m.w, height: faceH,
        backgroundImage: `linear-gradient(90deg, ${COLORS.bg1} 44%, rgba(6,7,9,0) 86%)` }),
      div({ position: 'absolute', top: 0, left: 0, width: m.w, height: faceH,
        backgroundImage: `linear-gradient(180deg, ${COLORS.bg1} 0%, rgba(6,7,9,0) 22%)` }),
      div({ position: 'absolute', top: 0, left: 0, width: m.w, height: faceH,
        backgroundImage: `linear-gradient(180deg, rgba(6,7,9,0) 66%, ${COLORS.bg1} 100%)` }),
      // A single team-coloured hairline riding the base of the portrait.
      div({ position: 'absolute', bottom: 0, left: 0, width: m.w, height: 3, backgroundColor: accent || COLORS.accent }),
    ]);
  } else if (track) {
    hero = div({ width: m.inner, height: bandH, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, [
      img(track, Math.round(m.inner * 0.95), bandH, { objectFit: 'contain' }),
    ]);
  } else if (logo) {
    hero = div({ width: m.inner, height: bandH, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, [
      img(logo, Math.round(bandH * 0.72), Math.round(bandH * 0.72), { objectFit: 'contain' }),
    ]);
  } else {
    hero = div({ width: m.inner, height: 6, backgroundColor: accent || COLORS.accent, flexShrink: 0 });
  }

  const headlineSize = fitFontSize(headline, {
    maxWidth: m.inner, maxLines: 2, max: Math.round(m.w * 0.145), min: Math.round(m.w * 0.062),
  });

  return card(m, [
    hero,
    !face
      ? div({ width: m.inner, height: 3, backgroundColor: accent || COLORS.accent, marginTop: Math.round(m.pad * 0.6) })
      : div({}),
    txt({
      fontFamily: 'Display', fontSize: headlineSize, fontWeight: 700, lineHeight: 0.94,
      textTransform: 'uppercase', letterSpacing: '-0.005em',
      marginTop: Math.round(m.pad * 0.6), width: m.inner,
    }, String(headline).toUpperCase()),
    sub
      ? div({ alignItems: 'center', marginTop: Math.round(m.pad * 0.4) }, [
          flag ? img(flag, Math.round(m.body * 1.45), Math.round(m.body), { marginRight: 12 }) : div({}),
          txt({ fontFamily: 'Body', fontSize: m.body, fontWeight: 400, color: COLORS.fg2 }, sub),
        ])
      : div({}),
    stats?.length
      ? div({ width: m.inner, marginTop: Math.round(m.pad * 1.15) }, stats.map((st) => statBlock(m, st.value, st.label, st.color)))
      : div({}),
  ], { kicker, footerRight, ghost });
}

/** Leaderboard: a title and five ranked rows with proportional bars. */
async function leaderboardLayout(m, { kicker, title, sub, rows, footerRight, ghost }) {
  const withImages = await Promise.all(rows.map(async (r) => ({
    ...r,
    img: r.driverRef ? await loadFace(r.driverRef, Math.round(m.rowH * 0.7), Math.round(m.rowH * 0.7)) : null,
  })));

  const titleSize = fitFontSize(title, {
    maxWidth: m.inner, maxLines: 2, max: Math.round(m.w * 0.115), min: Math.round(m.w * 0.055),
  });

  return card(m, [
    txt({
      fontFamily: 'Display', fontSize: titleSize, fontWeight: 700, lineHeight: 0.94,
      textTransform: 'uppercase', width: m.inner,
    }, String(title).toUpperCase()),
    sub
      ? txt({ fontFamily: 'Body', fontSize: m.body, fontWeight: 400, color: COLORS.fg2, marginTop: Math.round(m.pad * 0.3), width: m.inner }, sub)
      : div({}),
    div({ width: m.inner, height: 3, backgroundColor: COLORS.accent, marginTop: Math.round(m.pad * 0.55), marginBottom: Math.round(m.pad * 0.65) }),
    div({ flexDirection: 'column', width: m.inner }, withImages.map((r, i) => barRow(m, r, i))),
  ], { kicker, footerRight, ghost });
}

/**
 * Podium: the winner given real estate, then P2 and P3 as rows.
 * Race, sprint and qualifying results - the after-session posts.
 */
async function podiumLayout(m, { kicker, title, sub, winner, rest, footerRight, ghost }) {
  const faceW = Math.round(m.w * 0.36);
  const faceH = Math.round(faceW / FACE_ASPECT);
  const [face, rows] = await Promise.all([
    winner.driverRef ? loadFace(winner.driverRef, faceW, faceH) : null,
    Promise.all(rest.map(async (r) => ({
      ...r,
      img: r.driverRef ? await loadFace(r.driverRef, Math.round(m.rowH * 0.7), Math.round(m.rowH * 0.7)) : null,
    }))),
  ]);

  const infoPadL = Math.round(m.pad * 0.6);
  const infoPadR = Math.round(m.pad * 0.4);
  // The name gets what is left after the strip, the portrait and the column's
  // own padding - not the card's inner width.
  const infoW = m.inner - 6 - faceW - infoPadL - infoPadR;

  const titleSize = fitFontSize(title, {
    maxWidth: m.inner, maxLines: 2, max: Math.round(m.w * 0.088), min: Math.round(m.w * 0.05),
  });
  const nameSize = fitFontSize(winner.name, {
    maxWidth: infoW, maxLines: 2, max: Math.round(m.w * 0.105), min: Math.round(m.w * 0.05),
  });

  const winnerBlock = div({
    width: m.inner, backgroundColor: COLORS.bg2, marginBottom: Math.round(m.pad * 0.4),
    alignItems: 'stretch', overflow: 'hidden', flexShrink: 0, position: 'relative',
  }, [
    // Gold wash: this is the won result, and gold is the podium token for P1.
    div({ position: 'absolute', top: 0, left: 0, width: m.inner, height: faceH,
      backgroundImage: `linear-gradient(90deg, ${alpha(winner.color, 0.22)} 0%, rgba(0,0,0,0) 62%)` }),
    div({ width: 6, backgroundColor: winner.color || COLORS.accent, flexShrink: 0 }),
    face
      ? img(face, faceW, faceH, { objectFit: 'cover', flexShrink: 0 })
      : div({ width: faceW, height: faceH, backgroundColor: COLORS.bg3, flexShrink: 0 }),
    div({
      flexDirection: 'column', width: infoW + infoPadL + infoPadR, justifyContent: 'center',
      paddingLeft: infoPadL, paddingRight: infoPadR,
    }, [
      eyebrow(m, winner.badge, winner.badgeColor || COLORS.gold),
      txt({
        fontFamily: 'Display', fontSize: nameSize, fontWeight: 700, lineHeight: 0.94,
        textTransform: 'uppercase', marginTop: 10, width: infoW,
      }, String(winner.name).toUpperCase()),
      txt({
        fontFamily: 'Display', fontSize: m.label, fontWeight: 400, color: COLORS.fg3, marginTop: 10,
        textTransform: 'uppercase', letterSpacing: '0.14em', width: infoW,
      }, String(winner.team || '').toUpperCase()),
      winner.value
        ? txt({ fontFamily: 'Mono', fontSize: Math.round(m.w * 0.05), fontWeight: 700, marginTop: Math.round(m.pad * 0.45) }, winner.value)
        : div({}),
    ]),
  ]);

  return card(m, [
    txt({
      fontFamily: 'Display', fontSize: titleSize, fontWeight: 700, lineHeight: 0.96,
      textTransform: 'uppercase', width: m.inner,
    }, String(title).toUpperCase()),
    sub
      ? txt({ fontFamily: 'Body', fontSize: m.body, fontWeight: 400, color: COLORS.fg2, marginTop: Math.round(m.pad * 0.25), width: m.inner }, sub)
      : div({}),
    div({ width: m.inner, height: 3, backgroundColor: COLORS.accent, marginTop: Math.round(m.pad * 0.5), marginBottom: Math.round(m.pad * 0.6) }),
    winnerBlock,
    div({ flexDirection: 'column', width: m.inner }, rows.map((r, i) => barRow(m, r, i + 1))),
  ], { kicker, footerRight, ghost });
}

/** Fact: one statement, set large in condensed display. Trivia. */
async function factLayout(m, { kicker, text, note, footerRight, ghost }) {
  const size = fitFontSize(text, {
    maxWidth: m.inner, maxLines: 7, max: Math.round(m.w * 0.1), min: Math.round(m.w * 0.048),
  });
  return card(m, [
    div({ width: Math.round(m.inner * 0.22), height: 5, backgroundColor: COLORS.accent, marginBottom: Math.round(m.pad * 0.85) }),
    txt({
      fontFamily: 'Display', fontSize: size, fontWeight: 700, lineHeight: 1.06,
      textTransform: 'uppercase', width: m.inner,
    }, String(text).toUpperCase()),
    note
      ? div({ marginTop: Math.round(m.pad * 0.9) }, [eyebrow(m, note, COLORS.fg3, m.label)])
      : div({}),
  ], { kicker, footerRight, ghost });
}

/** Versus: two subjects stacked either side of a rule. Head-to-head. */
async function versusLayout(m, { kicker, a, b, note, footerRight, ghost }) {
  const faceW = Math.round(m.w * 0.23);
  const faceH = Math.round(faceW / FACE_ASPECT);
  const [faceA, faceB] = await Promise.all([
    a.ref ? loadFace(a.ref, faceW, faceH) : null,
    b.ref ? loadFace(b.ref, faceW, faceH) : null,
  ]);

  const infoW = m.inner - faceW - Math.round(m.pad * 0.7);

  const side = (sd, face) => div({ width: m.inner, alignItems: 'center' }, [
    face
      ? img(face, faceW, faceH, { objectFit: 'cover', flexShrink: 0 })
      : div({ width: faceW, height: faceH, backgroundColor: COLORS.bg2, flexShrink: 0 }),
    div({ width: 4, height: faceH, backgroundColor: sd.color || COLORS.line2, flexShrink: 0 }),
    div({ flexDirection: 'column', width: infoW - 4, marginLeft: Math.round(m.pad * 0.6) }, [
      txt({
        fontFamily: 'Display', fontWeight: 700, textTransform: 'uppercase', lineHeight: 0.96, width: infoW - 4,
        fontSize: fitFontSize(sd.name, { maxWidth: infoW - 4, maxLines: 2, max: Math.round(m.w * 0.082), min: Math.round(m.w * 0.044) }),
      }, String(sd.name).toUpperCase()),
      div({ marginTop: 8 }, [eyebrow(m, sd.years || '', COLORS.fg3, m.label)]),
      div({ marginTop: Math.round(m.pad * 0.5) }, sd.stats.map((st) => statBlock(m, st.value, st.label))),
    ]),
  ]);

  return card(m, [
    side(a, faceA),
    div({ width: m.inner, alignItems: 'center', marginTop: Math.round(m.pad * 0.75), marginBottom: Math.round(m.pad * 0.75) }, [
      div({ height: 1, backgroundColor: COLORS.line1, flexGrow: 1 }),
      txt({ fontFamily: 'Display', fontSize: Math.round(m.w * 0.062), fontWeight: 700, color: COLORS.accentText, marginLeft: 24, marginRight: 24 }, 'VS'),
      div({ height: 1, backgroundColor: COLORS.line1, flexGrow: 1 }),
    ]),
    side(b, faceB),
    note
      ? txt({ fontFamily: 'Body', fontSize: m.label, color: COLORS.fg3, marginTop: Math.round(m.pad * 0.8), lineHeight: 1.35, width: m.inner }, note)
      : div({}),
  ], { kicker, footerRight, ghost });
}

// ─────────────────────────────────────────────────────────────────────────────
// Angle -> layout props
// ─────────────────────────────────────────────────────────────────────────────

/** The headline number for a row, which differs per session type. */
function sessionValue(session, row, isWinner) {
  if (session === 'qualifying') return row.q3 || row.q2 || row.q1 || '';
  if (isWinner) return row.time || '';
  return row.time && String(row.time).startsWith('+') ? row.time : '';
}

const SESSION_LABEL = { race: 'Race result', qualifying: 'Qualifying', sprint: 'Sprint result' };

function podiumRows(results) {
  return withPct(results.slice(0, 5).map((r, i) => ({
    rank: r.position ?? i + 1,
    name: r.driverName,
    sub: r.constructorName,
    color: r.constructorColor,
    code: r.code,
    driverRef: r.driverRef,
    valueMain: r.position === 1 ? 'WIN' : `P${r.position}`,
    valueUnit: r.points ? `${r.points} pts` : '',
    // Bars read as points scored, which is what a result card is about.
    rawValue: r.points ?? (6 - (r.position ?? 6)),
  })));
}

function recordRows(rows) {
  return withPct(rows.map((r) => ({
    rank: r.rank,
    name: r.name,
    sub: r.context || r.teamName || '',
    color: r.teamColor,
    code: r.code || (r.name || '').slice(0, 3),
    driverRef: r.driverRef || null,
    valueMain: r.value,
    valueUnit: unitOf(r.valueLabel, r.value),
    rawValue: Number(r.value) || 0,
  })));
}

async function propsFor(candidate, copy, m) {
  const d = candidate.data;
  switch (candidate.angle) {
    case 'race-result':
    case 'quali-result':
    case 'sprint-result': {
      const race = d.race;
      const session = d.session || 'race';
      const [first, ...rest] = d.podium;
      const isQuali = session === 'qualifying';
      return ['podium', {
        kicker: copy.kicker,
        title: `${race.year} ${race.name}`,
        sub: `${SESSION_LABEL[session]} · ${race.circuit?.name || ''}`.replace(/ · $/, ''),
        ghost: race.year,
        winner: {
          badge: isQuali ? 'Pole position' : 'Winner',
          badgeColor: isQuali ? COLORS.accentText : COLORS.gold,
          name: first.driverName,
          team: first.constructorName,
          color: first.constructorColor,
          driverRef: first.driverRef,
          value: sessionValue(session, first, true),
        },
        rest: withPct(rest.map((r) => ({
          rank: r.position,
          name: r.driverName,
          sub: r.constructorName,
          color: r.constructorColor,
          code: r.code,
          driverRef: r.driverRef,
          valueMain: `P${r.position}`,
          valueUnit: sessionValue(session, r, false) || (r.points ? `${r.points} pts` : ''),
          rawValue: r.points ?? (6 - (r.position ?? 6)),
        }))),
        footerRight: race.date,
      }];
    }
    case 'on-this-day': {
      const race = d.race;
      return ['leaderboard', {
        kicker: copy.kicker,
        title: `${race.year} ${race.name}`,
        sub: race.circuit?.name || '',
        ghost: race.year,
        rows: podiumRows(d.top?.length ? d.top : d.podium),
        footerRight: `${plural(d.age, 'year')} ago`,
      }];
    }
    case 'race-preview': {
      const c = d.circuit || {};
      return ['hero', {
        kicker: copy.kicker,
        headline: d.race.name,
        sub: [c.location, c.countryName].filter(Boolean).join(', '),
        accent: COLORS.accent,
        trackRef: d.race.circuitRef,
        ghost: `R${d.race.round}`,
        stats: [
          { value: `R${d.race.round}`, label: 'Round' },
          { value: c.raceCount ?? '—', label: 'GPs held' },
          d.lastWinner ? { value: d.lastWinner.year, label: 'Last held' } : null,
        ].filter(Boolean),
        footerRight: d.race.date,
      }];
    }
    case 'driver-birthday':
    case 'driver-spotlight': {
      const dr = d.driver;
      const c = dr.career || {};
      const teamColor = (dr.perSeason || [])[0]?.constructorColor;
      return ['hero', {
        kicker: copy.kicker,
        headline: `${dr.forename} ${dr.surname}`,
        sub: `${dr.nationality || ''} · ${c.firstYear}–${c.lastYear}`.replace(/^ · /, ''),
        nationality: dr.nationality,
        accent: teamColor || COLORS.accent,
        faceRef: dr.driverRef,
        ghost: c.wins || c.races || '',
        stats: [
          c.championships ? { value: `${c.championships}×`, label: 'Titles', color: COLORS.gold } : null,
          { value: c.wins ?? 0, label: 'Wins' },
          { value: c.poles ?? 0, label: 'Poles' },
          { value: c.podiums ?? 0, label: 'Podiums' },
        ].filter(Boolean),
        footerRight: candidate.angle === 'driver-birthday' ? `Born ${d.bornYear}` : `${c.races} starts`,
      }];
    }
    case 'team-spotlight': {
      const t = d.team;
      const c = t.career || {};
      return ['hero', {
        kicker: copy.kicker,
        headline: t.name,
        sub: `${t.nationality || ''} · ${c.firstYear}–${c.lastYear}`.replace(/^ · /, ''),
        accent: t.color,
        logoRef: t.constructorRef,
        ghost: c.wins || '',
        stats: [
          c.championships ? { value: `${c.championships}×`, label: 'Titles', color: COLORS.gold } : null,
          { value: c.wins ?? 0, label: 'Wins' },
          { value: c.podiums ?? 0, label: 'Podiums' },
          { value: c.races ?? 0, label: 'Races' },
        ].filter(Boolean),
        footerRight: `${c.seasons} seasons`,
      }];
    }
    case 'circuit-spotlight': {
      const c = d.circuit;
      const most = (c.mostWins || [])[0];
      return ['hero', {
        kicker: copy.kicker,
        headline: c.name,
        sub: `${c.location}, ${c.countryName}`,
        accent: COLORS.accent,
        trackRef: c.circuitRef,
        ghost: c.raceCount || '',
        stats: [
          { value: c.raceCount ?? 0, label: 'Races' },
          { value: c.firstYear, label: 'First' },
          most ? { value: most.count, label: `${most.name.split(' ').pop()} wins` } : null,
        ].filter(Boolean),
        footerRight: `${c.firstYear}–${c.lastYear}`,
      }];
    }
    case 'record-board':
      return ['leaderboard', {
        kicker: copy.kicker,
        title: d.config.title,
        sub: d.config.blurb,
        ghost: d.rows[0]?.value ?? '',
        rows: recordRows(d.rows),
        footerRight: 'All-time',
      }];
    case 'standings-snapshot': {
      const colors = teamColors(d.year);
      return ['leaderboard', {
        kicker: copy.kicker,
        title: `${d.year} Drivers' Championship`,
        sub: `After ${plural(d.roundsDone, 'round')} of ${d.roundsTotal}`,
        ghost: d.year,
        rows: withPct(d.rows.map((r, i) => ({
          rank: r.position ?? i + 1,
          name: `${r.driver.first} ${r.driver.last}`,
          sub: r.driver.team,
          color: colors.get(r.driver.team),
          code: r.driver.code,
          driverRef: r.driver.jolpicaId,
          valueMain: r.points,
          valueUnit: 'pts',
          rawValue: r.points,
        }))),
        footerRight: `Round ${d.afterRound}`,
      }];
    }
    case 'head-to-head': {
      const mk = d.matchup;
      const stat = (c) => [
        c.championships ? { value: `${c.championships}×`, label: 'Titles' } : null,
        { value: c.wins ?? 0, label: 'Wins' },
        { value: c.podiums ?? 0, label: 'Podiums' },
      ].filter(Boolean);
      return ['versus', {
        kicker: copy.kicker,
        ghost: 'VS',
        a: {
          ref: mk.a, name: mk.aName, color: mk.aColor,
          years: `${d.a?.career?.firstYear}–${d.a?.career?.lastYear}`, stats: stat(d.a?.career || {}),
        },
        b: {
          ref: mk.b, name: mk.bName, color: mk.bColor,
          years: `${d.b?.career?.firstYear}–${d.b?.career?.lastYear}`, stats: stat(d.b?.career || {}),
        },
        note: mk.reason,
        footerRight: 'Compare Mode',
      }];
    }
    case 'trivia':
      return ['fact', {
        kicker: copy.kicker,
        text: d.fact.text,
        note: d.fact.category,
        footerRight: 'Did you know?',
      }];
    default:
      throw new Error(`No card layout for angle "${candidate.angle}"`);
  }
}

const LAYOUTS = {
  hero: heroLayout,
  podium: podiumLayout,
  leaderboard: leaderboardLayout,
  fact: factLayout,
  versus: versusLayout,
};

/** Render one format. Returns a PNG buffer. */
export async function renderCard(candidate, copy, format) {
  if (!FORMATS[format]) throw new Error(`Unknown card format "${format}"`);
  const m = metrics(format);
  const [layoutId, props] = await propsFor(candidate, copy, m);
  const tree = await LAYOUTS[layoutId](m, props);
  return renderPng(tree, format);
}

/** Render every requested format. Returns [{ format, width, height, buffer }]. */
export async function renderCards(candidate, copy, formats = DEFAULT_FORMATS) {
  const out = [];
  for (const format of formats) {
    out.push({
      format,
      width: FORMATS[format].w,
      height: FORMATS[format].h,
      buffer: await renderCard(candidate, copy, format),
    });
  }
  return out;
}

export { FORMATS, DEFAULT_FORMATS };
