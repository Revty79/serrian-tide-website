# Container System — Pass 3

Pass 3 extends the approved Pass 1 foundation, Pass 2 physical rules, and Loose-only firearm/magazine correction at `d2d69ba`. It does not implement Pass 4 combat handling.

## Schema and compatibility

Migration `0069_magical_container_rules.sql` extends **container_profiles**, rather than introducing another profile table. The only new table is **inventory_container_substance**, keyed by the existing exact container instance, with Character/Item ownership enforced by a restrictive composite foreign key. It stores a positive finite quantity and a substance definition. Empty finite containers have no row; infinite sources never get a sentinel quantity.

Profile additions: independent weight/volume capacity modes; fixed loaded weight; magical content restriction; time mode, multiplier, applicability and category/type selectors; living-content capability; optional structured source definition. Existing profiles default to normal capacities, normal weight, normal time, any magical classification, no living capability, and no source. Existing Items do not become containers or become classified as magical automatically.

The migration retains ownership restrictions, adds substance ownership/retirement guards and Character locking, and includes the new table in explicit root cleanup. SQL checks validate capacity/weight/time modes and finite numeric bounds; shared client/server normalization validates complete authored source definitions and conditional fields. The snapshot chain follows 0068 and changes only these two tables. No shared or production migration was applied.

## Capacity and external weight

`weightCapacityMode` and `volumeCapacityMode` independently use `normal` or `unlimited`. Null normal limits remain unauthored, not authored infinity. Retained numeric values are ignored only for their corresponding explicitly unlimited dimension. Other limits and restrictions still apply.

New general containers require a finite weight/volume limit or explicit unlimited mode. Existing unconfigured mundane profiles retain their previous behavior. Finite substance-only sources can instead use their positive maximum quantity; enabling ordinary Item storage then requires a general capacity definition.

`containedWeightBehavior` supports:

- `normal`: empty Item/assembly weight plus resolved contents weight.
- `contents-weightless`: the container's own Item/assembly weight; contents do not contribute externally.
- `fixed`: explicitly authored `fixedLoadedWeightLb`, including when empty.

Parents receive the child's **resolved external loaded weight** and authored external Item volume. They do not inherit the child's capacity overrides. A container's internal finite weight check still uses actual contents weight even when its external weight is suppressed. Infinite supply is a source capability, not an allocated physical volume/mass; any finite contents or ordinary Items in the same container still undergo its normal limits.

## Restrictions and missing data

`magicalContentRestriction` accepts `any`, `mundane-only`, or `magical-only`, using existing `items.isMagical`. It combines with category, Record Type, liquid physical form, maximum dimension, and nesting permission. Item restrictions apply to directly stored Items; child interiors use their own profiles. Names/descriptions never determine magic or physical form.

Finite substance contents and infinite source definitions also expose explicit magical classification and physical form. Liquid/magic restrictions apply to them; Item category/Record Type restrictions apply to discrete Items, not the separate substance model.

Unknown weight/volume remains unknown. Finite enforced measurements block missing data. Explicitly irrelevant measurements do not block: for example, unlimited internal weight plus contents-weightless external behavior can contain Items without weight data, while finite volume still needs volume data. Fixed external weight does not need the base Item's weight. Normal external weight still reports unknown contents mass even if there is no internal weight limit.

## Time and living capabilities

Time modes are `normal`, `suspended`, `slowed`, and `accelerated`. Effective elapsed time is **outside elapsed time × multiplier**. Slowed requires `0 < multiplier < 1`; accelerated requires a finite multiplier greater than 1. Normal/suspended do not retain a ratio.

The pure `resolveContainedElapsedTime` hook resolves the full immediate-container-to-root chain. Applicable suspension returns zero; otherwise applicable ratios multiply. Overflow is rejected rather than silently producing infinity. Selectivity always classifies the original subject, not an enclosing bag:

- `all` applies to every subject.
- `perishables` accepts an explicit future-system trait, otherwise the exact case-insensitive category/Record Type `Food` or `Perishable`.
- `living` requires an explicit living trait.
- `categories-types` matches either authored category or Record Type list, case-insensitively.

`readContainedElapsedTimeInTransaction` is the authorized, read-only inventory hook for exact copies and specific stack portions. Attached magazines resolve through the firearm assembly location. The pure hook also accepts the immediate container for a substance or future living subject. `livingContentsAllowed` is authorable and visible; no Character/Creature ownership conversion or living containment is implemented.

This is a current-graph elapsed-time resolver, not a historical clock. A future timed system must settle elapsed intervals when location or catalog time rules change; it must not apply today's graph retroactively across those changes. No spoilage, aging, disease, poison, bleeding, burning, spell-duration, preservation effect engine, or breathing simulation was added.

## Substances and sources

The optional source definition contains `finite`/`infinite` mode, substance identity/name, quantity unit (`L`, `kg`, or `lb`), physical form, magical classification, authored pounds/liters per quantity unit, finite maximum quantity, substance lock, and whether ordinary Items may coexist. Lock defaults on and ordinary Item storage defaults off.

Finite copies start empty. Add/draw operations persist quantity, enforce maximum and ancestor physical limits, and remove the row when emptied. Authored mass/volume per unit is used; missing density is not invented. Units are explicit and are not automatically converted. Stored identity/unit/physical data survives catalog edits; a matching current source definition supplies current physical measurements, while a replaced definition leaves the stored snapshot available for draining.

Unlocked finite containers can choose an alternative substance definition from another owned source Item with the same unit. The server loads that authored definition; Players cannot submit density or other catalog metadata. Existing substance must be emptied before changing identity. Mixing is unsupported.

