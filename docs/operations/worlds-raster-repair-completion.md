# C2/C3 deployment repair completion

Starting pushed checkpoint: `14f9e2c24a17de16a37527a5f7e6de8aa2c2b58c`; C2 checkpoint: `6224fb6beaf71b552d504f7bd49373e8c27d529e`. The exact local review commit is supplied in the final handoff; this report is part of that commit. Independent review and owner acceptance remain separate. No remote push, Production contact/change, shared-service restart or Geo D/E implementation is part of this pass.

## Changes

- Committed portable `raster` commands reconstruct the exact canonical C2 manifest, verify source/derived hashes and selected categorical values, provision preprocessed bundles, associate new installation sources through normal generated-ID services, create/restore complete hardlink-aware backups and gate release readiness against storage, database and recovery evidence.
- Immutable staging publishes complete verified files atomically, publishes the manifest last, rejects conflicting existing files and supports killed-process retries. Recognized abandoned temporary files are removed only after successful controlled provisioning. C3 retains intra-bundle hardlinks with at most 512 aliases per physical file; transferred/prepared files remain separate.
- Native numerical reads validate the original digest once per process/filesystem identity. Both viewer layers validate complete metadata response shapes, accept legitimate JSON `null`, retain drafts through failures and retries, and preserve independent working layers/vectors. Privacy precedes all private-resource access.
- Visible ESA copyright attribution is corrected in presentation only. Frozen receipts, source/index bytes, classifications, numerical values, bundle hashes, database identities and applied migrations remain unchanged.
- Permanent [Map Maker D1-D5/E requirements](../architecture/worlds-map-maker-decisions.md) are recorded, including deep progressive zoom, reusable regional native 10-metre classification acceptance, connected scales, shared foundations/storage accounting and the separate Advanced Map Studio boundary.

## Operator commands and identities

Use [the complete portable deployment/recovery runbook](worlds-raster-deployment.md), including Linux paths, configuration, migration order, target gates, new-install associations and restoration. Commands are also exposed as `npm run raster -- COMMAND ...`.

```bash
npm run raster -- manifest-c2 --directory /srv/transfer/c2
npm run raster -- verify --directory /srv/transfer/c2 --values true
npm run raster -- verify --directory /srv/transfer/c3 --values true
npm run raster -- provision --directory /srv/transfer/c2 --root "$SERRIAN_RASTER_ROOT"
npm run raster -- provision --directory /srv/transfer/c3 --root "$SERRIAN_RASTER_ROOT"
# Run backup-assets / restore-assets and the documented readiness gate before activation.
```

| Verified identity | SHA-256 |
| --- | --- |
| C2 bundle/runtime manifest | `5d1afdf76e65bd44466dba0dc35fd5f9060857ce752442a35b21276bcabbcbef` |
| C2 original TIFF | `9d27d4b8ea8e76977e2988bca667d7c8fa68b927355feffcddd6b4875a7fd08e` |
| C2 native values | `522c6329ed7a8c08c14718e164b04ba203d23c51212371146b789baa419c9895` |
| C3 bundle/runtime manifest | `5136b690d44f0b049b0832995d610e0ebdc3ec4db7259ada605abbe4e3ba83ea` |
| C3 complete selected-source index | `5147450d7e8045d62b31b636cf798ceecddce53a1b3901ad60f286e62bb40416` |
| C3 original selected values including NoData | `dd1591a11a3ae29c76d1f9bdaf29f55b19739ea275bb513f83717ca4597ad169` |

All 11,142 C2 source/derived files and all 49,164 C3 source/derived files are verified against their complete manifests. C3's complete 2,651-tile original index, original decompressed tile values and global row-major digest are verified. The original worldwide native 10-metre archive was not downloaded. Original historical receipts remain retained.

## Combined hosting costs

| Component | Requirement |
| --- | --- |
| C2 complete bundle including original and manifest | **1,030,076,598 bytes / 982.4 MiB** |
| C3 complete logical bundle including index/originals/manifest | **185,508,991 bytes / 176.9 MiB** |
| Combined logical bundles | **1,215,585,589 bytes / 1.132 GiB** |
| Both Earth bundles under conservative 4-KiB physical-file allocation | **1,269,370,880 bytes / 1.182 GiB** |
| Additional inode/directory allowance for these two bundles | **37,817,600 bytes / 36.1 MiB** |
| Restored PostgreSQL geographic tables including raster metadata/indexes | **248,430,592 bytes / 236.9 MiB** |
| Entire populated restored database, including unrelated application data | **291,141,311 bytes / 277.7 MiB** |
| Paired custom-format database backup | **83,421,883 bytes / 79.6 MiB**, plus the complete private-asset backup |
| C2 numerical preprocessing work files, only if regeneration is deliberately required | **309,241,800 bytes**, plus input and prepared-output copies |

C3 has 18,251 physical asset files plus its manifest after deduplication; its flattened preparation has 49,164 asset files. A flattened C3 transfer alone models **342,593,536 bytes** at 4-KiB allocation, above the deployed categorical budget. Verified restaging reconstructs the compact linked layout. The final conservative categorical budget is **263,155,200 bytes / 250.96 MiB**, including categorical fixtures, manifests, filesystem allowance and all PostgreSQL raster tables/indexes (conservatively including C2 metadata). It fits 256 MiB; **it excludes C2 terrain asset bytes**. These measurements cover the retained content/revisions and 4-KiB model in this rehearsal; changed content or a different filesystem requires fresh validation.

