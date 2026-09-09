# Head HP, unconsciousness and death

Authority: Brannan's clarification, 9 September 2026:

> if a head goes to 0 it is unconcious, if it goes to -1 it is death

Use the head's current HP after accumulated damage, not just the amount of the latest hit:

- At 0 head HP, the combatant is unconscious and cannot act or defend.
- At -1 head HP or lower, the combatant is dead and cannot act or defend.

The earlier example of damage exceeding twice a head's maximum HP describes severing. It is not the minimum threshold for death. This clarification supersedes that threshold in the 8 September implementation report.

The ordinary single-head anatomy path records unconsciousness through the existing incapacitation state, with an explicit reason and head-pool evidence. Exceptional anatomy and shared or multiple heads retain their existing specific-rule boundary.

Both outcomes use existing suspension reconciliation: remove future choices and response requirements, preserve spent resources and recorded Rolls, and preserve actions already completing at the same Initiative. No damage is applied twice and no extra Combat Step is created.

Unconsciousness uses the existing knockout Initiative treatment: remove positive Initiative, preserving any negative debt. Healing does not refill that Initiative.

Recovery checks the exact head pool. Positive total HP alone cannot clear unconsciousness while head HP remains at 0. Supported healing that restores positive head HP can resolve that blocker; unrelated conditions remain. Ordinary healing never clears recorded death, which retains the existing source-linked revival requirement.

The reported Bull had 14 damage against 11 head HP, or -3 head HP. A subsequent read during this correction found it already recorded dead through a G.O.D. ruling. Its existing damage and ruling history were preserved.
