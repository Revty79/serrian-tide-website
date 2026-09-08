# Guided combat checkpoint

Base: e37ef8df337193f0bc84c1f98154cb401096ed85. Development branch: finish-guided-combat.

The actual GOD and Player battle routes now mount the same Initiative-led workspace.
The current task contains the bound attack/defense roller and physical roll input.
Normal melee/Creature attacks, response eligibility, No Defense, Dodge, Parry/Block,
Hold/Pass, movement and explicit next-round controls use the revision-checked commands.
GOD can pause automatic timing/result bookkeeping. No decision or dice roll is automated.
The independent encounter exit is in the header, outside the task's busy fieldset.

This is a BASIC COMBAT PREVIEW, not completed coverage of all campaign combat.
Firearms, authored spell/item/ability paths, exceptional interventions and some rulings
still use retained source-specific controls. Those need subsequent guided integration.
The legacy controls are collapsed and unmounted unless opened.

## Verification

Full local TypeScript and changed-file ESLint passed during this checkpoint.
The local managed browser refused localhost navigation (ERR_BLOCKED_BY_ADMINISTRATOR).
Do not claim a local application-browser pass. The GitHub browser-rehearsal job runs
against a disposable PostgreSQL service and separate GOD/Player browser identities.
Its log and screenshots, not the existence of this file, determine browser test status.

The rehearsal plays two simultaneous attacks at 11, both No Defense choices, timing
to 7, both physical rolls, result application, reload without duplicate application,
another attack/miss, Pass, and next-round carryover. It then ends the encounter.
No direct database writes or resets occur between those play steps.

The fixture schema helper refuses any nonempty database and any URL other than
127.0.0.1/serrian_runner_dev. It commits historical migration statements separately
because PostgreSQL prohibits using a newly added enum value in its adding transaction.
This constructs a fixture; it is NOT a successful production-migration-path test.
No production data, migrations, deployment configuration, or main branch is changed.
