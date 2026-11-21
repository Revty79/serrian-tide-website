# Bounded native erosion and preserved shoreline transitions

Status: implementation and focused checks pass; final qualification and publication are pending. Owner geography has not used this candidate.

## Actual limitation

Earth's retained Southern twelve-point profile now prepares its original 500 × 10 km Chonos work area in 7,213.2 ms. Native save 216, Undo 217 and Redo 218 restore complete Root, Patagonia and Chonos grids and old parent references. Further adjoining native areas reach Root 229 / Patagonia 39 / Chonos 92 / water 48, covering 142 km of working relief. All original sea classifications, 59,947 Root shoreline supports, 27,369 Patagonia supports and 144,486 Chonos supports remain exact. The water records and unaffected sources remain preserved.

Preservation alone did not establish geographic quality. An independent numerical inspection, excluding the current southern work front and outer work-area sides, finds a 1,757 m shore-to-interior jump over 168.22–176.65 native metres, about 84.53° in Atlas's flat coordinate convention. This is an artificial transition requiring correction. No additional geography was accepted after that finding.

The actual editor refuses even a 10 × 10 km erosion selection on the 4096-square Chonos source: `This operation exceeds its 32 MiB numerical working-buffer budget.` Profiles already use bounded native windows; erosion still reconstructed the whole source.

## General Atlas correction

- Extend the existing native window planner, worker/fallback and independent tile validator to erosion. Keep every original sample and the existing 262,144-cell, 8,388,608-step, 32 MiB, 30-second and 40-iteration limits.
- Offer explicit saved sea-shore preservation. Original sea and eight-neighbour support heights stay fixed. With deposition off, unexcluded shoreline land can receive numerical outflow without changing its height. Water beds, sites, protected manual terrain and finer terrain are excluded from receivers.
- Offer an explicit outflow response from 1× to 4× when deposition is off. The old response remains the default, and depositing transport retains that response. Maximum wear and the original per-step wear cap remain unchanged.
- Extend the existing joined native operation, atomic writer, retry and whole-group history to erosion. Continue using accepted source frames and immutable parent references.
- Retain the existing profile recovery key exactly. Erosion uses a separate key and cannot replace the retained profile intent or work area. Gate joined erosion on the new schema capability; ordinary profiles remain available on the earlier schema.

The model is stylized mapmaking transport, not a geological forecast. Numerical distances and angles use Atlas's existing flat coordinate convention. Display exaggeration does not change saved heights.

## Additive migration 0166

`0166_atlas_shared_erosion` extends the existing immutable relief receipt's operation-kind check from profiles to profiles or erosion, and adds a capability marker. It adds no table or column and changes no stored geography. Every old migration remains unchanged. The release ledger gains its 167th canonical entry; unknown future schemas remain refused.

The owner explicitly authorized necessary DEV tables/schema after this limitation was identified: “if we need new db tables, go ahead and make them... we are making this wo5rk, not half assing it”. This authorizes the necessary DEV correction after qualification, verified publication and guarded fresh recovery/rehearsal. Do not ask again for this correction. Migration 165 is already complete and must not be repeated. No owner application or restart has occurred for this candidate.

## Qualification in progress

The focused suite passes 43 cases, including eight new erosion cases. Full source/window parity, original absent/false behavior, protected receivers, nonzero sea levels, wrapping shores, cancellation, strict admission and separate recovery keys are covered. The whole synthetic 1,800 m transition falls to a maximum 148 m adjacent step, about 39.96°, in one 40-step batch with the explicit 4× response. A second batch reaches 102 m, about 30.003° after metre rounding. This is numerical fixture evidence, not an Earth correction or owner acceptance.

The populated owned PostgreSQL rehearsal retains every old public row and column and every prior 166-ledger row. Deliberately failed schema work rolls the constraint and capability function back exactly. Pre-migration erosion refuses; post-migration acceptance, exact retry, complete-grid Undo/Redo, stale refusal and immutable-history guards pass.

The first native large-source aggregate passes its original eight profile groups and five new shared-erosion groups before the single-source test selects saved sea and correctly produces no changes. Acceptance stays disabled. This is a retained harness failure, not an aggregate pass. The corrected test uses land in the affected leaf source, with unchanged product code, deadlines and guards. Final native aggregate, full unit/lint/build, performance, permissions, restoration, export checks and publication receipts remain pending.

Retain the earlier unsupported-window assertion failure, initial database JSON type error, lint `prefer-const` failure, private CLI export-path failure, zero-change native test and all associated screenshots/logs. The standard-response slope test also remains visible: 40 steps alone leave a 376 m inland step. The stronger test measures the whole band rather than just its first shore pair.

## Continuation

After qualification, publish only reviewed files to `origin/main`, require all four exact completed workflows and independent hosted provenance, and preserve clean parity and tested application bytes. Prepare a fresh signed paired capture of the current owner geography, authenticate its opening, independently restore it, rehearse 0166 and apply the approved guarded DEV correction. Preserve the ordinary Revty79 session, configuration, existing geography and running owner services.

Then correct the actual coastal transition through visible native Atlas controls, inspect all completed joins and resume the entire authorized global Pass 2A. A software checkpoint is not geographic completion. Global relief, fine-source joins, significant islands, representative ice surfaces and final current-geography paired recovery remain unfinished. No owner/Ember or physical-device acceptance is claimed. No imported terrain, external editing lists, SQL geography writes, hidden authoring endpoints, later passes, Production, Canon, Tabletop or home-server action. Carry `973d4f57` unapplied.
