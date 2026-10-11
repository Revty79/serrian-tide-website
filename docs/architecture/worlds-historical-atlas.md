# Phase 4A-H: historical Atlas and History index

Starting checkpoint: `eac5ae19e17bd0801d6d03f8d12a581e86687b5f`. This extends the existing [peoples](worlds-peoples.md) and [societies](worlds-societies.md) historical contract. It introduces no competing event store, World-state simulation or gameplay integration.

## Authority and presentation

The existing `world_historical_entry` identity and Bridge A `world_history_version` payload remain authoritative. `world_history_version_entity` retains same-World, version-bound participant links and original roles. Manual events can now have an optional custom event type without needing an entity link. Existing linked event roles remain available for filtering and are not conflated with that event's own type.

Prominence is standard, featured or index-only. Primary entries store its current value; immutable payloads pin it in every timeline. Old payloads without the property mean standard and are not rewritten. Editing presentation appends a source against the same event, preserving dates, accounts and other entity links. Alternatives can interpret prominence locally without altering their parents. Index-only is neither a permission nor a reliability classification; the searchable index and entity readers retain the account.

## Atlas authoring

`atlas-milestone-service` reuses the World owner lock, canonical History save transaction and existing entity bindings. It validates the actual saved geography revision, selected timeline, event head revision and current geography binding. Corrections preserve every other participant. It never writes dates into place metadata or map source. A place may have many accounts, including independent discoveries. Discovery, creation, founding and first settlement remain authored types, not inferred facts.

Atlas record editors, saved-feature inspectors, settlement/interior/dungeon workshops and Explore expose the shared place milestone dialog. Creation can explicitly open it after the place save succeeds. The dialog states that place/map and History saves are separate. It retains failed drafts, provides explicit conflict reload and distinguishes an acknowledged save from failed readback. Unsaved map edits stay in their original editor. Only stable `world_geography` identities are eligible; decorative strokes and non-geographic furnishings do not gain fabricated identities. Existing floors, levels, districts, streets, buildings and meaningful geographic landmarks use their established IDs.

Create receipts make acknowledged retries idempotent. `world_atlas_milestone_receipt` stores only the request hash and references to the actual World/timeline/place/event. It is not an alternate historical source. Events and source content remain in canonical History. A place supports 100 retained milestones, including archived accounts.

## Search and navigation

The History GET endpoint searches selected effective heads, never replacing a branch's pins with current parent events. Text searches titles, full accounts, authorized notes and bounded linked-name metadata. A full-text GIN index supplements existing World/head/category/type/target indexes; literal substring and entity-name matching remain supported. Ordinary queries exclude protected events, notes and linked identities before search, facet discovery and serialization. Related names load through one metadata relation, not recursively or by one query per entity.

Filters cover entity category, custom event type/relationship, explicit era membership, accuracy, recorded/planned status, date precision, archived accounts and canonical inclusive date bounds. Known dates match their year; durations and occurrence windows match overlap. Approximation uses only its authored anchor and retains its uncertainty; no tolerance is invented. Undated accounts match no numeric range. Negative years and Year 0 remain valid. Unlinked accounts have a dedicated category option.

Both views consume the same matching index. Category show/hide controls are URL view state and never mutate history. A multi-category event stays visible if one linked category is shown. Index-only accounts are included in the list and omitted from the Overview preview; main timeline markers require an explicit inclusion option. Results are unique per event. Up to the existing 5,000 retained records are supported; metadata returns at most 300 account characters per entry, and the list reveals 40 at a time. Complete reading uses a separate, authorized chosen-source query. Existing visual groups, era bands, pan/zoom, year jump, touch and keyboard controls remain intact; large visual-group caps keep their existing focus/list guidance.

URLs preserve World, timeline, filters and event identity. Readers link individually to all eligible participants. Atlas places provide available map choices, including native feature/drawing representations; several charts of one place create no new event. Back/Forward and reload use the URL's selected source. Ordinary full-account and entity-link requests retain the same server projection.

## Branches, lifecycle and release

Bridge A continues to pin versions and apply conservative divergence rules. Parent sources added after branching appear as unadopted source-review items. Adoption validates branch and parent revisions/version, inserts a pin, and reapplies divergence handling; future/uncertain sources still require an inclusion decision. Parent edits never update child or nested accounts silently.

Archive/restore retains source identity and relationships. Existing Atlas rules continue to refuse archiving a geography still required by maps or children. Archived World/timeline/place historical authoring is refused; authorized reading and explicit read-only Administrator review remain available. Campaign membership supplies no World access.

Migration 0116 follows all committed predecessors through 0115. It adds current event type/prominence, compatible defaults, source presentation validation, the search index and receipt FKs. Old source payloads, native maps and all prior migrations remain unchanged. No new User FK or environment service is required. Verify the actual server target, ledger and recoverable backup before authorized activation; DEV and Production were not checked or written here. Reverting code does not reverse the migration. Older writers may drop branch presentation and historical type metadata; pause incompatible Worlds writers during recovery, retain source/receipt/ledger data and prefer a reviewed forward fix or a verified restore with later-write reconciliation.

Phase 4B and living historical geography remain future work. Future creators reuse canonical History and its versioned bindings rather than inventing another timeline integration.
