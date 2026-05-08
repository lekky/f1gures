import { buildFallback } from '../../data/buildFallback.js';
import { useYearAwareData } from '../../lib/yearAwareData.js';
import CircuitsIndexScreen from './screens/CircuitsIndexScreen.jsx';

const fallback = buildFallback();

export default function CircuitsIndexIsland() {
  const data = useYearAwareData(fallback);
  return <CircuitsIndexScreen data={data} />;
}
