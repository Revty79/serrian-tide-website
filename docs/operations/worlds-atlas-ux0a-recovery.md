# UX-0A independent saves and recovery checkpoint

This is an implementation checkpoint in the authorized UX-0A pass, not initial owner-testing readiness. The [third artwork study](../screenshots/worlds-geo-ux0a/art-direction/revision-3/README.md) still awaits Ember's independent gate decision. No full-library expansion is represented here.

## Behavior

Studio's Save and recovery panel lists artwork, coastline/source, surface association, generation acceptance, relief preferences/source knowledge, land-cover preferences/source knowledge and any separate historical details. Each action keeps its own save boundary. It does not describe those operations as one transaction. The existing combined dirty/navigation guards remain active.

Generic live owned baseline maps support a strict version-1 recovery bundle. It retains supported dirty domains, original base revisions and request IDs, unfinished artwork outlines and geographic rings, current brush/selection and coordinate-view settings. The total UTF-8 envelope is capped at 4 MiB before parsing. Unsupported format/version, foreign user/World/map/timeline, specialized source payloads and unavailable exact artwork are rejected. Downloaded bundles can include a chosen subset of domains. A previously verified editor can download its current live draft even during connection failure.

Restoration freshly checks the signed-in owner, active map and timeline through existing authorized APIs. It checks the original surface/reference and existing source access; it never creates missing records or saves content. The native review dialog lets the creator choose domains. Results identify staged and rejected domains independently. Old artwork/source bases remain old until a deliberate comparison/rebase. Artwork restoration is one undoable action; the package does not promise the full prior undo stack. Rebase aligns shared-place revision metadata while retaining recovered content and undo/redo.

Keep a recovery draft on this device is explicit opt-in, keyed by user/World/map/timeline. Completed operations schedule a bounded checkpoint after 200 ms. Pending fields/gestures/saves show Apply/finish needed. A checkpoint found when opening the map is held until reviewed and explicitly replaced or forgotten; selecting only some domains does not silently erase the others. Partial saves remove only their saved domain from the next checkpoint. Quota/storage errors retain the live draft and allow a separate download. Device checkpoint feedback and file-restore errors have independent state, so a successful checkpoint cannot erase an invalid-file error.

Generation recovery regenerates the retained versioned recipe in the browser worker and verifies its digest. It preserves the preview/request identity and any original acceptance body. Source creation/revision keeps its original request after an uncertain save; geometry/account changes are held until retry verifies the operation or an existing source is deliberately compared/rebased. This avoids turning an uncertain new-source save into another create request. JSONB and portable coordinate references are compared by validated value, independent of property order.

Relief and land-cover drafts retain independent preference/source bases and action-specific pending bodies. Saving preferences clears only preferences; source revisions clear only their own knowledge/account draft. They expose saved comparisons and deliberate rebase. Specialized editors and historical source formats keep their established save paths; the generic recovery control does not adopt them.

## Validation and remaining work

The evidence index is [recovery screenshots and browser proof](../screenshots/worlds-geo-ux0a/recovery/README.md). The complete feature suite passed 2,228 tests before the final reference-comparison/rebase additions; all six focused recovery tests pass afterward, including value comparison and draft-preserving rebase. The isolated Node 22.23.3 production build passes at runtime fingerprint `4acbd996279d64895a54a396cfe55201dddee6ef1cac9c93f692e13e0241d586`; local TypeScript passes. Full lint has zero errors and only the previously recorded unused `LoreFamily` import in `scripts/worlds-stories-checks.ts`. Changed-file lint and `git diff --check` pass. Browser checks use only the newly owned loopback production target and normal website edits; initial creation provenance remains in the earlier empty-start record.

Scientific presentation recovery still needs dedicated actual-browser fault proof with newly owned small synthetic compatibility sources. This checkpoint does not claim the complete final zero-World generated/manual journeys, integrated learning, final asset collection, performance/storage budgets or joint readiness.

Cody personally inspected the desktop partial-save/comparison/storage-failure images and the 390px native-touch review dialog. The browser page-error list is empty.

The browser proof exposed and corrected coordinate-reference property-order rejection, startup surface readiness, disappearing file errors and an artwork rebase that initially substituted saved content. Harness corrections use the SVG matrix rather than letterboxed element ratios, retained map identity after a legitimate rename, and precise assertions for independent storage errors. No product/data workaround bypasses the website.

## Deployment and preservation

No additional migration or configuration is introduced. The release still requires immutable 0132 after 0131, shipped with compatible v2 readers/writers, exact built-in catalog/assets and shared theme roles; see the [foundation report](worlds-atlas-ux0a-foundation.md). Never down-convert retained v2 artwork/history for a code rollback. Keep original recovery files with a matching release if a future format/library is unavailable. Turning device recovery off leaves existing checkpoints until deliberately forgotten.

This is a feature-branch review checkpoint only. No main merge, deployment, shared DEV/Production write, shared restart, Docker operation, retained-backup/private-asset modification, deleted-Earth restoration or later Geo scope is authorized by it. Owner testing remains gated on Cody and Ember approving the same completed release SHA.
