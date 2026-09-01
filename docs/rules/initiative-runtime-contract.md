# Serrian Tide Initiative Rules Contract

## 1. Core Principle

Serrian Tide Initiative is a **continuous combat-time system**, not a conventional turn-order system.

Combat proceeds from higher Initiative toward lower Initiative.

The combatant with the highest available Initiative is eligible to act.

If that combatant remains highest after acting, they may act again immediately.

There is no one-action-per-round restriction.

A faster combatant may legitimately act multiple times before a slower combatant acts.

---

# 2. Starting Initiative

Base Initiative is derived from Dexterity using the canonical Character rule.

Total Initiative is derived from:

```text
Base Initiative × Base Movement
```

Example:

```text
DEX 30
Base Initiative 7
Base Movement 5

Starting Initiative = 35
```

Starting Initiative is the combatant's initial current Initiative when combat begins.

No Initiative roll is made.

There is no 100-to-0 Initiative system.

---

# 3. Current Initiative

Each combatant has:

```text
Normal / Total Initiative
Current Initiative
```

Current Initiative changes throughout combat.

A combatant normally acts when they hold the highest current Initiative among eligible participants.

---

# 4. Actions Occupy Initiative Time

Actions are not conceptually instantaneous.

An action begins at the actor's current Initiative and completes after its full Initiative Cost has elapsed.

Example:

```text
Bob Current Initiative: 35
Sword Initiative Cost: 8

Action starts: 35
Action completes: 27
```

Conceptually:

```text
35
34
33
32
31
30
29
28
27 — action completes
```

For uncomplicated tabletop use, the interface may subtract the cost directly when nothing happens during that interval.

Internally, however, the runtime must understand that the action occupied the entire Initiative span.

---

# 5. Highest Initiative Acts

Example:

```text
Bob:   35
Ryan:  30
Mark:  24
```

Bob acts first.

If Bob spends 5:

```text
Bob: 30
Ryan: 30
Mark: 24
```

Bob does not receive an artificial turn restriction.

Initiative position determines eligibility.

---

# 6. Ties

Combatants at the same Initiative act at the same combat-time point.

If opponents at the same Initiative both attack and neither chooses defense, both attacks may resolve.

An incapacitating result at that same Initiative does not retroactively erase another action that also completed at that point.

If one combatant chooses defense against another, resolve the appropriate opposed roll.

### Completion precedence

If a pending action **completes** at the same Initiative where another combatant becomes eligible to **begin** a new action, the already-running action resolves first.

Example:

```text
Ryan begins punch at 23
Punch completes at 21

Bob is waiting at 21
```

At 21:

1. Ryan's punch resolves.
2. Bob may begin his action.

They occupy the same combat-time point, but completion precedes a newly beginning action.

---

# 7. Action Affordability

Normal actions may not voluntarily overspend Initiative.

Example:

```text
Current Initiative: 5
Desired attack cost: 8
```

The attack cannot begin.

The character may choose another affordable action, Hold, Pass, move, or otherwise act within available Initiative.

---

# 8. Long and Multi-Round Actions

Actions explicitly capable of spanning rounds may begin even when their total Initiative Cost exceeds the actor's current Initiative.

This includes multi-round spells, rituals, and similar actions.

The G.O.D. may also rule that an unusual action can span rounds when appropriate.

Example:

```text
Current Initiative: 5
Spell cost: 12
```

The caster may begin.

This round:

```text
5 Initiative is spent casting.
Current Initiative reaches 0.
Spell remaining cost = 7.
```

Next round the caster receives their new Initiative and automatically continues the spell.

The casting does not restart.

---

# 9. Ongoing Actions

Once a combatant begins a long action, continuing that action is their action until one of the following occurs:

* the action completes;
* the actor voluntarily abandons it;
* it is interrupted;
* the G.O.D. rules otherwise.

The actor cannot normally pause the action, perform unrelated actions, and later return to it.

---

# 10. Pending Actions on the Shared Timeline

Multiple actions may be pending simultaneously.

Whichever event reaches its completion Initiative first resolves first.

Example:

```text
Bob spell:
starts 35
completes 23

Ryan action:
starts 25
completes 22
```

