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
