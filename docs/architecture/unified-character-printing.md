# Unified character printing

The shared Realms / G.O.D. character editor now uses one saved-record print path for Quick Reference, Full Tabletop Character, Complete Character Record, Custom Print and Paper Character Sheet. Quick Reference remains the default: the standard front plus General back. No books are implicitly added to that default.

## Data and permissions

`getPaperCharacterSheet` uses the existing authorized character reader and read-only runtime readers. `buildPaperCharacter` converts that saved aggregate for the existing character calculations; the editor draft is never passed into the print center. The Print button refreshes the snapshot. Unsaved changes require an explicit choice between returning to edit and printing the saved record. Neither option saves or changes gameplay state.

Health anatomy, protection, equipment quantities and exact copies, charges/ammunition, mana, movement, weapon targeting and derived ability eligibility use the existing services. Constructed powers use the gameplay casting planner in Known Spell context with the character's current practitioner level. The canonical support/access-name lookup was extracted from the existing campaign skill rules, without changing campaign eligibility.

Catalog mana metadata is labeled separately from current casting cost. Books distinguish constructed effects from saved descriptions. Printing does not resolve differences by editing definitions or adding rules. Description-only supernatural skills remain available in their corresponding books; the core prints owned leaf techniques and compact constructed powers. Support/access skills and trained branches appear in the back's skill tables.

## Page selection

- Standard front: identity, progression, attribute references, current health/anatomy, resources, movement/Initiative, currency, active weapons, protection, conditions and quick rolls.
- General back: all ordinary and supernatural skills, Special Abilities, Derived Abilities and owned inventory.
- Spellcraft, Talismanism, Faith, Psyonics and Bardic Resonance backs: ordinary skills plus the selected system's support/access skills, training and powers; both ability types and inventory appear on every selected back.
- Independent books: Spell Book, Talisman Book, Prayer Book, Psyonic Skill Book and Song Book.
- Independent full references: skills, Special Abilities, Derived Abilities, inventory, equipment and story/profile.

Repeated skills, abilities and inventory across separately selected backs are intentional. General and system backs can have genuine continuation pages. Every selection starts on its own page; every page identifies the character, section, timestamp and page count. Large text can continue; there are no fixed clipping heights.

Core Derived Abilities show the mechanical effect, structured effects, requirements, costs, limits and use conditions. Full references additionally include introductory description prose. An ability without a governing attribute does not acquire an invented percentage.

## Appearance and artwork

Universal, Fantasy, Modern, Apocalyptic, Western, Science Fiction, Horror and Plain share identical content templates. Genre-flavored presentation headings change only the front's title; mechanical names stay unchanged.

Dedicated engraved masthead illustrations were generated with the built-in image generation tool after inspecting the user's genre examples. Each is stored under `public/print/serrian-tide/<theme>/masthead.png`; the prompt set is in `artwork-prompts.json`. These are individual decorative illustrations, not the supplied collage and not an image of a sheet. All headings, values and tables are real text. Borders are CSS/vector decorations. Plain uses no illustration and no filled section bars.

For replacement artwork, use the same filenames. Source canvases are approximately 2172 × 724 pixels, with the important illustration in the horizontal band y=170–540 and blank central title space. The renderer displays that band at roughly 7.5 inches × 0.82 inches. A higher-resolution replacement can use a proportional 4344 × 1448 canvas; keep the left/right art and blank center in the same proportions and include no lettering. Current review does not require additional artwork.

## Verification and review

`scripts/character-sheet-pass-one-disposable.test.ts` with `SERRIAN_PAPER_ONLY=true` runs the existing server-action permission/state tests, integrated print UI checks, and `scripts/unified-print-browser.ts`. Fixtures are confined to `serrian_character_sheet_dev`. The suite covers all systems, description-only powers, mixed builds, both ability types, quantity/charge preservation, standalone books, themes, unsaved changes and mobile controls.

`SERRIAN_PAPER_LOCAL_SNAPSHOT=artifacts/character-sheet-pass-one/adrian-review-snapshot.json` exports the existing read-only Adrian snapshot in that disposable database. It does not connect to or edit the source database.

`scripts/verify-unified-print-pdfs.py` checks actual Chrome PDFs for page bounds, readable fonts, omitted paragraphs/table cells, repeated rows, independent sections, character/section identifiers and pagination; it renders full-resolution page images and grayscale examples. See `docs/samples/unified-character-printing/index.html` and its review notes for the delivered artifacts and final results. Automated checks support, but do not replace, visual review.
