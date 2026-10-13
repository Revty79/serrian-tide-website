# Phase 6 Living History integration assessment

Pre-change inspection: approved `81098e07cd7227db80aff5659e3a86b45bfda8d0`, clean checkout, matching local/remote checkpoint. The owner confirms independent technical approval of 6B-A through 6B-D. This final pass is integration, repair and acceptance; no push, deployment, shared databases/services or Phase 7 is authorized.

| Existing capability | Implementation and acceptance boundary |
| --- | --- |
| Generic historical maps | Immutable map-state identity/version/head, inclusive canonical years, local geometry/place accounts, explicit unknown gaps and original Map Maker |
| Historical settlements | Same map/place/building identities, independently authored presence/destruction/rebuilding conditions and original Settlement Editor/renderer |
| Political geography | Immutable territorial/boundary identities, competing claims separate from control, exact political and History pins with original dating context |
| Historical connections | Separate immutable connection accounts, explicit dated destination choices, exact baseline capture, bounded cross-map findings and same-year navigation |
| Source comparison | Two deliberate sources of one map across years/timelines/revisions, original renderers and political/History readers; no reconciliation |
| Branching | Explicit selected direct-parent retention, independent interpretations, immutable parent/sibling sources and current/pinned protection |
| History and geographic evidence | Atlas place milestones and entity links relate events to stable places; territory accounts deliberately cite exact events or eras. No event narrative changes artwork automatically |
| Calendar and Chronology | Exact original rules/day anchors and reckoning revisions stay attached to History/lore sources. Display conversion is separate from canonical map periods, account/relationship dates, settlement conditions and actual save timestamps |
| Phase 6A stories | Existing lore identities and exact original story sources, independent telling/alleged-event dates, competing accounts and protected dependency filtering |
| Realms, interiors and dungeons | Shared map identities and saved connections remain usable; historical generic/settlement links can lead to these charts while retaining a requested year. Interior/dungeon artwork has shared baseline coverage only; dated construction is deliberately deferred |
| Privacy and recovery | Existing server-filtered map/source projections, owner authorization, read-only review, exact request contexts, optimistic versions and retained drafts |

Confirmed integration defects before repair:

- The shared ordinary-preview helper recognizes both aliases, but World/History/Calendar/lore/sky client entry points and several source APIs still parse only one. An Atlas ordinary URL can therefore lose its privacy context across workspace boundaries. Those relevant boundaries will reuse the existing helper. Preview-qualified writes must be rejected consistently at the common Worlds HTTP boundary, preserving legitimate unqualified owner authorization.
- Realm-to-map navigation reconstructs its URL without `mapYear`, dropping the selected historical date. Linked map navigation must carry that date with timeline/review/knowledge context.
- Historical editor comparison/connection entry points use a truthiness fallback for the displayed year. Year zero can incorrectly become the selected appearance's beginning year. Zero must remain an explicit year.
- Historical destination resolution checks archived maps, but its explicit preference path does not consistently check archived geographic subjects/arrivals. Verify this with real persisted sources and suppress unavailable destinations while retaining their original accounts.

The retained desktop/phone evidence also shows that explicit map opening leaves the workshop below the large World introduction. Bring an explicitly opened map workshop into view without moving keyboard focus, changing controls or adding the future docked toolbar. Use the shared navigation-height variable to keep the workshop heading visible below the sticky navigation. Use the shared navigation-height variable to keep the workshop heading visible below the sticky navigation.

The integrated source API matrix additionally reproduced a pinned-story ordinary-read SQL error: a correlated lore-version column was shadowed inside the recursive privacy graph, making an identity subquery return multiple rows. Bind the already selected exact version instead; preserve all graph protection decisions and source pins.

These are focused integration repairs; no persistence redesign or new migration is planned. Test a new substantial World in a clone of completed 6B-D evidence: three historical periods, multiple regions and connected settlements, political claims, exact History/Calendar/Chronology/story sources, a Realm, linked floor/dungeon maps and deliberately retained alternate interpretations. Preserve all pre-existing records and evidence. New tests cover the integrated authoring journey, alias/context boundaries, dates and original-source readers, temporal destinations, archive/retry/conflicts, desktop/phone/native touch/keyboard and actual privacy failures. Reuse unchanged 6A–6B-D tests and exact fresh/populated migration evidence; omit unrelated platform suites and Phase 9.

Historical interiors/dungeons need no new construction project to retain identity, ownership, connections or requested time context. They do not currently author dated room/layout changes. Such changes require a separately approved pass extending exact source/condition rules and workshop/renderer adapters; they are not a prerequisite for this scoped Phase 6 foundation. The final report will distinguish baseline references from established dated artwork and record human review items.

Future compatibility assessment: existing stable World/map/place identities, independent territory/connection versions and same-World references support later country/region/city links and fantasy shapes. Atlas-v1 coordinates are bounded drawing positions, not latitude/longitude or a geographic projection. A later modern-Earth importer must retain authoritative geodetic source/CRS and provider/version identity, then derive display geometry without reassigning current identities. Detailed country outlines and global datasets exceed current bounded full-snapshot/World-library reads: progressive loading, levels of detail, geometry storage/version pagination and import provenance belong to that later pass. Preserve original data and exact pins when introducing those adapters. Browser rendering currently uses SVG and browser terrain caching without a server GPU; no future renderer or Earth dataset is being introduced here.

Completion evidence and the supported/deferred scope recommendation are recorded in the [final integration report](../reports/worlds-living-history-final-2026-10-13.md). Independent technical review and owner visual acceptance remain separate from the executed checks.

Completion evidence and the supported/deferred scope recommendation are recorded in the [final integration report](../reports/worlds-living-history-final-2026-10-13.md). Independent technical review and owner visual acceptance remain separate from the executed checks.
