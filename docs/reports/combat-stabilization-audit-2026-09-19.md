# Combat stabilization audit — 19 September 2026

Audit and stabilization completed locally against `bd202404ffa5e98948e0d179a57bcf9cc03d9c0c`. Supported combat flows have automated service and actual-screen validation. User authorized implementation, provisional catalog authoring, and autonomous decisions while away. Human play acceptance and the catalog/rules review below remain separate. No deployment or Git publication requested.

## Confirmed code and screen defects corrected

- Melee and Hybrid melee no longer require distance, a unit, Reach, or a distance ruling. Authored ranged mode cannot be bypassed by submitting melee. Unknown unconfigured families are unavailable instead of falling through to melee.
- Successful commands release their retry key and physical Roll. A new action gets a new declaration and original Roll. Actor drafts survive inspecting another participant; feedback and G.O.D. ruling drafts remain actor-specific. Defense form state is scoped to its response opportunity. Movement and action previews reject stale state revisions.
- Called Shot requests use the server's required key format, match the exact objective/location/source/target, expose pending/cancellation state, and appear in the main G.O.D. guide. Distance requests also appear in that guide.
- The guide waits for explicit AoE membership, including an explicit empty-area confirmation. It does not automatically resolve an unknown area as empty. Two selected spell victims receive equal damage once.
- Ordinary weapon damage freezes the applicable STR/DEX modifier and general active damage modifiers. Selected-weapon passive damage is excluded from the general pass and counted once through its existing path. Firearms retain their specific normal/called-shot DEX rules and add general active damage through the same modifier reader.
- Optional Weapon-Hit Charges are checked in authored order against the exact owned copy. Unavailable riders are skipped with a recorded reason; the base hit remains valid. Application rechecks availability under a row lock. The existing atomic effect transaction and receipts prevent repeat Charges or damage.
- Derived and Creature abilities require explicit targets. Direct Item Ability effects cannot silently fall back to self. Existing explicitly self-targeted Magic containers retain their authored targeting.
- Creature attack snapshots now honor an explicit `initiativeCost` when supplied.
- The main G.O.D. revival guide opens the actual recovery controls. Recovery operations unavailable at the spell's locked mastery are disabled; the authoritative service still enforces the same source and mastery rules.
- Signed damage modifiers participate in the complete ordinary/bullet damage sum before clamping at zero. The firearm report includes its frozen active modifier in the displayed calculation.
- Attack reports show one base hit per target and list optional powers/costs separately, including the recorded reason for a skipped rider.

## Provisional catalog authoring for review

Scope: 46 previously blank fields on 15 weapon profiles, plus one Skill mapping. Existing authored timings, damage, quantities, ownership, equipment state, Skill allocations and combat history are preserved. These are editable catalog values, not runtime defaults.

| Weapon | Attack Initiative | Draw Initiative | Mode |
| --- | ---: | ---: | --- |
| Baton | existing 6 | 1 | Melee |
| Bowie Knife, Combat Knife, Dagger | 4 | 1 | Melee |
| Hunting Knife, Survival Knife, Trench Knife | 4 | 1 | Melee |
| Stiletto Dagger, Kitchen Knife, Pocket Knife | 4 | 1 | Melee |
| Shortsword | 4 | 1 | Melee |
| Katana | 8 | 2 | Melee |
| Longsword | existing 6 | 2 | Melee |
| Wooden Stake | 4 | 1 | Melee |
| Longbow | existing bow rule | existing 2 | Ranged |

Longbow: provisional Short/Medium/Long = **30/60/120 feet**; its existing prose says 120 feet. Unload = **1 Initiative**. Existing nock/draw/shoot cost **2** stays unchanged. The .357 Revolver's authored **5/25/50 Meters**, timing and ammunition are preserved.

Wooden Stake: provisional **Melee Weapons → Bladed Weapons → Short Blades**, endpoint Skill **122**. Current ancestry is validated before applying. All currently owned weapons already have approved Skill paths, including Ember's Sword of Bad Decisions. No paid Character allocations are changed.

**Applied to loopback `serrian_tide_dev` at 19:28 UTC.** The tool verified all migration hashes, took and fully decoded a custom PostgreSQL backup, checked the exact plan digest again under locks, compared the whole resulting catalog, and verified unchanged digests for **156 other public tables**. A backup restore rehearsal was not run.

- Receipt: `artifacts/player-tabletop-tabs/combat-flow/applied-1789846086565.json`.
- Plan digest: `0728cd0ad85dbde4f5042990450e6c8c1db088cac1ba8eb7f48fd96f9f98871a`.
- Retained backup: `artifacts/combat-audit-2026-09-19/dev-before-catalog.dump` (1,641,392 bytes), copied from the apply tool's temporary backup and verified against its SHA-256 `fdf60ea5ed7b6010763b56ced4e131a2d331100e8f667b316cb749081691305d`.

## Decisions and questions saved for Brannan

