# Worlds Creator Experience Repair C: Politics

Repair C completes the eight political workshops using the approved A2/B creator experience. Focused technical validation is complete. Independent technical review and owner experience acceptance remain pending; stop at this checkpoint. Repairs D–I, Realm-to-Map linking, Phases 6–8 and gameplay integration require separate authorization.

Starting commit: `683cee206fbd4488d7ab0b570c52f6364fb62f6c`. The checkout was clean and matched the approved Repair B checkpoint before C began. A2, B, historical reports and 5B privacy protections are preserved.

Release commit: the separate commit containing this report, resolved with `git log -1 --format=%H -- docs/reports/worlds-creator-repair-c-2026-10-11.md`. The completion handoff and ignored `artifacts/guidance/worlds-c-commit-receipt.json` record the exact SHA and Git synchronization result. The owner separately authorized push and sync after completion. Deployment and shared database/service changes remain unauthorized.

## Completed experience and scope

All 68 actual typed fields retain their storage identities, unrestricted authored prose, blank values and existing protection. The inventory still contains 32 creators, 300 typed fields, 23 shared draft keys and 13 supporting forms. No field, table, relationship rule or saved source was removed or added.

| Creator | Fields | Subject sections before the shared supporting sections |
|---|---:|---|
| Polities | 6 | Political identity; foundations and legitimacy; continuity and change |
| Governments | 17 | Identity and foundations; authority and ideas; laws and decisions; leadership and succession; resources and communities; reform and disagreement |
| Governing institutions | 6 | Identity; responsibilities and powers; structure; development |
| Political offices | 7 | Identity; duties; selection; continuity |
| Office appointments | 7 | Appointment; selection; succession; evidence |
| Territorial claims | 7 | Claim; assertion; control; evidence |
| Diplomatic agreements | 8 | Agreement; terms and obligations; acceptance and renewal; interpretations and sources |
| Political conflicts | 10 | Conflict; causes; coalitions; course; aftermath |

Each also provides connected creations, places and jurisdiction, political periods and perspectives, History, original details and private notes. Natural questions, optionality and question-mark explanations replace catalog labels. Examples remain guidance and are never inserted into saved answers. All eight can begin with a name alone. No familiar political system, fixed border, conventional officeholder or agreed outcome is required.

Changes are concentrated in `politics-composition.ts`, the shared `creator-composition.ts` registry, `political-period-fields.tsx`, and the existing Pilot editor/profile/connections/History/geography and Peoples workspace components. They reuse `CreatorWorkshop`, shared field help and semantic theme styling. Earlier A2/B compositions stay available. Future creators remain in their existing editors.

## Supporting forms, preservation and security

- Real saved governments, offices, holders, polities, civilizations, organizations and other creations retain their IDs, searchable descriptions and author-written roles. Appointments, claims, agreements and conflicts retain the existing requirement for real identities when a connection is added; uncertain claims remain narrative. Several holders and competing authorities remain possible.
- Related political creation uses the full subject workshop in the single modal. Read/return preserves the parent draft. Failed child saves retain their draft and request UUID. A failed choices refresh retains the successful child ID and retries the read; it does not create again. A separately saved child survives parent cancellation.
- Political periods preserve stable IDs, order, authored status, accounts, perspectives, independent optional endpoints, overlapping descriptions and protection. Inactive-section validation reveals the nested invalid date. Unknown endings do not imply continuation; appointment, claim, account and event dates remain distinct.
- Existing Atlas associations, optional destinations, custom details, protection, private notes and original calendar notation remain editable and readable. Political field-protection controls are retained. Saved profiles group the actual prose and display genuine related-creation, Atlas and History links.
- History selection, correction and archival reading retain the actual event identity, exact cited event/era versions and calendar source. Current event reading remains distinct from a retained citation. Branch edits require the existing explicit source-inclusion decision and leave Primary unchanged. HTTP failures, revision conflicts, archive/restore and immutable sources retain the existing domain behavior.
- Ordinary knowledge remains a filtered preview inside a private World. Protected fields/notes/periods/custom details are redacted; a relationship that would expose a protected identity is withheld. Administrator review is explicit and read-only. Foreign G.O.D., Player and anonymous requests remain denied.

Server domain services, authorization, API write semantics, database schemas and migrations were not changed. Political prose does not establish actual control, a recognized officeholder, treaty compliance, generated History or gameplay effects.

## Validation and receipts

Successful checkpoints from the same application implementation were retained across harness corrections, rather than repeating completed families. The only application edit after browser acceptance was a punctuation correction in the private-introduction caption; the final isolated production build and lint cover that copy change.

