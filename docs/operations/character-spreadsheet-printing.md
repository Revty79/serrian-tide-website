# Original spreadsheet Character printing

## Current: skill numbers and Rank on backs

Application commit: `86ea83b3cd2d18addfa9437ddf805c5feb9943f2`, from weapon publication `d9ba05471b28e90d0f200e2d8bf1a728885ee730`. The owner requested #, Rank and % for skills on the backs, and # and % for Special Abilities, in both Paper and Tabletop sheets.

All ordinary and system Skill tables now show **Skill / # / Rank / %**. # reads the existing effective points, which already include racial points; Rank and % retain the saved skill calculations. Special Abilities show **Ability / # / %** using the canonical saved score and `100 - score`, without an Attribute/parent Rank. The mechanics projection takes precedence; assigned zero-score abilities show 0 / 100%, and unresolved scores stay dashed. Repeated allocations do not duplicate the same Special Ability. Front quick rolls remain name plus percentage.

Back-table headings and row padding are tighter so the requested columns and all entries fit one Letter page per selection at the unchanged 8pt minimum body size. The accepted five-weapon front remains pixel-identical.

Verification: 2,646/2,646 tracked feature tests across 328 files, 13/13 focused PDF/style checks, existing 14 owned action checks, the final headed saved-character journey, all eight crowded styles and actual themed browser downloads pass. The real fixture includes 65 ordinary skills, multiple supernatural systems, Special Abilities and full owned inventory; all requested numbers survive, as do visible rules, page bounds and independent backs. Production/type/lint pass, with zero lint errors and the existing unused `LoreFamily` warning. The first real browser run exposed a crowded-back capacity failure and is retained; tighter padding resolves it without dropping data or shrinking below the minimum font. An isolated unit attempt lacked repository SQL fixtures and was invalid; the complete tracked suite passed from the main workspace. Unfinished device-autosave files were excluded from this print build/publication.

Final production build: `wj5c4Xl6LfYrPyPGGCWWz`. All 1,822 tracked application/asset files match the isolated build; manifest SHA-256 `5b8d9e86d7aab47cd7b44b7f0c5f36f4086d31675c9ca8e66a17198ef6f3c745`. Evidence is ignored under `artifacts/character-spreadsheet-print/skill-columns/`: `browser.log`, retained failed attempts, `units.log`, `pdf-receipt.json`, `source-parity.json`, actual PDFs, native Letter preview and `browser-skills-back.png`.

No shared database access, migration, deployment, owner-service restart, physical print job or Atlas change occurred. The unrelated Atlas report remains untouched. Main sync is authorized; the selected device-only character-creation autosave work resumes after this publication.

## Accepted: weapon priority, damage types and five rows

Application commit: `92fc49c6a47042416fec966c7544a4af20467dc5`, from styled-sheet publication `c366dcc7141e1f3eb1e12d3e74e3c36062d54609`. On 2026-11-02 the owner reported that early inventory tools displaced actual weapons, the Type column showed weapon categories, and wrapped content reduced the visible weapon rows. This correction applies to both compact Paper and original Tabletop PDFs.

Purpose-built weapons now precede authored Improvised / Tool profiles, preserving saved order within each group. Type uses the existing canonical weapon-damage reader's damage type or types, including linked-ammunition types where applicable; unknown types remain blank/dashed rather than inferred. The Type column is wider. The weapon block grows from seven to ten layout units and provides five fixed rows, including blank writing rows for sparse records. Armor gives one unit and the blank quick-roll area gives two; status and Bob retain their full heights, and the Letter frame and upper summary remain exact. Excess weapons/tools and unusually long cell values retain concise information in status without displacing a weapon row.

