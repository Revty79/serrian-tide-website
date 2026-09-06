# Tabletop Town and Shop placement

Completed Shop visits can proceed into purchases, Character sales, approvals, and tracked money events under the separate [Tabletop Shop commerce](tabletop-shop-commerce.md) contract. Placement remains the authority boundary for normal visit transactions; a recorded G.O.D. transaction override is deliberately separate.

Tabletop location placement is a descriptive organization layer beneath existing Campaign Sessions and Scenes. Campaign Towns, Shops, Places, and persistent NPCs remain authoritative. Placement stores references, ordering, Scene-specific inclusion, reveal state, and preparation context only; it never clones inventory, money, staff assignments, Character state, or descriptive source records.

## Model

```text
Campaign Session
  ├── prepared Town reference
  ├── prepared independent Shop reference
  └── Scene
       ├── Town placement
       │    ├── referenced Shop inclusion
       │    ├── referenced Place inclusion
       │    └── deduplicated referenced NPC inclusion
       └── independent Shop placement
```

Composite foreign keys constrain every preparation and placement record to the same Campaign, Session, and Scene. A direct Scene placement creates its required Session-preparation reference in the same transaction. Town-derived Shop references and independent Shop placements remain distinct, so detaching a Town cannot remove a Shop that is still independently placed.

Adding a Town reads its currently eligible, nonarchived Shops, Places, directly associated persistent NPCs, and NPC staff of eligible linked Shops. Direct associations and staff identities are deduplicated by Campaign Character ID. Included NPCs reuse or create the required Session roster reference before reusing or creating Scene membership. They are never enrolled in an Encounter or Initiative.

Create Scene from Town creates an ordinary planned Scene, uses the Town name and overview as initial Scene metadata, prepares and places the Town in the same transaction, and leaves the Scene unstarted. Closed Shops remain closed and placeable.

## Refresh and lifecycle

Builder edits do not silently rewrite placed Scenes. Preview Refresh compares the placed child references with the Town's current eligible contents. Applying that preview adds new references as included but hidden, removes only obsolete Town-derived references, and preserves inclusion, order, and visibility for retained references. Scene-specific exclusions therefore survive refresh.

Town detachment removes only the placement and its Town-derived child references. It preserves the Town, Shops, Places, NPCs, Session roster entries, and Scene memberships. Shop detachment removes only the independent Shop placement. Completed Sessions and Scenes remain read-only until their established reopen flow permits corrections.

An active Shop visit makes its exact Town/Shop or independent-Shop placement source temporarily non-detachable and non-hideable. Refresh cannot remove its source child, and an active source Town or Shop cannot be archived. These operations use explicit blockers requiring the visit to end first; they never silently end a visit or delete its membership. The visit retains its placement kind and optional Town identity as history rather than holding a foreign key to a mutable placement row.

Retained preparation and placement references block permanent Town, Shop, Place, and NPC deletion. Deletion previews inventory these dependencies. Planned Scene or Session deletion may cascade its preparation-only placement graph under the existing deletion gates; Campaign deletion removes the placement graph explicitly child-before-parent before deleting Characters, Shops, Towns, Scenes, and Sessions.

## Player projection

Preparation and new placement begin hidden. A Town has a parent reveal switch, and each included Shop, Place, and NPC has its own reveal state. Parent visibility is enforced in the database read, so a directly requested child cannot bypass a hidden Town. Independent Shops have their own reveal state.

The ordinary Player Tabletop directory projection contains only revealed names, categories, public descriptions, storefront open/closed state, NPC role labels, and revealed Shop staff labels for the authenticated Character's active Session and Scene. It excludes G.O.D. notes, preparation notes, location-management notes, NPC profiles and secrets, Shop policies, balances, offerings, stock, inventory, and account identities. Live events carry invalidation identities only; the refreshed server read reapplies authorization and visibility.

For a Town Shop, staff are public only when the same NPC is included and revealed in that exact Town placement. Revealing an NPC in another Town never exposes the relationship. An authorized active Shop visit receives a separate narrow projection containing the public Shop description, eligible staff, visit mode, visiting Character display identities, currently enabled nonarchived offering details, and only the Campaign currency-system and denomination fields required by `formatCampaignMoney`. It does not receive the recorded closed-Shop override reason, unrelated Campaign settings, denomination descriptions, or management-only data. Both the G.O.D. and Player views format canonical selling and buying amounts through those same rules; a null price remains explicitly unlisted while zero remains a formatted amount.

## Participant Shop visits

Migration `0039_tabletop_shop_visits` adds a Scene Shop visit and normalized Character membership beneath the existing hierarchy. A visit references the canonical Shop and records whether entry used an independent placement or a specific Town placement. It never clones the Shop, staff, offerings, Items, inventory, money, or Characters.

Only the Campaign-owning G.O.D. can begin a visit, add eligible participants, change its Roleplay/Shopping context, remove a visitor, or end it. Administrators can read the management projection but remain read-only unless they independently satisfy the owning-G.O.D. rule. A Player can read and leave only the active membership belonging to their authenticated Character. Eligibility requires the same Campaign, an active Session and Scene, Session roster membership, Scene membership, a nonarchived Player Character, and a currently revealed eligible placement. Closed-Shop entry additionally records a nonempty G.O.D. override reason without changing the saved storefront state.

The database permits at most one active visit for a Shop in a Scene and at most one active Shop membership for a Character. Every path that changes visit membership locks the shared visit row before rereading or changing membership. Entry/addition, Player departure, G.O.D. removal and ending, and Scene/Session completion therefore serialize the empty-visit decision without reversing lock order; lifecycle paths lock multiple visit rows by ascending ID. Service locking, idempotent inserts, and post-insert confirmation give repeat-safe entry and reject concurrent entry into different Shops. Every membership records entry/exit actor and time. Exactly one final departure closes the visit, including when the final visitors depart concurrently; ended visits never reopen when a Scene is reopened.

Expected G.O.D. action failures return structured feedback from the reauthorized Server Action and render in the currently visible entry or visit context. End Visit uses the native modal dialog with a trimmed required reason, the same 1,000-character server limit, pending protection, native keyboard dismissal, focus restoration, and shared semantic controls. A rejected action leaves the dialog and entered reason intact.

Visit membership is additional live context only. It does not change the Session, Scene, Encounter, Initiative, pending actions, active Character state, or saved Shop approval policies. Scene and Session completion close their visits and memberships in the same transaction. Permission loss makes the Player read fail closed immediately. Shop visit and membership history participates in Town, Shop, Character, Session, Scene, Campaign, and User deletion planning under the existing lifecycle rules.

## Commerce boundary

Purchasing, selling, approvals, stock mutation, purse changes, and tracked money events are implemented by the separate [Tabletop Shop commerce](tabletop-shop-commerce.md) service. Normal commerce revalidates this placement and active visit authority at final execution; only the recorded G.O.D. override path can bypass the open-Shop and active-visit requirements. Commerce retains immutable historical references without changing the location-placement model.
