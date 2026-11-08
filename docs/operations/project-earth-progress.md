# Project Earth — Modern Day: progress and readiness

Status on **2026-11-07, America/Denver: blocked at milestone A, before Earth authoring**. Starting checkout `6f9e01d3d7b361a77a87f5ecba95ec79b14e57d3` was clean, on main, synchronized with GitHub, and had successful normal/recovery CI. All work remains in the normal main checkout.

**Overnight Pass 1 update:** the owner explicitly selected the existing DEV database; a Production clone is not required. Protected storage copies are now prepared and checksum-verified, but remain inactive because the owner's DEV website is still running. No complete current-DEV recovery snapshot or real-DEV Atlas readiness result is claimed. The Overnight Pass 1 receipt below supersedes the earlier correction-planning status.

No Earth World, map, timeline, settlement, image, terrain object or Canon designation has been created. No existing application record or private storage permission was changed. This report is a readiness finding, not a completed Earth or Atlas acceptance result.

## Verified DEV facts

Configuration was read from `.env.local` without printing or persisting its credentials. Connections were permitted only after checking the exact intended loopback DEV name and connection options. Database work used read-only startup settings and explicit read-only transactions, rolled back before closing the connections.

| Check | Observed result |
| --- | --- |
| Configured destination | `localhost:5432/serrian_tide_dev`, SQL role `serrian_tide_app`. |
| Independent actual connection | Client socket `::1:5432`; server address `::1/128`, database `serrian_tide_dev`, role `serrian_tide_app`, PostgreSQL 18.0, UTF8. `transaction_read_only=on`. |
| Schema | 400 public tables. All 161 migration hashes/timestamps match the known release prefix through `0160_world_canon_geography_copy`; no migration is needed or authorized by this finding. |
| Authentic creator | Exactly one existing `revty79` username; current roles include `admin`, `god`, `player`. The existing immutable account identity is retained in the protected local receipt. No replacement account, password/session change or impersonation was used. |
| Existing Worlds/Earth | Zero Worlds, zero Earth matches, zero Atlas/native-map/geographic/raster-version/artwork-version/Canon-copy records. Other existing application data remains present and protected. |
| Production-clone provenance | No unified-restore database binding was found. Historical reset/selective-copy records exist, but no complete current Production-to-DEV paired-restoration receipt was established. Treat this as existing DEV, not a verified complete Production clone. |
| Local service evidence | Initial preflight saw another pgAdmin DEV session with hidden metadata. After the owner closed pgAdmin, repeated read-only checks found zero other DEV sessions and the corrected guard returned `NO_OTHER_CLIENTS`. This supersedes the initial connection blocker; it does not certify a continuous writer freeze or deployed service separation. |

Historical Earth/geographic-source and recovery documentation was reviewed. Earlier imported Earth identities, old backups, and retained scientific bundles are historical material. They were not restored, reassociated, imported, or treated as a newly authored Earth. No prior fixture is being used as the permanent destination.

## Safety blockers

The brief requires stopping before persistent Earth writes when DEV has a genuine data-safety problem. These findings prevent accepting the readiness/recovery gate:

1. **Existing storage permissions fail the unified tool's privacy policy.** The selected default terrain and raster roots are real directories, but inherited ACLs allow `Authenticated Users` to modify them and `BUILTIN\Users` to read/execute. This was independently confirmed with read-only ACL inspection. The policy was not weakened and the existing ACLs were not altered.
2. **The artwork root is absent.** `.env.local` supplies no explicit root overrides. The current default `storage/atlas-assets` directory does not exist. There are zero database artwork versions, so this finding does not establish lost referenced images; an explicitly prepared private root is still required for a complete three-root baseline.
3. **A continuous writer freeze is not yet established.** The owner has disconnected pgAdmin and repeated checks now find zero other DEV sessions. That clears the observed connection blocker. A later paired capture must still fence all database/file writers and pass fresh before/after checks throughout its capture window.
4. **Production separation remains unverified.** Local process checks and the actual DEV identity do not prove which database an existing home-server or Render service is configured to use. Those deployed configurations were not inspected or changed. No Production database was contacted.
5. **There is no accepted baseline of this current DEV.** No database dump, paired file capture or isolated restore of actual current DEV was attempted after the storage/session blockers were identified. Earlier synthetic infrastructure rehearsals and historical archives do not satisfy this gate.

Selected filesystem defaults:

