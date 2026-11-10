# Stage A2 numerical sample resolution assessment

Status: compatibility audit, all six isolated measurements and the actual supported 1024 persistence/restore assessment pass. This is not authorization or a claim of 2048/4096 native Atlas support.

## Decision boundary

Keep today's persistent maximum at 1024 samples per axis. The owner's supplement explicitly prohibits a schema migration or incompatible persistent format in A2. Both root and refinement PostgreSQL constraints must change before a larger accepted numerical source can exist. No numerical limits, migration bytes, saved sample values or existing records are changed by A2.

Larger optional local refinements are the preferred follow-up candidate, subject to the measured results and separate authorization. Increasing the whole World's default is not necessary for improving its visible reconstruction. Existing nested refinements already reduce physical sample spacing without enlarging the default World grid.

## Complete dependency chain

| Authority | Current contract and consequence |
| --- | --- |
| Root settings and creation | `terrain.ts`: 32–1024 samples per axis, multiples of 32, default 640×384. `terrainCommandSchema` requires a complete generated/imported grid exactly once. A width-only UI change would be rejected. |
| Root PostgreSQL/ORM | Published `0133_worlds_editable_terrain.sql` and `world-terrain-schema.ts`: grid dimensions ≤1024, tile coordinates 0–31, fixed 32² whole-metre Int16 samples, `i16le-v1`, 2048 bytes per object. No changes to published SQL are appropriate. |
| Refinement PostgreSQL/ORM | Published `0137_world_terrain_refinements.sql` and `world-terrain-refinement-schema.ts`: grid sizes 32/64/128/256/512/1024, LOD 0–5, tile coordinates 0–31. Deferred completeness and containment triggers also validate every overview and parent dependency. |
| Refinement validation/LOD | `terrain-refinement.ts`: explicit allowed sizes, depth 8, at most 128 refinements, at least twice the parent's physical detail on both axes, four-cell inherited collar. A 2048 source needs LOD 6 and 64 tiles per axis; 4096 needs LOD 7 and 128. |
| API and recovery | `tileSchema` caps coordinates at 31; `MAX_TILE_COUNT` is 1024. Refinement readers cap LOD at 5, key at 1023, batches at 64, and query-string length. The original streamed authoring body limit is 8,000,000 bytes. Recovery schemas reuse the same bounded tile and creation schemas. Request and draft handling need a coordinated design, not a larger unchecked JSON body. |
| Saving/history | Immutable versions, CAS tile checksums and overview generation must remain exact. Browser undo retains at most 60 entries and normally one million changed samples, retaining the most recent gesture even when larger. Full-array clones, patch maps, serialization and retry retention need measurement beyond the base Int16 allocation. |
| Protection/physical operations | Masks are full source-sized Uint8 arrays. Parent interpolation support and inherited collars remain protected. `terrain-advanced.ts` rejects buffers over 1,048,576 samples; bounded operations separately cap area/work. Ordinary brush geometry and source-aware keyboard math do not by themselves authorize a larger accepted source. |
| Generation/workers | Generator v2 has an unchanged 80-million candidate-work guard. The native inheritance initializer validates allowed sizes before allocating, including when called by its worker. Larger read-only sampling diagnostics must not be presented as accepted initialization. |
| Loading/rendering | The numerical cache retains 2048 validated tiles, requests two batches concurrently and plans at most 1024 visible tiles. Visible raster caches/work remain separately bounded. Loading every larger source in full would undermine progressive detail and CPU operation. A2 improves use of existing accepted sources, without changing their dimensions. |
| Native object storage | The existing 2048-byte tile codec can represent the same sample values independently of source dimensions. This does not remove coordinate/manifest/database limits. Diagnostic codec pages and their copied archive are not a native larger-World save, history or portability pass. |
| Backup/restore | Environment portability preserves database constraints, migration history and all referenced native tile objects. A future release needs paired upgraded application/schema restore verification. Byte-compatible tile objects alone are insufficient. Existing snapshots stay unchanged. |
| Export/printing | Saved-source loaders and pinned resource readers use the existing numerical dimensions, overview references and caches. Full root-grid loading and bounded detail acquisition need larger-source memory/area tests. Output pixel smoothness is independent of numerical resolution. |
| Stage 7C consumption | `atlas-map-consumption.ts`, schema 1: dimensions ≤1024, tile coordinates ≤31, LOD ≤5, root references ≤1024 and numerical references ≤8192. A resource is ≤12 MiB, tile delivery batches ≤32. Larger grids cannot silently be advertised through schema 1. All-overview references are 1365/5461/21845 respectively; 4096 exceeds the numerical-reference limit as well. |
| Future Tabletop consumers | The read-only Stage 7C source contract is the dependency boundary. No Tabletop terrain integration or contract expansion is implemented in A2. A future consumer must explicitly negotiate an upgraded source contract; it must not assume that zoom or an interpolated export is editable geography. |
| Keyboard sculpting | Movement and coordinate entry use actual source dimensions and frames, independent of zoom/visual LOD. Larger diagnostic arrays can demonstrate smaller physical increments. Existing accepted maps retain exactly their original coordinate convention, wrapping/polar clamps and footprint. |

