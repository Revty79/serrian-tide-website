# Worlds Towns and Shops - corrected Pass 2

Owner direction, 2026-10-24: complete relocation and integration, superseding the audit-only pause and the earlier parallel settlement implementation. Foundation: `419c2ffa78ab50bffcc37b93cdc85d651705227c`. The owner subsequently authorized Git publication of the completed, tested correction. Production and standalone Studio changes remain unauthorized.

## Latest owner corrections

The owner subsequently confirmed no old Town/Shop content needs importing and explicitly removed import/adoption wizards and unnecessary legacy mappings from scope. Preserve existing tables and the unexpected single DEV Town unchanged; no automatic import or invented World is authorized. The earlier audit's conversion proposal below is historical analysis, not an implementation requirement. Production data has not been checked and requires separate verification before future deployment.

The owner also authorized a single magical Shop in multiple towns. A World Shop has one permanent identity and shared business baseline; independent `world_shop_location` links identify its Town entrances and optional buildings. Removing an entrance preserves the Shop. Ordinary franchise branches can be separate Shops with independent baselines and names such as `McDonald's #4412`. Names never imply identity or cause automatic merging. Towns belong to Worlds and can appear on multiple Atlas maps; creation does not require placement. New inhabitants may deliberately link existing World individuals; they are not Campaign Characters.

## Delivered model and interfaces

The correction uses the established large `CreatorWorkshop` for Towns, Shops, places/buildings, merchandise, staff associations and entrances. It composes the original Shop fields, reusable definition/offering normalization, catalog detail formatter and validated commerce policies into named sections, previews and retained related drafts. World inhabitants use the full existing Individual creator directly. No minimal replacement person builder is active.

World geography UUIDs are the permanent Town, Shop and place identities. Town profiles extend geography rather than define another location. World Shop definitions and offerings hold usual stock, prices and policies. Existing Campaign Shop/Town tables remain unchanged gameplay and compatibility records; they are not the permanent World authority. This separation is deliberate: merging live Campaign balances/transactions into World definitions would violate the owner's independence requirement. There is no import/adoption or speculative ID mapping system.

Forward migration 0135 adds explicit building classification, direct same-World Individual associations and immutable accepted-command snapshots. 0134 stays byte-identical. Earlier minimal resident records remain preserved for recovery/compatibility, but new staff/resident relationships no longer create them; their authoring endpoint rejects new writes. No duplicate active person biography is maintained. Removing an entrance retains its Shop. Legacy Atlas source/settlement tables stay preserved behind their disabled authoring HTTP boundary.

Both original Heavens pages and navigation remain functional pending owner approval. Removing them is NOT part of this delivery's completion claim. See [delivery and deployment readiness](../operations/worlds-pass2-delivery.md).

## Retained audit and superseded conversion proposal

## Reconciliation and audit

The working tree retains the unfinished Pass 2 terrain autosave, Towns tab, physical marker layer, four-table 0134 draft, tests and documentation. No source was reset or reverted during the pause audit. Pass 1 remains in the foundation commit; current Pass 2 changes are not yet a completed delivery. Some Pass 1 screenshot receipts were overwritten by the initial baseline rerun and remain explicitly identified working-tree changes.

Read-only DEV verification: `localhost/serrian_tide_dev` ends at migration **0133** (ledger row ID 134 is not migration number 0134). None of the four proposed 0134 tables exists. DEV has one legacy Town and zero Shops, places, memberships, NPC associations, offerings, staff assignments, shop transactions or money events. This says nothing about Production, which was not contacted. Machine evidence: `artifacts/worlds-atlas-pass2/dev-preflight.json`.

The unpublished 0134 draft has no legacy identity mapping and binds markers and accepted operations specifically to its separate settlement profile. It also contains duplicated function/trigger creation blocks. It must be redesigned before application. Preserve the original draft as development evidence; applied migration bytes through 0133 remain unchanged.

| Capability | Existing Heavens implementation | Initial Pass 2 | Corrected treatment |
| --- | --- | --- | --- |
| Town identity | Integer ID, mandatory Campaign; name, category, overview, location/private notes | Geographic UUID, description/background/population/culture/government/History | One World definition; retain all useful fields; explicit legacy ID mapping |
| Town places | Ordered named places, descriptions, location/private notes, archive/restore | Missing | Preserve and expose in Worlds |
| Town Shops | Attach/detach, explicit reassignment, ordered membership; one Town per Shop | Missing | World Town/location links; preserve original Campaign memberships |
| NPC associations | Same-Campaign active race/creature NPC, simple/detailed builds, roles/notes/order | Missing | World inhabitants/associations plus retained original NPC relationships |
| Shop identity | Name/category/description/location notes; archive/restore | Missing | World-owned, optionally unassigned to a Town |
| Staff | Roles, ordering, one primary contact, eligible NPC validation | Missing | World staff associations; preserve Campaign staffing |
| Merchandise | Catalog Items, enabled state, inventory-transfer or narrative/service fulfillment | Missing | Reuse existing normalization and catalog identities |
| Stock/prices | Limited/unlimited stock; separate sale/buy overrides; null fallback differs from zero/free | Missing | World baseline definitions; Campaign stock remains separate live state |
| Business rules | Open/closed, immediate/approval purchases, sold-item handling, changed-sale acceptance | Missing | Preserve baseline configuration and reusable validated rules |
| Money | Shop balance, audited corrections, Credits/Derived Currency | Missing | Baseline configuration plus preserved Campaign balances and money ledgers |
| Concurrent editing | Commerce/offering versions, dirty-field reconciliation, Keep My Draft/Use Live Values | Limited revision checks | Preserve draft and conflict protection in relocated tools |
| Commerce | Purchases/sales, requests, changed terms, ownership transfers, resale Items/Creatures | Excluded | Keep current services operational via legacy state; no Tabletop redesign |
| Retry safety | Actor/submission-key operation claims, intent hashing, original checkout retry | Request/hash receipts for Town/marker commands | Preserve both boundaries |
| Atlas | Legacy drawings retained | Physical metres, wrap seam, multi-map identity, marker removal independent of Town | Retain and connect to authoritative World definitions |
| Lifecycle | Archive reasons/audit, active-visit and dependency guards, protected permanent deletion | Town archive/restore | Keep historical records and enforce compatibility guards |