Timeline:

```text
25 — Ryan begins action
23 — Bob's spell resolves
22 — Ryan's action would resolve
```

Ryan's action does not automatically finish before Bob's spell merely because Ryan began his action more recently.

There is one shared Initiative timeline.

---

# 11. Successful Effects Can Interrupt Pending Actions

If a combatant is successfully affected while performing a pending action, that action is interrupted.

What happens to the interrupted action depends on the effect, the action, and the G.O.D.'s ruling.

Examples include:

* unconsciousness may clearly end the action;
* knockdown may end or alter it;
* damage may interrupt it;
* ritual magic may leave residual progress;
* Talismanism may remain partially recoverable;
* other unusual cases are adjudicated by the G.O.D.

The tabletop tool records the interruption.

It does not automatically determine narrative or magical consequences.

---

# 12. Initiative Spent Before Interruption

When an action is interrupted, the actor loses only the Initiative that actually elapsed before the interruption.

Example:

```text
Action begins at 25
Would finish at 22

Interrupted at 23
```

Result:

```text
Initiative spent: 2
Current Initiative: 23
Unspent action cost: 1
```

This rule applies to spells and ordinary pending actions.

---

# 13. Voluntarily Abandoning an Action

A combatant may voluntarily abandon an ongoing action.

They lose only the Initiative already spent.

Remaining unspent Initiative Cost is not charged.

Special consequences remain subject to the action itself and G.O.D. ruling.

---

# 14. Resuming Interrupted Actions

Interrupted actions are not universally resumable or universally destroyed.

The G.O.D. decides.

Possible rulings include:

* end the action;
* resume from retained progress;
* restart at full cost;
* resume with an adjusted remaining cost.

The tracker must retain:

```text
Original Initiative Cost
Initiative Already Spent
Remaining Cost
Status
```

and provide G.O.D. controls for resolution.

Ritual casting, multi-caster magic, and Talismanism are important examples where residual progress may remain.

---

# 15. Hold

Hold is a tactical action.

A combatant who Holds:

* does not spend their Initiative;
* retains their current Initiative position;
* remains active in the round;
* may later intervene when tactically appropriate;
* may interrupt lower-Initiative actions before they complete when the timing permits.

Example:

```text
Ryan: 23 — Holding
Bob:  21
Mark: 20
```

Ryan has deliberately preserved his speed advantage.

If Mark begins an action at 20, Ryan may stop Holding and intervene using his held Initiative.

Holding is specifically intended to create tactical opportunities such as:

* waiting for an opponent to expose themselves;
* preparing to interfere with spellcasting;
* protecting another combatant;
* timing a spell or attack.

Holding counts as the combatant's participation for Combat Step purposes.

---

# 16. Pass

Pass is different from Hold.

A combatant who Passes:

* voluntarily stops acting for the remainder of the round;
* retains remaining Initiative for carryover;
* cannot jump back into that round normally.

Example:

```text
Current Initiative: 15
Combatant Passes
```

The 15 is banked for the next round.

---

# 17. Round End

A round ends when nobody will continue acting.

This may occur because:

* everyone has reached 0 or below;
* nobody has enough Initiative for an action they wish to perform;
* remaining combatants Pass.

Characters are not required to spend themselves to exactly zero.

They may preserve Initiative.

---

# 18. Carryover

Positive unused Initiative carries into the next round with no cap.

Example:

```text
Normal Initiative: 35
Remaining Initiative: 5

Next round:
35 + 5 = 40
```

A combatant who Holds an entire round may carry the entire pool.

Example:

```text
Normal Initiative: 35
Held entire round: 35

Next round:
35 + 35 = 70
```

This is intentional.

---

# 19. Initiative Debt

Initiative may legitimately become negative through forced mechanics.

Valid causes include:

* a reduction in Initiative capacity;
* a direct Initiative penalty;
* a previously committed/deferred Initiative cost becoming due.

Example:

```text
Current Initiative: 3
Direct penalty: -5

Current Initiative becomes -2.
```

Negative Initiative debt carries into the next round.

Example:

```text
Normal new Initiative: 30
Carried debt: -4

New Current Initiative: 26
```

