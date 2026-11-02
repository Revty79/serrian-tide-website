# Character creation device autosave

Application commit: `9263ff249643289549fad41676d7884cf806bb17`, based on printing publication `ae7770ee21d48657e8e7704d1f5e695c6fbcaf13`. On 2026-11-02 the owner requested protection against losing character-creation work through Back navigation, then explicitly selected **Keep a recoverable draft on this device**. Commit and main sync are authorized.

Unfinished player Characters now retain the complete creation draft after committed edits: identity/Race, Attributes, skill paths and temporary identities, story, owned stacks and individual copies, currency and editor tab. A matching single draft restores automatically after returning or reloading. Changed saved records or several editor drafts present recovery choices. Save Character still explicitly updates the database; Complete Character still explicitly locks creation. Completed Characters and NPCs retain their existing behavior.

Keys isolate the authenticated viewer, Campaign, Character and access scope. Each mounted editor owns a separate slot. Recovery writes its replacement before conditionally retiring the exact old bytes; saving retires only the acknowledged editor's slot. Other-window work is retained. Race recovery uses the existing authorized reader. Original transaction versions remain intact, so restoring an older draft cannot silently bypass a newer saved-record conflict. Browser storage failures remain visible and manual saving stays available. The existing print saved-record confirmation remains intact.

| Check | Result |
| --- | --- |
| Full feature suite | 2,651/2,651 pass across 329 files; five new packet/recovery regressions pass |
| Final headed Chrome journey | Actual Back/Forward/reload, full profile and alternate Race, Attributes, story/secrets, skills, individual Item copies, continued temporary identity allocation, restored tab and 390px layout pass |
| Recovery boundaries | Two independent windows, account isolation, changed-record choices, conditional retirement, unavailable browser storage with successful manual save, completed-record lock and unchanged database fingerprints before Save Character pass |
| Owned disposable actions | Existing 14 authorization/state action checks pass |
| Printing regression | Actual all-eight/individual PDFs, all eight styles, saved-record/unsaved-draft protection, failure/retry and Letter native preview pass; exported skill/ability columns, five real-weapon rows, authored damage types, bounds and unchanged front pass |
| Production / TypeScript / lint | Pass; zero lint errors and one existing unused `LoreFamily` warning |

Production build: `qJBLiei1gPtDx7Gva-YBw`. All 1,825 application/asset files match the isolated build source; manifest SHA-256 `4b8ed98a44f5e9085d25d35bc0c75523e4eaeb3189500c361c295215e906d3e5`.

Evidence remains ignored under `artifacts/character-creation-autosave/`: `browser-final.log`, `browser-receipt.json`, `recovered-phone.png`, `saved-desktop.png`, `units.log`, `production-build.log`, `lint.log`, `source-parity.json` and `print-regression/`. Earlier fixture-order/catalog-ownership/locator/navigation-sequencing failures and the ref-during-render lint failure are retained; the final browser repeat uses the corrected scope-ready React state. These are separate receipts, not an uninterrupted aggregate. Phone evidence is a browser viewport check; no physical-device or owner acceptance is claimed.

This is device-local recovery, without account/cross-device synchronization. Invalid packets remain retained. Stale drafts preserve their original server conflict checks; the feature does not merge competing saved records or bypass permissions, budgets, gameplay or completion rules. See [the architecture note](../architecture/character-creation-draft-recovery.md).

No migration, new runtime dependency, shared DEV/Production access, deployment, owner-service restart or Atlas change occurred. Writes were confined to newly owned disposable databases and browser profiles; production build used an unreachable dummy database. The unrelated local Atlas report edit remains untouched. Recovery is a code rollback, with no database rollback required; device packets remain on the device.
