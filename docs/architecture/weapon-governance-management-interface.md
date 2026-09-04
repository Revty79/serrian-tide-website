# Weapon governance management interface

Pass 5 exposes the canonical and Character weapon-governance services without creating another rules engine.

## Ownership of decisions

- Heavens Equipment and Inventory remain the only global canonical-path authoring surfaces.
- G.O.D. Tabletop displays that mapping read-only and owns Campaign Character exceptions.
- The Player Character surface displays the resulting assignment read-only for the exactly assigned Player.

The Tabletop view groups owned copies by canonical Item and Weapon Profile. A retained override may keep an unowned weapon visible for administrative removal, but it cannot be used to save a replacement or record a Roll until ordinary ownership exists again.

## Resolution and overrides

The interface calls the Pass 4 service for the normal result, every canonical alternative, exact allocation lineage, straight-Attribute fallback, persistent override, and one-action preview. Components do not calculate Skill percentages or reconstruct ancestry.

Persistent overrides store one exact Character allocation or Attribute plus a required reason. They may be weapon-wide or scoped to an actual firing mode. An invalid stored override remains authoritative and visible until the Campaign-owning G.O.D. replaces or removes it. Character save detects a referenced allocation before deletion and returns the exact Tabletop review route instead of exposing a database constraint error.

One-action rulings remain request state. They do not modify canonical governance or persistent overrides and are cleared by cancellation or a successfully recorded Roll.

## Roll boundary

Preparing a Roll supplies the selected Character, weapon/mode label, and a server-previewed governing source to the shared Roll Tray. The user must still trigger a website or physical Roll. On record, the server ignores the preview as authority, verifies Campaign ownership and Item ownership, reruns Pass 4, and passes only that resolved governing-source request plus explicit modifiers to the Pass 2 ledger. Pass 1 calculates the final roll-over target.

This path records evidence only. It does not spend Initiative, resolve an action or Reaction, consume ammunition, apply damage, alter Health or Conditions, or perform any other attack consequence.