A combatant may NOT deliberately create debt merely to perform an unaffordable normal action.

---

# 20. Initiative Capacity Changes

Changes to Dexterity, Base Movement, or movement mode alter Total Initiative.

Current Initiative is adjusted by the difference between the old and new Total Initiative.

Example:

```text
Old Total Initiative: 35
Current Initiative: 20

New Total Initiative: 45
Difference: +10

New Current Initiative: 30
```

The combatant does not receive a full refresh.

The reverse also applies:

```text
Old Total: 40
Current: 26

New Total: 30
Difference: -10

New Current: 16
```

---

# 21. Capacity Changes Below Zero

If a capacity reduction pushes Current Initiative below zero, negative debt is allowed.

Example:

```text
Current: 6
Capacity difference: -10

New Current: -4
```

Further capacity reductions apply immediately even while negative.

If capacity is later restored while the combatant is already negative, that recovery does NOT immediately pull them back upward during that round.

The restored capacity applies when the next round begins.

---

# 22. Direct Initiative Changes

A direct Initiative effect changes Current Initiative only.

Example:

```text
Current Initiative: 20
Effect: +5 Initiative

Current Initiative: 25
```

When the effect later expires, the +5 is not clawed back.

Likewise:

```text
Current Initiative: 20
Effect: -5 Initiative

Current Initiative: 15
```

The 5 is not restored simply because the effect expires.

Direct Initiative effects alter position on the combat timeline rather than Initiative capacity.

Direct penalties may push Initiative below zero.

---

# 23. Movement

During combat:

```text
1 Initiative = movement up to Base Movement distance
```

Current working unit is feet.

Example:

```text
Base Movement: 3

Spend 1 Initiative:
move up to 3 feet
```

Therefore:

```text
30 Initiative × 3 feet = up to 90 feet of movement
```

if the entire Initiative pool is devoted to movement.

---

# 24. Movement Mode Changes

Changing movement modes changes Total Initiative.

Apply the normal Initiative-capacity difference rule.

Example:

```text
Flight Total Initiative: 40
Current Initiative: 26

Land Total Initiative: 30
Difference: -10

New Current Initiative: 16
```

---

# 25. Reactions

A reaction opportunity occurs when another combatant's pending action crosses the reacting combatant's Initiative position before that action completes.

Example:

```text
Bob: 35
Ryan: 30

Bob begins an 8-Initiative attack.
Completion: 27
```

Because Bob's action passes Ryan's 30 before reaching 27, Ryan receives a reaction opportunity.

---

# 26. Reaction Cost Commitment

When a reaction is declared, its full Initiative Cost is committed immediately.

The outcome of the reaction may later reconcile that cost.

---

# 27. Dodge

Dodge costs:

```text
1 Initiative
```

The defender may move up to Base Movement while making the relevant Dodge roll.

Successful Dodge:

* defender spends 1 Initiative;
* attacker spends normal attack Initiative;
* attack misses;
* defender may move up to Base Movement.

Failed Dodge:

* defender still spends 1;
* attacker spends normal attack cost;
* attack resolves normally.

A successful Dodge does not add additional Initiative penalty to the attacker.

---

# 28. Block / Parry

Block or Parry initially commits the defending weapon's Initiative Cost.

### Failed defense

If the defender loses the opposed roll:

```text
Defender spends full defensive weapon Initiative Cost.
Attacker spends normal attack Initiative Cost.
Attack resolves normally.
```

### Successful defense

If the defender wins:

```text
Defender ultimately spends only 1 Initiative.

Attacker loses:
their own attack Initiative Cost
+
the defender's weapon Initiative Cost.
```

Example:

```text
Attacker weapon: 8
Defender weapon: 6

Successful Parry:

Defender cost: 1
Attacker cost: 14
```

---

# 29. Reaction Timing

A declared reaction is resolved at its reaction opportunity on the shared Initiative timeline.

The Initiative timeline does not reverse.

Do not implement reactions as a last-in/first-out stack that rewinds combat time.

Holding Initiative may allow a combatant to tactically intervene in a lower action.

---

# 30. Reaction Chains

A reaction may itself create circumstances where another valid reaction is possible.

This is allowed.

