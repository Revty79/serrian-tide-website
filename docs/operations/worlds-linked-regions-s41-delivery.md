# Atlas Stage 4 Pass 1 — linked World and regional maps

Starting checkpoint: `9863861b642a99b18985a49e0e4fb16dc04cd11c`. Verified application checkpoint: `67e6d221c94d9c616538936dcf7e065e7b81d9fa`. Technical coverage is complete across the distinct receipts below; owner artistic/usability acceptance, physical-device acceptance and deployment remain separate.

## Geographic authority and workflow

An independent World map now offers **Regional maps → Create Regional Map** in its existing settings panel. Creators can draw a rectangle with mouse or armed touch controls, adjust its World-coordinate bounds numerically, name it, inspect dimensions/area, preview, revise, accept or cancel. Preview and cancellation create no map or numerical records. Accepted bounds retain their original physical coordinates, including east/west seam crossings; invalid bounds are rejected without resizing them.

Each region has its own `world_atlas_map` identity and regional canvas, plus an immutable `world_map_region` relationship to its specific parent World map and the **same terrain ID**. The relationship records physical metre bounds, creation hash, author, timestamp, initial parent/root revisions and the complete accepted numerical source revision vector. Existing procedural-generation provenance and place connections are unchanged. Creation inserts no terrain, terrain-version, numerical-tile or refinement rows.

The map browser groups regions beneath their exact World map. Parent settings provide named coverage outlines and region-opening controls. Direct URLs and refresh reopen the same region. **Fit map** fits its saved extent; **Return to World Map** focuses that extent in the parent. A failed or unavailable-source load shows an error and map-browser recovery, never another map’s geography under the failed identity.

All six appearances use the original Canvas2D painters and accepted numerical sources. Regions clip geography to their saved extent without introducing another coordinate origin or renderer. Geographic labels remain anchored in World metres; composition remains screen-relative. Inherited native Town captions use the existing label-collision rule inside regional coverage, with bounded caption work. Their permanent Town and placement identities and stored positions remain unchanged.

## Editing, layers and recovery

Regions display accepted overlapping sparse refinements. Owners can create nested or adjacent detail through the existing preview/revise/accept workflow and edit a numerical source only when its complete frame lies inside the region. Partially overlapping sources remain visible and read-only; their contained children can be authored. These refinements belong to the shared terrain, so the parent and other overlapping regions discover the same accepted data. Existing collars, parent masks, protected samples, history and numerical overviews remain authoritative.

Regional base saves, whole-World regeneration, sea-level changes and inherited-layer mutations are rejected on the server. Water, lakes/wetlands, environment/vegetation, material overrides, artwork, geographic labels/composition and Town placements read through the specific parent map; they are not copied into regional heads. Reopening discovers later accepted parent changes. Edit those geographic layers on the parent. Regional appearances and immutable named styles use the existing independent presentation systems and can differ from the parent.

Creation recovery retains the draft and persists the original acceptance request before transmission. Retrying a lost successful response returns that same map, even after later source changes. A preview pins the revisions it actually reviewed. Pending regional numerical saves/restores pin all accepted terrain/refinement heads; source changes return a conflict and retain the draft. Acknowledging an already accepted save advances only its own revision in that retained vector. There is no automatic rebase onto unrelated changes.

Navigation guards include terrain, locations, water, environment, materials, artwork, labels, appearance/named-style editing and unfinished creation proposals. A completed source-creation workflow clears its own dirty flag before navigation; other drafts retain their guards. Invalid editable regional bounds survive browser recovery for correction, while acceptance remains strict.

## Migration and shared-target status

**0147 is frozen applied history. Do not edit or reapply it.** SQL SHA-256:

`17271f0e5790d840b5cb854471485b13648107266f8b114d7c5b18a5b4f3992a`

