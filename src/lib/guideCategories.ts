// Guide categories for the beginner's-guide index. Kept in a plain module
// (no `astro:content` import) so both the content schema (src/content/config.ts)
// and the unit-tested guide lib (src/lib/guide.ts) can share them without
// pulling the Astro content runtime into vitest.

export const GUIDE_CATEGORIES = [
  'weekend',
  'scoring',
  'machine',
  'control',
  'team',
  'reference',
] as const;

export type GuideCategory = (typeof GUIDE_CATEGORIES)[number];

export const GUIDE_CATEGORY_LABELS: Record<GuideCategory, string> = {
  weekend: 'The Weekend',
  scoring: 'Scoring & Strategy',
  machine: 'The Machinery',
  control: 'Race Control',
  team: 'Inside The Team',
  reference: 'Reference',
};

export const GUIDE_CATEGORY_DESCRIPTIONS: Record<GuideCategory, string> = {
  weekend: 'How a Grand Prix unfolds, Friday to Sunday.',
  scoring: 'Where points come from and how races are won off track.',
  machine: 'The hardware that defines modern lap time.',
  control: 'The flags, cautions and penalties that govern a race.',
  team: 'The people and the radio calls behind every result.',
  reference: 'Quick lookups for the jargon you will hear.',
};
