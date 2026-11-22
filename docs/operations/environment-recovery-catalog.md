# Bounded signed recovery catalogs

## Status

This is a locally tested, isolated recovery candidate, not a qualified hosted release or a fresh owner backup. Owner Earth remains Root517/Hawaii44/water48 with128 sources and26 lakes. The valid signed Root229 capture is outdated. No owner database capture, restore, migration, restart, authentication or configuration change was performed for this candidate.

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

## Required publication and owner use

Complete final reviewed-byte checks and exact hosted normal/recovery/Ubuntu/publisher workflows, latest completed jobs/steps, independent actual GitHub/cryptographic image provenance and clean parity before owner use. Code checkpoints do not back up databases or private assets. Publish only explicitly reviewed source/test/workflow/documentation paths.

Then prepare a fresh current Earth paired-capture plan and independent original-capture restore. Any protected DEV writer freeze/service action or migration needs its own applicable owner authorization; never reuse completed0165/0166. A pending DEV-only restart decision is not migration or destructive-restore approval. Never restore over the owner database.

The immediate geographic assignment remains U.S.2A→2B→2C→2D, all50states/Alaska/Hawaii/WashingtonD.C. and necessary surrounding physical environments, with verification between stages and owner review after2D before political geography/later Atlas milestones. Native permanent authoring and all rights/preservation protections remain. A separately demonstrated full-World historical-appearance capture budget gap is not repaired by this disaster-recovery encoding and must remain explicit in the retained complete mapmaker audit. No U.S. stage, full mapmaker, owner, artistic or physical-device acceptance is claimed.
