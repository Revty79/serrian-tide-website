# Tabletop Operations human-test guide

This guide prepares the accepted Pass 1-14 Tabletop Operations build for structured human testing. Automated browser checks are evidence that the build is ready; they are not a substitute for the human test described here.

> **Safety:** Never run this rehearsal against production. Use only a disposable local PostgreSQL database on `localhost`, `127.0.0.1`, or `::1` whose database name ends in `_dev`. Do not import canon, run a seed, backfill data, deploy, or push as part of this test.

## Required local setup

1. Check out the Pass 14 commit reported in the handoff and confirm `git status --short` is empty.
2. Install the repository's supported Node.js and PostgreSQL versions, Google Chrome, and dependencies with `npm ci`.
3. Set `.env.local` to a loopback `_dev` database with migrations through `0031`. Keep `BETTER_AUTH_URL` aligned with the local site URL.
4. Start the site with `npm run dev`, open the printed localhost URL, and keep the terminal visible for errors.
5. Use a dedicated test Campaign whose name begins `HUMAN-P14-` and record its IDs in the defect report.

The database must be disposable, backed by no production connection, and safe for test-only mutation. The legacy Runtime Foundation Step 13 fixture set is intentionally absent and must not be installed for this rehearsal.

## Required roles and assignments

Prepare four identities in the test Campaign:

- One Campaign-owning G.O.D.
- Player One, assigned only to PC One
- Player Two, assigned only to PC Two
- One persistent NPC owned and controlled through the accepted G.O.D. workflow

Put both PCs and the persistent NPC on the Session roster and active Scene. Add two direct occurrences of the same canonical Bestiary Creature to the Encounter. Give the occurrences distinct display labels, such as `Tide Maw A` and `Tide Maw B`.

Use authored test data that already has an ordinary melee weapon, an exact firearm instance, compatible ammunition, at least one approved firing mode, and exact weapon Skill governance. Do not invent missing mechanics to satisfy this list.

## Exact route sequence

1. G.O.D.: `/login`
2. G.O.D. Campaign/session control: `/heavens/tabletop?campaign=<campaignId>&session=<sessionId>`
3. G.O.D. Called Checks: `/heavens/tabletop?campaign=<campaignId>&session=<sessionId>&workspace=checks`
4. G.O.D. Scene/Encounter: `/heavens/tabletop?campaign=<campaignId>&session=<sessionId>&scene=<sceneId>&encounter=<encounterId>`
5. G.O.D. Character weapon governance: add `&workspace=weapons&weaponCharacter=<characterId>&weaponItem=<itemId>`
6. Canonical mapping review only: `/heavens/equipment`
7. Player One: `/realms/tabletop?character=<pcOneId>`
8. Player Two in an independent browser profile: `/realms/tabletop?character=<pcTwoId>`
9. Return to the G.O.D. Encounter route for adjudication, effect approval, and closeout.

Global Equipment mapping is edited only in Heavens Equipment. G.O.D. Tabletop displays that mapping read-only and manages only Character-specific overrides and one-action rulings.

## 15-20 minute smoke test

1. As G.O.D., open the test Session, Scene, and Encounter. Expected: both PCs, the persistent NPC, and two separately labeled direct Creature occurrences are visible.
2. As G.O.D., issue one private Called Check to Player One. As Player One, enter a physical result. Expected: Player Two cannot see it; G.O.D. sees the response.
3. Issue a Player-roll High/Low request to Player Two. Expected: the call locks before the Roll and the result survives refresh.
4. As Player One, declare a melee attack on one direct Creature. As the authorized responder, choose No Defense or Dodge. Expected: the attack Roll stays closed until the response window is complete.
5. Reload the exact firearm, Aim for one Initiative, submit a Called Shot request, and have the G.O.D. approve a reasoned penalty. Expected: the attack binds the same firearm, target, objective, and ruling.
6. Fire and Roll. Expected: committed ammunition is consumed once; preview and cancelled Aim consume none; Damage remains a proposal.
7. As G.O.D., review, approve, and apply one supported effect. Expected: Health changes only when Apply succeeds, and the audit remains visible after refresh.
8. Refresh both Player pages and the G.O.D. page. Expected: no duplicate action appears, outstanding state recovers, and secret information remains hidden.

## Complete tabletop rehearsal

### G.O.D. steps and expected results

