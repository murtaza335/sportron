#!/bin/bash
# usage: run.sh  -> resets DB, applies migrations 084.., runs v1 + v2 tests
cd "$(dirname "$0")/../../.."
D=docs/tournaments/local-db
export PGPASSWORD=pw
P="psql -h localhost -p 55432 -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists tt" -d postgres >/dev/null 2>&1
$P -c "create database tt" -d postgres >/dev/null
P="$P -d tt"
sed 's/^create role.*//' $D/stubs.sql > /dev/null
# roles are cluster-wide: stubs create them only once
$P -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; create role authenticated nologin; create role service_role nologin; end if; end \$\$" >/dev/null
grep -v '^create role' $D/stubs.sql | $P >/dev/null 2>&1 || { echo STUBS FAILED; exit 1; }
for f in supabase/migrations/08[4-9]_*.sql supabase/migrations/09[0-7]_*.sql supabase/migrations/12[2-4]_*.sql; do
  [ -f "$f" ] || continue
  out=$($P -f "$f" 2>&1 >/dev/null | grep -v "^NOTICE\|^$") 
  if echo "$out" | grep -q "ERROR"; then echo "== $f"; echo "$out" | head -8; exit 1; fi
done
echo "migrations OK"
for t in docs/tournaments/sql-tests.sql docs/tournaments/sql-tests-v2.sql docs/admin-panel/sql-tests.sql; do
  echo "== $t"
  $P -f $t 2>&1 | grep -E "ERROR|FAIL|ALL TESTS|CONTEXT|DETAIL|HINT" | head -8
done
