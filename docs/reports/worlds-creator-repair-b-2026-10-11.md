# Worlds Creator Experience Repair B

Repair B applies the owner-approved A2 workshop standard to the ten existing Peoples, societies, origins and personal relationship creators. Human look-and-feel acceptance of B remains pending. Repairs C–I, Realm-to-Map linking and Phases 6–8 are planning context only.

Starting SHA: `98c4eafe1a0f68445a867445aef7dcad62f5c49c`. The checkout was clean and exactly matched the approved A2 checkpoint before work began.

Ending SHA: the separate local commit containing this report, resolved by `git log -1 --format=%H -- docs/reports/worlds-creator-repair-b-2026-10-11.md`. The final handoff and ignored `artifacts/guidance/worlds-b-commit-receipt.json` record the exact start/end SHAs after commit. No push or deployment is included.

## Changes and coverage

The existing inventory was checked against the actual field catalogs, domain schemas, storage columns and components before editing. All 70 typed fields across these ten creators have a reachable, subject-specific question and guidance. The overall inventory remains 32 creators, 300 typed fields, 23 shared draft keys and 13 supporting forms. No saved field or database table was added or removed.

| Creator | Sections and retained depth |
|---|---|
| Races/species | Identity/existence, life/propagation, traits/surroundings, change/variation; all 12 fields including classification, form, biology, propagation, development, aging, adaptations, habitats, supernatural qualities, traits, variations and transformations |
| Peoples | Shared identity, heritage/differences, ways of life; all six fields |
| Origin accounts | The origin story, sources/perspectives, real subjects/creators/sources; all three fields plus the required narrative account and saved subject |
| Personal relationships | Meaning, multiple participants, changing periods/perspectives; both fields and every period subfield |
| Cultures | Identity/belonging, customs/values, expression/knowledge, exchange/change; all 11 fields |
| Civilizations | Identity/foundations, institutions/daily life, knowledge/accomplishments, interactions/renewal; all nine fields |
| Languages | Identity/communication, representation/variation, origins/development; all eight fields including nonverbal methods, optional writing, dialects and revival |
| Populations/communities | Community/surroundings, numbers/differences, growth/migration; all seven fields with narrative estimates and uncertainty |
| Beliefs | Ideas/claims, interpretations/origins, expression/observance; all six fields |
| Traditions/practices | Practice/meaning, teaching/transmission, origins/versions; all six fields |

Every family also keeps connected creations, places/movement, History, original details and private notes. Sections are freely navigable. `CreatorWorkshop` retains one native modal, a central scroll area, persistent save/cancel controls, draft preview, native focus behavior and touch-sized actions. Subject introductions explain the concept before its controls. All interface appearance uses the shared semantic theme.

Concrete examples:

- Races/species: generic “Creator classification” becomes “What kind of beings are they?”; “Reproduction or propagation” becomes “How do new beings come into existence?”, explicitly allowing construction, division or memory without requiring human biology.
- Languages: “Communication method” becomes “How does it communicate meaning?”, with ordinary-language advice allowing light, touch or other methods. Writing remains optional.
- Relationship periods: “Period 1 label” becomes “Give this period a name”; account/perspective become “How was the relationship during this time?” and “Who describes it this way?”. Dates sit under “Dates, if known”. Status, beginning and ending stay independent; unknown endings never imply ongoing relationships.
- Origin accounts: the story, its explanation, its perspective and its attributed sources have separate purposes. Validation points to the missing story, saved subject choice or subject role instead of a generic form error.

Examples remain guidance. New records do not save examples, infer ancestry, assign cultural traits/languages/beliefs or create History automatically. Eight families begin with a name alone. Origins retain their legitimate account/saved-subject requirement; relationships retain their meaning/two-participant requirement. Unusual, artificial and nonphysical beings remain possible.

## Supporting forms and save guarantees

