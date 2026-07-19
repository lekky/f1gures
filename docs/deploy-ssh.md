# Deploy over SSH (rsync)

`deploy.yml` and (optionally) `refresh-current-season.yml` upload the built
`dist/` to the live server with **rsync over SSH**. rsync only sends files
whose content changed, reuses one encrypted connection, and compresses on the
wire — so a normal deploy takes seconds and even a full re-upload (e.g. a CSS
cache-bust that rewrites every page) finishes in ~1–2 min. This replaced a
single-connection FTP upload that took ~34 min on a full re-upload.

## One-time setup (cPanel + GitHub)

### 1. Enable SSH and create a deploy key (cPanel)

1. cPanel → **Security → SSH Access → Manage SSH Keys**.
   (If SSH isn't enabled on the account, Hostmedia may need a support ticket to
   turn on shell access first.)
2. **Generate a New Key**:
   - Key Name: `github_deploy`
   - Passphrase: **leave blank** — CI cannot type a passphrase.
   - Type: RSA 4096 (or ED25519).
3. Back on Manage SSH Keys, under **Public Keys**, click **Manage** next to
   `github_deploy` → **Authorize**.
4. Under **Private Keys**, click **View/Download** on `github_deploy` and copy
   the entire private key text, including the
   `-----BEGIN ... PRIVATE KEY-----` / `-----END ... PRIVATE KEY-----` lines.

### 2. Add GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `SSH_PRIVATE_KEY` | The private key text copied above. |
| `SSH_PORT` | The SSH port (cPanel default `22`; some hosts use a custom port — check **SSH Access**). Omit only if it's 22. |

The workflow reuses the existing `SFTP_HOST` (as the SSH host) and `SFTP_USER`
(as the SSH user). If SSH uses a different hostname than FTP, change the
`SSH_HOST` env line in `deploy.yml` to a dedicated secret.

### 3. Confirm the web root

The `REMOTE_DIR` env in the deploy step is the site's document root **relative
to the SSH home directory** (`/home/<user>`). For a primary cPanel domain this
is `public_html`. If f1gures.app is an addon/subdomain, it may be
`public_html/<something>` — check cPanel → **Domains** for the exact "Document
Root". A wrong value here combined with `--delete` would mirror into the wrong
folder, so verify it before the first deploy.

## Testing

1. Merge to `main`.
2. **Actions → "Deploy to Server" → Run workflow** (manual dispatch always
   deploys, bypassing the skip gate).
3. Watch the **Deploy via rsync over SSH** step — the first run checksums the
   whole tree and uploads what differs; subsequent runs send only changed
   files. Then load the live site to confirm.

If the step fails at the SSH connection: check `SSH_PORT`, confirm the key is
**authorized** in cPanel (step 1.3), and that the account has shell access.
