import {
  COLORS, absCard, ogImg, wmTopRight, urlBottomLeft, statBlock, loadLogo,
} from './og-shared.mjs';

const div = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const txt = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

export async function renderTeamOg(team) {
  const c = team.career || {};
  const yearsLabel = c.firstYear === c.lastYear ? `${c.firstYear}` : `${c.firstYear}–${c.lastYear}`;
  const nameSize = team.name.length > 16 ? 74 : team.name.length > 11 ? 84 : 96;

  const logo = await loadLogo(team.constructorRef, 300);

  const left = div({ flexDirection: 'column', position: 'absolute', top: 128, left: 60, width: 720 }, [
    txt({ fontSize: 28, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.08em' }, 'F1 Constructor'),
    txt({ fontSize: nameSize, fontWeight: 700, lineHeight: 1.02, marginTop: 6 }, team.name),
    txt({ fontSize: 32, color: COLORS.muted, marginTop: 14 }, `${team.nationality || ''} · ${yearsLabel}`.trim()),
    div({ marginTop: 42, gap: 40 }, [
      statBlock(c.championships ?? 0, 'Titles'),
      statBlock(c.wins ?? 0, 'Wins'),
      statBlock(c.races ?? 0, 'Races'),
      statBlock(c.podiums ?? 0, 'Podiums'),
    ]),
  ]);

  const right = logo
    ? div({ position: 'absolute', top: 170, right: 70, width: 300, height: 300, borderRadius: 16, overflow: 'hidden' }, [ogImg(logo, 300, 300)])
    : div({}, []);

  return absCard([left, right, wmTopRight(), urlBottomLeft()]);
}
