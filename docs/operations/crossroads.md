# Operating The Crossroads

The Crossroads (`/chat`) stores durable messages in PostgreSQL and uses PostgreSQL `LISTEN/NOTIFY` with authenticated Server-Sent Events (SSE) for privacy-safe live invalidation. This runbook covers deployment, verification, rollback, and recovery for the implementation delivered by migrations `0013_chat_foundation.sql` and `0014_chat_room_membership.sql`.

The repository does not contain or control a production reverse proxy, process manager, container definition, or hosting-platform configuration. The operator must verify the external runtime and proxy requirements below before exposing Chat. Do not claim those settings are active until they have been checked on the actual deployment.

## Before deployment

1. Confirm the intended release commit and a clean checkout:

   ```bash
   git status --short --branch
   git rev-parse HEAD
   git log -1 --format=%s
   ```

2. Record the commit currently running in production using the deployment platform's normal release record. Keep that value with the deployment notes.
3. Fingerprint the committed migration history before applying it. On PowerShell:

   ```powershell
   Get-ChildItem drizzle -File -Filter *.sql | Sort-Object Name | Get-FileHash -Algorithm SHA256
   Get-FileHash drizzle/meta/_journal.json -Algorithm SHA256
   Get-ChildItem drizzle/meta -File -Filter *_snapshot.json | Sort-Object Name | Get-FileHash -Algorithm SHA256
   ```

   Compare the output with the reviewed release artifact. Do not edit a migration, snapshot, or journal entry to reconcile a checksum difference.

4. Confirm a recent, nonempty PostgreSQL backup exists in protected storage. Immediately before migration, create a new custom-format backup using the deployment environment's protected connection configuration:

   ```bash
   pg_dump --format=custom --file=<secure-backup-path>
   pg_restore --list <secure-backup-path>
   ```

   Supply the connection through the deployment platform's protected `PG*` environment or PostgreSQL service configuration; do not place credentials in the command line. The archive listing must succeed and include application schemas and data. If policy requires a restore rehearsal, restore into an isolated database—not production—and verify representative records there. Do not continue with an empty, unreadable, or unverified archive.

