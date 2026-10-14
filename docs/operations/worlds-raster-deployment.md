# Portable C2/C3 geographic deployment

These commands run from a locked release checkout on Node 22 with `npm ci`. Linux with PostgreSQL, a local durable POSIX filesystem supporting hardlinks and private storage is the intended server configuration. The commands also support Windows rehearsal. No GPU, mapping subscription, provider credentials or runtime external tile service is required. Do not put raster assets inside `public` or disposable build output.

`scripts/raster-deployment.ts` performs controlled full-volume checks. Browser tile requests validate only the requested bytes after authorization. Native C2 reads verify their original file once per process/filesystem identity, with bounded TIFF sampling thereafter; a changed file must pass the digest again. Failed checks never become successful cache entries. The runtime volume is immutable to ordinary application users and must remain protected from untrusted writers.

## Inputs and frozen identities

Git contains receipts, **not** the actual raster bundles. Obtain the complete preprocessed C2 and C3 bundles from a verified retained installation or paired asset backup. Supply all files listed by each manifest; the receipt alone cannot reconstruct missing image or numerical bytes. Transfer preprocessed bundles rather than regenerate them. C2's historical local-only preparation/refresh helpers are not a deployment dependency.

| Retained item | SHA-256 |
| --- | --- |
| C2 runtime manifest/bundle | `5d1afdf76e65bd44466dba0dc35fd5f9060857ce752442a35b21276bcabbcbef` |
| C2 original ETOPO TIFF | `9d27d4b8ea8e76977e2988bca667d7c8fa68b927355feffcddd6b4875a7fd08e` |
| C2 native Float32 values | `522c6329ed7a8c08c14718e164b04ba203d23c51212371146b789baa419c9895` |
| C3 runtime manifest/bundle | `5136b690d44f0b049b0832995d610e0ebdc3ec4db7259ada605abbe4e3ba83ea` |
| C3 original selected-source index | `5147450d7e8045d62b31b636cf798ceecddce53a1b3901ad60f286e62bb40416` |
| C3 selected values, row-major including NoData | `dd1591a11a3ae29c76d1f9bdaf29f55b19739ea275bb513f83717ca4597ad169` |

C2 has 11,142 source/numerical/display assets; its exact runtime manifest is reconstructed from the committed receipt by removing preparation-only metadata and serializing the validated runtime schema in its original order. Its frozen digest must match before writing. C3 has 49,164 logical source/display assets and 2,651 selected source tiles. Verification checks the complete source index against every retained tile descriptor, each decompressed original tile value hash, valid codes, the complete derived asset inventory, and optionally both entire row-major value digests. Multipart provider ETags remain validators, never original full-native-file checksums. All individual derived checksums remain in the manifests.

## Verify and provision

The following example uses operator-selected Linux paths. Run as the service account during maintenance/provisioning, with a private `umask 0077`. Set a durable absolute `SERRIAN_RASTER_ROOT` in the actual service configuration and preserve it across releases. Use local disk (for example ext4/XFS) with at most 4-KiB allocation units for the demonstrated C3 budget; unsupported links, permissions or inadequate capacity must block activation. Do not assume object stores, flattened ZIP extraction or network mounts preserve this contract.

```bash
umask 0077
export SERRIAN_RASTER_ROOT=/srv/serrian/private/world-raster
mkdir -p "$SERRIAN_RASTER_ROOT" /srv/serrian/private/staging
# Shorthand used below; invoke directly if your operator shell lacks functions.
raster() { node --conditions=react-server --import tsx scripts/raster-deployment.ts "$@"; }

# If the C2 transfer has only its asset files, reconstruct its exact manifest:
raster manifest-c2 --directory /srv/transfer/c2
raster verify --directory /srv/transfer/c2 --values true
raster verify --directory /srv/transfer/c3 --values true
raster provision --directory /srv/transfer/c2 --root "$SERRIAN_RASTER_ROOT"
raster provision --directory /srv/transfer/c3 --root "$SERRIAN_RASTER_ROOT"
```

