# Blu status in the admin dashboard

The timer records one allowlisted status and completion time in a dedicated directory using atomic replacement. The API mounts only that directory read-only and serves the validated status through existing current-role admin middleware. An old timestamp becomes a stopped-reporting warning. The bilingual dashboard uses a compact card and refreshes while open.

- Reproduce the missing private status endpoint in the disposable database suite.
- Cover unauthorized access, revoked role, missing/invalid/stale reports and explicit re-enrollment.
- Verify the timer writer, API and dashboard builds, then deploy both containers and check the live admin response.
