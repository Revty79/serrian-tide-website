# Project Earth Pass 1: explicit crossing coverage

Status: technical release PASS at
`73193a605330c67cc795f2624cda25245ff2cb13`. This continues the original authorized
Earth pass. The owner subsequently applied 0164 to local DEV; the read-only
verification and its limits are recorded below.
Earth geography and owner acceptance are unfinished.

## Reproduced authoring limit

A required island crosses the boundary between existing native terrain areas.
Ordinary Root refinement correctly refuses same-level overlap. A child correctly
requires its complete frame inside one parent. The relevant accepted parent
already uses 4096 columns, so its supported extension cannot add western columns.
The same refusals and capacity limit reproduce through visible controls in a
fresh owned production fixture. Cancelled proposals leave accepted sources exact.

## Bounded correction

The existing Terrain detail form adds **Refine across existing areas** when the
creator selects **Whole World base**. The form and preview explain the starting
surface: the saved World base supplies the inherited heights. The new area takes
precedence inside its bounds; existing finer surfaces and their immutable history
remain stored underneath. The preview must be reviewed before acceptance.

This choice does not blend finer surfaces into the starting terrain. A creator
must choose suitable bounds and sculpt the intended result. In particular, an
inherited Root collar does not promise continuity with arbitrary edited finer
surfaces outside those bounds. This limitation is visible before acceptance.
No existing surface is deleted, moved, reparented, coarsened or silently copied.
Source creation retains the existing permanent-identity behavior: Undo/Redo
applies to subsequent terrain edits. No source-removal or creation-undo action
is added; the preview explains that acceptance permanently adds coverage.

The native numerical parent remains an exact saved Root revision. The source
uses the existing metadata, numerical initialization, worker, tiles, interpolation,
geometry history, export, dated appearance and copy paths. A higher detail level
records precedence. Every intersecting lower source must have at least twice the
new spacing on both axes. The existing 128-refinement, depth-eight, 4096-axis and
four-sample inherited-collar limits remain intact.

Current and dated writers verify the original complete revision vector before
creating or extending crossing coverage. Original accepted requests remain
idempotent after a lost acknowledgement, even after the source index changes.
All higher-level coverage protects editing of the underlying source, including
coverage whose numerical parent is another source. Canon-copy replay retains
the checked creation/extension guards and the requisite earlier numerical rows.

Migration `0164_atlas_crossing_refinement` adds a capability function and updates
the checked insertion/extension validators. It adds no table or column. All 407
existing table rows and columns, and all 164 earlier migration rows, survive the
populated owned rehearsal exactly. Schema 164 retains ordinary authoring and
refuses new crossing acceptance. Ordinary updates continue to refuse a missing
migration; no automatic owner migration or configuration change is introduced.

## Evidence and remaining gates

Private receipts remain in ignored `artifacts/project-earth-native-pass1-20261112/`
and newly owned `artifacts/collaboration-s7b-earth-pass1-*` fixtures. No private
database, authoring vertex list, terrain binary, password or session token belongs
in this publication.

- The exact final production build is `dRrux2Fliynok9wlT7oDG`. All 2,169 actual
  application inputs match SHA-256
  `2b88b6b07315413fab7ee46e1912553b4de849fbd4909537abb2f4ff189e1c69`.
  Eight focused crossing units and all 2,966 feature tests pass on these frozen
  application bytes. Types, build, Drizzle checks and lint pass; lint retains one
  inherited warning.
- Visible owned Chrome verifies two adjacent original areas, explicit crossing
  preview/cancellation, native polygon sculpting, save, exact Undo/Redo, settled
  reopening, both protected-parent refusals, and lost-acknowledgement retry without
  duplicate creation. This evidence uses the exact final production build.
- The actual populated 164-to-165 owned migration preserves all 407 old public
  tables and the old ledger. Current authoring verifies Root inheritance rather
  than a finer parent's edits, permissions, source-state refusal, original retry,
  protected parents, a contained child, coverage extension, historical geometry
  and restoration.
