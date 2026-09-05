// LeagueManager — the /fantasy/league/ screen.
//
// Create a league (the six-character join code is generated here and retried
// on a unique-index collision), join one with `?code=`, see the members table
// against the season standings, and — if you own the league — remove someone.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  pb,
  pbError,
  isGenericPbMessage,
  fantasyConfigured,
  loadSeason,
  loadStandings,
  makeLeagueCode,
  displayNameFor,
  shortId,
} from './pb.js';
import { NotConfigured, Loading, ErrorNote, Empty, useAuth } from './ui.jsx';
import FantasyAuth from './FantasyAuth.jsx';

export default function LeagueManager() {
  const { user, ready } = useAuth();

  if (!fantasyConfigured()) return <NotConfigured />;
  if (!ready) return <Loading />;
  if (!user) return <FantasyAuth heading="Sign in to run a league" />;
  return <Leagues user={user} />;
}

function Leagues({ user }) {
  const [state, setState] = useState({ loading: true, error: '', leagues: [], points: {} });
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // ?code=ABC123 prefills the join box (the share link a friend sends).
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('code');
      if (q) setCode(q.trim().toUpperCase().slice(0, 6));
    } catch {
      /* noop */
    }
  }, []);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const client = pb();
      const memberships = await client.collection('fantasy_league_members').getFullList({
        filter: `user="${user.id}"`,
        expand: 'league',
        perPage: 200,
        requestKey: null,
      });
      const leagues = memberships.map((m) => m.expand?.league).filter(Boolean);

      const season = await loadSeason();
      const standings = season ? await loadStandings(season.id) : [];
      const points = {};
      for (const s of standings) if (s.scope === 'season') points[s.user] = s.points || 0;

      setState({ loading: false, error: '', leagues, points });
      setSelected((cur) => cur || leagues[0]?.id || '');
    } catch (err) {
      setState({ loading: false, error: pbError(err).message, leagues: [], points: {} });
    }
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function createLeague(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    const trimmed = name.trim();
    if (trimmed.length < 2) return setError('Give the league a name.');

    setBusy('create');
    const client = pb();
    let lastErr = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = makeLeagueCode();
      try {
        const league = await client.collection('fantasy_leagues').create({
          name: trimmed,
          code: candidate,
          owner: user.id,
        });
        await client.collection('fantasy_league_members').create({ league: league.id, user: user.id });
        setName('');
        setNotice(`League created. Share the code ${candidate}.`);
        setSelected(league.id);
        await load();
        setBusy('');
        return;
      } catch (err) {
        lastErr = err;
        const info = pbError(err);
        // Only a code collision is worth retrying; anything else is fatal.
        if (!info.fields.includes('code')) break;
      }
    }
    setError(pbError(lastErr, 'Could not create the league.').message);
    setBusy('');
  }

  async function joinLeague(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    const wanted = code.trim().toUpperCase();
    if (wanted.length !== 6) return setError('A join code is exactly six characters.');

    setBusy('join');
    try {
      const client = pb();
      const league = await client
        .collection('fantasy_leagues')
        .getFirstListItem(`code="${wanted}"`, { requestKey: null });
      await client.collection('fantasy_league_members').create({ league: league.id, user: user.id });
      setCode('');
      setNotice(`Joined ${league.name}.`);
      setSelected(league.id);
      await load();
    } catch (err) {
      const info = pbError(err);
      // A second join violates the unique(league, user) index; PocketBase
      // reports that as a per-field `validation_not_unique`, and its top-level
      // message stays the contentless "Failed to create record."
      const already = Object.values(info.codes).includes('validation_not_unique');
      setError(
        info.status === 404
          ? 'No league has that code. Check it with whoever sent it.'
          : already
            ? 'You are already in that league.'
            : isGenericPbMessage(info.message)
              ? 'The server refused that. Check the code and try again.'
              : info.message
      );
    } finally {
      setBusy('');
    }
  }

  if (state.loading) return <Loading label="Loading leagues…" />;

  const current = state.leagues.find((l) => l.id === selected) || null;

  return (
    <div className="fx-leagues">
      <ErrorNote>{state.error}</ErrorNote>

      <div className="fx-league-forms">
        <form className="fx-panelbox" onSubmit={createLeague}>
          <div className="fx-section-label">Create a league</div>
          <div className="fx-field">
            <label className="fx-label" htmlFor="fx-league-name">League name</label>
            <input
              id="fx-league-name"
              className="fx-input"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Paddock Club"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy === 'create'}>
            {busy === 'create' ? 'Creating…' : 'Create league'}
          </button>
        </form>

        <form className="fx-panelbox" onSubmit={joinLeague}>
          <div className="fx-section-label">Join a league</div>
          <div className="fx-field">
            <label className="fx-label" htmlFor="fx-league-code">Join code</label>
            <input
              id="fx-league-code"
              className="fx-input fx-input-code t-mono"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC234"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>
          <button type="submit" className="btn btn-secondary" disabled={busy === 'join'}>
            {busy === 'join' ? 'Joining…' : 'Join league'}
          </button>
        </form>
      </div>

      <ErrorNote>{error}</ErrorNote>
      {notice && <div className="fx-ok">{notice}</div>}

      {!state.leagues.length ? (
        <Empty>You aren’t in a league yet. Create one, or paste a friend’s code above.</Empty>
      ) : (
        <div className="fx-league-body">
          <div className="fx-tabs" role="tablist" aria-label="Your leagues">
            {state.leagues.map((l) => (
              <button
                key={l.id}
                type="button"
                role="tab"
                aria-selected={selected === l.id}
                className={`fx-tab ${selected === l.id ? 'is-active' : ''}`}
                onClick={() => setSelected(l.id)}
              >
                {l.name}
              </button>
            ))}
          </div>
          {current && <LeagueTable league={current} user={user} points={state.points} onChange={load} />}
        </div>
      )}
    </div>
  );
}

