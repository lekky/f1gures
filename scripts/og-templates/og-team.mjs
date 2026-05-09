import { ogCard, ogBrand, ogTitle, ogSubtitle, COLORS } from './og-shared.mjs';

export function renderTeamOg(team) {
  const yearsLabel = team.career.firstYear === team.career.lastYear
    ? `${team.career.firstYear}`
    : `${team.career.firstYear}–${team.career.lastYear}`;

  const top = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 28, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.08em' },
            children: 'F1 Constructor',
          },
        },
        ogTitle(team.name),
        ogSubtitle(`${team.nationality || ''} · ${yearsLabel}`.trim()),
      ],
    },
  };

  const bottom = {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 38, fontWeight: 700 },
            children: `${team.career.races} races · ${team.career.wins} wins · ${team.career.championships} WCC`,
          },
        },
        ogBrand(),
      ],
    },
  };

  return ogCard([top, bottom]);
}
