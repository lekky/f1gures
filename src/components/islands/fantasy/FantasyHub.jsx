// FantasyHub — the status strip on /fantasy/.
//
// Answers the three questions a returning player has: which round is open,
// how long until it locks, and whether their team is in. Everything else on
// the hub page is static Astro markup.

import { useEffect, useState } from 'react';
import {
  fantasyConfigured,
  loadSeason,
  loadRounds,
  loadMyPicks,
  loadMyPickScores,
  loadStandings,
  pickableRound,
  isLocked,
  pbError,
  formatDateTime,
} from './pb.js';
import { NotConfigured, Loading, ErrorNote, LockBar, Figure, useAuth, useNow } from './ui.jsx';
import { SignOutButton } from './FantasyAuth.jsx';

export default function FantasyHub() {
  const { user, ready } = useAuth();
  const [state, setState] = useState({ loading: true, error: '' });
  const now = useNow(1000);

  useEffect(() => {
    if (!fantasyConfigured()) {
      setState({ loading: false, error: '', notConfigured: true });
      return undefined;
    }
    if (!ready) return undefined;
    let alive = true;
    (async () => {
      try {
        const season = await loadSeason();
        if (!season) throw new Error('No fantasy season has been set up yet.');
        const rounds = await loadRounds(season.id);
        const round = pickableRound(rounds);
        const [picks, scores, standings] = user
          ? await Promise.all([
              loadMyPicks(season.id, user.id),
              loadMyPickScores(user.id),
              loadStandings(season.id),
            ])
          : [[], [], []];
        if (alive) setState({ loading: false, error: '', season, rounds, round, picks, scores, standings });
      } catch (err) {
        if (alive) setState({ loading: false, error: pbError(err).message });
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready, user?.id]);

  if (state.notConfigured) return <NotConfigured />;
  if (!ready || state.loading) return <Loading label="Checking the season…" />;
  if (state.error) return <ErrorNote>{state.error}</ErrorNote>;

  const { season, round, picks = [], scores = [], standings = [] } = state;
  const locked = round ? isLocked(round, now) : true;
  const myPick = round ? picks.find((p) => p.round === round.id) : null;
  const mySeason = user ? standings.find((s) => s.scope === 'season' && s.user === user.id) : null;
  const scored = scores.filter((s) => s.expand?.round && isLocked(s.expand.round, now));
  const best = scored.reduce((m, s) => Math.max(m, s.total || 0), 0);

  return (
    <div className="fx-hub">
      {round ? (
        <LockBar round={round} locked={locked} />
      ) : (
        <div className="fx-lockbar is-locked">
          <div className="fx-lockbar-round">
            <span className="fx-lockbar-eyebrow">Season {season?.year}</span>
            <span className="fx-lockbar-name">No round open for picks</span>
          </div>
        </div>
      )}

      <div className="fx-hub-status">
        {!user ? (
          <div className="fx-hub-cta">
            <div className="fx-hub-cta-title">You’re not signed in</div>
            <p>Create a free account to set a team, join a league and appear on the leaderboards.</p>
            <a className="btn btn-primary" href="/fantasy/account/">Sign in or register</a>
          </div>
        ) : (
          <>
            <div className="fx-hub-figures">
              <Figure
                label="Your team"
                value={myPick ? 'In' : locked ? 'Missed' : 'Not set'}
                sub={
                  myPick
                    ? myPick.carriedForward
                      ? 'Carried forward — review it'
                      : `Saved · boost on Tier ${myPick.boost || 'D'}`
                    : locked
                      ? 'The scorer will carry your last team forward'
                      : `Locks ${formatDateTime(round?.lockAt)}`
                }
              />
              <Figure
                label="Season points"
                value={mySeason ? Math.round(mySeason.points || 0) : 0}
                sub={`${scored.length} scored weekend${scored.length === 1 ? '' : 's'}`}
              />
              <Figure label="Best weekend" value={Math.round(best)} sub="Your highest single score" />
            </div>
            <div className="fx-hub-actions">
              <a className="btn btn-primary" href="/fantasy/pick/">
                {myPick ? 'Change your team' : 'Set your team'}
              </a>
              <a className="btn btn-secondary" href="/fantasy/standings/">Standings</a>
              <a className="btn btn-secondary" href="/fantasy/league/">Leagues</a>
              <SignOutButton className="btn btn-ghost btn-sm" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
