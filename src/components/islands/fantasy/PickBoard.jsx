// PickBoard — the /fantasy/pick/ board.
//
// One driver from each published tier, one constructor, one Boost on C or D.
// Everything the server enforces (tier match, usage caps, the emergency-pick
// escape hatch, the lock) is mirrored here so illegal choices are greyed out
// before a round-trip — but the server is still the authority, and its
// messages are surfaced verbatim on the offending column.
//
// The lock is enforced client-side on purpose: PocketBase's API rule fires
// before the validation hook, so a submission to a locked round comes back as
// a generic "Failed to create record." with no usable reason. Once `lockAt`
// passes, this board disables itself and says so.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SLOTS,
  SLOT_FIELD,
  pb,
  pbError,
  isGenericPbMessage,
  fantasyConfigured,
  loadSeason,
  loadRounds,
  loadTiers,
  loadEntries,
  loadMyPicks,
  loadMyPickScores,
  computeUsage,
  startsLeft,
  tierExhausted,
  pickableRound,
  isLocked,
  teamName,
  formatDateTime,
} from './pb.js';
import {
  NotConfigured,
  Loading,
  ErrorNote,
  Empty,
  LockBar,
  TeamDot,
  StartsLeft,
  useAuth,
  useNow,
  useTeamMeta,
} from './ui.jsx';
import FantasyAuth from './FantasyAuth.jsx';

const EMPTY_SELECTION = { A: '', B: '', C: '', D: '' };

export default function PickBoard() {
  const { user, ready } = useAuth();

  if (!fantasyConfigured()) return <NotConfigured />;
  if (!ready) return <Loading />;
  if (!user) return <FantasyAuth heading="Sign in to set your team" />;
  return <Board user={user} />;
}