function LeagueTable({ league, user, points, onChange }) {
  const [state, setState] = useState({ loading: true, members: [], error: '' });
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    pb()
      .collection('fantasy_league_members')
      .getFullList({ filter: `league="${league.id}"`, expand: 'user', perPage: 500, requestKey: null })
      .then((members) => setState({ loading: false, members, error: '' }))
      .catch((err) => setState({ loading: false, members: [], error: pbError(err).message }));
  }, [league.id]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwner = league.owner === user.id;

  const rows = useMemo(
    () =>
      [...state.members]
        .map((m) => ({ ...m, points: points[m.user] || 0 }))
        .sort((a, b) => b.points - a.points),
    [state.members, points]
  );

  async function remove(memberId) {
    setBusyId(memberId);
    try {
      await pb().collection('fantasy_league_members').delete(memberId);
      load();
      onChange?.();
    } catch (err) {
      setState((s) => ({ ...s, error: pbError(err, 'Could not remove that member.').message }));
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="fx-league">
      <div className="fx-league-head">
        <div>
          <div className="t-eyebrow">League</div>
          <h2 className="fx-league-name">{league.name}</h2>
        </div>
        <div className="fx-league-code">
          <span className="fx-label">Join code</span>
          <span className="fx-code t-mono">{league.code}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const url = `${window.location.origin}/fantasy/league/?code=${league.code}`;
              navigator.clipboard?.writeText(url);
            }}
          >
            Copy invite link
          </button>
        </div>
      </div>

      <ErrorNote>{state.error}</ErrorNote>
      {state.loading ? (
        <Loading label="Loading members…" />
      ) : (
        <div className="fx-tablewrap">
          <table className="tbl tbl-static fx-standings">
            <thead>
              <tr>
                <th className="t-num">#</th>
                <th>Member</th>
                <th className="t-num">Season points</th>
                {isOwner && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => {
                const mine = m.user === user.id;
                return (
                  <tr key={m.id} className={mine ? 'is-me' : ''}>
                    <td className="t-num">
                      <span className={`pos ${i < 3 ? `pos-${i + 1}` : ''}`}>{i + 1}</span>
                    </td>
                    <td>
                      {displayNameFor(m, user.id)}
                      {m.user === league.owner && <span className="fx-tag is-owner">Owner</span>}
                    </td>
                    <td className="t-num t-mono">{Math.round(m.points)}</td>
                    {isOwner && (
                      <td className="t-num">
                        {m.user !== user.id && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busyId === m.id}
                            onClick={() => remove(m.id)}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={isOwner ? 4 : 3}>No members yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="fx-league-foot">
        {!isOwner && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const mine = state.members.find((m) => m.user === user.id);
              if (mine) remove(mine.id);
            }}
          >
            Leave league
          </button>
        )}
        <span className="fx-hint">
          Players outside your own account show as handle{' '}
          <span className="t-mono">{shortId(user.id)}</span>-style ids until public profiles are on.
        </span>
      </div>
    </div>
  );
}
