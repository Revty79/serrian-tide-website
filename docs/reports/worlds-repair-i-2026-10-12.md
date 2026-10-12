# Worlds Repair I — Atlas and Map Maker usability

Repair I keeps the accepted Atlas and Map Maker design, explains its existing tools in worldbuilding terms, and corrects reproduced dialog placement, width and focus defects. No map engine, geometry, generator, authorization, saved representation or historical calculation changed.

The checkout started clean at the exact technically approved H checkpoint `e717c2dc4dc67675873760600d53c0e023f687a4`. Before changes began, the owner confirmed acceptance of that commit's final visuals and resolution of the Chronology-to-Calendars flash. The release is the local commit containing this report; its exact SHA is recorded in the completion message and ignored `artifacts/guidance/worlds-i-commit-receipt.json`. Independent I technical review and owner visual acceptance remain pending. I is not pushed or deployed.

## Reproduced defects and corrections

Production-browser baseline measurements covered five existing dialogs at 1440×900, 1920×1080, 390×844 native touch, 390×320 native touch and 800×600 constrained desktop. All 25 opened at the viewport's top-left corner with computed zero margins. On the 1440 px desktop, blank-map, geography and connection dialogs were 560 px wide; the floor and dungeon dialogs were approximately 315 and 321 px. All 25 Escape dismissals lost the opening control's focus when React removed the open native dialog.

- Existing Atlas dialogs now center with `margin: auto` and retain safe viewport margins, internal vertical scrolling and wrapping. Simple map/geography forms retain their reasonable 560 px desktop width.
- Connection forms have an 840 px desktop limit; floor and dungeon forms have an explicit 760 px limit. They shrink to fit phones and constrained windows. Native dialog semantics and the existing forms remain.
- Cancel/Escape close the native dialog before removing it, restoring focus to the opening control. Existing pending-save and dirty-draft confirmation checks still run first. Place History uses the same native close correction.
- The accepted main canvas, 290 px Atlas inspector, editor layouts, typography, map styles, theme variables and visual rendering remain intact. No CreatorWorkshop replacement or redesign was introduced.
- Final screenshot inspection also reproduced an unbroken place-history title extending beyond the phone dialog's readable area. A scoped `overflow-wrap: anywhere` rule on its account articles now displays the complete title without widening the dialog. The existing History dialog design and width remain.

The final layout checkpoint passed all 25 dialog/viewport combinations: centered and bounded dialogs, no sideways overflow, reachable cancel controls after scrolling, keyboard Escape and restored native focus. Unsaved values survived rejected discard confirmations on desktop and native phone; accepted discards closed normally. Opening dialogs and reading their help preserved every saved source row compared by the checkpoint.

## Wording, explanations and existing tools

Existing question-mark help now explains the action, its purpose and its effect across map creation, geography, connections, generator settings, coast and terrain tools, drawing properties, settlement objects, floors, dungeon sections and grids, and historical place accounts. Examples remain suggestions; reading help inserts no facts or values.

The main explanations distinguish a chart from a shared saved place, independent drawings from shared names/descriptions, appearance from source geometry, parent geography from travel links, explicit destinations from authored entrance labels, and map edits from separately authored History. They explain brush size/spacing/density, saved stroke settings, point positions, grid/snapping choices, independent floor/level ordering, failed saves and retained drafts. New floor/level selectors and grid disclosures use the shared field guidance.

Generator guidance covers supported landscape descriptions, presets, editions, advanced placement choices, unsaved preview, acknowledged interpretation limits, acceptance, duplication and independent variations. It promises only the existing engine's capabilities. Creation provenance and full place references remain available in nested technical disclosures; they are no longer the primary explanation. The ordinary-preview button and explanation use plain language. Page guidance describes the existing interior/dungeon workflows rather than calling them future tools.

All controls retain their existing values, defaults, validation and save behavior. Blank maps, description generation, seeded procedural previews, manual editing, coast sculpting/tracing/smoothing, terrain brushes, paths, symbols, labels, styles/layers/locks, pan/zoom, undo/redo, exports, conflicts, archive/restore and independent destination maps remain available.

## Focused verification

