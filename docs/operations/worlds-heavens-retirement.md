# Heavens Town/Shop retirement and Tabletop-link removal

The owner explicitly authorized this cleanup after `0d4d9bd`, conditional on auditing and preserving the original builders' useful capabilities. The subsequent clarification also authorizes removing the Heavens Tabletop link while retaining all Tabletop work for its future redesign.

**No database migration is required.** No schema, migration ledger or existing shared DEV/Production records are changed by this cleanup. Historical migrations 0134 and 0135 remain byte-identical.

## Capability audit before removal

Compared the complete original `src/app/heavens/towns/town-workspace.tsx` and `src/app/heavens/shops/shop-workspace.tsx`, their actions, domain normalizers, catalog formatter, lifecycle and commerce dependencies with the shipped Worlds workshops.

| Original capability | Current home and preservation |
| --- | --- |
| Town name, classification, overview, directions and private notes | Worlds Town workshop; population, origins, culture, government and History also retained |
| Shop identity, description, directions and starting balance | Worlds Shop business identity and Buying & selling sections |
| Equipment/Inventory catalog, group filters, descriptions, weapon/ammunition/armor/weight/durability detail | Worlds merchandise workshop reuses the extracted original formatter and existing Item profiles |
| Enabled listings, physical/narrative fulfillment, finite/unlimited stock including zero, independent buying/selling overrides, catalog-price fallback | Worlds offering workshop and original shared normalizers; no replacement purchase engine |
| Open/closed, immediate/approval purchases, resale handling and changed-sale acceptance | Worlds business defaults; existing runtime policy services preserved |
| Shop membership, building location, notes and order | World entrance relationships; optional multi-town Shop identity; removal preserves the business |
| NPC/staff roles, local notes, ordering and primary contact | World Individual associations in full related creators; existing Campaign NPC/staff services and foreign keys retained |
| One Town-directory entry per person with direct and Shop roles | Carried over in this cleanup, extended to building/place roles; every underlying relationship stays independently editable |
| Search Towns/Shops/places by identity, description or location; find staff and related records | Carried over broader text search and searchable related directories/person choices; searches do not dirty authoring drafts |
| Ordered places, descriptions, location/private notes, archive and restore | Worlds places/buildings workshop and retained lifecycle services |
| Concurrent edits, explicit conflict decisions and safe retries | Full Worlds draft reconciliation and exact original-command retries; original checkout retry protections retained |
| Audited live balance correction and Campaign/Derived Currency formatting | Existing Campaign commerce, currency formatter and original actions/component retained for current runtime and redesign; World balances remain baseline Credits, not live Campaign money |
| Purchases, sales, stock/balance changes, ownership transfer, resale Items/Creatures, quotes, approvals and ledgers | Full current Tabletop services/UI/routes/tests retained unchanged |
| Lifecycle dependency preview, guarded permanent deletion, confirmation and audit | Full original lifecycle services/actions/components/tests retained; World authoring uses archive/restore to preserve stable geography and immutable receipts |

The original builder components, styles and actions remain in the repository as unmounted, reusable reference implementations. Their feature-coverage tests remain active. Only their page renderers and Heavens entry links are retired. The retrievable pre-retirement implementation is also committed at `0d4d9bdcf35722fea3f65f11b6b7baafb670f525`.

This is not a claim that Campaign-specific money operations or permanent deletion were newly implemented as World authoring controls. Their original implementation is preserved deliberately, while the World workshops retain permanent definitions independently of Campaign gameplay.

## Interface changes

- Remove Town Builder, Shop Builder and Tabletop Operations cards/links from the Heavens dashboard/navigation.
- `/heavens/towns` authenticates normally and redirects to `/worlds/towns`.
- `/heavens/shops` authenticates normally and redirects to `/worlds/towns?section=shops`.
- The World chooser opens the corresponding Towns or Shops destination. It never guesses a World from old Campaign integer query parameters.
- Existing direct Tabletop routes remain functional. The Realms Player Tabletop navigation is unchanged; this request concerns the Heavens entry point.
- Preserve all current Tabletop/Campaign code, original Shop/Town storage, historical migrations, transactions, and saved terrain.

## Validation and publication

Feature tests cover the original retained builder/runtime capabilities plus the once-per-person directory, distinct local roles, archived indirect references and description/location search. The owned disposable PostgreSQL/production-browser rehearsal checks Worlds Town/Shop/Individual authoring, catalog/stock/prices/policies, parent-draft protection, exact retries, retired entry points and destination selection, the retained direct Tabletop route, desktop/touch behavior, Atlas/terrain and the other Worlds destinations.

Evidence is indexed under `docs/screenshots/worlds-heavens-retirement/`. The final Git handoff supplies the exact implementation SHA and validation results. Shared DEV/Production data and the owner's app process are untouched. Git publication is authorized; server deployment is not performed.

- **2,278 feature tests passed** across 284 files, including the preserved Campaign/Tabletop feature coverage and new directory cases.
- Root TypeScript and lint of changed files passed. A final isolated production build covers the last related-creation control guard; existing saved relationship identities cannot be accidentally changed by creating an unrelated child.
- The production browser rehearsal passed full authoring, source/privacy regressions, retirement redirects, Shop destination selection, direct Tabletop access and 390px native-touch emulation with no browser errors or horizontal overflow. This is not a physical-phone claim.
- The fresh disposable replay includes all 136 existing migrations; **this cleanup introduces zero migrations**.
- **539 protected tracked files remain unchanged** from `0d4d9bd`: original Town/Shop implementations/actions, Tabletop implementation/tests, database schemas and historical migrations. [Preservation receipt](../screenshots/worlds-heavens-retirement/preserved-source.json).
- Personally inspected [Heavens after removal](../screenshots/worlds-heavens-retirement/heavens-after-retirement.png), [the grouped resident workshop](../screenshots/worlds-heavens-retirement/residents-directory-desktop.png) and [the phone directory](../screenshots/worlds-heavens-retirement/residents-directory-phone.png). [Full browser/build receipt](../screenshots/worlds-heavens-retirement/results.json).

Deployment is code-only on top of the previously required 0134/0135 baseline. Those existing migration requirements are unchanged. Recovery is reverting this interface commit; no database rollback is needed because this cleanup has no database/schema writes.

Later cleanup may remove obsolete original UI source and old tables only after the replacement runtime has safely replaced every consumer and any historical records are accounted for. This interface cleanup does not authorize that data/schema removal.
