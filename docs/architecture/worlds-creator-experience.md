# Worlds creator workshop standard — approved A2/B, Repair C

The owner accepted the Individual and Cosmic Principle pilots after A2 technical review and a hands-on look-and-feel review at `98c4eafe1a0f68445a867445aef7dcad62f5c49c`, and approved Repair B `683cee206fbd4488d7ab0b570c52f6364fb62f6c` as the starting standard for C. Repair C is separately authorized for eight political creators. Its independent technical review and human experience acceptance remain pending. The complete [coverage inventory](worlds-creator-coverage.md) assigns every existing field and subordinate form a destination. Later passes require separate authorization.

## Shared workshop behavior

Use `CreatorWorkshop` as the responsive native modal shell. Keep a subject title and short concept introduction above named section buttons. Sections are freely selectable, never mandatory wizard steps. Keep save and cancel in the footer while the central content scrolls. Draft state belongs to the editor, survives section and preview changes, and is never replaced by a suggestion. Fit viewport width, dynamic height, zoom and software keyboard height; preserve keyboard navigation, native modal focus containment, opener focus restoration and 44px touch actions. Do not convert the existing Calendar editor to this component merely for uniformity.

The owner controls the form, validation and save boundaries. Use `noValidate` with whole-draft domain validation so invalid inactive fields cannot block native submission with an unreachable focus error. Route each error by its technical draft path (never by a display-label string) to its section and accessible field, open secondary disclosures around it, focus the input and show an actionable error. Keep drafts after validation, HTTP errors or a stale revision. Loading the latest record requires an explicit discard decision. Creation retries retain the request UUID; edits retain the existing revision until reloaded. Close and Escape offer to keep or discard dirty drafts.

## Subject-specific composition and guidance

An Individual describes a person or original being, not a mechanical Character. Identity, personality, background, communities, places, History, original details and privacy keep all existing field depth. A Cosmic Principle describes a rule of reality: statement, scope, circumstances, historical periods, exceptions, competing accounts, History and privacy. Its summary is independently optional; do not demand duplicate text.

Use `Field` / `GuidedField` and the shared semantic theme. Explain the subject before its fields. Essential meaning and optionality must be visible; use question-mark help for entry advice, examples and actual limits. Help is specific to the subject and field, works with touch and keyboard, and does not dirty the draft. Preserve useful terminology but explain it. Fictional examples are illustrative prose, never prefilled or saved facts. Do not use IDs as the primary help for a fictional name. A preview uses only actual draft data and authorized saved references, marks private author context and leaves unknown facts unknown.

## Existing information, related creation and save guarantees

Offer existing saved identities with enough context to distinguish names. Use selected World/timeline stable IDs and server-filtered choices. Keep narrative context alongside links; never parse old prose into guessed links or erase it after selection. Permit undecided or unresolved accounts according to the actual domain rules. Cosmic relationships require saved identities; uncertain scope belongs in its narrative field.

Read or create related World-native records in one controlled subview, preserving the parent draft and a clear return path. A separate related save is permanent even if the parent is cancelled: explain that boundary before and after saving. Never imply atomicity or create placeholders from typed names. Related Individual, Cosmic Principle and Repair B creations use their full subject composition inside the single modal. Missing connections in a related editor can be developed after that record is saved; do not stack nested creation modals. Related C–F creations retain the bounded name, optional introduction and visibility form where supported; their full standalone editors remain available. A failed choices refresh retains the separately saved ID and offers a read-only refresh retry; never repeat the create command to refresh choices. No mechanical Race/Creature/Character/NPC creation or gameplay effects are introduced.

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

The user approved the direction of the Cosmic Principle workshop, requested refinement throughout A2 and has now accepted A2 and the B starting checkpoint. The agreed sequence is B (Peoples/societies/origins/personal relationships), C (politics), D (organizations), E (remaining cosmology), F (Living Skies), G (integrated Phase 4–5 acceptance), H (History/Chronology/Calendars usability), I (Atlas/Map Maker usability/layout), a small Realm-to-Map linking bridge, then Phases 6–8 and final Worlds acceptance. Only C is currently authorized. The existing inventory tracks all six completion dimensions for every main creator and supporting form.

Repair A, [A2 evidence and walkthrough](../reports/worlds-creator-repair-a2-2026-10-11.md) and the B report remain historical receipts. Technical acceptance does not replace the owner's separate experience review of Repair C. Stop after the C checkpoint.

## Repair B composition and retained requirements

Races/species explain existence, propagation, traits and variations without requiring physical biology. Peoples separate shared identity, heritage and ways of life. Cultures separate belonging, customs, expression and exchange. Civilizations keep multiple founding accounts, institutions, accomplishments and renewal. Languages allow nonverbal communication and optional writing. Communities describe uncertain numbers and movement. Beliefs attribute ideas and competing interpretations; traditions distinguish practice, meaning, transmission and versions.

Origins retain their existing requirements: a written account and at least one real saved subject whose connection means subject. Attributed creators and sources may remain unresolved. Personal relationships retain their required meaning and at least two participants, including unresolved accounts where permitted. Their periods preserve authored status, independent endpoints, perspectives, privacy, order and identity. A missing ending never implies an ongoing relationship. Other B creators begin with a name alone.

Use the existing family-specific protection capabilities. B does not introduce per-field protection or historical-name storage into families that never supported them. Whole identities, connections, places, relationship periods, custom details, events and private notes keep their established privacy rules. Original name histories can remain in authored text or original details. No saved value or optional capability is removed.

## Repair C political workshops

Polities distinguish identity, foundations and continuity; governments separate authority, decisions, leadership, public resources and reform. Institutions describe purpose, powers, structure and change; offices distinguish the position from its holders. Appointments keep selection, claimed recognition, succession and sources. Claims distinguish assertion from actual administration. Agreements separate terms, obligations, acceptance and competing interpretations. Conflicts keep changing coalitions, developments and uncertain outcomes without requiring warfare or a victor.

All eight can start with a name. Added connections in appointments, claims, agreements and conflicts require actual saved identities; uncertain participants stay in narrative fields. No officeholder, governing structure, border or event is inferred from prose. Political periods retain authored status, independent beginnings/endings, attributed accounts, order, protection and stable IDs. Status does not decide certainty or actual control. All political typed fields retain their existing protection controls.

Political related creations use their complete subject workshop inside the existing single modal. Real related saves remain saved if the parent is cancelled. Existing saved references, read/return, safe choices refresh, canonical History, exact cited versions, calendar notation, archive/restore and alternate interpretations retain the approved guarantees. Later D-F related creations keep their current bounded forms.

Validate creator repairs with targeted TypeScript/lint/domain checks, all affected families' saved-data round trips, supporting forms, privacy/roles/branches and representative desktop/touch layouts. Run a focused production/browser acceptance cycle before completion and representative A2/B journeys after shared workshop changes. Defer the 2,000+ feature suite, complete disposable application integration and account/gameplay suites to the planned post-D checkpoint unless actual domain/security/persistence/migration/History changes create concrete wider regression risks. A harness failure requires its actual correction and the affected checks, not automatic unrelated full-suite reruns. Report deferred checks explicitly.
