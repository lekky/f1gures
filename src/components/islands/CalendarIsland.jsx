// CalendarIsland — thin wrapper that builds the F1_DATA object once
// (deterministic, runs on both SSR and client) and passes it to CalendarScreen.
// Until PR 2 wires real data/<year>.json loading, this uses the speculative
// 2026 fallback dataset that the legacy site shipped as default.

import { buildFallback } from '../../data/buildFallback.js';
import CalendarScreen from './screens/CalendarScreen.jsx';

const data = buildFallback();

export default function CalendarIsland() {
  return <CalendarScreen data={data} />;
}
