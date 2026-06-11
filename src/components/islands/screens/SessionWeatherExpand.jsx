import WeatherIcon from './WeatherIcon.jsx';
import { formatTemp, wmoToDescription, summarizeHourly } from '../../../lib/weather.js';

function HourCell({ entry, useFahrenheit, timeZone }) {
  // tISO is UTC; label the hour in the same zone the session rows show
  // (track or user, per the panel toggle) so the strip lines up with the
  // printed session start time.
  let hh;
  try {
    hh = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: timeZone || 'UTC' })
      .format(new Date(entry.tISO));
  } catch {
    hh = String(new Date(entry.tISO).getUTCHours()).padStart(2, '0');
  }
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '8px 6px', minWidth: 48, color: 'var(--fg-2)',
    }}>
      <span className="t-mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{hh}:00</span>
      <WeatherIcon wmo={entry.wmo} size={20} />
      <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-1)' }}>{formatTemp(entry.tempC, useFahrenheit)}</span>
      {typeof entry.precipProbPct === 'number' && entry.precipProbPct >= 10 && (
        <span className="t-mono" style={{ fontSize: 9, color: 'var(--fg-3)' }}>{entry.precipProbPct}%</span>
      )}
    </div>
  );
}

export default function SessionWeatherExpand({ forecast, isClimate, useFahrenheit, timeZone }) {
  if (!forecast) return null;
  const stopAll = (e) => e.stopPropagation();
  if (isClimate) {
    return (
      <div onClick={stopAll}
           style={{
             padding: '12px 16px',
             background: 'var(--bg-3)',
             borderBottom: '1px solid var(--line-1)',
             display: 'flex', alignItems: 'center', gap: 16,
           }}>
        <WeatherIcon wmo={forecast.wmo} size={28} />
        <div>
          <div className="t-mono" style={{ fontSize: 12, color: 'var(--fg-1)', marginBottom: 2 }}>
            {wmoToDescription(forecast.wmo)} · {formatTemp(forecast.tempC, useFahrenheit)} · {forecast.precipMm || 0}mm avg precip
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>
            Typical conditions for this race week (10-year average). Live forecast available about 14 days before the race.
          </div>
        </div>
      </div>
    );
  }
  const summary = summarizeHourly(forecast.hourly || []);
  return (
    <div onClick={stopAll}
         style={{
           padding: '10px 14px',
           background: 'var(--bg-3)',
           borderBottom: '1px solid var(--line-1)',
           minWidth: 0,
         }}>
      <div style={{ display: 'flex', overflowX: 'auto', gap: 4, marginBottom: 8, maxWidth: '100%' }}>
        {(forecast.hourly || []).map((h, i) => (
          <HourCell key={i} entry={h} useFahrenheit={useFahrenheit} timeZone={timeZone} />
        ))}
      </div>
      {summary && (
        <div style={{ fontSize: 11, color: 'var(--fg-2)', lineHeight: 1.4 }}>{summary}</div>
      )}
    </div>
  );
}
