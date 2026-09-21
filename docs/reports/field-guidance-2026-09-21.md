# Field guidance, Race Description and Derived Ability scrolling

## Changes

Shared field guidance explains what to enter, what a field controls and relevant examples or limits. The question mark opens with click, touch or keyboard; Escape closes it. Help stays beside the field without covering controls, changing a value or saving a draft. Native controls retain their accessible names and descriptions. Touch targets are 44px and appearance uses the shared theme.

The shared Race, Creature, Creature NPC, Item, Campaign, Character and Derived Ability field wrappers now supply explanations. Core Skill/path fields, Race natural protection and Interaction Rules also use them. Existing specialist help and validation remain visible. Contextual **Help with this page** provides searchable topics and workflow guidance across authoring, Characters, combat, Magic, advancement, shops, towns, administration, chat and account pages. This does not claim that every specialised control has an individual question mark; the shared pattern is documented for continued coverage.

Race **Description** is editable in Overview and shown in Preview. It reads and saves the existing description property; there is no duplicate field, data conversion or database migration. Existing text remains available.

The Derived Ability form could stop at **How It Is Obtained** on desktop because the fieldset expanded beyond its bounded editor. Its inner content measured 3439px high with no scrollable overflow while the outer editor clipped it. The fieldset now shares the editor's available height and lets the content scroll. Existing read-only/archive behavior is retained. The Equipment editor also stacks on narrow screens so its fields and help remain reachable.

No database schema, DEV records, combat execution, resource spending or damage calculations changed in this pass. Browser fixtures use isolated disposable PostgreSQL databases.

## Validation

- The desktop scrolling regression failed before the CSS correction. Afterward it passed at 1440x900, 1440x700 and 390x844, including wheel movement, access to Rules Text, open Acquisition Type help and preserved unsaved edits.
- Race/guidance browser checks passed: existing Description loaded, edited, saved, reloaded and appeared in Preview; keyboard help, accessible descriptions, Escape/focus restoration, unchanged drafts, search, representative authoring routes, phone overflow and actual touch targets passed.
- The Race harness also passed its database compatibility checks and all 116 existing runtime regression tests.
- The disposable Creature/Race/NPC compatibility browser suite passed with no JavaScript errors, including existing-data preservation, individual editing, Use Conditions, Interaction Rules, archive/restore and phone layouts. Two older broad label selectors were made exact so they select the input rather than its new help disclosure.
- TypeScript, changed-file ESLint, production build and `git diff --check` passed. The build used an isolated output directory and restored its temporary TypeScript configuration adjustment.

Local ignored evidence is under `artifacts/guidance/`; the scrolling comparison is in `scroll-before.log` and `scroll-after.log`, with `derived-ability-scroll-desktop.png` showing the reachable lower editor.
