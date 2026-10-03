# Special Ability Mechanics: Pass 5 read-only Character, print and tabletop views

The [October 2 core progression contract](special-ability-core-progression.md) supersedes this pass's provisional progression wording. The Pass 5 record below is historical evidence of that pass.

September 30, 2026. Based on reviewed Pass 4 commit `54b18e5f508e1c9a674a545c99fcacf1657ea785`. This pass presents saved definitions and qualification through the existing mechanics contract. It adds no execution or authoritative Character state. **Stop for Brannan and Ember review; Pass 6 has not begun.**

## Completion report

### 1. Commit and push

The delivery reply records the exact pushed SHA. This report and its implementation are committed together under `Present Special Ability mechanics on Character, print and tabletop (Pass 5)`. Retrieve that revision with `git log -1 --format=%H -- docs/architecture/special-ability-mechanics-pass-5.md`. Delivery includes verification that local `main` and `origin/main` agree.

### 2. Files changed

- Projection and presentation: `src/features/special-abilities/{character-models.ts,read-service.ts,presentation.ts,character-reference.tsx,reference.css,read-actions.ts,saved-inspector.tsx,mechanics-preview.tsx,v2-summaries.ts,presentation.test.tsx}`.
- Character integration: `src/app/characters/{actions.ts,character-sheet.tsx,paper-character-sheet.tsx}` and `src/features/characters/{models.ts,paper-character.ts,character-print-options.ts}`.
- Tabletop integration: `src/app/realms/tabletop/{page.tsx,player-tabletop-workspace.tsx}`, `src/app/heavens/tabletop/tabletop-workspace.tsx`, and `src/features/combat-screen/combat-screen.tsx`.
- Verification: `scripts/{special-ability-foundation-db.test.mjs,character-sheet-pass-one-disposable.test.ts,special-ability-reading-browser.ts,character-paper-review.ts,verify-special-ability-pdfs.py}`.
- Documentation: this report, the follow-up link in `special-ability-mechanics-pass-4.md`, and `unified-character-printing.md`.

### 3. Character projection

`getCharacterSpecialAbilityMechanics` uses a repeatable-read, database-enforced **READ ONLY** transaction. It authenticates the caller, loads current roles, checks existing `canReadActiveState` Character/Campaign authority, and supplies saved Normal owner facts to the existing pure `resolveSpecialAbilityMechanics`. The original single-ability projection and the new batch share their possession/Derived-fact adapter.

Possession uses the established positive allocations plus current Race Skill links. Progression uses the existing isolated adapter. The versioned codec, exact reference collector/reader, qualification primitives and resolver remain authoritative. Character, print and tabletop components never parse `skill_extension.data_json`. The mechanics batch is a coherent snapshot of its own; this does not claim the entire older Character aggregate is one cross-system transaction.

### 4. Batching and performance

One Skill/extension join reads all possessed Special Abilities, including Definition-only records. Exact references are deduplicated across documents and read in at most one Skill and one Derived catalog batch. Existing Derived possession is loaded once, only when needed, with `lock=false` and no reconciliation. In the synthetic case containing Derived references, **6 and 18 possessed abilities both issued 21 SELECTs**, with exactly one extension join. There is no query per ability or per rule. Additional allocation paths produce one ability and the established maximum purchased allocation, never a sum.

### 5. Character sheet

The existing **Skills & Abilities** section shows saved Special Ability mechanics. Abilities and individual rules start collapsed, expose native keyboard-accessible disclosures, and retain the ordinary Skill Definition. Opening details shows possession, provisional progression, document state, qualification status/explanation, rule family, full description, references, limitations, notes and diagnostics. Unsaved editor values and temporary Form facts do not replace the saved mechanics snapshot. Screen colors use shared semantic theme variables.

### 6. v1/v2 presentation

All eight reviewed families render through `MechanicsRuleSummary` and its existing shared effect/Interaction summaries. Both versions retain their definitions and semantics. The only statuses are matched qualification, qualification not matched, Manual/G.O.D., and unavailable owner evaluation. A visible explanation defines a match as known saved facts satisfying authored qualification. v2 contributions remain Manual/G.O.D. under the existing resolver even when their outer conditions are satisfied; unsupported owner facts remain unavailable. No new interpretation or rule family was added.

