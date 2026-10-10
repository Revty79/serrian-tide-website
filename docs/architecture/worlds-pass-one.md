# Worlds Creator: Pass 1

## Design and boundaries

The registry is a gallery with search, active/archive views, focused creation, and a separate administrator review view. A selected world has a compact switcher, Overview and History. Overview emphasizes the introduction, history preview and recently written accounts. History combines era bands, selectable entries, a chronological reading view and contextual native-dialog editors. No later-phase destinations are presented as working tools.

Galaxy Forge in [StFinal](https://github.com/Revty79/StFinal) was reviewed locally under `D:/StFinal/serrian_tide/src/components/galaxy` and `src/lib/galaxy`. Its horizontal era bands, selected markers and modal editing informed this design. The new viewport uses a fixed-width stage and bounded adaptive ticks rather than pixels for each year. Overlapping eras occupy separate lanes; crowded markers become selectable groups. Viewing, zooming and navigating history never advances runtime time.

## Persistence and authorization

New isolated tables hold worlds, historical eras, entries, entry/era membership and existing classification-tag membership. IDs are application-generated UUIDs. Ownership comes from the session. Every service operation checks current database roles and ownership; all HTTP handlers authenticate independently of the layout. G.O.D./Admin accounts manage their own worlds. Administrators explicitly select review mode to read other owners' worlds; review does not grant editing. Player and anonymous requests receive no private data. Private responses use no-store caching, and guessed IDs receive an indistinguishable not-found response.

Historical Era records are separate from Era classification tags. Reuse only existing `item_tags_catalog` entries in the Era or Genre groups, with foreign keys and server validation. No Heavens content IDs, Campaign links, uploads, publication or sharing are added. Theme-derived geometric covers provide visual identities.

Transactions lock the world before each mutation. Edits, archives and restores compare the supplied revision with the persisted row and increment it on success. Membership replacement occurs in the same transaction. Composite foreign keys enforce that an entry and each associated era belong to the same world. Archived worlds are read-only until restored; archiving an era retains its entries and associations. Content ownership blocks account deletion under the existing fail-closed FK inventory.

## Historical time version 1

Historical JSON uses `{ version: 1, scale: "world-year", kind: ... }`. Supported kinds are `known` and `approximate` with `year`, `window` and `duration` with `startYear`/`endYear`, and `undated` with no years. Window means one occurrence somewhere inside the interval; duration means an occurrence spanning the interval. Accuracy (`established`, `disputed`, `unverified`, `disproven`) and narrative status (`recorded`, `planned`) are independent.

Years are signed whole numbers in the inclusive range -1,000,000,000,000 through 1,000,000,000,000. Year 0 is a real year between -1 and 1. There is no implicit epoch, Gregorian mapping, day length or year length. Historical dates never use JavaScript Date. Metadata timestamps do. Version/scale permit a later calendar representation without reinterpreting stored years. Eras allow either boundary to be unknown; both known boundaries must be ordered. Undated entries stay outside the dated axis.

## Save and browsing behavior

Editors retain drafts on validation, network, authorization and conflict failures. A conflict offers an explicit latest-version reload, never an automatic overwrite or retry with a new revision. Native dialogs contain focus; dismissing a changed editor requests draft-discard confirmation. Pending saves prevent duplicate submissions. Before-unload protects unfinished drafts. Timeline state is independent of record updates so detail views and edits preserve position and filters.

## Verification plan

Run pure time/viewport tests, an isolated PostgreSQL migration/service rehearsal, and a production-build browser rehearsal with G.O.D., second G.O.D., Admin, Player and anonymous sessions. Exercise same-world constraints, persistence, all date kinds, overlaps, archives, stale revisions, failed-save drafts, large ranges, dense groups, keyboard and phone editing. Compare Campaign/runtime tables before and after. Inspect 1440x900 and 390x844 screenshots. Run Next type generation, TypeScript, focused lint, appearance/navigation/lifecycle regressions, Drizzle checks and whitespace checks. No Production migration, deployment or GitHub push is authorized by this pass.