function Board({ user }) {
  const [data, setData] = useState({ loading: true, error: '' });
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const [constructorId, setConstructorId] = useState('');
  const [boost, setBoost] = useState('D');
  const [emergency, setEmergency] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [badSlots, setBadSlots] = useState([]);
  const [saved, setSaved] = useState(false);

  const now = useNow(1000);
  const meta = useTeamMeta(data.season?.year);

  const load = useCallback(async () => {
    setData((d) => ({ ...d, loading: true }));
    try {
      const season = await loadSeason();
      if (!season) throw new Error('No fantasy season has been set up yet.');
      const rounds = await loadRounds(season.id);
      const round = pickableRound(rounds);
      const [tiers, entries, myPicks, myScores] = await Promise.all([
        round ? loadTiers(round.id) : Promise.resolve([]),
        loadEntries(season.id),
        loadMyPicks(season.id, user.id),
        loadMyPickScores(user.id),
      ]);
      setData({ loading: false, error: '', season, rounds, round, tiers, entries, myPicks, myScores });
    } catch (err) {
      setData({ loading: false, error: pbError(err).message });
    }
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const { season, round, tiers = [], entries = [], myPicks = [], myScores = [] } = data;

  const existing = useMemo(
    () => (round ? myPicks.find((p) => p.round === round.id) || null : null),
    [myPicks, round]
  );

  // Seed the form from an existing pick (including one the scorer carried forward).
  useEffect(() => {
    if (!existing) {
      setSelection(EMPTY_SELECTION);
      setConstructorId('');
      setBoost('D');
      setEmergency({});
      return;
    }
    setSelection({
      A: existing.driverA || '',
      B: existing.driverB || '',
      C: existing.driverC || '',
      D: existing.driverD || '',
    });
    setConstructorId(existing.constructor || '');
    setBoost(existing.boost === 'C' ? 'C' : 'D');
    setEmergency(
      existing.emergency && typeof existing.emergency === 'object' ? { ...existing.emergency } : {}
    );
  }, [existing]);

  const usage = useMemo(() => computeUsage(myPicks, now), [myPicks, now]);
  const capDriver = season?.capDriver || 0;
  const capConstructor = season?.capConstructor || 0;

  const tiersBySlot = useMemo(() => {
    const out = { A: [], B: [], C: [], D: [] };
    for (const t of tiers) if (out[t.tier]) out[t.tier].push(t);
    for (const k of SLOTS) out[k].sort((a, b) => a.rank - b.rank);
    return out;
  }, [tiers]);

  const exhausted = useMemo(() => {
    const out = {};
    for (const slot of SLOTS) out[slot] = tierExhausted(tiersBySlot[slot], usage.drivers, capDriver);
    return out;
  }, [tiersBySlot, usage, capDriver]);

  const teams = useMemo(() => {
    const seen = new Map();
    for (const e of entries) {
      if (!e.teamId || seen.has(e.teamId)) continue;
      seen.set(e.teamId, { teamId: e.teamId, teamName: e.teamName || e.teamId });
    }
    return [...seen.values()].sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [entries]);

  const lastScore = useMemo(() => {
    const scored = myScores
      .filter((s) => s.expand?.round && isLocked(s.expand.round, now))
      .sort((a, b) => (b.expand.round.round || 0) - (a.expand.round.round || 0));
    return scored[0] || null;
  }, [myScores, now]);

  if (data.loading) return <Loading label="Loading the board…" />;
  if (data.error) return <ErrorNote>{data.error}</ErrorNote>;
  if (!round) {
    return (
      <>
        <Empty>
          No round is open for picks. The next weekend appears here as soon as its lock time is
          published.
        </Empty>
        {lastScore && <ScoreBreakdown score={lastScore} meta={meta} />}
      </>
    );
  }

  const locked = isLocked(round, now);
  const canPlay = user.verified === true && !locked;

  function choose(slot, entryId) {
    if (!canPlay) return;
    setSaved(false);
    setSelection((s) => ({ ...s, [slot]: s[slot] === entryId ? '' : entryId }));
    setBadSlots((b) => b.filter((x) => x !== slot));
  }

  function toggleEmergency(slot) {
    setSaved(false);
    setEmergency((e) => {
      const next = { ...e };
      if (next[slot]) delete next[slot];
      else next[slot] = true;
      return next;
    });
  }

  async function submit() {
    if (saving || !canPlay) return;
    setSaveError('');
    setBadSlots([]);
    setSaved(false);

    const missing = SLOTS.filter((s) => !selection[s]);
    if (missing.length) {
      setSaveError(`Pick a driver for tier ${missing.join(', ')}.`);
      setBadSlots(missing);
      return;
    }
    if (!constructorId) {
      setSaveError('Pick a constructor.');
      setBadSlots(['constructor']);
      return;
    }

    // `carriedForward` and `refunded` are scorer-only — the hook rejects a
    // request that carries them at all, so they are never in this payload.
    const payload = {
      user: user.id,
      round: round.id,
      driverA: selection.A,
      driverB: selection.B,
      driverC: selection.C,
      driverD: selection.D,
      constructor: constructorId,
      boost,
      emergency,
    };

    setSaving(true);
    try {
      const client = pb();
      if (existing) await client.collection('fantasy_picks').update(existing.id, payload);
      else await client.collection('fantasy_picks').create(payload);
      setSaved(true);
      await load();
    } catch (err) {
      const info = pbError(err, 'The server refused this lineup.');
      // The picks API rule fires *before* the validation hook, so a submission
      // to a round that locked a moment ago comes back as PocketBase's own
      // contentless "Failed to create record." — say something useful instead.
      setSaveError(
        isGenericPbMessage(info.message)
          ? 'The server refused this lineup. If the round has just locked, picks are closed — reload the page.'
          : info.message
      );
      setBadSlots(info.slots);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fx-board">
      <LockBar
        round={round}
        locked={locked}
        note={
          locked
            ? 'Picks for this round closed at the start of qualifying. Nothing here can be changed.'
            : null
        }
      />

      {!user.verified && (
        <div className="fx-warn">
          Your email isn’t verified yet, so the server will refuse picks. Verify from{' '}
          <a href="/fantasy/account/">your account</a>, then reload.
        </div>
      )}

      {existing?.carriedForward && (
        <div className="fx-warn is-info">
          This lineup was <strong>carried forward</strong> from your last locked team because no pick
          was made in time. Change anything you like before {formatDateTime(round.lockAt)}.
        </div>
      )}

      <div className="fx-caps">
        <span>
          Driver cap <strong className="t-mono">{capDriver}</strong> starts each
        </span>
        <span>
          Constructor cap <strong className="t-mono">{capConstructor}</strong> starts each
        </span>
        <span className="fx-caps-note">
          Starts already spent count only locked rounds — changing this weekend’s team costs nothing.
        </span>
      </div>

      <div className="fx-tiergrid fx-pickgrid">
        {SLOTS.map((slot) => (
          <TierColumn
            key={slot}
            slot={slot}
            rows={tiersBySlot[slot]}
            meta={meta}
            usage={usage.drivers}
            capDriver={capDriver}
            selected={selection[slot]}
            onChoose={choose}
            disabled={!canPlay}
            invalid={badSlots.includes(slot)}
            exhausted={exhausted[slot]}
            emergency={emergency[slot] === true}
            onToggleEmergency={toggleEmergency}
            boost={boost}
            onBoost={setBoost}
          />
        ))}
      </div>

      <ConstructorPicker
        teams={teams}
        meta={meta}
        usage={usage.constructors}
        cap={capConstructor}
        value={constructorId}
        onChange={(id) => {
          if (!canPlay) return;
          setSaved(false);
          setConstructorId(id === constructorId ? '' : id);
          setBadSlots((b) => b.filter((x) => x !== 'constructor'));
        }}
        disabled={!canPlay}
        invalid={badSlots.includes('constructor')}
      />

      <div className="fx-submit">
        <ErrorNote>{saveError}</ErrorNote>
        {saved && <div className="fx-ok">Team saved. You can keep changing it until the lock.</div>}
        <div className="fx-submit-row">
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!canPlay || saving}>
            {saving ? 'Saving…' : existing ? 'Update team' : 'Submit team'}
          </button>
          <span className="fx-submit-hint">
            {locked
              ? 'This round is locked.'
              : `Locks ${formatDateTime(round.lockAt)} — change it as often as you like until then.`}
          </span>
        </div>
      </div>

      {lastScore && <ScoreBreakdown score={lastScore} meta={meta} />}
    </div>
  );
}

// ─── one tier column ──────────────────────────────────────────────────────
function TierColumn({
  slot,
  rows,
  meta,
  usage,
  capDriver,
  selected,
  onChoose,
  disabled,
  invalid,
  exhausted,
  emergency,
  onToggleEmergency,
  boost,
  onBoost,
}) {
  const boostable = slot === 'C' || slot === 'D';

  return (
    <div className={`fx-tiercol fx-pickcol ${invalid ? 'is-invalid' : ''}`}>
      <div className="fx-tiercol-head">
        <span className="fx-tier-letter">Tier {slot}</span>
        {boostable && (
          <label className={`fx-boost ${boost === slot ? 'is-on' : ''}`}>
            <input
              type="radio"
              name="fx-boost"
              checked={boost === slot}
              onChange={() => onBoost(slot)}
              disabled={disabled}
              aria-label={`Boost the Tier ${slot} driver`}
            />
            <span>Boost ×1.5</span>
          </label>
        )}
      </div>

      <ul className="fx-tierlist">
        {rows.map((row) => {
          const entry = row.expand?.entry;
          const used = usage[row.entry] || 0;
          const left = startsLeft(capDriver, used);
          const atCap = capDriver > 0 && left === 0;
          const selectable = !disabled && (!atCap || exhausted);
          const isSel = selected === row.entry;
          return (
            <li key={row.id}>
              <button
                type="button"
                className={`fx-pickrow ${isSel ? 'is-selected' : ''} ${atCap ? 'is-capped' : ''}`}
                onClick={() => selectable && onChoose(slot, row.entry)}
                disabled={!selectable}
                aria-pressed={isSel}
                aria-label={`${entry?.name || entry?.code || 'Driver'} — Tier ${slot}, ${
                  Number.isFinite(left) ? `${left} start${left === 1 ? '' : 's'} left` : 'no cap'
                }`}
              >
                <span className="fx-tierrow-rank t-mono">{row.rank}</span>
                <TeamDot meta={meta} teamId={entry?.teamId} title={entry?.teamName} />
                <span className="fx-tierrow-name">
                  <span className="fx-tierrow-code t-mono">{entry?.code || '—'}</span>
                  <span className="fx-tierrow-full">{entry?.name || 'Unknown'}</span>
                </span>
                <span className="fx-tierrow-avg t-mono" title="Average points, last 6 rounds">
                  {Math.round(row.avgPts || 0)}
                </span>
                <StartsLeft left={left} cap={capDriver} />
              </button>
            </li>
          );
        })}
        {!rows.length && <li className="fx-tierrow is-empty">No tier published</li>}
      </ul>

      {exhausted && (
        <label className={`fx-emergency ${emergency ? 'is-on' : ''}`}>
          <input
            type="checkbox"
            checked={emergency}
            onChange={() => onToggleEmergency(slot)}
            disabled={disabled}
          />
          <span>
            <strong>Emergency pick</strong> — every Tier {slot} driver is at your cap, so you may
            re-use one. That driver scores <strong>half points</strong> (rounded up) this weekend.
          </span>
        </label>
      )}
    </div>
  );
}

// ─── constructor ──────────────────────────────────────────────────────────
function ConstructorPicker({ teams, meta, usage, cap, value, onChange, disabled, invalid }) {
  return (
    <div className={`fx-constructors ${invalid ? 'is-invalid' : ''}`}>
      <div className="fx-section-label">Constructor</div>
      <div className="fx-teamgrid">
        {teams.map((t) => {
          const used = usage[t.teamId] || 0;
          const left = startsLeft(cap, used);
          const atCap = cap > 0 && left === 0;
          const isSel = value === t.teamId;
          return (
            <button
              type="button"
              key={t.teamId}
              className={`fx-teamchip ${isSel ? 'is-selected' : ''} ${atCap ? 'is-capped' : ''}`}
              onClick={() => !disabled && !atCap && onChange(t.teamId)}
              disabled={disabled || atCap}
              aria-pressed={isSel}
              aria-label={`${t.teamName} — ${
                Number.isFinite(left) ? `${left} start${left === 1 ? '' : 's'} left` : 'no cap'
              }`}
            >
              <TeamDot meta={meta} teamId={t.teamId} title={t.teamName} />
              <span className="fx-teamchip-name">{t.teamName}</span>
              <StartsLeft left={left} cap={cap} />
            </button>
          );
        })}
      </div>
      <div className="fx-hint">
        Your constructor scores both its cars’ race and qualifying points. There is no emergency
        pick for constructors — with {teams.length} teams a legal one always exists.
      </div>
    </div>
  );
}

// ─── last weekend's score ─────────────────────────────────────────────────
function ScoreBreakdown({ score, meta }) {
  const round = score.expand?.round;
  const b = score.breakdown || {};
  const rows = SLOTS.map((slot) => ({ slot, ...(b[slot] || {}) }));
  const con = b.constructor || null;

  return (
    <div className="panel fx-scorepanel">
      <div className="panel-head">
        <span>Last scored weekend</span>
        <div style={{ flex: 1 }} />
        <span className="t-mono fx-scorepanel-total">{Math.round(score.total || 0)} pts</span>
      </div>
      <div className="panel-body">
        <div className="fx-score-round">
          Round {round?.round ?? '—'} · {round?.name || 'Unknown round'}
        </div>
        <table className="tbl tbl-static fx-scoretable">
          <thead>
            <tr>
              <th>Slot</th>
              <th>Pick</th>
              <th className="t-num">Base</th>
              <th className="t-num">Scored</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slot}>
                <td className="fx-score-slot">{r.slot}</td>
                <td className="t-mono">{r.code || '—'}</td>
                <td className="t-num t-mono">{r.base != null ? Math.round(r.base) : '—'}</td>
                <td className="t-num t-mono">{r.final != null ? Math.round(r.final) : '—'}</td>
              </tr>
            ))}
            {con && (
              <tr>
                <td className="fx-score-slot">C’tor</td>
                <td>
                  <TeamDot meta={meta} teamId={con.teamId} />
                  <span> {teamName(meta, con.teamId)}</span>
                </td>
                <td className="t-num t-mono">—</td>
                <td className="t-num t-mono">{con.total != null ? Math.round(con.total) : '—'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