### 7. Resources

Displays resource title/unit, grant intent, maximum definition, maximum contributions and their authored conditions, recovery/refill definitions and notes. Progression-based amount definitions remain explicitly provisional and unevaluated. There is no current/remaining balance, affordability calculation, refill clock or spend/restore control.

### 8. Modifiers

Displays the existing effect label, channel, amount, duration and authored qualification/G.O.D. guidance. Exact Skill targets resolve to catalog names, Attribute keys include their readable names, and movement targets use the authored movement key without its internal prefix. It does not alter Attributes, Initiative, movement, Soak, damage or Skill values.

### 9. Interactions

Displays Requirement, Immunity, Resistance, Vulnerability and Absorption using the shared validated vocabulary: scope, percentage, ANY (OR)/ALL (AND), supported match conditions and G.O.D. guidance. Special Ability contributions are not supplied to incoming-effect resolution. Existing Race/Form/Creature runtime contributions are unchanged.

### 10. Activated/Triggered rules

Shows activation/reaction/trigger definitions, event prose, authored costs, local Resource names, use limits/refresh, duration, target intent, required Choice definitions, intrinsic effects and outcomes. Supported damage/healing/condition/modifier/manual effects use shared effect language, including duration and over-time timing. These are definitions with no affordability, use, trigger, roll or execution control.

### 11. Overrides

Shows Manual/G.O.D. proposal status, subsystem category, proposed change, conflict/precedence guidance and authored outcomes. The executable-slot registry remains empty. No subsystem rule is overridden.

### 12. Choices

Shows type, title, allowed exact candidates, minimum/maximum selections, reselection policy, restrictions and guidance. Local references display the authored Choice title. Every Choice explicitly says it is required when fully supported and that the definition has made no Character selection. There is no binding or selection input.

### 13. Outcomes

Success, Failure, Critical Success, Critical Failure and Manual branches display their descriptions, linked same-rule intrinsic effects, G.O.D. guidance, limitations and notes. Local effect keys resolve through the owning rule. No outcome is rolled, selected or executed; the existing roll engine remains authoritative for future integration.

### 14. Legacy, empty, invalid and future documents

Definition-only is a valid legacy state. Empty documents state that no rules are attached. Invalid supported documents show a safe author-review diagnostic while retaining Definition. Future versions are identified as newer, preserved formats and never reinterpreted. Missing/archived exact references remain diagnosed; no name-based replacement occurs. Internal IDs/paths and malformed JSON are not presented as player guidance.

### 15. Progression warnings

All possession summaries label saved purchased progression provisional and state the maximum-allocation interpretation. The explicit warning reads **“Provisional — purchased-point interpretation not yet finalized.”** Authored self-progression requirements/amounts retain their numbers and warnings. Qualification details translate comparison tokens into existing readable labels such as “at least.” No progression editor, Rank, roll target, Race contribution, advancement or Form Access behavior changes.

### 16. Zero-purchase racial possession and evolved Characters

Current Race links still establish possession even at zero purchased progression. Synthetic v1 always qualification matches at 0; an existing threshold of at least 1 does not. No allocation or purchased point is created. Detailed references and Full/Complete selection include racial abilities with no allocation row. Replacing the saved current Race changes possession through its normal saved links; the test verifies the former Race grant disappears. There is no Evolution-specific reader or history duplication.

### 17. Native Creature and active Form limits

Native Creature NPCs return an explicit unsupported owner context with no inferred purchased progression. Encounter Creature occurrences display the same limitation instead of passing their negative occurrence identity as a Character ID. Temporary active Form-granted possession is not evaluated; every Normal view says so. Neither adapter copies Form Skills, Attributes, anatomy, movement, attacks, protection, access or Creature definitions. These contexts require deliberate future adapters.

### 18. Print integration

Uses the existing saved-record print center and **Special Ability reference** option. Custom Print can select it independently; Full/Complete include it for possessed abilities. Quick Reference retains its original compact Definition-only list and never opts into structured mechanics. Detailed output expands the shared component without buttons/disclosures. Rules flow across pages; rule headings stay with following content, and referenced-definition headings stay with their lists where possible. Print uses the existing fixed-ink appearance exception.