| Supporting information | Repair B behavior and preservation |
|---|---|
| Connections | Subject-specific add actions, relevant searchable saved choices with available descriptions, several connections, authored roles and notes, unresolved narrative accounts and protection. Selecting a later identity retains the earlier uncertain wording in its account. No placeholders or inferred identity duplicates. |
| Origin subjects/sources | Several actual saved subjects, attributed creators/progenitors and sources; uncertainty and competing accounts stay separate. A saved subject still uses the established subject role. Other kinds remain available through custom connections. |
| Related creation/read/return | B families use their complete repaired workshop inside the single modal, including when created from A2. Parent draft, section and return behavior stay intact. Save boundaries are explained before/after saving. Failed child saves keep their draft/request identity; failed choices refresh keeps the saved child ID and retries a read, without another create. Cancelling a parent does not undo a separately saved child. |
| Relationship periods | Stable IDs, order, original labels/status, independent optional beginnings/endings, precision, accounts, perspectives, overlapping/conflicting descriptions and protection. Reversed nested ranges reveal the actual invalid endpoint inside its disclosure. |
| Geography/migration | Existing Atlas identities, optional destinations, authored place meanings/accounts, dates, protection, stable association IDs and real reader links. A movement description does not invent a route or historical event. |
| Historical events | Connect an existing event, write a new event or correct a saved event. Event IDs/revisions and other participants remain authoritative. Account, relationship-period, place and event dates remain distinct. The connection action now explicitly carries the existing event's original calendar notation rather than omitting it. |
| Retained historical evidence | Exact entity/version pins remain unchanged through unrelated edits. Retained cited-version reading differs from current event reading. Both events and eras remain available; archived historical events retain real History navigation. |
| Chronology/calendar notation | All precision kinds, original account/event notation, calendar version/revision and independent endpoints remain reachable. Original saved source details remain available. No unknown date is promoted to exact. |
| Original details | Custom titles/bodies/protection/order/IDs and explicit add/remove; invalid inactive titles route to the actual question. Historical-name storage remains Individual-only; other name histories retain their existing narrative/custom homes. |
| Privacy | Whole identities, connections, places, relationship periods, custom sections, events and private notes retain server protection. B does not invent new per-field protection rules. A2's existing field/name protection remains intact. Ordinary knowledge is a filtered reading preview of a private World, never publication. Administrator review requires explicit authorization and stays read-only. |
| Branches, conflicts and archives | Existing stable identities, immutable sources, authors/revisions, inheritance decisions, alternate interpretations, source adoption, archive/restore, request idempotency, HTTP failure retention and explicit conflict reload remain in the established domain services. Primary History is unchanged by branch edits. |

Saved profiles and draft previews share grouped subject presentation using only entered prose and authorized references. They retain connected identities/places, original date information, events, retained evidence, archived events, inverse related accounts, custom details and authorized private notes. Politics, organizations, other cosmology, skies and map authoring remain in their existing creators.

## Validation and evidence

Technical validation is complete for the Repair B review checkpoint. Independent technical review and the owner's hands-on experience acceptance remain pending. The interrupted checkout was resumed without resetting, cleaning or rebuilding the implementation. Every existing Repair B application source file remained byte-identical during this resume; only the browser harness and completion documentation changed.

Evidence was inspected before choosing the remaining tests. The latest prior production run, `artifacts/guidance/b-focused-browser-6.log`, had already passed the ten rich creators, all 70 typed field edits and full draft comparisons, saved readers, archive/restore, ordinary-response redaction, related creation/reuse/failure/return/cancellation, calendar-bearing History, retained versus current historical readers, origin/period validation, actual two-tab conflicts, HTTP-failure retention and alternate interpretations with unchanged Primary. It stopped afterward in a phone assertion because its broad CSS selector matched 25 elements. That was a test-harness failure, not an application failure. These successful checkpoints were retained rather than rerun.

| Check | Result and evidence |
|---|---|
| All ten creators and 70 typed field round trips | Prior production run passed; `b-focused-browser-6.log` |
| History, retained evidence, calendar notation and archived events | Prior production run passed; `b-focused-browser-6.log` |
| Recovery, focused validation and alternate timelines | Prior production run passed; `b-focused-browser-6.log` |
| Relevant disposable migration/service regressions | Preserved successful checkpoints in `b-focused-browser.log`, including Peoples, societies, Individuals, branch/source protections, privacy, calendars and immutable sources; that entire browser attempt later failed and is not represented as a passing full run |
| Worlds unit regressions | Preserved 138/138; `b-worlds-unit-final.log` |
| Application feature regressions | Preserved 2,023/2,023 across 235 files; `b-feature-unit-final.log` |
| Focused Repair B/A2 domain and composition | Preserved 10/10 and 18/18; `b-focused-final-domain.log`, `b-focused-composition.log` |
| Administrator account lifecycle | Preserved 1/1 disposable database test; `b-admin-account-db-final.log` |
| Coverage inventory, full lint and Drizzle consistency | Preserved successful receipts: `b-inventory-final.log`, `b-lint-final.log`, `b-drizzle-check.log` |
| Final isolated production build and TypeScript | Passed during resume; `worlds-repair-b-remaining-2-next.log` and `b-remaining-2.log` |
| Remaining phone/layout journeys | Passed all ten families during resume: touch create/edit/preview/save/reload at 390×844, footer/width checks at 390×320 and 720×450, positive native touch points, ten phone screenshots and an origin desktop screenshot |
| Remaining authorization | Passed during resume: all ten explicit Administrator readers lack author controls; a valid Administrator write is denied; foreign G.O.D., Player and anonymous API/direct-route access is denied |
| Resume harness lint, completed inventory and final diff hygiene | Passed; `b-resume-harness-lint.log`, `b-resume-inventory.log` and `git diff --check` |

