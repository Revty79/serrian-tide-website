# Paper Character Sheet — visual review

## Checkpoint for Ember — September 24, 2026

Work stopped at the user's request for inspection before a planned replacement of the printing system with a more systematic approach and genre-specific sheets. This implementation is a review checkpoint, not approval of the final printing architecture or visual design. No replacement architecture or genre selection has been started. The reusable saved-data boundary, authoritative calculation connections, regression coverage, and populated samples are the main inspection points below.

The additional **Paper Character Sheet** option is integrated into the shared Print controls in Realms and G.O.D.'s Realm. The existing four formats and the Quick Reference default are unchanged. Detailed spell/ability references, full skill descriptions, full item descriptions, and story are independently selectable and off by default.

Start with [Adrian's core PDF](adrian-core.pdf), then [his reference-enabled PDF](adrian-with-references.pdf). The [page-image gallery](index.html) includes every page of both exports and the two additional demonstration characters. Approval of the design remains pending.

## Design and content

The original PDF/workbook and both supplied concept images informed the boxed arrangement and restrained ornament. The compact mountain/castle masthead is an original vector drawing. Headings and character names are selectable serif text; body text and tables use 10-point type. Blue section bars, fine rules, and white writing areas remain legible in grayscale. No image of a sheet is used as a background.

Adrian's core is two US Letter portrait pages. His five Core Skills occupy the front-page quick-roll boxes; the reverse contains his complete Spellcraft tree, all nine inventory entries, Eidetic Memory's mechanical rules, and all six spells with current casting values, duration, structured effects, and recorded requirements/limitations. Skills retain their actual parent relationships, including children purchased later. The core excludes long flavor descriptions; selected references retain their full text. Repeating page margins identify the character, campaign, recorded UTC timestamp, and page number.

The extra samples exercise the same renderer:

- **Mara Reed — DEMO A:** ordinary skills and equipment, a partially equipped stack, healing potions, recorded damage, nonzero progression, and no empty spellcasting sections.
- **Ilyra Voss — DEMO B:** long skill paths, 23 owned inventory rows, exact wand copies with 2/5 and 4/5 charges, recorded damage, 37/54 mana after 17 spent, and deliberately long descriptions that continue across pages. These are labeled disposable demonstration records, not additions to the game catalog.

## Data connections and terminology

| Printed information | Existing source used |
| --- | --- |
| Identity, progression, owned skills/items, derived abilities, permitted story | Existing authorized `getCharacter` saved aggregate; no editor draft input |
| Attribute modifiers, roll targets, skill ranks, movement, Base Initiative | Existing character rules and print data builder |
| Current HP, damage, pools, anatomy and hit-location names | Active Health reader; existing Body Shot Bob component |
| Current/max/spent mana and practitioner level | Active Mana reader |
| Psyonics and Bardic Resonance | Existing magic-system mapping and actual owned allocations; no fixed disciplines from the images |
| Equipment states, partial stacks, exact copies, charges | Equipment State reader and saved owned instances |
| Armor, natural/temporary protection, active conditions | Protection Layers and Active Effects readers |
| Weapon rolls, conditional damage and firearm timing | Existing weapon governance, character weapon rules and firearm timing resolver |
| Ammunition and magazines | Existing Magazine Inventory and Firearm Setup readers |
| Currency names and quantities | Existing `getStoredCampaignMoneyBreakdown`; no invented gold/silver list or new conversion formula |
| Playable spell mana and casting time | Existing `resolveCharacterSpellCastingContext` and `planSpellCast`, with current mana/practitioner context and Known Spell circumstance |
| Spell effects, duration, components, concentration and limitations | Saved construction, existing calculator/rule definitions, progressive resolution and gameplay effect planner |

“Core Skills,” “Psyonics,” “Bardic Resonance,” “Base Initiative,” and movement “Initiative” follow the current program. The movement result is not relabeled as distance per Initiative. Actual hit locations, campaign currencies, owned skills, and resource systems determine the content; image labels and old lists are not authoritative.

The print action reuses existing access checks and reads runtime state in a read-only transaction. Printing does not call save, spend resources, complete creation, or change ownership. Unsaved edits trigger an explicit choice to print the saved record or return to editing; both preserve the draft.

Adrian's samples use his real saved local-development record (character 14, The Breaking), captured read-only and copied into the isolated disposable review database. The normal authenticated player sheet and actual Print controls produced the PDFs. The source record, definitions, account credentials, and production data were not changed to make the examples.

## Recorded disagreements retained for review

- **Charged Grasp cost:** 15 is imported catalog metadata (`spell-import-source.spreadsheetReference.statedSpellCost`); 5 is the construction's base mana cost. Adrian's existing gameplay preview calculates **4 mana, 2 combat Initiative, and 4 out-of-combat seconds** for a Known Spell at his current Novice level. The paper's playable value matches that preview. The full skill-description option explicitly labels catalog mana as metadata, not a calculated casting cost.
- **Charged Grasp effect:** the structured effect plans 1 localized Damage; its saved description says 2 lightning damage.
- **Eye of Secrets:** the construction records 5 Buff increments; the saved description says allies gain +5% perception.
- **Stasis Snare:** the construction records 1 Initiative increment of Decelerate/Slow plus Immobilize; the saved description says −2 Initiative and reduced mobility.

The reference pages label structured rules and **Saved description** separately and identify effects that require G.O.D. resolution. These authoring disagreements were not resolved by changing character data, definitions, or formulas. Unavailable casting contexts or incomplete sources are labeled rather than supplied with invented values.

## Verification

The disposable harness runs the real server actions and authenticated browser routes. It checks the selected character, all existing print formats/default, exclusive Paper rendering, optional references, player and owner access, rejected foreign/forged requests, unsaved-draft cancellation/printing, mobile controls, and unchanged persisted character/runtime/ownership records after printing. Existing advancement, inventory, healing, restoration, navigation, and creation-lock checks remain in the harness.

The new action checks also compare printed spell costs and timing against the authoritative gameplay preview while preserving conflicting import metadata, verify Psyonics/Bardic Resonance names/resources, and check current health, mana, progression, and individually tracked charges.

`verify-paper-character-pdfs.py` checks the actual exported PDFs, including Letter dimensions, safe text bounds, page identification, every selected prose paragraph and table cell, preserved repeated rows/copies, long-text end markers, and core pagination. It renders every page for inspection and writes [the detailed results](pdf-verification.json). Chromium's Arial PDF subset can map punctuation to replacement characters during text extraction; the comparison checks all letters/numbers, and the rendered punctuation is inspected visually.

Final results against the corrected implementation:

| Check | Result |
| --- | --- |
| Focused Paper, existing print, spell casting/runtime, and currency unit tests | 42/42 passed |
| Real server-action/database checks inside the disposable harness | 14/14 passed |
| Full character-sheet browser harness with Paper samples enabled | Passed, including existing advancement/inventory/healing/navigation checks and all four legacy print choices |
| Saved Adrian snapshot through authenticated player sheet and actual Print controls | Passed; core and selected references exported without changing persisted records |
| Typecheck | Passed |
| ESLint on the 13 new/modified TypeScript files | Passed |
| Final production build, isolated under ignored artifacts | Passed; temporary generated tsconfig includes restored |
| Actual PDF content, bounds, page identification and pagination | Passed: 122 selected prose paragraphs and 113 table rows across the four exports |
| Exported page images | All 15 pages inspected; Adrian's core also checked in grayscale |
| `git diff --check` | Passed |

The final PDFs contain 2 pages for Adrian's core, 4 with spell/ability references, 2 for Demo A, and 7 for Demo B with fuller references. Demo B needs a genuine third core page because of its large inventory and skill tree. Demo A intentionally has a sparse reverse because it owns only four skills and five items; this checkpoint retains a front/back core rather than introducing a separate one-page format.

Reproduction entry points:

```powershell
node --import tsx --test src/features/characters/paper-character.test.ts src/features/characters/character-print.test.ts src/features/characters/character-spell-casting.test.ts src/features/characters/character-spell-runtime.test.ts src/features/characters/currency-rules.test.ts
$env:SERRIAN_PAPER_SAMPLES='true'
node --import tsx --test --test-reporter=tap scripts/character-sheet-pass-one-disposable.test.ts
python scripts/verify-paper-character-pdfs.py
```

The PDF verifier requires PyMuPDF and Pillow. The disposable PostgreSQL harness requires an unrestricted Windows process for `initdb`. Adrian's test export additionally used `SERRIAN_PAPER_LOCAL_SNAPSHOT` pointing to an ignored, read-only local-development snapshot; that database snapshot and account data are deliberately not committed. The committed Adrian PDFs, content manifests, and page images preserve the inspection evidence. The self-contained demo fixtures can be regenerated without that snapshot.

The full gameplay-completion suite was not rerun during this print-only pass, and no stale migration-count assertions were changed. Physical printer output and browsers other than the installed Chrome have not been verified; human visual approval remains outstanding. No migration, deployment, container functionality, new gameplay mechanics, permission changes, or source gameplay-data edits were made. The user authorized committing and pushing this checkpoint for Ember's inspection after the implementation work stopped.

## Changed implementation files

- `src/app/characters/character-print-center.tsx` and the print-center props in `character-editor.tsx`: additional option, saved-record loading, reference selections, and unsaved-edit choice.
- `src/app/characters/paper-character-actions.ts`: authorized saved-record read boundary.
- `src/features/characters/paper-character.ts`, `paper-character-service.ts`, and `paper-spells.ts`: saved/runtime presentation data using existing readers and calculations.
- `src/app/characters/paper-character-sheet.tsx`, `paper-character-sheet.css`, and `paper-sheet-masthead.tsx`: reusable paper layout and vector ornament.
- `scripts/character-paper-browser.ts`, `character-paper-review.ts`, `verify-paper-character-pdfs.py`, extensions to the existing disposable harness/action tests, and `src/features/characters/paper-character.test.ts`: behavior and PDF verification.
- `docs/architecture/theme-development.md`: records the requested fixed blue print-ink exception; screen controls retain the shared semantic theme.
- This sample directory: populated PDFs, page images, content manifests and review results.
