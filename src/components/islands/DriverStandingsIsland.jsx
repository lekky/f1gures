import { buildFallback } from '../../data/buildFallback.js';
import { useYearAwareData } from '../../lib/yearAwareData.js';
import DriverStandingsScreen from './screens/DriverStandingsScreen.jsx';

const fallback = buildFallback();

export default function DriverStandingsIsland() {
  const data = useYearAwareData(fallback);
  return <DriverStandingsScreen data={data} />;
}
