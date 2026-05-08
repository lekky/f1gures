import { buildFallback } from '../../data/buildFallback.js';
import { useYearAwareData } from '../../lib/yearAwareData.js';
import HomeScreen from './screens/HomeScreen.jsx';

const fallback = buildFallback();

export default function HomeIsland() {
  const data = useYearAwareData(fallback);
  return <HomeScreen data={data} />;
}
