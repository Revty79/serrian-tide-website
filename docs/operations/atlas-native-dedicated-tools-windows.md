# Bounded native volcano, river and eruption tools

Status: locally qualified; exact hosted release gates remain pending, 2026-11-22. This candidate is **not yet verified or active on the owner's editor**. The qualified owner application remains14e049fd until the exact published commit passes every required hosted gate and tested-byte activation check.

## Demonstrated problems and correction

A small dedicated operation on a4096-axis finer source previously reserved buffers for the full source and could refuse the unchanged32MiB working limit. Profiles and erosion already supported native bounded windows. This change reuses that path for volcanoes, river channels and numerical eruptions. It retains original sample positions, selection, parent protections and numerical algorithms, without downsampling or creating another terrain store.

Required reads remain complete even when they lie outside the selected area: a volcano's centre, the retained river course and a lava source. The planner includes those accepted native samples plus its existing tile/reconstruction halo. A wide dependency still refuses if it cannot fit the same resource bounds. Source-coordinate nearest-sample rounding and river/lava corridor arithmetic retain the original lattice and offsets.

The second problem was independently demonstrated on actual Earth: Hualālai Save19 changed35 original dry shoreline-support heights. Normal Undo20 restored18 exactly; the rejected result is retained and must not be redone. The dedicated tools protected sea samples but did not offer the dry support protection required for Earth's accepted coastlines.

Volcano, river-channel and numerical eruption controls now offer **Keep saved sea shoreline**. It preserves original sea and eight-neighbour dry shoreline-support heights, including accepted inherited support guards. It defaults off; absent/false operations retain their existing admission and arithmetic. The operation field is bound to preview/proposal hashes and authoritative server recomputation, and persists in normal native recovery. Visual ash remains a separate environment workflow.

The control does not reshape an adjoining coastal bank, make an otherwise inaccurate landform acceptable or repair previously rejected Patagonian/Lofoten joins. Inspect adjacent slopes and the complete affected source after saving; reject inferior geography through ordinary history.

## Limits and preserved contracts

The limits remain262,144 selected samples,8,388,608 charged sample steps,32MiB numerical workspace,30seconds and250,000 metadata characters. The optional coastal scan reserves eight additional steps per selected cell. River/lava corridor admission includes that reserve. No extra numerical buffer is required by the guard. Large wrapped sources retain their prior refusal; this change does not add a new seam algorithm or raise source capacity.

Database schema, migrations, writer/history transactions, endpoints, rights, authentication, configuration and renderer are unchanged. Native worker/fallback, cancellation, preview/review/accept, lost-acknowledgment retry, saved provenance and ordinary Undo/Redo remain the authoring path. No owner restart is required or authorized by this change.

## Exact local qualification

Frozen v4 has2,232 application inputs with Windows raw fingerprint `84863e3777f04db9649d1da1c8fa286c7dfe7a3fc598941e7fa03888d38cb939`. The production build is `TZpMKtgQee2x0nAKDXctA`. All3,152 unit tests in408 files, full TypeScript and full lint pass; lint retains the inherited LoreFamily warning.

New ordinary browser journeys use real4096×4096 and4096×2048 native finer sources and a protected child. They exercise visible creation, all six appearances, reject/recover with the shoreline flag, authoritative numerical acceptance, exact original-request retry, complete-grid Undo/Redo, collapse/lava provenance, fresh reopening and cooperative fallback. Synthetic owned geography is technical evidence, not actual Earth or artistic acceptance.

The broader matrix retains standard2048/128, actual4096-square, legacy640×384/64 and development Strict Mode journeys for shared relief, erosion, continuation, protected banks, complete border review, selected reconstruction and retained-draft choice, plus A6, source refresh and bounded profile regressions. The final matrix passes227 native group executions plus11 A6, two source-refresh and eight profile groups:248 browser executions. The corrected advanced-service/paired-restore journey adds eight groups, for256 total group executions, not256 distinct cases. All25 recorded owned fixtures are stopped and all48 recorded ports independently closed. DEV7548/3000, PG5296/5432 and configuration8ba2de22 remain unchanged.

Six final native appearances and the new control/review explanation have been visually inspected. Retain realistic-terrain relief contrast without environmental cover and coincident selection/change-label overlap for the broader output-quality audit. No new PDF suite, physical-device certification, unfamiliar-creator acceptance, owner or Ember approval is claimed.

The maximum-selection4096-square benchmark processes262,144 selected samples with2,359,296 charged steps and2,944,282 visits. It takes619.43ms, with15.41ms maximum timer delay and24,125,440 numerical working bytes. Original input, sea/shore supports and all samples outside the selection remain exact. These are synthetic desktop numerical results, not process RSS or device acceptance.

## Retained failures

Keep the original focused nearest-sample-tie fixture assumption failure, concurrent authorization subprocess timeouts, unsupported512-square Root browser fixture, fallback crater/blend mismatch, rectangular source's insufficient vertical-detail refusal, all superseded v1–v3 receipts and the incomplete v3 matrix. Corrected tests retain the same production admission guards and deadlines. The final full unit run uses serial execution with the original per-test timeouts.

Retain the private benchmark's CJS/top-level-await launch failure before numerical execution. Its corrected asynchronous wrapper changes no application, source, limit or deadline. Preserve native operator/selector/path-synchronization failures separately from actual saved-geography failures; an incomplete observation is not a passing receipt.

The additional legacy advanced test originally compared its0156 snapshot after the shared fixture had applied later migrations and rights/session setup. Its failure is retained. The reusable test now uses the existing immediate post0157 hook to compare every original public row/file and the158-entry stage ledger before those later changes. All assertions remain; the fresh current-schema service/paired-restore journey passes eight groups. This is one additional reviewed test path; all2,232 v4 application inputs, six original product/test paths and the production build remain byte-exact. Final full types and lint pass after the test correction. The benchmark wrapper correctly refused the earlier failed prerequisite; its fresh corrected-prerequisite run supplies the stated result.

Hualālai19/Undo20 remains a real rejected geographic result. During qualification, the still-qualified older editor authored Mauna Loa's inland northeast transition24/Undo25/Redo26 and southwest transition27/Undo28/Redo29. Complete grids, higher summit/caldera terrain, all12,229 original Hawaiian shore supports, Root, all126 other fine heads/frames/pins/history and water remain exact outside those accepted native areas. Fresh ordinary29 reopening passes. These working forms do not complete Hawaii or U.S. Pass2A.

## Publication and return to authoring

Publish only the seven reviewed implementation/test paths plus AGENTS, this receipt and the [full U.S. requirement audit](worlds-atlas-us-completion-audit.md). Preserve every other parent raw file and the exact frozen application bytes. Require the four exact completed workflows, their latest completed jobs and steps, independent actual GitHub and cryptographic hosted provenance, clean main/origin parity and a guarded normal owner reload before use.

After qualification, retry the original Hualālai operation through the visible editor with the new shoreline control. Independently verify the saved shore and slope result, complete Undo/Redo and reopening. Continue complete U.S.2A and the entire adopted roadmap; do not stop at a software checkpoint or resume worldwide authoring. Non-U.S. work stays parked intact.

Root229 paired recovery is outdated. A fresh current-geography paired capture and independent restore remain part of the final review. Code checkpoints are not database/private-asset backups. Completed0165/0166 and their one approved freeze/restart must not be repeated or reused; carry973d4f57unapplied. No Production, Canon, Tabletop rebuild, owner service, authentication or configuration action occurs in this qualification.
