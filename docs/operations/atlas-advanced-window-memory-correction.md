# Bounded advanced terrain memory correction

A small selected-area erosion preview on a 2048-square native terrain source is refused even though its selected work is well below the existing cell and iteration limits. The previous numerical reserve starts at 48 MiB for this source before adding any selected work, so the suggestion to choose a smaller area cannot resolve the 32 MiB refusal. Accepted terrain remains intact.

The correction replaces the full-source Int32 eligibility lookup and Uint8 settlement-support mask with two axis rank arrays and masks for the selected window. Eligibility is retained before Float32 weight rounding, preserving the original neighbor decisions even for tiny positive edge weights. Wrapped column ordering, cell visitation, physical distances, rounding and numerical operation semantics remain the same. All four advanced operation kinds use the same bounded lookup.

The numerical reserve changes from `12n + 64c` to `7n + 64c + 4(width + height)`, where `n` is the saved source sample count and `c` is the selected window sample count. This removes the exact five bytes per source sample previously reserved for the two eliminated full-source buffers, retains the other conservative reserves and accounts for the new axis arrays. The 32 MiB bound, 262,144-cell limit, 8,388,608 sample-step limit, source capacities, 30-second deadline and refusal behavior remain enforced. A 4096-square source still exceeds this memory bound even for a tiny selection. No downsampling, automatic source creation, larger budget or alternate authoring path is introduced.

The ordinary full-source numerical result and exact patch remain the existing engine's output. No migration, storage format, history, permissions, source relationship, water record, renderer, authentication or deployment setting changes. The working-buffer reserve is separate from total process RSS and browser memory.

## Validation and retained failures

The unchanged application reproduces the refusal in a newly owned headed Chrome fixture after native creation of a 2048-square World, a bounded hill and accepted finer terrain. Its Root and every finer sample remain exact. A focused unit regression independently reproduces the same refusal on the unchanged engine.

The correction passes 22 advanced operation units. New coverage compares a bounded 2048-square edit with the identical regional samples, including exact patches, manual/finer masks, lake surfaces and settlement supports; compares cooperative and synchronous results; checks rotation of an erosion selection across the date-line seam; retains the 4096-square memory refusal; and checks pre-rounding eligibility against the original engine. All 2,978 final feature tests pass. Type checking passes, and lint retains one inherited unused-type warning.

The unchanged maximum-work numerical stress gate passes 262,144 selected samples and 32 iterations, or 8,388,608 sample-steps: approximately 3.90 seconds, 16.52 ms maximum observed event-loop lag and 24,125,440 reserved numerical bytes. Samples outside the selection remain exact. Process RSS, recorded separately, peaks around 137.5 MB on this installed CPU environment. These measurements do not establish physical-device or owner usability acceptance.

Retain the first full feature aggregate's two authorization-origin subprocess timeouts; the unchanged idle rerun passes all tests. Retain the first isolated build's missing public-font fixture and associated Turbopack errors. Restoring the exact existing public-font fixture changes no application input. Private receipts also retain the initial checkout line-ending/index normalization attempts and their final exact canonical baseline-tree proof.

Retain the intermediate draft's tiny-weight eligibility regression and its passing original-engine witness. The bounded eligibility flag corrects that draft before final validation. The first built browser preview successfully computes its bounded proposal, but its harness waits for acceptance before performing the real affected-geography review. That retained timeout is corrected by following the existing review checkbox; no application guard is removed or bypassed.

Exact local production build `y1R31-aRvvFVn4zPBe8LH`, application source `5bdaba432609c029cb24b94fc4cd8dd11b6b24dd77bd5ade6708e8e911a5b452`, passes the headed native preview/reject/accept/save, exact whole-source Undo/Redo, normal reopening and uninvited-user refusal checks. Its 2048-square source preview changes 2,016 samples in approximately 250 ms with 28.3 MiB numerical reserve; all outside samples and the finer source remain exact. Browser JS heap is recorded separately at approximately 80.3 MB used, 155.5 MB allocated. These are installed-Chrome CPU checks with GPU disabled, not physical-device acceptance.

Independent restoration passes all 407 public table digests, every one of the 165 migration rows, all three owned file roots and an authenticated restored browser reader. Retain the plain `pg_restore` empty-search-path refusal: the existing constrained, single-transaction recovery helper resolves it by correcting only the archive preamble. No function, constraint or retained row changes.

The same application bytes pass all 11 A6 groups and all four A3 groups, including seven native families, 19 actual downloads, later licensing-hold refusals and 19 independently rendered and visually inspected PDF pages. Private evidence retains the review-checkbox aria-label locator timeout separately from the earlier review-order timeout, plus the first output-inspection interpreter dependency failures. The successful inspection uses existing installed public Python packages. All owned services are stopped after their checks.

Publication, all four exact completed release workflows, hosted provenance and clean main/remote parity remain pending. Do not claim a verified release from local validation alone.

## Authoring boundary

All permanent geography continues through the visible native Atlas preview, acceptance, save and history controls. Research pictures, validation grids, exported operation settings and native-field audit records remain outside Git and never become imported terrain or editing-coordinate lists. The separately authorized geographic pilot and its unfinished work are recorded privately; this software correction does not complete or accept that pilot.

No owner database restore, migration, service restart, Production, Canon, Tabletop or home-server action is included. The separate [trusted-origin command](deployment-a5-trusted-origin.md#ready-one-time-owner-command) remains pinned to `973d4f57e10df5231f02ff6efeb1e1ad3ac04b45` and unapplied.
