# Confirmed combat XP rules for Pass 7

Authority: Brannan's clarification during the current seven-pass assignment, 8 September 2026. Continue on main tracking origin/main; complete the backend before the replacement screens.

- The Campaign-owning G.O.D. explicitly chooses one of three Creature award modes: full value to the killer; full value to every selected eligible Character; or a shared pool divided among selected eligible Characters. Brannan's latest clarification states that "everyone gets XP" is the full-per-recipient mode, not a division. The shared split remains an optional distinct mode.
- Additional encounter XP is a full amount for every included Character. It is not divided among recipients.
- The awards are additive. In the full-per-recipient Creature mode, a 3-XP Creature gives each included Character 3; an additional encounter award of 10 gives each another 10, totaling 13 each. If the G.O.D. explicitly selects a shared split among three Characters instead, that Creature gives each 1, totaling 11 each after the encounter award.
- Preserve exact defeated occurrence identity, attribution, recipient rules and immutable award history. Missing or ambiguous killer attribution requires an explicit G.O.D. ruling; request order does not establish a killer.
- Prevent duplicate Creature and encounter awards across retries, concurrent calls and repeated closeout. Respect Freeze/Resume and closeout state.
- Reuse the existing reward services. Validate killer-only, full-per-recipient Creature XP, shared split, full-per-recipient encounter XP, combined awards, authorization and duplicate prevention.

Remainder clarification: Brannan first allowed rounding, then proposed giving the higher XP to whoever killed the Creature. Use that later direction: each selected eligible recipient receives the whole-number quotient, and the remaining XP goes to the credited killer among those selected recipients. Thus 3 XP split between two Characters gives the killer 2 and the other 1, preserving the total value. Preserve value, divisor, base share, remainder and killer attribution in the decision evidence. If attribution is missing or ambiguous, require the G.O.D.'s explicit ruling. Do not add an unselected recipient silently; an uneven split must include the eligible credited killer.

Existing implementation inspection: `encounter-closeout.ts` requires nonnegative whole awards; `splitSuggestedExperience` returns exact division without rounding. Apply the clarified whole-share and killer-remainder allocation at the Creature distribution boundary. No award was selected for Goblin 1 in the original fixed combat trace, so that trace still records value 3 without inventing a recipient decision.
