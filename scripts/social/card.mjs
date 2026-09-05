// scripts/social/card.mjs
//
// Renders a chosen candidate to branded PNG cards.
//
// Six skeletons cover all thirteen angles, per the design handoff (see
// docs/social-card-design.md):
//
//   1a  result       01 race result, 02 qualifying, 03 sprint
//   3d  leaderboard  05 on this day, 07 record board, 08 standings
//   4a  hero         04 preview, 06 birthday, 09 driver, 11 circuit
//   10b team         10 team spotlight
//   12b versus       12 head to head
//   13a fact         13 trivia
//
// Measurements come from the spec and are deliberate - change them there, not
// here. A new angle should map onto an existing skeleton rather than add one.

import { loadFace, loadTrackMap, loadFlag } from '../og-templates/og-shared.mjs';
import { seasonBundle } from './sources.mjs';
import {
  FORMATS, DEFAULT_FORMATS, renderPng, metrics, card, div, txt, img, grow,
  kickerRow, kicker, chip, footer, statStrip, photoBleed, streakBand, wordmark,
  fitFontSize, alpha, clashesWithAccent, COLORS, GROUNDS, RANK_INK,
} from './cardkit.mjs';
import { plural } from './format.mjs';

// Every headshot in public/images/drivers is 360x440.
const FACE_ASPECT = 360 / 440;

/** "106 wins" -> "wins". Records ship a combined label; rows want them apart. */
function unitOf(valueLabel, value) {
  const s = String(valueLabel ?? '');
  return s.replace(String(value ?? ''), '').trim();
}

/** bundle team id -> colour, for standings rows (which carry only the id). */
function teamColors(year) {
  const map = new Map();
  for (const t of seasonBundle(year)?.teams || []) map.set(t.id, t.color);
  return map;
}

/** Split a name for the two-line result treatment. */
function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  if (parts.length < 2) return { given: '', family: parts[0] || '' };
  return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1a — Result cards
// ─────────────────────────────────────────────────────────────────────────────

