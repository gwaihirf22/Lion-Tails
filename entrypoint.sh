#!/bin/sh
set -e

# Make sure the database is reachable and the schema exists before starting.
#
# The app has an in-memory storage fallback, so a database problem must not
# prevent the container from starting -- but it should be loud in the logs,
# because silently running without persistence loses every write on restart.

if [ -z "$DATABASE_URL" ]; then
  echo "⚠️  DATABASE_URL is not set — starting with in-memory storage. Data will NOT persist."
elif node scripts/wait-for-db.js; then
  echo "🔄 Applying database migrations..."
  node scripts/migrate.js || echo "⚠️  Migrations failed; continuing (health check will report it)."
else
  echo "⚠️  Starting anyway with in-memory storage. Data will NOT persist."
fi

echo "🚀 Starting Lion Tails..."
exec "$@"
