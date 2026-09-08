# Hold and movement correction — repository checkpoint

Base: `144b00106d48238b8e011862775262b405da232b` on `finish-guided-combat`.
Delivery: source changes on `finish-guided-combat`. The previously supplied ZIP is an archival copy, not a required installation step. Use the repository branch; do not apply the ZIP again after pulling this correction.

## Changes

- An eligible holding combatant receives a `held-action` task on both roles' runner screens. The task remains available after another combatant acts or moves. Its owner can attack, move, keep holding, or Pass.
- Acting from Hold uses the existing `heldIntervention` declaration path. It preserves the retained Initiative pool and does not rewind the shared timeline.
- Due rolls, results, rulings, and completions at the current point take precedence. Hold does not permit retroactively changing those outcomes.
- Mandatory owned response tasks are presented before optional Hold controls. An explicit selection remains stable.
- Automatic advancement remains paused while holders are present. G.O.D. checks for interventions and advances explicitly; this patch does not add a mandatory acknowledgment dialog after every action.
- G.O.D. can deliberately start the next round when everyone remaining is holding, passed, suspended, or exhausted. Hold carryover is retained; nobody is silently converted to Pass.
- Move is a visible action button rather than a collapsed section. Its form previews the cost from the current movement mode, preserves destination input, and explains that ordinary movement requires no attack roll.

## Verified in the isolated workspace

- TypeScript `tsc --noEmit`: passed.
- ESLint on all changed TypeScript/TSX/MJS files: passed.
- Focused progression, presentation, and Hold unit tests: 30 passed, 0 failed.
- Two continuous database rehearsals: passed. The expanded rehearsal covers retained Hold, Player ownership, movement from Hold, zero invented movement rolls, and renewed Hold availability after movement.
- Git patch check against a fresh copy of the exact base: checked during packaging.

The database tests used ONLY a disposable local PostgreSQL database. Test fixtures have an authored race movement profile; no production or development campaign records were opened or changed.

## Not verified / not finished

The browser rehearsal authenticated separate G.O.D. and Player test identities, but the local browser refused navigation with `ERR_BLOCKED_BY_ADMINISTRATOR` before loading combat. There is NO completed browser-test pass for this checkpoint. The new browser test is included for an environment that permits local application browsing.

The full repository unit suite was not rerun. This is not a full campaign acceptance release. Supernatural/Spell execution, missing Dodge governance, and special defenses still require their dedicated integration pass. Existing source-specific controls were not removed or rewritten here. No schema, migration, production configuration, or main-branch changes are included.

## Publication verification

The original patch was recovered from `serrian-hold-movement-fix.zip` and applied to a fresh archive whose Git tree exactly matched `144b001`. All application changes and tests are unchanged from that patch; only this delivery note was updated. TypeScript, changed-file ESLint and all 30 focused unit tests were rerun successfully before publication. Database and browser checks above describe the packaged checkpoint logs; they were not rerun during publication. The uploaded Git tree is compared with the locally checked tree before the branch is advanced.
