import currentSeason from '../../data/currentSeason.js';
import { useYearAwareData } from '../../lib/yearAwareData.js';
import CircuitsIndexScreen from './screens/CircuitsIndexScreen.jsx';

export default function CircuitsIndexIsland() {
  const data = useYearAwareData(currentSeason);
  return <div data-year-aware><CircuitsIndexScreen data={data} /></div>;
}