The focused resume command is `node --conditions=react-server --import tsx scripts/worlds-pass-one-disposable.test.ts --creator-b-remaining`, with `SERRIAN_WORLDS_EVIDENCE_DIR=artifacts/guidance/worlds-repair-b-remaining-2`. It creates its own temporary local PostgreSQL instance and production build, seeds only fixtures needed by the unfinished journeys, then stops both and removes only its generated resources. It does not use a shared database. The fresh run exited 0 with no browser page errors; its measured results are in `artifacts/guidance/worlds-repair-b-remaining-2/b-remaining-results.json`. The runtime/catalog snapshot comparison also passed. `--creator-b-only` remains available for a separately requested complete B journey; it was not rerun during this resume.

The first resume attempt stopped at PostgreSQL `initdb` because the Windows sandbox could not create a restricted token. It ran no application checks. The permitted local execution retry passed. The earlier development-server unreadable response is retained in `b-focused-browser-5.log`; the subsequent production runs passed the affected saves. Neither failed attempt is counted as passing validation. No new application failure required an implementation change during this resume.

Development used focused domain/composition checks and narrowed browser journeys. Initial harness stops were retained as failed attempts: an archive/restore check read before the restore completed, a duplicate-count query used the wrong table column, and a related reader check matched the parent's existing heading before the reader opened. Those checks were corrected without weakening their data assertions. They are not counted as passing validation.

Phone verification uses headless Chromium with native touch emulation at 390×844, reduced height 390×320 and a 720×450 zoom-equivalent viewport for a 1440×900 display. It does not claim a physical phone, OS keyboard or native browser zoom test. The owner's experience review remains separate.

Evidence files are local ignored artifacts under `artifacts/guidance`; they are preserved for independent review. The start-of-resume file hashes are in `b-resume-initial-checkout.json`; `b-completion-evidence.json` collects the verified prior checkpoints, fresh results and receipt hashes. The inventory's interaction, guidance, reuse, reading, data/security and human-review dimensions remain separate; only the B technical verification statuses are completed.

## Deployment and recovery

There is no Repair B migration, new dependency or environment setting. The existing journal remains 122 entries, idx 0–121, ending at `0121_worlds_living_skies`. Finalized migrations were not rewritten. No shared DEV/Production database or service was modified.

After separate release authorization, verify the exact commit and target database identity/ledger, retain a verified backup and current release, then build/stage and activate this checkpoint through the existing operator-managed deployment process. The target must have the committed migrations through `0121`; if older migrations are pending, use the established backup/rehearsal process and committed journal order. Smoke-test these ten creators, A2, ordinary knowledge, explicit read-only review and selected alternate timelines before opening the release to authors.

Code rollback to the starting A2 commit is schema-compatible. It restores the previous B forms but keeps saved creations, related saves, authored event corrections and stable identities in their existing storage. Reverting code never undoes database writes. Prefer a reviewed forward correction; data recovery requires explicit reconciliation and the operator's verified backups.

Readiness: complete local Repair B commit for independent review. There are no known failing required technical checks. Human experience acceptance remains pending, and this checkpoint does not authorize push, deployment, shared database changes or Repair C. Stop here for independent review.

## Owner walkthrough

1. Create beings of remembered light. Describe propagation without birth or a fixed body; connect an existing people and culture. Preview, save and reopen.
2. Create a civilization with two cultures and languages, an uncertain founding account and a shared place. Confirm its cultures remain independent creations.
3. Write an origin account for an existing subject. Add several claimed creators, including an unresolved source. Keep disagreement in Sources & perspectives. Try saving after removing its subject meaning to inspect focused validation.
4. Create a personal relationship with two participants. Name an uneasy-friendship period, attribute it and leave its ending unknown. Add a competing period without resolving it.
5. From a culture, create a missing language, use its full communication questions, save it and return. Read it and return again; cancel the parent to check the separate-save boundary.
6. In History, connect an existing event and separately cite its account. Read the current event and retained evidence after a later correction. Inspect original dates and archived-event links.
7. Try Ordinary knowledge preview and explicit Administrator review, then repeat a workshop at phone width and reduced height. Human acceptance of B remains pending until this review.

The [coverage inventory](../architecture/worlds-creator-coverage.md) keeps six separate completion dimensions. Passing checks never marks the owner's look-and-feel review accepted. Stop at the B checkpoint; later passes need separate authorization.
