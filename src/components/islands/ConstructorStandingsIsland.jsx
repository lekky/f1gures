import { buildFallback } from '../../data/buildFallback.js';
import ConstructorStandingsScreen from './screens/ConstructorStandingsScreen.jsx';

const data = buildFallback();

export default function ConstructorStandingsIsland() {
  return <ConstructorStandingsScreen data={data} />;
}