However, all reactions remain part of the single shared Initiative timeline.

The system must not reverse combat chronology.

---

# 31. Combat Casting

Combat Casting remains a **Special Ability**.

By default, reacting while casting interrupts the spell.

Without Combat Casting:

```text
Dodge → interrupts casting
Block → interrupts casting
Parry → interrupts casting
```

With Combat Casting:

```text
Dodge → may maintain the spell
Block → still interrupts
Parry → still interrupts
```

A Combat Casting Dodge still costs 1 Initiative.

However, this Dodge cost is deferred until the spell completes, is interrupted, or is abandoned.

The Dodge does not delay the spell's existing completion point.

Multiple Combat Casting Dodges accumulate deferred Initiative Cost.

Example:

```text
2 Dodges during casting
Deferred Initiative Cost: 2
```

The deferred cost must still be paid even if the spell never completes.

Deferred cost may legitimately push Current Initiative below zero.

---

# 32. Spell Initiative Cost

Spellcasting uses the final combat Initiative Cost produced by the canonical spell-calculation system.

Casting begins immediately.

Initiative represents casting progress.

Long spells may span rounds.

The Initiative Cost is not simply removed at spell completion; progress occurs throughout the casting interval.

---

# 33. Weapon Initiative Cost

The explicit Weapon Initiative Cost is authoritative.

Do not derive modern weapon Initiative Cost from Damage when an authored Initiative Cost exists.

---

# 34. Creature Attack Initiative Cost

Creature attacks use direct numeric Damage values.

Serrian Tide does not use dice damage strings.

For custom Creature attacks:

```text
Default Initiative Cost = direct Damage value
```

unless:

* a universal natural-action default applies; or
* the Creature attack has an explicit authored Initiative Cost override.

---

# 35. Universal Natural Action Defaults

Baseline natural actions:

```text
Punch / Fist
Initiative Cost: 2
Damage: 2 blunt

Bite
Initiative Cost: 2

Grapple
Initiative Cost: 2

Kick
Initiative Cost: 3
Damage: 3 blunt

Tail Swipe
Initiative Cost: 4
```

Creature-specific attacks may override these values.

Humanoid combatants should have appropriate universal actions such as Punch, Kick, and Grapple available without requiring them to own a weapon.

---

# 36. Item / Equipment Initiative Costs

Equipment actions use Initiative Costs authored on the relevant Item/Profile.

Examples include:

* drawing;
* weapon use;
* ammunition use;
* reloading;
* swapping equipment;
* other equipment interactions.

If no Initiative Cost is defined for an unusual equipment action, the G.O.D. decides.

Do not invent a second universal equipment-cost table unless explicitly added later.

Firing uses the relevant ammunition/action cost where defined.

Reloading uses the authored reload Initiative cost.

---

# 37. Late Entry

A combatant who decides to join an ongoing combat enters with their full Initiative.

They join the active combat timeline immediately.

Physical distance still matters.

Example:

```text
Initiative: 30
Base Movement: 3

Maximum movement if all Initiative is spent:
90 feet
```

If the combatant is two blocks away, they may spend several rounds approaching before becoming able to attack.

A participant may therefore be part of the encounter timeline while still physically outside engagement range.

---

# 38. Leaving and Rejoining

A combatant spends Initiative normally to move away from combat.

Once they have genuinely exited and no longer intend to participate, their combat state may be frozen.

If they change their mind and rejoin:

* they re-enter the combat timeline;
* physical distance remains real;
* they must spend Initiative returning to the fight.

Leaving does not teleport a combatant out of spatial consequences.

Rejoining does not teleport them back.

---

# 39. Ambush / Surprise

If an ambush is not detected:

```text
The ambusher acts first.
```

If the ambush is detected:

```text
Normal Initiative rules apply.
```

---

# 40. Incapacitation

Initiative treatment is condition-dependent.

Do not hard-code all incapacitation as Current Initiative = 0.

Examples:

### Paralysis / suspended agency

A condition may preserve Initiative while preventing its use.

Example:

```text
Current Initiative when paralyzed: 22
```

That 22 may remain suspended while the condition lasts.

When the condition ends, the preserved Initiative may become usable again according to the condition/G.O.D. ruling.

