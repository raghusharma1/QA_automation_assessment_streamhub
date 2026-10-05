#!/usr/bin/env bash
# Runs every scenario's schema, seed and queries with psql in the official postgres image, and
# saves the transcripts to sql/results/psql/. This is independent evidence that the SQL runs
# unchanged on a real PostgreSQL server, not only on PGlite.
#
#   bash sql/scripts/run-in-docker.sh            (needs Docker; uses a throwaway container)
set -euo pipefail

IMAGE="${PG_IMAGE:-postgres:18}"
NAME="streamhub-qa-pg-$$"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/sql/results/psql"
mkdir -p "$OUT"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Throwaway, local-only container: trust auth, no published ports, removed on exit.
docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -q && break
  sleep 1
done

psql_in() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -X -P pager=off "$@"; }

run_scenario() {
  local scenario="$1"; shift
  local dir="$ROOT/sql/$scenario"
  # Separate -c flags: one -c with several statements runs as a single transaction, and
  # DROP/CREATE DATABASE are not allowed inside a transaction block.
  psql_in -q -c "DROP DATABASE IF EXISTS s" -c "CREATE DATABASE s" >/dev/null
  psql_in -q -d s < "$dir/schema.sql" >/dev/null
  psql_in -q -d s < "$dir/seed.sql" >/dev/null
  local version
  version="$(psql_in -d s -At -c 'SELECT version()')"

  local schema_out="$OUT/${scenario}--schema.txt"
  { echo "-- psql \\d transcript for sql/$scenario/schema.sql on $version"; echo
    psql_in -d s -c '\d public.*'; } > "$schema_out"
  echo "wrote ${schema_out#"$ROOT"/}"

  for query in "$@"; do
    local out="$OUT/${scenario}--${query%.sql}.txt"
    # -a echoes every statement before its output: a faithful transcript of what ran.
    { echo "-- psql transcript: sql/$scenario/$query on $version"; echo
      psql_in -d s -a < "$dir/$query"; } > "$out"
    echo "wrote ${out#"$ROOT"/}"
  done
}

run_scenario scenario1-round-trips query.sql query-one-to-one.sql
run_scenario scenario2-streaks query.sql query-lag-lead.sql query-team-fixtures.sql
