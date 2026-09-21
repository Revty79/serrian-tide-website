# Field and page guidance

People should be able to understand a field without reading implementation notes or guessing its rule.

## Shared pattern

- `src/components/field-guidance.tsx` provides `GuidedField`. Pass the visible label, the existing input/select/textarea as children, and a short explanation. Existing domain wrappers look up context-specific copy with `fieldHelp(scope, label)`.
- The **?** is a native disclosure outside the form label. Click, tap, Enter or Space opens it. Escape closes it and returns focus. It is readable even inside a disabled fieldset. It never submits a form, toggles a checkbox or edits the draft.
- Explanations stay in document flow instead of covering adjacent controls. Touch devices receive a 44px target. Native controls retain an accessible label and an `aria-describedby` reference to the explanation. Custom control components should forward those attributes to their native input.
- Essential instructions and validation stay visible. Use the disclosure for the longer meaning, input guidance, examples and limits; do not hide a blocking error there.
- `PageGuidance` supplies **Help with this page** at the application root. Its native modal dialog provides context, workflow steps and searchable topics. Escape, Close help and outside clicks dismiss it. Navigation selects a fresh guide. Help reads static text only and has no data permissions or mutation actions.
- Appearance uses the shared semantic theme. Guidance is hidden for print.

## Writing guidance

Explain **what this controls**, **what to enter/select**, and **what happens when used**. Include a small example when it clarifies the field. State blank-versus-zero rules only after checking the actual validation. Distinguish narrative text, catalog definitions, owned copies, live state and executable effects.

Use the field's context. Race Size and Creature Size differ; Race protection has one Soak value while Creature protection retains its current Armor and Soak behavior. An Item preparation cost may explicitly allow zero while a Creature Attack Initiative must be positive. Do not share wording simply because two fields have similar names.

`src/features/guidance/field-help.ts` is the catalog of field explanations; `page-help.ts` owns route-specific workflows and topics. Keep copy beside its proper scope. Check the domain/service and authoritative rulings before describing mechanics. Help does not invent defaults, resolve an unapproved stacking rule, or promise unsupported automation.

Current coverage includes the shared Race, Creature/master/NPC, Item, Campaign, Character and Derived Ability field wrappers; core Skill/path fields; Race natural protection; Interaction Rules; and contextual page guides across the app. Other specialised controls can retain their existing visible instructions and use the page guide. Add specific field help when modifying them instead of treating a general page guide as a substitute for an unclear control.

## Validation

`npm run validate:race-authoring` runs the disposable database/browser harness, including `scripts/guidance-browser-checks.ts`. It checks keyboard/Escape behavior, accessible descriptions, unchanged drafts, contextual search, representative authoring pages and actual touch controls at 390px. Run the existing Creature/NPC authoring suite when their shared fields change. Also typecheck and lint changed files.

Review the actual UI at desktop and phone widths with help open. Test that labels still identify their controls, help does not mark a draft dirty, modal focus returns, and closed help does not affect normal save/use behavior.