- Create or select the `HUMAN-P14-` Campaign, verify the two exact Player assignments, open a Session, add the two PCs and persistent NPC, then open a Scene and Encounter.
- Confirm the workspace shows unresolved Called Checks, High/Low, responses, ruling requests, declarations, effect plans, and closeout blockers when each exists.
- Open Weapon Governance. Confirm the canonical Equipment route is read-only, the deepest exact Character fallback is explained, and only Character-specific persistent override/one-action controls appear.
- Follow the Equipment link. Confirm it reaches `/heavens/equipment`; do not edit the global mapping inside Tabletop.
- Review Player requests. Ask for clarification once, then approve, modify, reject, or cancel separate requests with visible reasons. Confirm each event remains in history.
- Review a supported effect plan, make only an authorized additive correction, approve it, and apply it. Confirm current and frozen identities can be compared.
- Confirm the persistent NPC is labeled as a Campaign Character/NPC while each direct Creature is labeled and tracked as an Encounter-local occurrence.
- Close the Encounter and Scene using supported controls. Attempt Session closeout with one known blocker, resolve it, then complete closeout.

### Player steps and expected results

- Each Player opens `/realms/tabletop` and sees only their own assigned Character choices.
- Confirm visible Campaign, Session, Scene, Encounter, Initiative, Health, Mana, conditions, equipment, firearm state, Called Checks, High/Low, and permitted combat controls match the G.O.D. state.
- Attempt an action when it is not the Character's Initiative. Expected: controls are unavailable with a visible reason.
- Declare an eligible action, answer an authorized response, and submit unresolved Item, Spell, Derived Ability, ally-defense, Tackle, or narrative intent to the G.O.D. Expected: no rules are inferred.
- Follow clarification, approval/modification, rejection, and cancellation through refresh. Complete only the exact approved action.
- Use both a website Roll and an entered physical Roll where offered. Expected: both enter the immutable ledger with their method recorded.
- Confirm no G.O.D. mutation control, private foreign equipment, foreign Character history, audit identity, or secret check appears.

### Two-Player interaction checks

- Keep Player One and Player Two in separate browser profiles. Have each respond independently to their own opportunity.
- Submit both responses close together and refresh one console during the outstanding action. Expected: one response never overwrites or authorizes the other.
- Keep both consoles open while the G.O.D. adjudicates. Expected: each receives only authorized state through the existing single Player EventSource.
- Try opening the other Player's Character ID directly. Expected: a generic unavailable selection state with no identity or mechanics leak.

### Direct Creature and persistent NPC checks

- Add a Bestiary Creature directly twice. Expected: no Campaign Character, NPC profile, inventory, equipment, firearm, Skill, Attribute, or Active State record is created.
- Change only occurrence A's encounter-local notes/state. Expected: occurrence B and the canonical Creature remain unchanged.
- Target both occurrences separately and confirm frozen labels/IDs remain distinct in declarations and history.
- Add and act with the persistent NPC. Expected: it remains roster-backed and distinguishable from both negative occurrence keys.

### Called Checks and High/Low

- Issue single-recipient, mixed/group, private, and secret Called Checks. Complete website and physical responses.
- Reroll one request. Expected: the original attempt remains immutable and the new attempt is linked.
- Run High/Low once with a Player call/Roll and once with a G.O.D. Roll.
- Reveal one eligible private result. Expected: secret requests are absent before reveal and remain absent when not revealable.

### Initiative, melee, defense, intervention, and Tackle

- Establish Initiative; exercise Hold and Pass; then advance to an eligible action.
- Resolve ordinary melee attacks through No Defense, Dodge, and Parry or Block. Confirm defense-favored ties and exact additional Initiative/refund behavior.
- Exercise ally defense at its authorization/ruling boundary.
- Exercise Tackle. Expected: the exact three-Initiative rule is visible and no invented cost is used.
- Start a long action that crosses Initiative continuation, then exercise cancellation and correction while preserving history.

### Firearm readiness, attacks, and Damage proposals

- Select one exact firearm copy; draw/ready it, load or reload only compatible ammunition, and change only to a mode belonging to that weapon profile.
- Aim for the required Initiative. Cancel one Aim and preview another. Expected: neither consumes ammunition.
- Resolve a normal single attack, ordinary burst/automatic fire, and a Called burst/automatic attack if the authored mode supports it.
- Use multiple independent defenses. Expected: each defense cancels bullets one-for-one by its exact total successes. Ordinary overflow adds no Damage; Called overflow adds Damage only when a bullet survives.
- Confirm misses and fully defended shots still consume committed rounds exactly once.
- Confirm cycling and recoil state comes only from authored timing or a recorded G.O.D. ruling.
- Expected: Damage is proposed in an effect plan and never applied merely because the firearm Roll completed.

### Effect approval and application

- Record Health before the attack, after the Roll, after approval, and after application.
- Expected: the first three values match. Only successful application changes the supported target state.
- Retry Apply after success and after an induced safe failure. Expected: no duplicate effect and a failed transaction leaves all state unchanged.
- Confirm unsupported armor/ammunition, anatomy, hit location, or narrative consequences remain visible review items.

### Refresh, reconnect, and duplicate submission

- Double-click or rapidly repeat declaration, Roll, reload, attack, ruling, approval, application, and closeout controls.
- Refresh after submission and reconnect during an outstanding action.
- Expected: idempotency keys prevent duplicates, authoritative state returns, errors remain visible, and duplicated live-refresh notices do not create a second EventSource or mutation.

