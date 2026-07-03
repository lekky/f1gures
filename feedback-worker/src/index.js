// f1gures feedback Worker
// -----------------------------------------------------------------------------
// Receives a POST from the /feedback/ form on the static site and opens a
// GitHub issue in the configured repo. This Worker exists so the GitHub token
// never has to live in public client-side code.
//
// Secrets (set with `wrangler secret put <NAME>`):
//   GITHUB_TOKEN      fine-grained PAT, Issues: read & write on GITHUB_REPO only
//   TURNSTILE_SECRET  Cloudflare Turnstile secret key
//
// Vars (in wrangler.toml, non-secret):
//   ALLOWED_ORIGINS   comma-separated list of allowed browser origins
//   GITHUB_REPO       "owner/repo"

const CATEGORIES = {
  bug: 'Bug',
  idea: 'Idea',
  data: 'Data correction',
  other: 'Other',
};

const MAX_MESSAGE = 4000;
const MAX_EMAIL = 200;

function corsHeaders(origin, allowed) {
  // Only reflect the Origin header back when it's on the allow-list; otherwise
  // omit the CORS header so the browser blocks the response.
  const ok = origin && allowed.includes(origin);
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (ok) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function verifyTurnstile(token, secret, ip) {
  if (!token) return false;
  const form = new URLSearchParams();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405, cors);
    }
    if (!origin || !allowed.includes(origin)) {
      return json({ ok: false, error: 'Forbidden origin' }, 403, cors);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ ok: false, error: 'Bad JSON' }, 400, cors);
    }

    // Honeypot: real users never fill this hidden field. Pretend success so
    // bots don't learn they were caught.
    if (payload.website) {
      return json({ ok: true, issue: null }, 200, cors);
    }

    const category = CATEGORIES[payload.category] ? payload.category : 'other';
    const message = String(payload.message || '').trim();
    const email = String(payload.email || '').trim().slice(0, MAX_EMAIL);
    const page = String(payload.page || '').trim().slice(0, 300);

    if (message.length < 3) {
      return json({ ok: false, error: 'Message too short' }, 400, cors);
    }
    if (message.length > MAX_MESSAGE) {
      return json({ ok: false, error: 'Message too long' }, 400, cors);
    }

    // Turnstile
    const ip = request.headers.get('CF-Connecting-IP');
    const human = await verifyTurnstile(payload.turnstileToken, env.TURNSTILE_SECRET, ip);
    if (!human) {
      return json({ ok: false, error: 'Verification failed. Please try again.' }, 400, cors);
    }

    // Build the issue
    const label = CATEGORIES[category];
    const title = `[Feedback: ${label}] ${message.split('\n')[0].slice(0, 70)}`;
    const bodyLines = [
      message,
      '',
      '---',
      `**Category:** ${label}`,
      page ? `**Page:** ${page}` : null,
      email ? `**Contact:** ${email}` : null,
      '',
      '_Submitted via the f1gures feedback form._',
    ].filter((l) => l !== null);

    const [owner, repo] = (env.GITHUB_REPO || '').split('/');
    try {
      const gh = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'f1gures-feedback-worker',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body: bodyLines.join('\n'),
          labels: ['feedback', label],
        }),
      });

      if (!gh.ok) {
        const detail = await gh.text();
        console.log('GitHub error', gh.status, detail);
        return json({ ok: false, error: 'Could not create issue. Try again later.' }, 502, cors);
      }
      const issue = await gh.json();
      return json({ ok: true, issue: { number: issue.number, url: issue.html_url } }, 200, cors);
    } catch (err) {
      console.log('Worker error', String(err));
      return json({ ok: false, error: 'Server error. Try again later.' }, 500, cors);
    }
  },
};
