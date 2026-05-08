import { buildFallback } from '../../data/buildFallback.js';
import CircuitsIndexScreen from './screens/CircuitsIndexScreen.jsx';

const data = buildFallback();

export default function CircuitsIndexIsland() {
  return <CircuitsIndexScreen data={data} />;
}
