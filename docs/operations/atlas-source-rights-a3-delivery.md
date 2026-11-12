# Atlas Stage A3 — source protection implementation

Status: **Local technical PASS recommendation; exact GitHub CI/publication pending. Not deployment authorization or legal clearance.**

Owner authorization: attachment `03459ff6-30b3-4125-bc9b-c23cb0c46e77`. Starting main: `6f5bdbe4687a00f03eca1b434782d932d71b5b40`. This assignment supersedes the earlier A3 implementation hold; it does not resume Earth or authorize changes to owner environments.

The [permanent policy](external-source-licensing-policy.md) and [retained Earth inventory](project-earth-licensing-inventory.md) remain authoritative. No old Earth source is cleared, removed or relabelled by this work. No original recovery content or shared database has been read or modified.

## Implemented protections

The existing assets, geographic datasets, raster versions, native maps, history and output engines remain authoritative. An additive review sidecar identifies their existing immutable records. Source evidence, upstream links, affected-use links and reviewer decisions are retained separately. An uploader's license string cannot approve external use. Administrator reviews record source clearance separately from product/output and recipient-rights verification.

Migration 0162 adds four append-only tables: `atlas_source_rights`, `atlas_source_review`, `atlas_source_use`, and `atlas_source_parent`. Existing Worlds and externally sourced records receive conservative review holds; no original geometry, metadata, files, accounts or history is rewritten. New original native authoring has no licensing form. Uploaded original artwork requires an explicit creator declaration. Missing-origin uploads remain private for review. External uploads pin exact registered bytes; their reuse requires clearance.

Source links currently apply conservatively to the entire World and retained history. A removed/hidden layer cannot clear derivation. This may hold a clean map in a mixed World; the implementation does not infer that removing a layer makes derived terrain independent. Replacing or narrowing a retained source needs a separately evidenced design, not a provenance deletion switch.

The legacy Stage 7C schema remains unchanged. It cannot transport mandatory notices to downstream consumers. Until a notice-aware contract is separately implemented, its read-only adapter refuses sources requiring notices and unreviewed editable-data rights; original content remains supported. This is an explicit delivery limitation, not an assertion that attribution disappears from the licensed source.

All Atlas export formats currently require both digital-image and print rights, plus verified output and recipient compliance, because the shared prepared source supports both image and print workflows. Partial-use grants may remain held even for a narrower output. Mandatory notices enter the existing export footer/credit pipeline independently of optional creator credit, style, layers or crop.

The owner sees **Sources & rights** in the World workspace. Required external credits remain visible even when that panel is collapsed. The advanced registration form records evidence; it does not approve a license. An administrator records a separate decision with permitted uses and verification of actual output notices and recipient rights. Review history is paginated. New artwork offers an original-work declaration or an exact registered external source. Historical versions, personal variations and reusable templates retain cumulative source links. Removing a layer does not erase its provenance. Normal saves refresh the visible credits.

`/api/worlds/source-rights` uses the existing authenticated request wrapper, expected actor and editor proof. Owner registration/linking requires the existing edit lease. Administrative review requires a current administrator session, exact review revision, and retained idempotency/audit records. Body and lineage limits fail closed. The existing geometry, raster and asset import services add exact-source checks. Native writes and non-owner reads enforce applicable rights; export preparation, resource delivery and final authorization revalidate current approval. Client labels cannot grant permission.

Two new retained User foreign keys are explicitly classified as account-deletion blockers. The account lifecycle plan now matches all 158 actual references. This changes neither accounts nor credentials.

The A5 first-time bootstrap had a fixed 162-entry schema guard. It now explicitly recognizes either the original 162-entry release or the A3 163-entry release, retaining exact SQL hash/timestamp checks, independent restore, writer freeze and all cutover guards. Unknown schemas remain refused. Its isolated test fixture and disaster-recovery assertions use 163 for the new release. Normal `serrian-update` behavior is unchanged: an actual database missing 0162 must stop for a separately approved migration. No migration, hosting configuration, deployment or service change was performed on an owner environment.

## Verification ledger

- Five source-policy unit cases pass; included in the full feature suite.
- Full feature suite: 2,947 passed after visible-credit refresh (`artifacts/atlas-source-a3/feature-tests-4.log`). The final focused export, source-rights and editor-credential suite also passes all 23 cases (`export-units-final.log`).
- TypeScript: `types-6.log` passes. Full ESLint: `lint-5.log` passes with the one unchanged `worlds-stories-checks.ts` unused `LoreFamily` warning.
- Existing collaboration foundation: all ten real PostgreSQL permission/session/lease groups pass (`foundation-2.log`).
- Real A3 service, migration and independent restore: all eight groups pass (`disposable-6.log`, receipt `artifacts/collaboration-s7b-a3-1794452094289/source-rights-results.json`). This includes unreviewed upload preservation, refused placement and transactional rollback, easy original uploads, administrator-only review, refused paid/special/incompatible approvals, separate output approval, current/historical credit plans, immutable source ancestry, templates, published synthetic personal variations, later revocation, failed migration rollback/retry and exact restored public table/file hashes.
- Deployment regressions: 65 Python cases (three platform skips), 15 JavaScript cases and two TypeScript cases pass (`deployment-1.log`). The Windows run does not substitute for Ubuntu CI.
- Portable integrity/raster regressions: 17 pass, one POSIX-only permission case skipped on Windows (`integrity-1.log`). Linux CI must execute the POSIX case.
- Headed Chrome uses a newly owned production build with GPU disabled and synthetic account login through the visible form. All seven original current and historical native source preparations and Stage 7C reads pass before introducing the test source. Actual seven-family PNG/PDF downloads pass. Final crop/style/hidden-label/optional-text/poster and revocation run passes (`browser-10.log`, `artifacts/collaboration-s7b-a3-browser-1794452262731/browser-rights-results.json`). It produced 19 files: eight PNGs, one JPEG, one hybrid SVG and nine PDFs comprising 19 pages. The independent output inspector passes (`output-inspection-final.log`), including identical visible mandatory footer pixels across all eight PNGs and exact SVG-to-PNG credit pixels. Production source digest: `2cdbbf1c689c2a8eee5fa297e09f1f9884934581ab91cb5cfe83e7c4776e415f`; build `5Vn9QaS0ZnHdGDEd0klj-`.

