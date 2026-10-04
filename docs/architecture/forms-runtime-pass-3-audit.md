# Forms Runtime Pass 3: lifecycle audit

Baseline: `f36c7b7b1110468df5c8b72a2f0d0208f6816fcc`. This audit precedes lifecycle implementation. Pass 1 owns transitions, frozen definitions, requests, costs and history; Pass 2 owns effective mechanics. Pass 3 extends those owners.

## Local DEV catalog evidence

`scripts/audit-forms-lifecycle.ts --local-dev` explicitly connects to loopback `serrian_tide_dev` and verifies a repeatable-read, read-only transaction. The October 3 audit found 92 applied DEV migrations, 15 Race Forms and zero Creature Forms. The complete private local result is `artifacts/guidance/forms-pass3-local-dev-audit.json`. No Production connection, shared migration or catalog write was performed.

All 15 Forms use voluntary entry, Initiative entry/exit timing, persistent duration, voluntary exit, unlimited uses, no involuntary triggers and no transformation requirements. Fourteen specify no exit resource cost; one leaves it unspecified. All entry costs name **Shift Reserve**, which has no canonical runtime spender. All 15 contain written cooldown instructions, including “No additional cooldown beyond the authored entry/exit Initiative costs.” Nonblank prose remains a G.O.D. review requirement even when its wording appears permissive. Equipment is `unusable` in ten and `custom` in five. Equipment notes do not authorize additional physical mutations.

## Authoring-to-runtime classification

| Classification | Authored field | Authoritative owner / boundary |
| --- | --- | --- |
| A: structured and executable | `duration.mode = persistent / voluntary-end` | Frozen Enter event; never expires merely because time or an Encounter passes. |
| A when bound | `duration.mode = encounter / scene` | Exact Encounter/Scene captured at successful entry; authoritative closeout marks Return due. Frozen exit contract still governs execution. |
| A when fully supported | `entryMethod`, `involuntaryTriggers`, `requirements` | Existing typed Ability facts and condition evaluator; all conditions and automatic Access must pass at a clean participant boundary. Competing satisfied Forms require G.O.D. choice. |
| A when scoped | `limitMode = limited`, `useLimits[].maximumUses / refreshScope` | Completed Enter events for the exact individual and Form; `round` includes exact Encounter and round, `encounter` and `scene` include exact owner, `never` includes all history. Manual/event limits start with their full allowance; a matching refresh receipt establishes a new counting boundary. |
| A | `limitMode = unlimited` | No use-count gate. |
| A when executable | Entry/exit `timing`, `costs` | Existing Form transition, Initiative and canonical resource owners; never invent a timing/resource conversion. |
| A | Equipment `retained / inherited / unusable / merged` | Existing inventory identity and capability view. Unusable/merged suppress active access, preserve recorded ownership and passive Worn protection, and become accessible again on Return. |
| A with exact custody context | Equipment `dropped` | Existing equipment-state and inventory-custody owners; only recorded active copies/quantities, at successful entry, with exact Scene/location evidence. Return never retrieves them. |
| B: structured but needs G.O.D. resolution | Manual/event refresh operations; unspecified/custom limits; ambiguous trigger candidates; unsupported/missing facts or event producer; missing duration owner; unsupported exit method/timing/resource; custom equipment; missing drop location | Explicit owner-authorized review and immutable evidence. Manual/event refresh requires explicit Campaign-owning G.O.D. evidence; initial uses need no refresh. No inference or automatic waiver. |
| C: descriptive only | `duration.description` for fixed/condition-end/custom, `cooldown`, resource-depletion notes, entry/exit/equipment notes | No unit/clock, expiry predicate, cooldown clock or depletion pool/threshold is authored. These strings do not create automatic mechanics. |

Trusted combat event facts are limited to the existing responder-window producer. An unfinished attack/declaration still blocks body changes. This pass must not synthesize an event, interpret notes as an event predicate, or change a body mid-action.

## Implementation constraints

One lifecycle reconciler calls the existing transition authority. Duration ownership and lifecycle evidence belong in immutable transition JSON. Return due is derived from frozen ownership and authoritative closeout, then retained on the Current Form row so reopening an Encounter cannot erase a witnessed endpoint. The body remains active until Return completes. Current Form and pending transition continue to block permanent Evolution, historical Return and Race reassignment.

No authoring fields or prose conversions were added. Migration `0095` adds only nullable `return_due_json` on Current Form and the exact G.O.D. manual/event use-refresh receipt. Uses themselves remain completed Enter events. Migration `0096` adds refresh provenance and immutable-update guards, following existing whole-Campaign history deletion semantics.

During implementation the user changed `.env.local` to local DEV and confirmed applying migrations there. A read-only follow-up initially observed 96 applied migrations and no refresh-history triggers. The applied `0095` bytes were restored exactly, verified against DEV's recorded SHA-256 `03a53b34beeb964ea242dbf1b5e6dd87bfaf94dfe8fe0656a53201af2b17c68d`; remaining guards were moved to separate `0096`. A final read-only check observed 97 migrations, both refresh-history triggers and the matching `0096` SHA-256 `1de0e5931139a55ae32ca522be5fa6be2a8a7e64bf1e52fb658f22c7f1064f85`. This agent applied no shared migrations. Other environments still need separate rollout authorization. Production was not queried or modified.

## Runtime owners

`form-runtime-service` retains the one Enter/Return executor. `form-lifecycle-service` reads exact owners, completed use history, refresh receipts and Return due; `form-equipment-transition-service` composes the existing equipment and custody owners inside the same protected entry transaction.

Reconciliation runs at completed Initiative passage/recovery; authorized Health, Condition/Modifier, equipment and custody mutations; terminal declarations, defenses and Effect Plans; supported Character Spell, Creature Ability and Item effect execution; Resume; and actual Scene/Encounter normal closeout or force-end. Completion hooks preserve unfinished action boundaries. A transaction guard suppresses recursion while transitions spend resources or drop Items. No poller, background clock or passive Creature Ability engine was added.

One satisfied involuntary candidate is reviewed again under the existing fact fence. The same frozen-request completion checks apply to pending automatic Initiative transitions. Multiple candidates, absent trusted event facts, nonblank cooldown, manual Access, unknown resources, unavailable timing, exhausted uses or dirty/frozen boundaries prevent automatic entry. Older Creature combat snapshots without any Forms do not enter constructor validation merely because another action completes.

## Schema and upgrade proof

The 97-migration chain is rehearsed in disposable PostgreSQL. A dedicated populated `0094` upgrade preserves every prior public table, an active immutable entry, a pending Return and stored Health; the new due field stays null and no refresh is inferred. Prior Evolution/Return and populated lifecycle upgrades remain in the harness. New refresh receipts are included in Character/account dependency protections and the authorized Campaign graph deletion plan.

See [the completion report](../reports/forms-runtime-pass-3-2026-10-03.md) for validation and the explicit manual boundaries.
