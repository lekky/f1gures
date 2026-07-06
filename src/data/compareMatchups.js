// Signature seed matchups for the /compare/ suggestions pool. These are the
// hand-curated head-to-heads whose *reason* the raw archive data can't phrase on
// its own — iconic cross-team rivalries, father-and-son bloodlines, and
// cross-generation "who was better" pairings whose careers never shared a grid.
//
// They're only a seed: scripts/compareSuggestions.mjs folds these in first, then
// generates hundreds more from the archive (teammate duels, title twins,
// same-nation greats, win-list neighbours, cross-era champions). Every ref below
// is validated at build time — a typo'd or face-less ref is silently dropped, so
// keep refs canonical (the archive driverRef / constructorRef slug).

export const DRIVER_MATCHUPS = [
  // ── the great rivalries (both drove, but rarely/never teammates) ──
  { a: 'senna',          b: 'prost',              tag: 'The rivalry',      reason: 'Teammates turned enemies — the feud that defined an era.' },
  { a: 'hunt',           b: 'lauda',              tag: '1976',             reason: 'The playboy and the perfectionist — a season for the ages.' },
  { a: 'max_verstappen', b: 'hamilton',           tag: '2021',             reason: 'The title fight that ran to the final lap in Abu Dhabi.' },
  { a: 'senna',          b: 'mansell',            tag: '80s icons',        reason: "Two of the decade's fiercest racers, wheel to wheel." },
  { a: 'prost',          b: 'mansell',            tag: '80s icons',        reason: 'McLaren precision against Williams power.' },
  { a: 'hamilton',       b: 'vettel',             tag: 'Modern rivals',    reason: 'The championship duels of 2017 and 2018.' },
  { a: 'vettel',         b: 'alonso',             tag: '2010–2013',        reason: "Red Bull's dominator against Ferrari's fighter." },
  { a: 'leclerc',        b: 'max_verstappen',     tag: 'Karting rivals',   reason: 'From the European karting tracks to the front of the grid.' },
  { a: 'norris',         b: 'max_verstappen',     tag: 'New era',          reason: 'The rivalry shaping the next decade of Formula 1.' },
  { a: 'alonso',         b: 'hamilton',           tag: '2007 teammates',   reason: 'The double champion and the rookie who tore McLaren apart.' },

  // ── bloodlines: fathers and sons ──
  { a: 'hill',           b: 'damon_hill',         tag: 'Bloodline',        reason: 'The only father and son to both be crowned World Champion.' },
  { a: 'keke_rosberg',   b: 'rosberg',            tag: 'Bloodline',        reason: 'Father and son champions, thirty-four years apart.' },
  { a: 'gilles_villeneuve', b: 'villeneuve',      tag: 'Bloodline',        reason: "Ferrari's fallen hero and his championship-winning son." },
  { a: 'michael_schumacher', b: 'mick_schumacher',tag: 'Bloodline',        reason: 'A record-breaking father and the son who carried the name.' },
  { a: 'verstappen',     b: 'max_verstappen',     tag: 'Bloodline',        reason: 'The father who raced, the son who conquered.' },

  // ── cross-generation: the GOAT debate (careers never overlapped) ──
  { a: 'fangio',         b: 'hamilton',           tag: 'Then & now',       reason: 'The five-time maestro against the modern record-breaker.' },
  { a: 'hamilton',       b: 'michael_schumacher', tag: 'Record vs record', reason: 'Two seven-time World Champions, three decades apart.' },
  { a: 'senna',          b: 'max_verstappen',     tag: 'Natural talent',   reason: 'Two of the most naturally gifted, a generation apart.' },
  { a: 'clark',          b: 'max_verstappen',     tag: 'Effortless speed', reason: 'The natural then, the natural now.' },
  { a: 'prost',          b: 'vettel',             tag: 'The thinkers',     reason: 'The professors — champions who won with the head.' },
  { a: 'stewart',        b: 'hamilton',           tag: 'British greats',   reason: "Britain's great champions, across the decades." },
  { a: 'ascari',         b: 'max_verstappen',     tag: 'Dominators',       reason: 'Two eras of total, front-running dominance.' },
  { a: 'moss',           b: 'hamilton',           tag: 'What if',          reason: 'The greatest never crowned meets the record holder.' },
  { a: 'lauda',          b: 'alonso',             tag: 'The fighters',     reason: 'Cerebral racers who never knew when to quit.' },
  { a: 'senna',          b: 'michael_schumacher', tag: 'What if',          reason: 'The duel the sport was robbed of in 1994.' },

  // ── same-nation legends ──
  { a: 'clark',          b: 'stewart',            tag: 'Tartan kings',     reason: "Scotland's two greatest, back to back." },
  { a: 'senna',          b: 'piquet',             tag: 'Brazil',           reason: "Brazil's warring world champions." },
  { a: 'hakkinen',       b: 'raikkonen',          tag: 'Flying Finns',     reason: 'Finland cool under pressure, two generations of it.' },
  { a: 'ascari',         b: 'fangio',             tag: '1950s duel',       reason: "The two titans of Formula 1's first decade." },

  // ── the nearly men ──
  { a: 'moss',           b: 'barrichello',        tag: 'Nearly men',       reason: 'Among the best drivers never to win the title.' },
];

export const TEAM_MATCHUPS = [
  { a: 'ferrari',   b: 'mclaren',   tag: 'The big two',         reason: "F1's two winningest teams, 400+ victories between them." },
  { a: 'ferrari',   b: 'mercedes',  tag: 'Scarlet vs silver',   reason: 'The Scuderia against the Silver Arrows.' },
  { a: 'red_bull',  b: 'mercedes',  tag: 'Hybrid-era kings',    reason: 'The two dynasties of the turbo-hybrid age.' },
  { a: 'williams',  b: 'mclaren',   tag: 'British giants',      reason: 'The garagistes who ruled the eighties and nineties.' },
  { a: 'ferrari',   b: 'red_bull',  tag: 'Old vs new',          reason: 'Seventy years of history against the energy-drink upstart.' },
  { a: 'renault',   b: 'benetton',  tag: 'Shared DNA',          reason: 'One Enstone factory, two championship-winning names.' },
  { a: 'brabham',   b: 'williams',  tag: "Constructors' crowns",reason: 'Champion marques a generation apart.' },
  { a: 'tyrrell',   b: 'brm',       tag: 'British classics',    reason: "Two title winners from F1's golden age." },
  { a: 'mercedes',  b: 'mclaren',   tag: 'Woking & Brackley',   reason: 'Long-time partners, then rivals for the crown.' },
  { a: 'ferrari',   b: 'williams',  tag: 'Titans',              reason: 'Maranello against the Grove garagistes.' },
  { a: 'mclaren',   b: 'red_bull',  tag: 'Design dynasties',    reason: 'Woking heritage against the Milton Keynes machine.' },
  { a: 'mercedes',  b: 'williams',  tag: 'Silver eras',         reason: 'Two spells of crushing Mercedes-powered dominance.' },
];
