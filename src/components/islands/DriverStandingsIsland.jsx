import currentSeason from '../../data/currentSeason.js';
import { useYearAwareData } from '../../lib/yearAwareData.js';
import DriverStandingsScreen from './screens/DriverStandingsScreen.jsx';

export default function DriverStandingsIsland() {
  const data = useYearAwareData(currentSeason);
  return <DriverStandingsScreen data={data} />;
}
