#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${VESSEL_INSTALL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${VESSEL_BRANCH:-main}"
CHECK_ONLY=0

info() {
  printf '\033[1;34m==>\033[0m %s\n' "$1"
}

warn() {
  printf '\033[1;33m==>\033[0m %s\n' "$1"
}

fail() {
  printf '\033[1;31merror:\033[0m %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

usage() {
  cat <<'HELP'
Usage: vessel-browser-update [--check] [--help]

Options:
  --check   Check whether an update is available without modifying the install
  --help    Show this help message
HELP
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      CHECK_ONLY=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
  shift
done

require_cmd git
require_cmd node
require_cmd npm

[[ -d "$INSTALL_DIR/.git" ]] || fail "Vessel install is not a git checkout: $INSTALL_DIR"

if [[ -n "$(git -C "$INSTALL_DIR" status --porcelain)" ]]; then
  fail "Install directory has local changes. Resolve them before updating: $INSTALL_DIR"
fi

info "Checking for Vessel updates on origin/$BRANCH"
git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"

LOCAL_REV="$(git -C "$INSTALL_DIR" rev-parse HEAD)"
REMOTE_REV="$(git -C "$INSTALL_DIR" rev-parse FETCH_HEAD)"

if [[ "$LOCAL_REV" == "$REMOTE_REV" ]]; then
  info "Vessel is already up to date."
  exit 0
fi

info "Update available for Vessel."

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  printf 'local:  %s\n' "$LOCAL_REV"
  printf 'remote: %s\n' "$REMOTE_REV"
  exit 0
fi

info "Updating Vessel in $INSTALL_DIR"
git -C "$INSTALL_DIR" checkout -B "$BRANCH" "origin/$BRANCH"

info "Installing npm dependencies"
npm --prefix "$INSTALL_DIR" install

info "Building Vessel"
npm --prefix "$INSTALL_DIR" run build

info "Vessel update complete."
