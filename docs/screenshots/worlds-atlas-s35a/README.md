# Stage 3 Pass 5A evidence

Application `758531eb76531149f2affa53230b7599840d7872`; validation-only correction `459dc51847106ab14e12760dbcf36ba49f755dfa`. Production build `hXGMqV6x-X8kRZL1ExAw9`; runtime SHA-256 `0b46f65a8474a344a593928d30252450abebd884a13b3ea2298884bad8fc8331`.

[Delivery](../../operations/worlds-terrain-style-5a-delivery.md) explains implementation, persistence, checks, performance and recovery. [Combined validation](validation.json), [static checks](static-checks.json), [source verification](information-final/source-verification.json), [iteration history](iterations.json) and [raw-file checksums](files.json) retain the evidence. All maps/accounts are synthetic disposable fixtures; private test environment files are excluded.

**0143 is the sole new migration. The owner reports successful application. No migration after 0143 is required.** Its [frozen checksum](migration-frozen.json) is checked independently of the uninspected owner target.

## Matched production images

Both sides use the same accepted geometry, climate/category settings, camera and appearance. [All 42 comparisons](visual-comparison.json) pass and final artwork queues are empty. These are installed Chrome captures with GPU disabled. The original full gallery also remains in [Pass 4](../worlds-atlas-s34/full-3/environment-visuals.json); selected copies are [byte-verified](before-pass4/index.json).

| View | Before, approved Pass 4 | After, Pass 5A |
| --- | --- | --- |
| Realistic overview | [Before](before-pass4/matched-after-realistic-terrain.png) | [After](full-4/matched-after-realistic-terrain.png) |
| Illustrated overview | [Before](before-pass4/matched-after-illustrated-fantasy.png) | [After](full-4/matched-after-illustrated-fantasy.png) |
| Temperate world | [Before](before-pass4/climate-temperate-world.png) | [After](full-4/climate-temperate-world.png) |
| Windward mountains, Realistic | [Before](before-pass4/climate-temperate-windward-mountains-regional.png) | [After](full-4/climate-temperate-windward-mountains-regional.png) |
| Windward mountains, Illustrated | [Before](before-pass4/climate-temperate-windward-mountains-illustrated.png) | [After](full-4/climate-temperate-windward-mountains-illustrated.png) |
| Tropical world | [Before](before-pass4/climate-tropical-world.png) | [After](full-4/climate-tropical-world.png) |
| Close rainforest | [Before](before-pass4/authored-rainforest-close.png) | [After](full-4/authored-rainforest-close.png) |
| Close illustrated boreal forest | [Before](before-pass4/authored-boreal-close-illustrated.png) | [After](full-4/authored-boreal-close-illustrated.png) |
| Dry regional terrain | [Before](before-pass4/authored-hotDesert-regional.png) | [After](full-4/authored-hotDesert-regional.png) |
| Close dry ground | [Before](before-pass4/authored-hotDesert-close.png) | [After](full-4/authored-hotDesert-close.png) |
| Close tundra | [Before](before-pass4/authored-tundra-close.png) | [After](full-4/authored-tundra-close.png) |
| Alpine regional terrain | [Before](before-pass4/authored-alpine-regional.png) | [After](full-4/authored-alpine-regional.png) |
| Marsh and accepted water | [Before](before-pass4/accepted-marsh-environment-regional.png) | [After](full-4/accepted-marsh-environment-regional.png) |

Additional final views: [material-painted mountainside](full-4/realistic-mountainside.png), [wetland close](full-4/authored-wetland-close.png), [illustrated waterways](full-4/accepted-water-and-wetland-illustrated.png), [forest/ground transition](full-4/authored-meadow-woodland-transition.png), [Classic](full-4/matched-after-classic-elevation.png), [Physical](full-4/matched-after-physical-relief.png), [Topographic](full-4/matched-after-topographic.png).

## Creator workflow

[Desktop workshop](full-4/style-settings-desktop.png), [accepted custom style](full-4/style-custom-accepted-map.png), [saved/reopened in a fresh context](full-4/style-saved-reopened-fresh-context.png), [390px touch settings](full-4/style-settings-390-touch.png), [820px touch settings](full-4/style-settings-820-touch.png).

[Browser workflow](full-4/style-browser.json), [HTTP security](full-4/style-security.json), [database semantics](full-4/style-database.json), [upgrade/restore](full-4/style-migration.json), [inherited environment checks](full-4/environment-browser.json). Preview, cancel, accept/save, defaults, original retry, cross-map selection and separate authoritative saves are checked through the real application.

## Validation scope and retained failures

The **full-4 aggregate failed** at the benchmark input identity guard after its terrain/water/environment/style functional coverage and timing limits passed. Independently seeded hashed node references differed; physical topology did not. [Read-only proof](water-reference-proof.json) and the validation-only correction preserve coordinate/width/connectivity comparisons. The corrected [paired-final comparison](paired-final/style-performance-comparison.json) passes. The [information-final continuation](information-final/results.json) passes the remaining general Worlds checks and explicitly records skipping the already-covered terrain browser chain. All use the identical application runtime above. No failed aggregate has been relabeled as passing.

The performance receipt retains original archived Pass 4 timings, two rebuilt Pass 4 samples and final metrics. The 25% artwork limit uses the mean of those matched live controls. The archival full-3 failure remains indexed. Cache bytes are estimates rather than process RSS; touch emulation is not physical-device certification.

Personal image inspection is recorded in the delivery. Coarse broad relief, texture-dominant flat ground at extreme zoom, procedural crowns/summits and the retained catchment wrap discontinuity remain visible. Technical completion does not record owner artistic acceptance, independent approval, deployment or Pass 5B authorization.
