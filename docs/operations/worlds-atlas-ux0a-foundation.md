# UX-0A versioned-source foundation checkpoint

Status: **implementation in progress; not initial owner-testing or deployment readiness**. This checkpoint follows the revised early-art candidate `e7c68f8` on `codex/atlas-ux0a` / [draft implementation PR #5](https://github.com/Revty79/serrian-tide-website/pull/5). Artwork expansion still requires Ember's explicit decision on the revised sample. The [coordination record](worlds-atlas-ux0a-coordination.md) preserves current authorization and boundaries.

## Delivered foundation

- Strict v2 placed/painted illustration and presentation source contracts, preserving separate strict v1 schemas. Existing IDs, points, archived content, place associations and independent map revision behavior remain.
- Exact catalog-reference validation on the server, derived place/decoration roles, persistent-location requirements for settlements, paint-family restrictions, bounded asset sets and preserved drawing/mark limits. Arbitrary URLs, code, unknown revisions and counterfeit roles fail validation.
- Shared v2 renderer with one embedded original vector definition per used exact reference, deterministic source-stroke scattering and registered geographic transforms. Missing revisions produce an explicit retained-data warning and block image export; they are never substituted with a different asset. Existing v1 rendering remains available.
- Drawing inspector retains v2 references when applying position, scale, rotation or stroke-size changes. Versioned originals retain their own palette. Existing legacy controls remain available for v1 sources.
- Additive migration `0132_worlds_atlas_starter_library.sql`, journal and generated snapshot. Exact 0104 v1 bodies are copied into named helpers; the original function identities are retained through CREATE OR REPLACE wrappers. Strict structural v2 references are extensible without hardcoding the catalog inventory. Existing map/drawing/history CHECK constraints are recreated and validated over populated data. No table, index, default, published migration or stored source/history content is rewritten.

The candidate catalog still contains the original three subjects. It is used only in isolated technical fixtures at this checkpoint. Revised-art subjects have not been promoted or expanded while independent approval is pending. The full palette, styled geographic composition, mask integration, learning, full recovery and zero-World island journey remain subsequent work within this authorized pass. No numerical terrain editor or later Geo scope is introduced.

## Actual verification

All work occurred in new owned targets under ignored `artifacts/guidance/geo-ux0a`, with explicit target/port/data-directory verification. Shared DEV/Production, prior raster assets, backups and the deleted Earth were not used as data sources. The retained Node **22.23.3** executable was read-only tooling. A detached prior approved application checkout at `b40bccc2cced333832b55239c77bcb21d165bb95` authored fresh compatibility content through normal service save flows.

| Check | Actual result |
| --- | --- |
| Fresh installation | All 133 migrations applied in the new empty acceptance database; zero Worlds/maps retained for the later website journey |
| Populated upgrade | All 133 migrations; every prior table row and historical payload unchanged |
| SQL and service checks | Four groups passed: strict v1/v2 and malformed-payload checks; normal save/read plus historical sources; unknown references/false roles with atomic rejection; role boundaries and concurrent-save protection |
| Retained history | Two original immutable historical sources stayed exact after new v2 saves/appearances |
| Feature regressions | **2,214 tests passed, zero failures**, Node 22, four test workers, all discovered feature test files |
| TypeScript | Passed after all foundation/browser-harness additions |
| ESLint | Full run had zero errors; one remaining pre-existing unused `LoreFamily` warning in the stories test harness. The candidate-catalog unused-field warning was corrected and that file rechecked clean |
| Production build | Passed in the owned isolated checkout with Node 22, locked offline dependencies, disposable database and empty owned private storage |
| Actual desktop browser | Normal website map open, select/apply/save retained v2 city and its exact reference/place identity; original v1 and new v2 sources rendered together |
| Actual PNG download | Website export resolved original vector definitions into PNG; original mountain shade pixels were verified, and Cody inspected the image |
| Touch browser | 390 x 844 mobile/touch context reopened exact v2 artwork without page-width overflow; this is emulation, not physical-device proof |
| Migration metadata | 0132 snapshot preserves all prior table/column/index/constraint metadata; only snapshot identity/previous-link changed |

Evidence: [desktop](../screenshots/worlds-geo-ux0a/foundation/desktop-v1-v2.png), [touch-browser](../screenshots/worlds-geo-ux0a/foundation/touch-browser-v1-v2.png), [actual exported PNG](../screenshots/worlds-geo-ux0a/foundation/v1-v2-map-export.png). Cody personally inspected all three. They are compatibility fixtures, not the finished-island composition or beginner-usability acceptance. In particular, the retained rectangular legacy land and deliberately coexisting old/new markers are not an artistic demonstration.

Private receipts/logs: `environment.json`, `migration-results.json`, `validation-results.json`, `unit.log`, `production-build.log`, `build-results.json`, `browser-results.json` in the owned evidence directory. The migration SHA-256 tested is `a82737d944b8c96f719059131e0d758221129161f7ce054778b8928a3c5c0574`.

The first build found an environment-object TypeScript annotation error in the new test harness. It was corrected and the complete isolated build rerun successfully. A Windows inherited-output-handle issue in task-cluster startup was also corrected, and its abandoned owned attempt stopped. The test-only Next configuration now explicitly bounds Turbopack to the owned checkout rather than inferring its parent repository. No shared process was restarted. Retained raster-storage dynamic-path tracing warnings remain existing build warnings, not failed checks or an excuse to alter protected bundles.

## Reproduction and recovery

Use the committed `worlds-geo-ux0a-harness.ts` with Node 22 and `--conditions=react-server --import tsx`. `setup` creates a new receipt and refuses to replace an existing one; `build` uses the verified empty target and copies source into its owned runtime checkout; `stop` stops only that recorded cluster. `worlds-geo-ux0a-validation.ts` appends disposable compatibility evidence and `worlds-geo-ux0a-browser.ts` runs the actual production-browser checks. The legacy checkout must be the exact commit above with matching installed locked dependencies. Setup and validation are test-target operations, not shared-data maintenance commands; retain receipts and use a fresh owned fixture for a new full run.

Migration order is committed history through **0131**, then **0132**. There is no new required production configuration at this checkpoint; test target/database/private-root/auth overrides stay in the ignored harness receipt/environment. Any eventual controlled deployment still requires separate owner authorization, matched backup, exact ledger/target verification, rehearsal and full-pass smoke checks.

After v2 saves, code-only rollback is unsafe: older validators/renderers need not understand exact asset/style references. Prefer a reviewed compatible forward fix. Any matched restore needs stopped writes, separately authorized recovery and reconciliation of post-backup changes. Never down-convert retained sources or remove migration ledger entries to make older code appear compatible.

## Remaining full-pass gates

The complete approved UX-0A journey remains unfinished. No initial owner test invitation, final usability/artistic acceptance, implementation merge or deployment is authorized by these checks. Complete the geographic presentation/mask and source previews, palette and place/label workflows, learning, independent save/recovery fault cases, initial zero-World/manual/generated website journeys, compatibility/privacy browser coverage and performance/storage checks; then obtain exact-commit independent readiness review. The revised art-direction gate is a separate prerequisite for library expansion.