| Check | Actual result |
| --- | --- |
| Full feature suite | 2,644/2,644 pass across 328 files; 11/11 focused PDF/style checks pass |
| Actual PDFs | All eight crowded styles retain five ruled weapon rows, complete single/multiple damage types, all five real weapon names and Letter bounds; seven original backs and the original upper front remain pixel-identical |
| Final headed Chrome / owned actions | Existing 14 action checks and the saved-character journey pass with early-sorting tools, five actual weapons, all eight styles, independent pages, failure/retry, unsaved edits and unchanged database fingerprints |
| Actual browser downloads | All eight themed front/back packets match the original table content/positions; every real weapon remains in the weapon block, with tools after them and authored damage types in Type |
| TypeScript / lint / isolated production | Pass; zero lint errors and one pre-existing unused `LoreFamily` warning |

The first focused check expected an unwrapped range line; it now verifies the full preserved range across wrapped lines. The row-measurement adapter was corrected to inspect the PDF's four-edge cell paths. The first isolated build could not fetch existing Google app fonts under restricted networking; its retained repeat with network access passes. These earlier attempts remain separate from final passing evidence. No physical job or owner acceptance is claimed.

Final production build: `JaNC-a_y3ZQKsdaFVNssb`. All 1,822 `src/` and `public/` files match its isolated source copy; manifest SHA-256 `47621e4c594cfea6aa40144e0c23700460772370501048b0c6f8876f089c801f`. Evidence is ignored under `artifacts/character-spreadsheet-print/weapon-correction/`, including `units.log`, `focused.log`, `browser-final.log`, `pdf-validation-final.log`, `pdf-receipt.json`, `source-parity.json`, builds, downloads and renders. QA scripts accept `SERRIAN_PRINT_QA_OUTPUT` to preserve earlier receipts.

No migration, shared database access, deployment, owner-service restart or Atlas change occurred. The unrelated Atlas report edit remains local and untouched. Main publication is authorized. The separately requested character-creation autosave work follows this publication.

## Accepted: styled Paper Character Sheet for table play

Application commit: `7d710cc80fd483636f32b42e96568c3b2f8e343b`, based on accepted currency/range publication `790661b53a182e20a38d2a4c61c5852b599f13b4`. On 2026-11-02 the owner requested the approved compact layout with the existing selectable Paper styles, and reiterated that it must contain only the information needed at the table. Commit and origin/main sync are authorized; Atlas remains paused.

**Paper Character Sheet** now uses the same front and seven independent backs as Tabletop PDF Sheets, with Universal, Fantasy, Modern, Apocalyptic, Western, Science Fiction, Horror and Plain styling and standard/genre headings. Existing local masthead artwork, print palettes and embedded Noto Serif headings supply the appearance. All styles retain Letter-only pages, 9-point margins, original section geometry, visible rules, Body Shot Bob, blank Damage/Spent cells, separate Initiative, currency-only Resources and concise skill/range/modifier labels. The original yellow Tabletop PDF remains available and pixel-identical.

These are playable table sheets. Styling adds no definitions, construction documents or full mechanical breakdowns. Books, detailed references and optional Form pages remain under Custom Print and the full-record presets. Print / Save as PDF opens the finished file when requested; there is no large embedded preview. Changing pages, style or headings retires stale output. Missing artwork or fonts reports a retryable error. Printing retains the saved-record confirmation and preserves unsaved editor changes.

| Check | Actual result |
| --- | --- |
| Full feature suite | 2,641/2,641 pass across 328 files |
| All eight themes | Each crowded eight-page packet is Letter; all projected text is present and in bounds, fonts are embedded, and non-title placements/section geometry match the original exactly |
| Existing original appearance | All eight regular pages render pixel-identically to the accepted currency/range sample |
| Headed Chrome and owned disposable actions | Existing 14 action checks plus all-eight/individual PDF selection, eight themed front/back downloads, missing font/artwork retry, stale output retirement, original/Custom switching, saved-record/unsaved-draft protection, desktop/tablet/phone controls and unchanged database fingerprints pass |
| Actual browser PDFs | All eight themed front/back files have the same table text and positions as the original; no full reference prose or unsaved name appears |
| Native ET-2800 preview | Complete styled front at full-size Letter; two sheets for the selected front/back, with Bob, bottom rolls and small margins visible |
| TypeScript / ESLint / isolated production | Pass; zero lint errors and one pre-existing unused `LoreFamily` warning |

