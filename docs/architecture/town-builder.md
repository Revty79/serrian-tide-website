# Campaign Town Builder

The Town Builder is a Campaign-owned authoring workspace at `/heavens/towns`. A Town is an organizational and descriptive record. It does not introduce settlement simulation, schedules, transactions, encounters, Scenes, or other runtime mechanics.

## Ownership and relationships

- `town` belongs to one Campaign and owns its archive lifecycle.
- `town_shop_membership` attaches an existing Shop to at most one Town. Detaching or deleting the Town leaves the Shop and its staff, offerings, balance, storefront state, and archive state intact. Moving a Shop between Towns is one explicit atomic reassignment.
- `town_npc_association` is a many-to-many link to active persistent Simple or Detailed Race and Creature NPCs in the same Campaign. Removing a link or deleting a Town does not delete the NPC. An archived NPC remains visible when already linked for historical context.
- `town_place` is descriptive content owned by its Town. Places have their own ordering and archive lifecycle. Permanent Town deletion also removes its Places.

Composite foreign keys and database triggers enforce same-Campaign identity and active-source eligibility. Every server action independently reloads authorization and scopes reads and writes to the submitted Campaign and Town identities.

## Lifecycle ordering

Campaign deletion removes Town NPC associations, Town Places, and Town Shop memberships before their referenced NPC, Shop, and Town parents. User deletion treats Town and Place archive attribution as retained-history blockers. Shop and NPC deletion previews report Town relationships; they must be detached or removed before those records can be permanently deleted.

## Deferred runtime integration

Entering or using a Shop from a Town during live Tabletop activity is intentionally deferred. A future runtime design must let a G.O.D. or authorized participant open and use a linked Shop without interrupting another active Tabletop task, and must define navigation continuity, authorization, concurrency, and transaction semantics before adding any in-play behavior. This Town Builder does not create that runtime path.
