import currentSeason from '../../data/currentSeason.js';
import { useYearAwareData } from '../../lib/yearAwareData.js';
import HomeScreen from './screens/HomeScreen.jsx';

export default function HomeIsland() {
  const data = useYearAwareData(currentSeason);
  return <HomeScreen data={data} />;
}
