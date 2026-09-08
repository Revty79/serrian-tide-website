# Combat screen implementation and playtest handoff

Starting commit: `db79bf41db3be1a56fe22709a02940e8ae2654dd`. Verified clean `main` tracking the same `origin/main` before implementation. The completed backend and history are retained. No production deployment or ordinary campaign-data mutation is authorized or performed by this assignment.

## Stage 1: shared screens and live state

The new screens mount from the existing Tabletop pages. G.O.D. navigation stays **Scene → Encounter → Open Combat**. Back to Scene retains Campaign, Session, Scene and Encounter selection. Player Tabletop supplies an Open Combat link for the selected Character's active encounter and retains links to historical encounters. The view can occupy the full available width without replacing Scene locations, Shops, checks, or other Tabletop tools.

The shared screen uses existing theme variables and controls, compact selectable combatant cards, authorized resources and location HP, one selected-action/detail window, a command menu and target selector. Availability and prompts come from the authoritative projection. All cards remain selectable. Freeze/Resume, final-state inspection, authorized recent activity/history, and setup through existing roster/start/Initiative enrollment actions are connected. No portraits are introduced.

The existing live subscription accepts an optional reload callback. Combat reloads its state in place rather than remounting the screen. Selection, target, command, focus, scroll and open details survive normal React updates. Obsolete responses cannot replace newer selected-entity reads. Reconnect/stale state disables mutations until fresh information arrives. Reads allow Player bootstrap before Initiative enrollment while ordinary combat mutations retain their existing enrollment requirement.

Stage 1 validation: production build and TypeScript passed; all 1,261 preexisting unit tests passed; three focused prompt-state regressions passed; ESLint passed after correcting one JSX apostrophe; `git diff --check` passed. The user encountered a transient JSX fragment parse error during editing; the fragment was corrected and the production build subsequently passed. Full gameplay commands are Stage 2; browser/server scenarios and visual inspection are Stage 3. Human tabletop playtesting remains subsequent work.

## Stage 2: gameplay connection

In progress.

## Stage 3: executable screen verification

Pending. Only actual browser interactions will be described as screen verification; service and unit tests are reported separately.
