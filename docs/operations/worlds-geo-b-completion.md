# Geo B: worldwide modern Earth completion

Approved parent: `2d2226b742bf045232dd9dbefd0b2429dada4e8c`. Release: the local commit containing this report; its full SHA is supplied in the completion handoff. Initial checkout was clean and synchronized. This pass is ready for Ember's independent technical review and the owner's visual acceptance. It has not been pushed or deployed. Production and shared services were untouched; Geo C has not begun.

## Delivered behavior

The existing DEV Earth now contains worldwide physical land/coastlines, country and territory representations, land-boundary classifications and separate disputed interpretations from Natural Earth. Opening Earth shows its read-only geographic preview. The workshop supports automatic detail, automatic bounded paging, pan/zoom, projection selection, source search, retained-source readers and independent physical/administrative/authored visibility. Existing Atlas artwork, source editing, historical maps, linked places and Realm contexts remain separate and functional.

Spherical validation supports source-faithful polar caps, multipart islands, holes, non-crossing contacts and floating-point seam noise. Original coordinates remain unchanged. Derived administrative linework removes paired antimeridian cuts and projection-closing borders; Antarctica remains visible in equirectangular projection. Complete source components are partitioned when necessary, without cutting rings or inventing island geometry. Bounds, coordinate count, JSONB source size and atomic batch size remain enforced.

Exact original-file/content comparison permits differently batched imports to reuse existing source identities without replacing their manifests or authored heads. Higher-resolution country sources deliberately share the same World place. Filtering chooses readable representations for each detail band, while immutable original readers retain every source. Large original geometries use compact JSON when formatting would exceed the existing editor limit; Canada’s detailed source remains editable without losing coordinates.

Ordinary requests use server-side filtering for geography and complete Atlas map contexts, including private generic maps without a place association. Both ordinary URL conventions and explicit review reject geographic mutations. Map and source-reader results are associated with their request contexts; delayed requests, failures and recovery do not reveal previous protected information. Administrator review remains read-only.

## Sources and verified coverage

