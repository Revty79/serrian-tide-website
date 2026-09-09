# Combat screen implementation and playtest handoff

Starting commit: `db79bf41db3be1a56fe22709a02940e8ae2654dd`. Verified clean `main` tracking the same `origin/main` before implementation. The completed backend and history are retained. No production deployment or ordinary campaign-data mutation is authorized or performed by this assignment.

## Stage 1: shared screens and live state

The new screens mount from the existing Tabletop pages. G.O.D. navigation stays **Scene → Encounter → Open Combat**. Back to Scene retains Campaign, Session, Scene and Encounter selection. Player Tabletop supplies an Open Combat link for the selected Character's active encounter and retains links to historical encounters. The view can occupy the full available width without replacing Scene locations, Shops, checks, or other Tabletop tools.

The shared screen uses existing theme variables and controls, compact selectable combatant cards, authorized resources and location HP, one selected-action/detail window, a command menu and target selector. Availability and prompts come from the authoritative projection. All cards remain selectable. Freeze/Resume, final-state inspection, authorized recent activity/history, and setup through existing roster/start/Initiative enrollment actions are connected. No portraits are introduced.

The existing live subscription accepts an optional reload callback. Combat reloads its state in place rather than remounting the screen. Selection, target, command, focus, scroll and open details survive normal React updates. Obsolete responses cannot replace newer selected-entity reads. Reconnect/stale state disables mutations until fresh information arrives. Reads allow Player bootstrap before Initiative enrollment while ordinary combat mutations retain their existing enrollment requirement.

Stage 1 committed and pushed as `d059069`. Validation: production build and TypeScript passed; all 1,261 preexisting unit tests passed; three focused prompt-state regressions passed; ESLint passed after correcting one JSX apostrophe; `git diff --check` passed. The user encountered a transient JSX fragment parse error during editing; the fragment was corrected and the production build subsequently passed. Full gameplay commands are Stage 2; browser/server scenarios and visual inspection are Stage 3. Human tabletop playtesting remains subsequent work.

## Stage 2: gameplay connection

The selected-action panel connects exact authored/owned sources, authoritative preview, declaration and percentile Roll in one transaction, existing digital rolling and physical 00 = 100, source resolution rulings, actual-anatomy Called Shots, spell target groups and location applications, movement/flee intent, Hold/Pass, legitimate defenses, and firearm mode/Aim/duration/preparation. Source drafts remain local across live reads. Retry receipts retain original requests; Initiative advancement uses the observed engine state token.

G.O.D. controls connect response confirmation, Player ruling requests, routine consequence application, specific damage/effect rulings, participation and current-condition rulings, spell recovery and temporary-revival expiration, explicit unfinished-work recovery, and XP closeout. Closeout previews use the established XP allocation functions and close Initiative plus the Encounter in one transaction. Existing services enforce all ownership, timing, Freeze, and duplicate-award boundaries.

**Add Creatures** appears on the selected Scene Encounter and in combat setup. It uses `spawnEncounterCreatures` to create exact direct occurrences, never an NPC. The picker retains its request on an uncertain response, supports quantities and late Initiative enrollment, and preserves each occurrence's resources/history. A focused database case verifies three distinct occurrences, retry reuse, and an unchanged Character/NPC row count.

Small engine integration corrections: read-only command preparation reuses the declaration/defense builders; controller equipment reads can inspect their own sources during sealed choices while unrestricted retained workspaces remain gated; G.O.D. can confirm a Player's already completed routine result without choosing the Player's action; Called Shot requests accept exact owned stack weapons; exceptional responders accept signed direct-Creature identities. Screen commands require explicit missing source timing, and firearm previews omit internal target HP/anatomy snapshots.

Stage 2 validation: TypeScript, production build, focused ESLint, all 1,264 unit tests, the full disposable combat service suite including four new screen-command cases, Drizzle migration consistency, and `git diff --check` passed. One new test initially expected 7 damage; the established 4 base + 2 additional-success calculation correctly produced 6, and the test expectation was corrected. No gameplay formula changed for that test. No migration, reset, or ordinary campaign-data mutation was needed. Actual browser scenarios remain Stage 3.

## Stage 3: executable screen verification

Pending. Only actual browser interactions will be described as screen verification; service and unit tests are reported separately.
