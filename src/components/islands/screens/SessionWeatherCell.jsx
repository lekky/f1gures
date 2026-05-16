import WeatherIcon from './WeatherIcon.jsx';
import { formatTemp, wmoToDescription } from '../../../lib/weather.js';

export default function SessionWeatherCell({ forecast, isClimate, useFahrenheit, expanded, mob, onClick }) {
  if (!forecast) return <span aria-hidden="true" />;
  const { wmo, tempC, precipProbPct } = forecast;
  const title = wmoToDescription(wmo);
  const showPrecip = !isClimate && typeof precipProbPct === 'number' && precipProbPct >= 20;
  return (
    <button
      type="button"
      title={title}
      aria-label={`${title}, ${formatTemp(tempC, useFahrenheit)}${showPrecip ? `, ${precipProbPct}% chance of rain` : ''}. Click for hourly breakdown.`}
      aria-expanded={!!expanded}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: expanded ? 'var(--accent)' : 'var(--fg-2)',
        fontFamily: 'var(--f-mono)',
        fontSize: 11,
      }}
    >
      <WeatherIcon wmo={wmo} size={mob ? 18 : 16} />
      {!mob && (
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
          <span>{formatTemp(tempC, useFahrenheit)}</span>
          {showPrecip && <span style={{ color: 'var(--fg-3)', fontSize: 10 }}>{precipProbPct}%</span>}
          {isClimate && <span style={{ color: 'var(--fg-4)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>climate</span>}
        </span>
      )}
      {mob && isClimate && (
        <span aria-hidden="true" style={{ color: 'var(--fg-4)', fontSize: 8, letterSpacing: '0.05em', textTransform: 'uppercase', marginLeft: -4 }}>clim</span>
      )}
    </button>
  );
}
