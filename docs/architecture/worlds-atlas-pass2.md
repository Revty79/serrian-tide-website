# Initial Website Atlas Pass 2 - superseded

Historical draft. The owner replaced this parallel-settlement direction with [corrected Town and Shop relocation](worlds-town-shop-unification.md), then removed legacy import machinery and authorized multiple Town entrances for one magical Shop. Follow the latest direction in AGENTS.md.

Owner authorization: October 24, 2026, from `419c2ffa78ab50bffcc37b93cdc85d651705227c`. Work stays in this website's Worlds section. The standalone Studio, Production/Ubuntu deployment, destructive legacy conversion, commerce/runtime changes and remote push are excluded.

## Working data model

`world_geography` is the stable semantic place. New settlements use `kind=location`, `context=settlement`. Existing `world_settlement_entity` represents streets/buildings and other children inside a settlement; it is not a permanent town profile. Existing Heavens `town`, `town_place`, NPC associations and shop memberships require a Campaign, so they remain unchanged.

Forward migration 0134 adds only four needed tables: `world_settlement_profile` (World-owned narrative details and optional existing culture/government identities), `world_settlement_history` (existing event associations), `world_map_place` (independent physical-coordinate appearance/revision/removal state), and `world_place_operation` (immutable idempotency receipt and accepted town/appearance snapshot). Foreign keys keep all relationships within one World. Culture/government family constraints prevent using unrelated lore families. Coordinate triggers validate against the new terrain's physical frame; fixed edges and the east/west seam do not use legacy drawing dimensions.

Town identity is independent of appearances. One town can occur on many maps. Removing an appearance retains the town; archiving the town retains appearances and operation history. Restoring a town never silently restores a removed marker. Names are suggestions, never identity keys. Accepted create-at-point commands create the place, profile and marker in one owner-authorized transaction; cancellation makes no permanent record, and retries return the original receipt.

Town profiles are World baseline authoring, independent of Campaign and selected historical branch. Optional associations refer to existing primary-History identities; they do not adjudicate dates or create fictional events. Private notes and this authoring API are excluded from ordinary-knowledge previews. Explicit Administrator review remains read-only. Immutable operation snapshots provide exact accepted source references for later dated appearances; timeline authoring is not activated here.

## Terrain autosave

Completed strokes, undo/redo and explicitly applied sea-level changes debounce for 1.2 seconds. Manual Save remains available. Only one terrain command is in flight per editor. The numerical snapshot sent to the server contains completed edits; a later gesture can continue while disk/database work proceeds. An acknowledgement advances the accepted baseline without replacing live working samples. Changes made during that save remain dirty and are saved by the next completed-edit cycle. Pointer movement and unfinished gestures never trigger accepted revisions. Future generation previews must remain outside this completed-edit boundary.

IndexedDB recovery, request identities, immutable numerical versions and conflict checks remain. Failed automatic saves retain the exact command and pause until retry; a newer remote revision preserves the draft and requires deliberate reconciliation. Unaccepted location points have their own explicit acceptance controls and are never included in terrain autosave.

## World-native Shop boundary (inspection only)

Inspected: `src/app/heavens/towns`, `src/features/towns`, `src/db/town-schema.ts`, `src/app/heavens/shops`, `src/features/shops`, `src/db/shop-schema.ts`, their actions, catalog/inventory/NPC references and `shop-commerce-service`/`shop-visit-service` in Tabletop operations. Current Town/Shop roots require `campaign_id`. Shop actions include Campaign manager checks, stock/inventory, currency balances, NPC staffing, active visits, transaction/event records and prepared/scene snapshots.

The next separately scoped Shop implementation should place permanent business identity, narrative baseline and ordinary offering definitions in Worlds, linked to a World place and optional town. Catalog offerings should retain authorized item/source identities, while actual stock, money, purchases, sales, staff gameplay state and session changes remain Campaign/runtime projections. Shop appearances should use the physical map frame and stable place identity. This pass's marker foreign key intentionally supports settlements only; a future forward migration can add business appearances with explicit kind/ownership validation. Do not represent a business as a duplicate town merely to obtain a marker.

Future conversion needs an inventory of ownership, stock, transaction history and active sessions, explicit source/version provenance and an idempotent opt-in mapping between World definitions and Campaign instances. Do not silently reparent existing Campaign towns/shops or copy inventories into reusable definitions. Existing builders continue until replacements are complete and accepted. No Shop control, commerce table change or current Tabletop runtime modification is part of Pass 2.

## Validation and release boundary

Reconfirm Pass 1 first; test fresh migration replay and populated upgrades in newly owned disposable targets. Before authorized actual DEV writes, verify the live ledger, protect and restore a paired database/private-terrain backup, preserve existing rows, and apply only pending forward migrations. Applied files, including 0133 and any owner-applied later migration, are frozen. Stop after the completed local review commit and evidence. Owner hands-on instructions belong in the completion receipt; technical checks do not record owner acceptance.