All browser/restore material is ignored in owned artifact directories. No real geography, screenshots, private files, database contents or recovery archives are published. The synthetic example.org license evidence is a test fixture, never a clearance of a real provider. Human source approval, owner usability acceptance, physical printer/device checks and legal review remain separate.

Retained failed runs include the initial legacy sidecar UUID encoding, a raw restore search-path failure corrected by using the established restore helper, stale lifecycle closure assertions, test historical-parent/edit-scope omissions, an incorrect synthetic interior route and outdated/collapsed browser selectors. The visible review selects received explicit accessible names. Failures were retained; no production guard or test assertion was weakened to obtain a pass.

Independent SVG rasterization exposed a genuine existing font-substitution defect: the license URL could run beyond the output edge. The hybrid SVG now retains the verified PNG footer pixels and full accessible notice text, with vector measurements unchanged. A pixel comparison proves its mandatory footer equals the PNG footer; it no longer relies on the recipient's fonts. All eight PNGs in the inspected fixture have identical mandatory footer pixels. JPEG and independently rendered SVG were inspected visually.

PDFs are rendered pages, not necessarily searchable text. The first text-extraction-only inspection was retained as invalid evidence; all 19 pages were then independently rendered. Default seven-family PDFs append a complete source-information page and visibly direct the map page to it. The cropped PDF and four-page poster carry the notices on the map pages. Full PDF/source pages must travel together; a license requiring notices on each individual standalone sheet needs its actual output reviewed, not an assumption that the default appendix is sufficient.

A broad filename-only search for a reusable PDF library encountered access-denied protected artifact directories. It did not open their contents or change permissions. Inspection dependencies were instead installed in this task's ignored directory. No owner recovery data was read or modified.

## Limits and owner decisions

- Existing Worlds receive a conservative legacy hold until their actual provenance is reviewed. This is a migration rollout consideration; no existing World is automatically certified original.
- A review closure is bounded to 512 source records and 32 ancestry levels. The owner source library shares that bounded review allowance; unusually large retained libraries require a future paginated review design. Over-limit records stay preserved and distribution stops.
- Retained World-level ancestry can hold unrelated clean maps. Precise source-independent forks would need a separately evidenced workflow.
- Stage 7C versions 1/2 remain unchanged and work for original content. They refuse external notice-bearing sources because they cannot carry the mandatory notices. No downstream consumer is silently given unattributed material.
- Export preparation conservatively requires both digital-image and print permissions. It does not offer partial-format clearance.
- Paid, incompatible and special-review sources remain outside ordinary approval. No source is cleared merely because a human selects a category; the reviewer is responsible for exact evidence and actual permitted use. Dishonest original-work declarations cannot be detected automatically.
- Append-only history is retained; revocation adds a decision. It does not rewrite accepted content, purge old records or retract files previously downloaded while permitted.
- Rollback tests cover transaction failure and exact restore. Once 0162 is installed, rolling back to pre-A3 application code would remove its enforcement and is **not** a licensing-safe operational fallback for external content. No automatic down migration is provided.

Retained initial preparation attempts include a PowerShell inline-Node quoting failure, an npm launcher nonzero result despite emitted schema files, and an edit helper that stopped after its final expected text did not match. Their outputs remain local. They do not establish a database migration or application pass.

## Policy references and review boundary

Implementation uses the existing owner policy. Official texts checked during this pass include [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.en), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en), and [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). These texts distinguish grants and obligations; their existence does not prove a particular uploader owns a dataset, has lawful access, or supplies all relevant rights. A human must examine the exact material and service terms. Special-review, incompatible and paid-source evidence cannot be approved through the ordinary review workflow.

Final delivery must state actual passing and failed checks, exact publication/CI identities, remaining technical limits, and the separate owner/Ember/legal review decisions. The current document is not that final receipt.

## Publication and preservation

The 162 prior migration journal entries and all 449 prior migration/snapshot/data/public canonical paths remain unchanged (`artifacts/atlas-source-a3/preservation.json`). No numerical engine, geometry format, sample limit, authentication source, package dependency, private Earth file or original performance threshold was changed. The fixed SVG output issue is the only rendering correction. Exact main publication, Linux recovery, deployment/registry CI and final parity will be recorded after they finish.

First application publication `07e2c84542328c3f7d92423dc6fd0b8282a54464`: normal validation [43145856105](https://github.com/Revty79/serrian-tide-website/actions/runs/43145856105) passed. Linux recovery [43145856050](https://github.com/Revty79/serrian-tide-website/actions/runs/43145856050) failed on the older regional fixture's explicit last-migration assertion; the publisher correctly refused that release. The correction explicitly checks both 0161 and 0162, all 163 entries, and excludes only the four new sidecar tables from its original-column comparison. Fresh/upgrade schema equality remains required. The corrected existing regional fixture passes locally (`regional-check-3.log`). The first local correction also retained the failed original-column comparison before listing the four additive tables explicitly.

A final service review made mandatory credit ordering independent of PostgreSQL row order, preventing unnecessary export-pin changes for mixed sources. A permutation regression and the complete eight-group source/copy/restore suite pass (`disposable-7.log`). No permission or review requirement was relaxed. The final visible production build is being refreshed for that exact source.
