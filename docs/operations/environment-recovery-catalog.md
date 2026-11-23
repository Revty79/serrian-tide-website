# Bounded signed recovery catalogs

## Status

The integrated recovery application is hosted verified and has a fresh actual owner paired recovery proof under the explicit ONLY0167 maintenance approval. Signed snapshot eae04eae-d2fd-4d39-9ace-322b4de6b7ea covers254,828physicalfiles,409tables and167originalmigrationentries. An independent restoration from the ORIGINAL signed capture verifies all128numericalgrids/708,313,088samples, old public data, rights, history, frames, pins and all three storage roots. Separate AES256GCM sealing and authenticated opening reproduce the signed metadata/archive/roots. The owned fixture is independently closed. Owner Root517/Hawaii49/water48 and26lakes are preserved. ONLY0167 passed rehearsal before application; normal DEV restarted with login/configuration preserved. The owner database was never restored. See the [activation receipt](project-earth-us0167-owner-activation.md). Root229 recovery remains retained and outdated; the current checkpoint is not final geographic or whole-mapmaker acceptance.

Read-only current sizing found254802private files and a74649720-byte strict lower bound for the logical manifest. Both exceed the original250000-file/64MiB plain-format limits. Files/history must not be pruned to fit a capture. This change extends the existing recovery tools with a bounded, signed metadata encoding; it does not change any geographic source.

## Format and compatibility

Ordinary snapshots retain the original version1 logical manifest,250000-record limits,64MiB signed-metadata limit and pretty bytes when they fit. Compact JSON is used when pretty formatting alone would exceed that same limit. Older signed captures and their physical completion receipts remain immutable and verifiable.

Larger snapshots use a signed version2 root descriptor and the fixed `manifest.catalog.json.gz` file. The descriptor binds snapshot identity, compressed byte length/SHA256 and expanded byte length/SHA256. Compressed metadata remains at most64MiB; expanded logical JSON is at most256MiB. File inventory and terrain/artwork reference arrays are explicitly capped at500000. Other collection bounds remain unchanged. No unbounded decode or arbitrary inventory-limit override is accepted.

The reader verifies the signed descriptor and regular unlinked catalog path, then compressed length/hash before decompression. Decoding enforces both declared and absolute byte bounds for every chunk, validates expanded hash, strict UTF8/JSON/schema and exact snapshot identity. Paths, collisions, hardlinks, original content references, archive hashes, signatures and permissions retain their established checks.

The writer streams validated JSON through bounded buffers, checks compressed/expanded lengths and hashes, syncs the catalog, and signs the descriptor only after encoding finishes. Known cancellation propagates through inventories, file copying, metadata encoding/decoding, transfers and final verification; no backup completion receipt is published after an observed abort.

AES256GCM transfer keeps the existing `STENV001` header. Version1 retains its four metadata frames. Version2 adds only the exact catalog frame between manifest signature and completion metadata. The entire encrypted stream authenticates before any manifest or object is published. Complete receipts bind the physical signed root descriptor; an old receipt cannot certify a different metadata encoding. Use the verified logical reader/CLI rather than assuming `manifest.json` always contains the complete database/file arrays.

## Local evidence and limits

The integrity suite passes26tests, including legacy bytes/frame order, encrypted exact metadata/archive/hardlink round trips, corruption before decode, wrong keys/receipts, unsafe paths, declared/absolute decode limits, legacy250001 refusal, explicit500001 refusal, cancellation and a metadata-only catalog above64MiB. The metadata-only case is not a physical database restore.

The separate real PG18 fixture passes16operational groups. It has409tables,167canonical migrations, terrain/artwork/raster originals and a PostgreSQL large object. Adding250001physical retained files yields250136files in all three roots. The original signed version2 capture contains87255740expanded metadata bytes and975217compressed bytes. A new disposable database restores from that **original signed capture**, independently verifies table/sequence/schema/reference and all-root equality, and separately completes an exact encrypted transfer/open/verification. The original fixture source remains unchanged. This fixture has two synthetic Worlds and does not claim every later map-family or owner-world workflow.

The full Windows rehearsal took2210771ms. This is not a Linux timing or performance guarantee. Its recorded PostgreSQL61380 and application64742 ports were independently confirmed closed and the owned PG PID file absent. No process was stopped by that audit.

