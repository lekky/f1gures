import { buildFallback } from '../../data/buildFallback.js';
import HomeScreen from './screens/HomeScreen.jsx';

const data = buildFallback();

export default function HomeIsland() {
  return <HomeScreen data={data} />;
}
