// FeedbackForm - the /feedback/ page island.
// Collects a short message + category, verifies the visitor with Cloudflare
// Turnstile, and POSTs to the feedback Worker, which opens a GitHub issue.
// The GitHub token lives only in the Worker; this island never sees it.

import { useEffect, useRef, useState } from 'react';
import {
  FEEDBACK_WORKER_URL,
  TURNSTILE_SITE_KEY,
  feedbackConfigured,
} from '../../data/feedbackConfig.js';

const CATEGORIES = [
  { id: 'bug', label: 'Bug', hint: 'Something is broken or wrong' },
  { id: 'idea', label: 'Idea', hint: 'A feature or improvement' },
  { id: 'data', label: 'Data fix', hint: 'A stat or result looks off' },
  { id: 'other', label: 'Other', hint: 'Anything else' },
];

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let _turnstilePromise = null;
function loadTurnstile() {
  if (typeof window === 'undefined') return Promise.reject();
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (_turnstilePromise) return _turnstilePromise;
  _turnstilePromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => { _turnstilePromise = null; reject(new Error('Turnstile failed to load')); };
    document.head.appendChild(s);
  });
  return _turnstilePromise;
}

export default function FeedbackForm() {
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [result, setResult] = useState(null); // { number, url } on success
  const [error, setError] = useState('');
  const [page, setPage] = useState('');

  const widgetRef = useRef(null);
  const widgetId = useRef(null);
  const configured = feedbackConfigured();

  useEffect(() => {
    // Record which page the visitor came from (via ?from=) or the referrer,
    // so the issue has context about what they were looking at.
    try {
      const params = new URLSearchParams(window.location.search);
      setPage(params.get('from') || document.referrer || '');
    } catch { /* noop */ }
  }, []);

  // Mount the Turnstile widget once.
  useEffect(() => {
    if (!configured || !widgetRef.current) return;
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !ts || widgetId.current != null) return;
        widgetId.current = ts.render(widgetRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'auto',
          callback: (t) => setToken(t),
          'expired-callback': () => setToken(''),
          'error-callback': () => setToken(''),
        });
      })
      .catch(() => setError('Could not load the verification widget. Refresh and try again.'));
    return () => { cancelled = true; };
  }, [configured]);

  function resetTurnstile() {
    setToken('');
    try {
      if (window.turnstile && widgetId.current != null) {
        window.turnstile.reset(widgetId.current);
      }
    } catch { /* noop */ }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (status === 'submitting') return;
    setError('');

    if (message.trim().length < 3) {
      setError('Please write a little more.');
      return;
    }
    if (!token) {
      setError('Please complete the verification below.');
      return;
    }

    setStatus('submitting');
    try {
      const res = await fetch(FEEDBACK_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          message: message.trim(),
          email: email.trim(),
          website, // honeypot
          page,
          turnstileToken: token,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setResult(data.issue || null);
        setStatus('success');
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
        setStatus('error');
        resetTurnstile();
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
      setStatus('error');
      resetTurnstile();
    }
  }

  if (!configured) {
    return (
      <div className="fbk-notice">
        <div className="fbk-notice-title">Feedback isn’t switched on yet</div>
        <p>
          The feedback form needs its Cloudflare Worker deployed and configured.
          Once <code>FEEDBACK_WORKER_URL</code> and <code>TURNSTILE_SITE_KEY</code>{' '}
          are set in <code>src/data/feedbackConfig.js</code>, the form appears here.
        </p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="fbk-success">
        <div className="fbk-success-mark" aria-hidden="true">✓</div>
        <div className="fbk-success-title">Thanks — that’s in.</div>
        <p className="fbk-success-sub">
          {result?.url ? (
            <>Your feedback opened issue <a href={result.url} target="_blank" rel="noopener noreferrer">#{result.number}</a>.</>
          ) : (
            <>Your feedback has been received.</>
          )}
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setMessage(''); setEmail(''); setResult(null); setStatus('idle'); resetTurnstile();
          }}
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form className="fbk-form" onSubmit={onSubmit} noValidate>
      <fieldset className="fbk-field">
        <legend className="fbk-label">What kind of feedback?</legend>
        <div className="fbk-cats" role="radiogroup" aria-label="Feedback category">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.id}
              role="radio"
              aria-checked={category === c.id}
              className={`fbk-cat ${category === c.id ? 'is-active' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              <span className="fbk-cat-label">{c.label}</span>
              <span className="fbk-cat-hint">{c.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="fbk-field">
        <label className="fbk-label" htmlFor="fbk-message">Your message</label>
        <textarea
          id="fbk-message"
          className="fbk-textarea"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          maxLength={4000}
          placeholder="Tell me what you found, what you’d like, or what looks wrong…"
          required
        />
        <div className="fbk-count">{message.length}/4000</div>
      </div>

      <div className="fbk-field">
        <label className="fbk-label" htmlFor="fbk-email">
          Email <span className="fbk-optional">(optional — only if you want a reply)</span>
        </label>
        <input
          id="fbk-email"
          className="fbk-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </div>

      {/* Honeypot — visually hidden, off-screen; bots fill it, humans don't. */}
      <div className="fbk-hp" aria-hidden="true">
        <label htmlFor="fbk-website">Website</label>
        <input
          id="fbk-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="fbk-turnstile" ref={widgetRef}></div>

      {error && <div className="fbk-error" role="alert">{error}</div>}

      <div className="fbk-actions">
        <button type="submit" className="btn btn-primary" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Sending…' : 'Send feedback'}
          <span className="arrow" aria-hidden="true">›</span>
        </button>
        <span className="fbk-privacy">Opens a public issue on GitHub.</span>
      </div>
    </form>
  );
}
