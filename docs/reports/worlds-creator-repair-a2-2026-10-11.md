# Worlds Creator Experience Repair A2

A2 completes the Individual and Cosmic Principle pilot composition for independent review. The user approved the direction of the Cosmic Principle workshop and requested refinement throughout before wider rollout. Human acceptance remains pending. Repair B and Phase 6 have not begun.

Starting SHA: `440fffcca807cc4fc20b7130ceb063a44c9f4061`, the separately tested and committed 5B History context/privacy correction. Historical Repair A reference: `d694718d587a484bf11b8a9284cb5aefc515e061`.

Ending SHA: the local commit containing this report, resolved by `git log -1 --format=%H -- docs/reports/worlds-creator-repair-a2-2026-10-11.md`. The exact start/end SHAs are also recorded after commit in `artifacts/guidance/worlds-a2-commit-receipt.json` and the user handoff. No remote push or deployment is included.

The migration journal remains 122 entries, idx 0–121, ending at `0121_worlds_living_skies` (timestamp `1791734050496`). A2 changes no tables, persisted field sets, dependencies or configuration, and rewrites no finalized migrations.

## Concrete changes

| Before | A2 |
|---|---|
| “Period 1 label”; “Name this period or interpretation. Its saved account ID survives later revisions.” | “Give this period a name”, with examples such as Before the Second Moon Shattered and The Years of Fading Magic. Examples stay in help and are never saved defaults. |
| Generic period account and provenance controls mixed with circumstances | “How did the rule work during this time?” and “Who describes it this way?” in Through history. Circumstances explains triggers; History explains events. |
| State, reliability and missing endpoints could be confused | State accepts original wording independently of account certainty. Beginning and ending are independently optional. Unknown endings do not imply an active rule. Conflicting/overlapping accounts, order, IDs and protection are preserved. |
| Generic target/role cards for routine connections | Relevant searchable culture, language, ancestry, person, realm and body choices, selected names/descriptions and optional notes. Custom roles and choice kinds remain available under More about this connection. |
| Related pilot creation could lead back to a legacy form | Related pilots use the same section composition inside one modal. Non-pilots use a bounded, valid World-native name/introduction/visibility save and retain a path to their fuller standalone details. |
| Existing historical sources could be mistaken for participating events | Connect an existing event, cite its retained version, and write a new event are separate actions. Current event reading differs from the retained cited-version reader. Corrections keep the same event ID and its participants. |
| Nested validation relied on display-label strings | Technical draft paths select the correct section and control, open surrounding disclosures and focus the invalid input. Nested dates route to the failing endpoint. |

Ordinary knowledge is described as a reading preview inside a private World. It publishes nothing. Server-filtered identities, descriptions, fields, references and counts remain authoritative. New picker descriptions omit protected description fields in ordinary responses. Administrator access still requires explicit review and remains read-only.

Reading and preview share grouped pilot presentation: actual prose, independent names/periods/accounts, authored connection roles and notes, places, historical events, retained citations, original dates and private author context. Saved reading keeps genuine History/Atlas navigation, archived events, inverse related accounts and calendar source details. Preview invents no statements, dates, ancestry or scope.

Parent drafts, selected section, choices and central scroll position survive related read/create/return. Related saves are explained before and after saving. A saved child remains saved after parent cancellation. If reference refresh fails, its ID is retained immediately; Refresh saved choices retries a read without issuing another create command. Failed related saves retain the draft and its request identity.

## Full two-pilot coverage checklist

Every catalog field retains a reachable destination and subject-specific guidance. Rich saved fixtures are compared before/after unchanged saves and edits in every applicable section; all other fields and advanced references are compared exactly. The browser journey edits representative fields in each section, rather than claiming a manual edit of every text field.

