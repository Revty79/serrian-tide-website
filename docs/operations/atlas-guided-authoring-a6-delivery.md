# Atlas A6 — guided native authoring

Technical implementation and validation pass at published source `4b3f227a31de3ce8baafa7845ecb4294824bf7ab`. All four required exact-source GitHub workflows pass. Owner usability acceptance remains pending.

A3 is complete and is not being repeated. Its implementation `209b76952d7144bfc752b5e568547c01837dcae9` passed exact normal CI43150955752, recovery43150955775, Ubuntu43150955758 and signed-image publisher43150955784. Documentation `e2e96ab1615335585a787b0e9cf6cbe3f6113baa` passed normal CI43158711237. See [A3 delivery](atlas-source-rights-a3-delivery.md) for its retained failures, migration0162, source holds and limitations. No migration has been applied to owner environments by A6.

The A6 starting point is that final A3 documentation commit. Work stays in the existing main checkout and newly owned disposable PostgreSQL/storage, application builds and visible Chrome. There is no owner DEV, Production, original recovery, server or Earth access.

## Audit and implementation

The illustrated Atlas already has an optional first-island lesson (`island-learning.tsx`) with topic help, worked examples and independent source/artwork saves. Its historical UX-0A content describes an illustrated editor, including limitations that do not describe today's numerical terrain editor. The existing native terrain editor has the required brushes, water/environment tools, region previews, detail sources, keyboard dock and pending-work panel, but lacks an equivalent connected first-map path.

The native guide follows the existing optional learning pattern and reuses `GuidedField`, native panels, theme controls and action callbacks. It does not duplicate the old illustrated lesson or its engine, create a new persistence system, or pretend an opened topic proves completion.

- World creation's saved notice points to Atlas inside the workshop. The empty Atlas explains starting from Blank ocean and finding the guide.
- A visible Mapmaking guide opens instructions for an island, mountains/valleys, area selection, water, landscape painting, linked regions, saving/reopening and keyboard/navigation. Search accepts everyday task words.
- Guide actions choose existing tools or open the existing workshops. Region creation retains unfinished-work navigation checks; landform previews retain the existing active/working/save/dirty restrictions. The guide never changes heights, makes saves or accepts previews itself.
- The active tool remains visible beside the map when sidebars are hidden. Navigation/sample guidance distinguishes inspecting or copying a height from painting. Existing shortcuts, mouse-wheel behavior, hideable sidebars and centered canvas remain in place.
- Guidance explains layer-specific autosave, explicit saves, previews, cancellation, active-layer Undo/Redo and exact-request recovery. Water/environment/ground changes are distinguished from elevation changes; regions share terrain and zoom alone adds no numerical samples.
- Duplicate political/craft/underground shortcuts were removed from the Options heading; their existing tabs remain in All map options. The optional guide uses a taller phone sheet; other inspectors retain their prior sizes and virtual-keyboard positioning.
- A reproduced water-discovery defect kept the top action on Review water suggestions after accepting routes, hiding the actual save in More water tools. Save water changes now appears with everyday controls and uses the original save function and guards. Close suggestions explicitly retains accepted changes while dismissing the temporary proposal. The hydrology engine and persistence are unchanged.
- A narrow regional header grew to a third action row and overlapped the map controls after the guide was added. Its height now follows its content. The canvas retains the existing minimum-height requirement; no forced clicks or smaller acceptance threshold are used in the test.

## Final local validation

Private screenshots, logs and receipts are retained under `artifacts/atlas-guidance-a6/` and `artifacts/collaboration-s7b-a6-*`. They contain synthetic test content and are excluded from Git. The exact tested application digest is `13e86db3573dcd2a7614b402835dc286cfde967928091998ee186499921592fc`; production build `UP4xUDi3HBaz0i7pO9FjL`. The final build was created in `collaboration-s7b-a6-browser-1794463249444/production`. Its reuse verifies every current application/data/public/configuration input before launching a fresh isolated website; it does not reuse database or browser state.

| Check | Result and retained evidence |
| --- | --- |
| Root TypeScript | PASS, `types-publication.json/log` |
| Full ESLint | PASS, `lint-acceptance.json/log`; one inherited unused `LoreFamily` warning in `scripts/worlds-stories-checks.ts` |
| Normal feature suite | 2,947/2,947 tests in 381 files, zero skips; `unit-acceptance.json/log` |
| Environment integrity | 15/15, zero skips; `environment-final.json/log` |
| Raster deployment | 3/3; `raster-final.json/log` |
| Deployment safety | 66 Python cases, with three platform-specific Windows skips, plus 15 JavaScript and two TypeScript cases; `deployment-final.json/log` |
| Native first-map browser journey | All 11 groups PASS; `workflow-eleventh.log` and `collaboration-s7b-a6-browser-1794463637649/guidance-results.json` |
| Original seven-family/source-rights/export regression | All four groups PASS; `seven-families.log` and `collaboration-s7b-a6-seven-families-1794463860000/browser-rights-results.json` |
| Independent output inspection | 19 PDF pages rendered; SVG credit pixels equal PNG; all eight PNG mandatory footers identical; `output-inspection.log` and that seven-family fixture's `output-inspection.json` |
| Exact tested-build parity | All 2,164 application inputs match, except the two declared isolated build-root/generated-type adaptations; `final-audit.json` |
| Original source preservation | 10,707 protected tracked paths unchanged against A3 base; `preservation-current.json` |
| Owned-service closure | All 14 A6 fixture environments stopped, absent PostgreSQL PID files, all 28 recorded owned ports non-listening; `final-audit.json` |

