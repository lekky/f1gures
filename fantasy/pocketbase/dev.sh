#!/usr/bin/env bash
# f1gures fantasy — local/VPS PocketBase dev server (Linux/macOS)
#
# Downloads the pinned PocketBase release, extracts it to ./bin (gitignored),
# upserts a dev superuser, and serves with the committed pb_migrations/ and
# pb_hooks/ directories.
#
#   ./dev.sh              # download (if needed) + serve on :8090
#   ./dev.sh --reset      # wipe pb_data first (fresh migrate)
#   ./dev.sh --no-serve   # download + migrate + superuser, then exit
#
# Pinned release:
#   PocketBase v0.40.1 (2026-08-24)
#   https://github.com/pocketbase/pocketbase/releases/download/v0.40.1/pocketbase_0.40.1_linux_amd64.zip
#
# Bump PB_VERSION below to move; keep dev.ps1 (Windows) and README.md in step.

set -euo pipefail

PB_VERSION="0.40.1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$ROOT/bin"
DATA_DIR="$ROOT/pb_data"
MIG_DIR="$ROOT/pb_migrations"
HOOK_DIR="$ROOT/pb_hooks"
EXE="$BIN_DIR/pocketbase"
PORT="${PORT:-8090}"

# Dev-only credentials. Never reuse these anywhere real.
SUPER_EMAIL="${PB_SUPERUSER_EMAIL:-dev@f1gures.local}"
SUPER_PASS="${PB_SUPERUSER_PASSWORD:-fantasy-dev-1234}"

RESET=0
SERVE=1
for arg in "$@"; do
  case "$arg" in
    --reset)    RESET=1 ;;
    --no-serve) SERVE=0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

pb_platform() {
  local os arch
  case "$(uname -s)" in
    Linux)  os=linux ;;
    Darwin) os=darwin ;;
    *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64)  arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    armv7l)        arch=armv7 ;;
    *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
  esac
  echo "${os}_${arch}"
}

# ---------------------------------------------------------------- download
if [ ! -x "$EXE" ]; then
  PLATFORM="$(pb_platform)"
  ZIP="pocketbase_${PB_VERSION}_${PLATFORM}.zip"
  URL="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${ZIP}"
  TMP="$(mktemp -d)"

  echo "Downloading PocketBase v${PB_VERSION} (${PLATFORM})..."
  echo "  $URL"
  curl -fsSL "$URL" -o "$TMP/$ZIP"

  mkdir -p "$BIN_DIR"
  unzip -oq "$TMP/$ZIP" -d "$BIN_DIR"
  rm -rf "$TMP"
  chmod +x "$EXE"
  echo "Installed to $EXE"
else
  echo "Using existing binary: $("$EXE" --version)"
fi

# ------------------------------------------------------------------ reset
if [ "$RESET" = "1" ] && [ -d "$DATA_DIR" ]; then
  echo "Removing $DATA_DIR ..."
  rm -rf "$DATA_DIR"
fi

# Absolute paths matter: PocketBase resolves relative dirs against the
# *executable* location, which is ./bin here.
COMMON=(--dir "$DATA_DIR" --migrationsDir "$MIG_DIR" --hooksDir "$HOOK_DIR")

# ------------------------------------------------------- migrate + admin
echo "Applying migrations..."
"$EXE" migrate up "${COMMON[@]}"

echo "Upserting dev superuser $SUPER_EMAIL ..."
"$EXE" superuser upsert "$SUPER_EMAIL" "$SUPER_PASS" "${COMMON[@]}"

if [ "$SERVE" = "0" ]; then
  echo "Done (--no-serve)."
  exit 0
fi

# ------------------------------------------------------------------ serve
echo
echo "PocketBase  http://127.0.0.1:${PORT}/"
echo "Dashboard   http://127.0.0.1:${PORT}/_/"
echo "Superuser   $SUPER_EMAIL / $SUPER_PASS"
echo "Seed data   node seed-dev.mjs"
echo

exec "$EXE" serve --http "127.0.0.1:${PORT}" "${COMMON[@]}"