- Dated authoring verifies crossing creation and extension, original retry,
  retained old dimensions, export and Stage 7C parent pins, and unchanged current
  geography. A real private Canon variation copies current and dated coverage,
  rekeys the dated-only identity and preserves numerical tiles.
- Independent restoration uses the established constrained, streaming,
  single-transaction terrain recovery helper. All 407 table digests, all 165
  ledger rows and all three fixture roots match. The 39 terrain, one artwork and
  one raster files are synthetic fixture evidence, not an owner backup receipt.
- The same build passes eleven A6 groups, eleven saved-lake groups, six polygon
  groups and seven original extension groups, including actual 4096 by 2048
  coverage and all 8,388,608 samples. Six original editable Canon-copy groups and
  the original expansion/history/restore suite pass against schema 165.
- Four original A3 browser groups cover all seven map families and 19 actual
  outputs. Independent inspection decodes ten image formats (including SVG),
  renders all 19 PDF pages and checks the map notices and all seven complete
  source-information pages. Credits are inspected in rendered pixels; these PDF
  pages are raster images, so no extractable-text or PDF accessibility claim is
  made. Synthetic output evidence does not approve real Earth exports or rights.
- Bootstrap accepts the genuine 165-entry owned schema and refuses missing,
  wrong-hash and unknown-166 ledgers. The final deployment suite passes with three
  local platform skips. The shared owned fixture baseline pins genuine initial
  schema-165 source `267fffd7f1dae5ba42a89106db04002e125c6b35`, which is test input
  and not a verified release. Actual 165-versus-164 updater refusal passes while
  retaining the original actual A3 and 164-versus-163 refusals. The original CPU
  gates remain unchanged; no fresh complete CPU matrix or physical-device/owner
  acceptance is claimed.

Retained failures include the original unchanged authoring refusals, a public
test option-element typing error, an unconfirmed advanced-grid test setting, an
incorrect checksum assumption for the existing revision vector, premature test
observation of a disabled Retry label, and legacy tests affected by Git worktree
newline conversion. All unchanged tracked inputs were independently restored to
their exact main bytes; subsequent 2,966-feature evidence passes. Canonical diffs
and an explicit allowed-file assertion must accompany publication.

The shared history test initially assumed its original fixture's hard-coded
coordinates; it now checks complete independently seeded bounds and explicit
zero export rotation while retaining the original defaults. A plain `pg_restore`
attempt reproduced the established legacy empty-search-path failure. The existing
recovery helper corrects only the archive preamble and retains every constraint,
function and row; no new recovery mechanism or relaxed validation was added.
An initial export-QA assertion incorrectly expected extractable provider text in
the existing raster PDFs. That failed assumption is retained; independent rendered
page and source-information inspection supplies the actual credit evidence.

## Exact published release receipt

All four exact main-push workflows complete successfully, with every required
latest-attempt job and step checked:

