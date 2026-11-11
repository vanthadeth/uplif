#!/usr/bin/env bash
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/local/run-tests.sh
set -u
here="$(cd "$(dirname "$0")" && pwd)"; root="$here/.."
db=uplif_test
psql() { command psql -q -t -A -v ON_ERROR_STOP=1 "$@"; }
psql -d postgres -c "drop database if exists $db" -c "create database $db" || exit 2
psql -d $db -f "$here/shim.sql" || exit 2
for f in $(ls "$root/migrations" | sort); do
  case "$f" in *revoke_rls_auto_enable*) continue;; esac
  psql -d $db -f "$root/migrations/$f" >/dev/null || { echo "migration failed: $f"; exit 2; }
done
fail=0
for f in "$root"/tests/*.sql; do
  out=$(sed '/create extension if not exists pgtap/d' "$f" | psql -d $db 2>&1)
  ok=$(grep -c '^ok ' <<<"$out"); bad=$(grep -c '^not ok\|ERROR' <<<"$out")
  echo "$(basename "$f"): $ok ok, $bad problems"
  if [ "$bad" != 0 ]; then fail=1; grep -A1 '^not ok\|ERROR' <<<"$out" | cut -c1-200; fi
done
exit $fail
