# Tabletop Shop commerce

## Scope

Tabletop Shop commerce is the transactional layer built on Campaign Shops, Scene placement, and participant Shop visits. It supports player purchases, G.O.D.-reviewed purchases, Character sale requests, tracked money grants and corrections, and explicit G.O.D. override purchases. It intentionally does not model carts, shipping, taxes, or automatic gameplay effects for services.

The Shop Builder remains the authoring surface for catalog policy and initial values. Live inventory, stock, Character purses, and Shop balances are mutated through targeted commerce services rather than whole-aggregate Character or Shop saves.

## Authorization boundaries

Normal player purchases and sale requests require all of the following at execution time:

- the authenticated user still owns the active Player Character and remains a Campaign member;
- the Character is an active member of the referenced Shop visit;
- the visit, Session, and Scene are active;
- the Shop is active, open, and still included and revealed beneath its eligible Scene placement; and
- every Item, offering, price, stock quantity, ownership record, and balance is still authoritative and eligible in the same Campaign.

Visit mode is narrative context only. It does not grant or remove transaction permission.

Only the Campaign-owning G.O.D. can review requests, give money, correct live balances, or use a transaction override. The override is available from a revealed Shop placement and does not create a visit. It can permit a closed-Shop or out-of-visit purchase, but it never bypasses Campaign ownership, archive state, Item authorization, stock, or funds. A reason is required and retained.

Administrators with non-owner Campaign visibility receive a read-only visit workspace and no private commerce projections.

## Durable records

Migration `0040_tabletop_shop_transactions` adds:

- `shop_commerce_operation`, the actor-bound stable submission identity and intent hash;
- `shop_transaction_request` and `shop_transaction_request_line`, the durable approval workflow and versioned terms;
- `shop_transaction` and `shop_transaction_line`, immutable completed terms, snapshots, fulfillment, and exact-copy links;
- `shop_money_event`, the shared Character and Shop balance ledger; and
- `shop_resale_item_instance`, the Shop-held exact-copy state between sale and resale.

`campaign_character_profile.commerce_version`, `shop.commerce_version`, and `shop_offering.version` prevent an editor loaded before a live transaction from overwriting a changed purse, Shop balance, or stock quantity.

Exact instances sold by a Character are retired, not deleted or reassigned. A resold copy receives a new ownership identity with `provenance_source_instance_id` pointing to the retired source. Charge state and persisted firearm runtime state are copied from the retained source snapshot. Prior actions therefore continue to reference the historical owner and instance.

## Atomic execution and locking

The public services in `shop-commerce-service.ts` accept a caller-owned Drizzle transaction. One execution transaction:

1. locks and revalidates visit membership when normal visit authority is required;
2. locks the Shop and Character in stable order;
3. claims an actor-and-submission-key operation with an intent hash;
4. locks request terms, offerings, ownership, and balances;
5. rechecks current prices, stock, ownership, currency representation, archive state, and policy;
6. writes the completed transaction and money events;
7. applies the purse, Shop balance, stock, and inventory changes; and
8. finalizes the request.

Any failure rolls the entire unit back. Limited offering updates use both row locks and version/quantity predicates. A repeated submission with identical intent returns the original result; reusing the same identity for different contents is rejected.

Departure and approval share the visit-then-membership-then-request lock order. Departure, visit ending, and Scene or Session completion cancel unfinished requests before ending membership. Approval therefore either completes while authority remains valid or observes a terminal/cancelled request.

## Money and currency

Completed purchases debit the Character and credit the Shop. Completed sales debit the Shop and credit the Character. Grants credit only the selected Character. Deliberate Character and Shop balance corrections record the signed difference and required reason.

Canonical balances remain Campaign Credits. In a Derived Currency Campaign, every Character balance write is converted through the existing currency rules and rewrites denomination holdings to match. An amount that cannot be represented exactly by the configured denominations is rejected. Completed transactions retain their currency names, values, ordering, Shop policy, prices, notes, and actor snapshots so later authoring changes do not rewrite history.

## Purchases, services, and sales

The Player submits the displayed offering version, unit price, and fulfillment kind. The server compares that quotation with the authoritative offering before it can charge the Character. A changed quotation creates an `owner-review` request with the current terms and no charge, including when the Shop normally permits `immediate` checkout. The selected total is shown before confirmation, and a refresh keeps the entered quantity and note so the Player can make an informed choice.

`immediate` purchases execute for the Character owner only when the displayed and authoritative terms still match. `god-approval-required` purchases persist without reserving funds or stock. Every owner acceptance and G.O.D. decision names the displayed request terms version. Any later price or fulfillment change creates another terms version, clears both approvals, and leaves the request actionable for renewed consent. Idempotency identities are version-specific so a prior approval cannot be replayed as consent to changed terms.

All Character sales begin as requests. Catalog buying prices are used unless the Shop has an override. The G.O.D. may revise quantity or unit price:

- `character-owner-accepts` requires owner acceptance of the revised terms version;
- `god-approval-finalizes` binds both approvals to the revised version and executes immediately.

`remove-from-active-play` removes stack ownership or retires an exact copy while retaining history. `add-to-shop-stock` also increases a limited listing or creates a Campaign-authorized limited listing for an otherwise unlisted Item. Exact items must be inactive and free of existing equipment/runtime dependency blockers before sale.

A `service-narrative` purchase records money, quantity, note, and receipt but creates no Character inventory and applies no inferred healing, lodging, time, or other game effect.

## Projections and live refresh

The player projection is scoped to the authenticated Character. It contains that Character's purse, owned eligible Items, requests, receipts, and Character-side purse events only. Shop-side credits, debits, and balance corrections are filtered before the response is constructed. Other players do not receive it. The Campaign-owning G.O.D. receives the complete Shop ledger, per-visitor private projections, and Campaign Character choices for grants and overrides.

Server actions publish a `shop-commerce` invalidation in the same database transaction after the operation succeeds. Existing live readers refresh the affected Character and G.O.D. surfaces while local catalog search, category, dialog input, and in-place scroll remain client-owned.

## Lifecycle

Archiving a Shop, Character, Item, Campaign, or visit does not erase transaction history. Character, Shop, and Item permanent-deletion previews block when retained commerce references exist. New User attribution references participate in fail-closed account deletion. Campaign permanent deletion includes every commerce table in explicit child-before-parent order; request and transaction line scopes are resolved through their Campaign-owned parents.

All migration and integration rehearsals use a disposable loopback PostgreSQL cluster. Migration `0040` is additive; migrations `0039` and earlier remain unchanged.
