# Worlds 5B final context privacy follow-up — 2026-10-11

Starting commit: `2b601f6e56ae081ce97b9e32ef49792954f06a78`.
Ending commit: the single local commit containing this report; resolve its exact SHA with `git log -1 --format=%H -- docs/reports/worlds-5b-context-privacy-2026-10-11.md`. The local completion report and final handoff record its literal SHA.

Independent review found that live timeline selection omitted `ordinary=1` but marked the resulting author bundle as ordinary. Adjacent rendering also reused author eras and era readers while the filtered mode request was pending. This follow-up closes those paths without restarting the preceding Calendar correction.

## Corrected behavior

- World bundle loads, knowledge/timeline/review changes and retries now share a request path with explicit selected timeline, review and ordinary flags. Payload and request context become valid together.
- The previous History-dependent content is removed from the DOM during a context mismatch, including hidden tabs, era choices, counts, author controls and retained readers. The History editor retains its draft across a cancelled Back action while rendering no fields in a pending context. The timeline selector remains usable while loading.
- Superseded requests are aborted. Acceptance also checks the request generation, live URL and returned World/timeline identity. An earlier timeline, author-mode or retry response cannot overwrite a newer context. Errors are scoped to their originating context too. Old selections/editors retire before the new payload becomes valid, while same-context reloads preserve their existing recovery flow.
- Direct History read keys include review and knowledge context. Protected era URLs cannot use an old author era while ordinary loading waits. Retained readers keep their existing server protection. Switching Worlds retains knowledge/review and selects the destination World's own Primary context.

The preceding bounded Calendar History pagination, whole-reform withholding, immutable sources and author completeness remain intact. Creator Repair A workshops, compositions, save boundaries and protected fields are unchanged. A2 stays queued and unchanged, awaiting separate approval.

## Executed validation

| Check | Result |
| --- | --- |
| Context browser regression within the final disposable suite | Passed |
| Final full disposable Worlds migration/service/browser suite | Passed |
| Live ordinary timeline switches and real HTTP response bodies | Passed on desktop, native-touch phone emulation and read-only Administrator review |
| Delayed author-to-ordinary, ordinary-to-author and stale responses | Passed; DOM monitoring found no transient protected content |
| Failed request/retry race, review flag denial/return, Back/Forward and reload | Passed |
| Direct protected-era selections and retained-source transitions | Passed |
| Calendar pagination, reform privacy, private definitions and Living Skies | Passed |
| Repair A pilot preservation and prior Worlds browser regressions | Passed |
| Worlds tests / established feature tests | 132/132; 2,017/2,017 across 234 files |
| Disposable account lifecycle | 1/1 |
| Isolated production build and route/type generation | Passed |
| Standalone TypeScript / full lint | Passed; zero lint errors or warnings |
| Drizzle consistency / fresh and populated migration rehearsals | Passed; no schema changes; all 122 journal entries through 0121 verified |
| Immutable context fixture and Campaign/combat/Form/Evolution snapshots | Unchanged |

The context fixture keeps one ordinary era and one ordinary event in Primary; alternate and nested contexts each keep one ordinary era and two ordinary events. Protected events, the protected retained-era name/description/IDs, ancestor source IDs and author notes are absent from ordinary bundle responses and rendered content. Author views retain their complete accounts. All new context journeys are read-only after fixture setup.

Era authoring currently has no visibility control. The disposable test appends protected retained-era payloads after fixture authoring to exercise the existing privacy contract, preserving original immutable versions and pins. This pass adds no era privacy authoring mechanic. Phone checks used Chromium mobile/touch emulation at 390×844, alongside desktop 1440×900; no physical-device claim.

Development runs exposed a cancelled-Back draft regression caused by temporarily unmounting the History editor. The editor now retains draft state while rendering no fields during a pending context, and the navigation guard restores a cancelled URL before Next publishes it. Reading the actual browser URL also exposed an asynchronous reader-close race; Close now removes its entry parameter immediately through native History replacement. The unchanged branching/Atlas regressions and new focused desktop/touch cancellation and direct-reader journeys verify these behaviors. Fixture ordering, browser-helper declarations and selectors were also corrected without weakening privacy/data assertions. The final full run above is authoritative. Its new context checks add live interface selection, intercepted real responses, DOM mutation monitoring, explicit retry and review transitions to the earlier URL-based coverage.

Versioned receipt: [context privacy evidence](worlds-5b-context-privacy-evidence-2026-10-11.json). Local receipts: `artifacts/guidance/worlds-history-context-resumed-final/history-context-results.json`, Calendar/pilot preservation receipts under that same directory, and `artifacts/guidance/history-context-*.log`. Run the established `validate:worlds-disposable` command with `SERRIAN_WORLDS_EVIDENCE_DIR` set to an owned follow-up evidence directory; `--history-context-only` selects focused browser coverage after the existing migration/saved-data checks. No earlier pass's receipts were overwritten.

## Deployment readiness and recovery

Ready for review and a separately authorized push/controlled release. No blockers identified. No new migration, configuration or dependency changes; the existing ordered schema through `0121_worlds_living_skies` is required. Finalized SQL, journal and snapshots are unchanged. No shared DEV/Production writes, DEV process changes, remote push or deployment occurred.

For a later authorized release, verify the exact commit and target ledger, retain a verified backup and the current release, apply only already-required committed migrations in journal order, build before activation, and smoke-check live ordinary timeline switching plus owner/Admin readers. This follow-up introduces no additional migration step.

Database formats and writers remain compatible. Reverting code does not reverse data or migrations and restores the context privacy gap; prefer a forward correction, or restrict affected ordinary reading during recovery. Existing per-request snapshots/pagination still require reload after concurrent author changes. Existing streamed not-found pages may use HTTP 200; exact API denials and absence of private page data remain verified.

Stopped for independent review. Creator Repair A2 remains the next queued assignment after approval; it has not begun.
