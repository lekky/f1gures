import { wmoToGlyph, wmoToDescription } from '../../../lib/weather.js';

const PATHS = {
  clear: (
    <>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="3" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="21" />
      <line x1="3" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="21" y2="12" />
      <line x1="5.6" y1="5.6" x2="7" y2="7" />
      <line x1="17" y1="17" x2="18.4" y2="18.4" />
      <line x1="5.6" y1="18.4" x2="7" y2="17" />
      <line x1="17" y1="7" x2="18.4" y2="5.6" />
    </>
  ),
  'partly-cloudy': (
    <>
      <circle cx="8" cy="9" r="3" />
      <path d="M10 18a4 4 0 0 1 0-8 5 5 0 0 1 9.8 1.5A3.5 3.5 0 0 1 18 18z" />
    </>
  ),
  cloudy: (
    <path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.8 1.5A3.5 3.5 0 0 1 15 18z" />
  ),
  fog: (
    <>
      <path d="M5 11h14" />
      <path d="M5 15h14" />
      <path d="M7 7h10" />
      <path d="M7 19h10" />
    </>
  ),
  drizzle: (
    <>
      <path d="M7 14a4 4 0 0 1 0-8 5 5 0 0 1 9.8 1.5A3.5 3.5 0 0 1 15 14z" />
      <line x1="9" y1="17" x2="9" y2="19" />
      <line x1="13" y1="17" x2="13" y2="19" />
    </>
  ),
  rain: (
    <>
      <path d="M7 12a4 4 0 0 1 0-8 5 5 0 0 1 9.8 1.5A3.5 3.5 0 0 1 15 12z" />
      <line x1="8" y1="16" x2="7" y2="20" />
      <line x1="12" y1="16" x2="11" y2="20" />
      <line x1="16" y1="16" x2="15" y2="20" />
    </>
  ),
  storm: (
    <>
      <path d="M7 12a4 4 0 0 1 0-8 5 5 0 0 1 9.8 1.5A3.5 3.5 0 0 1 15 12z" />
      <polyline points="11 14 9 18 12 18 10 22" />
    </>
  ),
  snow: (
    <>
      <path d="M7 12a4 4 0 0 1 0-8 5 5 0 0 1 9.8 1.5A3.5 3.5 0 0 1 15 12z" />
      <line x1="9" y1="16" x2="9" y2="20" />
      <line x1="7" y1="18" x2="11" y2="18" />
      <line x1="14" y1="16" x2="14" y2="20" />
      <line x1="12" y1="18" x2="16" y2="18" />
    </>
  ),
};

export default function WeatherIcon({ wmo, size = 18, strokeWidth = 1.5, title }) {
  const glyph = wmoToGlyph(wmo);
  const ttl = title || wmoToDescription(wmo);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ttl}
    >
      <title>{ttl}</title>
      {PATHS[glyph] || PATHS.cloudy}
    </svg>
  );
}