The initial standard-font heading experiment failed the external text-bound check and was corrected with embedded Noto Serif before final PDF/browser verification. Existing failed and historical receipts remain retained. The detailed-reference review helpers now select Custom Print; the dedicated styled-PDF browser journey verifies the compact Paper option. The full historical detailed-reference browser journey was not rerun in this pass. No physical print job or owner acceptance is claimed.

Production build: `SNIU9Hm3ZxHFySfMroGra`. All 1,822 files under `src/` and `public/` match the isolated build source; manifest SHA-256 `1dc139348c71667e766f29c7c96b5b209abab9eebe045d4b2bdd3d3af8fc0e00`. Final ignored evidence is under `artifacts/character-spreadsheet-print/paper-styles/`: `units.log`, `typecheck.log`, `lint.log`, `production-build.log`, `browser.log`, `pdf-receipt.json`, `source-parity.json`, themed PDFs/renders and `native-pdf-letter.png`.

All test writes used newly owned disposable targets; the isolated production build used an unreachable dummy database. No migration, shared DEV/Production access, deployment, owner-service restart or Atlas source change occurred. The unrelated local Atlas report edit remains untouched. Recovery is a code rollback; no data rollback is required.

## Accepted follow-up: currency-only Resources and authored weapon range

Application commit: `4806ab9de331cb8bf36bd5e342995dea6a10d7eb`, from accepted Letter-layout publication `d4b4a7d4795fbbc6f59160546338196da0ebdb68`. The owner accepts the layout and asks to remove duplicate Fate/Quintessence from Resources and correct the weapon-block Range display.

Resources now contains currency only; Fate and Quintessence remain in the top profile/progression rows. The range defect was in the saved-record projection: it read only legacy `range_text` / `reach_text`, ignoring structured Reach and Short/Medium/Long limits and their explicit unit. The reader now supplies full range labels for existing detailed print choices and compact `S/M/L` text for the tabletop weapon cell. Authored mode controls which limits apply. Legacy descriptions remain a fallback, while missing bands/units remain visibly missing. No distances, units, combat rules or catalog records are inferred or changed.

Current local checks: 10/10 focused PDF/range regressions, existing 14 owned-disposable action checks, headed saved-character/all-eight/individual/unsaved-edit/failure-retry/responsive journeys, actual eight-page and two-page Letter PDFs, structured range text in the exported weapon block, absence of Fate/Quintessence in the Resources rectangle, TypeScript and lint pass (one existing warning). The end-to-end fixture deliberately stores Short 25 / Medium 50 / Long 100 feet with empty legacy text. Native full-size Letter preview remains complete at 97.22% measured form-to-paper width. Evidence is ignored under `artifacts/character-spreadsheet-print/range-correction/`.

The full-suite/build receipts below describe the accepted Letter baseline; GitHub validates this published follow-up separately. No migration, shared target, deployment, owner-service restart or Atlas change occurred. Existing Letter geometry, margins, handwritten tracking, Bob and print workflow stay unchanged. Main publication remains authorized.

## Accepted Letter layout baseline

Application commit: `6cdaffa31abf00c7fa61e25af02947ab96ef663b`, based on `052acc0a213d46fd0b7df5f33a8e6d6394b1a7a6`. On 2026-11-02 the owner clarified **Letter only**, minimum practical margins, the original design, separate Initiative, blank handwritten HP/mana tracking, numeric weapon modifiers and no large embedded builder preview. Commit/main sync remains authorized; Atlas stays paused.

Every PDF page is now **612 × 792 points (Letter)** with **9-point / ⅛-inch margins**. There is no Legal option. The colored frame is `[9, 9, 603, 783]`, using 97.06% of the paper width and 97.73% of its height. This resolves the large side margins caused by fitting the previous tall Legal PDF onto Letter paper. The current ET-2800 Letter imageable edge is approximately 8.4 points, leaving a small allowance inside its printable area.

