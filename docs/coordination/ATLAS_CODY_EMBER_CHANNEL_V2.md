# Serrian Tide Atlas — Cody ↔ Ember coordination channel v2

> **DISCUSSION ONLY — DO NOT MERGE THIS PR.** No application code, migrations, production settings, or deployment instructions belong in this branch. This document exists solely to provide a fresh PR Conversation channel after historical coordination PR #4 and implementation PR #5 were unexpectedly merged/closed on October 16, 2026.

## Purpose and routing

- **This draft coordination PR:** Cody posts new evidence and decisions requested as top-level **Conversation** comments. Ember reads and responds here, never on an unpushed local checkpoint.
- **Implementation:** Cody uses a separate feature branch and **draft implementation PR**, linking the new PR number here. A merged or closed old PR #5 is not a current implementation review surface. Do not assume the old branch head is current.
- **Previous history:** [Coordination PR #4](https://github.com/Revty79/serrian-tide-website/pull/4), [old implementation PR #5](https://github.com/Revty79/serrian-tide-website/pull/5), and [central issue #3](https://github.com/Revty79/serrian-tide-website/issues/3) are background only. Preserve the review history and original source identities. Do not recreate/deploy/alter main to make a channel.
- **Merge and testing safety:** Neither Cody nor Ember merges this discussion PR, merges implementation, deploys to Production, modifies shared DEV/Production databases, rewrites migration 0132, or invites owner testing without fresh, explicit owner authorization and independent Cody/Ember same-SHA approval.

## Owner-directed development order

1. **Finish authorized UX-0A “Create Your First Island”**, including the bounded 14-subject starter-art increment, exact-pinned hill/wetland compatibility, performance, actual final illustrated island visuals, and two independent zero-World generated/manual UI journeys. Current tests/art-study approvals are not final owner-testing readiness.
2. **Prepare repository-backed professional 2D-first gap audit and phased roadmap for owner/Ember decision before implementation beyond UX-0A.** An end-state of 14/40 stamps is insufficient. Require real 2D authoring of richly illustrated world/region, detailed cities (including historical, modern, futuristic, ruined settings), building interiors, and dungeons/caves, with professional drawing tools, asset/material/brush platform, linked map navigation, edits/versioning/visibility/living history and print/VTT exports. Target high-quality cartography, not retro sprite assets.
3. **No numerical heightmaps until professional 2D work is planned, authorized and completed.** Retain future Geo Data Library, Geo E, Worlds cleanup and Historical Earth roadmap and preserve geographic/timeline identities.
4. Keep the site usable without a server GPU or new paid API service.

## Review protocol

A review request should begin with `[CODY → EMBER] [SCHEDULED REVIEW TEST]` or `[CODY → EMBER] [REVIEW REQUEST]` and supply:
- exact **pushed** implementation commit SHA, current **draft implementation PR URL**, one precise decision requested and the request's timestamp;
- a publicly accessible linked report, real application/browser screenshots/exports (full image plus reduced/close crops for visual gates), reproduction steps, test/CI/failure evidence and outstanding limitations;
- whether the owner-facing zero-World journeys, normal/touch resource budgets and privacy/source/history/rollback evidence are final or incomplete.

Ember should check *this* channel and the currently linked implementation PR (not automatically #5), inspect exact pushed changes plus real visuals for artistic decisions, avoid duplicate decisions, and respond here with `[EMBER → CODY]`, exact SHA, verdict, corrections/next steps and any links. If no new decision is requested, it is acceptable to read without commenting. **Do not infer approval from inactivity.**

### Independent scheduling experiment

The owner scheduled independent one-time Atlas reviews on October 16, 2026 at **10:30, 11:30, 12:30, 13:30 and 14:30 America/Denver**. The purpose is to find out whether a future scheduled run can read GitHub and autonomously **post** a real Ember review in response to a genuine, new Cody request. A completed scheduler run without an actual post does **not** establish successful two-way unattended communication; owner-triggered responses must be labeled as such. Avoid sending duplicate posts for the same exact request. An Ember comment cannot automatically wake Cody's separate coding session.

**Status on channel creation:** This is a new channel, not a new implementation approval. PR #4 and #5 are already closed/merged externally. Cody's final island/library performance and roadmap audit remained in progress on last public report; until a new push is visible, no new technical/artistic readiness claim is made.

— Owner's independent technical/artistic reviewer, Ember
