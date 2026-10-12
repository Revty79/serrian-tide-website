# Worlds Repair H — History, Chronology and Calendars usability

Repair H improves explanations in the existing interfaces, removes the reproduced Chronology-to-Calendars loading flash, and corrects a phone History overflow found during validation. The workshops, controls, saved data and historical calculations retain their existing design and behavior.

The checkout started clean at the exact technically and visually approved F checkpoint `91918aa6b4b9b24f76877448e29bf31e8998b8ed`. Release identity is the local commit containing this report; its exact SHA is recorded in `artifacts/guidance/worlds-h-commit-receipt.json` and the completion message. Independent technical review and owner visual acceptance of H remain pending. H was not pushed or deployed.

## Explanations and preserved interfaces

- History explains what happened, when, and how it is remembered or disputed. Era/event editors and filters clarify unknown boundaries, estimates, possible occurrence windows versus durations, accuracy, planned versus recorded status, original sources and private notes.
- Chronology explains peoples' year counts, historical origins, epochs, Year 0 and before/after labels. The illustrative 300 After Founding / 750 of the Empire comparison changes no records. Default displays, conversions, archival context and referenced-system restrictions remain intact.
- Calendars explain traditions and immutable rule versions, unequal/repeated-name months, weekdays, year structure, time units, intercalary days, recurrence exceptions, seasons, observances and previews. Supporting forms clarify shared Day 0, anchors, effective periods, concurrent adoptions, reforms/cutovers, uncertainty and original notation.
- Existing question-mark disclosures use concise plain language and examples. Main timeline/display selectors and the calendar rules-version selector use the shared guidance component. No example is inserted into a draft. Page guidance explains the same distinctions.
- Existing sections, typography, theme colors, cards, navigation, native forms, validation and save/conflict workflows remain. The small phone wrapping correction preserves complete names and checkbox identities. No ownership/linking bridge, new dependency, schema or migration was added.

## Reproduced defects and corrections

The production baseline recorded first entry and two repeats on desktop and native-touch phone. Every entry remounted Calendars and replaced its content with a **68.48 px** loading section, then expanded to **2,248.06 px desktop / 3,031.27 px phone** for the fixture. Computed background colors stayed constant. The natural traces did not show unexpected scrolling. A deliberately held response reproduced the empty loading view, establishing loading/remount height changes as the observed flash.

Calendars now remains mounted and hidden when another tab is selected, within the matching World/timeline/review/knowledge boundary. Direct Chronology/Calendar visits receive an initial snapshot from the existing authorized, ordinary-filtered calendar service. First preparation is not canceled merely by entering the tab. Return visits fetch fresh data while retaining the authorized view, selected version, preview year/month and editor drafts. Loading is visible; failures offer reload. A denied read clears the prior view. Request cancellation, generation checks and live context checks reject superseded results. Supporting native dialogs close while their tab is hidden and resume their draft on return.

The final production trace recorded **zero loading-panel frames in all six first/repeat transitions**, including phone. Held return responses retained content and displayed refresh status; return reads displayed a separately saved change. Failed refreshes remained visible; denied reads removed the earlier cards. Back/Forward retained unfinished calendar identity and period drafts without leaving a hidden modal active.

A separate native phone failure was an **application layout defect**, not a failed touch assertion to bypass. Long unbroken History titles expanded grid tracks, widening a 390 px page to approximately 514–545 px as the History response arrived. Mobile viewport expansion then shifted dialogs and made touch targets miss. Browser-only checkbox, clipping, device-descriptor, coordinate and font probes did not resolve the cause. Wrapping the History card contents and allowing its grid children to shrink restored the 390 px page and ordinary native taps. The final CSS also constrains era checkbox widths and wraps their complete labels. The final context suite passed with standard native locator taps and full mobile emulation; no forced click or application JavaScript action was used.

## Focused verification

