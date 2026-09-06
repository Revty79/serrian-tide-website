# Tabletop Town and Shop placement

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

Retained preparation and placement references block permanent Town, Shop, Place, and NPC deletion. Deletion previews inventory these dependencies. Planned Scene or Session deletion may cascade its preparation-only placement graph under the existing deletion gates; Campaign deletion removes the placement graph explicitly child-before-parent before deleting Characters, Shops, Towns, Scenes, and Sessions.

## Player projection

Preparation and new placement begin hidden. A Town has a parent reveal switch, and each included Shop, Place, and NPC has its own reveal state. Parent visibility is enforced in the database read, so a directly requested child cannot bypass a hidden Town. Independent Shops have their own reveal state.

The Player Tabletop projection contains only revealed names, categories, public descriptions, storefront open/closed state, NPC role labels, and revealed Shop staff labels for the authenticated Character's active Session and Scene. It excludes G.O.D. notes, preparation notes, location-management notes, NPC profiles and secrets, Shop policies, balances, offerings, stock, inventory, and account identities. Live events carry invalidation identities only; the refreshed server read reapplies authorization and visibility.

## Deferred next step

Enter Shop and independent participant visits are intentionally deferred. The next build must define per-Character Shop visit membership and independent leaving while preserving the active Scene. Purchasing, selling, approvals, stock changes, purse transfers, and automated economy behavior remain outside this placement build.
