# Local DB harness for the tournament SQL

Runs migrations 084+ and both test files (`sql-tests.sql`, `sql-tests-v2.sql`) against a throwaway
Postgres 16 container, with minimal stubs for the Supabase pieces the tournament SQL depends on
(`auth.uid()`, `profiles`, `public_profiles`, `in_app_notifications`, `log_audit_event`, roles).

```bash
docker run -d --name ttpg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:16-alpine
docs/tournaments/local-db/run.sh        # resets database `tt`, applies migrations, runs the tests
docker rm -f ttpg                        # when done
```
Success = each test file ends with `ERROR: ALL TESTS PASSED — rolled back, nothing saved`.
This is a convenience for development; the real Supabase project remains the source of truth.
