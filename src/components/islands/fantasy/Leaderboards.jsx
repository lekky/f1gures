// Leaderboards — the /fantasy/standings/ screen.
//
// Three views over the same season: the season championship, each six-round
// Split, and a single round. Expanding a row on the round view reveals that
// player's lineup — which only works after the round has locked, because the
// picks API rule hides everyone else's team until then.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SLOTS,
  SLOT_FIELD,
  loadSeason,
  loadRounds,
  loadStandings,
  loadRoundScores,
  loadPicksForRound,
  loadMyPickScores,
  displayNameFor,
  isLocked,
  pbError,
  fantasyConfigured,
} from './pb.js';
import { NotConfigured, Loading, ErrorNote, Empty, TeamDot, useAuth, useTeamMeta } from './ui.jsx';

export default function Leaderboards() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: '' });
  const [view, setView] = useState('season');
  const [roundId, setRoundId] = useState('');

  useEffect(() => {
    if (!fantasyConfigured()) {
      setState({ loading: false, error: '', notConfigured: true });
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const season = await loadSeason();
        if (!season) throw new Error('No fantasy season has been set up yet.');
        const [rounds, standings] = await Promise.all([loadRounds(season.id), loadStandings(season.id)]);
        if (!alive) return;
        const locked = rounds.filter((r) => isLocked(r));
        setState({ loading: false, error: '', season, rounds, standings, locked });
        if (locked.length) setRoundId(locked[locked.length - 1].id);
      } catch (err) {
        if (alive) setState({ loading: false, error: pbError(err).message });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const { season, standings = [], locked = [] } = state;
  const meta = useTeamMeta(season?.year);

  const scopes = useMemo(() => {
    const set = new Set(standings.map((s) => s.scope));
    const splits = [...set].filter((s) => s !== 'season').sort((a, b) => {
      const na = Number(a.split('-')[1] || 0);
      const nb = Number(b.split('-')[1] || 0);
      return na - nb;
    });
    return ['season', ...splits];
  }, [standings]);

  if (state.notConfigured) return <NotConfigured />;
  if (state.loading) return <Loading label="Loading standings…" />;
  if (state.error) return <ErrorNote>{state.error}</ErrorNote>;

  const tabs = [
    ...scopes.map((s) => ({
      id: s,
      label: s === 'season' ? 'Season' : `Split ${s.split('-')[1]}`,
    })),
    { id: 'round', label: 'By round' },
  ];

  return (
    <div className="fx-leaderboards">
      <div className="fx-tabs" role="tablist" aria-label="Leaderboard view">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={view === t.id}
            className={`fx-tab ${view === t.id ? 'is-active' : ''}`}
            onClick={() => setView(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'round' ? (
        <RoundBoard
          rounds={locked}
          roundId={roundId}
          onRound={setRoundId}
          myId={user?.id}
          meta={meta}
        />
      ) : (
        <ScopeBoard
          rows={standings.filter((s) => s.scope === view)}
          scope={view}
          myId={user?.id}
        />
      )}

      <p className="fx-footnote">
        Only your own display name is readable through the API today — everyone else shows as a
        stable handle until public profiles are switched on.
      </p>
    </div>
  );
}

// ─── season / split ───────────────────────────────────────────────────────
function ScopeBoard({ rows, scope, myId }) {
  const [open, setOpen] = useState('');
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          (b.points || 0) - (a.points || 0) ||
          (b.splitWins || 0) - (a.splitWins || 0) ||
          (b.bestWeekend || 0) - (a.bestWeekend || 0) ||
          (b.weeksTop || 0) - (a.weeksTop || 0)
      ),
    [rows]
  );

  if (!sorted.length) {
    return <Empty>No {scope === 'season' ? 'season' : 'split'} standings have been published yet.</Empty>;
  }

  return (
    <div className="fx-tablewrap">
      <table className="tbl tbl-static fx-standings">
        <thead>
          <tr>
            <th className="t-num">#</th>
            <th>Player</th>
            <th className="t-num">Points</th>
            <th className="t-num">Best</th>
            <th className="t-num">Top weeks</th>
            {scope === 'season' && <th className="t-num">Split wins</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <StandingRow
              key={row.id}
              row={row}
              pos={i + 1}
              scope={scope}
              myId={myId}
              open={open === row.id}
              onToggle={() => setOpen(open === row.id ? '' : row.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StandingRow({ row, pos, scope, myId, open, onToggle }) {
  const mine = row.user === myId;
  return (
    <>
      <tr className={`fx-row ${mine ? 'is-me' : ''}`} onClick={onToggle}>
        <td className="t-num">
          <span className={`pos ${pos <= 3 ? `pos-${pos}` : ''}`}>{pos}</span>
        </td>
        <td>
          <button type="button" className="fx-rowname" aria-expanded={open}>
            {displayNameFor(row, myId)}
            <span className="fx-rowchev" aria-hidden="true">{open ? '−' : '+'}</span>
          </button>
        </td>
        <td className="t-num t-mono">{Math.round(row.points || 0)}</td>
        <td className="t-num t-mono">{Math.round(row.bestWeekend || 0)}</td>
        <td className="t-num t-mono">{row.weeksTop || 0}</td>
        {scope === 'season' && <td className="t-num t-mono">{row.splitWins || 0}</td>}
      </tr>
      {open && (
        <tr className="fx-expand">
          <td colSpan={scope === 'season' ? 6 : 5}>
            <UserRoundHistory userId={row.user} myId={myId} />
          </td>
        </tr>
      )}
    </>
  );
}

function UserRoundHistory({ userId, myId }) {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });

  useEffect(() => {
    let alive = true;
    loadMyPickScores(userId)
      .then((rows) => {
        if (!alive) return;
        const sorted = rows
          .filter((r) => r.expand?.round)
          .sort((a, b) => (a.expand.round.round || 0) - (b.expand.round.round || 0));
        setState({ loading: false, rows: sorted, error: '' });
      })
      .catch((err) => alive && setState({ loading: false, rows: [], error: pbError(err).message }));
    return () => {
      alive = false;
    };
  }, [userId]);

  if (state.loading) return <Loading label="Loading rounds…" />;
  if (state.error) return <ErrorNote>{state.error}</ErrorNote>;
  if (!state.rows.length) return <Empty>No scored rounds yet.</Empty>;

  return (
    <div className="fx-history">
      {state.rows.map((r) => (
        <div className="fx-history-cell" key={r.id}>
          <span className="fx-history-round t-mono">R{r.expand.round.round}</span>
          <span className="fx-history-pts t-mono">{Math.round(r.total || 0)}</span>
        </div>
      ))}
      {userId === myId && <span className="fx-history-note">Your weekend scores</span>}
    </div>
  );
}

// ─── one round ────────────────────────────────────────────────────────────
function RoundBoard({ rounds, roundId, onRound, myId, meta }) {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  const [open, setOpen] = useState('');

  const load = useCallback(() => {
    if (!roundId) {
      setState({ loading: false, rows: [], error: '' });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    loadRoundScores(roundId)
      .then((rows) => setState({ loading: false, rows, error: '' }))
      .catch((err) => setState({ loading: false, rows: [], error: pbError(err).message }));
  }, [roundId]);

  useEffect(() => {
    load();
    setOpen('');
  }, [load]);

  if (!rounds.length) return <Empty>No round has locked yet, so there is nothing to compare.</Empty>;

  return (
    <div className="fx-roundboard">
      <div className="fx-field fx-roundpick">
        <label className="fx-label" htmlFor="fx-round">Round</label>
        <select
          id="fx-round"
          className="fx-input"
          value={roundId}
          onChange={(e) => onRound(e.target.value)}
        >
          {[...rounds].reverse().map((r) => (
            <option key={r.id} value={r.id}>
              R{r.round} — {r.name}
            </option>
          ))}
        </select>
      </div>

      {state.loading && <Loading label="Loading round…" />}
      {state.error && <ErrorNote>{state.error}</ErrorNote>}
      {!state.loading && !state.error && !state.rows.length && (
        <Empty>This round hasn’t been scored yet.</Empty>
      )}

      {!!state.rows.length && (
        <div className="fx-tablewrap">
          <table className="tbl tbl-static fx-standings">
            <thead>
              <tr>
                <th className="t-num">#</th>
                <th>Player</th>
                <th className="t-num">Points</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row, i) => (
                <RoundRow
                  key={row.id}
                  row={row}
                  pos={i + 1}
                  myId={myId}
                  meta={meta}
                  roundId={roundId}
                  open={open === row.id}
                  onToggle={() => setOpen(open === row.id ? '' : row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RoundRow({ row, pos, myId, meta, roundId, open, onToggle }) {
  const mine = row.user === myId;
  return (
    <>
      <tr className={`fx-row ${mine ? 'is-me' : ''}`} onClick={onToggle}>
        <td className="t-num">
          <span className={`pos ${pos <= 3 ? `pos-${pos}` : ''}`}>{pos}</span>
        </td>
        <td>
          <button type="button" className="fx-rowname" aria-expanded={open}>
            {displayNameFor(row, myId)}
            <span className="fx-rowchev" aria-hidden="true">{open ? '−' : '+'}</span>
          </button>
        </td>
        <td className="t-num t-mono">{Math.round(row.total || 0)}</td>
      </tr>
      {open && (
        <tr className="fx-expand">
          <td colSpan={3}>
            <Lineup userId={row.user} roundId={roundId} meta={meta} breakdown={row.breakdown} />
          </td>
        </tr>
      )}
    </>
  );
}

function Lineup({ userId, roundId, meta, breakdown }) {
  const [state, setState] = useState({ loading: true, pick: null, error: '' });

  useEffect(() => {
    let alive = true;
    loadPicksForRound(roundId, userId)
      .then((rows) => alive && setState({ loading: false, pick: rows[0] || null, error: '' }))
      .catch((err) => alive && setState({ loading: false, pick: null, error: pbError(err).message }));
    return () => {
      alive = false;
    };
  }, [userId, roundId]);

  if (state.loading) return <Loading label="Loading lineup…" />;
  if (state.error) return <ErrorNote>{state.error}</ErrorNote>;
  if (!state.pick) return <Empty>This lineup isn’t visible (the round may not have locked yet).</Empty>;

  const pick = state.pick;
  const b = breakdown || {};

  return (
    <div className="fx-lineup">
      {SLOTS.map((slot) => {
        const entry = pick.expand?.[SLOT_FIELD[slot]];
        const score = b[slot] || {};
        const isBoost = pick.boost === slot;
        const isEmergency = pick.emergency && pick.emergency[slot] === true;
        return (
          <div className="fx-lineup-cell" key={slot}>
            <div className="fx-lineup-slot">
              Tier {slot}
              {isBoost && <span className="fx-tag is-boost">Boost</span>}
              {isEmergency && <span className="fx-tag is-emergency">½</span>}
            </div>
            <div className="fx-lineup-driver">
              <TeamDot meta={meta} teamId={entry?.teamId} title={entry?.teamName} />
              <span className="t-mono">{entry?.code || '—'}</span>
              <span className="fx-lineup-name">{entry?.name || 'Empty slot'}</span>
            </div>
            {score.final != null && <div className="fx-lineup-pts t-mono">{Math.round(score.final)}</div>}
          </div>
        );
      })}
      <div className="fx-lineup-cell">
        <div className="fx-lineup-slot">Constructor</div>
        <div className="fx-lineup-driver">
          <TeamDot meta={meta} teamId={pick.constructor} />
          <span className="fx-lineup-name">{pick.constructor || '—'}</span>
        </div>
        {b.constructor?.total != null && (
          <div className="fx-lineup-pts t-mono">{Math.round(b.constructor.total)}</div>
        )}
      </div>
      {pick.carriedForward && <div className="fx-lineup-note">Carried forward automatically.</div>}
    </div>
  );
}