| Check | Actual result |
|---|---|
| Production builds | Six isolated builds passed: two baseline builds and four implementation builds. The final build includes the phone correction; retained builds were reused for harness-only resumes. |
| TypeScript and changed-file lint | Passed, including the final source and H harness/resume files. |
| Relevant domain tests | **47/47** passed across History, History index, Chronology, Calendars, calendar dates, branching History and Living Skies arithmetic. |
| H browser checkpoints | **8/8** completed: transitions, guidance, chronology, calendars, evolution, privacy, context and nearby navigation. Completed checkpoints were retained while unfinished checks resumed. |
| Question-mark help | **103 distinct controls / 206 keyboard and native-touch interactions**. Enter/Space or tap opens help; Escape closes it and restores focus. Draft controls and saved calendar rules remain unchanged by reading help. |
| Creation/edit/save and recovery | Chronology and calendar authoring, previews/conversions, default display, referenced arithmetic protection, failed saves, actual two-tab conflicts, latest-version reload, archive/restore and phone persistence passed. Native desktop/phone History saves retained a complete long-name era association. |
| Dates and source preservation | Exact/approximate/window/duration calendar sources, original notation/rule versions, immutable anchors/origins, consecutive cutovers, adoption/reform context, retired sources and historical identities passed. |
| Privacy and context | Server/HTTP projection with **67 ordinary-safe events**, pagination, protected indirect sources and pins, primary/alternate/nested timelines, delayed/stale responses, canceled Back, retained readers and world switching passed. Owner, read-only Admin, foreign G.O.D., Player and anonymous boundaries passed. Ordinary initial Chronology snapshots omit protected calendars from server-rendered payloads. |
| Nearby navigation | Calendar → celestial chronicle → Calendar retains World/timeline/version identity on desktop and native touch. Administrator initial Chronology/Calendar views remain read-only. |
| Appearance and phone | 1440×900 desktop, 390×844 native mobile/touch, and 390×320 short-phone footer checks passed. Page overflow is checked against the configured viewport, rather than a widened `innerWidth`. Existing designs were visually inspected in retained screenshots. |
| Scope preservation | Authoritative History/Chronology/calendar rules, services, schemas and migration journal match approved F. Disposable runtime, Campaign, Form/Evolution and catalog snapshots remained unchanged. |

Harness failures were recorded separately: serialized helper naming, prematurely removed request handlers, CJS top-level-await in an ignored recovery helper, inert controls behind a modal, snapshots including asynchronously loaded background controls, repeated disclosure toggles, an incorrect discard label, and a stale raw `aria-label` selector. These were corrected without restarting unrelated application suites. The native phone overflow was investigated and corrected as an application failure. Earlier diagnostic failures are retained; they are not counted as successful checks.

Evidence is local and ignored by Git:

- `artifacts/guidance/worlds-repair-h-baseline-resumed/h-transition-trace.json` — original production behavior.
- `artifacts/guidance/worlds-repair-h-resume-3/` — completed guidance, chronology, calendar, evolution and privacy checkpoints; seven help/short-phone screenshots plus supporting evidence.
- `artifacts/guidance/worlds-repair-h-final/` — final transition/context/nearby receipts and ten final screenshots.
- `artifacts/guidance/h-phone-history-wrap-probe.log` — measured phone diagnosis and successful native wrapping probe.
- `artifacts/guidance/h-domain-tests.log`, `h-typecheck-final.log`, `h-lint-final.log`, `h-invariant-receipt.json`, `worlds-h-completion-evidence.json` — focused checks and scope receipts.

## Migration, configuration and release readiness

**New migrations: zero.** The unchanged journal has 122 entries through `0121_worlds_living_skies` (idx 121). The current chain was exercised in disposable PostgreSQL. H makes no new upgrade or data-conversion requirement; it does not claim a new comprehensive populated application upgrade rehearsal. No shared DEV/Production data, running services, dependencies or application configuration were changed.

After independent technical and owner visual review, and separate push/deployment authorization, confirm the intended release SHA and target migration ledger, follow the existing operator-managed release process, build before activation, and smoke-test role access and History/Chronology/Calendar/sky navigation. There is no H migration to apply. H is a complete local increment and does not require I to function. Push and production activation remain unapproved actions at this boundary.

Recovery can restore the approved F application code without a database rollback because H changes no schema or saved representation. Existing dates, sources and records remain compatible; restoring F also restores its earlier help and navigation/phone defects. Preserve normal backups and any records authored after release; reverting code does not undo database history.

## Review boundary and limitations

Automated checks and screenshot inspection establish technical evidence, not owner experience acceptance or physical-device certification. Independent H technical and owner visual review remain pending. No comprehensive application suite was rerun during H; earlier broad receipts remain historical evidence. **Standalone G is postponed. The next combined integrated acceptance and comprehensive regression checkpoint follows H and separately authorized I.** Calendar ownership/usage bridges remain separate future work. Do not begin I automatically.