### Desktop, phone, keyboard, and accessibility

- Repeat primary G.O.D. and Player flows at desktop width and 390 x 844 phone width.
- Expected: no document-level horizontal overflow; tables, histories, and long IDs remain usable; controls have touch-sized targets.
- Complete the primary workflow using Tab, Shift+Tab, Enter, Space, and Escape only. Confirm logical focus order, visible focus, labels, headings/regions, status/error announcements, and confirmation before destructive or irreversible actions.
- Enable reduced motion in the operating system. Expected: interaction remains understandable without motion.
- Trigger one validation error and one server error. Expected: actionable feedback remains visible after rerender.

### Closeout and historical review

- Close the Encounter and Scene when supported. Attempt Session closeout while an action, request, Roll ruling, or effect plan remains unresolved.
- Expected: one actionable blocker list; no partial closeout.
- Resolve blockers and close the Session. Reopen historical views and confirm frozen identities, original and corrected Rolls, outcomes, effect events, and audit history remain available and read-only.
- Reopen only through the accepted lifecycle and confirm persistent Character/NPC state was not reset.

## Known intentional ruling boundaries

- Critical failures (`01`), double ott (`100`), critical collisions, and impossible-target double ott remain explicit G.O.D. ruling states.
- Missing weapon Skill governance, invalid Character override, missing Attribute, anatomy/hit location, firearm capacity/timing/readiness, or unsupported armor/ammunition interaction never receives a guessed value.
- Spell and Derived Ability combat Roll modes are not inferred from names, prose, prerequisites, or effects. They enter the structured ruling workflow.
- Unsupported narrative consequences, death, unconsciousness, bleeding, limb loss, and equipment destruction remain manual rulings.
- Direct Creature actions without Character-backed mechanics remain ruling-required and isolated from Character services.

## Defect report template

```text
Build commit:
Role and account:
Campaign / Session / Scene / Encounter IDs:
Character ID or Creature occurrence key:
Exact action attempted:
Expected result:
Actual result:
Visible error or status text:
Did refresh change the result? Yes / No, with details:
Screenshot or video reference:
Relevant Roll / declaration / request / effect identifiers:
Browser, viewport, and input method:
Reproduction steps:
```

## Cleanup

Automated rehearsal fixtures are uniquely marked and self-cleaning; their runners compare database counts or query known prefixes after completion. If an automated run is interrupted, rerun its focused browser script so its stale-fixture cleanup executes, then verify no matching `pass11-`, `pass12-browser-`, `pass13-browser-`, or `weapon-governance-browser-` records remain.

Human records should exist only in the dedicated disposable `_dev` database. Close the test Session, retain its IDs with the report, then have the local database owner discard the disposable database or remove the `HUMAN-P14-` records with the project's approved local DBA procedure. The product intentionally has no general Campaign-deletion flow in Pass 14. Never aim cleanup SQL at production or an unverified database.

## Exact automated validation sequence

Run from `D:\serrian-tide-website` in this order:

```powershell
npm ci
npm run validate:tabletop-pass14
npm run validate:weapon-governance-management-browser
npm run validate:player-combat-browser
npm run validate:player-tabletop-browser
npm run validate:called-check-god-browser
npm run validate:called-check-player-browser
npm run validate:tabletop-full-rehearsal-db
npm run validate:tabletop-full-rehearsal-browser
npm run validate:called-check
npm run validate:player-tabletop
npm run validate:firearm-readiness
npm run validate:firearm-attack
npm run validate:tabletop
npm run validate:unit
npm run validate:character
npm run validate:creatures
npm run validate:active-state
npm run validate:item-runtime
npm run validate:spell
npm run validate:spell-effects
npm run validate:spell-runtime
npm run validate:derived-abilities
npm run validate:mechanical-effects
npm run validate:runtime-schema
npm run validate:migration-ledger
npx drizzle-kit check
npm run typecheck
npm run lint
npm run build
git diff --check
git diff --cached --check
```

The full database rehearsal invokes every accepted guarded Tabletop database suite, including Roll ledger, weapon governance, Character governance, action/declaration, defense/intervention, effect bridge, firearm, Called Check, Player, closeout, and shared runtime suites. Run `npm run validate:runtime-db` only when the legacy Step 13 fixtures already exist; do not install or seed them for Pass 14. When absent, its one explicit prerequisite failure is the expected status.

## Deferred findings

- The planned Skill browser/tree and canonical Skill regrouping work remains separate.
- Global navigation, whole-program scroll position, password controls, broad Character-editor cleanup, and printing remain separate.
- Simple/detailed NPC authoring, NPC functional roles, Campaign deletion, universal deletion, and database backup/restore remain separate.
- Human-test data removal is intentionally a disposable-database/DBA task until the separately planned deletion lifecycle exists.