It adds the dedicated relationship, widens the canvas purpose CHECK, adds a compatible source/purpose key and constrains same-World/shared-terrain parentage. Typed parent purpose prevents regional-parent chains, self-parenting and cycles. Validation checks active suitable parents, current source revisions and physical bounds. Deferred completeness rejects orphan regional canvases; immutable relationships and linked map scope/kind guards protect accepted identities. Existing columns and rows are preserved. The new author FK is explicitly classified as an account-deletion blocker in the 132-FK inventory.

During implementation the owner reported applying migrations and explicitly authorized a **read-only** DEV/Production audit, superseding the original access ban for that inspection only. Verified targets:

- DEV `localhost:5432/serrian_tide_dev`: 148 ledger entries through 0147; exact SQL hash, regional columns, function bodies and enabled triggers match. It had zero regional rows at inspection.
- Production `10.0.0.218:5432/serrian_tide_prod`: 147 entries through 0146; no 0147 ledger entry, regional table, functions or triggers.

The agent performed no shared database writes or migration application. **Production still requires 0147 before a matching application release.** Shared-target backup/restore verification, migration execution, deployment and owner-service restart require their separate authorization. No such release action is part of this pass. Any necessary schema correction after the DEV application must be a new forward migration.

## Bounds and performance

The existing 64-map, 128-refinement, eight-level and 1,024-sample-per-axis limits remain. Regional view dimensions may be as small as one metre; numerical refinements retain their existing 100-metre minimum. Very thin coverage can occupy less than a screen pixel at Fit; zoom and numerical source spacing retain their ordinary meanings. A view creates no extra measured detail.

Map switching always refreshes authorization, relationship and accepted revision metadata. Compatible responses reuse a pinned numerical root cache bounded at 16 MiB of estimated number-array data. Per-tab immutable detail reuse retains at most two terrain sources with 2,048 tiles each. The active Canvas releases its own painters normally; the original 24 MiB engraved bitmap limit and bounded worker/fallback behavior remain. These are data/bitmap estimates, not process RSS.

## Validation and receipt boundaries

All **2,531 units pass across 309 files**, with zero failures/skips. TypeScript and lint pass; full lint retains the existing unused `LoreFamily` warning. Offline Drizzle metadata validation and all five owned account-lifecycle database tests pass. Portable raster tests pass both applicable cases; the POSIX-permissions case is explicitly skipped on Windows.

Owned PostgreSQL 18 rehearsal covers fresh replay, populated 0146 upgrade, real missing-migration service responses, unchanged rows in 352 existing tables, existing columns, repeated migration, paired database/private-tile backup/restore and actual restored-service numerical reads. The resulting ledger has 148 entries. Shared-target backup/restore was not performed.

The complete preceding chain uses production build **`KrpOtTWeodNJfy6AytXWt`**, runtime SHA-256 **`ed480edb750c9f1f12568953f05f298cd16c0dbbaea807aa38a3cd6cb2008ab4`**. Final production build **`JPDteHuNIlKK-GrS4Ommc`**, runtime SHA-256 **`35aa026b42a892211ccc3e5e01a75df5ac6b18ad12fc36c4b725af52906165cd`**, adds only a bounded return-visibility correction in `terrain-editor.tsx`: an explicit returned frame closes settings and centres its Canvas on screen. With no returned frame, prior defaults are unchanged. The offline verifier proves this exact two-part correction against the preceding source manifest; every other runtime file is identical. Coverage is recorded separately:

