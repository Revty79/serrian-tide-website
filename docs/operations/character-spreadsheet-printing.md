# Original spreadsheet Character printing

Delivered locally on 2026-11-01. Application commit: `ea995a66d836ed47c46367296bc7683d122dd66a`, based on `9a50454f00a3e9997bc3d815689a1b45fae9f0de`.

Print Options now offers **Original Spreadsheet Sheets** alongside all existing print choices. The eight requested front/back layouts come from the [owner's workbook](https://docs.google.com/spreadsheets/d/1iVoWXAvnI309fw8lKOa0uD6Ct1i0kfSgQ1kIZ92-Xu0/edit). Each selected layout is one **8 × 10 inch page**, with 0.35-inch side margins and 0.4-inch top/bottom margins. Front plus Skills Back is the initial spreadsheet selection; individual backs and all eight remain selectable.

The final owner direction is a minimal tabletop reference. Quick rolls show only the named skill and percentage, such as “Blink Step 21%.” Durability shows only its recorded number. The status area contains compact active effects and relevant extra records, without repeated race, movement/Initiative or equipment reference prose. Identity marks are a short summary; full authored descriptions remain in the existing detailed print choices. Ammunition stays in inventory rather than occupying weapon rows. Body Shot Bob and the complete hit-location key occupy the front's hit-locations area.

The option refreshes the existing authorized saved-Character snapshot and retains the explicit unsaved-edit choice. It does not save the Character or apply gameplay effects. Existing calculations supply attributes, roll targets, health, mana, damage and protection. Named systems and distinct allocations are not combined into invented ranks or percentages.

## Verification

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

## Release and recovery

No new migration, environment setting or runtime package is required. The title font and OFL license are bundled locally. The Google workbook was read/exported only; shipped template data contains formatting and labels, with no formulas, cached source Character data or live Google dependency.

The printing increment is technically ready for controlled release from the local application commit. Use the existing operator-managed publication/deployment process and verify the baseline migration ledger separately; shared DEV/Production was not contacted. This task did not push, deploy, restart owner services or modify shared data. The unrelated interior-report edit was preserved.

Recovery is a code rollback of the optional printing change; no data rollback is needed. The original printing presets remain available. This fixed-page option deliberately summarizes reference prose; if unusually large relevant records cannot fit at its minimum legible size, printing reports that layout problem instead of silently clipping records. Native preview/PDF inspection does not establish physical-paper output or final owner acceptance.
