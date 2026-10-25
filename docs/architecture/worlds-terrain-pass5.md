# Atlas Pass 5: physical geography and relief

Authorized starting checkpoint: `f1b446a7eafcb88222b44fe210f1dd56d927fda3`. Preserve the full Pass 1–4 numerical editor, expanded workspace, manual tools, original recipes, immutable history, autosave/recovery, private tiles and World/map/Town relationships. No Studio, local maps, climate/river/erosion simulation, new cartographic palette, adaptive refinement or later Stage 2 workflow.

## Versioned generation

Retain world-heightmap-v1 parsing, exact numerical output and original metadata. Dispatch the existing generation entry point by recipe version; new creations default to world-heightmap-v2. V2 extends the same six presets with Familiar, Grand Fantasy, Colossal and Custom starting dimensions. All physical lengths use kilometres and all saved heights remain integer metres.

V2 specifies continent/island span, separation, coastline scale, range length/width/spacing, intended peak/lowland/highland heights and ocean depth independently of the saved height bounds. Bounds remain safety limits, never a multiplier for intended heights. Work in equal physical X/Y distances even when world and sample-grid aspect ratios differ. Use periodic horizontal fields/distances on wrapped worlds and fixed north/south boundaries.

Physical sizes/counts control V2. Preferred land coverage is compared with achieved coverage; no quantile threshold expands features to satisfy it. Report conflicts and offer deliberate changes to count, dimensions, coverage preference or extent. Keep choices unchanged until the creator acts. Under-resolved or clipped features require a visible limitation acknowledgement before acceptance; keep the accepted acknowledgement with source provenance. No visual interpolation or zoom claims extra numerical samples.

Use irregular coherent land envelopes and connected curved range fields, with physical coastline/highland transitions. Spatial bins and bounded feature/range counts keep work tied to the numerical grid and explicit feature counts rather than world extent. A larger world with the same physical features must not generate unbounded additional work. Preserve the 1024-per-axis limit.

## Relief

Keep the original palette and exact Classic shading. Add normals from metre elevations divided by independent metre sample spacings, with periodic east/west and one-sided fixed-edge derivatives. Natural/Enhanced/Dramatic/Custom exaggeration modifies display only. Existing maps default to Classic; new V2 previews may use enhanced physical relief. Browser view preferences never enter numerical save commands, recipes or revision history. Reuse per-tile redraw and the same renderer/canvas; selected-area and source previews should retain the chosen relief.

## Persistence and verification

Existing JSONB provenance can retain the versioned recipe and explicit scale acknowledgement without new columns. No migration is planned; verify the DEV ledger read-only and preserve applied migrations through 0136. Validate legacy hashes, V2 determinism, comparable 5,000 km landforms on 10,000/40,000 km maps, rectangular grids, independent height intent, million-kilometre worlds, deliberate colossal geography, conflicts and warnings. Verify physical slope/Classic compatibility, appearance-only controls, bounded memory/generation/redraw, all Pass 4 tools and existing World/Town/Shop/Tabletop/privacy regressions.

Use owned disposable databases and GPU-disabled desktop/touch browser acceptance. Preserve all original source and actual numeric records, inspect screenshots personally, complete root TypeScript/lint/tests/build, publish under the owner's authorized workflow and stop with a review handoff. No Production/Ubuntu contact, deployment, shared-service restart or later pass is authorized.
