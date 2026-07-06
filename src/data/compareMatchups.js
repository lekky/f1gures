// Curated head-to-head suggestions for the /compare/ launcher. Each entry is a
// pair of archive refs plus a short "why these two" kicker + reason. The
// SuggestedMatchups island shuffles these on every load, so the featured picks
// rotate on each visit. Refs must exist in the archive indexes and (ideally)
// have a face/logo in public/images/{drivers,teams}/ — the picker resolves the
// name, colour and nationality from the index at render time.
//
// Keep reasons evergreen (relationship/rivalry, not this-season stats) so they
// never go stale.

export const DRIVER_MATCHUPS = [
  { a: 'max_verstappen',     b: 'hamilton',           tag: 'Modern era',       reason: 'The 2021 title fight that ran to the final lap in Abu Dhabi.' },
  { a: 'senna',              b: 'prost',              tag: 'The rivalry',      reason: 'Teammates turned enemies — the feud that defined a generation.' },
  { a: 'hamilton',           b: 'michael_schumacher', tag: 'Record vs record', reason: 'Two seven-time World Champions, three decades apart.' },
  { a: 'alonso',             b: 'hamilton',           tag: '2007 teammates',   reason: 'The double champion and the rookie who tore McLaren apart.' },
  { a: 'hunt',               b: 'lauda',              tag: '1976',             reason: 'The playboy and the perfectionist — a season for the ages.' },
  { a: 'prost',              b: 'lauda',              tag: 'Half a point',     reason: 'McLaren teammates split by the closest title in history.' },
  { a: 'piquet',             b: 'mansell',            tag: 'Williams at war',  reason: 'Two number ones in one garage, and neither would yield.' },
  { a: 'rosberg',            b: 'hamilton',           tag: 'Mercedes showdown',reason: 'Childhood friends who fought to the wire in 2016.' },
  { a: 'clark',              b: 'stewart',            tag: 'Tartan kings',     reason: "Scotland's two greatest, back to back." },
  { a: 'fangio',             b: 'hamilton',           tag: 'Then & now',       reason: 'The five-time maestro against the modern record-breaker.' },
  { a: 'senna',              b: 'michael_schumacher', tag: 'What if',          reason: 'The duel the sport was robbed of in 1994.' },
  { a: 'norris',             b: 'piastri',            tag: 'Papaya rules',     reason: "McLaren's young guns, wheel to wheel." },
  { a: 'leclerc',            b: 'max_verstappen',     tag: 'Karting rivals',   reason: 'From the European karting tracks to the front of the grid.' },
  { a: 'vettel',            b: 'alonso',             tag: '2010–2013',        reason: "Red Bull's dominator against Ferrari's fighter." },
  { a: 'gilles_villeneuve',  b: 'senna',              tag: 'Pure speed',       reason: 'Two drivers who chased the limit like no one else.' },
  { a: 'ascari',             b: 'fangio',             tag: '1950s duel',       reason: "The two titans of Formula 1's first decade." },
];

export const TEAM_MATCHUPS = [
  { a: 'ferrari',   b: 'mclaren',   tag: 'The big two',        reason: "F1's two winningest teams, 400+ victories between them." },
  { a: 'ferrari',   b: 'mercedes',  tag: 'Scarlet vs silver',  reason: 'The Scuderia against the Silver Arrows.' },
  { a: 'red_bull',  b: 'mercedes',  tag: 'Hybrid-era kings',   reason: 'The two dynasties of the turbo-hybrid age.' },
  { a: 'williams',  b: 'mclaren',   tag: 'British giants',     reason: 'The garagistes who ruled the eighties and nineties.' },
  { a: 'ferrari',   b: 'red_bull',  tag: 'Old vs new',         reason: 'Seventy years of history against the energy-drink upstart.' },
  { a: 'renault',   b: 'benetton',  tag: 'Shared DNA',         reason: 'One Enstone factory, two championship-winning names.' },
  { a: 'brabham',   b: 'williams',  tag: "Constructors' crowns",reason: 'Champion marques a generation apart.' },
  { a: 'tyrrell',   b: 'brm',       tag: 'British classics',   reason: "Two title winners from F1's golden age." },
  { a: 'mercedes',  b: 'mclaren',   tag: 'Woking & Brackley',  reason: 'Long-time partners, then rivals for the crown.' },
];
