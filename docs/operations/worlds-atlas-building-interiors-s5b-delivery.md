# Atlas Stage 5B — building interiors and multi-floor maps

Starting checkpoint: `89504d57fb4b19b699b8093a1b3e6784a80d4e19`. The owner's brief provisionally accepts Stage 5A. Stage 5B is technically verified through the separate final receipts below. It extends the active Town workspace without reactivating the retired Atlas. Owner usability/artistic review and physical-device certification remain separate.

Implementation checkpoint: [`e8aba3cc7812a61ea95afd71dd17c19b789c7f4f`](https://github.com/Revty79/serrian-tide-website/commit/e8aba3cc7812a61ea95afd71dd17c19b789c7f4f). The following documentation-only checkpoint records delivery; the final main/remote/CI receipt is retained at `artifacts/interiors-s5b-workbench/publication.json`.

## Creator workflow

Selecting a saved Town building exposes **Create Interior / Open Interior** beside the canvas. Unfinished Town work uses the existing named Pending Work guard. Returning selects that same building and retains the Town view; direct interior URLs retain the Town, source context and selected floor.

Floors start blank, from the actual building outline, from an independently identified copy, or from a revisable generated partition layout. Generation previews can be inspected, changed, accepted or cancelled. Custom/concave footprints retain their physical metres. Rooms include attached wall outlines; partitions and connected wall paths remain directly editable. Doors, double doors, passages, entrances, windows and arches cut genuine gaps in their wall segments. Stable wall-corner attachments survive valid movement and reshaping; invalid edits retain the preceding accepted geometry with an explanation.

The compact tool row and immediate contextual choices expose rooms, walls, openings, fifteen furnishing pieces, stairs/ladders/lifts/hatches, notes, measurements and navigation. Original Canvas2D artwork includes beds, tables/chairs, storage, counters, shelves, fireplaces, kitchen fixtures, workbenches and rugs. Objects support direct movement, handles, rotation, dimensions, duplication, removal and restoration. Grid/snapping, appearance and visibility/locking controls remain in Options. Save, current floor, Add Floor and Return to Building remain visible on narrow screens.

The floor-creation panel keeps Create Floor, Preview and Cancel outside its scrolling fields. Screenshot inspection caught an earlier phone button clipped by its ancestor despite an in-viewport bounding box. The corrected test checks actual hit visibility and taps screen coordinates without automatic scrolling.

Each floor has an independent durable identity, name, order, optional elevation, editable geometry and immutable revisions. An aligned 22%-opacity reference overlay cannot edit the referenced floor. **Connect Both Ways** saves the two affected floors atomically, reusing compatible arrival stairs rather than blindly duplicating them. The default arrival aligns with the selected stairs; optional coordinates allow another arrival. Visible Go to Floor actions and the floor selector support Town → Ground → Upper → Basement → Upper → Ground → Town.

## Identity, storage and recovery

An unlinked drawn/generated building receives a separate interior identity without creating a permanent World Place, Shop, inventory or NPC. Permanent Place links share one interior across Town Map representations. Deliberately linking a previously unlinked building adopts its existing interior instead of replacing its floors. Existing Town/Place/Shop services remain responsible for explicit permanent records and commerce.

New additive **0152_world_building_floors** is required. Its five tables retain building groups, exterior-feature bindings, floor heads, accepted operations and immutable floor versions. Composite World/Town relationships, source checks, immutable bindings/receipts, sequential revisions and deferred exact-head audits protect the storage. Existing SQL/snapshots and the first 152 journal entries through 0151 remain frozen. No shared DEV/Production ledger was inspected or migrated.

The retained `interior.ts`, `plan-editor.tsx`, historical interior services and schemas were audited. The active implementation reuses pure opening anchors, wall-gap construction, geometry validation, centre calculation and independent-copy rules through a compatible adapter. It keeps the retired editor, routes and historical data untouched. The existing lifecycle plan gains one immutable author-history blocker, bringing its verified User-FK inventory to 138.

Saves retain their exact request through failures, lost acknowledgements and reloads. Another editor's stale revision cannot replace the winner. Floor drafts use separate tab keys; recovering another tab makes a copy. Invalid recovery text remains intact until exported or explicitly replaced. Uncertain floor creation and lifecycle operations retain their original requests. In particular, an accepted archive with a lost acknowledgement remains retryable after reopening an already archived floor. Floor-switch failures explain the problem while retaining the current floor.

Archiving keeps saved geometry and history. Incoming stairs prevent archiving their destination until deliberately disconnected. Moving/archiving an exterior representation does not delete interiors or unrelated Shop links. The original interior frame is retained when exterior artwork subsequently moves or changes shape.

## Bounds and meaningful limitations

- Maximum 64 retained floors per building, 20,000 interior groups per World, 2,000 retained features / 32,000 source points per floor, and a 20,000-metre floor extent. Archived identities count toward capacity.
- A drawing surface uses at most 2.5 million backing pixels. Supplemental marks are bounded to 5,000 per rendered floor, with at most one reference overlay. Floor inventories read metadata and only the selected geometry; they do not load every furnished floor into the response.
- Current-floor Undo/Redo retains at most 30 states / 12 MiB. Browser recovery permits four tab drafts per floor and four million bytes per draft, subject to the browser's actual quota. Export and visible storage errors remain important; these bounds are not process-RSS measurements.
- Floor geometry and its Undo/Redo are local to that floor. Arrival stairs on another floor remain independently editable; later movement/removal does not automatically synchronize both drawings. Creation, archiving and two-way connection are explicit revisioned transactions.
- Generation is a simple editable partition plan, not a structural, circulation or occupancy simulator. Objects can be deliberately drawn outside the initial footprint within the retained frame. Existing interiors are not automatically rescaled when a later exterior representation changes.
- Two already-authored interiors later assigned the same permanent Place are retained rather than automatically merged; restore the original link before opening the conflicted drawing. No dungeon, sewer, cross-building transition builder, 3D dependency or Stage 5C is introduced.

## Validation and evidence

All screenshots, private backups, logs, profiles and large receipts stay ignored under `artifacts/interiors-s5b-*`. Final scope assertions are in `interiors-s5b-workbench/final-scopes.cjs`; source/frozen-history verification is in `verification.json`.

The final production source snapshot is `94fdbd85764ae6a663d4f6ae868c82609d2a109bb5ed75fe73905402f555911a`, runtime manifest `db1aec990f5e5bb0a192732adae5ced38d913c2e8502932a8cbc84eab486b518`, build `3flBOoAo7EmRs7lLiZYhy`. The 2,621 units in 325 files, standalone TypeScript, production compilation/type checks, schema-only Drizzle check and repository lint pass. Lint retains one pre-existing `LoreFamily` warning; there are no lint errors.

Final GPU-disabled furnished-floor measurements from `interiors-s5b-production-14/interior-performance.json`:

| Floor | Furnishings / total features | Save payload | Save | Open | 10 navigation keys | Draw |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 40 / 46 | 14,206 B | 27.3 ms | 1,215.0 ms | 80.5 ms | 0.6 ms |
| Inn | 320 / 326 | 92,655 B | 80.1 ms | 1,135.3 ms | 78.7 ms | 1.1 ms |
| Dense stress floor | 1,600 / 1,606 | 449,881 B | 292.8 ms | 1,220.9 ms | 213.5 ms | 5.2 ms |

All retain the 15,000 ms open / 1,500 ms ten-key / 100 ms draw gates. Each measured backing surface is 1,238 × 671 = 830,698 pixels / 3,322,792 RGBA bytes. Supplemental artwork uses 115 / 395 / 1,675 marks against the 5,000-mark bound. Payload, Canvas allocation and immutable SQL revisions are separate quantities; no process-RSS or flat-storage-growth claim is made.

Completed production rehearsals already exercise public-label/native-input journeys A–E: manual rooms/openings/furnishings, independent copied and generated floors, bidirectional navigation, exact reopen, a real generated unlinked building, original permanent Shop data, failed/lost-ack saves, separate-tab conflicts, native corner/object editing, Undo/Redo, pending navigation and archive/restore. Desktop/tablet/phone and expanded layouts retain the unchanged 400-pixel drawing-height gate, visible primary actions, canvas-only mouse/trackpad zoom, independent page/panel scrolling and native two-finger cancellation. Actual rendered images are inspected separately from machine assertions.

| Interior viewport | Select canvas | Furniture canvas | Expanded canvas |
| --- | ---: | ---: | ---: |
| 1,440 × 1,000 | 671.3 px | 598.7 px | 784.4 px |
| 820 × 1,000 | 607.1 px | 517.5 px | 720.3 px |
| 390 × 844, DPR 2 | 451.7 px | 408.0 px | 581.2 px |

Primary Save/Add/Return/Floor controls stay in view without page overflow. Mouse-wheel and trackpad-style zoom retain exact page positions, including zoom limits; maximum measured cursor-anchor drift is under 0.000001 px against the unchanged 0.75 px gate. Settings and outside-page scrolling remain independent. This is installed Chrome 134.0.6998.166 with GPU disabled and native mouse/touch input; it is not physical-device certification. The Sky computer-use helper could not initialize its kernel assets, so these receipts use headed installed-Chrome automation and inspected captures instead.

Separate same-build receipt `interiors-s5b-regional-1` passes World/regional database security and paired restored-service reads, shared materials/forest/artwork/labels/Town/water edits, all 21 tool/precision combinations with exact Undo/Redo and pointer cancellation, late generation acknowledgement/import/restart, stale/conflicting/lost-response recovery, actual browser restart, all six appearances and phone DPR-2 touch/CPU fallback. Only its own disposable application was restarted.

All four inherited nine-limit CPU suites pass in `interiors-s5b-world-cpu-2`, on a new copy of a stopped owned fixture. Each uses the exact accepted `88cfa27c682b5b339e7f672d8c98b1f0289b2191` control with matched inputs, GPU disabled and unchanged thresholds. The four comparison files and `all-36-limits.json` retain every before/after/limit value. Additional artwork/label stress and World/region round-trip/reopen checks pass.

| Inherited suite | Passing limits | Highest measured time / existing limit |
| --- | ---: | ---: |
| Artwork | 9 / 9 | 82.7% |
| Labels | 9 / 9 | 85.6% |
| Engraved | 9 / 9 | 80.8% |
| Regions | 9 / 9 | 82.6% |

Final acceptance is split deliberately: `interiors-s5b-production-14` covers complete interior journeys A–E, database/restore/HTTP/native devices/furnished CPU, Town wheel/road/neighborhood and creative workflows. `interiors-s5b-town-15` adds the complete inherited Town manual editor, permanent links, lost-ack retry, Pending Work, protected generation, World/region/Town navigation, native layouts and village/town/city CPU checks. `interiors-s5b-regional-1` and `interiors-s5b-world-cpu-2` cover the World scopes above. All use the same final source/build. Root checks have separate logs. This is not one uninterrupted all-stage aggregate.

The final source audit preserves 10,026 tracked entries from the starting checkpoint, all 108 original public assets, all 304 historical SQL/snapshot files and 152 historical journal entries. Old schema definitions are exact; only five new tables are added. Nineteen existing Town editing/save/history functions are exact, as are the original Town canvas/wheel/artwork/generation/roads/storage and World numerical/rendering/gameplay sources. All 1,822 application/asset files match the tested build. The original fixture's 125 private files / 265,748 bytes remain exact, with no interior private-object or terrain-grid allocation. See `interiors-s5b-workbench/verification.json`.

Migration 0152 SHA-256: `2d6c8c8758f8896fea2260869950886af9d4550f9bdcfb6d12fdb365bde5b319`. It was applied only to owned disposable targets. **It still needs to be applied to the owner's intended target before using saved interiors; that target's ledger was not accessed.**

Personally inspected captures include `interiors-s5b-production-14/interior-phone-create.png`, `interior-390-touch-placement.png`, `interior-connected-ground.png`, `interior-aligned-reference.png` and furnished stress renders; equivalent earlier captures and failed versions remain retained. Browser assertions use visible roles/labels and native canvas positions, with instrumentation used separately for exact geometry, scroll, camera and performance verification.

Fresh replay, populated upgrade through 0152 and paired SQL/private-storage restore are confined to newly owned loopback targets. A fresh service process reads restored floor identities, geometry, histories and original commerce. Security tests include owner/administrator/player/other-G.O.D./anonymous access, all read-only preview aliases, malformed geometry, layer-lock bypass attempts, concurrent revisions, changed request identities and actual foreign World IDs. The original eight-million-byte reader remains unchanged: oversized chunked input may return 413 or terminate the upload connection; either observation must retain zero staged revisions and a readable service.

Retained failed/partial evidence includes the old-ledger harness assertion, a Town-fixture creation sequence, the CommonJS restore-reader wrapper, an invalid dependency junction, the stale Create/Open label, the tablet palette widening its header, and the **391.4-pixel phone placement failure**. A phone bounding-box-only check was insufficient; visual review found and corrected the clipped Create action. Two root unit runs exposed stale lifecycle inventory counts, corrected alongside the new author-history blocker. A restricted-process disposable start and early chunked-upload transport observations are retained separately. CPU attempt 1 stopped before measurements because the older harness rejected the new evidence prefix; its sole correction admits `interiors-s5b-` while retaining target guards and thresholds. Attempt 2 passes. No canvas, CPU, permission or payload gate was relaxed. Earlier development/rehearsal receipts and failed production aggregates are not represented as one uninterrupted passing run.

No shared database operation, deployment, owner-service restart, destructive cleanup/GC, commercial redesign or Stage 5C occurred. Normal main publication is authorized. Stop after publication for owner review.


## Final recovery and data-protection correction (2026-11-01)

This correction continues from `1c78ca14ee2f0d718ef08e83c7257e4ad38e82fa`. It supersedes the earlier recovery/arrival behavior and runtime references above; the original receipts remain historical evidence.

- **Complete floor recovery:** another-tab comparison includes name, order, elevation and the complete design, including layers and appearance. Metadata-only edits remain recoverable. After an explicit recovery and acknowledged save, an unchanged original packet is retired; a newer other-tab packet is preserved byte-for-byte.
- **Unaccepted creation:** names, floor position, mode, generated room count, preview/revise choice, copied-source identity/revision and exact preview geometry/IDs persist before submission. Duplicate Floor retains its initial copy choice too. Reopening offers explicit Recover / Export / Discard. Invalid raw recovery remains available for export. Both the creation editor and the existing Town unload guard protect unfinished interior work.
- **Uncertain creation:** recovering an already-submitted request locks its original payload and request ID. An accepted request with a lost acknowledgement survives interruption and a new tab, then retries exactly once. It cannot be replaced by changing the preview.
- **Arrival protection:** reusing compatible stairs changes only their destination. Existing identity/entity identity, name, symbol, size, rotation, point and appearance remain intact. The source arrives at the retained object's actual position. Ambiguous overlapping arrivals, incompatible symbols and conflicting destinations produce a clear 409 without changing either floor.

The final two-floor browser test saves a customized arrival through the active authenticated API, reloads it, then connects through visible editor controls and verifies save/reload/navigation. The retained example keeps its name, 2.4 m × 4 m dimensions, 90° rotation, symbol and both identities. Existing canvas editing, geometry validation and styling remain unchanged.

**Validation:** 2,629 unit tests in 325 files pass, including 16 focused interior/recovery cases. Standalone TypeScript, production compilation/types and lint on all affected files pass. The single final-source production receipt `artifacts/interiors-s5b-correction-production-5` passes:

- Owned missing-schema, fresh/populated upgrade, exact retry/conflict/capacity/permissions and paired backup/restore with fresh actual service reads.
- Interior journeys A–E and the new metadata-only interruption/new-tab save, immediately interrupted copy, generated preview recovery, explicit discard, real Chrome unload dialog, lost accepted creation acknowledgement/exact retry and incompatible-arrival atomic rejection.
- Desktop/tablet/phone/expanded native input, 400 px minimum drawing gate, visible floor/save/return/create actions, wheel/trackpad cursor anchoring, page/panel scroll and touch cancellation.
- Inherited Town manual/creative editing, permanent Shop links, lost-ack recovery, Pending Work, World/region/Town switching, native layouts and village/town/city CPU limits.

The final source snapshot is `b18f00fcb7c1abc09ee2810284249debd19574184a17cbfd353d6fc8ac41f812`, runtime manifest `67b588197486923d95326813833cd755f7d7f7dad8df6443cbeb5fb729e26c9b`, build `jFEPsMVcm_jCef44J_yQg`. Exact receipts include `interior-final-corrections.json`, `interior-custom-arrival.json`, `interior-devices-wheel.json`, `interior-performance.json`, `town-performance.json` and `browser-results.json`. The recovered-preview capture was personally inspected.

| Furnished floor | Objects / total features | Payload | Open | Ten keys | Draw |
| --- | ---: | ---: | ---: | ---: | ---: |
| Home | 40 / 46 | 14,206 B | 1,226.2 ms | 59.6 ms | 0.6 ms |
| Inn | 320 / 326 | 92,655 B | 1,115.5 ms | 84.9 ms | 1.1 ms |
| Dense stress | 1,600 / 1,606 | 449,881 B | 1,163.4 ms | 191.6 ms | 4.9 ms |

Original 15,000 / 1,500 / 100 ms gates remain unchanged. Town village/town/city draw times are 1.7 / 5.5 / 23.9 ms; ten-key times are 198.7 / 378.8 / 688.8 ms. The earlier 36-limit World matrix above remains retained evidence, not a newly rerun matrix. World/Town canvas, artwork, viewport input, geometry, terrain and gameplay sources are exact; only the Town interior-unload guard changes outside the interior modules.

All 1,822 task application/asset files match the tested build. All 306 SQL/snapshots and 153 journal entries, including migration 0152, remain frozen. The original 125 private files / 265,748 bytes remain exact. No new migration is required. A dedicated publication checkout excludes concurrently arriving character-spreadsheet files and changes; those shared-workspace edits are preserved and excluded from this delivery.

Failed/partial correction receipts remain retained: an unavailable test dimension field, native setup attempts rejected by the existing precision guard, and the device run that exposed stale acknowledged recovery packets. The final run fixes the latter without weakening the guards. Source checks use the historical raw-byte registry where Windows line endings differ from canonical Git blobs. Final runtime, database and browser coverage is one successful correction run; root checks and source proof are separate receipts. Owner usability/artistic acceptance and physical-device certification remain separate.

Publication and source proof are retained under `artifacts/interiors-s5b-correction-workbench/`. No shared database access, deployment, owner-server restart, destructive cleanup or Stage 5C occurred. Stop for owner review.