| Individual area | Covered fields / workflow |
|---|---|
| Identity and perception | Name; biography overview; aliases, titles, identity, classification, reputation |
| Existence | Form, existence, distinctions, transformations, aging; original and nonbiological beings, unknown origins |
| Personality | Personality, values, beliefs, motivations, goals, fears, habits, strengths, weaknesses |
| Knowledge and development | Education, experience, communication, discoveries, talents, narrative skills |
| Social identity | Affiliations, citizenship, occupations, community, protected private reputation |
| Personal history | Origins, development, experiences, achievements, failures, returns, competing accounts |
| Historical names | Name, kind/use, meaning, perspective, date precision/endpoints, protection, order and stable ID |
| Connections and places | Multiple saved cultures/languages; species and important people; uncertain ancestry without placeholder creation; custom roles; optional connection notes/protection; place/destination/meaning/account/date/protection and retained IDs |

| Cosmic Principle area | Covered fields / workflow |
|---|---|
| The rule | Name, optional summary, classification, statement |
| Where it applies | Narrative scope; saved realm/body/belief/person/custom links and Atlas places; no inferred physics or geography |
| Circumstances | Conditions/triggers, distinct from historical periods and events |
| Through history | Development; each period's label, state, account, perspective, optional beginning/ending, confidentiality, order and stable ID |
| Exceptions | Exceptions and contradictory laws |
| Different accounts | Interpretations, provenance and attributed evidence; disagreement remains unresolved |

| Both pilots | Covered workflow / preservation |
|---|---|
| History | Link an existing event without a duplicate identity; explicitly write/correct an event; title, account, event relation, notes, visibility, prominence/category, time, certainty, narrative state, eras, additional lore/place participants and archived event reading |
| Retained sources | Exact historical entity/version pins; retained cited-version reading, separately labelled current reading; source precision and provenance |
| Chronology/calendars | Independent account/event/place/period dates; original calendar endpoints/versions/revisions/notation; dating-system IDs/revisions; no inferred precision or rewritten date |
| Original details | Custom section title/body/protection/order/ID; clear optionality and retained prose |
| Privacy | Whole identity, field-level protection, private notes, protected connections/names/periods; ordinary server redaction, private-preview wording, explicit read-only Administrator review and foreign/Player denial |
| Reuse and related creation | Relevant choices, descriptions, multiple selections, unchanged custom roles, uncertain prose retained beside a later link; language/culture/realm/body bounded creation; related Individual composition; read/return, child cancellation, failed child save and failed-choice-refresh recovery |
| Save and navigation | Name-only creation; free section/preview changes; persistent footer; one modal; validation focus; retained HTTP-failure drafts; real two-tab revision conflicts; reload, archive/restore, alternate interpretation without changing Primary |
| Accessibility/layout | Native modal, help and Escape, focused validation, desktop, Chromium native-touch phone emulation, short height and zoom-equivalent layout |

No persisted value is simplified or normalized into a preset. Selecting a culture grants no languages or beliefs. Typing an uncertain ancestor saves prose only. Worlds remains independent of Campaign gameplay, Heavens records, combat, Character/Creature creation and future VTT integration.

## Validation and evidence

Confirmed checks:

- `npm run validate:worlds`: 133/133 passed.
- `npm run validate:unit`: 2,018/2,018 passed across 234 feature test files.
- Full `npm run validate:worlds-disposable`: passed fresh/populated migration rehearsals, all Worlds services, desktop/native-touch workflows, authorization, both 5B privacy regressions, and unchanged Campaign/combat/Form/Evolution snapshots. Evidence: `a2-final-integration-2.log` and `worlds-a2-final-2/`.
- Final `validate:worlds-disposable -- --creator-a2-only`: passed a fresh isolated production build/type generation and all pilot journeys, including the final error-path refinement, invalid saved-identity select focus and meaningful parent-scroll retention. These final changes concern validation feedback; the broader domain/privacy behavior remains covered by the full run. Evidence: `a2-release-pilots.log` and `worlds-a2-release/`.
- `validate:admin-account-db`: passed in its own disposable database; existing account-deletion isolation and atomicity remain intact.
- Standalone `tsc --noEmit --incremental false`, lint, `drizzle-kit check`, `drizzle-kit generate`, inventory verification and `git diff --check`: passed. Drizzle reports no schema change or migration to generate.