| Root | Path | State |
| --- | --- | --- |
| Terrain | `D:\serrian-tide-website\storage\world-terrain` | Exists, no root symlink, retained entries present, privacy check fails. |
| Artwork | `D:\serrian-tide-website\storage\atlas-assets` | Absent; zero associated database versions. |
| Raster | `D:\serrian-tide-website\storage\world-raster` | Exists, no root symlink, retained entries present, privacy check fails. |

The terrain/raster files have no corresponding current World/raster database associations. They remain untouched and must be included in any approved full-root baseline; no ownership or geographic associations were invented. Runtime overrides outside `.env.local` have not been certified by inspecting deployed services.

## Focused recovery-guard correction

Preflight exposed a genuine least-privilege visibility defect in `scripts/environment/database.ts`. The old writer check counted only `pg_stat_activity.backend_type='client backend'`. PostgreSQL hides another role's backend type from the current application role. In the actual read-only DEV check, an other-role pgAdmin session existed but that old filter returned zero.

The guard now refreshes transaction-local activity statistics before every check and also rejects sessions whose backend type is null. It conservatively refuses unclassified sessions without granting additional statistics privileges or changing any real SQL role. In the repeated actual DEV read-only probe, the old filter still returned zero while the corrected guard returned `WRITERS_ACTIVE`. No full backup was attempted and no connection was terminated.

The disposable regression creates a fresh empty database and low-privilege SQL login only inside a task-owned cluster, verifies it lacks `pg_read_all_stats`, establishes an empty activity snapshot, then connects another role during the same read-only transaction. It proves the late session is detected despite cached/restricted metadata and freeze is refused. This is synthetic regression data, separate from permanent DEV and Earth. Existing full recovery checks remain in the same suite. PostgreSQL documents both transaction-cached activity and null fields for other roles; the correction uses its supported cache-refresh function. [PostgreSQL 18 monitoring documentation](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-STATS-VIEWS).

## Evidence and validation

Protected local evidence is ignored under `artifacts/project-earth-*`. The initial read-only receipt and final `readiness-decision.json` live in `artifacts/project-earth-preflight-1/`. No raw connection URL, password, authentication secret, user-content dump or backup is committed. Existing-account identifiers and detailed local inventories remain in protected evidence rather than this public report.

Validation for the guard correction:

- Actual DEV: two independently opened read-only checks verified destination identity; the focused probe reproduced the hidden session and corrected refusal. No DEV mutation.
- `project-earth-guard-integrity-1.log`: all 14 integrity/security tests passed.
- `project-earth-guard-lint-2.log`: focused lint passed.
- `project-earth-types-2.log`: TypeScript passed.
- `project-earth-guard-disposable-2.log`: all 14 Windows rich-fixture groups passed, including the new other-role visibility case, genuine backup/restore, exact records/files, interruption/resume, DEV isolation, old-ledger upgrade and authenticated retained-content reads. Owned services are stopped; this fixture is not a baseline of real DEV.
- Exact published-main normal and Ubuntu Docker recovery gates are verified before handoff; the delivery message supplies their final commit/run links. No Atlas/renderer/source migration changes were made; existing numerical/geometry/performance thresholds remain unchanged.

## Milestone inventory

| Milestone | Status |
| --- | --- |
| A. Environment readiness | DEV identity/schema/creator verified. Storage privacy, complete roots, writer freeze, Production separation and paired baseline are not accepted. |
| B. World foundation | Not started. No Earth World or timeline ID exists. Browser authentication and `Built by Revty79` attribution remain untested. |
| C. Physical planet | Not started; no authored geography, generation, imports or external-map substitute. |
| D. Regional structure | Not started. Worldwide country/territory/subdivision coverage is zero. |
| E. Settlements | Not started; no permanent records or placements. |
| F. Connected map families | Not started in Earth; disposable regression content is not counted. |
| G. Artistic refinement / output | Not started; no accepted styles, map exports or printed outputs. |
| H. End-to-end acceptance | Not started in the real creator World. No UI or artistic acceptance is claimed from technical preflight. |
| I. Owner/Ember review | Readiness blocker review required. Earth completion and Official Canon activation remain pending owner acceptance. |

## Required next gate

Before any Earth content write, resolve the intended DEV/storage ownership and Production separation explicitly; prepare the missing empty private artwork root without removing retained files; keep pgAdmin closed and fence all writers in an approved maintenance window; then capture, verify and independently restore the complete current database-plus-three-root baseline using the [unified workflow](environment-portability.md). Retain encrypted recovery material separately from its keys and arrange independent off-device retention.

