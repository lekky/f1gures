import { buildFallback } from '../../data/buildFallback.js';
import DriverStandingsScreen from './screens/DriverStandingsScreen.jsx';

const data = buildFallback();

export default function DriverStandingsIsland() {
  return <DriverStandingsScreen data={data} />;
}
