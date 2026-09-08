// TierTable — read-only view of the published form tiers for a round.
//
// Used twice:
//   * on the /fantasy/ hub as a snapshot of the round you can pick for;
//   * on /fantasy/tiers/ (workstream F), which server-renders a placeholder
//     `<div id="fantasy-live-tiers" data-fantasy-tiers>`. That page needs a
//     one-line wiring only:
//
//         import TierTable from '../../components/islands/fantasy/TierTable.jsx';
//         <TierTable client:load mount="#fantasy-live-tiers" />
//
//     With `mount` set the island renders through a portal into that node,
//     clearing the static placeholder children first.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fantasyConfigured,
  loadSeason,
  loadRounds,
  loadTiers,
  pickableRound,
  lastLockedRound,
  pbError,
} from './pb.js';
import { NotConfigured, Loading, ErrorNote, Empty, TeamDot, useTeamMeta, useClearedMount } from './ui.jsx';

const TIER_LETTERS = ['A', 'B', 'C', 'D'];

export function useTierData() {
  const [state, setState] = useState({ loading: true, error: '', season: null, round: null, tiers: [] });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const season = await loadSeason();
        if (!season) throw new Error('No fantasy season has been set up yet.');
        const rounds = await loadRounds(season.id);
        const round = pickableRound(rounds) || lastLockedRound(rounds);
        const tiers = round ? await loadTiers(round.id) : [];
        if (alive) setState({ loading: false, error: '', season, round, tiers });
      } catch (err) {
        if (alive) setState({ loading: false, error: pbError(err).message, season: null, round: null, tiers: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

export function TierGrid({ tiers, meta, dense = false }) {
  const byTier = TIER_LETTERS.map((letter) => ({
    letter,
    rows: tiers.filter((t) => t.tier === letter).sort((a, b) => a.rank - b.rank),
  }));

  return (
    <div className={`fx-tiergrid ${dense ? 'is-dense' : ''}`}>
      {byTier.map((col) => (
        <div className="fx-tiercol" key={col.letter}>
          <div className="fx-tiercol-head">
            <span className="fx-tier-letter">Tier {col.letter}</span>
            <span className="fx-tiercol-count t-mono">{col.rows.length}</span>
          </div>
          <ul className="fx-tierlist">
            {col.rows.map((row) => {
              const entry = row.expand?.entry;
              return (
                <li className="fx-tierrow" key={row.id}>
                  <span className="fx-tierrow-rank t-mono">{row.rank}</span>
                  <TeamDot meta={meta} teamId={entry?.teamId} title={entry?.teamName} />
                  <span className="fx-tierrow-name">
                    <span className="fx-tierrow-code t-mono">{entry?.code || '—'}</span>
                    <span className="fx-tierrow-full">{entry?.name || 'Unknown driver'}</span>
                  </span>
                  <span className="fx-tierrow-avg t-mono">{Math.round(row.avgPts || 0)}</span>
                </li>
              );
            })}
            {!col.rows.length && <li className="fx-tierrow is-empty">No drivers</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TierBody({ dense }) {
  const { loading, error, season, round, tiers } = useTierData();
  const meta = useTeamMeta(season?.year);

  if (loading) return <Loading label="Loading tiers…" />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!round) return <Empty>No round has been published yet.</Empty>;
  if (!tiers.length) return <Empty>Tiers for round {round.round} haven’t been published yet.</Empty>;

  return (
    <div className="fx-tiers">
      <div className="fx-tiers-head">
        <div>
          <div className="t-eyebrow">Round {round.round}</div>
          <div className="fx-tiers-title">{round.name}</div>
        </div>
        <div className="fx-tiers-legend">
          Ranked by average fantasy points over the last six rounds. The number on the right is that
          average.
        </div>
      </div>
      <TierGrid tiers={tiers} meta={meta} dense={dense} />
    </div>
  );
}

export default function TierTable({ mount = '', dense = false }) {
  const target = useClearedMount(mount);

  if (!fantasyConfigured()) {
    const notice = <NotConfigured />;
    if (!mount) return notice;
    return target ? createPortal(notice, target) : null;
  }

  const body = <TierBody dense={dense} />;
  if (!mount) return body;
  return target ? createPortal(body, target) : null;
}
