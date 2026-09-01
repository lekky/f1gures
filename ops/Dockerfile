# f1gures ops container — the scheduled build/deploy loop that replaced the
# cron-triggered GitHub Actions workflows (deploy.yml, refresh-current-season.yml,
# check-principals.yml). Runs on the user's Coolify VPS; see docs/ops-vps.md.
#
# The image is deliberately just a TOOLCHAIN (Node 22, git, lftp, ssh, jq).
# No repo code is baked in: the entrypoint clones lekky/f1gures into the
# persistent /data volume on first start and, every LOOP_INTERVAL_SECONDS,
# hard-syncs it to origin/main and runs ops/loop.sh FROM THAT CLONE. So a merge
# to main that edits ops/loop.sh takes effect on the next tick without
# rebuilding this image. Only changes to this Dockerfile need a redeploy.
#
# Self-contained on purpose (entrypoint written via heredoc) so it can be
# pasted straight into Coolify's "Dockerfile" build pack with no git source,
# or built from the repo with Base Directory = /ops. Needs BuildKit (default).

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    # Astro build + satori OG rendering for ~2,300 pages. The VPS has 4 GB
    # total shared with PocketBase; give Node's heap room but cap it well below
    # the container limit set in Coolify (3 GB recommended).
    NODE_OPTIONS=--max-old-space-size=2560 \
    LOOP_INTERVAL_SECONDS=600 \
    DATA_DIR=/data

RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends \
      git openssh-client lftp jq ca-certificates curl tini \
 && rm -rf /var/lib/apt/lists/*

# NODE_ENV=production would make `npm ci` skip devDependencies, and the
# build (astro, vitest, satori...) lives in devDependencies. Keep the env for
# runtime semantics but tell npm to install everything.
ENV NPM_CONFIG_INCLUDE=dev

COPY <<'EOF' /usr/local/bin/f1gures-entrypoint
#!/usr/bin/env bash
# Supervisor: clone once, then tick forever. Kept tiny and baked into the
# image because a bash script must not be rewritten (by git reset) while it
# is executing — loop.sh is re-read fresh from the clone on every tick, so
# it is safe to update from main.
set -uo pipefail

: "${GITHUB_TOKEN:?GITHUB_TOKEN is required (fine-grained PAT: contents rw, issues rw)}"
GITHUB_REPO="${GITHUB_REPO:-lekky/f1gures}"
DATA_DIR="${DATA_DIR:-/data}"
REPO_DIR="$DATA_DIR/repo"
mkdir -p "$DATA_DIR/state" "$HOME/.ssh"

# Token via credential helper so it never lands in .git/config on the volume.
git config --global credential.helper \
  '!f() { echo "username=x-access-token"; echo "password=${GITHUB_TOKEN}"; }; f'
git config --global user.name  "${GIT_USER_NAME:-f1gures-ops}"
git config --global user.email "${GIT_USER_EMAIL:-ops@f1gures.app}"
git config --global --add safe.directory "$REPO_DIR"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "[entrypoint] cloning $GITHUB_REPO into $REPO_DIR"
  git clone --branch main "https://github.com/$GITHUB_REPO.git" "$REPO_DIR"
fi

echo "[entrypoint] loop every ${LOOP_INTERVAL_SECONDS}s"
while true; do
  if [ -f "$REPO_DIR/ops/loop.sh" ]; then
    bash "$REPO_DIR/ops/loop.sh" || echo "[entrypoint] loop.sh exited $? (will retry next tick)"
  else
    # First-ever tick on a clone that predates ops/ — just resync.
    git -C "$REPO_DIR" fetch origin main -q && git -C "$REPO_DIR" reset --hard origin/main -q
  fi
  sleep "$LOOP_INTERVAL_SECONDS"
done
EOF
RUN chmod +x /usr/local/bin/f1gures-entrypoint

WORKDIR /data
VOLUME ["/data"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/f1gures-entrypoint"]