Provider: [Natural Earth](https://www.naturalearthdata.com/downloads/), [public domain](https://www.naturalearthdata.com/about/terms-of-use/), WGS 84 / EPSG:4326. [The committed manifest](../../data/geography/natural-earth-world-sources.json) records the exact eight URLs, downloaded VERSION editions, ZIP byte counts and full SHA-256 values. Original-file checksums are also retained in every immutable import manifest. No paid API, runtime map subscription or new dependency was added.

| Layer | Edition | Original rows | Saved records | Components | Coordinates |
| --- | --- | ---: | ---: | ---: | ---: |
| Physical land 110m | 4.1.0 | 127 | 127 | 127 | 5,143 |
| Physical land 50m | 4.1.0 | 1,420 | 1,420 | 1,421 | 60,669 |
| Physical land 10m | 5.1.1 | 11 | 25 | 6,837 | 446,175 |
| Admin-0 countries 110m | 5.1.1 | 177 | 177 | 288 | 10,654 |
| Admin-0 countries 50m | 5.1.1 | 242 | 242 | 1,620 | 99,613 |
| Admin-0 countries 10m | 5.1.1 | 258 | 258 | 4,274 | 548,471 |
| Admin-0 land boundary lines 10m | 5.1.0 | 515 | 515 | 7,980 | 77,295 |
| Admin-0 disputed areas 10m | 5.1.1 | 99 | 99 | 295 | 14,795 |
| Total | | 2,849 | 2,863 | 22,842 | 1,262,815 |

The [committed coverage receipt](../reports/worlds-geo-b-coverage.json) compares expected and imported identities, sorted identity hashes, source rows, complete components and coordinate totals for every layer. Missing and duplicate identities are empty; no selected source row was omitted. The three original samples were reused, so DEV gained **2,860** source records. The 677 country representations share **258** country/territory place identities; the ordinary global projection includes all 258. The physical 10m partition inventory reconstructs all 11 original rows from complete component ranges. Original geometry and decoded properties were checked during every batch.

Physical layers cover all continents, Antarctica, Greenland/Arctic islands, Australia/Oceania and the source's Caribbean, Mediterranean, Indian Ocean, Southeast Asian and Pacific islands. Countries absent at 110m use 50m or 10m polygons at overview scale. No fabricated coastline or substitute point approximation was introduced. Duplicate provider identifiers in boundary/disputed records retain distinct source-row identities.

Physical land and administrative interpretations use separate namespaces, saved sources and controls. These imports create no polities, historical events, dated control records or alternate-history accounts. Modern source reference geometry does not establish coverage for a historical World year.

## Preservation, import and recovery

Verified target: loopback `serrian_tide_dev`, PostgreSQL port 5432. All 130 migration ledger entries match committed migrations through 0129. No migration or schema change was needed. All 132 migration/snapshot/original-sample file hashes from the approved checkpoint remain unchanged. The 114 User foreign keys still have the existing exact account-deletion classifications: 107 blocking and seven cleanup relationships; no new User FK was introduced.

Earth remains World `981b883d-17a1-4603-b003-1053968e4f6c`, map `dd7cdb89-e5c1-4553-a8d1-0934f36f6c8c`, surface `964f24cd-7a7b-45dd-9d0e-c37fce26149a`, Primary `f364f134-8f75-423b-be5c-bdd9a5da3a41`. Original names/descriptions, map revision and artwork remain unchanged.

| Original sample | Feature | Shared place | Original retained version |
| --- | --- | --- | --- |
| Fiji | `49a01905-096a-4fd5-a8b1-f7fd69b5db5a` | `173c1b24-e2db-4492-9f7e-fc0bd3bc71c9` | `e5d64717-3dac-4822-b3f7-904102fc4771` |
| New Zealand | `35b88f10-f172-4a12-82e5-af182dc61ea3` | `8ce658ac-8285-4b4b-8768-40bab8e5db96` | `cabd0b74-bd17-4ddd-9651-7d330f48fd6f` |
| South Africa | `a179e33e-dd53-4354-9659-2fef1386a0fd` | `1f8bdf9d-f456-488c-8ea5-5b991c78b402` | `b48ae498-448f-4ff9-b060-431ea74584ef` |

Their original dataset remains `7eed9c24-4623-4a43-8eea-57611bce88fa`. Glass Sea World `df7be692-6307-4921-a6eb-dfe6ef79290e`, map `8c775bc6-da4a-4761-9649-452d3f4834bc` and all other pre-existing rows remain intact.

The full pre-import DEV backup is 2,672,666 bytes, SHA-256 `2a51e5103478ea232a1e4de3b33a7766d6515d4b5f2386f3411d4add0fb35d84`. It restored exactly across all 316 public tables and the migration ledger in an owned disposable PostgreSQL cluster before DEV writes. After the full import rehearsal, a second full backup/restore of the populated disposable database also matched every row and ledger entry; that backup is 84,676,788 bytes, SHA-256 `466b5f0f60f7150e88a4280f8721be8e270f9864aca6a102dbe6e689e23caa38`.

Frozen plan SHA-256: `796e3978f45afe8e137dbf6b26219bc975fd5b9a9ef72a94bfc96ab907757f5e`. All 97 batches enforce at most 32 records and less than 7.5 MB. The rehearsal interrupted after five batches, restarted successfully and completed an exact no-op full retry. Changed-content and invalid-parent tests prove transaction rollback without partial records. Before persistent application, DEV again matched the restored baseline and the tested candidate fingerprint matched its production build. DEV then completed all 97 batches in about 122 seconds, followed by a complete 104-second retry that created zero records and changed no rows.

Final preservation compares every pre-existing row hash in all 316 public tables. Only six tables gained rows: 97 datasets, 2,860 features, 2,860 immutable versions, 2,860 heads, 22,836 spatial-part rows and 2,441 places. No existing World, map, surface, view, timeline, source/head, history record, user or unrelated record changed. DEV received no browser or privacy fixtures. Original Geo A evidence was cloned for regressions and its database and receipts remain unchanged. Backups and private receipts remain locally under ignored `artifacts/guidance/geo-b/`.

## Newly executed validation and measurements

| Check | Result |
| --- | --- |
| Node 22.23.3 / npm 10.9.9 locked isolated dependency install | Passed |
| TypeScript | Passed |
| Full ESLint | Zero errors; one existing unrelated unused `LoreFamily` warning in `scripts/worlds-stories-checks.ts` |
| Complete CI unit validation | 2,124 passed, zero failed; 250 feature test files |
| New global/polar/boundary geometry cases | Included in the passing unit run |
| Geographic/Atlas/history/account focused checks | Passed; exact 114-FK parity remains covered |
| Geo B disposable services | Six groups passed |
| Geo A / historical service regressions | 12 groups passed, including four-period historical sources and privacy |
| Geo B authenticated production browser | Ten groups passed, including actual editing of the 2.68-million-character detailed Canada source |
| Legacy Geo A / Atlas production browser | 15 groups passed |
| Native-touch phone fixture | 390 × 844, 6× CPU throttling, pan/zoom and no horizontal overflow |
| Ordinary aliases, delayed/failure/retry, owner return and Administrator review | Passed; no stale protected source metadata or author controls |
| Original-source editing, stale-save/acknowledged-save recovery, archive, unsaved drafts and Atlas editing | Passed in focused regressions |
| Drizzle migration consistency | Passed; no changes or pending DEV migrations |
| Optimized isolated production build | Passed with the normal Turbopack compiler |
| Full pre-import and populated-import restore | Exact table and ledger matches |
| DEV preservation and full retry | Passed |

The comprehensive Phase 9 assessment was not run. Application exceptions/hydration/Fragment errors were absent from the completed browser checks. Harness issues were corrected rather than counted as application failures: an early preparation scale-name match, stale disposable fixture identity, a fixture-only World timestamp, repeated no-op Atlas save expectation, and shell/log encoding. The unrelated baseline `node:crypto` webpack compilation failure was avoided by using the project's normal Turbopack build in a privately installed checkout; unrelated chat code was unchanged. The preparation namespace error was caught and rehearsed again before any DEV import.

Final DEV measurements use read-only service queries: overview **15 pages / 910 components / 484 source identities / 879,220 JSON bytes / 626 ms**; the ordinary view contains all 258 country identities. Detailed Fiji at the committed screenshot extent uses **one page / 50 components / 10 source identities / 55,180 JSON bytes / 267 ms**. Every page stays within 64 components and 500,000 path characters. Regional spatial queries retain the existing GiST index; full-domain queries avoid the previously unselective bitmap scan. No new index or migration was required.

Browser measurements on the disposable production application: desktop full progressive load **1,155 ms**, approximately **30.6 MiB** JavaScript heap and **884,575 transfer bytes**; touch phone at 6× CPU throttling **3,365 ms**, approximately **15.8 MiB** heap and **942,257 transfer bytes**. Each recorded 17 geographic requests, including catalog/context work; the largest encoded response was **93,242 bytes**. These are local CPU/device-emulation measurements, not an Internet hosting benchmark or a physical-phone acceptance claim.

The seven geographic tables plus shared geography occupy **128,933,888 bytes (about 123 MiB)** including indexes and toast. The spatial-part table accounts for 94,445,568 bytes and source versions for 29,556,736 bytes. Stored source geometry accounts for 22,531,593 compressed bytes. Original files and raw preparation artifacts are local tooling inputs; the runtime serves bounded saved projections and needs no external geographic API.

## Visual evidence and limitations

Committed actual application screenshots: [global modern Earth](../screenshots/worlds-geo-b/global-modern-earth.png) and [Pacific/Fiji](../screenshots/worlds-geo-b/pacific-fiji.png). [Capture metadata](../screenshots/worlds-geo-b/README.md) records viewport, projection, extent, editions and the rehearsal origin. The exact plan, original geometries and properties match the final DEV import. Independent direct-coordinate source renderings at the same extents support shape/orientation comparison; global/polar and detailed Fiji captures were inspected visually.

Natural Earth is generalized geography. It does not include every islet, survey-grade coastline or live political changes. Its default administrative data follow a [de facto interpretation](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/); 258 rows represent countries and territories rather than universally agreed sovereign states. Disputed classifications remain independent dashed overlays and retained provider accounts. The provider flags coastline uncertainty in northern Russia and southern Chile. Physical/admin editions and scales can have different coastlines. Tiny unequal antimeridian source tails remain (Taveuni endpoints differ by about 0.0014 degrees); sources were not silently repaired. Global label clutter is avoided through source search rather than automatic labels. Mercator retains its approximately 85-degree polar limit; oversized full-detail global views require a smaller extent or automatic overview. Unsupported flat/hollow/cylindrical/ring/custom adapters are not claimed as finished beyond existing planar/spherical support.

Deferred: Geo C rivers/lakes/mountains/elevation/land cover/cities; Geo D subdivisions and connected country/region/city navigation; Geo E integrated modern Earth acceptance and optimization; Advanced Map Studio artwork/procedural/advanced 3D tools; Comprehensive Historical Earth source-backed changes through time. Ember review and human visual acceptance remain outstanding.

## Controlled release and recovery

No new runtime configuration or migration is required. The target must already have the approved schema through 0129; if earlier geographic migrations are pending in another environment, apply unchanged 0128 then 0129 in journal order only after separate target/backup/rehearsal authorization. Geo B does not automatically populate other environments.

After separate owner approval, verify the exact local release and target ledger, protect a target backup, install locked dependencies, stage the optimized build and follow the existing operator-managed release process. Repeat authenticated owner/ordinary/Administrator and geographic/Atlas smoke checks. Any import outside this explicitly authorized DEV Earth needs its own authorization and verified identity/backup gate.

Reverting code does not remove imported data. Older geographic code cannot display algorithm-3-only cache rows and rejects newer display metadata or larger/polar sources; retain compatible readers/writers during recovery and prefer a reviewed forward fix. A full pre-import backup was proven restorable, but restoring a shared database requires separately authorized writer coordination and reconciliation of later changes. Never rewrite migrations, delete original source history or blindly restore over unrelated work. Task-owned servers/clusters were stopped; shared services were not restarted.

## Changed files

Runtime: `src/features/worlds/geographic.ts`, `geographic-geometry.ts`, `geographic-projection.ts`, `geographic-boundaries.ts`, `geographic-service.ts`, `geographic-workspace.tsx`, `geographic.module.css`, `world-geographic-preview.tsx`, `world-workspace.tsx`, `atlas-service.ts`; `src/app/api/worlds/[worldId]/geography/route.ts`.

Validation/tooling: `src/features/worlds/geographic.test.ts`, `geographic-global.test.ts`, `geographic-boundaries.test.ts`; `scripts/prepare-natural-earth-world.mjs`, `worlds-geo-b-import.ts`, `worlds-geo-b.test.ts`, `worlds-geo-b-checks.ts`, `worlds-geo-b-regressions.ts`, and the automatic-credit paging assertion in `worlds-geo-a-checks.ts`.

Sources/evidence/handoff: `data/geography/natural-earth-world-sources.json`, `docs/architecture/worlds-modern-earth.md`, `docs/reports/worlds-geo-b-coverage.json`, this report, the two PNGs and README under `docs/screenshots/worlds-geo-b/`, and the Geo B authorization note in `AGENTS.md`.