The front restores the original compact inline identity rows, yellow paper/blue title, original 60-row section proportions, five adjacent Attributes / Hit Points / Mana / Initiative / Resources blocks, single weapon and armor headers, status beside hit locations and the wide quick-roll area. Body Shot Bob retains the same vectors. Initiative and T Initiative use their own block. HP shows maximum values with blank **Damage** cells; mana shows maximum values with blank **Spent** cells. Weapon modifiers are numeric, including signed hybrid amounts such as `-3 / +2`. Derived Abilities remain in status, quick rolls remain concise and the ammunition initialization diagnostic remains omitted. No saved resource values or mechanical calculations are changed.

**Print / Save as PDF** opens the finished file in a separate tab after the print click or saved-record confirmation. The builder retains only compact Open PDF to print / Download PDF controls; the embedded iframe is removed. The reserved tab closes if generation fails or is cancelled. Existing saved-record authorization, unsaved edits, font-failure retry and other print presets remain intact.

### Current verification

| Check | Actual result |
| --- | --- |
| Full feature suite | 2,635/2,635 pass across 326 files |
| Focused PDF regressions | 6/6 pass, including separate summary blocks, Letter bounds, blank tracking fields, numeric/hybrid modifiers and input preservation |
| Owned disposable actions | Existing 14 authorization/state tests pass |
| Headed Chrome journey | All eight and each individual Letter PDF, automatic PDF opening, no embedded preview, compact phone/tablet controls, font failure/retry, stale download retirement, saved-record/unsaved-draft protection, existing printing and unchanged database fingerprints pass |
| Actual PDF pages | Regular, crowded and browser packets each contain eight pages; front/back contains two; all are Letter |
| Contents and layout | All sample model values and all 65 ordinary skills are present; font/text bounds, blank Damage/Spent rectangles, visible rules, Bob and the complete bottom quick-roll section pass; rendered pages were visually reviewed |
| ET-2800 native preview | Letter at **Default / full-size scaling**, exactly two sheets; the complete front is visible. Three screenshot bands independently measure **97.22% form-to-paper width**, each above the unchanged 95% coverage threshold |
| TypeScript / ESLint / production | Pass; zero lint errors and one existing unused `LoreFamily` warning |

The browser receipt covers the standard weapon modifier; the final hybrid-name cleanup additionally passes its focused signed-amount regression. The first single-scanline screenshot check landed on a horizontal grid rule; bounded neighboring scanlines correct that measurement without lowering the 95% threshold. Earlier rejected Legal receipts remain historical below. No physical job was submitted; owner paper/usability acceptance remains separate.

Final production build: `0K3b6Rf-OWGCY_ZDJg1dP`. All 1,817 `src/` and `public/` files match its isolated source copy. Manifest SHA-256: `dd48c7ffcc3864b571187354c8b6f2beababfb27352751453616ddb586566af0`.

Evidence is ignored under `artifacts/character-spreadsheet-print/letter-layout-correction/`: `browser-attempt-1.log`, `pdf-receipt.json`, `source-parity.json`, `native-pdf-letter.png`, sample/crowded/browser renders and validation logs. Tests use newly owned disposable PostgreSQL and a separate test server; production builds use an isolated source copy with an unreachable dummy database. No migration, shared DEV/Production access, deployment or owner-service restart occurred. The unrelated local Atlas report remains untouched. Recovery requires only a code rollback.

## Historical standalone Legal PDF — superseded after owner rejection

Application commit: `cdf0154368dc05bb9bbd4704eb34b3800a069781`, based on `5b5bfacba1712d35689fc9dbad75812d2bceee4f`. The owner rejected the remaining webpage pagination and directed that the spreadsheet become a visual example for a proper PDF. Commit and origin/main sync remain authorized. Atlas stays paused.

**Tabletop PDF Sheets → Create PDF** now creates the PDF directly from the authorized saved Character snapshot. Preview, **Open PDF to print** and **Download PDF** operate on that file. The front and seven independent backs allocate exactly one US Legal page each (612 × 1008 points), with 24-point page insets, vector grid rules and embedded fonts. The old spreadsheet cell template, HTML renderer and browser pagination were removed. Other print options retain their existing printing path.

