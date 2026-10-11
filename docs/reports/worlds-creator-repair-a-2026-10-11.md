# Worlds Creator Experience Repair A — completion and review

Starting SHA: `3e050fc8d860af6b965a6a95abae7a54dfad0707`.

Ending SHA: the distinct local Repair A commit adding this report. Resolve its exact value with `git log -1 --format=%H -- docs/reports/worlds-creator-repair-a-2026-10-11.md`. The local resolved completion report and final handoff contain the literal ending SHA after commit.

Repair A is technically complete and independently deployable from the Phase 5B baseline. Experience acceptance is provisional and awaits the user walkthrough. No remote push, deployment, shared database writes, Repair B or Phase 6 were performed.

## Delivered scope

The reusable CreatorWorkshop provides a centered responsive native dialog, freely selectable named sections, a central scrolling area, persistent save/cancel, retained drafts, keyboard/touch help and an unsaved profile preview. Whole-draft validation routes errors to their section and field instead of allowing hidden native controls to block submission. HTTP failures and stale revisions retain the draft; loading the latest record requires an explicit discard decision.

Individual now separates identity/existence, personality, background, people/communities, important places, History, original details and private notes. Every existing narrative field, historical name, ancestry/custom connection, place, custom section, protected field and private note remains available. Race/species, culture, language and person actions select World-native identities; unusual existence and uncertain ancestry remain valid. A name is enough to create an individual.

Cosmic Principle is introduced as a rule of reality. Its main statement follows its name, with optional kind and browsing summary, then separate scope, circumstances/periods, exceptions, competing accounts/evidence, History, original details and privacy. Realms, celestial bodies and Atlas places can be reused. The summary and statement are independently optional; the interface does not demand duplicate entry or enforce this lore in gameplay.

Related World-native records can be read or created in a controlled subview of the same window. The parent draft survives the return. The related save is separate and remains permanent if the parent is cancelled; the window explains this before and after saving. Typed unresolved wording is retained in the connection account when the creator explicitly selects a saved identity. Related non-pilot creators retain their complete existing form inside the subview. Atlas selections reuse existing places; Atlas authoring retains its existing workshop.

Existing History sources remain pinned; saved milestones are corrected through the same canonical event ID. Their date remains in the event. Account dates, relationship periods and event dates keep distinct meanings. Milestone notes and original calendar notation are accessible in the pilot History section, and an existing event can be read without navigating away from the draft.

## Complete coverage and remaining passes

The [Phase 4–5 coverage inventory](../architecture/worlds-creator-coverage.md) includes all **32 creators, 300 typed subject fields, 23 common draft fields and 13 subordinate forms**. Each field has an intent, existing-information reuse opportunity, control/help, actual saved location, destination and preservation rule. Memberships, appointments, roles, assignments, claims, agreements, conflicts, networks, cosmic connections, observations, cycle definitions/phases, calendar bindings, historical names/periods, geographic links, custom sections and milestone/source forms are included.

The [provisional workshop standard and acceptance checklist](../architecture/worlds-creator-experience.md) is linked from AGENTS.md. Proposed Repair B covers remaining Peoples and personal relationships; C covers politics/organizations and their subordinate creators; D covers remaining cosmology/astronomy. These allocations and the design require review. Other creators and saved library/detail presentation retain their existing working interfaces. No rollout or later pass began.

## Preservation and security evidence

The production browser harness opened existing detailed Aralyn and Stillness of the Quiet records, visited every section and saved unchanged drafts. It compared all persisted fields and advanced/protected values, then edited each applicable section and compared untouched fields, relationships, historical names, periods, protected fields, dates, calendar/chronology sources, milestones and version pins again. History reference and milestone collections were compared by stable identity, since their SQL read order is not authored order. Ordered name/period/custom-section/place/participant data retained its sequence.

The harness proved separate related saves, parent cancellation retaining the child, existing Race/language/person/realm/body/Atlas reuse, unresolved text retention, event correction with the same ID and no additional History event, section/preview retention, inactive-field focus, failed-save retention and real two-tab conflict recovery. Both pilots saved, reloaded, archived/restored and produced local alternate interpretations while Primary drafts remained unchanged.

Ordinary knowledge omitted private notes and kept editing unavailable. Other G.O.D./Player reads were denied; explicit Administrator review remained read-only. The full existing privacy/authorization suites also verified direct routes, HTTP ownership, protected names/counts/facets/URL selections, old immutable pins, transitive relationships, CSRF and private no-store responses. The final runtime snapshot comparison confirmed unchanged Campaign, combat, Form and Evolution data. No new server authorization or gameplay mechanics were introduced.

Local detailed evidence: [pilot browser checks](../../artifacts/guidance/worlds-repair-a/pilot-browser-results.json), [complete before/after drafts](../../artifacts/guidance/worlds-repair-a/pilot-preservation.json), and [compact versioned receipt](worlds-creator-repair-a-evidence-2026-10-11.json). These fixtures use disposable test data, not shared user data.

## Checks actually executed

