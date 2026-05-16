// scripts/records/configs.mjs
//
// Static config for every record in the hub. The records pass in build-archive.mjs
// iterates over RECORD_CONFIGS to drive which generators run and what metadata
// gets attached to each leaderboard.
//
// Field meaning:
//   id            kebab-case slug; URL segment and JSON filename
//   group         section id on the hub page (one of GROUPS keys)
//   title         display string for headings + card eyebrow
//   blurb         one-line description for the sub-page header and meta
//   subjectType   "driver" | "team" | "driver-at-circuit" — drives row rendering
//   valueFormat   "integer" | "age" | "points" — drives valueLabel formatting
//   note          optional caveat shown on the sub-page (currently only title-margin)

export const GROUPS = [
  { id: 'career',         label: 'Career' },
  { id: 'season-streaks', label: 'Single-season & streaks' },
  { id: 'milestones',     label: 'Milestones' },
  { id: 'teams',          label: 'Teams' },
  { id: 'circuit',        label: 'Race & circuit' },
];

export const RECORD_CONFIGS = [
  // Career (driver)
  { id: 'wins',            group: 'career', subjectType: 'driver', valueFormat: 'integer',
    title: 'Most race wins',           blurb: 'Career grand prix victories.' },
  { id: 'podiums',         group: 'career', subjectType: 'driver', valueFormat: 'integer',
    title: 'Most career podiums',      blurb: 'Career top-three finishes.' },
  { id: 'poles',           group: 'career', subjectType: 'driver', valueFormat: 'integer',
    title: 'Most pole positions',      blurb: 'Career pole positions in qualifying.' },
  { id: 'championships',   group: 'career', subjectType: 'driver', valueFormat: 'integer',
    title: "Most drivers' championships", blurb: "World Drivers' Championships won." },
  { id: 'starts',          group: 'career', subjectType: 'driver', valueFormat: 'integer',
    title: 'Most race starts',         blurb: 'Career grand prix entries.' },
  { id: 'fastest-laps',    group: 'career', subjectType: 'driver', valueFormat: 'integer',
    title: 'Most fastest laps',        blurb: 'Career fastest-lap records.' },

  // Single-season & streaks (driver)
  { id: 'wins-in-season',  group: 'season-streaks', subjectType: 'driver', valueFormat: 'integer',
    title: 'Most wins in a single season', blurb: 'Highest race-win total in one calendar season.' },
  { id: 'podium-streak',   group: 'season-streaks', subjectType: 'driver', valueFormat: 'integer',
    title: 'Longest consecutive-podium streak', blurb: 'Longest run of consecutive top-three finishes.' },
  { id: 'win-streak',      group: 'season-streaks', subjectType: 'driver', valueFormat: 'integer',
    title: 'Longest consecutive-win streak', blurb: 'Longest run of consecutive race wins.' },
  { id: 'title-margin',    group: 'season-streaks', subjectType: 'driver', valueFormat: 'points',
    title: 'Biggest championship-winning margin',
    blurb: 'Largest points gap between the champion and the runner-up.',
    note: "Raw point margins aren't directly comparable across eras - F1's points system has changed several times since 1950." },

  // Milestones (driver)
  { id: 'youngest-champion', group: 'milestones', subjectType: 'driver', valueFormat: 'age',
    title: 'Youngest world champion',
    blurb: 'Drivers ordered by age at the final round of the season they won their first title.' },
  { id: 'oldest-winner',   group: 'milestones', subjectType: 'driver', valueFormat: 'age',
    title: 'Oldest race winner',
    blurb: 'Drivers ordered by age at the date of their oldest race-winning result.' },

  // Teams
  { id: 'team-titles',     group: 'teams', subjectType: 'team', valueFormat: 'integer',
    title: "Most constructors' championships", blurb: "World Constructors' Championships won." },
  { id: 'team-wins',       group: 'teams', subjectType: 'team', valueFormat: 'integer',
    title: 'Most team race wins',      blurb: 'Career grand prix victories by constructor.' },
  { id: 'team-1-2-finishes', group: 'teams', subjectType: 'team', valueFormat: 'integer',
    title: 'Most 1-2 finishes',        blurb: 'Races where the same constructor took both first and second place.' },

  // Race & circuit (driver-at-circuit)
  { id: 'wins-at-circuit', group: 'circuit', subjectType: 'driver-at-circuit', valueFormat: 'integer',
    title: 'Most wins by one driver at one circuit', blurb: 'Largest concentration of victories by a single driver at a single venue.' },
  { id: 'poles-at-circuit', group: 'circuit', subjectType: 'driver-at-circuit', valueFormat: 'integer',
    title: 'Most poles by one driver at one circuit', blurb: 'Largest concentration of pole positions by a single driver at a single venue.' },
];

export const MODERN_ERA_START_YEAR = 1981;
export const TOP5 = 5;
export const TOP50 = 50;