The content stays concise: skill name and percentage, numeric durability, no repeated race/Initiative in status, Derived Abilities in front status and no uninitialized-ammunition diagnostic. Long armor coverage and excess equipment use status space. Actual anatomy pools and hit-location names remain authoritative. Body Shot Bob uses the same shared vector paths and target positions as the live sheet. Backs add blank writing rows and flow crowded ordinary skills across three columns. Text is measured and wrapped; a record beyond legible capacity fails visibly instead of creating a continuation or cropped PDF.

### Current verification

| Check | Actual result |
| --- | --- |
| Full feature suite | 2,634/2,634 pass across 326 files; five new PDF tests replace the nine retired spreadsheet tests |
| Owned disposable actions | Existing 14 authorization/state tests pass |
| Final headed Chrome journey | All eight and each individual choice download actual PDFs; one-page independent backs, old print options, saved snapshot/unsaved draft, font failure/retry, stale download retirement, desktop/tablet/phone and unchanged database fingerprints pass |
| Actual PDF files | Regular, crowded and browser packets each contain exactly eight Legal pages; the saved-record front/back example contains exactly two |
| PDF text and layout | Every sample model field/table/status/quick-roll value is present on its corresponding page; all 65 ordinary skills survive the crowded and saved-fixture backs; text remains in page bounds, fonts are embedded, vector rules remain visible and the complete front includes Bob and bottom quick rolls |
| Native ET-2800 PDF preview | Exactly two sheets for the two-page PDF on full-size Legal with Default scaling and on Letter with **Fit to printable area**; both complete fronts were visually inspected |
| TypeScript / ESLint / production | Pass; zero lint errors, one pre-existing unused `LoreFamily` warning |

Use **Legal paper** for the full-size layout. A Legal PDF can be cropped by the printer's Default scaling on Letter paper; **Fit to printable area** keeps the whole page on smaller paper. Page count alone did not prove this: the initial default-Letter capture showed cropping and is superseded by the explicit Fit capture. The app explains these settings; it cannot rewrite a hardware printer's saved settings. No physical job was submitted, and owner paper acceptance remains separate.

Final isolated production build: `A1XspkVxmRiJHz81Jx3ZO`. All 1,817 files under `src/` and `public/` match the build source. Manifest SHA-256: `fbf0544421362c3f7010bfeef35af55f87a156af88d46c97e425326b614dae05`.

Evidence is ignored under `artifacts/character-spreadsheet-print/direct-pdf/`: `browser-final-spacing.log`, `pdf-receipt.json`, `source-parity.json`, `native-pdf-legal.png`, `native-pdf-letter.png`, regular/crowded page renders and validation logs. Earlier failed capacity receipts remain retained. They exposed narrow point/rank columns in the real 82-allocation fixture; the final minimal skill-and-percentage layout passes. The initial diagnostic timeout and the abandoned raw Flight-response replay are retained as failed QA attempts, not passing evidence.

PDF generation lazy-loads pinned `pdf-lib` 1.17.1 and `@pdf-lib/fontkit` 1.1.1. Local Noto Sans Regular/Bold and the retained Lobster title font are embedded, with OFL licenses. The Google workbook and external services receive no Character data. Snapshot authorization, unsaved-edit protection and existing print choices stay intact. This requires no migration, environment change, shared DEV/Production access, deployment or owner-service restart; all test writes were confined to newly owned disposable targets. The unrelated local Atlas report edit remains untouched. Recovery is a code rollback; no data rollback is required.

## Historical Legal HTML attempt — superseded after owner rejection

Application commit: `64ea2bc77863630187ba954db2814956eb4ad49c`. The owner rejected the earlier 8 × 10 printed result and authorized this correction and publication to `origin/main`. Atlas work remains paused.

The spreadsheet option now fills the printable **US Legal page (8.5 × 14 inches)**. Horizontal and vertical layout scale independently, spreading rows across the full printable height. Body text is larger, and explicit black cell rules restore the visible grid, including blank weapon/armor rows. Body Shot Bob and the full hit-location key remain in the front's hit-locations area. Select **Legal** paper in the printer dialog; the web page cannot change a printer's saved paper selection.