## Numerical costs before working allocations

These are exact logical payload counts, not measured process memory or predicted filesystem allocation.

| Square grid | Base samples | Base Int16 | All Int16 overviews | Base tile references | All overview references | Spacing over 40,000 km | Spacing over 64 km |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1024 | 1,048,576 | 2 MiB | 2,795,520 B | 1024 | 1365 | 39,062.5 m | 62.5 m |
| 2048 | 4,194,304 | 8 MiB | 11,184,128 B | 4096 | 5461 | 19,531.25 m | 31.25 m |
| 4096 | 16,777,216 | 32 MiB | 44,738,560 B | 16384 | 21845 | 9,765.625 m | 15.625 m |

Doubling each axis gives four times the samples and half the spacing, with the same whole-metre elevation precision. Inheriting/interpolating an old source creates no newly observed geographic facts. More authorable samples allow smaller deliberate edits only after the complete persistent chain supports them.

Native root storage retains level-0 tiles; root presentation overviews are computed in memory. The all-overview columns describe a complete square refinement/diagnostic pyramid, not extra persisted root levels. The World feasibility cases deliberately exercise that codec pyramid as a separate diagnostic workload. Rectangular current sources retain their own existing dimensions and overview rules.

## Isolated benchmark protocol

`scripts/worlds-graphics-a2-resolution.ts` creates separate fresh child processes for Whole World and local 1024/2048/4096 cases. It uses original mathematical fields and the unchanged native generator, brush, undo/redo/cancel, masks, keyboard coordinate math, overview codec and scalar visual kernels. It measures memory/CPU/wall time and independently reopens every staged diagnostic tile, with archive copying and corruption rejection in newly owned paths. The browser/database fixture separately verifies actual supported 1024 native saving and restore.

The unmodified native schemas and inheritance worker must reject 2048/4096. Larger arrays, read-only sampling, pixel kernels and legal independent codec pages are feasibility diagnostics; no unsupported source is inserted or accepted as an Atlas World. Generation refusals and failed attempts remain visible in the receipts.

## Measured feasibility results

All six cases pass, serially on the same Ryzen 5 5600G / approximately 32 GiB Windows host. Receipt: ignored `artifacts/atlas-graphics-a2/resolution-1/results.json`. Each case uses a fresh Node process with explicit GC before the initial allocation, original mathematical fields, no shared database and no dedicated GPU. The native worker and both native setting schemas correctly reject 2048/4096. The unchanged generator kernel completes all six diagnostic recipes; that does **not** make the larger recipe an accepted Atlas source.