### 19. Actual PDF verification

Generated and inspected **3 actual Chrome PDFs / 15 pages**: crowded Quick Reference (3), detailed Universal (6), and detailed Plain (6). Both detailed exports contain seven possessed abilities, all document states, every v1/v2 family, zero-purchase qualification, long description end markers, local/exact references and outcome branches. Automated PDF checks found every **192 reference paragraphs per detailed export**, checked text bounds, readable font sizes, table cells, pagination, nonempty pages and rule-heading placement. Rendered page images/contact sheets were visually inspected, including the long resource rule and continuation pages. Reference body text is 9pt with 8pt margin identifiers.

The crowded legacy Quick Reference's two-column General back carries its last compact ability onto a short third page. This is retained compact-list pagination, not automatic detailed mechanics. No clipped text or missing Definition was accepted. Physical printers, Firefox, Safari and physical phone devices were not tested.

### 20. Tabletop integration

Player console: existing **Abilities** tab. Owning G.O.D./admin Session workspace: **Roster & Prep**, per-Character inspection. Existing combat inspection: selected saved Character only, restricted to the Player's own selection or G.O.D. view; native Creature occurrences show the unsupported-context notice. The shared lazy inspector fetches only when opened and offers a **Refresh saved reference** control. Changing Character remounts its state and discards late responses. Refresh failure clears stale content and explains access/connection recovery. Combat action dispatch, locks, Initiative and effect processing were not changed.

### 21. Authorization and privacy

Roles and ownership come from the server. The Player must own a non-NPC Character and be a Campaign member; the owning G.O.D. and admin retain existing read authority. Unauthorized, missing and invalid Character identities reject before documents are read. Tests compare Player/owning G.O.D./admin results and deny unrelated G.O.D./Player access. Referenced Skill/Derived names follow the existing Character catalog-read boundary: existing Character readers already expose those shared catalogs; personal/canon discovery preferences are not per-record read ACLs. The new view returns only referenced names and possessed ability definitions, not unrelated Character/NPC mechanics.

### 22. Proof of read-only state

The new reader is database-enforced READ ONLY, including its Derived loader. Foundation tests assert the transaction mode, snapshot equality around authorized/denied reads, and constant query count. The actual Character/print/tabletop browser rehearsal compares **88 tables before and after** navigation, expansion, PDF generation, Freeze inspection, offline/reconnect and reload. Snapshots cover allocations, nonzero health damage/Mana spent, conditions/modifiers, inventory/equipment/item state, Derived ownership/history, Form/Evolution-related Character state and Session/Scene/encounter/Initiative/effect/use state. All remain identical. No Special Ability balance, binding or use-history tables exist or were introduced. Synthetic fixture setup writes happen before snapshots; authentication-session bookkeeping is not gameplay state.

### 23. Tests

- **1,054/1,054 affected regression tests passed**: Special Ability codec/authoring/presentation, Skills, Forms/Form Access, Derived Abilities, Character/print, tabletop, combat-screen, active-state, Interaction Rules, Mechanical Effects, Spell Construction, lifecycle, authorization, guidance and catalog visibility. Includes five new shared presentation tests and four existing Form-print component tests.
- **13 disposable foundation database scenarios**, including actual Skill/lifecycle actions, stale/core/future document protection, exact references, read authority, zero-purchase possession, current Race changes, Creature limitations and batching.
- **14 existing Character action/database scenarios** in the presentation harness, covering owner controls, authorization, equipment and active-combat state protections.
- Existing Special Ability authoring browser suite: **10 scenario groups passed** after sharing its summaries.
- TypeScript, changed-file ESLint and `git diff --check` passed. No production build or runtime gameplay acceptance is claimed; actual affected routes compiled and ran in the isolated Next server.

### 24. Actual browser checks

**8 presentation scenario groups passed**, including actual desktop **1440 × 1000** and **390 × 844** Character/Player/G.O.D. views, all states/families, optional print, Player exclusion from another Character, owning G.O.D. roster inspection, frozen Player/G.O.D. encounter inspection, refresh offline/reconnect and reload. Expanded mechanics have no horizontal overflow, and the new reference sections contain no execution controls. Browser page-error collection is empty. The intentional offline/navigation rehearsal may close the existing live event stream and log a server-side stream cancellation; reconnection and state checks pass. Existing authoring regression additionally covers **1365 × 950** and 390px.

