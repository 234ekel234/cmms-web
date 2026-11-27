#!/usr/bin/env bash
#
# Deploys the latest `main` of the web client to this droplet:
# `npm run deploy` from /var/www/hanni-web. Backend DEPLOY.md §16 is the runbook.
#
#   1. Refuses to start on a dirty tree, a failed fetch, a branch that has
#      diverged, or a missing .env.production.local (the API address is
#      compiled into the build, so building without it ships a broken site).
#   2. Shows what is about to land, reminds you to check CI, asks y/N.
#   3. pull (fast-forward only) → npm ci → next build.
#   4. Copies the standalone server out into releases/<commit>-<time>, points
#      releases/current at it, restarts pm2. The build writes .next/ in the
#      repo; the running server reads its own release folder, so the site stays
#      up while a build runs.
#   5. Waits for /login to answer and pm2 to hold the process up.
#   6. On failure: before the switch nothing has changed for users, so the code
#      is put back and that is all; after it, `current` goes back to the
#      previous release and is restarted — no rebuild needed.
#   7. Keeps the last three releases, appends one line to the deploy log.
#
# The web has no database, so unlike the API's deploy there is never a step
# after which going back is unsafe.
#
# Flags: -y  skip the confirmation (you have already checked CI)
#
# Everything lives inside main(), called on the last line: step 3 rewrites this
# very file, and a function is parsed whole before it starts.

