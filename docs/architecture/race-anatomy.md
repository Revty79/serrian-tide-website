# Race HP pools and hit locations

In **The Heavens → Races → HP & Hit Locations**, choose **Custom Race anatomy** to start from the existing humanoid table. Name HP pools, allocate percentages, and assign each d10 result (0–9) to a pool. Multiple results may share a pool, including a tail or other body region. The author supplies the actual Race rules; no dragon, naga, or lizardfolk anatomy is invented or prepopulated.

**Standard humanoid** remains the default for every existing Race. The nullable `races.anatomy_json` field is introduced by `0066_race_anatomy.sql`. No character data or authored Race definition is backfilled. Race variants copy the saved anatomy once and remain independent.

## Runtime behavior

- Character Total HP still uses its Constitution and HP Multiplier. Creature size scaling is not applied to Races.
- Custom pools reuse the existing Creature percentage allocation and rounding. As with Creature authoring, incomplete definitions can be saved. Duplicate hit results, invalid percentages and nonexistent pool assignments are rejected by the Race save action. Missing/unmapped results cannot receive automatic localized damage.
- The existing Active Health reader supplies the selected Race anatomy to damage, healing, injuries, incoming-effect targets, combat hit-location choices, and the Paper Character Sheet. The ordinary character chart and existing print formats also use the authored Race anatomy and omit the humanoid silhouette for custom bodies.
- Pool identities survive renames. Removing a pool or restoring the standard body does not clear its persisted damage or injuries; the existing orphaned-pool behavior preserves those records for review. Changes to the Race definition apply to assigned Characters, as existing Race natural protection does.
- Location Effect remains an authored rule requiring a G.O.D. ruling. It is carried into damage-outcome context, including the existing special-location safeguard for automatic head outcomes; text is not converted into new effects.
- Race natural protection retains its existing single-Soak model. Its authoring and runtime labels follow the Race's actual hit locations.

## Existing equipment limitation

Armor coverage uses the program's existing numbered coverage records. This change does not invent anatomy-based fitting, infer armor from body-part prose, or remap owned equipment. Review equipment coverage when altering a Race's hit table. The authoring page states this explicitly. Containers and other inventory mechanics are unchanged.

## Validation and rollout

- 36 focused anatomy, active-health, character-sheet and existing-print tests passed.
- `npm run validate:race-authoring` passed: migration preservation, Race authoring/variants/access checks, actual save/reload and invalid-input rejection, custom anatomy in a player sheet after reload, mobile authoring at 390px, current protection labels, and persisted tail damage/healing. Existing damage and injuries survive pool renaming and removal.
- That harness also passed all 116 existing incoming-effect, Pass 5 runtime and Pass 6 gameplay database tests in a disposable PostgreSQL instance.
- Desktop and mobile screenshots were inspected. Disposable artifacts are under `artifacts/race-authoring` and are not committed.
- Typecheck, modified-file lint, production build and `git diff --check` passed. The complete gameplay-completion suite is separate and was not rerun for this addition.

Apply migration 0066 before running this code against an existing database. During final verification, the ordinary local development ledger changed from 66 to 67 entries and already contained 0066. This task's guarded migration check ran without `--apply` and did not apply it again. A read-only audit verified every ledger checksum, the new schema entry, and all 56 existing Races still having null custom anatomy. No production migration or deployment was performed. The user authorized committing and pushing this addition after verification.