No fixture loads the owner's environment files. The established disposable helper tests fresh and upgraded 163-entry schemas and preserves all 393 pre-upgrade public tables exactly; it creates two small compatibility Worlds before the upgrade. Their existing World rows also remain exact after the new A6 journey. The new A6 World, its terrain and its regional map are created solely through normal visible authoring controls. Read-only API/database checks verify persistence. An unauthorized save request and an interrupted network request are deliberate security/recovery tests, not hidden authoring.

### Visible workflow demonstrated

The final run uses installed Chrome, visibly headed, with GPU disabled. It signs in through the normal form as the new synthetic owner and creates an empty World, opens Atlas, takes editing control, and creates a Blank ocean map.

1. Find the island topic, open the actual Flatten brush, draw land with the mouse, wait for autosave, and prove exact whole-grid Undo/Redo.
2. Find mountains and A1 precision; position the existing cursor by source samples. Cancel a continuous keyboard stroke without changing accepted terrain, deliberately stamp a mountain, and prove typing in the guide cannot sculpt.
3. Open and cancel the actual area workshop without accepting changes.
4. Place a river source, review and accept its proposed waterways, use Save water changes, then draw, name, finish and save a lake. Numerical elevations remain exact.
5. Paint ground and save an environment biome through their actual controls; persisted layers change independently of heights.
6. Name, draw, preview, save and open a real linked regional map. Its native `world_map_region` coverage, parent and terrain source are persisted; the source is shared rather than copied.
7. Leave through World registry, reopen the same World and select the same saved map. Terrain and environment values remain exact.
8. Interrupt a terrain save, reload, open Review unfinished changes, and recover through the visible control. The original request body is retried unchanged and accepted.
9. At 390 × 844, find guide topics, use Pan and two-finger touch input, retain a canvas at least 400 px high and avoid horizontal overflow. All regional-header actions fit and Back to World works. Touch is emulated, not a physical-device claim.
10. Authorized administrator review can read the guide but its authoring buttons are disabled and terrain stays unchanged.
11. An uninvited actor sees the actual not-found page, no private map canvas or guide, and cannot replay the save request. Accepted values remain exact.

The new World is `01c8cd3b-12aa-4b6b-a22d-5bf6d01c3934`, map `8e8b1dc9-5b3f-4c34-ac01-03a4ee636653`, and regional map `318e1341-72b4-4a3d-9748-3a5ba32c7393`, all in the stopped disposable fixture. Final numerical revision is 6 with grid SHA256 `749a20f073b63203531419480b9266118b1d2ac5f4d6f5288fe49cbb3d786c2a`. No owner World was created or changed.

Representative screenshots in that fixture are `desktop-guide.png`, `island-saved.png`, `regional-outline-preview.png`, `saved-linked-region.png`, `recovered-original-save.png`, `phone-searchable-guide.png`, `phone-touch-navigation.png`, `phone-linked-region.png` and `administrator-readonly-guide.png`. Desktop instructions, saved land, recovery and phone layouts were visually inspected. These are a functional synthetic island, not an artistic Earth demonstration.

The unchanged seven-family regression verifies original current/historical exports and Stage 7C reads, visible source registration/review, denied uploader approval, mandatory credits after reopening, and later source holds across all seven families. It downloads eight PNGs, one JPEG, one hybrid SVG and nine PDFs (19 pages), including a crop and four-page poster. The existing offline inspector was reused with only its private fixture-path assertion narrowed to this exact new A6 directory. Representative rendered source-page, poster footer and JPEG notices were visually inspected. This does not assert a new review of every possible source license or printer.

### Retained failed and superseded evidence

Earlier failures remain in their original directories and logs. They are not counted as complete passes:

- `1794460756832`: World creation succeeded; the test wrongly expected automatic navigation instead of the visible Open World link. `1794461002145` then passed the initial creation journey only.
- `1794461239762`, `1794461356887`, `1794461499919`: test array-spread argument limit, wrong biome value, and water-button case mismatch respectively. Corrected selectors still use real visible controls.
- `1794461816308`: reproduced the hidden water-save action after accepted suggestions; the permanent correction is described above.
- `1794462098654`: optional-lake polling race; the final poll waits for the named persisted lake.
- `1794462307818`: incorrect test expectation that regional map creation fills `world_atlas_map.geography_id`. The correct native coverage and relationship are required instead, and the guide explicitly distinguishes a regional map from the separate geography catalog.
- `1794462455106`: reproduced the phone regional-header overlap. `1794462663674` tested a partially updated build; source comparison identified the stale guide/class and its readable-guide-height assertion failed. It is not final-source evidence.
- `1794462905260`: ten groups passed; the unauthorized-page selector matched hidden help. `1794463249444`: ten groups passed; a test incorrectly required HTTP404 for Next.js's streamed not-found boundary. The final check requires visible denial, absence of the private canvas and a rejected mutation. [Next.js documents the streamed HTTP200 behavior](https://nextjs.org/docs/app/api-reference/file-conventions/not-found). No application permission guard changed.
- A preservation helper initially exceeded its subprocess output buffer; the enlarged-buffer complete audit passes. PowerShell's handling of native stderr produced misleading launcher errors in earlier attempts; final normal-check receipts record the child exit status directly. No failed receipt was deleted or relabeled.

