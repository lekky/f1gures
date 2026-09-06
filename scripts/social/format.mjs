// scripts/social/format.mjs
//
// Small pure string/date helpers shared by the caption composer and the card
// templates. Kept separate so both can be unit-tested without touching Satori
// or the filesystem.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "1976-08-01" -> "1 August 1976". Returns '' for unparseable input. */
export function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "1976-08-01" -> "1 August". */
export function dayMonth(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

/** 1 -> "1st", 2 -> "2nd", 23 -> "23rd". */
export function ordinal(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  const abs = Math.abs(v) % 100;
  const last = abs % 10;
  const suffix = abs >= 11 && abs <= 13 ? 'th' : last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th';
  return `${v}${suffix}`;
}

/** plural(1,'win') -> "1 win"; plural(3,'win') -> "3 wins". */
export function plural(n, word, pluralWord) {
  const v = Number(n) || 0;
  return `${v} ${v === 1 ? word : pluralWord || `${word}s`}`;
}

/** Years elapsed between two ISO dates, floored. */
export function yearsBetween(fromIso, toIso) {
  const a = new Date(`${fromIso}T00:00:00Z`);
  const b = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a.valueOf()) || Number.isNaN(b.valueOf())) return null;
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  const beforeAnniversary =
    b.getUTCMonth() < a.getUTCMonth() ||
    (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return years;
}

/** Whole days from a to b (b - a), using UTC midnights. */
export function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** "Lewis Hamilton" -> "Hamilton's"; "Nigel Mansell" wins -> "Mansell's". */
export function possessive(name) {
  const s = String(name || '');
  if (!s) return s;
  return /s$/i.test(s) ? `${s}'` : `${s}'s`;
}

/** Truncate on a word boundary, appending an ellipsis when cut. */
export function clamp(text, max) {
  const s = String(text || '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Title-cases a kebab/snake slug for display: "wins-at-circuit" -> "Wins At Circuit". */
export function titleFromSlug(slug) {
  return String(slug || '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export { MONTHS };
