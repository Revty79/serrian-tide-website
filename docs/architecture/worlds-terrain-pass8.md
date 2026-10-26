# Atlas Pass 8: described geographic intent

Authorized checkpoint: `3900117725bea42113a9841a0c5122152ae523d7`. Complete P8-A through P8-E in the main checkout and publish through the owner's `origin/main` workflow. Preserve Passes 1-7, all original sources/identities/private objects and the disabled legacy geographic HTTP boundary. No shared database writes, deployment, Ubuntu, Studio, Town Maps, interiors, dungeons or Stage 3 simulation.

The initial audit found a clean main checkout. A read-only transaction positively verified localhost `serrian_tide_dev`, role `serrian_tide_app`, 139 applied ledger entries through 0138, with published 0137/0138 hashes matching. Production was not contacted. Existing source JSONB accepts generated/regenerated provenance independently of recipe version; no additional table or migration is presently necessary. Verify this with disposable persistence and upgrade tests before delivery.

Use a bounded, deterministic local interpreter with explicit geographic entities, quantities, directional references, dimensions and uncertainty. Preserve unsupported/unresolved clauses for creator decisions. No external AI credentials or subscription. The editable confirmed plan, original description, decisions, seed and generator version accompany accepted numerical samples; prose is not generation authority.

Introduce a separate v3 authored-layout recipe without modifying v1/v2 algorithms. Features occupy physical metre coordinates in the original World frame, with optional parent/between constraints. Sparse raster work uses bounded spatial candidates. Land, connected ranges, plains/uplands, valleys/basins and carved bays affect real elevations. Count/placement/size remain authored while another seed varies coastlines and local relief. Explicit warnings retain undersampled or cropped dimensions rather than enlarging them.

Integrate into the existing creation and selected-regeneration workshop, using one persistent map-first preview with an independently scrolling dismissible inspector. Keep blank, preset and PNG paths, shared units/relief, manual Touch Controls and explicit acceptance. Refined work uses the selected area, original World frame, existing blocked/manual masks, optimistic revision, undo, autosave and recovery.

Deliver language/generator/domain tests, deterministic numerical placement proof, the supplied three-continent and 20 km refinement journeys, GPU-disabled desktop/tablet/phone screenshots, interrupted request/recovery checks, full retained regression chain, type/lint/build/unit and fresh/populated/restore migration verification. Record Stage 2 technical completion separately from independent review and owner acceptance. No Stage 3 work follows automatically.

## Language contract

The interpreter is local and deterministic. It supports multiple continents, individual islands, counted island groups, chains, clusters and scattered groups; compass positions, centre/interior, western/eastern sides, parent landmass and between-landmass relationships; relative sizes; explicit physical sizes; mountain ranges and their orientation, plains/lowlands, highlands, plateaus, valleys, depressions and sheltered bays. Numeric dimensions accept metres, kilometres, miles, feet and yards. Height/depth instructions and a quoted seed are supported. General moderate/taller/flat/rugged language adjusts explicit height or roughness settings.

The entire supplied three-continent example and the introductory variant with "Put one in the northwest, a larger one in the east" resolve into distinct entities rather than repeated global parameters. The supplied local island example resolves within the selected original World frame. A later reference to a landmass modifies the referenced entity instead of duplicating it. Directional references, counts and context use a bounded English grammar; this is not an unrestricted language model.

Unknown clauses, contradictory counts, unclear subjects and unsupported concepts remain visible. Before generation the creator must choose a supported subject, correct/edit the plan, or explicitly omit the affected instruction. Decisions accompany the accepted recipe. Climate, vegetation, flowing rivers, exact named silhouettes and settlement/gameplay creation are unsupported. No API key, remote AI service or additional subscription is used.

Descriptions are limited to 12,000 characters; plans to 48 features, 24 islands per group and 256 expanded landforms. Interpretation is a proposal. Every feature has editable name, location, dimensions, angle, elevation and relevant variation settings. Independent landmasses may anchor modifiers or a between relationship. Removing an anchor explicitly detaches dependent features at their existing physical position. These are recipe-local identities, not new World/Town/geography database records.

## Structured plan and numerical authority

The exact strict schemas are in `terrain-source.ts` and `terrain-intent.ts`. This projection illustrates the representation (all coordinates and lengths are metres):

```ts
type GeographicPlan = {
  space: { x: number; y: number; width: number; height: number; periodX: number | null };
  area: { x: number; y: number; width: number; height: number };
  features: {
    id: string; name: string; kind: string;
    x: number; y: number; width: number; height: number; angle: number;
    elevation: number; ruggedness: number; coastline: number;
    count: number; islandWidth: number; distribution: "chain" | "cluster" | "scattered";
    reference: null
      | { kind: "parent"; id: string; east: number; south: number }
      | { kind: "between"; ids: [string, string] };
  }[];
};
```

`world-heightmap-v3` retains the physical recipe envelope, seed, original description, interpretation notes, explicit issue decisions, confirmation and geographic plan. Absolute anchors use original World coordinates; referenced features use metre offsets from the chosen relationship. Relative side offsets use the parent width/height. World wrapping uses the original root period. Server admission verifies the exact active frame and selected numerical area, feature height limits, explicit issue resolution, confirmation and representation acknowledgement.

V3 compiles landmasses and groups into spatial tile candidates. Seeded coast fields create actual above/below-sea samples; connected oriented range fields raise land, lowlands/plateaus reshape it, and valleys/depressions/bays lower it. Bays are applied last. Group distribution changes actual island locations. Seed variation changes coasts and small relief while preserving the explicit plan anchors and physical dimensions. It does not infer political or World records.

V1/V2 generator implementations and shared physical noise remain unchanged. Numerical samples and their immutable saved versions remain authoritative after acceptance. Reopening reads those samples; it does not reinterpret prose or regenerate terrain. A current manual-save source does not erase the retained original source or earlier regeneration provenance.

Feature sizes are never expanded to fill a large World. Cropped or poorly sampled features produce explicit warnings and require acknowledgement. Fine work uses the existing sparse refinements, inherited collar, manual/child masks and exact revision checks. Fractional measurements do not invent sub-metre elevation data or new samples. At close zoom the renderer shows genuine sample cells; lower-resolution overviews are labelled.

## Interface and persistence boundaries

Describe/plan/size/preview share one canvas. The inspector scrolls independently and can be dismissed, including on phone/tablet. Changing physical World dimensions reinitializes the viewport geometry while retaining the canvas element; switching inspector sections or varying a seed retains its pose. Normal units, ruler/grid/relief controls and explicit Touch Controls remain available. Fingers navigate by default; feature placement or measurement requires fresh explicit arming. Pen input is independent.

Unaccepted prose/plan drafts have scoped browser recovery. Pending acceptance retains the original request and numerical payload through the existing IndexedDB recovery path. Preview/cancel does not create a map or revision. An accepted response lost in transit retries the same request identity. Fine acceptance checks its actual tile-batch head response before deciding whether a competing revision requires reloading, preserving ordinary in-memory undo when the accepted head is unchanged.

No schema migration or new configuration is required for V3. Existing generated/regenerated JSONB provenance can hold the versioned structured recipe. Shared DEV received only a read-only identity/ledger check; tests use freshly owned loopback databases, private-object directories and a source-matching production validation copy. Production remains independently unverified and untouched.
