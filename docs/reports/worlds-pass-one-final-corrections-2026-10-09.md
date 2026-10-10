# Worlds Pass 1 final corrections

## Findings and corrections

**Era labels.** `historical-timeline.tsx` places each era button at its historical position with a margin and width. Its name is an absolutely positioned span. The button did not establish a positioning context, so the span used the positioned lane instead. Adding `position: relative` to `.eraBand` anchors the name and its maximum width to the actual band. Historical ranges, timeline calculations and date representations are unchanged.

The disposable browser regression uses six eras with overlapping ranges, different starts, an unknown beginning, an unknown ending and a single-year interval. It checks each label's actual `offsetParent` and bounding rectangle against its corresponding band, verifies distinct starts and the short band's minimum width, and repeats the bounds checks through zoom, button/keyboard panning, fit and pointer dragging at desktop and phone widths. Screenshots supplement these assertions.

**Classification visibility.** A code change was required. `item_tags_catalog` has shared tag IDs, names, groups and descriptions, but no creator/public visibility fields. That does not make every tag publicly discoverable. The established `itemTagDiscoveryWhere()` rule discovers tags used by active Items visible through the actor's Equipment/Inventory catalog preferences, plus server-read retained IDs. The original Worlds query filtered only the tag group, bypassing this rule and returning names/descriptions linked exclusively to foreign private Items, archived Items or no visible Item at all. Its save validation also accepted any Era/Genre ID.

Worlds now calls that existing predicate. Retained IDs come from stored classification associations on the actor's own worlds, including archived worlds. This preserves labels when their backing Items become unavailable and permits reuse of labels already available through owned worlds. Explicit, authorized Administrator review includes the retained labels of the other owners' worlds being reviewed. It does not grant unrelated private catalog discovery or permit assigning those review-only labels to the Administrator's own worlds. Server-side create/update validation uses the same owned-world discovery policy and rejects forged IDs atomically. No second tag catalog, catalog permission change or migration was added.

## Exact files changed

- `src/features/worlds/worlds.module.css`: establish the era band's positioning context.
- `src/features/worlds/world-service.ts`: visibility-aware tag discovery, server-derived retained selections, explicit Admin review scope and save validation.
- `src/app/api/worlds/route.ts`: pass the authorized registry scope to reference discovery.
- `src/app/worlds/page.tsx`: use the same reference scope as the gallery.
- `src/app/worlds/[worldId]/page.tsx`: preserve retained labels in explicit Admin workspace review.
- `scripts/worlds-pass-one-disposable.test.ts`: measured layout regression; both G.O.D. users/Admin tag fixtures, service/HTTP privacy and retained-selection assertions; expand the unchanged-data snapshot to Heavens content and permissions.
- `docs/reports/worlds-pass-one-final-corrections-2026-10-09.md`: this correction report.

`historical-timeline.tsx` was inspected and required no code change. The Registry interface was not redesigned. Homepage commit `86be939` remains intact.

## Verification

Executed checks:

- `npm.cmd run validate:worlds`: 10/10 passed.
- `npm.cmd run validate:navigation`: 42/42 passed.
- `npm.cmd run validate:catalog-visibility`: 13/13 passed.
- `npm.cmd run validate:appearance`: 12/12 passed.
- `npm.cmd run validate:worlds-disposable`: passed the migration rehearsal, fresh production build/TypeScript verification, service and HTTP privacy/retention assertions, measured era-label regression, persistent edits, failed-save drafts, two-tab conflicts, mobile authoring and archive/restore.
- `npm.cmd run validate:catalog-visibility-db`: 52/52 passed across seven existing suites, including 11 direct catalog/Campaign privacy tests. Fresh migration and upgrade rehearsals also passed. Existing harness warnings about experimental module mocking and an unset Better Auth URL did not cause failures.
- `npm.cmd run validate:password-recovery`: passed its separate production build and browser/database checks for keyboard show/hide controls, every role's recovery setup, password confirmation, hashed/single-use recovery codes and tokens, expiry, session invalidation, anonymous phone recovery, CSRF and rate limits.
- `npx.cmd next typegen`: passed.
- `npm.cmd run typecheck -- --incremental false`: passed.
- Focused ESLint: passed with no warnings.
- `npx.cmd drizzle-kit check`: passed.
- `npm.cmd run validate:migration-ledger`: 99 journal/DEV ledger entries match, ending at 0098; read-only check.
- `git diff --check`: passed.

The Worlds rehearsal compared its before/after snapshot of Campaign clocks, sessions, combat-related state, Form/Evolution tables, Heavens roots, Item tag metadata/links, user roles and catalog preferences/activation. These were unchanged. Every existing historical date representation and revision/conflict rule remained covered. No browser runtime errors occurred in the authoring flow. Database/browser tests used generated local temporary PostgreSQL URLs and did not connect to Production. Password-recovery and homepage source files have no changes relative to `86be939`.

## Screenshot review and scope

Visually inspected the final `worlds-era-labels-desktop.png` (1440×900) and `worlds-era-labels-mobile.png` (390×844), plus `worlds-classifications-desktop.png` and `worlds-classifications-mobile.png`. Names follow their differently positioned bands, overlapping eras remain on separate rows, and open-ended bands keep their dashed outlines. Short bands ellipsize names within the band; full names remain in their accessible button text and details. Phone pages do not overflow horizontally, and the existing classification picker remains usable above its footer. Artifacts use disposable fixture data under ignored `artifacts/guidance/`.

No remaining blockers were found. No deployment, Production migration or remote push was performed. Calendars, Atlas and Pass 2A remain outside this correction pass; work stops here for review.
