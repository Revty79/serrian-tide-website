# Operating The Crossroads

The Crossroads (`/chat`) uses PostgreSQL for durable messages and PostgreSQL `LISTEN/NOTIFY` with Server-Sent Events (SSE) for privacy-safe live invalidation.

## Database readiness and backups

Apply Drizzle migrations `0013_chat_foundation.sql` and `0014_chat_room_membership.sql` before making `/chat` available. Use the reviewed migration path:

```bash
npx drizzle-kit migrate
```

Do not use `drizzle-kit push`. Normal PostgreSQL backups must include the Chat tables and message records (`chat_room`, `chat_room_member`, and `chat_message`) alongside the rest of the application database.

## Clean builds and generated output

A stale Turbopack development build previously served an empty CSS-module mapping even though the committed Chat stylesheet was correct. If deployed styling does not match committed CSS:

1. Stop the development or production Next.js process.
2. Remove only the generated `.next` output used by that process.
3. Perform a clean development restart or production build.
4. Hard-refresh the browser after the clean restart.

Never delete source CSS, Drizzle migration SQL, migration snapshots, or the migration journal as a cache fix.

## SSE and reverse-proxy requirements

The production proxy must preserve the SSE response rather than buffering or transforming it:

- pass through `Content-Type: text/event-stream`;
- allow long-lived HTTP connections;
- preserve `Cache-Control: no-cache, no-transform`;
- disable proxy buffering;
- configure idle/read timeouts longer than the server's 20-second heartbeat interval;
- forward session cookies to the Next.js application;
- disable response compression or other transformation that can buffer the stream.

The repository does not prescribe a particular reverse proxy. Apply these requirements to the selected deployment platform and confirm that listener connections close after clients leave Chat.

## Minimum production smoke test

1. Open the same global room with two authorized accounts.
2. Post from one account and confirm the other receives it without refreshing.
3. Delete it as its author and confirm the other account receives the removed-message placeholder.
4. Confirm a Campaign room is visible only to its creator and current Campaign Players.
5. Confirm a direct conversation is visible only to its two participants.
6. Remove Campaign membership and confirm the open client loses that room and safely falls back.
7. Remove a User's final Serrian role and confirm the open client clears Chat state and returns to `/access`.
8. Leave `/chat` and confirm its dedicated PostgreSQL listener connections close.
