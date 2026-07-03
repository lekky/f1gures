# f1gures feedback Worker

A tiny Cloudflare Worker that receives submissions from the `/feedback/` page on
the static site and opens a **GitHub issue** in `lekky/f1gures`. It exists so the
GitHub token never has to live in public browser code.

```
/feedback/ form ──POST──► this Worker ──(secret token)──► GitHub issue
                          (holds the token, verifies Turnstile)
```

You only need to do this setup **once**. After it's deployed, it runs 24/7 on
Cloudflare — your own machine can be off.

---

## What you'll need (all free)

- A **Cloudflare account** (https://dash.cloudflare.com — sign up if you don't have one).
- **Node** on your machine (use the box that has it; run these from this folder).

---

## Step 1 — Create the GitHub token

1. GitHub → your avatar → **Settings** → **Developer settings** →
   **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Name it e.g. `f1gures-feedback-worker`. Set an expiry (or "no expiration").
3. **Repository access** → *Only select repositories* → pick **`f1gures`**.
4. **Repository permissions** → find **Issues** → set to **Read and write**.
   (Leave everything else "No access".)
5. **Generate token** and copy it. You'll paste it in Step 4 — you can't see it again.

## Step 2 — Create the Turnstile widget

1. Cloudflare dashboard → **Turnstile** → **Add site**.
2. Widget name: `f1gures`. Hostname: `f1gures.app` (add `localhost` too if you
   want to test locally).
3. Widget mode: **Managed** is fine.
4. It gives you two keys:
   - **Site Key** (public) → goes in the site config (Step 5).
   - **Secret Key** (private) → goes in the Worker (Step 4).

## Step 3 — Deploy the Worker

From this `feedback-worker/` folder:

```bash
npm install
npx wrangler login        # opens a browser to authorize your Cloudflare account
npx wrangler deploy       # prints the Worker URL, e.g.
                          # https://f1gures-feedback.<your-subdomain>.workers.dev
```

Copy that Worker URL — it goes in the site config (Step 5).

## Step 4 — Add the two secrets

Still in this folder, paste each value when prompted:

```bash
npx wrangler secret put GITHUB_TOKEN        # paste the token from Step 1
npx wrangler secret put TURNSTILE_SECRET    # paste the Turnstile SECRET key from Step 2
```

## Step 5 — Point the site at the Worker

Open `../src/data/feedbackConfig.js` and fill in the two public values:

```js
export const FEEDBACK_WORKER_URL = 'https://f1gures-feedback.<your-subdomain>.workers.dev';
export const TURNSTILE_SITE_KEY  = '0x4AAAAAAA...';   // the Turnstile SITE key
```

Commit that change. Your normal `deploy.yml` build ships the live form.

---

## Config reference

Non-secret vars live in `wrangler.toml`:

- `ALLOWED_ORIGINS` — comma-separated origins allowed to call the Worker.
  Defaults to `https://f1gures.app,http://localhost:4321`.
- `GITHUB_REPO` — `owner/repo` that issues are opened in. Defaults to `lekky/f1gures`.

Secrets (set via `wrangler secret put`, never committed):

- `GITHUB_TOKEN` — fine-grained PAT, Issues: read & write on the repo only.
- `TURNSTILE_SECRET` — Turnstile secret key.

## Updating the Worker later

Edit `src/index.js`, then `npx wrangler deploy` again. Secrets persist across
deploys — you don't re-enter them.

## How issues look

Each submission opens an issue titled `[Feedback: <Category>] <first line>`,
labelled `feedback` + the category, with the message, the page the visitor was
on, and their email (if they gave one) in the body.