Derived Abilities now appear under **Status Effects & Special Effects** on the front rather than in inventory. Inventory removes the “Ammunition state not initialized” diagnostic while retaining actual charge/ammunition counts and quantities. The saved-record authorization, unsaved-edit choice, minimal quick-roll labels and number-only durability remain unchanged.

### Current verification

| Check | Actual result |
| --- | --- |
| Full feature suite | 2,638/2,638 pass across 326 files |
| Print-specific regressions | 9/9 pass, including Derived Ability placement and diagnostic filtering without modifying the input |
| Owned disposable actions | Existing 14 authorization/action checks pass |
| Headed saved-character journey | All eight and individual selections, mixed systems, 65 ordinary skills, a real uninitialized firearm copy, Derived Ability ownership, responsive desktop/tablet/phone controls, saved-record refresh, unsaved edits and unchanged database fingerprints pass |
| Actual Legal PDFs | Eight selected layouts = eight pages; front plus back = two pages; each page is 612 × 1008 points |
| Full-page coverage | Every form measures approximately 561.75 × 936.75 points, filling the 7.8-inch-wide printable frame and its full table height; no smaller inset form, second shrink or blank page |
| Visible lines | 422–622 dark rule segments measured on every exported page; cell borders are explicit solid black |
| Text and artwork | Projected cells and same-page notes are present and in page bounds; minimum measured text is approximately 7pt, including the footer; Bob and all ten key entries were visually inspected |
| Native ET-2800 preview | Actual driver paper selection is `NA_LEGAL`, 215900 × 355600 microns; the front/back sample shows “2 sheets of paper”; full-page grid and margins were inspected |
| Production / TypeScript / ESLint | Pass; zero lint errors and one existing unused `LoreFamily` warning |

The first full unit run had one unrelated terrain-cache timing failure during concurrent validation (2,637/2,638). The unchanged cache test passed its focused repeat (4/4), and the complete repeat passed 2,638/2,638. Both receipts remain retained; no Atlas source or thresholds were changed. Early disposable fixture-order/profile errors are also retained.

The production build is `iCUWmVl5dw1avsvOFHy5l`. All 1,813 files under `src/` and `public/` match its isolated source copy. Manifest SHA-256: `182abbdd046d485a34f0e56fd3915ca7634669f8b2ff22bea52b71105c4cc9d0`.

Current evidence is ignored under `artifacts/character-spreadsheet-print/legal-correction/`: `pdf-receipt.json`, `native-legal-receipt.json`, `source-parity.json`, `verified-contact.png` and `native-print-preview-legal.png`. Earlier 8 × 10 evidence below is historical and superseded. Those earlier checks established bounds/page count but did not establish the owner's required page coverage or printed line clarity; the new checks measure both.

No migration, new runtime dependency, shared DEV/Production access or owner-service restart is required or performed. Tests wrote only to newly owned disposable PostgreSQL targets. Printing remains read-only and does not initialize firearms, activate abilities or alter Character state. Recovery is a code rollback; no data rollback is required. Existing print choices remain available. The unrelated interior-report edit remains local and untouched.

Publication is authorized on main; deployment is not part of this task. No physical print job was submitted during validation, so owner confirmation of actual paper output remains separate.

## Historical 8 × 10 attempt — superseded and rejected for print quality


Delivered locally on 2026-11-01. Application commit: `ea995a66d836ed47c46367296bc7683d122dd66a`, based on `9a50454f00a3e9997bc3d815689a1b45fae9f0de`.