Allow approximately **1.5 GiB** for the current geographic foundations plus the populated database, excluding application dependencies/builds, WAL growth and future content. A prepared transfer, active private volume, paired backup and disposable restoration can coexist during maintenance: plan roughly **10–12 GiB of working geography capacity**, including the release command's additional 4-GiB free reserve. Use a separate failure domain for retained backups; add application/build, PostgreSQL WAL and future-growth capacity independently. This is a practical planning allowance, not a new storage quota.

No terrain regeneration is required to transfer or restore the preprocessed bundles. If deliberately rebuilding, the earlier C2/C3 preparation receipts measured approximately 426 MiB / 305 MiB peak RSS respectively; this repair did not regenerate the worldwide rasters. The complete release gate measured **210.5 seconds / 389.3 MiB peak RSS** locally, performing bounded CPU/file reads. Normal browsing delivers bounded derived tiles rather than original TIFFs or worldwide class arrays: at most 16 tiles and four concurrent requests per layer, with private/no-store delivery. The recovered global view delivered **440,850 bytes / 15 elevation-tint tiles** and **42,640 bytes / 15 classification tiles**, totaling **483,490 bytes / 472.2 KiB** of raster imagery. HTML, JavaScript and vectors are additional; regional detail and shaded relief have different byte costs. No dedicated GPU, paid API or external runtime mapping infrastructure is required.

## Validation and readiness

Executed evidence is summarized in [the acceptance receipt](../reports/worlds-raster-repair-acceptance.json). Detailed logs, full backups and disposable environments remain under ignored `artifacts/guidance/geo-repair/`; application screenshots are committed under [worlds-geo-repair](../screenshots/worlds-geo-repair/).

- Fresh migration sequence: 132 migrations through 0131, 322 public tables. Fresh owner/World/timeline/map/surface/source/version identities were generated; native elevation and class reads work together.
- Existing installation: restored the retained populated backup into a new owned loopback PostgreSQL cluster; provisioned every retained bundle and checked exact database manifest/inventory/source associations without changing pre-existing rows.
- New-install operator association replay: both domains returned their original generated IDs with `created: false`; all database rows remained exact.
- Focused geographic, numerical, categorical, response and provisioning units: 65 passed, no failures/skips. Portable provisioning units are now included in the existing Ubuntu/Node 22 CI workflow for the next authorized push.
- Production browser: 11 groups passed with no page errors. Actual file removal/corruption, valid null, malformed JSON/shape, retry, retained drafts, unaffected vectors/layers, ordinary redaction during failures, native source failure/recovery, 390-pixel native-touch browser emulation and application restart are covered.
- Killed staging: interrupted after verified partial progress, no complete manifest exposed, exact retry and no-op replay passed with the canonical C3 bundle and maximum 512-link groups.

Complete database/private-asset recovery passed: all populated rows and **60,424 retained asset entries across six bundles** were exact, with both global original-value digests checked again. The paired dump SHA-256 is `fdad5711de5375bceeda8b798f34a378a823dbe5717e358a8f2a72c63e053460`. The retained-metadata digest is `66a10241be5a0fd54ccb192041c9404684a85fea978f91558b97e2c7fd624b51`.

The recovered application passed another **three** owner/ordinary/independent-Administrator, native-source, phone-touch and restart smoke groups, with no page errors. The complete release gate returned **`ready: true`** on the recovered Windows target: every live/backup asset verified, all six native value digests checked, matching current/recovery metadata, hardlinks, permissions, 4-KiB geometry and 4-GiB free staging reserve passed. This is local rehearsal readiness, not Linux or Production authorization.

The exact final runtime and operator-source fingerprints match the successful Node 22 production build. TypeScript, changed-file lint and diff checks passed. Only disposable environments were modified.

## Migration, configuration, deployment and recovery

This repair adds **no migration**. Preserve all applied entries, including **0130 → 0131**, and apply only pending committed migrations in journal order with `npx drizzle-kit migrate` on an authorized deployment target. No schema push or rewritten migration is needed.

Set an explicit absolute durable private `SERRIAN_RASTER_ROOT`, run the verified bundle transfer and paired backup/recovery workflow, then run the complete `readiness` command as documented against the actual target/service account. Install/build the locked release before controlled activation, preserve the volume across release updates, and smoke-test authenticated owner, ordinary aliases and independent Administrator review. Readiness checks explicit target metadata, current/backup assets, free staging capacity, permissions, hardlinks, allocation and recovery evidence. It refuses unverified/missing resources and metadata changed since the recovery point.

Code rollback does not undo schema, source rows, immutable versions or private bundles. Prefer a compatible forward correction. Exact recovery requires the paired database/private-asset backup with original identities, reconciliation of post-backup writes, ledger/release verification and full integrity checks. Never delete originals or ledger rows to accommodate older code. The runbook gives safe interruption, retry and quarantine/restaging procedures.

The current evidence was executed on **Windows / Node 22.23.3 / PostgreSQL 18**, with a conservative 4-KiB allocation model. A Linux environment is unavailable on this machine; Linux execution, actual target-volume allocation/ACLs and target deployment activation are **not claimed as verified**. The commands use portable Node/PostgreSQL APIs and the Ubuntu CI regression has been added, but a passing readiness report on the actual authorized Linux server remains a deployment gate. Existing Google Font downloads required network permission for the isolated production build; no new font dependency was introduced. Independent technical review, owner visual acceptance, remote push and deployment remain separate boundaries.