An initial touch-navigation attempt timed out while discarding a History draft. The full run subsequently passed the same native-touch regression without changing that form's layout. A diagnostic scope error in the test harness was corrected before the successful rebuild. Earlier logs remain available; neither initial interruption is counted as a passing run.

Evidence uses separate directories so historical Repair A and 5B receipts remain intact. The final pilot evidence is `artifacts/guidance/worlds-a2-release/pilot-browser-results.json` and `pilot-preservation.json`. Full-run evidence is in `artifacts/guidance/worlds-a2-final-2/`; its log is `artifacts/guidance/a2-final-integration-2.log`. The final isolated build log is `artifacts/guidance/worlds-a2-release-next.log`. The inventory audit is read-only so rerunning it cannot overwrite the human-maintained completion tracker with the historical allocation.

Testing uses headless Chromium with `isMobile` and `hasTouch`, including native tap actions at 390×844, a 390×320 short viewport and a 720×450 zoom-equivalent viewport for a 1440×900 display. This is browser emulation, not a physical phone or native browser zoom. VisualViewport keyboard support remains implemented; physical-device keyboard behavior and the user's experience review remain acceptance work.

## Deployment and recovery

This is a local, independently deployable application checkpoint. No A2 migration or new environment setting is required. A target must already have the existing ordered migrations through `0121`; confirm its identity and actual ledger first. If earlier migrations are pending, apply the committed journal in order using the established controlled deployment process, after backup and upgrade rehearsal.

After explicit deployment authorization: verify the release SHA, protect the running release and database backup, stage/build this commit, activate it through the operator's existing process, then smoke-test both pilots, existing History/calendar privacy, selected alternate timelines, and owner/Admin/Player access. No shared database or DEV process was changed during A2 testing.

Rollback to the starting commit is schema-compatible because A2 adds no persisted fields. It restores the earlier pilot UI while retaining the separate 5B privacy correction. It does not undo authored creations, child saves or event corrections made after deployment; those use existing domain storage. Reverting code never reverses database changes. Prefer a reviewed forward fix; use backups only with an explicit data-reconciliation plan.

Technical checks pass with no known deployment blocker and no new migration, configuration or later-pass dependency. The local checkpoint is ready for review and controlled release preparation. Push/deployment requires separate authorization. Human acceptance remains the next gate.

## Hands-on review

1. Create a Cosmic Principle named The Weight of Promises. Write the rule, select a realm, describe an exception and two conflicting accounts. In Circumstances, describe its trigger. In Through history, name a period, attribute it, and leave its ending unknown. In History, connect an existing event and read it; separately cite an account and read its retained version after saving.
2. Create a name-only Individual. Edit it into an unusual being; select multiple cultures/languages, describe uncertain ancestry, and connect a saved person and place. Read a connection and return. Confirm original prose remains alongside the links.
3. Create a missing language or realm from the pilot. Save it, return to the parent, read it, and cancel the parent to inspect the separate-save boundary. Create a related Individual to try the same pilot sections without another modal.
4. Preview, save/reload, then read the grouped account. Inspect dates, names, periods, citations and private notes. Try Ordinary knowledge preview and an explicit read-only Administrator review.
5. Add an unnamed custom section or reverse a date range, move to another section, and save. Confirm the error takes you to the right question and retains the draft. Try the workshop at phone width and with keyboard/help navigation.

The [existing inventory](../architecture/worlds-creator-coverage.md) now carries all six completion dimensions for 32 main creators and 13 supporting forms. B covers Peoples/societies/personal relationships; C politics; D organizations; E remaining 5A cosmology; F 5B skies/calendar connections; G complete-world acceptance. B–G require separate authorization; bounded related creation does not mark a non-pilot creator repaired.
