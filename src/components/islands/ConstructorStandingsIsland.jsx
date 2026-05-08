import { buildFallback } from '../../data/buildFallback.js';
import { useYearAwareData } from '../../lib/yearAwareData.js';
import ConstructorStandingsScreen from './screens/ConstructorStandingsScreen.jsx';

const fallback = buildFallback();

export default function ConstructorStandingsIsland() {
  const data = useYearAwareData(fallback);
  return <ConstructorStandingsScreen data={data} />;
}