### 25. Migrations

**No schema, table, column or migration added.** Disposable harnesses apply the existing migration chain only to new synthetic databases. No shared migration was run.

### 26. DEV/Production access

**No shared DEV or Production database reads or writes. No real abilities authored.** The checkout environment points to Production, so all integration/browser harnesses explicitly override it with guarded disposable loopback URLs, synthetic users and synthetic content. Harnesses clean up their owned PostgreSQL/Next processes and restore generated TypeScript configuration. PDF inspection dependencies were installed only in an ignored local artifact folder, without changing app dependencies. PDFs, screenshots, logs and local dependency files remain ignored, not part of the push.

### 27. Unresolved issues and deliberate limits

The progression contract remains Brannan/Ember's decision. Native Creature owner facts and active Form temporary possession remain unsupported. Resource balances, choice bindings, activations, event timing, costs, modifier/Interaction application, outcome dispatch and override precedence remain future runtime work. The existing crowded Quick Reference can have a short continuation page, as recorded above; no new compact-sheet redesign was introduced. There are no known failing Pass 5 checks. Human review and real-device/printer acceptance remain outstanding.

### 28. Exact recommended Pass 6 scope

**Final Special Ability validation and handoff across Passes 1–5.** Audit one-owner-per-mechanic boundaries, strict v1/v2 preservation, authoring/reference lifecycle, saved possession/provisional qualification, authorization and nonexecuting Character/print/tabletop presentation. Rehearse end-to-end synthetic authoring through all three read surfaces, including legacy/empty/invalid/future/archived/missing cases and role/reconnect/Freeze boundaries. Repeat the focused and affected regression/database/browser/PDF checks; repair confirmed defects within the reviewed foundation. Produce the final evidence and handoff, enumerating unresolved canon and the explicit contracts required before later runtime integration. The crowded Quick Reference continuation can be assessed during that review without silently expanding print scope.

Pass 6 must **not** activate abilities, create balances/bindings, settle progression canon without a ruling, author the real catalog, add runtime state/migrations, write shared DEV/Production, or begin Creature Ownership combat work. Stop afterward for Brannan and Ember review. **Do not start Pass 6 automatically.**

## Reproduction and local evidence

```powershell
node --import ./scripts/register-test-css.mjs --import tsx --test src/features/special-abilities/*.test.ts src/features/special-abilities/*.test.tsx src/features/skills/*.test.ts src/features/forms/*.test.ts src/features/derived-abilities/*.test.ts src/features/characters/*.test.ts src/features/characters/*.test.tsx src/features/lifecycle/*.test.ts src/features/spell-construction/*.test.ts src/features/authorization/*.test.ts src/features/guidance/*.test.ts src/features/catalog-visibility/*.test.ts src/features/mechanical-effects/*.test.ts src/features/interaction-rules/*.test.ts src/features/tabletop-operations/*.test.ts src/features/active-state/*.test.ts src/features/combat-screen/*.test.ts
node --import tsx --test scripts/special-ability-foundation-disposable.test.ts
node --import tsx scripts/special-ability-authoring-disposable.test.ts
$env:SERRIAN_SPECIAL_ABILITY_READ_ONLY='true'
node --import tsx --test scripts/character-sheet-pass-one-disposable.test.ts
# With PyMuPDF and Pillow available to this interpreter:
python scripts/verify-special-ability-pdfs.py
npm.cmd run typecheck
git diff --check
```

Windows harnesses need PostgreSQL 18 and Chrome; restricted-token `initdb` required approved escalation. Run browser harnesses sequentially because they back up/restore generated Next configuration. Evidence is under ignored `artifacts/guidance/special-ability-pass-5/`: `browser-results.json`, three PDFs, paragraph manifests, rendered page images/contact sheets and `pdf-verification.json`. Sibling `special-ability-pass-5-*.log` files record the checks. Automated verification is not human acceptance.
