# Atlas requirements after clean DEV recovery

Owner brief: updated recovery assignment dated 2026-11-09, attachment `6b2f0026-3b48-46a3-b75a-995dd5607b0f`. These are mandatory subsequent milestones. This document records the handoff; it does not claim implementation or authorize live home-server/Production changes during recovery. Complete the real recovery and report its result before starting feature work. Do not rebuild Earth during recovery.

Earth is a practical acceptance test for Atlas: an ordinary creator must be able to build a convincing, editable world using the product's visible tools. A result produced by imported geographic geometry, machine-prepared coordinate lists or long automated editing sequences does not establish human usability. Preserve the useful Atlas implementations; improve their discovery, operation, guidance and output quality.

## A. Human authoring and keyboard precision

Provide a discoverable **Keyboard Sculpting Mode** with an obvious active/inactive state and visible instructions. Keep a persistent precision cursor and brush footprint. Arrow keys move at the actual selected numerical source resolution, with configurable fine/coarse increments. Support deliberate single brush stamps and controlled continuous strokes through the existing native terrain engine.

Provide exact World-frame positioning with readable physical units and appropriate geographic coordinates where supported. Integrate keyboard selection and precise movement of polygon vertices and other control points. Handle zoom/pan, World wrapping, polar edges and regional refinements consistently. Mouse, keyboard and touch must share the same authoritative brushes, selections, previews, protections, editing leases, undo/redo, recovery and saving. Do not introduce a second keyboard terrain engine. Form typing, content editing and existing navigation shortcuts must never cause accidental terrain changes.

Make major tasks easy to find: shaping land/coasts, polygon selection, elevation, mountains/valleys, rivers/lakes, environment, painting and region creation. Use clear labels, meaningful groups, contextual instructions and obvious next actions. Explain what gesture to perform, what it changes, how to inspect the result, when it is saved and how to reverse it. Existing hover text and a collection of advanced panels are not evidence that a new creator can complete a task.

Acceptance requires realistic visible workflows: locate a tool without repository knowledge, understand it, create terrain using ordinary controls, preview, accept/save, leave and return with editability intact. Include keyboard-only work, normal mouse work, touch/focus safety, protection/lease refusal, interrupted saves and recovery. Use newly owned, source-safe test content; preserve the recovered DEV baseline. Technical automation provides evidence, while owner usability acceptance remains explicit.

## B. Highest sustainable CPU graphics quality

Evaluate higher practical terrain resolution, progressive regional/local detail, smooth transitions between levels, close-zoom blockiness, coastline/water/elevation rendering and adjustable quality settings. Reuse efficient tiled processing, bounded caches and workers, with ordinary computers and no dedicated graphics card as a primary target.

Optimize for the highest quality the machine can sustain. Do not equate lowest resource use with success, blindly increase global memory, misrepresent interpolated rendering as new numerical detail, or break saved geography compatibility. Benchmark representative World, regional and close views with matched content and styles. Report CPU/memory/latency/quality tradeoffs and retain failed or interrupted evidence. Technical measurements and screenshots do not substitute for owner visual approval.

## C. Enforceable commercial-source safety

Implement source-rights review and complete attribution in the actual product, using the [permanent source policy](external-source-licensing-policy.md) and [licensing inventory](project-earth-licensing-inventory.md). Author-supplied license strings and documentation-only holds are insufficient enforcement.

For rebuilt Earth, do not import finished external geographic geometry, ODbL-derived/questionable content, paid-license data or unapproved restricted material. Reliable research is encouraged, with verified rights before copying or tracing protected geometry, imagery or structured datasets. Create permanent geography through genuine human-accessible Atlas editing tools. Keep provenance truthful; “Built by Revty79” remains distinct from external-provider credits. Required notices must reach saved records, applicable views, history/copies and every relevant digital/printed output. No credit can cure incompatible permission.

The old Earth, its restricted recovery point and unresolved licensing evidence remain preserved and inactive. A clean database does not retroactively clear that material or establish that the current application's licensing enforcement is complete.

## D. Actual Ubuntu deployment repair

Investigate the existing update/build process and correct local Docker-file Git conflicts, excessive/unreliable build memory, Docker context and memory handling, startup/maintenance-mode behavior, container replacement, health checks, persistent database/private-storage configuration, authentication/origins and rollback after failure.

Deliver a repeatable operator workflow that keeps the application on **host port 3003** and preserves all other home-server services. Preserve owner configuration and data; separate the actual cause of each failure from assumptions or synthetic success. Verify the real operating workflow under separately authorized server access. Do not touch the live home server or Production during the Windows clean DEV recovery.

## Handoff boundary

Keep main-only source history, all accepted Atlas improvements and all original game data. Do not lower the Earth acceptance standard to fit inconvenient tools, replace human workflows with data imports, or call a milestone complete from passing software CI alone. Record actual implementation, tests, limitations, owner acceptance and the next authorized boundary separately. Begin rebuilding Earth only after the necessary tool, quality and commercial-source safeguards have passed their review.
