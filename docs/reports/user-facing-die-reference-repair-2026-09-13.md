# User-facing die reference repair

## Scope and approval

The user approved replacing Annihilation Field's backlash with 8 damage, then
delegated the remaining user-facing die references after Astral Step's proposed
3 damage replacement. Applied to local `serrian_tide_dev` only.

These are selected fixed catalog values, not a new universal dice-conversion rule.
Most replacements use the former average rounded up. The remaining 2d6 penalties
use the user's approved 8 damage precedent. Changed damage clauses use plain
damage wording instead of the old vitality, psychic, sonic, or mental-fatigue
labels. Conditions, timing, other effects, numeric construction selections,
modifier costs, and calculation snapshots were preserved.

## Changes

| Spell | Skill ID | Fixed replacement |
| --- | --- | --- |
| Annihilation Field | 766 | 8 damage if concentration breaks; approved and applied earlier |
| Astral Step | 778 | 3 damage if interrupted |
| Eclipse of Eternity | 781 | 8 backlash damage if concentration fails |
| Eternal Citadel | 884 | Unstable terrain for 3 days; 8 backlash damage upon dismissal |
| Eyes Beyond Time | 871 | 11 damage if concentration breaks; existing stun unchanged |
| Foresight Step | 867 | Lose 3 Initiative next round if concentration breaks |
| Fracture of the Infinite | 1050 | 2 damage during the lingering step |
| Genesis Metamorphosis | 833 | 4 damage on the failed Focus roll; modifier cost unchanged |
| Genesis Renewal | 923 | 8 backlash damage after use |
| Genesis Transmutation | 820 | Lose 6% of max HP on failure; existing permanent-backlash wording unchanged |
| Nightmare Menagerie | 741 | Hallucinations for 3 steps if concentration breaks |
| Oblivion Veil | 768 | 18 damage per round sustained |
| Reality Bastion | 883 | 4 damage when dismissed |
| Reflective Maelstrom | 767 | 4 damage for each failed reflect roll |
| Spell Shatter | 761 | 3 backlash damage on the failed check |
| Threads of Destiny | 869 | 4 self damage if concentration breaks |
| Web of Insight | 866 | 3 damage if disrupted |

The previously approved Equipment Charges example now reads:
"Describe when the item recharges and how many Charges it restores."

## Preserved boundaries

- Kept d10 hit-location labels and percentile/d100 roll labels.
- Kept the in-world Dice Set item; it is inventory, not a resolution rule.
- Did not rewrite test fixtures, identifiers, imported source records, history,
  character copies, or unrelated spell wording.
- Edited only `skill_extension.data_json` and the corresponding `updated_at` for
  the 16 remaining spell-construction records. All other extension records were
  compared before and after and were unchanged.
- This is a catalog wording/rule-value repair. It does not add automated damage,
  backlash triggers, spell resolution, or duration processing.
- No production access or schema changes. Git publication was requested separately
  after the DEV repair was verified; publishing the code does not apply database
  changes to another environment.

## Verification and recovery

- `node --import tsx --test scripts/repair-spell-die-references-dev.test.ts src/features/items/item-charge.test.ts`: 33 tests passed.
- Focused ESLint on the repair script and tests passed.
- `npx.cmd tsc --noEmit --incremental false`: passed.
- Pre-apply plan: 16 spells changed; Annihilation Field already matched.
- Post-commit reads matched all expected documents.
- Repeated plan: zero changes.
- Read-only scan: 371 active spell documents, no remaining die notation in their
  user-facing text. Internal identifiers were excluded.

The guarded script supports `--plan` and `--apply`, verifies exact catalog
identities and expected wording, and saves original rows before updating.

Applied at `2026-09-13T20:40:25.394Z`.

Recovery record for this 16-spell pass:
`C:\Users\birev\AppData\Local\Temp\serrian-spell-die-reference-repair-2ZGxX7\before.json`

Verified application receipt:
`C:\Users\birev\AppData\Local\Temp\serrian-spell-die-reference-repair-2ZGxX7\applied.json`