main() {
  set -uo pipefail

  local here; here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local APP_DIR="${APP_DIR:-$(dirname "$here")}"
  local REMOTE="${REMOTE:-origin}" BRANCH="${BRANCH:-main}"
  local PM2_APP="${PM2_APP:-hanni-web}"
  local DEPLOY_LOG="${DEPLOY_LOG:-/var/log/hanni-web-deploy.log}"
  local LOCK_FILE="${LOCK_FILE:-/tmp/hanni-web-deploy.lock}"
  local HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/login}"
  local HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-40}"
  local KEEP_RELEASES="${KEEP_RELEASES:-3}"
  local CI_URL="${CI_URL:-https://github.com/234ekel234/cmms-web/actions}"
  local assume_yes=0
  [[ "${1:-}" == "-y" || "${1:-}" == "--yes" ]] && assume_yes=1

  cd "$APP_DIR" || { echo "Cannot enter $APP_DIR"; return 1; }
  local RELEASES="$APP_DIR/releases"

  local started; started=$(date +%s)
  local old new="" release="" previous=""

  say()  { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
  ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
  bad()  { printf '  \033[31m✗ %s\033[0m\n' "$*"; }
  record() {
    local line
    line="$(date -u +%Y-%m-%dT%H:%M:%SZ) ${SUDO_USER:-$(whoami)} ${old:0:7}..${new:0:7} $1 $(( $(date +%s) - started ))s${2:+ $2}"
    echo "$line" >> "$DEPLOY_LOG" 2>/dev/null || echo "  (could not write $DEPLOY_LOG: $line)"
  }

  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    bad "Another deploy is running (lock $LOCK_FILE)."
    return 1
  fi

  old="$(git rev-parse HEAD)"

  say "Checking the server copy"
  if ! grep -qE '^NEXT_PUBLIC_API_URL=.+' .env.production.local 2>/dev/null; then
    bad ".env.production.local has no NEXT_PUBLIC_API_URL — the build would not know where the API is."
    echo "  Create it (DEPLOY.md §16):  NEXT_PUBLIC_API_URL=https://cmms-api.servicemasterph.com/api"
    record "REFUSED" "no-env"
    return 1
  fi
  local dirty; dirty="$(git status --porcelain --untracked-files=no)"
  if [[ -n "$dirty" ]]; then
    bad "Files were changed on the server; a pull would stop partway:"
    echo "$dirty" | sed 's/^/      /'
    echo "  Nothing on the droplet is worth keeping. Discard with: git checkout -- <file>"
    record "REFUSED" "dirty-tree"
    return 1
  fi
  ok "No local edits, API address set"

  if ! git fetch --quiet "$REMOTE" "$BRANCH"; then
    bad "Could not fetch from GitHub — cannot tell whether this server is behind."
    record "FAILED" "fetch"
    return 1
  fi
  new="$(git rev-parse "$REMOTE/$BRANCH")"

  # From GitHub (deploy/ci-deploy.sh): deploy only the commit CI tested. If main
  # has moved on since, that newer commit's own run will deploy it.
  if [[ -n "${EXPECT_SHA:-}" && "$new" != "$EXPECT_SHA" ]]; then
    ok "main has moved past ${EXPECT_SHA:0:7}; the newer commit's own run deploys it"
    return 0
  fi

  # Up to date AND already running a release: nothing to do. With no release yet
  # (the first deploy) it carries on and builds what is checked out.
  if [[ "$old" == "$new" && -e "$RELEASES/current" ]]; then
    ok "Already up to date at ${old:0:7}"
    return 0
  fi
  if ! git merge-base --is-ancestor "$old" "$new"; then
    bad "This server's copy has commits GitHub does not; refusing to overwrite them."
    echo "  Inspect with: git log --oneline $REMOTE/$BRANCH..HEAD"
    record "REFUSED" "diverged"
    return 1
  fi

  say "About to deploy ${old:0:7} → ${new:0:7}"
  git --no-pager log --oneline "$old..$new" | sed 's/^/    /'

  if (( ! assume_yes )); then
    echo
    echo "  Has CI passed for ${new:0:7}? $CI_URL"
    local answer=""
    read -r -p "  Deploy? [y/N] " answer
    if [[ ! "$answer" =~ ^[Yy]$ ]]; then
      echo "  Cancelled — nothing changed."
      return 0
    fi
  fi

  # Before the switch the live site is untouched, so failing only puts the code back.
  undo_code() {
    git reset --quiet --hard "$old"
    bad "$1 failed — the site was not changed; code put back at ${old:0:7}."
    record "FAILED" "$2"
    return 1
  }

  say "Updating code"
  git merge --quiet --ff-only "$new" || { undo_code "git pull" pull; return 1; }
  ok "Code at ${new:0:7}"

  say "Installing dependencies"
  # --include=dev: the build needs TypeScript and Tailwind even when NODE_ENV
  # is production in this shell. The running server never sees these.
  npm ci --include=dev --no-audit --no-fund --loglevel=error || { undo_code "npm ci" npm-ci; return 1; }
  ok "Installed"

  say "Building (a few minutes)"
  # A cap the droplet can honour; without it Node sizes its heap from total
  # memory and the kernel kills the build instead of Node collecting garbage.
  NODE_OPTIONS="--max-old-space-size=${BUILD_HEAP_MB:-1536}" npm run build || { undo_code "next build" build; return 1; }
  ok "Built"

  say "Preparing the release"
  release="$RELEASES/${new:0:7}-$(date -u +%Y%m%d%H%M%S)"
  mkdir -p "$release" \
    && cp -a .next/standalone/. "$release/" \
    && mkdir -p "$release/.next" \
    && cp -a .next/static "$release/.next/static" \
    && cp -a public "$release/public" \
    || { rm -rf "$release"; undo_code "copying the release" copy; return 1; }
  ok "$(basename "$release")"

  previous="$(readlink "$RELEASES/current" 2>/dev/null || true)"

  # ln to a temporary name, then rename over `current`: rename is atomic, so
  # there is no instant at which `current` does not exist.
  point_at() { ln -sfn "$1" "$RELEASES/current.next" && mv -Tf "$RELEASES/current.next" "$RELEASES/current"; }
  start_or_restart() {
    if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
      pm2 restart "$PM2_APP" --update-env >/dev/null
    else
      pm2 start "$APP_DIR/deploy/ecosystem.config.cjs" >/dev/null && pm2 save >/dev/null
    fi
  }

  healthy() {
    local waited=0
    until curl -fsS --max-time 5 -o /dev/null "$HEALTH_URL" 2>/dev/null; do
      (( waited >= HEALTH_TIMEOUT )) && return 1
      sleep 2; waited=$(( waited + 2 ))
    done
    local before after
    before="$(pm2_field restarts)"; sleep 5; after="$(pm2_field restarts)"
    [[ "$(pm2_field status)" == "online" && "$before" == "$after" ]]
  }
  pm2_field() {
    pm2 jlist 2>/dev/null | node -e '
      let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const p = JSON.parse(s || "[]").find((x) => x.name === process.argv[1]);
        console.log(p ? (process.argv[2] === "status" ? p.pm2_env.status : p.pm2_env.restart_time) : "");
      });' "$PM2_APP" "$1"
  }

  say "Switching to the new release"
  point_at "$release" && start_or_restart || true

  say "Checking it came back"
  if ! healthy; then
    bad "The site did not come back healthy. Last errors:"
    pm2 logs "$PM2_APP" --err --lines 25 --nostream 2>/dev/null | tail -25 | sed 's/^/    /'
    if [[ -n "$previous" && -d "$previous" ]]; then
      say "Going back to $(basename "$previous")"
      point_at "$previous" && pm2 restart "$PM2_APP" --update-env >/dev/null
      git reset --quiet --hard "$old"
      if healthy; then
        ok "Previous release is running again"
        record "ROLLED-BACK" "health"
      else
        bad "The previous release did not come back either — check: pm2 logs $PM2_APP"
        record "FAILED" "health rollback-failed"
      fi
    else
      bad "No previous release to go back to (first deploy). Check: pm2 logs $PM2_APP"
      record "FAILED" "health first-deploy"
    fi
    return 1
  fi
  ok "$HEALTH_URL answers and pm2 is holding it up"

  # Keep the newest few; never the one in use.
  local live; live="$(readlink "$RELEASES/current")"
  ls -1dt "$RELEASES"/*/ 2>/dev/null | sed 's:/$::' | tail -n +"$(( KEEP_RELEASES + 1 ))" | while read -r dir; do
    [[ "$dir" != "$live" ]] && rm -rf "$dir"
  done

  record "OK"
  say "Deployed ${new:0:7} in $(( $(date +%s) - started ))s"
}

main "$@"; exit $?