| Check | Actual result |
|---|---|
| Production build | Final isolated production builds passed. Baseline and implementation builds were kept during unfinished checkpoints; harness-only resumes reused them. The last application change is the scoped place-history title wrapping. |
| TypeScript and changed-file lint | Passed. The production build also checks the final application and focused harness types. |
| Relevant domain tests | **42/42** passed across Atlas, navigation, cartography, generation refinement, settlement, interior and dungeon tests. Their authoritative domain files remain identical to approved H. |
| Focused service fixtures | Seven existing Atlas/cartography/generation/connections/settlement/interior/dungeon checks passed once on disposable data, covering identities, source/provenance, atomic invalid-save rollback, revision races, foreign keys, seeded generation, archive/restore and role/privacy boundaries. |
| Browser checkpoints | **11/11** completed: layout, Atlas, cartography, guidance, generation, connections, settlement, interior, dungeon, privacy and H transitions. Completed checkpoints were preserved; unrelated suites were not restarted. |
| Dialog presentation | **25/25** original dialog/viewport combinations passed. An additional five viewport checks passed for long place-history titles, bounded scrolling, reachable close, native focus and retained dirty drafts. |
| Question-mark help | **127 distinct author controls / 254 keyboard and native-touch interactions**, plus 155 dialog-help interactions across five screen sizes and 40 place-history interactions in primary/alternate contexts. The scoped final History correction repeated those 40 affected interactions. Enter/Space/tap opens help; Escape closes it, restores focus and preserves values. |
| Atlas and cartography | Blank map → draw continent → save/reload → edit the same coastline passed with stable place/feature/point identities. Real mouse/touch painting, sculpting, paths, labels/symbols, pan/zoom, undo/redo, layer locks/visibility, style changes, source/draft export and verified 2000×1200 PNG export passed. Failed saves, acknowledged-save readback recovery, actual two-tab conflicts, navigation guards and archive/restore passed. |
| Generator | Four presets, deterministic seeds, a real supported landscape description, interpretation limits/acknowledgment, stale-preview guards, preview/cancel/accept, editable generated geography, duplication and variations passed. Manual edits retained original provenance and independent originals. |
| Connected maps and saved readers | Saved World → continent → authored region → town, multiple destination charts, shared-place rename with independent drawings, explicit preference conflicts, breadcrumbs, Back/Forward/reload, retained view on failed reads, retry and archive/restore passed on desktop/phone. |
| Settlement, interior and dungeon | Existing authoring/edit/save tools, shared places, overlapping districts, independent floor/level maps, explicit stairs/portal destinations and arrival points, attached wall gaps, both grids without moving saved geometry, protected details, conflict recovery and native-touch persistence passed. Existing dense fixtures were exercised without changing renderer code: 900 settlement buildings, 960 interior objects and 810 dungeon objects. These local measurements are not production performance guarantees. |
| Privacy and alternate timelines | Primary and alternate place accounts remained separate. Ordinary server responses/views omitted protected accounts, details and private notes; ordinary exports remained redacted. Foreign G.O.D., Player and anonymous access failed with 404/403/401; Administrator access required explicit read-only review and writes remained denied. Author/ordinary/alternate/review reads retained saved sources and immutable History. |
| H regression | Six desktop/native-phone first/repeat Chronology-to-Calendars transitions recorded zero loading-panel frames. Delayed responses, refreshed saved data, failed/denied reads, reload and retained calendar drafts through Back/Forward passed. Explicit repeated History → Chronology → Calendars → History navigation, reload and retained account reads also passed on desktop/native phone with the same timeline and immutable History. |
| Preservation | **38 authoritative source/schema/migration/dependency files** match approved H after line-ending normalization. Opening help and reading contexts retained map/place IDs, shape/drawing/point data, revisions, original creation recipes and History versions. Disposable runtime/Campaign/Form/Evolution/catalog snapshots remained unchanged. |

The reproduced centering/focus and long-title wrapping problems were application defects. Setup/import issues, an ignored CJS recovery helper, stale exact success/provenance/ordinary-preview wording, and repeated drawing names were harness failures. Their diagnostic receipts remain retained. Interrupted test maps were renamed through the normal save service with their shapes, identities and provenance verified unchanged; completed fixtures were not reset. Only affected/unfinished checkpoints resumed.

Evidence is local and ignored by Git:

- `artifacts/guidance/worlds-repair-i-baseline/` — original 25-dialog positioning/focus measurements and screenshots.
- `artifacts/guidance/worlds-repair-i-acceptance-1/` — completed dialog checkpoint, final implementation build log and modal help.
- `artifacts/guidance/worlds-repair-i-resume-1/` — completed Atlas/cartography evidence and verified exports.
- `artifacts/guidance/worlds-repair-i-resume-3/` — completed 254 tool-help interactions and source preservation.
- `artifacts/guidance/worlds-repair-i-resume-4/` — generator, connections, settlement, interior, dungeon, privacy and H transition receipts, including the original clipped title screenshot.
- `artifacts/guidance/worlds-repair-i-history-final/` — final production build, five long-title/focus/draft checks and affected privacy/History help rechecks.
- `artifacts/guidance/worlds-repair-i-tabs-final/` — final production build and explicit desktop/native History/Chronology/Calendars return, reload and account-read proof.
- `artifacts/guidance/i-domain-tests.log`, `i-typecheck-final.log`, `i-lint-final.log`, `i-invariant-receipt.json`, `worlds-i-completion-evidence.json` — focused checks and aggregate preservation receipts.

## Migration, configuration and controlled release

**New migrations: zero. New dependencies: zero. Application configuration changes: zero.** The unchanged migration journal has 122 entries through `0121_worlds_living_skies` (idx 121). The current chain was exercised on a fresh disposable PostgreSQL instance solely for the focused fixtures. I adds no upgrade or conversion requirement and does not claim a new comprehensive populated application upgrade rehearsal.

All validation used a task-owned PostgreSQL instance bound to localhost and isolated production builds. Shared DEV/Production databases and shared services were not changed or restarted. No Campaign, Character, Heavens, combat or VTT runtime code changed.

After independent technical and owner visual review, obtain the separately required push/deployment authorization, verify the release SHA and target migration ledger, follow the existing operator-managed release process, build before activation, and smoke-test authenticated Atlas editing/exploration and role-specific reads. There is no I migration to apply. I is a complete local increment with no dependency on a later repair; production activation remains a separate action.

Recovery can restore the approved H application code without a database rollback because I changes no schema or saved representation. Existing maps, shapes, place identities, versions, creation records and History remain compatible. Restoring H also restores its earlier dialog/help behavior. Preserve normal backups and any records authored after release; reverting code does not undo saved History.

## Review boundary and remaining acceptance

Automated browser evidence and screenshot inspection do not constitute owner visual acceptance or physical-device certification. Independent I technical review and owner visual acceptance are pending. No comprehensive application suite or combined A2–I acceptance was performed during I; previous broad receipts remain historical evidence.

Standalone G is postponed. Stop at this local review checkpoint. The one combined A2–I integrated acceptance and comprehensive regression checkpoint requires separate authorization after I review. Realm-to-Map linking, historical map-state changes, Phase 6 and Advanced Map Studio remain separate work.