| Check actually run | Result and ignored local evidence |
|---|---|
| Targeted TypeScript | Passed; `artifacts/guidance/c-typecheck-development.log`, `c-typecheck-prebrowser.log`; production builds also ran Next TypeScript verification |
| Political domain/composition and representative A2/B composition tests | 19/19 passed; `c-focused-domain.log` |
| Lint of all changed application and harness files | Passed with zero warnings/errors; `c-lint-completion.log` |
| Actual schema/field/storage inventory and six status dimensions | Passed; `c-inventory-final.log` |
| Name-only creation, rich unchanged save, all 68 field edits, complete draft comparison, reload, saved readers, archive/restore for all eight | Passed; `c-acceptance-1.log` checkpoint and `worlds-repair-c-acceptance-1/c-preservation.json` (eight comparisons) |
| Existing-government reuse/read; saved-ID validation; full related creation; failed save/refresh retry and UUID retention; parent cancellation; no duplicate child | Passed; `c-acceptance-2.log`, `worlds-repair-c-acceptance-2/c-checkpoints.json` |
| Nested period-date validation, independent unknown ending, actual two-tab revision conflict, explicit reload, failed HTTP save and retry | Passed; same attempt-2 receipts |
| Canonical History/calendar preservation, retained/current readers, archived event navigation, explicit branch source inclusion, child interpretation and unchanged Primary | Passed; `c-acceptance-3.log`, `worlds-repair-c-acceptance-3/c-checkpoints.json` |
| All eight ordinary responses, protected linked identity, explicit read-only Administrator review and denied writes; foreign G.O.D./Player/anonymous denial | Passed; attempt-3 receipts |
| Native-touch browser creation/edit/preview/save/reload for government, appointment, claim, agreement and conflict | Passed at 390×844; help opens without changing prose; no browser page errors |
| Short and constrained layouts | Passed for those five at 390×320 and 720×450 with visible save/cancel, usable content area, touch-sized actions and no horizontal page overflow; screenshots in attempt-3 directory |
| Shared A2/B regression journeys | Individual, Cosmic Principle, Language and Personal Relationship edits passed exact full-draft preservation; Cosmic preview also checked at 720×450 |
| Desktop and visual inspection | Agreement terms/preview inspected at 1440×900; phone agreement and short appointment screenshots inspected |
| Isolated production build | Passed during focused acceptance and again after the final copy correction; `c-production-final.log` |
| Unrelated runtime, Campaign and catalog snapshot comparison | Passed in the completed focused runner; `c-acceptance-3.log` |

The first browser attempt passed all eight creators before its harness tried to fill a hidden related-government field without navigating to Laws & decisions. The second passed connections and recovery before its branch harness omitted the required Include complete source decision. These attempts failed as a whole and are not represented as passing full runs. Their successful checkpoints were preserved. The harness now performs the actual navigation and explicit source decision, and reruns only unfinished phases. No application failure was found in either interruption, and meaningful assertions were retained. The final build initially could not retrieve the existing Google Fonts inside the restricted sandbox; `c-production-final-sandbox.log` preserves that environment failure. Only the build was retried with permitted network access. Aggregate evidence is recorded in `artifacts/guidance/c-completion-evidence.json`.

Per the revised policy, the 2,000+ feature suite, full disposable application integration, account lifecycle and unrelated gameplay suites were not rerun for C. Their earlier B receipts are historical evidence, not current C results. The next planned broad checkpoint is after separately authorized D; actual future domain/security/persistence/migration/History changes can require wider checks sooner.

Touch evidence comes from Chromium with mobile and touch enabled. A physical phone, operating-system keyboard, browser zoom and assistive technology were not verified. The constrained viewports exercise reduced space; they do not prove those device-specific behaviors. Owner comfort and look-and-feel acceptance remain separate from technical checks.

## Release readiness and recovery

There are zero new migrations, dependencies or deployment configuration changes. The migration journal remains 122 entries in order, ending at idx 121, `0121_worlds_living_skies`. Disposable acceptance applied the existing journal in order; it did not run the broad upgrade-integration suite. C introduces no new upgrade step. Existing saved political records were exercised through rich fixtures with all current typed and supporting information.

The checkpoint is ready for authorized Git push/sync and independent review. No known required focused check remains failing. Production activation still needs separate authorization and the independent review decision.

For a later authorized deployment, select the exact reviewed commit, verify the target and its applied migration ledger, retain a verified backup and the running release, apply only actually pending committed migrations in journal order, build before activation, then smoke-test authenticated political creation/reading, ordinary protection and explicit Administrator review. Do not use schema push or assume the live ledger matches this checkout.

Because C preserves the schema and existing write services, returning to approved B is schema-compatible and does not undo saved political identities, related children or History writes. Retain those writes; do not restore a database merely to change presentation. A Git revert never reverses database changes. Prefer a reviewed forward fix, or restore a verified backup only through the established operator recovery process with writers stopped and later writes reconciled.

Suggested independent walkthrough: create a polity and government, reuse that government for an office, record a contested joint appointment, describe an asserted claim without control, write a disputed agreement and unresolved conflict, add overlapping protected periods, reuse/correct History, inspect retained evidence and an explicitly included alternate source, then create a related government and cancel its parent. Review ordinary and Administrator reading, desktop and phone sections, guidance and save recovery. Do not begin D during this review.