## Preservation, limitations and review

The 11 public paths comprise the native guide and tool-language module, four existing presentation files (terrain editor, hydrology controls, terrain CSS, World registry), two browser test files, this report, AGENTS guidance and the artifact ignore rule. No terrain engine, numerical format/limit, renderer, database schema/migration, rights service, authentication, export contract, backup/restore or deployment code changed. The protected canonical Git-blob manifest SHA256 is `df82efbce262b2205adf165348b78b6e5c8788d10aa7d22e623b47dc3afac585`.

- A1 source-sample precision remains native; the new test exercises positioning, stamping, cancellation and form-focus safety. It does not repeat every A1 polar/wrap/control-point case.
- A2/A4 numerical options, rendering engines, all 36 CPU gates and their original thresholds remain unchanged. This pass does not claim a fresh 36-case benchmark or repeat high-resolution feasibility measurements.
- All seven map families remain available. The new connected first-island guide focuses on native World/regional terrain; existing illustrated and specialized-family lessons remain intact.
- A region has a genuine linked map and native geographic boundary. It does not automatically create a separate World geography-catalog record. Regional sculpting requires an appropriate finer source inside the region, as the guide explains.
- Layer-specific saves remain deliberate. The guide does not introduce a risky universal save, auto-accept suggestions, or mark steps complete merely because they were opened.
- A3's 0162 migration, conservative legacy holds, attribution obligations and notice-bearing Stage 7C restriction remain unchanged. No owner migration or deployment was performed. A3's limits remain in its delivery report.
- Source/build preservation and disposable recovery evidence are not a new audit or backup of owner data, which was not accessed.

Local and hosted technical evidence passes within this scope. Automated tests do not establish that a new human creator finds Atlas intuitive, nor physical touch-device or artistic acceptance. The recommended next milestone is a bounded owner/Ember first-island usability review, followed only by separately assigned corrections. Before testing this release against an existing database, verify its A3 migration0162 readiness through a separately authorized rollout; no current owner ledger is certified here. Do not begin Earth or Tabletop from this delivery.

The separately ready trusted-origin command is retained in [the A5 owner instructions](deployment-a5-trusted-origin.md#ready-one-time-owner-command), pinned to973d4f57. A6 does not execute it, interrupt a running owner update, or claim real-domain login has been verified. The exact command must accompany the final owner handoff.

## Publication

Implementation `4b3f227a31de3ce8baafa7845ecb4294824bf7ab` is published to existing main with `[skip render]`. Its exact latest-attempt runs and jobs pass:

| Required workflow | Exact successful run |
| --- | --- |
| Normal validation | [43166660886](https://github.com/Revty79/serrian-tide-website/actions/runs/43166660886) |
| Environment disaster recovery | [43166660919](https://github.com/Revty79/serrian-tide-website/actions/runs/43166660919) |
| Ubuntu website deployment regression | [43166660896](https://github.com/Revty79/serrian-tide-website/actions/runs/43166660896) |
| Verified prebuilt website release | [43166660910](https://github.com/Revty79/serrian-tide-website/actions/runs/43166660910) |

Linux normal CI independently passes all 2,947 feature tests, raster/integrity checks and deployment-safety cases without the three Windows-only platform skips. Recovery passes the real PostgreSQL/storage restoration groups and source-rights/migration/copy/restore checks. Ubuntu passes the bounded build, real Next.js authentication/cutover/rollback, installed updater, trusted-origin/session preservation, legacy/TLS transition, first-time storage bootstrap and independent restoration. No existing workflow or acceptance threshold was modified.

The registry image is `ghcr.io/revty79/serrian-tide-website@sha256:6f207a32d28f99e8214566a6302a3ac28c0745aaf6c5810e62f012c3113d9992`. The publisher independently validates its exact-source provenance, actual download/deployment, registry outage, digest/signature corruption, interrupted download, failed startup/rollback, preservation and repeat no-op behavior before completing. Its new owned-Ubuntu measurement is 59.21 seconds for a cold-candidate complete prebuilt update versus 370.94 seconds for local build plus deployment. These are CI measurements, not measurements on the owner's Ryzen server. This publication does not authorize installing A3's migration or deploying the owner's website.

Full logs are retained as `ci-validation.log`, `ci-recovery.log`, `ci-ubuntu.log` and `ci-prebuilt.log`; exact run/job metadata is retained beside them. The final documentation receipt changes only this report and AGENTS guidance, preserving every tested executable input. Its normal CI and clean local/origin/official-main parity are verified in the final handoff. No additional milestone is started.
