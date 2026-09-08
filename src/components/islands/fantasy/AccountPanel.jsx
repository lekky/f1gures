// AccountPanel — the /fantasy/account/ screen.
//
// Signed out it is just FantasyAuth. Signed in it shows the profile (display
// name, which is the only thing leaderboards render), verification status,
// sign-out, and how to have the account deleted. PocketBase's users
// `updateRule` is `id = @request.auth.id`, so the name change is a plain
// record update from the browser.

import { useEffect, useState } from 'react';
import { pb, pbError, fantasyConfigured, formatDateTime, shortId } from './pb.js';
import { NotConfigured, Loading, ErrorNote, useAuth } from './ui.jsx';
import FantasyAuth, { VerificationBanner, SignOutButton } from './FantasyAuth.jsx';

export default function AccountPanel() {
  const { user, ready } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setDisplayName(user?.displayName || '');
  }, [user?.displayName]);

  if (!fantasyConfigured()) return <NotConfigured />;
  if (!ready) return <Loading />;
  if (!user) return <FantasyAuth heading="Your fantasy account" />;

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await pb().collection('users').update(user.id, { displayName: displayName.trim().slice(0, 40) });
      await pb().collection('users').authRefresh();
      setNotice('Saved.');
    } catch (err) {
      setError(pbError(err, 'Could not save your display name.').message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fx-account">
      <VerificationBanner user={user} />

      <form className="fx-panelbox" onSubmit={save}>
        <div className="fx-section-label">Profile</div>
        <div className="fx-field">
          <label className="fx-label" htmlFor="fx-acct-name">Display name</label>
          <input
            id="fx-acct-name"
            className="fx-input"
            value={displayName}
            maxLength={40}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={`Player ${shortId(user.id)}`}
          />
          <div className="fx-hint">This is what appears on leaderboards. Your email never does.</div>
        </div>
        <ErrorNote>{error}</ErrorNote>
        {notice && <div className="fx-ok">{notice}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>

      <div className="fx-panelbox">
        <div className="fx-section-label">Account</div>
        <dl className="fx-kv">
          <dt>Email</dt>
          <dd className="t-mono">{user.email}</dd>
          <dt>Verified</dt>
          <dd>{user.verified ? 'Yes — picks enabled' : 'No — picks are refused until you verify'}</dd>
          <dt>Joined</dt>
          <dd>{formatDateTime(user.created)}</dd>
          <dt>Player id</dt>
          <dd className="t-mono">{user.id}</dd>
        </dl>
        <div className="fx-form-actions">
          <SignOutButton />
        </div>
      </div>

      <div className="fx-panelbox">
        <div className="fx-section-label">Delete your account</div>
        <p>
          Self-service deletion isn’t wired up during the private beta. Send a message from{' '}
          <a href="/feedback/?from=/fantasy/account/">the feedback page</a> with the player id above
          and the account, its picks, its scores and its league memberships are removed — every
          fantasy relation cascades, so nothing is left behind.
        </p>
      </div>
    </div>
  );
}
