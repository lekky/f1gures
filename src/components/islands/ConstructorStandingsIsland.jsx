import currentSeason from '../../data/currentSeason.js';
import { useYearAwareData } from '../../lib/yearAwareData.js';
import ConstructorStandingsScreen from './screens/ConstructorStandingsScreen.jsx';

export default function ConstructorStandingsIsland() {
  const data = useYearAwareData(currentSeason);
  return <div data-year-aware><ConstructorStandingsScreen data={data} /></div>;
}