| Scope | Samples | Native generator wall time | Peak process working set | Complete diagnostic wall / process CPU | Stage + verify + overview codec workload | Estimated full base JSON |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| World | 1024² | 0.864 s | 194.2 MiB | 15.32 / 12.39 s | 6.97 s | 5,192,638 B |
| World | 2048² | 3.347 s | 310.2 MiB | 66.63 / 40.22 s | 27.63 s | 20,771,298 B |
| World | 4096² | 13.264 s | 356.9 MiB | 288.09 / 149.19 s | 110.85 s | 83,094,232 B |
| Local | 1024² | 6.247 s | 223.3 MiB | 21.94 / 19.06 s | 7.57 s | 5,192,638 B |
| Local | 2048² | 26.934 s | 313.8 MiB | 94.12 / 66.23 s | 30.03 s | 20,771,298 B |
| Local | 4096² | 100.648 s | 373.3 MiB | 363.90 / 236.22 s | 110.36 s | 83,094,232 B |

The complete diagnostic includes generation, seven native brush probes, exact undo/redo/cancel, masks, coordinate checks, native inheritance validation/worker checks, scalar-kernel rendering, tile/overview staging with immediate reads, archive creation, extraction, reopening unique restored objects and corruption rejection. These are **not normal Atlas save times**. Peak working set includes runtime/worker/temporary allocations in the Node process; archive child-process CPU/memory is excluded. The whole process CPU count is useful; individual very short kernel CPU counters can round to zero on Windows. The local custom physical recipe is more expensive than the World recipe and must not be compared as if feature density were identical.

Archive creation/extraction takes approximately 0.38/0.49 s at 1024, 1.2/1.7 s at 2048 and 4.3/7 s at 4096. Reopening/checksumming every restored object is additional work. Every saved diagnostic object and overview reopens exactly, and intentionally corrupting only the new extracted copy is rejected while the original diagnostic CAS still verifies. This is codec portability evidence, **not an unsupported native World backup/restore pass**.

The separate actual supported-1024 assessment passes in `supported-persistence-1`: a real PostgreSQL dump is restored into a newly named owned database and a new terrain root. All 400 public-table row digests, the 161-entry migration ledger and 3,565 terrain files match; fresh native readers verify the root, 512 regional source and 1024 local source plus 1,706 pinned tiles across every saved refinement overview. Original source rows/files remain exact. Ten transactional probes against temporary copies of the actual CHECK constraints reject 2048/4096 dimensions, tile coordinates 32/127 and LOD6/7 with PostgreSQL 23514. Original accepted tables are never updated by those probes. No larger native record or shared target is created or accessed.

The full-grid JSON estimate is the sum of actual serialized base tiles plus 256 bytes of envelope allowance; it is not an accepted request. 2048 and 4096 already exceed today's streamed 8,000,000-byte ceiling before a richer source/recovery envelope. All-overview logical payloads and tile-reference counts are exact in the earlier table; filesystem, manifest and PostgreSQL allocation remain separate.

### Actual potential detail, rather than smoother images

The same original mathematical heights at 32 coincident coordinates are exact across all three candidate sizes. Each native single stamp changes exactly one source sample, and A1 coordinate math advances by the actual metre/sample increment. Whole-metre vertical quantization is unchanged.

A fixed synthetic 40 km-wide crest in the World transect has an ideal 1500 m peak. Direct samples capture 1047 / 1302 / 1481 m at 1024 / 2048 / 4096, with 1 / 2 / 3 samples above half-height. A fixed 80 m-wide local crest captures 1191 / 1370 / 1488 m; local spacing is 62.5 / 31.25 / 15.625 m. These are newly available sampling positions in diagnostic fields, not geographic observations and not interpolated image pixels. Larger-source edit potential is explicitly marked unsupported.

Seven native brush kernels retain the protected sample and pass exact undo/redo/cancel checks. Where the smooth analytic slope produces no whole-metre smoothing change, the receipt reports zero rather than claiming an edit. A separate `resolution-recovery-1` probe checks both smoothing tools on irregular numerical peaks at all six sizes, requires nonzero changes and verifies exact protected values/undo/redo/cancel. It also terminates a real native inheritance worker before acceptance, starts a new worker, verifies rejection of an unsupported job and then exact 1024 recovery in that same worker. No native source, schema or worker was widened for these tests.

