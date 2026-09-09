# Limb and whole-body incapacity, and combat alerts

Authority: Brannan's 9 September 2026 clarifications following the head-HP correction:

> if a limb hits 0 hp it is incapacitateed

> these things should happen automatically and god should be alerted to when it happens to an actor in combat. a character should also be alerted when they are incapacitated or killed.

> wiht thinghs like the slime or any other creature that its whole body is the hit area, you will have to get hp to 0 to incapacitate and -1 to kill

- A limb at 0 HP or lower is incapacitated. This affects that limb; it does not itself incapacitate or kill the whole actor. No limb-severing threshold is inferred.
- A creature with one whole-body HP pool covering its hit locations is incapacitated at 0 HP and dead at -1 HP or lower. Slime's ten Body results all refer to one 100% Body pool. This rule does not turn an ordinary torso or limb into the whole creature.
- The existing head rule remains: 0 head HP causes unconsciousness; -1 or lower causes death.

The ordinary damage service records the condition automatically at consequence application, using accumulated damage and the exact authored HP pool. Retries preserve one receipt. Limb conditions retain their source effect and recovery history separately from whole-actor participation. Healing above 0 resolves the affected limb's condition; further damage while already incapacitated does not create duplicate alerts. Exceptional authored anatomy retains its explicit ruling boundary.

Combat alerts use retained condition events. G.O.D. sees every actor's death, unconsciousness, incapacity, and limb-incapacity alerts; Players receive their own Character's alerts. Notices remain until acknowledged in that browser session, survive reconnect/refresh, and offer inspection of the actor. Acknowledgement never clears a condition. Actor cards and detail continue to show current conditions after the notice is acknowledged.

This clarification supplies no numerical movement or weapon penalties, handedness assignment, or mapping of every action to a required limb. Those action-specific consequences retain their existing authored-rule/G.O.D. boundary. A disabled limb does not automatically remove all other action opportunities.

## Creature protection clarification

When asked whether blank creature armor or soak means zero protection, Brannan confirmed:

> yes, if they have no armor, they have no soak and therefore block no damage

At an existing authored creature hit location, blank/null/absent armor and soak values mean 0 protection. Ordinary and firearm attacks use this same rule, so Slime's blank Body protection does not block damage calculation. Authored numeric values remain effective. Malformed or negative protection and missing hit locations retain their explicit ruling boundary. This changes runtime interpretation without rewriting the authored creature catalog or frozen encounter snapshots.