`verify` and `provision` require canonical Earth bundle identities by default. `verify --canonical false` is available for other retained fictional bundles; backup/restore accepts validated non-Earth retained bundles automatically. Staging verifies the transfer before writing and verifies retained files afterward. C3 creates intra-bundle hardlinks for identical hashes in groups of at most 512; C2 and transfer files are never hardlinked together. No existing key is overwritten. A complete manifest is published last. A killed operation may leave `.partial` siblings or a prefix of verified assets; the exact same command safely resumes it. These unreferenced files do not create database metadata. Corrupted existing final files block retry: protect evidence, quarantine the damaged **whole bundle** under operator maintenance authority and provision into a clean destination. Never edit an immutable file in place, including a hardlinked alias.

The command checks symlinks/traversal, sizes and checksums. Use a single provisioning writer and a trusted read-only transfer snapshot. Stop or coordinate source writers for paired backup/restore; these tools do not stop any service automatically. Confirm all application/database writers are quiescent using the established controlled release procedure.

## Database installation and associations

Confirm target identity, migration ledger and verified paired backup before mutation. Fresh installation runs the entire committed sequence through 0131. Existing installations run only pending committed migrations in journal order, with 0130 before 0131:

```bash
npx drizzle-kit migrate
```

Do not rewrite/reapply applied migrations, run schema push, remove immutable sources, or alter ledger rows. This repair adds no migration. Restore an existing installation's **complete database backup** with `pg_restore --exit-on-error` into an explicitly verified empty recovery database, along with the matching private asset backup. Its World/map/surface/source/version IDs and revision heads must remain unchanged; do not run an import to reconstruct restored identities.

For a genuinely new installation, create the intended owner, World, timeline, Atlas map and supported geographic surface using existing application flows. Normal controlled imports allocate fresh application IDs. The following command attaches the canonical bundles using those normal services, checks a database backup digest and exact target database/server identity, and rejects owner/context conflicts. Existing exact imports are no-op retries; each domain commits atomically, so a failure between domains is recoverable with the same command. This is an operator metadata write and requires the deployment/content-transfer authorization for its target.

```bash
export SERRIAN_RASTER_CHECK_DATABASE_URL='postgresql://operator@127.0.0.1:5432/authorized_target'
raster associate --root "$SERRIAN_RASTER_ROOT" \
  --expected-database authorized_target --expected-host 127.0.0.1/32 --expected-port 5432 \
  --database-backup /srv/backups/before-association.dump --database-backup-sha256 BACKUP_SHA256 \
  --owner OWNER_ID --world WORLD_ID --timeline TIMELINE_ID --map MAP_ID
```

## Paired backup and exact recovery

Take a new database custom dump and protect its SHA-256. Use a **new** asset backup directory for each paired recovery point. The asset command retains all bundles, including historical/fictional sources, and reconstructs hardlinks even from a flattened verified input. Prefer a separate backup volume/failure domain. A hardlink-aware archive (`tar` without `--hard-dereference`) can transport the private backup directory; always verify/restage after extraction. A flattened transfer can still be verified and restaged, but needs additional transfer allocation.

```bash
pg_dump --format=custom --file /srv/backups/release.dump "$SERRIAN_RASTER_CHECK_DATABASE_URL"
sha256sum /srv/backups/release.dump
raster backup-assets --root "$SERRIAN_RASTER_ROOT" --destination /srv/backups/release-assets
# Restore into a new positively identified database, then restore all bundles:
pg_restore --exit-on-error --no-owner --no-privileges --dbname "$RECOVERY_DATABASE_URL" /srv/backups/release.dump
raster restore-assets --backup /srv/backups/release-assets --root /srv/serrian/recovered/world-raster
```