async function resultLayout(m, { kickerText, title, circuit, chipText, winner, rest, footerRight }) {
  const [face, restRows] = await Promise.all([
    winner.driverRef ? loadFace(winner.driverRef, m.wx(560), m.v(920)) : null,
    Promise.all(rest.map(async (r) => ({
      ...r,
      img: r.driverRef ? await loadFace(r.driverRef, m.v(88), m.v(88)) : null,
    }))),
  ]);

  const { given, family } = splitName(winner.name);
  // The spec steps the name down for a long surname rather than guessing.
  const nameSize = m.f(family.length >= 8 ? 136 : 152);

  const ledgerRow = (r, i) => div({
    width: m.inner, height: m.v(120), alignItems: 'center', flexShrink: 0,
    // Omit rather than pass undefined - Satori throws parsing it.
    ...(i === 0 ? { borderBottom: `1px solid ${COLORS.line}` } : {}),
  }, [
    txt({
      width: m.wx(62), fontFamily: 'Mono', fontSize: m.f(40), fontWeight: 700,
      color: RANK_INK[r.rank - 1] || COLORS.fg3, flexShrink: 0,
    }, String(r.rank)),
    div({ width: m.wx(4), height: m.v(88), backgroundColor: r.color || COLORS.line2, flexShrink: 0 }),
    div({ width: m.wx(22), flexShrink: 0 }),
    r.img
      ? img(r.img, m.v(88), m.v(88), { objectFit: 'cover', flexShrink: 0 })
      : div({ width: m.v(88), height: m.v(88), backgroundColor: COLORS.raised, flexShrink: 0 }),
    div({ width: m.wx(24), flexShrink: 0 }),
    div({ flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }, [
      txt({ fontFamily: 'Display', fontSize: m.f(46), fontWeight: 700, lineHeight: 1 }, String(r.name).toUpperCase()),
      txt({
        fontFamily: 'Display', fontSize: m.f(20), fontWeight: 600, letterSpacing: '0.18em',
        color: COLORS.fg3, marginTop: m.v(6),
      }, String(r.team || '').toUpperCase()),
    ]),
    txt({ fontFamily: 'Mono', fontSize: m.f(40), fontWeight: 700, color: COLORS.fg2, flexShrink: 0 }, String(r.value || '')),
  ]);

  return card(m, [
    kickerRow(m, kickerText, { mark: false }),
    txt({
      fontFamily: 'Display', fontSize: m.f(66), fontWeight: 700, lineHeight: 0.94,
      letterSpacing: '-0.01em', width: m.wx(470), marginTop: m.v(14),
    }, String(title).toUpperCase()),
    txt({ fontFamily: 'Body', fontSize: m.f(30), fontWeight: 400, color: COLORS.fg3, marginTop: m.v(18), width: m.wx(470) }, circuit || ''),
    grow(),
    chip(m, chipText, { invert: clashesWithAccent(winner.color) }),
    div({ flexDirection: 'column', marginTop: m.v(20) }, [
      given
        ? txt({ fontFamily: 'Display', fontSize: nameSize, fontWeight: 700, lineHeight: 0.84, letterSpacing: '-0.02em' }, given.toUpperCase())
        : div({}),
      txt({ fontFamily: 'Display', fontSize: nameSize, fontWeight: 700, lineHeight: 0.84, letterSpacing: '-0.02em' }, family.toUpperCase()),
    ]),
    div({ alignItems: 'center', marginTop: m.v(22) }, [
      div({ width: m.wx(5), height: m.v(34), backgroundColor: winner.color || COLORS.accent, flexShrink: 0 }),
      div({ width: m.wx(16), flexShrink: 0 }),
      txt({ fontFamily: 'Display', fontSize: m.f(34), fontWeight: 600, letterSpacing: '0.16em', color: COLORS.fg2 }, String(winner.team || '').toUpperCase()),
    ]),
    winner.value
      ? txt({ fontFamily: 'Mono', fontSize: m.f(68), fontWeight: 700, letterSpacing: '-0.02em', marginTop: m.v(16) }, winner.value)
      : div({}),
    div({ flexDirection: 'column', width: m.inner, marginTop: m.v(28), borderTop: `1px solid ${COLORS.line}` }, restRows.map(ledgerRow)),
    grow(),
    footer(m, footerRight, { mark: true }),
  ], {
    ground: GROUNDS.photo,
    bleed: photoBleed(m, face, { width: 560, height: 920 }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3d — Leaderboard cards
// ─────────────────────────────────────────────────────────────────────────────

const ROW_H = [180, 144, 144, 134, 134];
const FACE_W = [150, 114, 114, 102, 102];
const FACE_H = [176, 132, 132, 118, 118];
const RANK_SIZE = [64, 52, 52, 46, 46];
const NAME_SIZE = [62, 52, 52, 46, 46];
const VALUE_SIZE = [82, 64, 64, 56, 56];
const CUT = [84, 82, 82, 78, 78];

async function leaderboardLayout(m, { kickerText, title, sub, rows, bandWidths, leaderTint, footerRight }) {
  const withFaces = await Promise.all(rows.map(async (r, i) => ({
    ...r,
    img: r.driverRef ? await loadFace(r.driverRef, m.wx(FACE_W[i]), m.v(FACE_H[i])) : null,
  })));

  const row = (r, i) => {
    const h = m.v(ROW_H[i]);
    const surface = i === 0 ? COLORS.raised : COLORS.panel;
    return div({
      width: m.w, height: h, position: 'relative', alignItems: 'center',
      marginBottom: m.v(10), flexShrink: 0,
    }, [
      ...streakBand(m, {
        widthPct: bandWidths[i], height: h, surface, cut: CUT[i],
        tint: i === 0 ? leaderTint : null,
      }),
      div({
        position: 'absolute', top: 0, left: 0, width: m.wx(10), height: h,
        backgroundColor: r.strip || COLORS.line2,
      }),
      txt({
        position: 'relative', width: m.wx(118), paddingLeft: m.wx(72), flexShrink: 0,
        fontFamily: 'Mono', fontSize: m.f(RANK_SIZE[i]), fontWeight: 700,
        color: RANK_INK[i] || COLORS.fg3,
      }, String(r.rank ?? i + 1)),
      r.img
        ? img(r.img, m.wx(FACE_W[i]), m.v(FACE_H[i]), { objectFit: 'cover', flexShrink: 0, position: 'relative' })
        : div({ position: 'relative', width: m.wx(FACE_W[i]), height: m.v(FACE_H[i]), backgroundColor: COLORS.raised, flexShrink: 0 }),
      div({ position: 'relative', flexDirection: 'column', marginLeft: m.wx(28), flexGrow: 1, overflow: 'hidden' }, [
        txt({ fontFamily: 'Display', fontSize: m.f(NAME_SIZE[i]), fontWeight: 700, lineHeight: 0.94 }, String(r.name).toUpperCase()),
        r.sub
          ? txt({
              fontFamily: 'Display', fontSize: m.f(20), fontWeight: 600, letterSpacing: '0.18em',
              color: COLORS.fg3, marginTop: m.v(8),
            }, String(r.sub).toUpperCase())
          : div({}),
      ]),
      div({ position: 'relative', alignItems: 'baseline', paddingRight: m.wx(72), flexShrink: 0 }, [
        txt({
          fontFamily: 'Mono', fontSize: m.f(VALUE_SIZE[i]), fontWeight: 700, letterSpacing: '-0.03em',
        }, String(r.value)),
        r.unit
          ? txt({
              fontFamily: 'Display', fontSize: m.f(19), fontWeight: 600, letterSpacing: '0.18em',
              color: COLORS.fg3, marginLeft: m.wx(8),
            }, String(r.unit).toUpperCase())
          : div({}),
      ]),
    ]);
  };

  const titleSize = fitFontSize(title, { maxWidth: m.wx(760), maxLines: 2, max: m.f(104), min: m.f(58) });

  return card(m, [
    div({ paddingLeft: m.pad, paddingRight: m.pad, flexDirection: 'column', flexShrink: 0 }, [
      kickerRow(m, kickerText),
      txt({
        fontFamily: 'Display', fontSize: titleSize, fontWeight: 700, lineHeight: 0.9,
        width: m.wx(760), marginTop: m.v(24),
      }, String(title).toUpperCase()),
      sub
        ? txt({ fontFamily: 'Body', fontSize: m.f(30), fontWeight: 400, color: COLORS.fg3, marginTop: m.v(16) }, sub)
        : div({}),
    ]),
    grow(),
    div({ flexDirection: 'column', width: m.w }, withFaces.map(row)),
    grow(),
    div({ paddingLeft: m.pad, paddingRight: m.pad, flexShrink: 0 }, [footer(m, footerRight)]),
  ], { ground: GROUNDS.streak, edgeToEdge: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4a — Hero cards
// ─────────────────────────────────────────────────────────────────────────────

async function heroLayout(m, { kickerText, chipText, name, meta, nationality, stats, accent, faceRef, trackRef, ghostNumber, footerRight }) {
  const [face, track, flag] = await Promise.all([
    faceRef ? loadFace(faceRef, m.wx(600), m.v(900)) : null,
    trackRef ? loadTrackMap(trackRef, m.wx(440), m.v(440)) : null,
    nationality ? loadFlag(nationality, m.wx(56), m.v(42)) : null,
  ]);

  const { given, family } = splitName(name);
  const twoLine = Boolean(given) && name.length <= 22;
  // The text column is what is left of the photo, not the full inner width -
  // sizing to the latter runs a long surname under the face.
  const textCol = face ? m.wx(600) : m.wx(720);
  const nameSize = twoLine
    // 168 is the spec size "for two short lines"; a long surname has to come
    // down to clear the photo, since words do not break.
    ? Math.min(m.f(168), fitFontSize(family, { maxWidth: textCol, maxLines: 1, max: m.f(168), min: m.f(84) }))
    : fitFontSize(name, { maxWidth: textCol, maxLines: 2, max: m.f(152), min: m.f(84) });

  const bleed = [];
  if (face) bleed.push(...photoBleed(m, face, { width: 600, height: 900 }));
  if (track) {
    bleed.push(div({ position: 'absolute', top: m.v(64), right: m.wx(44), width: m.wx(440), height: m.v(440), alignItems: 'center', justifyContent: 'center' }, [
      img(track, m.wx(440), m.v(440), { objectFit: 'contain' }),
    ]));
  }
  if (ghostNumber) {
    // The panel token used as texture, not as data.
    bleed.push(txt({
      position: 'absolute', top: m.v(330), right: m.wx(-40),
      fontFamily: 'Mono', fontWeight: 700, fontSize: m.f(640), lineHeight: 1, color: COLORS.panel,
    }, String(ghostNumber)));
  }

  return card(m, [
    kickerRow(m, kickerText, { mark: !face }),
    // Weighted slack: the composition sits low, with the name reading against
    // the scrimmed foot of the photo rather than floating mid-card.
    grow(3),
    chipText ? chip(m, chipText, { invert: clashesWithAccent(accent) }) : div({}),
    div({ flexDirection: 'column', marginTop: chipText ? m.v(20) : 0 }, twoLine
      ? [
          txt({ fontFamily: 'Display', fontSize: nameSize, fontWeight: 700, lineHeight: 0.84, letterSpacing: '-0.02em' }, given.toUpperCase()),
          txt({ fontFamily: 'Display', fontSize: nameSize, fontWeight: 700, lineHeight: 0.84, letterSpacing: '-0.02em' }, family.toUpperCase()),
        ]
      : [
          txt({ fontFamily: 'Display', fontSize: nameSize, fontWeight: 700, lineHeight: 0.9, letterSpacing: '-0.02em', width: m.wx(720) }, String(name).toUpperCase()),
        ]),
    meta
      ? div({ alignItems: 'center', marginTop: m.v(26) }, [
          flag ? img(flag, m.wx(56), m.v(42), { borderRadius: 2, border: `1px solid ${COLORS.line}` }) : div({}),
          flag ? div({ width: m.wx(20), flexShrink: 0 }) : div({}),
          txt({ fontFamily: 'Body', fontSize: m.f(34), fontWeight: 400, color: COLORS.fg2 }, meta),
        ])
      : div({}),
    stats?.length ? statStrip(m, stats) : div({}),
    grow(1),
    footer(m, footerRight, { mark: Boolean(face) }),
  ], {
    ground: GROUNDS.photo,
    bleed,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 10b — Team spotlight
// ─────────────────────────────────────────────────────────────────────────────

async function teamLayout(m, { kickerText, name, meta, nationality, color, titles, firstYear, lastYear, panels, footerRight }) {
  const flag = nationality ? await loadFlag(nationality, m.wx(56), m.v(42)) : null;
  const span = Math.max(1, lastYear - firstYear);
  const nameSize = fitFontSize(name, { maxWidth: m.inner, maxLines: 1, max: m.f(230), min: m.f(96) });

  const timeline = div({ flexDirection: 'column', width: m.inner, flexShrink: 0 }, [
    div({ width: m.inner, alignItems: 'center', justifyContent: 'space-between' }, [
      txt({ fontFamily: 'Display', fontSize: m.f(24), fontWeight: 600, letterSpacing: '0.2em', color: COLORS.fg3 }, "CONSTRUCTORS' TITLES"),
      txt({ fontFamily: 'Mono', fontSize: m.f(24), fontWeight: 700, color: COLORS.fg1 }, String(titles.length)),
    ]),
    div({ width: m.inner, height: m.v(56), backgroundColor: COLORS.panel, position: 'relative', marginTop: m.v(16) }, [
      div({ position: 'absolute', top: m.v(27), left: 0, width: m.inner, height: 2, backgroundColor: COLORS.line }),
      ...titles.map((y) => div({
        position: 'absolute', top: 0, height: m.v(56), width: m.wx(7),
        left: Math.round(((y - firstYear) / span) * (m.inner - m.wx(7))),
        backgroundColor: color || COLORS.accent,
      })),
    ]),
    div({ width: m.inner, justifyContent: 'space-between', marginTop: m.v(14) }, [
      txt({ fontFamily: 'Mono', fontSize: m.f(22), fontWeight: 500, color: COLORS.fg3 }, String(firstYear)),
      txt({ fontFamily: 'Mono', fontSize: m.f(22), fontWeight: 500, color: COLORS.fg3 },
        titles.length ? `${titles[titles.length - 1]} · LAST TITLE` : ''),
      txt({ fontFamily: 'Mono', fontSize: m.f(22), fontWeight: 500, color: COLORS.fg3 }, String(lastYear)),
    ]),
  ]);

  const panel = (p) => div({
    flexGrow: 1, flexBasis: 0, backgroundColor: COLORS.panel, alignItems: 'center',
    paddingTop: m.v(32), paddingBottom: m.v(32), paddingLeft: m.wx(30), paddingRight: m.wx(30),
  }, [
    txt({ fontFamily: 'Display', fontSize: m.f(24), fontWeight: 600, letterSpacing: '0.2em', color: COLORS.fg3 }, String(p.label).toUpperCase()),
    grow(),
    txt({ fontFamily: 'Mono', fontSize: m.f(80), fontWeight: 700, letterSpacing: '-0.03em' }, String(p.value)),
  ]);

  return card(m, [
    kickerRow(m, kickerText),
    grow(),
    txt({ fontFamily: 'Display', fontSize: nameSize, fontWeight: 700, lineHeight: 0.82, letterSpacing: '-0.03em' }, String(name).toUpperCase()),
    div({ alignItems: 'center', marginTop: m.v(24) }, [
      div({ width: m.wx(5), height: m.v(36), backgroundColor: color || COLORS.accent, flexShrink: 0 }),
      div({ width: m.wx(18), flexShrink: 0 }),
      flag ? img(flag, m.wx(56), m.v(42), { borderRadius: 2, border: `1px solid ${COLORS.line}` }) : div({}),
      flag ? div({ width: m.wx(18), flexShrink: 0 }) : div({}),
      txt({ fontFamily: 'Body', fontSize: m.f(34), fontWeight: 400, color: COLORS.fg2 }, meta),
    ]),
    grow(),
    timeline,
    div({ width: m.inner, marginTop: m.v(28), gap: m.v(14), flexShrink: 0 }, panels.slice(0, 2).map(panel)),
    div({ width: m.inner, marginTop: m.v(14), gap: m.v(14), flexShrink: 0 }, panels.slice(2, 4).map(panel)),
    grow(),
    footer(m, footerRight),
  ], { ground: GROUNDS.flat });
}

// ─────────────────────────────────────────────────────────────────────────────
// 12b — Head to head
// ─────────────────────────────────────────────────────────────────────────────

async function versusLayout(m, { kickerText, a, b, comparisons, footerRight }) {
  const [faceA, faceB, flagA, flagB] = await Promise.all([
    a.ref ? loadFace(a.ref, m.wx(170), m.v(200)) : null,
    b.ref ? loadFace(b.ref, m.wx(170), m.v(200)) : null,
    a.nationality ? loadFlag(a.nationality, m.wx(46), m.v(34)) : null,
    b.nationality ? loadFlag(b.nationality, m.wx(46), m.v(34)) : null,
  ]);

  const side = (s, face, flag, right) => div({
    alignItems: 'center', flexGrow: 1, flexBasis: 0,
    justifyContent: right ? 'flex-end' : 'flex-start',
  }, right ? [
    div({ flexDirection: 'column', alignItems: 'flex-end', marginRight: m.wx(20) }, [
      txt({ fontFamily: 'Display', fontSize: m.f(76), fontWeight: 700, lineHeight: 0.88 }, String(s.last).toUpperCase()),
      div({ alignItems: 'center', marginTop: m.v(12) }, [
        txt({ fontFamily: 'Mono', fontSize: m.f(20), fontWeight: 500, color: COLORS.fg3 }, s.years),
        flag ? div({ width: m.wx(10) }) : div({}),
        flag ? img(flag, m.wx(46), m.v(34), { borderRadius: 2 }) : div({}),
      ]),
    ]),
    face ? img(face, m.wx(170), m.v(200), { objectFit: 'cover', flexShrink: 0 }) : div({ width: m.wx(170), height: m.v(200), backgroundColor: COLORS.panel }),
  ] : [
    face ? img(face, m.wx(170), m.v(200), { objectFit: 'cover', flexShrink: 0 }) : div({ width: m.wx(170), height: m.v(200), backgroundColor: COLORS.panel }),
    div({ flexDirection: 'column', marginLeft: m.wx(20) }, [
      txt({ fontFamily: 'Display', fontSize: m.f(76), fontWeight: 700, lineHeight: 0.88 }, String(s.last).toUpperCase()),
      div({ alignItems: 'center', marginTop: m.v(12) }, [
        flag ? img(flag, m.wx(46), m.v(34), { borderRadius: 2 }) : div({}),
        flag ? div({ width: m.wx(10) }) : div({}),
        txt({ fontFamily: 'Mono', fontSize: m.f(20), fontWeight: 500, color: COLORS.fg3 }, s.years),
      ]),
    ]),
  ]);

  const compare = (c) => {
    const aWins = c.aValue >= c.bValue;
    const top = Math.max(c.aValue, c.bValue) || 1;
    return div({ flexDirection: 'column', width: m.inner, flexShrink: 0 }, [
      div({ width: m.inner, alignItems: 'center' }, [
        txt({
          width: m.wx(150), fontFamily: 'Mono', fontSize: m.f(66), fontWeight: 700,
          color: aWins ? COLORS.fg1 : COLORS.fg3,
        }, String(c.aLabel ?? c.aValue)),
        txt({
          flexGrow: 1, justifyContent: 'center', fontFamily: 'Display', fontSize: m.f(26),
          fontWeight: 600, letterSpacing: '0.2em', color: COLORS.fg3,
        }, String(c.label).toUpperCase()),
        txt({
          width: m.wx(150), justifyContent: 'flex-end', fontFamily: 'Mono', fontSize: m.f(66), fontWeight: 700,
          color: aWins ? COLORS.fg3 : COLORS.fg1,
        }, String(c.bLabel ?? c.bValue)),
      ]),
      div({ width: m.inner, marginTop: m.v(14), gap: m.wx(14) }, [
        div({ flexGrow: 1, flexBasis: 0, height: m.v(12), backgroundColor: COLORS.panel, justifyContent: 'flex-end' }, [
          div({ width: `${Math.round((c.aValue / top) * 100)}%`, height: m.v(12), backgroundColor: aWins ? COLORS.fg2 : COLORS.line2 }),
        ]),
        div({ flexGrow: 1, flexBasis: 0, height: m.v(12), backgroundColor: COLORS.panel }, [
          div({ width: `${Math.round((c.bValue / top) * 100)}%`, height: m.v(12), backgroundColor: aWins ? COLORS.line2 : COLORS.fg2 }),
        ]),
      ]),
    ]);
  };

  return card(m, [
    kickerRow(m, kickerText),
    grow(),
    div({ width: m.inner, alignItems: 'center' }, [side(a, faceA, flagA, false), side(b, faceB, flagB, true)]),
    grow(),
    div({ flexDirection: 'column', width: m.inner, gap: m.v(36) }, comparisons.map(compare)),
    grow(),
    footer(m, footerRight),
  ], { ground: GROUNDS.flatAlt });
}

// ─────────────────────────────────────────────────────────────────────────────
// 13a — Fact
// ─────────────────────────────────────────────────────────────────────────────

async function factLayout(m, { kickerText, text, footerRight }) {
  const size = fitFontSize(text, { maxWidth: m.inner, maxLines: 7, max: m.f(108), min: m.f(52) });
  return card(m, [
    kickerRow(m, kickerText),
    grow(),
    div({ width: m.wx(200), height: m.v(8), backgroundColor: COLORS.accent, flexShrink: 0, marginBottom: m.v(40) }),
    txt({
      fontFamily: 'Display', fontSize: size, fontWeight: 700, lineHeight: 0.94,
      letterSpacing: '-0.01em', width: m.inner,
    }, String(text).toUpperCase()),
    grow(),
    footer(m, footerRight),
  ], { ground: GROUNDS.flatAlt });
}

const LAYOUTS = {
  result: resultLayout,
  leaderboard: leaderboardLayout,
  hero: heroLayout,
  team: teamLayout,
  versus: versusLayout,
  fact: factLayout,
};

// ─────────────────────────────────────────────────────────────────────────────
// Angle -> skeleton props
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_LABEL = { race: 'Race result', qualifying: 'Qualifying', sprint: 'Sprint result' };
const SESSION_CHIP = { race: 'Winner', qualifying: 'Pole position', sprint: 'Sprint winner' };

/** The headline number for a row, which differs per session type. */
function sessionValue(session, row, isWinner) {
  if (session === 'qualifying') return row.q3 || row.q2 || row.q1 || '';
  if (isWinner) return row.time || '';
  return row.time && String(row.time).startsWith('+') ? row.time : '';
}

/** Band widths per card family, from the spec. */
const BANDS = {
  record: [100, 90, 82, 74, 70],
  standings: [100, 82, 82, 74, 72],
  order: [100, 86, 86, 76, 72],
};

async function propsFor(candidate, copy, m) {
  const d = candidate.data;
  switch (candidate.angle) {
    case 'race-result':
    case 'quali-result':
    case 'sprint-result': {
      const race = d.race;
      const session = d.session || 'race';
      const [first, ...rest] = d.podium;
      return ['result', {
        kickerText: `${race.year} · Round ${race.round}`,
        title: race.name,
        circuit: race.circuit?.name || '',
        chipText: SESSION_CHIP[session],
        winner: {
          name: first.driverName,
          team: first.constructorName,
          color: first.constructorColor,
          driverRef: first.driverRef,
          value: sessionValue(session, first, true),
        },
        rest: rest.map((r) => ({
          rank: r.position,
          name: r.driverName,
          team: r.constructorName,
          color: r.constructorColor,
          driverRef: r.driverRef,
          value: sessionValue(session, r, false) || (r.points ? `${r.points} pts` : ''),
        })),
        footerRight: race.date,
      }];
    }

    case 'on-this-day': {
      const race = d.race;
      const rows = (d.top?.length ? d.top : d.podium).slice(0, 5);
      return ['leaderboard', {
        kickerText: `On this day · ${race.year}`,
        title: race.name,
        sub: race.circuit?.name || '',
        bandWidths: BANDS.order,
        // Red means "now"; a historic race is not now, so the leader takes gold.
        leaderTint: alpha(COLORS.gold, 0.14),
        rows: rows.map((r, i) => ({
          rank: r.position ?? i + 1,
          name: r.driverName,
          sub: r.constructorName,
          driverRef: r.driverRef,
          strip: i === 0 ? COLORS.gold : COLORS.line2,
          value: r.position === 1 ? 'WIN' : `P${r.position}`,
          unit: r.points ? `${r.points} pts` : '',
        })),
        footerRight: `${plural(d.age, 'year')} ago`,
      }];
    }

    case 'record-board':
      return ['leaderboard', {
        kickerText: 'All-time record',
        title: d.config.title,
        sub: d.config.blurb,
        bandWidths: BANDS.record,
        leaderTint: alpha(COLORS.gold, 0.14),
        rows: d.rows.map((r, i) => ({
          rank: r.rank ?? i + 1,
          name: r.name,
          sub: r.context || r.teamName || '',
          driverRef: r.driverRef || null,
          strip: i === 0 ? COLORS.gold : COLORS.line2,
          value: r.value,
          unit: unitOf(r.valueLabel, r.value),
        })),
        footerRight: d.config.stat ? `Career ${d.config.stat}` : 'All-time',
      }];

    case 'standings-snapshot': {
      const colors = teamColors(d.year);
      return ['leaderboard', {
        kickerText: `${d.year} championship`,
        title: `Drivers' Championship`,
        sub: `After ${plural(d.roundsDone, 'round')} of ${d.roundsTotal}`,
        bandWidths: BANDS.standings,
        // A live championship IS "now" - this is the card that earns the red.
        leaderTint: alpha(COLORS.accent, 0.22),
        rows: d.rows.map((r, i) => ({
          rank: r.position ?? i + 1,
          name: `${r.driver.first} ${r.driver.last}`,
          sub: r.driver.team,
          driverRef: r.driver.jolpicaId,
          strip: i === 0 ? COLORS.accent : (colors.get(r.driver.team) || COLORS.line2),
          value: r.points,
          unit: 'pts',
        })),
        footerRight: `Round ${d.afterRound}`,
      }];
    }

    case 'race-preview': {
      const c = d.circuit || {};
      return ['hero', {
        kickerText: `${d.race.year} · Round ${d.race.round}`,
        chipText: 'Next up',
        name: d.race.name,
        meta: [c.location, c.countryName].filter(Boolean).join(', '),
        accent: COLORS.accent,
        ghostNumber: d.race.round,
        stats: [
          { value: c.raceCount ?? '—', label: 'GPs held' },
          { value: c.firstYear ?? '—', label: 'First' },
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
        kickerText: candidate.angle === 'driver-birthday' ? 'Born on this day' : 'Driver profile',
        name: `${dr.forename} ${dr.surname}`,
        meta: `${dr.nationality || ''} · ${c.firstYear}–${c.lastYear}`.replace(/^ · /, ''),
        nationality: dr.nationality,
        accent: teamColor || COLORS.accent,
        faceRef: dr.driverRef,
        stats: [
          c.championships ? { value: `${c.championships}×`, label: 'Titles', color: COLORS.gold } : null,
          { value: c.wins ?? 0, label: 'Wins' },
          { value: c.poles ?? 0, label: 'Poles' },
          { value: c.podiums ?? 0, label: 'Podiums' },
        ].filter(Boolean),
        footerRight: candidate.angle === 'driver-birthday' ? `Born ${d.bornYear}` : `${c.races} starts`,
      }];
    }

    case 'circuit-spotlight': {
      const c = d.circuit;
      const most = (c.mostWins || [])[0];
      return ['hero', {
        kickerText: 'Circuit profile',
        name: c.name,
        meta: `${c.location}, ${c.countryName}`,
        accent: COLORS.accent,
        trackRef: c.circuitRef,
        stats: [
          { value: c.raceCount ?? 0, label: 'Races' },
          { value: c.firstYear, label: 'First' },
          most ? { value: most.count, label: `${most.name.split(' ').pop()} wins` } : null,
        ].filter(Boolean),
        footerRight: `${c.firstYear}–${c.lastYear}`,
      }];
    }

    case 'team-spotlight': {
      const t = d.team;
      const c = t.career || {};
      const titles = (t.perSeason || []).filter((s) => s.position === 1).map((s) => s.year).sort((x, y) => x - y);
      const topDriver = (t.topDrivers || [])[0];
      return ['team', {
        kickerText: 'Constructor profile',
        name: t.name,
        meta: `${t.nationality || ''} · ${plural(c.seasons || 0, 'season')} in Formula 1`.replace(/^ · /, ''),
        nationality: t.nationality,
        color: t.color,
        titles,
        firstYear: c.firstYear,
        lastYear: c.lastYear,
        panels: [
          { label: 'Wins', value: c.wins ?? 0 },
          { label: 'Podiums', value: c.podiums ?? 0 },
          { label: 'Races', value: c.races ?? 0 },
          { label: 'Best year', value: t.bestSeason?.year ?? '—' },
        ],
        footerRight: topDriver ? `${topDriver.name.split(' ').pop()} ${topDriver.wins} wins` : '',
      }];
    }

    case 'head-to-head': {
      const mk = d.matchup;
      const ac = d.a?.career || {};
      const bc = d.b?.career || {};
      const row = (label, av, bv) => ({ label, aValue: av || 0, bValue: bv || 0 });
      return ['versus', {
        kickerText: mk.tag || 'Head to head',
        a: {
          ref: mk.a, last: d.a?.surname || mk.aLabel, nationality: d.a?.nationality,
          years: `${ac.firstYear}–${ac.lastYear}`,
        },
        b: {
          ref: mk.b, last: d.b?.surname || mk.bLabel, nationality: d.b?.nationality,
          years: `${bc.firstYear}–${bc.lastYear}`,
        },
        comparisons: [
          row('Titles', ac.championships, bc.championships),
          row('Wins', ac.wins, bc.wins),
          row('Poles', ac.poles, bc.poles),
          row('Podiums', ac.podiums, bc.podiums),
        ],
        footerRight: 'Compare mode',
      }];
    }

    case 'trivia':
      return ['fact', {
        kickerText: 'Did you know?',
        text: d.fact.text,
        footerRight: d.fact.category || '',
      }];

    default:
      throw new Error(`No card layout for angle "${candidate.angle}"`);
  }
}

/** Render one format. Returns a PNG buffer. */
export async function renderCard(candidate, copy, format) {
  if (!FORMATS[format]) throw new Error(`Unknown card format "${format}"`);
  const m = metrics(format);
  const [skeleton, props] = await propsFor(candidate, copy, m);
  const tree = await LAYOUTS[skeleton](m, props);
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

export { LAYOUTS, FACE_ASPECT, unitOf, splitName, sessionValue, SESSION_LABEL, BANDS };
export { FORMATS, DEFAULT_FORMATS };