| Workflow | Run | Successful attempt |
| --- | --- | --- |
| Normal validation | [43986744371](https://github.com/Revty79/serrian-tide-website/actions/runs/43986744371) | 1 |
| Linux disaster recovery | [43986744235](https://github.com/Revty79/serrian-tide-website/actions/runs/43986744235) | 1 |
| Full Ubuntu deployment | [43986744201](https://github.com/Revty79/serrian-tide-website/actions/runs/43986744201) | 2 |
| Verified image publisher | [43986744403](https://github.com/Revty79/serrian-tide-website/actions/runs/43986744403) | 2 |

The first Ubuntu attempt failed acquiring the public PostgreSQL dependency with
`Network is unreachable`, before the application build/tests. The first publisher
correctly refused that failed upstream run. Both logs remain retained; successful
attempts rerun the unchanged source and all required checks. Success-path build
diagnostics are the only skipped Ubuntu step.

Immutable image:
`sha256:30839381e8994653e29555cb12910d88fe41db98b88e033890e96fafe1a2df9a`.
Linux release fingerprint:
`b2a25f93e49ea29b784d788d3cf44eafc4b5f753b089bc370c055d2a017f2594`,
build `o1OnXFhAeYxbWtpXGw4hk`. The unchanged verifier independently checks real
completed GitHub results and cryptographic GitHub-hosted provenance against this
exact source, digest and publisher attempt. These Linux identities are separate
from the retained Windows production-build/input identity above.

Fresh independent installed-command acceptance
[43996014365](https://github.com/Revty79/serrian-tide-website/actions/runs/43996014365)
passes every latest-attempt step against real completed GitHub checks and the
signed GHCR image. Actual update, populated database/files, account, session and
World preservation, interrupted transport, digest/signature refusals, failed-startup
rollback and repeat no-op all pass. These are owned hosted fixtures; the owner's
server was not operated or measured.

All 21 new local owned fixtures are stopped and their 20 recorded ports are
non-listening. The 2,169 local application inputs remain exact to the tested
Windows build. This following documentation-only publication must retain every
tested executable input, complete normal CI and verify clean local/main/remote
parity. A documentation-only commit is not a separately published image release.
No whole-Earth, artistic, physical-device, legal/commercial or owner acceptance is
inferred. Actual native geography and final fresh current-geography paired
recovery remain unfinished.

## Owner-executed local activation

The owner explicitly approved the guarded local operation, then took over the
migration and reported it complete. A fresh read-only check on November 16 local
time verifies `localhost:5432/serrian_tide_dev`: all 165 migration hashes and times
match the published journal, including the exact canonical 0164 SHA-256
`0f6aca722359783c3c1f55c70d416fc49a308a91471b0d49f9e7ad6d2102203c`.
The crossing capability function returns true.

The selected three storage roots and configuration bytes remain unchanged.
All 77 current numerical source identities, revisions, frames, parent pins and
decoded hashes, Root73 and water33 match the last accepted native-authoring
witness. Ordinary authenticated reopening of the same Earth succeeds. This is
post-application read verification; it does not supply a pre-upgrade capture or
an owner-target rehearsal. The agent did not apply the migration or stop DEV.
The software release's isolated rehearsal remains separate evidence.

Do not repeat 0164 or switch to the older port-5433 environment. Continue the same
native Earth pass with the crossing control now available. Global geography,
remaining islands and final fresh current-geography paired recovery are still
unfinished; no whole-pass, legal, artistic or owner acceptance is claimed.

## Proposed owner DEV activation

The original proposal below is retained as history. The owner instead handled
the local application, as recorded in the preceding section.

This section is a concrete activation plan, not permission to execute it.
The owner-selected target remains local `localhost:5432/serrian_tide_dev`, through
0163. The earlier approval and successful application covered only 0163.
An explicit owner approval is required for 0164 by the Earth instructions.

After final validation and publication, verify the exact target and three roots,
the complete 164-row ledger and the single pending 0164 hash. Preserve the current
configuration and normal authenticated session. With pgAdmin closed and writers
quiescent, briefly stop only the DEV website and use the established paired
encrypted capture, authenticated opening and exact independent new-fixture
restoration. Rehearse only 0164 on that restored copy before applying only the
same reviewed migration to DEV. Verify all old rows, grids, files and settings,
the exact 165-row ledger/hash, normal reads and the existing sign-in, then restart
DEV unchanged and stop only the new owned fixture.

Do not switch to the older port-5433 database, repeat 0163, reset authentication,
alter Production, deploy to the home server or activate the real Earth as Canon.
Continue independent native geography while any necessary approval is pending.
Use the corrected visible controls on the same Earth after authorized activation.
Final current-geography recovery remains a separate end-of-pass requirement.

The separate reviewed trusted-origin command pinned to
`973d4f57e10df5231f02ff6efeb1e1ad3ac04b45` remains unapplied; retain its
[owner-run handoff](deployment-a5-trusted-origin.md).
