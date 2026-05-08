// CalendarIsland — thin wrapper. SSR/initial render uses the
// build-time-loaded current season (public/data/<year>.json via
// scripts/sync-current-season.mjs); on hydration useYearAwareData swaps
// in /data/<year>.json if the visitor picked a different year.

import currentSeason from '../../data/currentSeason.js';
import { useYearAwareData } from '../../lib/yearAwareData.js';
import CalendarScreen from './screens/CalendarScreen.jsx';

export default function CalendarIsland() {
  const data = useYearAwareData(currentSeason);
  return <CalendarScreen data={data} />;
}
