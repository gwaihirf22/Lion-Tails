#!/bin/bash
# Spin the dev stack up, down, or report on it.
#
#   ./scripts/dev-stack.sh up      start Postgres, migrate, seed, run the server
#   ./scripts/dev-stack.sh down    stop the server and remove the database
#   ./scripts/dev-stack.sh status  what is running
#   ./scripts/dev-stack.sh reset   down, then up -- a clean world
#
# WHY A THROWAWAY DATABASE AND NOT PRODUCTION. The dev server exists to try
# changes that touch the schema and the story pipeline. Pointing it at the live
# database would mean a half-finished migration runs against real stories, and
# generation writes real rows. The seed below recreates everything worth having
# in a few seconds, so losing it costs nothing.
#
# The container is NOT --rm and uses a named volume, so `up` after a server
# reboot finds the same account and the same stories rather than a blank world.
set -uo pipefail

CONTAINER=lion-tails-dev-db
VOLUME=lion-tails-dev-db-data
PORT_DB=55432
PORT_APP=5250
DB_URL="postgres://postgres:devonly@127.0.0.1:${PORT_DB}/liontails_dev"

# The Docker host. This repo is usually worked on from a container that has no
# docker binary of its own but can reach the host over ssh.
# Args are re-quoted for the remote shell. Passing "$@" straight to ssh loses a
# level of quoting, so --format '{{.Names}}' arrives as three words and docker
# rejects it -- which looks like a docker error and is a shell one.
if command -v docker >/dev/null 2>&1; then
  D() { docker "$@"; }
  DB_HOST=127.0.0.1
else
  D() {
    local cmd="docker"
    for a in "$@"; do cmd="$cmd $(printf %q "$a")"; done
    ssh -o BatchMode=yes root@192.168.1.9 "$cmd"
  }
  DB_HOST=192.168.1.9
fi
DB_URL="postgres://postgres:devonly@${DB_HOST}:${PORT_DB}/liontails_dev"

app_pids() {
  for p in /proc/[0-9]*; do
    [ -r "$p/cmdline" ] || continue
    case "$(readlink "$p/exe" 2>/dev/null)" in
      *node) case "$(tr '\0' ' ' < "$p/cmdline")" in *server/dev.ts*) echo "${p#/proc/}";; esac ;;
    esac
  done
}

stop_app() {
  local pids; pids=$(app_pids)
  [ -n "$pids" ] && kill $pids 2>/dev/null
  for _ in $(seq 1 15); do
    curl -s -o /dev/null -m 1 "http://127.0.0.1:${PORT_APP}/" 2>/dev/null || return 0
    sleep 1
  done
}

case "${1:-status}" in
up)
  if ! D ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    if D ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
      # Stopped, not gone. Starting it keeps the same data directory; recreating
      # would too (the volume is named), but starting is faster and does not
      # depend on the run flags below still matching what made it.
      echo "starting the existing $CONTAINER…"
      D start "$CONTAINER" >/dev/null || exit 1
    else
      echo "creating $CONTAINER…"
      # --restart unless-stopped so the database comes back after a host reboot.
      # NOT --rm: the whole point is that the account, the characters and the
      # universes are still there tomorrow.
      D run -d --name "$CONTAINER" --restart unless-stopped \
        -e POSTGRES_PASSWORD=devonly -e POSTGRES_DB=liontails_dev \
        -v "${VOLUME}:/var/lib/postgresql/data" \
        -p "${PORT_DB}:5432" postgres:15 >/dev/null || exit 1
    fi
    for i in $(seq 1 40); do
      D exec "$CONTAINER" pg_isready -U postgres -q 2>/dev/null && break
      sleep 1
    done
  fi
  echo "applying migrations…"
  DATABASE_URL="$DB_URL" node scripts/migrate.js | tail -1

  stop_app

  # The OpenAI key, borrowed from the running production container rather than
  # kept in a file here. Nothing is stored at rest: it lives in this process's
  # environment for as long as the dev server runs and nowhere else, which is
  # why there is no .env to leak, commit or forget to rotate.
  #
  # Without it the app still starts and the local Ollama models still work --
  # but an account whose stored model is an OpenAI one gets a clear 503 rather
  # than a story, so say plainly which mode this is.
  if [ -z "${OPENAI_API_KEY:-}" ]; then
    OPENAI_API_KEY="$(ssh -o BatchMode=yes -o ConnectTimeout=5 root@192.168.1.9 \
      'docker exec lion-tails printenv OPENAI_API_KEY' 2>/dev/null | tr -d '\r\n')"
  fi
  if [ -n "${OPENAI_API_KEY:-}" ]; then
    echo "openai:   key loaded from production (${#OPENAI_API_KEY} chars, not stored)"
  else
    echo "openai:   NO KEY -- local models only. An account set to an OpenAI"
    echo "          model will get 503 no_model_available until you switch it"
    echo "          in Settings or export OPENAI_API_KEY and run 'up' again."
  fi

  echo "starting the app on :${PORT_APP}…"
  DATABASE_URL="$DB_URL" PORT="$PORT_APP" SESSION_SECRET=devonly \
    OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
    OLLAMA_BASE_URL="http://${DB_HOST}:11434/v1" \
    nohup npm run dev > /tmp/lion-tails-dev.log 2>&1 &
  for i in $(seq 1 40); do
    sleep 1
    curl -s -m 2 "http://127.0.0.1:${PORT_APP}/api/health" >/dev/null 2>&1 && break
  done
  curl -s -m 5 "http://127.0.0.1:${PORT_APP}/api/health"; echo
  DATABASE_URL="$DB_URL" npx tsx scripts/dev-seed.ts
  echo
  echo "  http://${DB_HOST}:${PORT_APP}"
  echo "  log: /tmp/lion-tails-dev.log"
  ;;

down)
  stop_app
  D stop "$CONTAINER" >/dev/null 2>&1
  echo "stopped. Data is kept -- 'up' brings it back exactly as it was."
  echo "'reset' is the one that throws the world away."
  ;;

reset)
  stop_app
  D rm -f "$CONTAINER" >/dev/null 2>&1
  D volume rm "$VOLUME" >/dev/null 2>&1
  echo "database removed. Run 'up' for a clean world."
  ;;

status)
  echo -n "database: "; D ps --format '{{.Names}} {{.Status}}' | grep "$CONTAINER" || echo "not running"
  echo -n "app:      "
  if curl -s -m 2 "http://127.0.0.1:${PORT_APP}/api/health" 2>/dev/null; then echo; else echo "not running"; fi
  ;;

*)
  echo "usage: $0 {up|down|reset|status}" >&2
  exit 1
  ;;
esac