5. Confirm `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` are present through the deployment platform's secret facility. Confirm presence only; never print their values or place them in deployment logs.
6. Confirm the external proxy/runtime meets every requirement in [SSE production requirements](#sse-production-requirements).
7. Run the release validation commands from the intended commit:

   ```bash
   npm ci
   npm run validate:chat
   npm run validate:navigation
   npm run typecheck
   npm run lint
   npm run build
   npx drizzle-kit check
   ```

   Before approving the release, run the database and browser acceptance checks against the guarded local `_dev` database—not production:

   ```bash
   npm run validate:chat-db
   npm run validate:chat-browser
   npm run validate:chat-live-browser
   npm run validate:chat-production-browser
   ```

   The final command creates and removes marked fixture records, compiles into an isolated generated directory, starts that compiled application on a local test port, and removes the isolated build afterward. Its database-host and database-name guards must remain enabled.

`drizzle-kit push` is not an approved deployment operation.

## Deployment order

Use the application's normal controlled maintenance/release procedure and keep a timestamped operator log. The safe order is:

1. Put the normal application deployment procedure into effect: announce or begin the maintenance window, prevent conflicting deploys, and prepare the reviewed commit with `npm ci` and `npm run build`.
2. Take the production PostgreSQL backup and verify it with `pg_restore --list` as described above.
3. Apply only committed migrations using the repository's established command:

   ```bash
   npx drizzle-kit migrate
   ```

4. Using a read-only SQL session, confirm `chat_room`, `chat_message`, and `chat_room_member` exist:

   ```sql
   SELECT
     to_regclass('public.chat_room') AS chat_room,
     to_regclass('public.chat_message') AS chat_message,
     to_regclass('public.chat_room_member') AS chat_room_member;
   ```

5. Confirm exactly one global `crossroads` room exists and that the migrations did not create messages:

   ```sql
   SELECT count(*) AS global_crossroads_rooms
   FROM chat_room
   WHERE slug = 'crossroads'
     AND scope = 'global'
     AND campaign_id IS NULL;

   SELECT count(*) AS chat_message_count
   FROM chat_message;
   ```

   The first result must be `1`. The second result is expected to be `0` only on a first deployment before Users have posted; on later deployments, compare it with the pre-deployment count rather than expecting zero.

6. Confirm every existing Campaign has exactly one stable default room and no Campaign is missing one:

   ```sql
   SELECT c.id, count(r.id) AS default_room_count
   FROM campaign AS c
   LEFT JOIN chat_room AS r
     ON r.campaign_id = c.id
    AND r.scope = 'campaign'
    AND r.slug = 'campaign-' || c.id || '-general'
   GROUP BY c.id
   HAVING count(r.id) <> 1;
   ```

   This query must return no rows. Custom Campaign rooms are separate and must not be removed.

7. Deploy or restart the compiled application from the reviewed release. The repository's production command is:

   ```bash
   npm run start
   ```

   Run it through the site's established external process manager and HTTPS proxy. Do not substitute `npm run dev` for production acceptance.

8. Confirm the application responds normally through the public HTTPS endpoint and review startup logs for errors. There is no repository-defined health endpoint; use the deployment platform's established health check plus a normal page request.
9. Complete the manual production smoke test below before ending the maintenance window.

## Production smoke test

Use dedicated authorized test accounts and content safe for production logs. Remove only the test messages those accounts created.

1. Sign in as each relevant role and confirm Paths exposes The Crossroads exactly once.
2. Open the global room in two independent authenticated browser sessions.
3. Post a clearly identified test message in session A and confirm it appears in session B without manual refresh.
4. Delete that message as its author and confirm both sessions show the redacted `Message removed` placeholder.
5. Open a Campaign room as its creator or current Campaign Player. Confirm an unrelated signed-in User cannot discover or subscribe to the room.
6. Start or reopen a direct conversation. Confirm only its two participants can discover, read, post, or subscribe.
7. Verify the room selector, message history, and composer at a narrow mobile viewport without horizontal overflow.
8. In browser developer tools, confirm `/api/chat/live?room=...` stays open as `text/event-stream`, receives heartbeat traffic, and reconnects after a controlled network interruption.
9. Confirm application and proxy logs contain no database secrets, session material, email addresses from Chat search, raw private messages, or notification payload content.
10. Leave `/chat` in both sessions and confirm dedicated PostgreSQL listener connections close rather than accumulating.

## SSE production requirements

The route is implemented with the Next.js Node runtime, forced dynamic rendering, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`, a 20-second heartbeat, and a native EventSource retry interval. Each open browser stream owns a dedicated PostgreSQL listener and releases it when the request aborts, the stream is cancelled, or the database connection errors.

The external HTTPS proxy or platform must:

- pass through `Content-Type: text/event-stream`;
- forward authenticated session cookies to Next.js;
- disable response buffering for `/api/chat/live`;
- avoid compression, caching, or response transformation that buffers the stream;
- use idle/read timeouts comfortably longer than the 20-second heartbeat interval;
- preserve long-lived HTTP responses and client disconnect signals;
- avoid caching authenticated SSE responses at a CDN or edge layer.

Native EventSource reconnection is expected and safe: the client reauthorizes every new connection and reloads authoritative data rather than trusting event content. Notification payloads contain only an event category and, for message invalidation, the room slug and numeric message ID. PostgreSQL distributes committed notifications to listeners across multiple application instances sharing the same database; no process-local pub/sub state is required.

Because proxy configuration lives outside this repository, verify these settings in the real platform before production acceptance. A locally passing SSE test cannot prove external proxy behavior.

## Rollback

Application rollback and database restoration are different operations.

### Before any Chat data exists

If the application fails before Users create Chat rooms or messages, return the application to the previously recorded commit using the normal deployment rollback. Leave the migrated tables in place if the previous application is compatible with additive unused tables. Dropping tables is not required for an ordinary code rollback.

If policy requires reversing schema changes before any Chat data exists, stop and obtain explicit database-owner approval. Capture migration-ledger state, table counts, schema definitions, and the verified backup location before any destructive operation.

### After Chat data exists

Do not drop `chat_room`, `chat_room_member`, or `chat_message`. Doing so destroys room identities, memberships, messages, deletion audit data, and Campaign relationships and is not an ordinary rollback.

Prefer rolling application code back while preserving the additive Chat schema and all Chat data, provided the previous commit is schema-compatible. Disable access to `/chat` at the deployment/router layer if necessary while a compatible correction is prepared.

Restore the database backup only when data or schema has actually been corrupted and the database owner has authorized restoration. A restore may discard all legitimate writes made after the backup, including non-Chat data.

Before any destructive database action, collect:

- current and target application commit hashes;
- migration-ledger rows and migration-file checksums;
- counts for all three Chat tables and representative Campaign/default-room checks;
- database and application error logs with secrets redacted;
- a fresh verified backup and the previous verified backup location;
- a written statement of the exact data-loss window and approval to proceed.

## Troubleshooting

### `relation "chat_room" does not exist`

The application is connected to a database where committed Chat migrations are not installed, or the application and migration command are using different connection settings. Without changing data, inspect the migration ledger and `to_regclass` results, confirm both processes use the same secret source, then apply reviewed migrations during a controlled deployment. Do not delete the migration ledger or run `drizzle-kit push`.

### Stale `.next` or Turbopack CSS output

If `/chat` renders as unstyled markup while the committed CSS module is present:

1. Stop the affected Next.js process.
2. Remove only that process's generated `.next` output.
3. Run `npm run build` for production or restart `npm run dev` for development.
4. Hard-refresh the browser.

Never delete source CSS, migrations, snapshots, or the journal as a cache fix.

### SSE connects but messages do not update

Confirm the browser stream remains open, the response is `text/event-stream`, and heartbeat comments arrive. Confirm application instances use the same PostgreSQL database, the server can open a dedicated PostgreSQL connection, and committed writes invoke `pg_notify`. Inspect server/proxy logs without logging raw message content or secrets.

### Proxy buffering or regular reconnects

Check buffering, compression, transformation, CDN caching, and idle/read timeout settings specifically for `/api/chat/live`. The proxy timeout must exceed the 20-second heartbeat interval. `X-Accel-Buffering: no` is emitted by the application but does not override every platform's defaults.

### Authorization failures after role or Campaign membership changes

Authorization is intentionally recalculated from current database state. Confirm the User still has a current Serrian role and, for Campaign rooms, is the Campaign creator or a current Campaign Player. A revoked client should fall back to an authorized room or leave Chat; do not restore access by bypassing the server checks.

### Duplicate-post concerns

Each send uses an author-scoped cryptographic request ID. An exact retry returns the original message; changed content or room identity with the same request ID is rejected. Check the `chat_message_author_request_uq` constraint and compare message IDs before treating a repeated UI reconciliation as a duplicate database insert. Do not edit or deduplicate rows manually without a reviewed data-repair plan.

### Checking migration state without changing it

Use read-only queries:

```sql
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY id;

SELECT
  to_regclass('public.chat_room'),
  to_regclass('public.chat_message'),
  to_regclass('public.chat_room_member');
```

Compare ledger hashes with the reviewed migration files and deployment record. Do not delete ledger rows, rewrite migration files, or rerun migration SQL manually to force a match.