Source inventory: `src/app/heavens/{towns,shops}/`, `src/features/{towns,shops}/`, `src/db/{town,shop,tabletop-location,tabletop-shop-visit,world-campaign,world-atlas}-schema.ts`, `src/features/tabletop-operations/{shop-visit-service,shop-commerce-service}.ts`, `src/app/realms/tabletop/player-shop-visit.tsx`, and lifecycle authorization/deletion services.

DEV confirms **20 direct foreign keys** into `town`, `shop`, `town_place` and `shop_offering`: six into Town, eleven into Shop, one into Town place and two into offerings. Numerous keys include `campaign_id`. Prepared/scene placements retain source references, inclusion/reveal/order state; they are not all frozen snapshots. Transactions additionally retain quoted prices, currency/policy snapshots, item/creature identities and ownership history. Removing Campaign IDs or replacing integer IDs would break these guarantees.

## Authoritative model

One World-owned Town uses an existing `world_geography` identity plus its Town profile. One World-owned Shop uses its own geographic identity plus business configuration. Its optional Town/place association is independent of map appearance. World places and inhabitants retain stable IDs. Reuse existing World lore identities for inhabitants and culture/government/history associations where appropriate; retain legacy NPC source identity and mechanical information when adopting existing relationships.

World definitions include mechanical baselines: offerings, quantities, prices, buying/selling policies and staff. Campaign gameplay state belongs to explicit compatibility mappings to these definitions. Existing `town`, `shop`, places, offerings, NPC/staff/membership records and commerce ledgers remain in place with their original IDs. These retained structures are the justified compatibility requirement, not another permanent authoring system. New World creation requires no Campaign or session/scene.

Adoption is owner-selected and transactional. List unmapped legacy records even when they have no World association or multiple contexts. The owner selects the destination World and may explicitly link an existing definition. Never infer identity from matching names or from the current Campaign home. Repeated adoption returns the same mapping; conflicts with another destination are rejected. Source gameplay rows are not rewritten. Copying current source stock/balance/settings as a new baseline must be explicit in the adoption interface; it never moves live money or inventory. Preserve source data where it cannot yet be adopted.

Reuse the existing World-Campaign context registry rather than assuming one World per Campaign: it supports multiple Worlds/timelines, removed associations and a separate home preference. Linking/removing a context must not silently reassign a Town or erase gameplay history.

The unified Worlds workspace owns Towns, Shops, places/buildings and inhabitants/staff associations. Legacy Heavens URLs lead to safe World selection/adoption and then the same authoring tools. Only exceptional compatibility operations needed for already-running Campaign commerce remain internal; there must be no competing permanent builder.

Atlas placements reference the canonical geographic identity, not a second Town record. Keep physical metre coordinates, fixed/wrapped bounds, separate revisions, atomic create-and-place, idempotent acceptance, shared labels and independent removal. Do not activate retired Atlas APIs or build a local street editor.

## Migration and validation risks

- The current DEV catalog is too sparse to prove safe conversion. Rehearsal must include populated Towns, places, both NPC kinds/build modes, staff, offerings, finite/unlimited stock, free/null prices, transactions, money events, visits, sale/resale instances and pending requests.
- Campaign-owned roots currently cascade from Campaign deletion. World definitions must survive independently; compatibility and lifecycle retention must preserve references rather than weakening constraints.
- Baseline definitions must never silently overwrite played stock, money, temporary availability, ownership, accepted quote versions or historical snapshots. Preserve original retry keys after uncertain responses.
- Legacy Campaign managers/Admin privileges differ from owner-only World authoring and explicit read-only Admin review. Keep authoring and runtime authorization distinct, including private notes and ordinary-knowledge exclusion.
- Preserve original field contents and limits deliberately: legacy names cap at 120; the draft allows 160. Keep location notes, archive reasons, ordering and private notes; do not truncate imported content.
- World inhabitants and Campaign NPC state are associated identities, not interchangeable storage rows. Preserve mechanical source data without inventing new canon or Campaign Characters.
- Rehearse fresh and populated upgrades before verified paired DEV database/terrain backups and additive migration. Code rollback does not reverse schema or accepted data.

Completion requires the owner's 30-case acceptance matrix, PostgreSQL persistence and idempotency evidence, unchanged historical ledgers/references, actual desktop/mobile journeys and restart proof, plus build/TypeScript/lint/relevant regressions. Interim checkpoints are not completion or owner acceptance.