1. Are the provisional timings and Longbow range bands above comfortable in play? I chose values now so common weapons are usable; all remain editable in Heavens.
2. Is Short Blades the desired Wooden Stake Skill? I chose its existing close-quarters piercing use.
3. When several optional Weapon-Hit Powers share too few Charges, I chose authored Power order; affordable earlier Powers activate and later unaffordable Powers skip. Should players eventually choose individual riders?
4. Damage modifiers are frozen with the declared attack, consistent with other locked mechanics. Should a buff gained/lost during an unfinished action change that already committed attack?
5. Explicit empty spell AoE remains a valid completed casting and retains its declaration-time Mana cost. No target membership is guessed. This preserves the existing resource timing rule.
6. Creature records lack dedicated attack timing/range/mode fields in the current authoring model. Explicit snapshot timing now wins; existing universal natural-action costs and existing numeric-damage timing fallback remain unchanged pending a catalog authoring decision. I did not silently replace all Creature mechanics.
7. Ability definitions without an explicit self-target container now require selecting the actor as a target for self-use. No ability automatically targets its user because a field was left blank.
8. Special projectiles, thrown-only delivery, energy/chemical/sonic mechanics and manual critical outcomes remain explicit unsupported/ruling boundaries. Assigning a Skill or a draw cost does not implement those effects.

## Remaining catalog scope and deliberate boundaries

The initial read found 201 active Equipment Weapon profiles, 195 missing draw costs, 192 missing ordinary Initiative values (including firearms that use their own timing), and 199 without structured range modes. The general planner proposed 399 fields and listed 108 records needing review, including 89 missing valid default Skill paths. This audit applies only the small batch above. It does not pretend that every imported catalog record is combat-ready.

No engine replacement, firearm rewrite, Skill-allocation repair, legacy-data deletion, equipment granting, encounter reset, production migration, push or deployment. Legacy charged Item Use stays visible as Needs rebuilding; properly authored activated Abilities keep their separate executor. Existing magazine, interruption, injury, defense timing, revival and closeout services remain authoritative.

## Validation

Evidence lives under `artifacts/combat-audit-2026-09-19/` and `artifacts/combat-screens/audit*-2026-09-19/` (ignored local artifacts).

- **1,404/1,404 feature tests**, 166 files: `unit-final-v4.log`.
- **23/23 disposable database scripts, 242/242 service cases**: `services-final-v5.log`. Final centralized firearm calculation separately rechecked **47/47**: `firearms-final.log`.
- Production build, TypeScript, changed-file ESLint, Drizzle migration consistency and `git diff --check` pass. Final build: `build-final-v3.log`; lint: `lint-final-v4.log`. Generated temporary build includes were removed from `tsconfig.json` afterward.
- Final shared DEV read: **61/61 migration hashes match**, no pending migrations, no unfinished effect plans. The 32 recorded combat/Character/resource table digests match the post-catalog snapshot. Catalog application independently verified preservation of all 156 other public tables.
- Browser coverage runs against newly migrated temporary databases and uses the real authenticated `/heavens/tabletop?combat=...` and `/realms/tabletop?combat=...` routes. No browser scenario seeds or mutates shared DEV.

| Actual browser flow | Verified behavior |
| --- | --- |
| Encounter lifecycle | Session/Scene/Encounter start; Player, NPC and direct Creature participation; Freeze/reconnect; withdraw/return/escape; normal and forced closeout |
| Ordinary melee | Source + target + Roll, no distance; damage report/approval; Called Shot request, exact approval and completion |
| Repeated actions | Distinct original Rolls/declarations; safe retry; actor/Creature drafts and targets remain separate; inspecting another participant preserves the Player draft |
| Initiative | Simultaneous choices in both orders; independent overlap/crossings; eligible action or response; Hold at tied and untied Initiative; next round after Pass |
| Defense | Legitimate Creature Block; unavailable response blocked; a second response resets its opportunity, choice, defending weapon and physical Roll |
| Ranged | Bow/Crossbow preparation and firing; pistol setup; durable Player distance request and G.O.D. correction; Beyond Long replaces the ordinary Long modifier |
| Weapons and magazines | Exact owned copy; magazine acquisition/fill/top-up/empty; combat loading; cycle/recoil preparation; ammunition conservation after reload |
| Spells and Items | Learned targeted spell; explicit empty/two-victim AoE; activated Item ability; fixed-Roll Item-Magic AoE; one Roll when required and one resource spend |
| Optional weapon powers | Depleted rider skips with a visible reason while the ordinary hit applies once; exact empty Charge pool remains unchanged |
| Injury and revival | Whole-body incapacitation, limb loss and head death alerts; acknowledgment survives reload; Grand Master Vital Wellspring revives the selected NPC without changing the caster |
| Rewards | Living incapacitated Creature XP; XP after combat ends; surrender XP/Fame; critical kill Fame; forced closeout retains damage/Fame and permits later XP, all once-only |

Browser evidence is cumulative across the full attempt and subsequent focused continuations, **not one uninterrupted final all-case run**. `audit-full-final-2026-09-19` recorded 29 passing result statements before an old fixture's head shot became lethal with STR correctly included. Later runs corrected that threshold, ambiguous catalog selectors, Item ownership fixtures, revival mastery/guide navigation and the second-defense fixture SQL. `audit-remainder-2026-09-19`, `audit-remainder-v2-2026-09-19`, `audit-powers-v2-2026-09-19`, `audit-lifecycle-v6-2026-09-19` and `audit-report-final-2026-09-19` record the remaining passing flows. No unresolved assertion or browser runtime error remains in that combined scenario coverage. Desktop and narrow-screen screenshots were inspected; actual human play acceptance is not claimed.

Source changes remain uncommitted in the workspace. No schema migration or production action was performed.
