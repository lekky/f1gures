// FantasyAuth — sign in / register / reset for the fantasy beta.
//
// Rendered standalone on /fantasy/account/, and inline by every island that
// needs a signed-in player. PocketBase's `users` collection requires a
// verified email before the picks `createRule` will accept anything, so
// verification state is surfaced loudly rather than discovered at submit time.

import { useState } from 'react';
import { pb, pbError, fantasyConfigured, FANTASY_GOOGLE_AUTH } from './pb.js';
import { useAuth, NotConfigured, ErrorNote } from './ui.jsx';

const MODES = [
  { id: 'signin', label: 'Sign in' },
  { id: 'register', label: 'Create account' },
];

export default function FantasyAuth({ compact = false, heading = 'Play the fantasy game' }) {
  const { user, ready } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!fantasyConfigured()) return <NotConfigured />;
  if (!ready) return null;

  const client = pb();

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');

    const mail = email.trim().toLowerCase();
    if (!mail) return setError('Enter your email address.');

    setBusy(true);
    try {
      if (mode === 'forgot') {
        await client.collection('users').requestPasswordReset(mail);
        setNotice(`If an account exists for ${mail}, a reset link is on its way.`);
        setMode('signin');
      } else if (mode === 'register') {
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        await client.collection('users').create({
          email: mail,
          password,
          passwordConfirm: password,
          displayName: displayName.trim() || mail.split('@')[0],
          emailVisibility: false,
        });
        await client.collection('users').authWithPassword(mail, password);
        try {
          await client.collection('users').requestVerification(mail);
        } catch {
          /* the account exists either way; the resend button covers a failure */
        }
        setPassword('');
      } else {
        await client.collection('users').authWithPassword(mail, password);
        setPassword('');
      }
    } catch (err) {
      const info = pbError(err, 'Could not sign you in. Check your details and try again.');
      // PocketBase says "Failed to authenticate." for both a wrong password and
      // an unknown address, and deliberately doesn't say which. Keep that
      // property, lose the machine voice.
      setError(
        /^failed to authenticate\.?$/i.test(info.message)
          ? 'That email and password don’t match an account.'
          : info.message
      );
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError('');
    setBusy(true);
    try {
      await client.collection('users').authWithOAuth2({ provider: 'google' });
    } catch (err) {
      setError(pbError(err, 'Google sign-in failed.').message);
    } finally {
      setBusy(false);
    }
  }

  // ── signed in ───────────────────────────────────────────────────────────
  if (user) {
    return <VerificationBanner user={user} compact={compact} />;
  }

  // ── signed out ──────────────────────────────────────────────────────────
  return (
    <div className={`fx-auth ${compact ? 'is-compact' : ''}`}>
      <div className="fx-auth-head">
        <div className="t-eyebrow">Private beta</div>
        <h2 className="fx-auth-title">{heading}</h2>
        <p className="fx-auth-sub">
          Free, no prizes, two minutes a week. You need an account so your picks and your league
          standings are yours.
        </p>
      </div>

      <div className="fx-tabs" role="tablist" aria-label="Account">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className={`fx-tab ${mode === m.id ? 'is-active' : ''}`}
            onClick={() => {
              setMode(m.id);
              setError('');
              setNotice('');
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form className="fx-form" onSubmit={onSubmit} noValidate>
        {mode === 'register' && (
          <div className="fx-field">
            <label className="fx-label" htmlFor="fx-name">
              Display name <span className="fx-optional">(shown on leaderboards)</span>
            </label>
            <input
              id="fx-name"
              className="fx-input"
              type="text"
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Chequered Flagg"
              autoComplete="nickname"
            />
          </div>
        )}

        <div className="fx-field">
          <label className="fx-label" htmlFor="fx-email">Email</label>
          <input
            id="fx-email"
            className="fx-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>

        {mode !== 'forgot' && (
          <div className="fx-field">
            <label className="fx-label" htmlFor="fx-password">Password</label>
            <input
              id="fx-password"
              className="fx-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
            {mode === 'register' && <div className="fx-hint">At least 8 characters.</div>}
          </div>
        )}

        <ErrorNote>{error}</ErrorNote>
        {notice && <div className="fx-ok">{notice}</div>}

        <div className="fx-form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy
              ? 'Working…'
              : mode === 'register'
                ? 'Create account'
                : mode === 'forgot'
                  ? 'Send reset link'
                  : 'Sign in'}
          </button>
          {mode === 'signin' && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setMode('forgot');
                setError('');
              }}
            >
              Forgot password
            </button>
          )}
          {mode === 'forgot' && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setMode('signin');
                setError('');
              }}
            >
              Back to sign in
            </button>
          )}
        </div>

        {FANTASY_GOOGLE_AUTH && (
          <div className="fx-oauth">
            <div className="fx-oauth-rule"><span>or</span></div>
            <button type="button" className="btn btn-secondary fx-oauth-btn" onClick={onGoogle} disabled={busy}>
              Continue with Google
            </button>
            <div className="fx-hint">Google accounts arrive already verified.</div>
          </div>
        )}
      </form>
    </div>
  );
}

// ─── verification / signed-in strip ───────────────────────────────────────
export function VerificationBanner({ user, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  if (user?.verified) {
    if (compact) return null;
    return (
      <div className="fx-verified">
        <span className="fx-verified-mark" aria-hidden="true">✓</span>
        <span>
          Signed in as <strong>{user.displayName || user.email}</strong> — email verified, picks
          enabled.
        </span>
      </div>
    );
  }

  async function resend() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await pb().collection('users').requestVerification(user.email);
      setNotice('Verification email sent. Check your inbox (and spam).');
    } catch (err) {
      setError(pbError(err, 'Could not send the verification email.').message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fx-pending">
      <div className="fx-pending-title">Verify your email to start picking</div>
      <p>
        We sent a link to <strong>{user?.email}</strong>. Until you click it the server will refuse
        your picks — verification is a hard requirement, not a nag.
      </p>
      <ErrorNote>{error}</ErrorNote>
      {notice && <div className="fx-ok">{notice}</div>}
      <div className="fx-form-actions">
        <button type="button" className="btn btn-secondary" onClick={resend} disabled={busy}>
          {busy ? 'Sending…' : 'Resend verification email'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => window.location.reload()}
        >
          I’ve verified — reload
        </button>
      </div>
    </div>
  );
}

/** Sign-out button, used by the account page and the hub. */
export function SignOutButton({ className = 'btn btn-secondary' }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        pb()?.authStore.clear();
      }}
    >
      Sign out
    </button>
  );
}
