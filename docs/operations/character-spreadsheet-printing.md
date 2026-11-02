# Original spreadsheet Character printing

## Current release: original front layout, Letter only

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
