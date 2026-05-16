import { useEffect, useState } from 'react';

// WMO weather code -> glyph id (see WeatherIcon.jsx for the SVG set).
// Codes come from Open-Meteo. Anything unmapped falls back to 'cloudy'.
const WMO_GLYPH = {
  0: 'clear',
  1: 'partly-cloudy', 2: 'partly-cloudy',
  3: 'cloudy',
  45: 'fog', 48: 'fog',
  51: 'drizzle', 53: 'drizzle', 55: 'drizzle',
  56: 'drizzle', 57: 'drizzle',
  61: 'rain', 63: 'rain', 65: 'rain',
  66: 'rain', 67: 'rain',
  71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow',
  80: 'rain', 81: 'rain', 82: 'rain',
  85: 'snow', 86: 'snow',
  95: 'storm', 96: 'storm', 99: 'storm',
};

const WMO_DESCRIPTION = {
  0: 'Clear sky',
  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Light rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Light snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with light hail', 99: 'Thunderstorm with heavy hail',
};

export function wmoToGlyph(code) {
  return WMO_GLYPH[code] || 'cloudy';
}

export function wmoToDescription(code) {
  return WMO_DESCRIPTION[code] || 'Unknown';
}

export function formatTemp(celsius, useFahrenheit) {
  if (celsius == null) return '-';
  const v = useFahrenheit ? (celsius * 9) / 5 + 32 : celsius;
  return `${Math.round(v)}°`;
}

// Returns 7 hourly entries: 3 before, the session-start hour, 3 after.
// Clamps at array boundaries so the slice is always full-width when possible.
export function pickSessionHours(hourly, sessionMs) {
  if (!hourly || hourly.length === 0) return [];
  let idx = 0, best = Infinity;
  for (let i = 0; i < hourly.length; i++) {
    const d = Math.abs(new Date(hourly[i].tISO).getTime() - sessionMs);
    if (d < best) { best = d; idx = i; }
  }
  let start = Math.max(0, idx - 3);
  let end = Math.min(hourly.length, start + 7);
  start = Math.max(0, end - 7);
  return hourly.slice(start, end);
}

// 45,48 = fog; 51-67 = drizzle/rain; 71-77 = snow; 80-82 = rain showers;
// 85-86 = snow showers; 95-99 = thunderstorm
function isWet(h) {
  const c = h.wmo;
  if (c == null) return false;
  return (c === 45 || c === 48) ||
    (c >= 51 && c <= 67) ||
    (c >= 71 && c <= 77) ||
    (c >= 80 && c <= 86) ||
    (c >= 95 && c <= 99);
}

// One-sentence prose given the 7 hourly entries.
export function summarizeHourly(hours) {
  if (!hours || hours.length === 0) return '';
  const firstWetIdx = hours.findIndex(isWet);
  if (firstWetIdx === -1) return 'Dry conditions throughout the session window.';
  const lastWetIdx = hours.findLastIndex(isWet);
  const wetCount = hours.filter(isWet).length;
  if (wetCount === hours.length) return 'Wet conditions expected across the full session window.';
  if (firstWetIdx <= 1 && lastWetIdx < hours.length - 2) {
    return 'Rain at the start of the window, easing later.';
  }
  if (firstWetIdx > 1 && lastWetIdx >= hours.length - 2) {
    return 'Dry early, with rain developing later in the window.';
  }
  if (hours.length - wetCount >= 3) return 'Intermittent showers across the session window.';
  return 'Mostly wet across the session window.';
}

// NOTE: scripts/build-climate.mjs (Task 4) keeps a copy of this function because
// Node scripts can't import React. Keep both in sync when changing thresholds.
// Reduce climate normal means (cloud %, precip mm) to a representative WMO code.
export function wmoFromMeans(meanCloudPct, meanPrecipMm) {
  if (meanPrecipMm >= 2) return 63;
  if (meanPrecipMm >= 0.5) return 61;
  if (meanCloudPct >= 70) return 3;
  if (meanCloudPct >= 30) return 2;
  return 0;
}

// SSR-safe Celsius/Fahrenheit unit hook.
// Initial render: 'C' (matches prerendered HTML for everyone).
// After hydration: 'F' if navigator.language starts with 'en-US', else 'C'.
export function useTempUnit() {
  const [unit, setUnit] = useState('C');
  useEffect(() => {
    try {
      const lang = (navigator && navigator.language) || '';
      if (lang.startsWith('en-US')) setUnit('F');
    } catch { /* navigator unavailable */ }
  }, []);
  return unit;
}