### Unconsciousness / knockout

A true loss of consciousness generally reduces Initiative to 0.

Other conditions may:

* preserve Initiative;
* suspend Initiative;
* reduce Initiative;
* erase Initiative;
* require G.O.D. adjudication.

The condition system should support these distinctions.

---

# 41. Combat Step

A Combat Step is completed when every combatant capable of participating in that slice of combat has taken an action, continued an ongoing action, Held, or otherwise satisfied their participation opportunity.

A fast combatant may complete multiple Combat Steps before slower combatants become capable of acting.

Example:

```text
Bob: 40
Ryan: 20

Bob spends 5:

40 → 35 = Combat Step
35 → 30 = Combat Step
30 → 25 = Combat Step
25 → 20
```

At 20, Bob and Ryan are both capable of participating.

That Combat Step is not complete until both have acted or otherwise satisfied their opportunity.

Holding counts as participation.

---

# 42. Long Actions and Combat Steps

Beginning a long action counts as the actor's participation in that Combat Step.

Continuing that action during later Combat Steps also counts as their action.

Example:

```text
Combat Step 1:
Begin casting.

Combat Step 2:
Continue casting.

Combat Step 3:
Continue casting.

...
```

The caster is not granted extra normal actions simply because the spell remains incomplete.

---

# 43. Combat Round

A Combat Round ends when all active participants are no longer going to act during that round.

Typically:

* Initiative reaches 0 or below;
* participants cannot/will not afford another action;
* remaining participants Pass.

Round reset establishes new Initiative plus valid positive or negative carryover.

Pending multi-round actions continue through the reset.

---

# 44. Initiative and Real Time

Initiative is conceptually a very small slice of combat time.

The approximate idea that 1 Initiative represents roughly a fraction of a second may be used descriptively to help players understand combat speed.

It is NOT a live mechanical conversion.

Do not calculate seconds during combat.

A post-combat report may optionally estimate approximate narrative combat duration from Initiative/round information, but this is informational only and never affects mechanics.

---

# 45. G.O.D. Authority

The Tabletop Operations system is a tabletop aid.

The G.O.D. always retains final control.

The Initiative tracker must allow the G.O.D. to manually:

* alter Current Initiative;
* alter Initiative debt;
* modify action cost;
* change pending-action progress;
* interrupt an action;
* abandon an action;
* resume an action;
* restart an action;
* complete an action;
* change Hold/Pass status;
* alter Initiative when unusual circumstances require it;
* adjudicate interruption consequences;
* resolve exceptional condition behavior.

The tracker calculates objective mechanics.

It does not replace G.O.D. judgment.

---

# 46. Required Runtime Model

The eventual Initiative runtime should conceptually track:

```text
Combatant
  Normal Total Initiative
  Current Initiative
  Status
    Active
    Holding
    Passed
    Incapacitated / Suspended
  Deferred Initiative Costs

Pending Actions
  Actor
  Action
  Original Initiative Cost
  Initiative Spent
  Remaining Initiative Cost
  Start Initiative
  Expected Completion Point
  Status
    Active
    Interrupted
    Completed
    Abandoned
  Resume behavior determined by G.O.D. when necessary
```

The tracker must understand the continuous Initiative timeline rather than simply subtracting numbers after buttons are pressed.

---

# 47. Explicitly Rejected Models

Do NOT implement:

* rolled Initiative added to Initiative stats;
* D&D-style one-turn-per-round Initiative;
* a universal 100-to-0 countdown;
* Initiative wraparound such as `8 - 15 = 93`;
* voluntary ordinary-action overspending;
* automatic tactical decisions;
* automatic NPC behavior;
* automatic interruption consequences;
* automatic spell-backfire determination;
* nested reaction logic that reverses combat time.

---

# 48. Design Principle

The Initiative system exists to represent **who is fast enough to do what before something else finishes**.

It is not simply an ordering list.

That principle explains:

* repeated actions by faster combatants;
* long actions;
* interruptions;
* reactions;
* Hold;
* carryover;
* Initiative debt;
* multi-round spells;
* pending-action completion;
* tactical timing.

Any future Initiative rule should preserve that principle.