Do not reset/replace/restore shared DEV or apply a migration to resolve these findings. No Production write, home-server/Render deployment, service restart, Canon activation, Studio or Tabletop work occurred. Continue actual visible editor authoring only after the mandatory gate genuinely passes.

## Read-only follow-up and proposed corrections: 2026-11-07

The owner closed pgAdmin, authorized another read-only DEV connection check, and requested the safest remaining corrections with a report before any existing storage-permission or live-service change. The owner subsequently became unavailable for questions and asked for best judgment. That does not remove the report-first boundary or authorize replacing existing data. This follow-up makes no ACL, configuration, service, credential, database or persistent Earth-content changes.

Repeated probes connected only to the checked `localhost:5432/serrian_tide_dev` as `serrian_tide_app`, with read-only startup options and explicit read-only transactions. Both returned zero other sessions and `NO_OTHER_CLIENTS`. Existing catalog counts remained 8 users, 8 accounts, 16 role assignments, 1,421 Skills, 1,302 Skill relationships and 5 Campaigns. The connections were rolled back and closed; no session was terminated. The observed database physical size was 47,314,623 bytes, not the size of an accepted dump.

Read-only filesystem metadata inventory:

| Root | Regular files | Logical bytes | Unique-inode bytes | Other findings |
| --- | ---: | ---: | ---: | --- |
| Terrain | 6,798 | 14,309,561 | 14,309,561 | 565 directories including root; no symbolic links found. |
| Artwork | 0 observed | N/A | N/A | Directory absent; not created by this review. |
| Raster | 60,308 | 1,215,585,589 | 1,204,496,762 | 37 directories including root; 30,913 internal hardlink aliases; no symbolic links found. |

These are metadata observations, not a checksum-verified backup. Unique-inode bytes are a size estimate, not allocated disk blocks. Internal hardlink aliases are retained files, not permission to remove duplicates. The volume reported 1,418,510,221,312 available bytes at inventory time; a future capture/restore must recalculate its own capacity and reserve. No retained file was removed, relinked, copied, replaced or reassociated.

Both existing roots and sampled descendant files are owned by the local Windows owner account, `MaxTech2\birev`, and inherit the broad access described above. The ordinary Codex tool context is a different Windows account. The unified Windows privacy check accepts only the account executing the tool, SYSTEM and local administrators; a SQL role is not a Windows storage principal. Therefore granting the sandbox access or recursively resetting ownership is not a suitable correction. This review did not establish the actual DEV website process's storage identity. The PostgreSQL Windows service uses NetworkService; that is not evidence that the website uses that account or needs it on its private file roots.

DEV's own read-only settings report `listen_addresses=*` and `ssl=off`. The configured website origin is `http://localhost:3000`, with no root overrides in `.env.local` or this inspection process. Scoped OS listener reads did not expose a matching listening 5432/3000/3100 endpoint despite successful loopback SQL connections, and therefore do not certify network containment. No named local tunnel/container process was found. Neither a loopback connection nor these observations prove which database remote services use. No Production account, configuration, database or resource was accessed.

Recommended sequence, still proposed rather than applied:

1. **Confirm the DEV file operator, then narrow only the selected DEV storage.** Use the real owner account for the backup tool and confirm the website's Windows account before choosing its grants. Record complete current ACL/ownership metadata in a new protected rollback receipt first. Propose owner/operator, SYSTEM and Administrators access with the required directory/file inheritance, verify all descendants, and retain original ownership and every byte. Apply no ACL change above the selected roots, no recursive ownership reset, and no weakening of the tool's privacy guard. If the website needs a separate account that the current guard cannot safely represent, report that mismatch before changing policy or permissions.
2. **Prepare the absent artwork root deliberately.** After resolving the operator and confirming the path is still absent with no referenced artwork, create only the new empty private `storage/atlas-assets` directory with the reviewed grants. Existing terrain/raster directories remain in place. Do not create placeholder images, move old data, invent database associations or silently switch the application's roots.
3. **Establish Production separation without touching Production.** A DEV-only check can establish the intended target and inspect local containment, but cannot certify an uninspected deployed service's configuration. Keep this gate open until sanitized deployment-target evidence establishes distinct database/storage authorities, authentication secrets and credentials. Investigate DEV-side access rules and any shared-cluster/role implications before proposing a network or credential change. Do not change cluster-wide listeners, authentication rules, firewall policy, shared SQL roles or live app settings on the assumption that they affect DEV alone. Do not run `isolate-dev` on this existing database: it deliberately removes cloned authentication material and conflicts with this request to preserve existing data.
4. **Capture and prove this exact DEV baseline after those gates.** Keep all writers fenced, take a signed paired PostgreSQL dump plus all three complete roots, and verify the archive, all file hashes, historical references and hardlink relationships. Include all retained unassociated originals, even though current World counts are zero. Restore only into newly owned disposable PostgreSQL 18/database/storage locations, never over DEV or Production; compare records, schema, ledger, sequences, large objects and files and perform restored application read checks. Recheck the source for change and retain encrypted recovery material off-device with its keys separately protected. A new disposable restore test is recovery evidence, not another working DEV or another repository. Earlier synthetic test passes and a successful dump alone are insufficient.

