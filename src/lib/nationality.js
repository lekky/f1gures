// Nationality (demonym) → { country (ISO 3166-1 alpha-2), flag (emoji) }.
// Covers every nationality that's appeared in F1 since 1950. Unknown values
// fall back to a white flag.
//
// Single source of truth: consumed by scripts/build-archive.mjs (to stamp
// driver docs at build time) AND by src/data/archive.js (to enrich race-result
// rows with flags for the race pages). Plain ESM so both the Node build script
// and Vite-bundled Astro frontmatter can import it.
export const NATIONALITY = {
  'American': { country: 'US', flag: '🇺🇸' },
  'American-Italian': { country: 'US', flag: '🇺🇸' },
  'Argentine': { country: 'AR', flag: '🇦🇷' },
  'Argentine-Italian': { country: 'AR', flag: '🇦🇷' },
  'Argentinian': { country: 'AR', flag: '🇦🇷' },
  'Australian': { country: 'AU', flag: '🇦🇺' },
  'Austrian': { country: 'AT', flag: '🇦🇹' },
  'Belgian': { country: 'BE', flag: '🇧🇪' },
  'Brazilian': { country: 'BR', flag: '🇧🇷' },
  'British': { country: 'GB', flag: '🇬🇧' },
  'Canadian': { country: 'CA', flag: '🇨🇦' },
  'Chilean': { country: 'CL', flag: '🇨🇱' },
  'Chinese': { country: 'CN', flag: '🇨🇳' },
  'Colombian': { country: 'CO', flag: '🇨🇴' },
  'Czech': { country: 'CZ', flag: '🇨🇿' },
  'Danish': { country: 'DK', flag: '🇩🇰' },
  'Dutch': { country: 'NL', flag: '🇳🇱' },
  'East German': { country: 'DE', flag: '🇩🇪' },
  'Finnish': { country: 'FI', flag: '🇫🇮' },
  'French': { country: 'FR', flag: '🇫🇷' },
  'German': { country: 'DE', flag: '🇩🇪' },
  'Hungarian': { country: 'HU', flag: '🇭🇺' },
  'Indian': { country: 'IN', flag: '🇮🇳' },
  'Indonesian': { country: 'ID', flag: '🇮🇩' },
  'Irish': { country: 'IE', flag: '🇮🇪' },
  'Italian': { country: 'IT', flag: '🇮🇹' },
  'Japanese': { country: 'JP', flag: '🇯🇵' },
  'Liechtensteiner': { country: 'LI', flag: '🇱🇮' },
  'Malaysian': { country: 'MY', flag: '🇲🇾' },
  'Mexican': { country: 'MX', flag: '🇲🇽' },
  'Monegasque': { country: 'MC', flag: '🇲🇨' },
  'New Zealander': { country: 'NZ', flag: '🇳🇿' },
  'Polish': { country: 'PL', flag: '🇵🇱' },
  'Portuguese': { country: 'PT', flag: '🇵🇹' },
  'Rhodesian': { country: 'ZW', flag: '🇿🇼' },
  'Russian': { country: 'RU', flag: '🇷🇺' },
  'South African': { country: 'ZA', flag: '🇿🇦' },
  'Spanish': { country: 'ES', flag: '🇪🇸' },
  'Swedish': { country: 'SE', flag: '🇸🇪' },
  'Swiss': { country: 'CH', flag: '🇨🇭' },
  'Thai': { country: 'TH', flag: '🇹🇭' },
  'Uruguayan': { country: 'UY', flag: '🇺🇾' },
  'Venezuelan': { country: 'VE', flag: '🇻🇪' },
};

export function natInfo(nationality) {
  if (!nationality) return { country: '', flag: '🏳' };
  const trimmed = nationality.trim();
  return NATIONALITY[trimmed] || { country: '', flag: '🏳' };
}
