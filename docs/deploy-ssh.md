# Deploy over SSH

`deploy.yml` uploads the built `dist/` to the live server over **SFTP**
(`lftp`, 10 parallel transfers) via the account's SSH access. SFTP is served by
the SSH server's own subsystem, so it needs nothing installed in the cPanel
jailed shell — which is why it's the default here (the Hostmedia jail has no
`rsync`). The whole channel is SSH-encrypted; a full re-upload runs in a few
minutes, versus the ~34 min the old single-connection FTP took.

**Optional upgrade — rsync (only-changed-files):** if Hostmedia adds `rsync` to
the account's jailed shell (a support request), switch the deploy step to
`rsync -rlz --checksum --delete` over the same SSH. rsync then transfers only
content-changed files (seconds per deploy) instead of re-uploading the tree.
The SSH key/port setup below is identical either way.

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

The workflow reuses the existing `SFTP_HOST` as the SSH host. The SSH **user**
is hardcoded to `helloweb` (the cPanel main account, home `/home/helloweb`),
**not** `SFTP_USER` — that secret is a scoped FTP account rooted at the
f1gures.app docroot and is only used by the FTP deploy path. If SSH uses a
different hostname than FTP, change the `SSH_HOST` env line in `deploy.yml` to a
dedicated secret.

### 3. Web root (already set)

`REMOTE_DIR` is the site's document root **relative to the SSH home dir**
(`/home/helloweb`). f1gures.app is an **addon domain**, so its docroot is the
`f1gures.app` folder — **not** `public_html` (that's the main HelloWebDesign
site; deploying there with `--delete` would wipe it). This is set to
`f1gures.app` in `deploy.yml`; leave it unless the domain's document root
changes in cPanel → **Domains**.

## Testing

1. Merge to `main`.
2. **Actions → "Deploy to Server" → Run workflow** (manual dispatch always
   deploys, bypassing the skip gate).
3. Watch the **Deploy via rsync over SSH** step — the first run checksums the
   whole tree and uploads what differs; subsequent runs send only changed
   files. Then load the live site to confirm.

If the step fails at the SSH connection: check `SSH_PORT`, confirm the key is
**authorized** in cPanel (step 1.3), and that the account has shell access.