| Check | Final result |
|---|---|
| `npm.cmd run validate:worlds` | 132/132 passed |
| `npm.cmd run validate:unit` | 2,017/2,017 across 234 feature files, including gameplay regressions |
| `npm.cmd run validate:worlds-disposable` | Full ordered fresh/populated migration, service, SQL, authorization and all prior/new production-browser workflows passed |
| Production Next build in isolated harness | Passed, including Next TypeScript verification |
| `npx.cmd tsc --noEmit --incremental false` | Passed |
| `npm.cmd run lint` | Passed without errors or warnings |
| `npm.cmd run validate:admin-account-db` | 1/1 passed on disposable PostgreSQL |
| `npx.cmd drizzle-kit check` | Passed |
| `npx.cmd drizzle-kit generate` | No schema changes, nothing to migrate |
| `git diff --check` | Passed before commit |

Production Chrome checks used desktop 1440×900, native-touch phone 390×844, a short 390×320 viewport and a 720×450 viewport corresponding to a 200% desktop zoom layout. Both pilot draft previews, saves and section controls were exercised. Desktop/phone renderings were visually inspected. A physical phone software keyboard and actual browser-UI zoom remain explicit human walkthrough items; headless touch emulation does not prove device behavior or wording comprehensibility.

Prior failed harness attempts identified ambiguous/obsolete selectors and assertions assuming History array order. Those checks were corrected to the new section navigation and stable event IDs; the final full run passed. Only final successful results are counted above.

## DEV availability

The existing service at `http://localhost:3000` responds: homepage 200, `/access` redirects unauthenticated users to login, and the session endpoint responds 200. Read-only DEV queries verified `serrian_tide_dev`, all six Living Skies tables and the applied 0121 hash matching committed SQL (`df8f7147548bafacc765e26148307145e4ec3415a92fa8bc7eab055492980899`). There is no DEV outage to recover. No DEV process was stopped/replaced, and no shared database or environment configuration was changed. Test application ports, build directories and PostgreSQL clusters were isolated; temporary generated type/config references were restored by the harness.

## Migration, compatibility and controlled release

Repair A requires **no migration, new configuration, dependency or environment variable**. The actual journal remains idx 121 / `0121_worlds_living_skies`, 122 ordered entries. Finalized migrations and schema files were unchanged. The full harness still rehearsed fresh installs, existing-data upgrades and safe reapplication through 0121, checking migration hashes and retained data.

When separately authorized to release: verify the exact Repair A commit and target identity; verify the applied ledger through Phase 5B; use the existing controlled deployment process and verified backup/current-release protection. A target behind Phase 5B must receive its existing pending migrations in journal order using the established operator procedure before this build. On a current Phase 5B target, build and activate the Repair A code, then smoke-test G.O.D. creation/editing, ordinary knowledge and explicit read-only Administrator review. This report does not authorize those actions.

Recovery to the starting Phase 5B code is schema-compatible: Repair A saves use existing fields and identities, and related creations remain normal saved World-native records. Reverting UI code does not remove those records, edits or History versions. Preserve data and prefer a forward fix. Rolling back further than Phase 5B has the compatibility restrictions documented for Living Skies. No database rollback is needed solely for this UI pass.

## Exact hands-on review

1. Open the existing DEV at `http://localhost:3000/worlds` and sign in as a G.O.D. World owner. Open a World you can edit; use a throwaway World for review creations.
2. Under Individuals, open a detailed individual and choose Edit record. Move through Identity, Personality, Background, People & communities, Important places, History, Original details and Private notes. Confirm your existing values and advanced/protected accounts remain. Compare the draft profile with the facts you entered.
3. Create a name-only individual. Add an existing Race/culture/language/person connection. Create a missing culture in its controlled subview, read it and return. Confirm the parent draft survives and that the related save is separate. Leave uncertain ancestry as an account rather than inventing parents.
4. Under Cosmology, choose Create cosmic principles. Name a rule and describe what it says. Visit Where it applies, When it applies, Exceptions and Different accounts; select existing realms/bodies/Atlas places where useful. Leave the optional summary blank if it adds nothing.
5. In either pilot, link an existing History source and correct an existing milestone in its event fields. Leave unrelated account dates/relationship periods unchanged. Save and reload to confirm one canonical event and the intended source notation.
6. Add an empty custom-section title, switch to another section and save. Confirm the workshop takes you to the title. Use two tabs to create a stale edit; confirm the draft survives until you explicitly load the latest record.
7. Try phone touch, keyboard Tab/Enter/Escape, open question-mark help, browser zoom and a software keyboard. Check that you can reach save/cancel, retain drafts across preview/sections and return from related records.
8. Review ordinary knowledge and explicit Administrator review. Decide whether the concepts, labels, examples and separate-save boundary make sense, and whether unusual creations fit naturally. Record improvements before authorizing wider adoption.

Technical blockers: none found after the final checks. Readiness: local release commit prepared for user experience review; remote push/deployment remain unperformed. Stop: Repair B–D and Phase 6 await separate direction.
