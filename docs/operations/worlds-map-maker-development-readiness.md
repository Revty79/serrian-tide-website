# Map Maker development readiness and owner acceptance

The [unified Atlas roadmap](../architecture/worlds-map-maker-decisions.md#revised-completion-roadmap--adopted-2026-10-15) and [final UX-0A contract](../architecture/worlds-atlas-ux0a-contract.md) record owner/Cody/Ember agreement on 2026-10-15. Current permission is documentation and read-only preparation. Implementation, migrations, shared-data writes, push and deployment remain unauthorized. D3-B requires UX-0A acceptance and a separately authorized bounded brief.

## Reset DEV and joint readiness: current status

The owner reset DEV. The [2026-10-15 preparation report](worlds-atlas-ux0a-preparation.md) verifies the actual read-only target and all 132 migration hashes/timestamps through 0131, with zero Worlds/maps/geographic features/raster versions. Prior paired backups and private assets remain retained; they are historical recovery points, not snapshots of the reset database. No recovery or import was performed. Do not run the old preassembled owner fixture as proof of the new empty-World journey.

**Do not invite the owner to test until Cody and Ember both explicitly approve initial testing readiness against a completed implementation commit and evidence.** Cody runs the actual journey, technical/browser checks and screenshot/export inspection, fixes blockers and supplies the reviewable commit. Ember independently reviews it. Only then can the owner evaluate final usability/visual quality. This gate supersedes earlier direct owner-invitation wording below; the checklist remains a later human acceptance template, not a current invitation.

## Matched recovery-point procedure

1. Select the intended DEV URL explicitly from local configuration without logging credentials. Verify database name, actual server address/port, schema search path, expected application tables and the complete committed migration ledger. Do not infer the correct application from the database name alone. No Production connection, schema push or shared-database repair is implied.
2. Record release commit, tool versions, target identity, timestamp, database inventory and private geographic/raster storage roots. Vector originals and geographic identities reside in PostgreSQL; include every private file root and all retained bundles, including currently unassociated originals and historical/fictional bundles. Record missing or unexpectedly empty content honestly. Do not recover lost Earth or import a replacement demonstration.
3. Create a new complete PostgreSQL custom dump. Use a consistent exported database snapshot or coordinated writer quiescence to match comparison evidence to the dump; never stop a shared service without separate authorization. Record SHA-256, size and readable dump inventory. Include all application schemas, migration rows, sequence state and relevant schema objects in restoration comparisons.
4. Back up the matched private assets to a new protected directory using the [existing portable raster tooling](worlds-raster-deployment.md#paired-backup-and-exact-recovery). Hash every original, derived asset and manifest, preserve/reconstruct required hardlinks, and ensure originals/inventory remain unchanged during the operation. Never hardlink the backup to the live source, replace a retained bundle or regenerate worldwide assets to make a check pass.
5. Restore only the newly captured dump into a new positively identified owned disposable PostgreSQL target. Restore assets from the backup into a separate new private root. Do not restore into shared DEV or Production. Record database/server/path identity and isolate credentials, ports and application configuration.
6. Compare every source/restored table's complete row content, migration ledger, sequence state and relevant schema objects. Compare every restored asset and manifest against the original inventory and checksums, and verify manifests plus database-to-bundle associations where present. A database with no raster associations must be reported as such; do not fabricate associations or weaken the release gate that requires active raster sources.
7. Keep the database dump, asset backup, release identity, inventory/checksums and successful restoration receipt together. Sensitive dumps and private inventories remain outside Git and public assets. Keep a separately retained copy outside the working checkout and preferably a separate failure domain; same-disk copies establish local restoration evidence but cannot establish protection from loss of that disk. State the actual retention location and any remaining limitation.
8. Recheck source identity/content at the end, disclose concurrent changes, and stop task-owned rehearsal processes when no longer needed. Report exact coverage, failed/deferred checks and the distinction between verified local recovery, off-device retention and Production release readiness. A receipt is evidence, not a replacement for an actual restoration.

Existing `raster readiness` remains the full geographic release gate for an installation with associated sources; this development checkpoint does not weaken its canonical-source, permission or complete-asset checks. Do not advertise a new production deployment merely because the current DEV recovery point restores successfully. No migrations or new datasets are required by this readiness step.

### Retained checkpoint archives

If the operator copy is a hardlink-aware archive, retain its checksum and successful member-by-member verification receipt beside it. Verify that archive checksum before recovery, then extract only into a new protected empty directory on a filesystem supporting the retained hardlinks. Keep the current `development.dump` and `private-assets` paired. A separately labelled `retained-ux0-fixture` is historical acceptance material, not today's DEV backup; never choose its older dump implicitly.

Restore the selected current dump with `pg_restore --exit-on-error --no-owner --no-privileges` into a new positively identified owned target, and use the existing `restore-assets` command with the extracted current `private-assets` backup and another new private root. Repeat the table, sequence, ledger, schema and complete-asset comparisons before calling recovery successful. Ownership, service roles and grants need their own authorized operator setup. Same-disk retention remains vulnerable to loss of that disk even when all archive members verify.

## UX-0 hands-on owner acceptance

The owner reports that UX-0 technical review passed, followed by a 2026-10-15 hands-on result of **not accepted for usability / changes requested**. The owner observed a black background after coastline generation, did not understand most tools or where/how to use them, and found the overall workspace too difficult without coaching. Discoverability and usability therefore remain blocking issues before D3-B. See the [proposed UX-0A correction](../architecture/worlds-map-studio-usability-correction.md); this feedback authorizes its proposal, not implementation. Historical technical receipts and screenshots remain retained and do not imply usability acceptance.

Use the current focused Studio in an isolated acceptance environment when creator writes are required. Keep it separate from the pristine restored recovery target. Ordinary developer use of a restored fixture is not restoration of the lost Earth into shared DEV.

The owner should be able to:

- Enter a map from the library, identify the current World/map/mode and find drawing, geography, generation, display, connections and export tools without coaching.
- Draw/edit an island and label, pan/zoom, change settings, switch panels and use Undo/Redo while retaining the active draft.
- Understand which artwork/geographic/preferences changes each save persists; save, reopen, cancel navigation, and encounter a failed save or conflict without losing other drafts.
- Open existing settlement, interior and dungeon editors, work with their tools and return through existing navigation.
- Work comfortably with desktop, keyboard and touch/phone layouts, including dismissing settings and reaching save/return controls. Report small-height/keyboard limitations rather than equating an on-screen canvas with comfortable use.

Record observed friction, task outcomes and the owner's explicit decision. Fixes beyond this readiness/documentation authorization require their own bounded scope; do not silently start D3-B or the broad Worlds cleanup. Later increments repeat the five completion standards. Geo E additionally observes an unfamiliar creator completing the agreed journeys without developer coaching.

Use this template for the next owner's review. Its pending task cells do not supersede the overall usability rejection recorded above; no individual acceptance is inferred from the owner's general feedback or a developer's smoke check.

| Task | What to record | Owner outcome |
| --- | --- | --- |
| Find the map and tools | First action chosen; any tool that was difficult to find; whether World, map and active mode were clear. | Pending |
| Draw and revise | Island and label edits; pan/zoom; switching settings; Undo/Redo; whether the draft stayed intact. | Pending |
| Save and return | Which save the owner expected; save/reopen outcome; cancelled navigation; whether feedback was understandable. | Pending |
| Recover from failure | Failed-save/conflict scenario used; which drafts remained; retry/rebase outcome. Exercise deliberate faults only in a disposable fixture. | Pending |
| Use connected editors | Settlement, interior and dungeon entry/return; any loss of place or historical context. | Pending |
| Work on desktop and phone | Device/browser and viewport; settings dismissal; reachability of save/return; keyboard and small-height friction. | Pending |

Record the owner's final decision separately as accepted, accepted with explicitly listed conditions, or changes requested, with the date and unresolved observations. Physical-phone review remains distinct from automated mobile/touch emulation.