Infinite sources require `contents-weightless` or `fixed` external weight. Drawing returns the authored identity and requested amount without decrementing supply or creating general Item stacks. Infinite sources always draw their current authored substance. The inventory version advances, so repeating an old command fails closed.

Add/draw records a quantity adjustment involving an external supply/destination. It does not create owned Items, apply drinking/consumption effects, or transfer substance automatically between containers or Characters. Such workflows are separate future work.

Catalog changes preserve existing contents. Reads show conflicts; new additions must satisfy the new rules. Moving Items out and drawing finite legacy substance out use the existing relieve-invalid-state path, including when the source definition was removed or changed to infinite. Ordinary deletion/retirement of a container with finite substance remains blocked. Explicit Player Character, Race NPC, Creature NPC, and Campaign permanent deletion removes substance rows before inventory parents.

## Firearms, permissions, and UI

The calculator continues reading specialized magazine rounds, firearm rounds and attachment relationships. Attached magazines contribute once through the firearm assembly; loaded rounds are not general content rows. Magical external weight wraps the calculated contents assembly without changing rounds, attachments, readiness, acquisition costs or specialized state. Existing Loose-only manipulation rules remain in place.

Substance mutations reuse the containment authorization, Character/combat locks and optimistic commerce version boundary. Players manage their own Character; G.O.D. authority and catalog authoring authorization are unchanged. General movement and substance adjustments remain blocked in active combat/Freeze.

The shared Item/Equipment Overview authoring section now exposes the rules with field guidance and client/server conditional validation. Unlimited modes hide numeric capacities; fixed weight requires its value; normal time hides applicability/ratios; infinite mode hides finite quantity/density fields. Both catalog scopes use the same component.

Existing Character/NPC Inventory controls show capacity modes, external loaded weight, magical restrictions, selective time, future living capability, source identity and quantities. Expandable contents and the carried-weight display use the same calculator. Add/draw controls remain in each existing inventory row. No separate magical inventory page was added. Browser checks cover desktop and 390px layouts.

## Validation

All database writes below used fresh disposable PostgreSQL clusters. Browser runs used disposable accounts, local Next servers and headless Chrome. Artifacts/logs are local under `artifacts/container-pass-three*`, ignored by Git.

| Check | Result |
| --- | --- |
| Focused pure magical rules | 31 passed (included below) |
| Item, Character, lifecycle, combat screen, firearm, Freeze, shop unit/source suites | 563 passed |
| Final physical containment database suite, including magical rules/sources | 53 passed |
| Container browser run and then-current database cases | 53 passed; no page errors |
| Pass 1 containment database | 32 passed |
| Containment lifecycle matrix, including stored magical substances | 11 passed; final fixture rerun passed |
| General lifecycle, Skill framework reference, Tabletop lifecycle database | 1 encompassing test each passed |
| Magazine inventory database | 8 passed |
| Combat firearm database | 69 passed |
| Combat Item/Ability use database | 3 passed |
| Combat Freeze database | 5 passed |
| Firearm readiness and attack database | 1 encompassing test each passed |
| Magazine catalog/setup database | 5 passed |
| Shop commerce database | 1 encompassing test passed |
| Shared Item/Equipment authoring database/browser | 1 encompassing test passed |
| Typecheck, changed-file ESLint, production build | Passed |
| Drizzle check and snapshot chain/table-diff review | Passed |
| `git diff --check` | Passed |

Focused coverage includes independent unlimited dimensions, nesting, external weight, combined restrictions, unknown relevance, selective/nested time, finite/infinite sources, stale/concurrent operations, occupied removal, invalid catalog changes, move/draw out, permissions/combat, unchanged loaded specialized state, and root lifecycle cleanup. Browser exercises mundane-only rejection, unrestricted acceptance, weightless/nested containers, suspended time, living capability display, infinite flask authoring/drawing, invalid fixed-weight feedback, Player/G.O.D. paths, save/reload and mobile layouts. Screenshots were visually reviewed. Automation is not human acceptance or cross-browser testing.

## Files changed

- Schema/migration: `src/db/container-schema.ts`, `drizzle/0069_magical_container_rules.sql`, `drizzle/meta/0069_snapshot.json`, `_journal.json`.
- Domain/runtime: `container-rules.ts`, `container-physics.ts`, `container-catalog-service.ts`, `inventory-physical-service.ts`, `inventory-containment-service.ts`, `containment-ownership-service.ts` under `src/features/items/`.
- UI/actions: shared `item-workspace.tsx` and new `container-rule-fields.tsx`; existing `inventory-location-actions.ts` and `inventory-location-controls.tsx`; shared `field-help.ts`.
- Lifecycle: `campaign-delete-plan.ts`, `lifecycle-service.ts`.
- Validation: `container-magic.test.ts`, `container-physics.test.ts`, migration journal expectation; existing physical database/browser and lifecycle fixtures; new `container-magic-db-cases.mjs` and `container-magic-browser.ts`.
- Handoff and local artifact exclusions: this document and `.gitignore`.

## Before Pass 4

Review and approve Pass 3. Apply migration 0069 to the intended environment only through the separately authorized migration workflow. Decide combat retrieval/stowing costs and access rules before implementing them. Future timed systems need interval settlement/history design; living containment needs its own entity ownership/environment design. Substance transfer/consumption, additional units, mixing, environmental effects and magical destruction/portal behavior remain out of scope.

STOP after the separate Pass 3 commit. Pass 4 is not started.