Before activation, rehearse recovery into isolated targets and record a recovery receipt containing `databaseBackupSha256`, `databaseAndAllRowsExact: true`, `allAssetsBitIdentical: true`, the complete sorted `bundles` array, and the restored `checkDatabase()` report under `metadata`. Its `metadataSha256` covers all six raster tables, including immutable versions, full asset registries, current heads and map preferences. Establish these assertions by comparing all original/restored rows and every restored asset; a receipt is operator evidence, not a substitute for that rehearsal. The committed `worlds-raster-repair-harness.ts` demonstrates the comparison with disposable targets. Keep dump, assets, checksums, release and receipt together. The readiness command hashes the dump, rechecks every backed-up retained bundle as well as the live target, and rejects metadata changed since that recovery point or during release validation.

## Release gate

```bash
raster readiness --root "$SERRIAN_RASTER_ROOT" --temporary /srv/serrian/private/staging \
  --reserve-mib 4096 --backup /srv/backups/release-assets \
  --database-backup /srv/backups/release.dump --database-backup-sha256 BACKUP_SHA256 \
  --recovery-receipt /srv/backups/recovery-results.json --report /srv/backups/readiness.json
```

Use a read-only PostgreSQL account for this command. It explicitly requires `SERRIAN_RASTER_CHECK_DATABASE_URL`, never loads a development URL or selects Production. It runs a repeatable-read read-only database transaction, validates the complete migration ledger, every version's bundle metadata and inventory, source/head/domain/map associations and both canonical Earth bundles. It checks directory access as its actual OS user, private Unix mode, file readability, hardlink and atomic-rename probes, filesystem block size/type, available storage and temporary reserve, source/derived checksums, full native value digests, C3 allocated-budget model and paired recovery evidence. All failures return a nonzero exit code; do not activate the geographic release without a passing report for the actual service account, database and volume. Database identity, source IDs and storage paths in reports are private operator data.

The default 4-GiB free reserve is spare capacity on both selected volumes, additional to current files, not an estimate of total hosting disk. If the two paths share a volume this is one reserve, not two independent allocations. Supply more space when preprocessing or retaining multiple recovery copies. Inspect ACLs/mount flags under the deployment account as part of the normal server setup; this command verifies effective access and Unix modes rather than claiming to audit every OS ACL or storage appliance policy. Linux allocation uses filesystem `stat.blocks` including each manifest. Windows rehearsal uses an explicit conservative 4-KiB physical-file model; Node's Windows block reporting is not an NTFS allocation audit, and the probe rejects larger Windows units. Both include inode/directory allowance and PostgreSQL raster tables. Readiness rejects unlisted files and incomplete staging debris inside retained bundles; successful provisioning removes only recognized abandoned temporary siblings of declared assets, under the documented single-writer maintenance rule. A passing result is specific to the measured volume.

Install/build and stage before controlled activation. Perform authenticated owner, both ordinary aliases and read-only Administrator smoke checks, including both layers, source samples, unavailable resources and retry. Restart/release-update proof uses the same external volume. If resources are absent or corrupt, the affected request fails privately, the layer offers retry, vectors and the other layer remain available, and drafts remain retained. Privacy still precedes filesystem access; failures cannot disclose protected imagery or source metadata.

Code rollback does not undo 0130/0131 or imported rows. Prefer a compatible forward fix. For exact recovery, reconcile stopped writers and post-backup changes, restore the matched database/private assets into verified targets and recheck release, ledger and identities. Never remove originals or ledger rows to accommodate old code. Push, Production operation and service restart remain separately authorized actions.

## Attribution

The [official ESA attribution instructions](https://esa-worldcover.org/en/data-access) and [2021 product manual, attribution section](https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/docs/WorldCover_PUM_V2.0.pdf) were verified on 2026-10-14. The visible legend/source reader adds the required copyright mark to the retained 2021 credit; its original frozen text, index, bundle and hashes are unchanged. The source-use link remains CC BY 4.0. Display aggregation is explicitly identified as a modification. Dataset citation: Zanaga et al. (2022), *ESA WorldCover 10 m 2021 v200*, [DOI 10.5281/zenodo.7254221](https://doi.org/10.5281/zenodo.7254221). The retained overview is approximately 594 m, not native 10 m.
