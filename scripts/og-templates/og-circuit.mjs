import {
  OG_HEIGHT, COLORS, absCard, ogImg, wmTopRight, urlBottomLeft, statBlock, loadFlagCC, loadFadedFlagCC, loadTrackMap,
} from './og-shared.mjs';

const div = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const txt = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

export async function renderCircuitOg(circuit) {
  const yearsLabel = circuit.firstYear === circuit.lastYear ? `${circuit.firstYear}` : `${circuit.firstYear}–${circuit.lastYear}`;
  const name = (circuit.name || '').replace(/ Circuit$/, '');
  const nameSize = name.length > 18 ? 62 : name.length > 13 ? 72 : 82;
  const mw = circuit.mostWins?.[0];
  const cc = circuit.country;

  const [map, flagChip] = await Promise.all([
    loadTrackMap(circuit.circuitRef, 440, 440),
    loadFlagCC(cc, 46, 31),
  ]);
  // Only wash the background when there's no track map to fill the right side.
  const flagWash = map ? null : await loadFadedFlagCC(cc, 1000, OG_HEIGHT, { dir: 'left', maxAlpha: 0.16 });

  const place = [circuit.location, circuit.countryName].filter(Boolean).join(', ');
  const mwStat = mw ? statBlock(mw.count, `Most wins · ${(mw.name || '').split(' ').pop()}`) : null;
  // With the map on the right the stats column is narrow — show two stats and
  // fold the era into the subtitle. Without a map there's room for all three.
  const location = map ? [place, yearsLabel].filter(Boolean).join(' · ') : place;
  const stats = map
    ? [statBlock(circuit.raceCount, 'F1 Races'), mwStat].filter(Boolean)
    : [
        statBlock(circuit.raceCount, 'F1 Races'),
        statBlock(yearsLabel, circuit.firstYear === circuit.lastYear ? 'Season' : 'Era'),
        mwStat,
      ].filter(Boolean);

  const left = div({ flexDirection: 'column', position: 'absolute', top: 128, left: 60, width: map ? 660 : 940 }, [
    txt({ fontSize: 28, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.08em' }, 'F1 Circuit'),
    txt({ fontSize: nameSize, fontWeight: 700, lineHeight: 1.02, marginTop: 6 }, name),
    div({ alignItems: 'center', gap: 14, marginTop: 16 }, [
      flagChip ? ogImg(flagChip, 46, 31, { borderRadius: 4 }) : div({}, []),
      txt({ fontSize: 32, color: COLORS.muted }, location),
    ]),
    div({ marginTop: 42, gap: 44 }, stats),
  ]);

  const right = map
    ? div({ position: 'absolute', top: 95, right: 40, width: 440, height: 440, alignItems: 'center', justifyContent: 'center' }, [ogImg(map, 440, 440, { objectFit: 'contain' })])
    : flagWash
      ? div({ position: 'absolute', top: 0, left: 0, width: 1000, height: OG_HEIGHT }, [ogImg(flagWash, 1000, OG_HEIGHT, { objectFit: 'cover' })])
      : div({}, []);

  // `right` is the map (beside the text) or the flag wash (behind it); either
  // way it renders first so the text sits on top.
  return absCard([right, left, wmTopRight(), urlBottomLeft()]);
}
