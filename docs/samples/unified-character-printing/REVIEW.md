# Unified character printing review

The integrated character Print options now share a saved-record reader and renderer. Quick Reference remains the default. Fronts, backs, books and full references can be selected independently through Paper Character Sheet or Custom Print. Every back contains ordinary skills, both ability types and owned inventory. Printing does not save the editor or change resources, equipment, ownership or permissions.

## Start here

- [Adrian's core sheet](adrian-core.pdf).
- [Adrian with the optional Spell Book](adrian-with-references.pdf).
- [Readable page-image gallery](index.html), with links to every PDF and full-size page image.
- [General character](example-a.pdf) and [larger character with selected references](example-b.pdf).
- Theme comparisons: [Universal](theme-universal.pdf), [Fantasy](theme-fantasy.pdf), [Modern](theme-modern.pdf), [Apocalyptic](theme-apocalyptic.pdf), [Western](theme-western.pdf), [Science Fiction](theme-science-fiction.pdf), [Horror](theme-horror.pdf), [Plain](theme-plain.pdf).
- [Mixed build](mixed-build.pdf) deliberately selects all five supernatural backs and all five books. Repeated ordinary skills, abilities and inventory are intentional across those selected backs. It is not the default packet.

The five `system-*` samples each select the front, matching supernatural back and matching book. The five `book-only-*` samples contain only the independently selected book. DEMO entries and accounts were created solely in a disposable database; they are not proposed canon. Adrian was exported through the real authorized reader using the existing saved-record snapshot, copied into that same disposable database.

## Data disagreements retained for review

No game data was edited to reconcile these sources:

- Charged Grasp has catalog mana metadata of 15, construction base cost of 5, and a current Novice Known Spell cost of **4 mana / 2 Initiative / 4 seconds**. The playable value uses the existing gameplay planner. Catalog metadata is separately labeled; construction arithmetic is not part of the ordinary handout.
- Charged Grasp's construction records 1 localized Damage while the saved description says 2 lightning damage. The book labels constructed effects and saved description separately.
- Eye of Secrets records five Buff increments in its construction; saved prose describes an ally Perception benefit. The printout preserves both sources without inventing a mechanical conversion.
- Stasis Snare's construction records one Initiative slow increment plus Immobilize; its saved description refers to a larger Initiative reduction and mobility restrictions. The existing saved use notes also describe a resisted result. These remain separately labeled.
- Some intentionally incomplete DEMO constructions have missing sphere or unsupported casting context. They print the existing review messages and unavailable values, not invented costs. Description-only supernatural training still appears in its system's book and compact known-power section where applicable.

Adrian's core has three pages: front, General back, and a real powers continuation. The smaller general character fits two pages in every theme. Full effects, requirements, costs and limitations take precedence over forcing every character into two pages.

## Implementation

See [architecture and reproduction notes](../../architecture/unified-character-printing.md). Main changed files:

- `src/app/characters/character-print-center.tsx` and its call in `character-editor.tsx`.
- `paper-character-sheet.tsx`, `paper-sheet-front.tsx`, `paper-sheet-content.tsx`, `paper-sheet-masthead.tsx`, and `paper-character-sheet.css` in that same directory.
- `src/features/characters/paper-character.ts`, `character-print-options.ts` and its tests. `character-rules.ts` only extracts its existing canonical support-name lookup; campaign eligibility is unchanged.
- Browser/PDF review scripts under `scripts/`, the shared theme documentation, these samples, and individual decorative assets under `public/print/serrian-tide/`.

The seven mastheads are separate generated illustrations, not concept-sheet collages. Actual text and tables remain selectable. The [generation prompts](../../../public/print/serrian-tide/artwork-prompts.json) and replacement asset dimensions are recorded. Plain has no illustration; grayscale review images are included.

## Validation

Final checks on September 24, 2026 (Mountain time):

- **18/18 focused unit tests passed**: print selection, saved paper data, existing print calculations, casting and magic-context parity.
- **14/14 disposable server-action tests passed** on the final tree: authorized saved printing, rejected foreign access/forged flags, totals preservation, advancement, restores, inventory grants/removals, equipment state, ammunition and combat restrictions.
- **Focused Chrome print browser suite passed** on the final tree: all five supernatural systems, description-only powers, both ability types, long descriptions/inventories, exact charged copies, partial equipment quantities, all eight themes, standalone books, independent selections, both authorized entry routes and mobile controls. All five presets exercised the dirty-editor choice without changing the draft or database snapshots.
- **Adrian browser review passed** on the final tree: 15 skill rows, nine inventory entries, six spells, authoritative Charged Grasp casting values and no character/profile writes. Core: **3 pages**. With Spell Book: **6 pages**.
- **24 actual PDFs / 73 pages passed** content, font-size, page-boundary, repeated-row, independent-section, timestamp and page-number checks. The general core is two pages in all eight themes; each single-system front/back/book example is three pages; the mixed selection is exactly 11 pages and its books-only selection five. Every page was rendered and inspected in contact sheets, with full-size review of representative core, continuation, book and grayscale pages. No blank or caption-only spill pages remain.
- **Typecheck, focused ESLint, production build and `git diff --check` passed.** The build compiled the application; it did not deploy it.
- The full shared-sheet Chrome regression also passed earlier in this work, covering navigation, authorized inventory use/management, totals, restoration, creation locks and mobile/keyboard behavior. Later edits only adjusted print composition and spacing; the focused print/browser and server-action checks above ran again afterward.

Reproduction commands and environment switches are in the architecture notes. `pdf-verification.json` contains per-export page counts and checked row/paragraph counts. The local detailed logs are under the ignored `artifacts/character-sheet-pass-one/` folder.

Automated checks supplement visual inspection; they do not constitute human design approval. No physical printer, Firefox or Safari printing was tested, and the entire combat completion suite was not rerun for this printing change. No deployment or database migration is part of this checkpoint.