Full types and lint pass. The owned production compile/typegen/production-typecheck pass. Retain the first dependency-junction/Turbopack build refusal and corrected owned offline dependency install, initial npm CLI-path failure, and strict build/types input failures on newly generated build metrics. Independent source/compiled-artifact verification passes the preliminary parent-context build; it does not turn that stamp into an exact committed/hosted candidate. Preserve every previous integrity, interruption, corruption and recovery failure.

All2232qualified application inputs retain SHA84863e3777f04db9649d1da1c8fa286c7dfe7a3fc598941e7fa03888d38cb939;10847other original raw files were independently exact before this new receipt. Numerical kernels, renderers, geography writers, source rights, endpoints, authentication and owner configuration are unchanged. No migration or package/dependency change is introduced. The recovery workflow enables the large physical-file case inside its existing offline owned image without increasing its40-minute job timeout.

## Combined release checks

The recovery changes are combined with the installed-gated source-capacity candidate at `f0014cbc7d79b0664f28976440a76034e58e8466`. The final exact combined source passes 26 integrity tests, full types/lint and the stamped production build. A second, standard 168-ledger recovery rehearsal passes 15 groups, restoring 409 tables, 135 files and all three roots, then proving fresh-production authentication and native reads. It has two synthetic Worlds and richFixturefalse. This complements the original large 167-ledger physical rehearsal; the exact final 168-ledger large case remains required in the unchanged40-minute hosted workflow.

Combined review preserves all old SQL files, old167 journal entries, 2,234 frozen application inputs (SHA256 `7568bc22dde3036bf58edbeb6584f33bc11925f7c62bcd0267eee6daacb3b875`) and 10,800 other parent raw inputs across 66 reviewed paths. The historical 2,232-input statement below describes the standalone recovery candidate. Final hosted workflows, independent provenance, parity and any protected owner operation remain pending.

## Required publication and owner use

Complete final reviewed-byte checks and exact hosted normal/recovery/Ubuntu/publisher workflows, latest completed jobs/steps, independent actual GitHub/cryptographic image provenance and clean parity before owner use. Code checkpoints do not back up databases or private assets. Publish only explicitly reviewed source/test/workflow/documentation paths.

Then prepare a fresh current Earth paired-capture plan and independent original-capture restore. Any protected DEV writer freeze/service action or migration needs its own applicable owner authorization; never reuse completed0165/0166. A pending DEV-only restart decision is not migration or destructive-restore approval. Never restore over the owner database.

The immediate geographic assignment remains U.S.2A→2B→2C→2D, all50states/Alaska/Hawaii/WashingtonD.C. and necessary surrounding physical environments, with verification between stages and owner review after2D before political geography/later Atlas milestones. Native permanent authoring and all rights/preservation protections remain. A separately demonstrated full-World historical-appearance capture budget gap is not repaired by this disaster-recovery encoding and must remain explicit in the retained complete mapmaker audit. No U.S. stage, full mapmaker, owner, artistic or physical-device acceptance is claimed.

## Bounded recovery-reader candidate,2026-11-23

The [separate throughput receipt](environment-recovery-reference-throughput.md) records a locally qualified fixed16-reference I/O addition, complete draining/checksum/root-restoration guards, exact local regressions, standard owned recovery and benchmark limits. It remains hosted-unqualified and inactive. The actual completed owner0167maintenance used the prior qualified SDK unchanged. No new owner recovery/service/schema action occurred. All existing U.S.geographic and original mapmaker acceptance requirements remain open.

## Current qualified reader and recovery boundary,2026-11-23

The [fixed16-reference reader](environment-recovery-reference-throughput.md) is hosted verified and active at f0330827f2e75b350b27910bebc60a3eed59fb47. The exact attempt 1 workflows normal45129620680, recovery45129620594, Ubuntu45129620406 and publisher45129620432 pass every required latest completed job and step. Independent actual GitHub and cryptographic OCI provenance pass image sha256:7b15927879ec82c20f6f1013dc02490fd25252c4b86c55843810efc29b7483d4 and Linux fingerprint a1f9cce7102ef9d461588923846bfda004e98ea5f8b58f52917f1042b9a46b2d. The previous candidate account is historical. The actual completed ONLY0167 owner maintenance used the prior SDK throughout; this release did not recapture, restore, migrate or restart the owner environment. Its verified original517/49paired snapshot remains retrievable. Native working geography is now67, so final current-geography recovery remains open. Native Saved elevations restoration55->62 is a normal versioned terrain edit, not an owner database restore.