| Receipt under ignored artifacts | Coverage and outcome |
|---|---|
| `regions-s41-full-7` | Fresh database/build checks; complete inherited terrain, generation/import, sculpting, refinement, measurement, Town/Shop, cartography, materials, hydrology, environment, style and artwork workflows/galleries. Stopped at an older benchmark output-path guard; this aggregate remains failed. |
| `regions-s41-continuation-2` | Resumed the same owned database/build at that guard. Artwork performance/stress, labels workflow/gallery/security/performance, and complete engraved workflow/gallery/palette/rendering/devices/security/refinement/performance pass. Its regional test then stopped after refreshing a stale preview without reopening the World settings tab; this continuation remains failed as an aggregate. |
| `regions-s41-regional-final-1` | Complete regional creation/revision/preview, exact dropped-response retry/reload, independent saved appearance and dirty guards, return focus, coverage, direct reopening, shared numerical refinement/sculpting, unavailable-source recovery, actual projection, seam/large-World, security/touch, live accepted-5D comparison and switching/reopening checks pass. |
| `regions-s41-mobile-final-3` | Supporting same-build native Fit/Return focus and role checks pass. The helper honours the existing sign-in retry delay. |
| `regions-s41-information-tail-1` | Fresh owned database, all twelve information destinations, thirteen creator families, History/calendars/Campaign relationships, retired-boundary/privacy and phone checks pass; 133 gameplay tables and legacy map/Realm data remain exact, with zero page errors/retired-map requests. |
| `regions-s41-label-refinement-final-1` | Final-build inherited fine-source/whole-World label drawing and exact geographic/numerical alignment pass; run explicitly after the receipt audit found the label focus flag had omitted it from the continuation. |
| `regions-s41-final-return-2` | Final-build complete regional workflow, new contained numerical detail/sculpting, six actual renders/projections, wrapped and one-kilometre/million-kilometre views, roles/touch, unobscured mobile Fit/Return, all nine accepted-5D limits and switch/reopen checks pass. |

The successful scoped receipts do not turn earlier failed aggregates into passing runs. All inherited scopes were exercised; the continuation begins where the full run stopped rather than repeating completed galleries. The final scoped correction reruns the entire Stage 4 workflow and CPU comparison. These are a completed coverage chain and a final bounded correction, not a claim that one unfiltered aggregate passed.

Actual Canvas arc calls are compared with canonical World projections after Fit, pan, zoom, refresh and style changes, including both seam copies and a **one-kilometre region inside the genuine million-kilometre World**. Every alignment assertion passes its 0.2 px tolerance; seam positions use the canonical wrapped period when selecting the visible copy. The permanent Town and placement IDs remain the same; parent/region samples and river geometry are exact. All six regional appearances render through their original painters.

Personally inspected the six regional renders, seam-crossing Town captions, engraved million-kilometre/fine-source view and final unobscured mobile return. They show the same geography clipped to the saved frame, with matching positions, scale and inherited waterways. Coarse samples and existing geometric water/terrain boundaries remain visible; this pass adds no artistic detail or new measured elevations. At narrow widths, the inherited settings overlay can cover the map; Hide settings exposes the regional view. Owner artistic/usability acceptance and physical-device certification remain separate.

Final offline source/build verification passes: **9,121 protected approved blobs**, all 147 earlier migrations/snapshots, original numerical engines/material/SVG assets, historical reports and gameplay source remain exact. All **1,716 runtime files and 604 validation scripts** match the isolated production copy. The exact frozen 0147 SQL bytes and bounded final correction pass independent checks. Verifier: `scripts/worlds-regions-source-check.mjs`; full receipt remains ignored at `artifacts/regions-s41-source-verification.json`.

## CPU comparison

Installed Chrome 134, `--disable-gpu`, same machine and matched owned geographic inputs. The reconstructed accepted **5D checkpoint 9863861** and candidate retain identical parent-World Canvas RGBA pixels. All nine original comparison limits pass; rounded milliseconds:

| Journey | Accepted 5D | Candidate | Unchanged limit |
|---|---:|---:|---:|
| Cold application ready | 2,871 | 2,318 | 3,589 |
| Warm navigation, ten keys | 141 | 130 | 500 |
| Regional zoom ready | 1,307 | 1,332 | 1,633 |
| Close ready | 2,509 | 2,537 | 3,137 |
| Repeated pan/zoom | 3,476 | 3,421 | 4,345 |
| Main-thread fallback navigation | 3,072 | 3,028 | 3,840 |
| Far zoom ready | 459 | 433 | 1,000 |
| Input during climate calculation | 8 | 8 | 100 |
| Climate preview | 974 | 977 | 1,218 |

