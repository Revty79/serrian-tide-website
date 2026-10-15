# Geo D1-A save-state correction — 2026-10-14

Base: `0e5f7164cf9d5579ecac894e29a12fd7613e0a55`. The exact local correction commit is supplied in the handoff. This is a focused save-workflow repair for independent review; no push or deployment occurred.

## Problem and correction

Save map used the combined navigation dirty flag. Unsaved elevation or land-cover preferences could therefore enable an action that saved only Atlas work. The editor now distinguishes `mapDirty` from combined `dirty = mapDirty || geo.dirty`. Save map depends on map work; close, explore, links, browser unload/back and the parent workshop retain the combined guard. Existing `externalDirty` metadata, unfinished drawing, unapplied fields and gesture handling retain their original semantics.

A map save acknowledges Atlas artwork/map information, or the selected historical appearance. Its success message remains visible beside any remaining unsaved geographic changes. Dedicated relief/classification saves name the preferences they persisted; source-revision actions name their own revisions. Save payloads, persistence APIs, revision rules and draft ownership are unchanged. Neither save resets the other's state.

## Changed files

- `src/features/worlds/atlas-map-editor.tsx`: split save eligibility from navigation protection; scoped map/historical feedback and remaining-draft status.
- `src/features/worlds/elevation-workspace.tsx` and `land-cover-workspace.tsx`: distinguish preference confirmations from source-revision confirmations.
- `scripts/worlds-geo-d1a-save-browser.ts`: actual production editor persistence, artwork, failure, conflict, navigation, historical and preservation regressions against the guarded disposable clone.
- `scripts/worlds-geo-d1a-browser.ts`: optional `SERRIAN_TEST_SCREENSHOTS` output path, so reruns preserve the approved checkpoint's screenshots and checksums.
- Architecture save-boundary clarification, this report and [machine-readable acceptance evidence](worlds-geo-d1a-save-state-acceptance.json). The receipt lists exact modified paths.

## Verification

| Check | Result |
| --- | --- |
| Node 22.23.3 production build | Pass, isolated checkout; browser candidate fingerprint matches source |
| TypeScript | Pass, including finalized regression scripts |
| Full ESLint | Pass with the existing unused `LoreFamily` warning; finalized changed scripts also lint cleanly |
| Feature regressions | 2,163/2,163 across 257 files |
| Save-state browser suite | 9/9 groups, zero page errors |
| Existing D1-A production-browser regressions | 14/14 groups, zero page errors; desktop, keyboard and native CDP touch |
| Preservation | Original World rows retained except explicitly changed disposable World/map/preferences/history-head targets; original immutable source rows and migration identities retained |
| Original private raster verification | Pass with the existing provisioning verifier; 132 migration ledger entries, zero new migrations |
| Whitespace | `git diff --check` passes |

The save suite checks opacity-only changes, zero Atlas POSTs and unchanged Atlas revision, preference persistence after reload, real label-position edits and map information, HTTP/network failures, both unsaved raster drafts after artwork save, artwork after either preference save, combined close/explore/unload guards, and successful retries. Competing real saves cause both Atlas and preference 409s; comparison and explicit saved-map recovery preserve the other draft. Preference recovery rereads the authorized current view before retrying. Historical editing saves a new appearance revision while leaving baseline artwork unchanged.

All test writes were confined to the retained task-owned loopback clone. Test cleanup restores the original baseline artwork and raster preference values within that clone; intentional test revisions and immutable historical versions remain. The full browser rerun writes its screenshots under ignored test artifacts, preserving the original committed acceptance images. Phone proof is browser emulation with native CDP touch, not a physical-device claim.

## Preservation and readiness

No migration, dependency, configuration, coordinate adapter, geographic/raster persistence service, privacy guard, Glass Sea source, C1–C3 asset, source identity or original migration was changed. Migrations 0130/0131 remain byte-for-byte unchanged. No raster regeneration or source acquisition occurred. Existing Living History versions remain retained. Shared DEV and Production were never contacted or modified; shared services were not restarted.

To reproduce, use the existing guarded D1-A disposable setup and Node 22 with `--conditions=react-server --import tsx`. Build using `scripts/worlds-geo-d1a-harness.ts build`, run `scripts/worlds-geo-d1a-save-browser.ts`, and run `scripts/worlds-geo-d1a-browser.ts` with `SERRIAN_TEST_SCREENSHOTS` pointing under ignored artifacts. Use only the explicitly owned loopback cluster; the harness does not load `.env.local`.

No new SQL or persistent settings are required. After independent review and separate owner authorization, push the exact correction commit, require Linux Node 22 CI, and use the existing [controlled deployment and paired-asset recovery runbook](../operations/worlds-raster-deployment.md). Current private asset configuration remains applicable. This pass performed no deployment or shared-service activation.

Rollback is application-only and format-compatible: restore the preceding release while retaining owner edits, existing preferences, immutable sources and migrations. Code rollback does not reverse authored data. The previous application would again have the misleading save eligibility; no data restore is needed merely to revert this correction.

Local validation used Windows, Node 22 and the production build. Linux CI for this unpushed correction and independent technical approval remain pending. No D1-B or broad Map Maker redesign is included.