Print Options now offers **Original Spreadsheet Sheets** alongside all existing print choices. The eight requested front/back layouts come from the [owner's workbook](https://docs.google.com/spreadsheets/d/1iVoWXAvnI309fw8lKOa0uD6Ct1i0kfSgQ1kIZ92-Xu0/edit). Each selected layout is one **8 × 10 inch page**, with 0.35-inch side margins and 0.4-inch top/bottom margins. Front plus Skills Back is the initial spreadsheet selection; individual backs and all eight remain selectable.

The final owner direction is a minimal tabletop reference. Quick rolls show only the named skill and percentage, such as “Blink Step 21%.” Durability shows only its recorded number. The status area contains compact active effects and relevant extra records, without repeated race, movement/Initiative or equipment reference prose. Identity marks are a short summary; full authored descriptions remain in the existing detailed print choices. Ammunition stays in inventory rather than occupying weapon rows. Body Shot Bob and the complete hit-location key occupy the front's hit-locations area.

The option refreshes the existing authorized saved-Character snapshot and retains the explicit unsaved-edit choice. It does not save the Character or apply gameplay effects. Existing calculations supply attributes, roll targets, health, mana, damage and protection. Named systems and distinct allocations are not combined into invented ranks or percentages.

### Verification

These are separate receipts, not one uninterrupted aggregate:

| Check | Result |
| --- | --- |
| Full feature suite | 2,636/2,636 pass across 326 files |
| Focused final print/mapping regressions | 12/12 pass after the final compact-label cleanup |
| Fresh owned PostgreSQL action checks | 14/14 pass, including the existing Character authorization boundary |
| Final headed Chrome journey | Pass: all eight and individual selections, same-page excess skills, mixed systems, passive ability without a fabricated roll, desktop/820px/390px controls, saved-record refresh, unsaved-edit preservation and unchanged database fingerprints |
| Actual Chrome PDFs | All eight selected layouts produce exactly eight pages; the compact front/back example produces exactly two |
| PDF geometry and text | Every page is 576 × 720 points (8 × 10 inches); all projected cells and same-page notes are present, within page bounds, with no extra blank page or second shrink |
| Crowded fixture | 65 ordinary skills plus supernatural training, inventory quantities and separate charged copies fit the selected layouts; minimum measured text is approximately 6.5pt in this stress fixture |
| Native printer preview | Inspected actual Chrome preview for the available ET-2800 driver, including selecting its “8 x 10 in” paper option; the front/back packet remains two pages with the whole form and Bob visible |
| Production, TypeScript, lint | Pass; full lint has zero errors and one existing unused `LoreFamily` warning |

Final isolated production build: `0pDtfBjopjPUvVqb3guZY`. All 1813 files under `src/` and `public/` match the isolated build source. Source/asset manifest SHA-256: `d5a0f616a56d18de122c5b3f803a054fb2183b878ff427a9485bc7cd4a54265b`. The OFL license's trailing whitespace was normalized without changing its wording.

Large source exports, logs, PDFs, page renders, native-preview captures and prior failed attempts remain ignored under `artifacts/character-spreadsheet-print/`. Final receipts are `browser-receipt.json`, `pdf-receipt.json` and `source-parity.json`; review images include `verified-contact.png` and `native-print-preview-8x10.png`. PDF verification is reproducible with `scripts/verify-character-spreadsheet-pdfs.py` after the disposable browser runner. Its PyMuPDF/Pillow dependencies are local QA tools, not application dependencies.

Earlier continuation-page output, an extra blank page, inherited paragraph sizing, screenshot instability and an invalid native capture made with forced screen-media emulation were corrected. Their evidence remains retained. The final native preview resets that emulation, selects the supported paper size, captures the result and cancels without submitting a print job.

### Release and recovery

No new migration, environment setting or runtime package is required. The title font and OFL license are bundled locally. The Google workbook was read/exported only; shipped template data contains formatting and labels, with no formulas, cached source Character data or live Google dependency.

The printing increment is technically ready for controlled release from the local application commit. Use the existing operator-managed publication/deployment process and verify the baseline migration ledger separately; shared DEV/Production was not contacted. This task did not push, deploy, restart owner services or modify shared data. The unrelated interior-report edit was preserved.

Recovery is a code rollback of the optional printing change; no data rollback is needed. The original printing presets remain available. This fixed-page option deliberately summarizes reference prose; if unusually large relevant records cannot fit at its minimum legible size, printing reports that layout problem instead of silently clipping records. Native preview/PDF inspection does not establish physical-paper output or final owner acceptance.