The separate real World/region switching journey records cold World readiness **2.15 s**, first region **2.16 s**, five round trips **4.75?5.11 s**, ten pan keys **240 ms**, regional zoom **1.22 s** and reopening **2.71 s**. Compatible switches reuse the authorized pinned numerical root while refreshing relationship/revision metadata. Numerical and geographic documents remain exact; bitmap/source limits remain bounded and describe data estimates rather than process RSS.

The inherited artwork and label comparisons also pass on the successful continuation. Its 1,024-placement artwork stress records **1,262 ms** for 20 keys and **60.5 ms** maximum draw; 512 forced-collision labels record **630 ms** and **83.3 ms**, respectively. Original 1,500 ms navigation and 100 ms draw limits remain unchanged.

Timing variability is retained explicitly: `continuation-1` failed the inherited 5A/artwork close-readiness gate at 6,683 ms versus a 6,415 ms limit and fallback navigation at 6,310 ms versus 5,767 ms. One unchanged paired repeat passed all nine gates (close 6,409 ms versus its same-session 7,153 ms control; fallback 4,509 ms versus 5,779 ms). No source or threshold changed between samples. The failed pair is not presented as an optimization or erased by the passing repeat; these timings characterize this machine and simulated inputs.

## Failed evidence, publication and limits

Earlier owned SQL/fixture, FK-inventory and focused selector/layout failures remain local. `performance-1` used mismatched appearances and was rejected; `performance-2` caught missed return-to-parent cache reuse. `full-1` caught an artwork fixture field error; `full-2` stopped at source freshness before building the unavailable-source correction; `full-3` caught a completed-creation dirty flag; `full-4` caught reduced phone canvas height; `full-5` required explicit confirmation of the new unsaved-appearance guard. Their targeted corrections retain their original failed receipts.

`full-6` caught a disabled first-default appearance save. Revision-zero appearances can now be explicitly saved without marking an unchanged default as a navigation draft; `first-default-1` verifies that production correction and the final style journey establishes a nonempty restoration baseline. The optional regional header shortcut hides on expanded small screens with sufficient CSS specificity, while World settings retain the tools. Original World phone/tablet touch, pen, pinch rollback and extreme-coordinate checks pass. `full-7`, the timing failure in `continuation-1`, and the refreshed-panel navigation correction after `continuation-2` remain distinguished above. After that chain, visual review rejected a return view below the page fold and an interim scroll that left settings over the geography. `final-return-2` verifies the bounded correction with numerical centring, at least 200 visible Canvas pixels and an unobscured Canvas centre. Its large-World view uses the fresh owned million-kilometre numerical foundation; the preceding genuine browser-created million-kilometre journey remains separately retained. Early standalone mobile attempts hit the existing three-sign-ins-per-ten-second limit; the helper now waits the server-provided retry delay. No authentication limit was disabled or enlarged.

All screenshots, videos, browser outputs, dumps, profiles, reference images and large diagnostics remain ignored under `artifacts/regions-s41-*`. No gallery, new external asset/font or generated tile image is committed. This is the single delivery report; added documentation/evidence remains below 50 KiB, excluding required generated schema source.

No full Town/Building/Dungeon hierarchy, Studio, gameplay, export/printing or later-pass implementation is included. Regional bounds are immutable; no regional archive/delete UI is added. Existing non-destructive archive handling retains the shared terrain and reports unavailable parents. No owner-service restart, deployment or shared database mutation was performed. Technical implementation and required validation coverage are complete at the application checkpoint above. This report accompanies the authorized main publication. Stop at Stage 4 Pass 1; later passes and owner acceptance require their separate decisions.