The current request completes the read-only connection check and correction planning. Actual permission changes, new artwork storage preparation, service configuration and the real baseline remain pending the reviewed safety sequence. Earth milestones B-I remain unstarted, and no Production promotion or Canon action is authorized. Local ignored follow-up evidence is `artifacts/project-earth-readiness-followup-2026-11-07.json`; it supersedes the initial pgAdmin finding without overwriting that earlier receipt.

## Overnight Pass 1: protected DEV preparation and remaining writer gate

Owner brief `fdf4a92e-0a3d-4e64-8bc9-29cb4a120b84` authorizes this readiness pass only. Work continues in normal main from `6f35da5bfdc95e812d78c245939186a354ee3269`, the documentation-only descendant of the brief's specified `2cdfbd43016aa05826ad3533f200edfd05b1b64d`. No source checkout, branch or worktree was created. Tiny disposable Git fixtures used by security regressions are not alternate project checkouts. Existing DEV is intentionally retained, with no assertion that it is a Production clone.

Fresh read-only connections again positively verified `localhost:5432/serrian_tide_dev`, SQL role `serrian_tide_app`, PostgreSQL 18.0, all 161 immutable migration hashes/timestamps through0160, the authentic existing Revty79 with admin/god/player roles, and zero Worlds. The complete read-only infrastructure state check covers 401 non-system tables, including the migration ledger. The role is not a superuser and has no CREATEDB, CREATEROLE or BYPASSRLS privilege; no privilege was granted. Repeated corrected checks found zero other DEV sessions and `NO_OTHER_CLIENTS`. PgAdmin remains disconnected. No DEV session was terminated, and no existing record, migration, credential or account was changed.

### Local containment and the real freeze blocker

The local PostgreSQL service's on-disk `pg_hba.conf` contains only loopback IPv4/IPv6 TCP entries with SCRAM-SHA-256, plus local entries; no active include directive was found in its main configuration. The postmaster PID file's port/start time matches the independently observed DEV server. The HBA file predates the running server's start. The application role cannot query `pg_hba_file_rules` (`42501`); this is recorded as a visibility limit, not bypassed. `listen_addresses=*` is unchanged. These are local configuration observations, not a connection test from a separate machine or an inspection of deployed Production.

The owner's existing Next.js DEV process tree remains running under the local owner account. TCP checks accept connections to port3000 via loopback IPv4, loopback IPv6 and this PC's own private-interface address. The last observation is not an external-host/firewall test, but prevents claiming loopback-only website containment. No Production session was observed at the DEV database; no named local tunnel process was found. Production credentials, databases, home-server services and Render resources were not accessed. Effective remote service separation remains uncertified from the permitted local evidence.

**The live owner website is a genuine writer-freeze blocker.** A moment with zero database sessions does not fence a running application or its future database/file writes. The brief prohibits terminating owner processes. No service was stopped, restarted, reconfigured or placed into maintenance, and no freeze statement was falsely supplied to the backup CLI. Existing `.env.local` was not changed: switching roots beneath this live development service could make the active database/files pairing uncertain.

### New private storage, preserved originals and inactive configuration

The preferred copy approach was used. All original terrain/raster files and ACLs remain in place. Only NEW DEV-only directories received restrictive owner access. The Windows account executing the preparation is the same owner account used by the existing Next.js processes; the SQL role is not treated as a Windows principal. The unified permission checks accept the new roots. A read-only descendant ACL audit checked 67,722 new storage/operator entries and found zero violations of the operator/SYSTEM/Administrators allowlist.

