# Worlds Pass 2 delivery and deployment readiness

Foundation: `419c2ffa78ab50bffcc37b93cdc85d651705227c`. The implementation is the commit containing this report; its exact SHA is supplied in the Git handoff. Owner usability acceptance and approval to retire Heavens remain separate.

**Subsequent owner direction:** Town/Shop retirement and removal of the Heavens Tabletop link are now explicitly authorized. The retained-interface statements below describe the original `0d4d9bd` delivery. See [the retirement audit and receipt](worlds-heavens-retirement.md) for the current interface, capability preservation and validation. This cleanup requires no database migration.

## Delivered behavior

Open a World, then **Towns**. Towns, Shops, Places of interest, Buildings & facilities, and Residents & associations are visible destinations. Authoring uses the established full `CreatorWorkshop`: named freely selectable sections, independently scrolling content, live preview, fixed save/cancel controls, phone preview, whole-draft validation and retained related drafts.

Save a new Town or Shop and continue developing its related records in the same workshop. Each related accepted save is explicitly independent; cancelling a parent does not erase an accepted child. A missing inhabitant opens the existing full Individual creator, including its life, connections, History, original sections and privacy controls. It does not create another minimal biography.

One World-owned Shop can be unplaced, in one Town, or deliberately linked to several Towns. Entrances reference its same inventory, staff and settings. Removing an entrance retains the Shop; relinking retains the entrance identity. Franchise branches can be independent Shop records, including identical names. No name-based merge occurs.

Both original Heavens builders and their navigation are retained and browser-verified. Retirement requires the owner's explicit approval.

## Feature parity and reuse

| Existing Heavens capability | Worlds implementation |
| --- | --- |
| Town identity, category, overview, directions and private notes | Full Town sections, with population, background, culture, government and History links added |
| Ordered places with descriptions, directions and private notes | Places of interest plus explicit building/facility classification; full place workshop; archive/restore |
| Shop memberships and ordered location | True many-to-many entrance links, optional building, entrance notes and order; unplaced businesses supported |
| NPC roles, notes and order | Direct World Individual associations; roles, local notes, ordering; original Campaign NPC relationships remain intact |
| Shop identity, category, description and location | Full business identity section; all original useful fields retained |
| Staff assignments, responsibilities, primary contact | Full inhabitant workflow, role/order and one primary contact per location; same people across entrances |
| Equipment/Inventory catalog and weapon/armor detail | Existing Item identities, filters and extracted original catalog detail formatter |
| Enabled offerings, physical or narrative fulfillment | Same original offering normalizer and fulfillment choices |
| Limited/unlimited stock, finite zero quantity | World baseline stock with the same validation; Campaign changes remain separate |
| Independent buying/selling overrides | Same price normalizer and effective-price helper; blank uses catalog, zero means free |
| Open/closed, purchase approval and resale policies | All four established commerce policy settings in Buying & selling |
| Shop balances and monetary history | World starting balance; existing Campaign balances, corrections and ledgers preserved separately |
| Conflict and retry protection | Per-field three-way reconciliation, explicit Keep My Draft/Use Live Values, exact retained save command after uncertain responses |
| Archive/restore and retained dependencies | Non-destructive lifecycle, persisted reasons, preserved map/location/Item/person identities; immutable save receipts |
| Purchases, sales, ownership transfer, requests and resale | Existing validated Campaign shopping services retained; disposable commerce regression passed |

UI fields are composed into the Worlds standard rather than copied with their old Campaign page layout. Shop definition and offering normalization are extracted from the original builder and still used by it. Commerce execution is not reimplemented.

## Storage and compatibility

Permanent definitions have no Campaign foreign key. Existing `world_geography` UUIDs identify Towns, Shops and places. The Town profile extends the existing geography record; Atlas appearances use a separate metre-based relation. Shops and their baseline offerings reference the same World identities. There are no additional competing active settlement records behind the new Atlas.

Existing Campaign `town`, `shop`, offerings, memberships, staff, transactions and money-event tables remain unchanged compatibility/gameplay storage. They are not the authority for World definitions. Their integers and foreign keys remain intact. The future Tabletop can consume World definitions without becoming their owner. This pass does not build a new Tabletop or change current Campaign transactions when a World baseline changes.

No legacy import, adoption wizard, automatic assignment or speculative ID-mapping system was built. Read-only DEV inspection found one original Campaign Town, zero original Shops and zero related memberships, places, NPC associations, offerings, staff or transaction/money rows. That unexpected Town was preserved and reported. Applied 0134 engineering fixtures were retained. Minimal 0134 resident profiles are preserved as compatibility/recovery records; new resident/staff creation uses full World Individuals directly, without copying their biography or private notes.

## Database migrations

Apply in existing order, after all historical migrations:

1. `0133_worlds_editable_terrain` — existing Pass 1 foundation, unchanged.
2. `0134_world_towns_shops` — World definitions, physical map appearances, business baselines and relationships. Already applied to local DEV. SHA256 `9f006922a5c5104ceb2f557d8ed31fa8ffee271afade14b82a94f63767818863`.
3. `0135_world_creator_relationships` — explicit building kind, direct same-World Individual relationships, and immutable accepted-command snapshots. Applied to local DEV using a new forward migration. SHA256 `232f6601648d57c67b3e92aed9982ee169be724a6337f6888dde8ec1d9ed2f1a`.

The 0135 rehearsal restored the fresh DEV backup exactly, upgraded it in an owned disposable PostgreSQL target, and compared all pre-existing values in 337 public tables before/after. The live target was rechecked before application. New columns received their documented defaults; prior row values and all prior ledger entries stayed unchanged. Final DEV ledger: 136 entries. Migration 0132 has the previously documented stored-LF/checkout-CRLF-only hash difference; neither its SQL nor its stored ledger was changed.

Backup before 0135: `artifacts/worlds-atlas-pass2/dev-backups/2026-10-25T03-35-48-973Z/before-0135.dump`, SHA256 `453d624583fe5dc6b41c58df9f6012f1770f8e55d410215ae73bb87c3ed639e5`. All 389 private terrain files were copied and individually hash-verified. Manifest SHA256 `f7965ba1d1d95fe74e32b7b0925a98be15d95fbbb17673a9eec042ed0c06fc3d`. Dumps, credentials, sessions, private storage and test checkout remain ignored by Git.

Machine receipts: [0134 DEV upgrade](../screenshots/worlds-atlas-pass2/dev-migration-results.json), [0135 DEV upgrade](../screenshots/worlds-atlas-pass2/dev-0135-migration-results.json), [actual DEV verification](../screenshots/worlds-atlas-pass2/dev-browser-results.json).

## Verification

- Production build: normal Turbopack build in an owned checkout and disposable PostgreSQL target; Google Fonts downloaded normally.
- TypeScript: clean. Full lint: no errors; one pre-existing unused `LoreFamily` warning in `scripts/worlds-stories-checks.ts`.
- Feature tests: 2,275 passed across 283 files. Original Heavens foundation and navigation tests remain active.
- Original Campaign commerce PostgreSQL regression: passed atomic/repeat-safe purchases, stock/money/ownership, policy and privacy checks.
- Fresh migration replay: all 136 migrations passed. Populated DEV restoration/upgrade: all previous row values retained.
- Browser: full Town, building, place, Shop, merchandise, staff, full Individual, multiple entrances, conflict resolution, independent related saves, parent cancellation, exact Shop retry and Heavens retention.
- Atlas: atomic Town+marker creation, cancellation without records, rename labels, multiple maps, marker removal without Town deletion, fixed/wrapped physical coordinates.
- Terrain: completed-stroke debounce, painting during a save, undo/redo, exact lost-response retry, browser recovery, conflict protection, reopen and owned-app restart. No brush/renderer replacement.
- Regression: all other Worlds destinations, thirteen creator families, History/calendar/timeline/Campaign links, retained legacy map sources, disabled legacy map HTTP boundary, owner/Admin/Player/foreign/anonymous/ordinary/CSRF guards.
- Phone: 390px native touch emulation, creation and preview, no horizontal overflow, touch sculpting. No physical-device claim.

Latest measured desktop brush work: 16 batches, mean 0.66 ms, maximum 1.30 ms. Touch-emulated phone: one batch, 0.90 ms. These measure brush processing, not network latency. See [journey receipt](../screenshots/worlds-atlas-pass2/pass2-results.json) and [full rehearsal](../screenshots/worlds-atlas-pass2/results.json).

Screenshots personally inspected: [Town workshop](../screenshots/worlds-atlas-pass2/town-workshop-desktop.png), [Shop workshop](../screenshots/worlds-atlas-pass2/shop-workshop-desktop.png), [phone workshop](../screenshots/worlds-atlas-pass2/shop-workshop-phone.png), [Atlas](../screenshots/worlds-atlas-pass2/terrain-autosave-desktop.png).

## Controlled deployment and recovery

Git publication is authorized. Production/server access and deployment are not authorized and were not performed. Production contents must be independently verified before future deployment; the local DEV inventory does not establish Production emptiness.

For a separately authorized deployment: verify target identity and migration ledger; inspect existing Town/Shop records; take and restore-test a database backup and private terrain backup; rehearse the ordered upgrade against that copy; apply pending forward migrations; build/start the application with its normal database/auth configuration and private terrain root; check owner authoring, read-only Admin review and existing Campaign commerce. No new external service or Docker configuration is required.

Keep database and private terrain storage together for recovery. Reverting code does not reverse schema or accepted saves. Prefer a corrective forward migration. A full rollback requires a verified database/private-file pair and an explicit decision about records saved since that backup; never restore an old dump over newer authoring silently.

Heavens retirement and final owner usability acceptance remain outstanding by design. Detailed street maps, floor-plan drawing and the future Tabletop redesign are outside this pass. Existing World/Campaign association remains available; no speculative new gameplay import wizard was added.
