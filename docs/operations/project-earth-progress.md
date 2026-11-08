# Project Earth — Modern Day: progress and readiness

Status on **2026-11-07, America/Denver: blocked at milestone A, before Earth authoring**. Starting checkout `6f9e01d3d7b361a77a87f5ecba95ec79b14e57d3` was clean, on main, synchronized with GitHub, and had successful normal/recovery CI. All work remains in the normal main checkout.

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
| Local service evidence | No running processes named `cloudflared`, `ngrok`, `ssh`, `docker`, `com.docker.backend` or `wsl` were found. One other DEV connection advertises `pgAdmin 4 - DB:serrian_tide_dev`; its client/state/backend metadata is hidden from the application role. |

Historical Earth/geographic-source and recovery documentation was reviewed. Earlier imported Earth identities, old backups, and retained scientific bundles are historical material. They were not restored, reassociated, imported, or treated as a newly authored Earth. No prior fixture is being used as the permanent destination.

## Safety blockers

The brief requires stopping before persistent Earth writes when DEV has a genuine data-safety problem. These findings prevent accepting the readiness/recovery gate:

1. **Existing storage permissions fail the unified tool's privacy policy.** The selected default terrain and raster roots are real directories, but inherited ACLs allow `Authenticated Users` to modify them and `BUILTIN\Users` to read/execute. This was independently confirmed with read-only ACL inspection. The policy was not weakened and the existing ACLs were not altered.
2. **The artwork root is absent.** `.env.local` supplies no explicit root overrides. The current default `storage/atlas-assets` directory does not exist. There are zero database artwork versions, so this finding does not establish lost referenced images; an explicitly prepared private root is still required for a complete three-root baseline.
3. **DEV has another connected session.** The pgAdmin connection was left untouched. A frozen capture cannot be accepted while other possible writers remain connected.
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

Before any Earth content write, resolve the intended DEV/storage ownership and Production separation explicitly; prepare the missing empty private artwork root without removing retained files; disconnect pgAdmin DEV and fence all writers in an approved maintenance window; then capture, verify and independently restore the complete current database-plus-three-root baseline using the [unified workflow](environment-portability.md). Retain encrypted recovery material separately from its keys and arrange independent off-device retention.

Do not reset/replace/restore shared DEV or apply a migration to resolve these findings. No Production write, home-server/Render deployment, service restart, Canon activation, Studio or Tabletop work occurred. Continue actual visible editor authoring only after the mandatory gate genuinely passes.
