import {
  OG_HEIGHT, COLORS, absCard, ogImg, wmTopLeft, urlBottomLeft, statBlock, loadFace, loadFlag, loadFadedFlag,
} from './og-shared.mjs';

const div = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const txt = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

export async function renderDriverOg(driver, { teamColor } = {}) {
  const fullName = `${driver.forename} ${driver.surname}`;
  const c = driver.career || {};
  const yearsLabel = c.firstYear === c.lastYear ? `${c.firstYear}` : `${c.firstYear}–${c.lastYear}`;
  const strip = teamColor && teamColor !== '#888888' ? teamColor : COLORS.accent;

  const [face, flagChip, flagWash] = await Promise.all([
    loadFace(driver.driverRef, 430, OG_HEIGHT),
    loadFlag(driver.nationality, 46, 31),
    loadFadedFlag(driver.nationality, 900, OG_HEIGHT, { dir: 'left', maxAlpha: 0.28 }),
  ]);

  // Name auto-sizes down for long names so it stays clear of the photo.
  const nameSize = fullName.length > 18 ? 74 : fullName.length > 14 ? 84 : 92;

  const stats = [];
  if (c.championships > 0) stats.push(statBlock(`${c.championships}×`, 'Titles'));
  stats.push(statBlock(c.wins ?? 0, 'Wins'));
  stats.push(statBlock(c.poles ?? 0, 'Poles'));
  stats.push(statBlock(c.podiums ?? 0, 'Podiums'));

  const subtitle = `${driver.nationality || ''} · ${yearsLabel}`.trim();
  const left = div({ flexDirection: 'column', position: 'absolute', top: 128, left: 60, width: 740 }, [
    txt({ fontSize: 28, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.08em' }, 'F1 Driver'),
    txt({ fontSize: nameSize, fontWeight: 700, lineHeight: 1.02, marginTop: 6 }, fullName),
    div({ alignItems: 'center', gap: 14, marginTop: 16 }, [
      flagChip ? ogImg(flagChip, 46, 31, { borderRadius: 4 }) : div({}, []),
      txt({ fontSize: 32, color: COLORS.muted }, subtitle),
    ]),
    div({ marginTop: 40, gap: 40 }, stats),
  ]);

  const wash = flagWash
    ? div({ position: 'absolute', top: 0, left: 0, width: 900, height: OG_HEIGHT }, [ogImg(flagWash, 900, OG_HEIGHT, { objectFit: 'cover' })])
    : div({}, []);

  const right = div({ position: 'absolute', top: 0, right: 0, width: 430, height: OG_HEIGHT }, [
    div({ position: 'absolute', top: 0, left: 0, width: 6, height: OG_HEIGHT, backgroundColor: strip }, []),
    face ? ogImg(face, 430, OG_HEIGHT, { objectFit: 'cover' }) : div({}, []),
    div({ position: 'absolute', top: 0, left: 0, width: 430, height: OG_HEIGHT, backgroundImage: 'linear-gradient(90deg, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0) 34%)' }, []),
  ]);

  return absCard([wash, right, left, wmTopLeft(), urlBottomLeft()]);
}
