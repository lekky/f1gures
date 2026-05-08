// CalendarIsland — thin wrapper. SSR/initial render uses the 2026 fallback
// (the prerendered SEO content); on hydration useYearAwareData swaps in the
// /data/<year>.json bundle if the visitor picked a past year.

import { buildFallback } from '../../data/buildFallback.js';
import { useYearAwareData } from '../../lib/yearAwareData.js';
import CalendarScreen from './screens/CalendarScreen.jsx';

const fallback = buildFallback();

export default function CalendarIsland() {
  const data = useYearAwareData(fallback);
  return <CalendarScreen data={data} />;
}
