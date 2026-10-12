# Worlds creator workshop standard — provisional Repair A / A2

This design remains provisional until the user reviews the Individual and Cosmic Principle pilots. Do not roll it across other creators automatically. The complete [coverage inventory](worlds-creator-coverage.md) assigns every existing field and subordinate form a destination; proposed Repairs B–G require separate authorization.

## Shared workshop behavior

Use `CreatorWorkshop` as the responsive native modal shell. Keep a subject title and short concept introduction above named section buttons. Sections are freely selectable, never mandatory wizard steps. Keep save and cancel in the footer while the central content scrolls. Draft state belongs to the editor, survives section and preview changes, and is never replaced by a suggestion. Fit viewport width, dynamic height, zoom and software keyboard height; preserve keyboard navigation, native modal focus containment, opener focus restoration and 44px touch actions. Do not convert the existing Calendar editor to this component merely for uniformity.

The owner controls the form, validation and save boundaries. Use `noValidate` with whole-draft domain validation so invalid inactive fields cannot block native submission with an unreachable focus error. Route each error by its technical draft path (never by a display-label string) to its section and accessible field, open secondary disclosures around it, focus the input and show an actionable error. Keep drafts after validation, HTTP errors or a stale revision. Loading the latest record requires an explicit discard decision. Creation retries retain the request UUID; edits retain the existing revision until reloaded. Close and Escape offer to keep or discard dirty drafts.

## Subject-specific composition and guidance

An Individual describes a person or original being, not a mechanical Character. Identity, personality, background, communities, places, History, original details and privacy keep all existing field depth. A Cosmic Principle describes a rule of reality: statement, scope, circumstances, historical periods, exceptions, competing accounts, History and privacy. Its summary is independently optional; do not demand duplicate text.

Use `Field` / `GuidedField` and the shared semantic theme. Explain the subject before its fields. Essential meaning and optionality must be visible; use question-mark help for entry advice, examples and actual limits. Help is specific to the subject and field, works with touch and keyboard, and does not dirty the draft. Preserve useful terminology but explain it. Fictional examples are illustrative prose, never prefilled or saved facts. Do not use IDs as the primary help for a fictional name. A preview uses only actual draft data and authorized saved references, marks private author context and leaves unknown facts unknown.

## Existing information, related creation and save guarantees

Offer existing saved identities with enough context to distinguish names. Use selected World/timeline stable IDs and server-filtered choices. Keep narrative context alongside links; never parse old prose into guessed links or erase it after selection. Permit undecided or unresolved accounts according to the actual domain rules. Cosmic relationships require saved identities; uncertain scope belongs in its narrative field.

Read or create related World-native records in one controlled subview, preserving the parent draft and a clear return path. A separate related save is permanent even if the parent is cancelled: explain that boundary before and after saving. Never imply atomicity or create placeholders from typed names. Related Individual and Cosmic Principle creation uses the same pilot composition inside the single modal. Non-pilot related creations use a bounded name, optional introduction and visibility form backed by real domain saves; the full standalone editor remains available after saving. Their complete redesign belongs to B–F. A failed choices refresh retains the separately saved ID and offers a read-only refresh retry; never repeat the create command to refresh choices. No nested modal stack, mechanical Race/Creature/Character/NPC creation or gameplay effects are introduced.

## Historical and security invariants

Use worldbuilder questions for historical periods: “Give this period a name”, “How did the rule work during this time?” and “Who describes it this way?”. Provide examples such as Before the Second Moon Shattered as help, without saving those examples. Conditions describe triggers; periods describe stretches of history; events describe things that happened. State (active, dormant or original wording) differs from certainty. Unknown endpoints never imply an active rule, and overlapping or contradictory accounts remain independent.

Keep canonical History authoritative. Connecting a current event makes the creation part of its account; citing a version retains that particular evidence without adding a participant. Label current event reading and retained cited-version reading separately. Reuse existing events/eras and retain exact version pins; correcting a saved milestone updates the same event. Its event date is entered once. Account dates, relationship periods and event dates retain their distinct meanings, including unknown endpoints and disputed perspectives. Every hidden/advanced source field, name, section, participant, place, calendar notation, period and protected value survives unrelated edits.

Selected alternate timelines, immutable versions, provenance, source decisions, archive/restore, idempotency and stale-edit protection remain server controlled. Ordinary knowledge and explicit read-only Administrator review use the existing filtered endpoints and saved detail view; no workshop writes are available there. Draft previews and related reads are available only through authorized author editing. Never reveal protected identities via counts, suggestions or reverse links. Worlds stays standalone narrative authoring; no Heavens, combat, Campaign clock or VTT behavior changes.

## Acceptance checklist

- [ ] Every saved field and subordinate form has an explicit inventory destination.
- [ ] Name-only creation works for each pilot; no biography, ancestry or rule statement is required.
- [ ] A rich existing record survives editing each section; compare every persisted field, relationship and History reference before/after.
- [ ] Reuse existing Races/cultures/languages/people/realms/bodies/Atlas places without duplicates.
- [ ] Create a missing related record, return to the parent, read it and return again; verify both save boundaries.
- [ ] Link existing History; correct a saved milestone while retaining its event ID and untouched source metadata.
- [ ] Switch sections/preview, open help, fail a save, and encounter a real two-tab conflict without losing drafts.
- [ ] Submit an invalid inactive field; the correct section and control become reachable and focused.
- [ ] Save/reload/archive/restore, and create a local alternate interpretation without changing Primary.
- [ ] Verify ordinary responses omit private data; explicit Administrator review stays read-only; other users cannot read or write.
- [ ] Exercise actual desktop, native-touch phone, small height and zoom; footer stays reachable and content fits.
- [ ] Execute full relevant Worlds disposable migration/service/authorization/browser regressions, unit/gameplay regressions, account lifecycle, production build, TypeScript, lint and migration consistency. Record actual results and limitations.
- [ ] Human review: can the creator explain each pilot's task, find relevant existing information, express unusual cases naturally and understand what saves separately? Automated wording/coverage checks cannot prove this.

The user approved the direction of the Cosmic Principle workshop but requested further refinement before wider rollout. Repair A was delivered provisionally. The agreed sequence is A2 (pilots throughout), B (Peoples/societies/personal relationships), C (politics), D (organizations), E (remaining 5A cosmology), F (5B skies/calendar connections), G (complete-world acceptance). The existing inventory tracks all six completion dimensions for every main creator and supporting form.

Repair A and [A2 evidence and walkthrough](../reports/worlds-creator-repair-a2-2026-10-11.md) are recorded separately. Technical acceptance does not replace the user's experience review. Stop before Repair B or Phase 6.