| Kind | Still-active configured default | Prepared, NOT ACTIVE root | Verified files / logical bytes |
| --- | --- | --- | ---: |
| Terrain | `storage/world-terrain` | `storage/project-earth-dev-overnight-1/terrain` | 6,798 / 14,309,561 |
| Artwork | `storage/atlas-assets` remains absent | `storage/project-earth-dev-overnight-1/artwork` | 0 / 0 |
| Raster | `storage/world-raster` | `storage/project-earth-dev-overnight-1/raster` | 60,308 / 1,215,585,589 |

All paths above are relative to `D:\serrian-tide-website`. The new empty artwork root contains no placeholders or invented associations. All 67,106 copied files match the originals by relative path, byte size and SHA256; the 30,913 internal raster hardlink aliases match too. Source inventories before and after copying are identical. Directory structure, including empty directories, was preserved. The copies do not replace or remove any original file, and no cleanup/GC occurred.

A protected byte-exact backup of the existing configuration, separately protected signing/encryption keys, a prepared source profile and an inactive candidate configuration are retained under ignored, owner-only operator storage. Only the three storage variables differ in the candidate; all other parsed values match the original. The original active configuration remains byte-exact. No secret or per-file inventory is published. The prepared copies are explicitly ignored by Git. A full read-only database/reference check confirms zero current terrain/artwork/raster references, with all accepted references resolving against the prepared roots; it invents no association for retained unreferenced files.

### Narrow infrastructure correction found during preparation

An actual Git exclusion defect was reproduced in a disposable fixture before correction: a successful `git check-ignore` trailing-slash directory probe could identify an empty CRLF pattern while files underneath remained untracked. The old guard treated command success alone as proof of privacy. The prepared storage was never staged or committed; an explicit `.gitignore` rule now covers its exact root.

`scripts/environment/private-files.ts` now requires a nonempty positive ignore rule using NUL-delimited verbose output, rejects negated matches, and independently checks a child pathname without a trailing slash. No probe file is written. The focused regression covers absent/existing unignored directories, CRLF blank lines, re-included paths and genuinely ignored directories/files. It fails against the original implementation and passes after correction. No validator, authentication rule or performance threshold was weakened. Application sources, numerical engines, private-data formats and migration history are unchanged.

### Recovery, Atlas readiness and validation

**Actual current-DEV snapshot ID: none. Actual independent restore of current DEV: not performed.** No dump or misleading completion manifest was created while the owner website remained live. Storage preparation, protected keys and successful synthetic recovery tests do not constitute a coordinated recoverable database-plus-files baseline. Real-DEV authentication and Worlds/Atlas creation controls remain untested after the gate; no password guessing, replacement account, session injection or real-DEV test World was used.

Local evidence is protected or ignored under `artifacts/project-earth-overnight-*`. Key receipts are `storage-preparation-verified.json`, `new-storage-acl-audit.json`, `local-service-findings.json`, `read-only-database-reference-check.json` and `git-exclusion-final.json` inside the protected pass directory. Detailed record/file inventories and account identifiers remain local.

- Full TypeScript and full lint passed again on the final Git-guard sources. Lint retains the existing unused `LoreFamily` warning.
- The initial unit run passed 2,860/2,862; two authentication child processes exceeded their unchanged 30-second limits while copy/type/lint work competed. The failed log is retained. The unchanged focused authentication recheck passed11/11; the second complete default-concurrency run passed all2,862 in364 files.
- Initial Windows infrastructure integrity passed14/14; the expanded final guard suite passed15/15, including the new Git regression. The original-code failure and the final passing logs remain retained.
- Windows portable raster validation passed2, with1 expected POSIX-only skip and zero failures.
- [Ubuntu/Docker recovery rerun42440242973, attempt2](https://github.com/Revty79/serrian-tide-website/actions/runs/42440242973/attempts/2) passed all15 recovery groups and14 integrity tests at unchanged pre-correction implementation `2cdfbd43016aa05826ad3533f200edfd05b1b64d`. This is inherited machinery evidence, not final-source validation of the new Git guard or an actual DEV baseline. Final-source normal and Docker CI must pass before handoff; exact publication receipts follow.

**Stop result: Project Earth authoring is not yet ready.** Safe next work requires the owner to stop the existing DEV website through its normal controls, establish the full database/file writer freeze and review effective DEV website containment. Then reverify the original configuration and prepared copies, activate only the reviewed DEV storage variables, capture/verify/encrypt the complete actual DEV snapshot, independently restore it only into new disposable database/storage, compare all records/constraints/sequences/files and verify legitimate application access. Preserve current DEV and all original roots throughout. Do not reset/restore over DEV, clear authentication data, create Earth, activate Canon, access Production or deploy anything to bypass this gate.
