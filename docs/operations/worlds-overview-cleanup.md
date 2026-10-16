# World Overview cleanup — 2026-10-16

Owner-authorized presentation cleanup on `codex/worlds-overview-cleanup`, based on the preserved UX-0A checkpoint `cbd9a9654e33345832331d0fb7899c57bd8afd21`. The exact release commit is recorded in the accompanying GitHub handoff. This does not approve or merge the separate UX-0A artwork/readiness review.

## Result

The existing World header, cover, identity controls and all thirteen navigation destinations remain intact. The overview now reads in this order:

1. Opening Pages and three recently written historical entries.
2. History at a Glance, with the selected history visible. Timeline/year-display settings and the timeline key are expandable; full History remains available.
3. One complete World map, rendered with the existing Atlas composition. **Open Atlas opens the Atlas map-maker page**, with saved maps and creation tools.
4. Expandable World details and the longer historical overview.

Long introductions can be expanded without editing their saved text. Campaign authoring context remains in the other workspaces; it no longer precedes the overview's actual content. Geography editing, source keys, coordinate/projection controls, import tools and source lists remain in Atlas. They are not embedded in the overview.

Only active, available generic maps explicitly marked with **World** scope are eligible for the overview. Continent, regional, local, archived and unavailable maps are not substituted. Multiple World maps have a folded display chooser; this view choice creates no new saved preference. If none exists, the page explains how to add one in Atlas rather than inventing a map or restoring deleted Earth. It shows the shared map, without claiming a dated historical appearance.

The overview map catalog is a small header response from the already authorized, server-filtered **ordinary** Atlas result. Protected/Realm geographic maps remain withheld, including in owner/review overview choices. The map renderer separately reauthorizes the exact saved map, retains current-access checks, exact artwork/source revisions and required credits, and rejects a map that is no longer eligible for World coverage. Gallery behavior remains unchanged; the overview retains its loaded preview when scrolling so it does not repeatedly disappear/rebuild.

## Verification

The [reproduction runner](../../scripts/worlds-overview-review.ts) prepares a **new owned disposable database**, then operates the production-mode application in a separate runtime checkout. It never reads `.env.local`, modifies shared DEV/Production, or uses the owner demonstration as a fixture. Run its `--prepare` mode before the browser mode. Both require the existing verified disposable harness, Node 22, PostgreSQL and Chrome. Set `SERRIAN_UX0A_CHECKOUT=runtime-checkout-overview` when running the harness build; the existing artwork-review runtime is not overwritten.

- Production build and TypeScript pass.
- 2,250 feature tests pass, with zero failed/skipped tests across 277 discovered files. Nine focused overview/preview/pagination/authorization-stamp regressions also pass.
- ESLint has no errors; the existing unused `LoreFamily` warning in the stories check harness remains.
- Original World header and navigation markup compare exactly with the parent checkpoint.
- Actual 1440px desktop and 390px native-touch-emulation workflows verify content order, all thirteen navigation destinations, overview timeline switching, the Atlas map-maker destination, disclosures, timeline controls and no horizontal phone overflow.
- Failed introduction saves retain the draft; explicit discard preserves the original saved introduction.
- Empty World map state, foreign/Player/default-Admin denial and explicit read-only Administrator review are checked. Ordinary overview choices withhold the protected World map.
- Every saved `world*` table row matches its pre-browser snapshot after these view/failure/cancel flows. Authentication session rows are outside that content comparison.

See the [browser results](../screenshots/worlds-overview-cleanup/results.json), [desktop](../screenshots/worlds-overview-cleanup/overview-desktop.png), [phone overview](../screenshots/worlds-overview-cleanup/overview-phone.png), [phone history](../screenshots/worlds-overview-cleanup/history-phone.png) and [phone map](../screenshots/worlds-overview-cleanup/map-phone.png). Screenshots use disposable fictional fixtures, not permanent canon or private owner content. Touch is browser emulation, not physical-phone acceptance.

The [verification receipt](../screenshots/worlds-overview-cleanup/verification.json) records the final measured source fingerprint, `c54a9affa2ee768254672858701bd9ef18e03e2d07aabdff24bd902578551f52`, and the passing build/test checks. Cody inspected the actual desktop and phone renders.

## Deployment and recovery

No new migration, schema/data format, required configuration or paid service is introduced. Existing ordered migrations remain unchanged, including 0132 inherited from the parent UX-0A application. This branch depends on that parent application; its push does not accept, merge or deploy the parent review.

After separate deployment authorization, use the normal controlled release procedure: verify exact code/target/ledger identity, preserve the running release and matched backups, build before activation, then check owner/ordinary/Admin views and Open Atlas. No shared-service restart, main merge or deployment was performed by this cleanup.

The cleanup writes no new user-data representation. Reverting only this cleanup to its parent restores the prior overview and leaves saved Worlds, maps, geography, history and artwork unchanged. The parent's v2-data compatibility/recovery requirements still apply; reverting this presentation change does not justify rolling back 0132 or removing artwork pins.

Technical checks cover this increment; independent review and owner visual acceptance remain distinct. The branch is ready for the owner-authorized push/sync and separate review, not an automatic merge/deployment.
