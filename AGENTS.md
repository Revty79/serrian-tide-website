<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Shared appearance

All new or modified interfaces must use the shared semantic theme variables for appearance colors. Extend the shared system when necessary instead of introducing independent page palettes.

See [Theme development](docs/architecture/theme-development.md) for the permanent implementation standard and intentional exceptions.

## User guidance

New or modified fields should explain their meaning and use in plain language. Reuse the shared field/page guidance, retain visible validation, and verify descriptions against the actual rules rather than inventing mechanics. See [Field guidance](docs/architecture/field-guidance.md).

## Worlds creator workshops

Follow the owner-approved [creator experience standard and acceptance checklist](docs/architecture/worlds-creator-experience.md) and [field coverage inventory](docs/architecture/worlds-creator-coverage.md). Preserve approved A2-I workshops, the [linking bridge](docs/architecture/worlds-linking-bridge.md), World/map/place identities, editable Atlas source geometry, retained versions, provenance, historical/calendar sources, selected timelines and server-side privacy. The owner separately authorized [Phase 6A narrative stories](docs/architecture/worlds-stories.md) from technically approved `3550f8bd765e9e3f0531ee56e14107a5bf944a56`. Stories extend the existing immutable lore registry; telling and alleged-event dates stay separate, original sources remain retained and contradictions are never adjudicated. Phase 6B-A is separately authorized from technically approved `92281e00005bb8fb8cbbd78ef2eaea613dd7e5ed`: follow [historical map appearances](docs/architecture/worlds-map-states.md), preserving the shared baseline, immutable sources, explicit year coverage and deliberate branch pins. Generic maps reuse the existing Map Maker. Phase 6B-B is separately authorized from approved `9267fc465e717d9503f4e5546e87b6243a69741b`: follow [historical settlements](docs/architecture/worlds-historical-settlements.md), reusing the Settlement Editor and renderer, immutable appearances, explicit place conditions and stable semantic identities. Phase 6B-C is separately authorized from technically approved `9ac678fc03a6f39a9989e9991d34f3e48b5a6d0f`: follow [historical territories](docs/architecture/worlds-historical-territories.md), reusing exact political/History sources and the Map Maker while keeping stable land identities separate from political overlays. The owner subsequently authorized Git push/sync for the completed 6B-C pass. Phase 6B-D is separately authorized from approved `622adfcf9a8be48a798e3d1df6ec48e5534d81db`: follow [historical connections and source comparison](docs/architecture/worlds-historical-connections.md), preserving shared connection identities, exact appearance/connection source pins and ordinary privacy while keeping dated destination choices separate from map artwork. The owner confirms independent technical approval of 6B-A through 6B-D and separately authorized [Phase 6B Final integration and acceptance](docs/architecture/worlds-living-history-acceptance.md) from `81098e07cd7227db80aff5659e3a86b45bfda8d0`. Its supported historical map, settlement, territory and connection foundation keeps original source dates separate from display conventions; linked interiors/dungeons retain shared baseline artwork and explicit unknown dated coverage. Dated room/layout authoring remains deferred for separate approval. The owner confirms independent technical approval of 6B-A through 6B-D and separately authorized [Phase 6B Final integration and acceptance](docs/architecture/worlds-living-history-acceptance.md) from `81098e07cd7227db80aff5659e3a86b45bfda8d0`. Its supported historical map, settlement, territory and connection foundation keeps original source dates separate from display conventions; linked interiors/dungeons retain shared baseline artwork and explicit unknown dated coverage. Dated room/layout authoring remains deferred for separate approval. Stop at a clean local commit for Ember's independent technical review and owner visual acceptance. No push, sync, deployment, shared service/database changes or Phase 7 is authorized for this final pass. Repair G is canceled and the comprehensive Worlds assessment is Phase 9. Later passes, modern Earth imports, Advanced Map Studio, Phases 7-8 and VTT work require separate authorization; earlier push approval does not authorize later pushes or deployment.

## Independently deployable passes

Every completed development pass must leave the entire application functional and ready for controlled production deployment without a later pass. Deliver complete working increments; omit unfinished routes, controls and dependencies. Preserve existing systems and user data. Version all required migrations, rehearse upgrades with existing data in disposable databases, and document migration order and recovery: reverting code does not reverse database changes.

Before completion, verify the production build, TypeScript, lint, relevant regressions, authorization and actual desktop/phone behavior. Preserve unrelated changes and create a clean local commit or explicitly identified commit-ready checkpoint. Provide a short deployment-readiness report with the commit, features, checks, ordered migrations, configuration, deployment steps, rollback/recovery, blockers and readiness for push/deployment. Divide oversized work into smaller complete increments. See [Pass deployment standard](docs/operations/pass-deployment-standard.md).

Never push remotely, deploy or modify Production without explicit authorization for that action.

## Resuming combat work

When the user says “let's finish fixing combat,” “resume combat,” or similar, read [COMBAT-RESUME.md](COMBAT-RESUME.md) first. Check for intervening checkout changes, briefly recap the status, and start with the first unresolved priority under the user's current direction. Update that handoff after each completed combat fix so Cody and Ember share the same record. Its latest confirmed rulings supersede the older combat notes it identifies.

## Atlas continuity and future scales

Atlas passes preserve editable source data, stable geography/location identities, World ownership and explicit read-only Administrator review. Never rewrite published or finalized migrations, including 0102 and later; database changes require new numbered migrations. Future System Canon marking is Administrator-only; no canon controls are authorized in Pass 3B or 3C. Generator creation recipes are historical provenance; saved editable source remains authoritative after manual edits. Preserve versioned seed reproducibility and never regenerate an existing map automatically.

Dedicated future Atlas passes will cover city, building-interior and dungeon authoring, with connected scales World -> Continent -> Region -> City -> Building -> Dungeon Floor. City tools need editable streets, buildings, walls, districts and landmarks. Dungeon tools need rooms, corridors, doors, stairs, levels, traps, optional grids and protected G.O.D.-only elements. These are future requirements, not active controls or permission changes in continent cartography. See [Atlas future tools](docs/architecture/worlds-atlas-roadmap.md).

## Worlds and future VTT boundary

Worlds is a standalone world-building application. Settlement, interior and dungeon passes must not create or couple to Heavens Towns, Shops, NPCs, Campaign membership or gameplay runtime. Preserve durable World identities for future integration through a separate Virtual Tabletop application accessible from the main dashboard. Do not place the future VTT inside Paths or Worlds or add inactive integration placeholders.