The six scalar visual-kernel probes per case use identical 256² output sizes at three zoom spans and both original scalar styles. Their read-only results and unchanged source hashes are recorded. They are kernel timings, not browser support for larger sources; actual browser zoom/rendering and all 36 original CPU gates are separate A2 evidence.

### Production recommendation

- **Whole World:** keep the existing 640×384 default and 1024-per-axis supported maximum. Increasing the entire default gives four/sixteen times the samples and broad initialization/storage costs without resolving the need for authored regional facts.
- **Regional:** retain current selectable sizes through 1024 and the existing 256 regional-context initial choice. Use a physically appropriate frame; smaller accepted frames improve real sample spacing. Parent/child protection collars still apply.
- **Local:** retain 1024 as the shipped maximum and the existing bounded World-context refinement default. A separately authorized optional **2048 local** path is the best next feasibility candidate when its larger area at finer spacing is useful; today's evidence does not certify its unimplemented API/browser/history/export chain.
- **4096:** keep diagnostic/experimental. Local generation alone reaches approximately 101 seconds in this recipe, complete verification reaches approximately six minutes, and contracts remain incompatible. Do not make it a production option or default based only on the 32 MiB base buffer.

No automatic resampling, World upgrade, new selectable size, migration, enlarged API/recovery budget or new persistent format is included in A2. Safe implemented gains are better use of existing accepted LOD and bounded visual reconstruction, described in the main delivery report. Owner authorization for the complete following proposal is required before persistent expansion.

## Proposed separately authorized implementation

This is a proposal, not implemented support or an approval request to interrupt A2.

1. Prefer an optional **2048 local refinement** first. Keep root World limits/defaults and existing sources unchanged. Rehearse a new additive migration that extends refinement size/LOD/coordinate CHECKs and their ORM equivalents together; preserve every published migration byte and the existing 2048-byte tile encoding. An old application still cannot read a newly enlarged source, despite byte-compatible individual tiles.
2. Extend the complete refinement/settings, tile, service-reader, recovery, numerical-resource and source-capability chain consistently. Reject unsupported consumer versions explicitly. Do not advertise a larger source through schema 1, truncate its references, rename an overview as its full editable base, or silently resample old maps.
3. Keep the current 8 MB request ceiling. Design bounded atomic acceptance of large dirty-tile sets, with exact request identity, checksums, durable preparation, safe abort/retry and one accepted history operation. Creation already accepts a hash of inherited terrain rather than an uploaded completed map; preserve that authority. Raising a JSON array limit alone does not solve larger save/recovery payloads.
4. Revalidate full-source masks, worker transfers and advanced-tool buffer admission while retaining existing **per-operation** area/work budgets. Measure full gestures, exact undo, recovery quota failures, protection collars and multiple concurrent/refinement contexts. Do not multiply operation work simply because the source has more samples.
5. Add versioned read-only/export capability negotiation and bounded references/resources. The current 8192-reference and metadata/cache budgets are deliberate protections. Larger sources across many accepted refinements need bounded source acquisition, not an unbounded whole-World manifest. Test crop/print/history pins and independent restored application reads before accepting the new maximum.
6. Keep old sources and backups exact. Rehearse upgrade, interrupted acceptance, restoration and older-client rejection only in owned targets. Downgrade must detect enlarged accepted sources; it must not shrink them or remove their history to satisfy an older binary.
7. Leave **4096** diagnostic/experimental until the 2048 path passes every native tool, persistence/security/recovery/export contract and the unchanged original CPU gates. Do not enable 4096 as a global default, or add a selectable UI option before its complete chain is supported.

Current defaults remain the saved 640×384 World and the existing context-sensitive refinement defaults (1024 from a World, 256 from a regional context, initially a bounded physical area). These unchanged shipped defaults are distinct from the proposed future capacity and from device rendering quality. The numerical kernels used for the feasibility measurements remain byte-exact in the final A2 source; later presentation corrections do not convert those diagnostics into native larger-grid support.
