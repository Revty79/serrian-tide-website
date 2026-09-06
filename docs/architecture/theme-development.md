# Theme development

Serrian Tide uses one semantic appearance system for every screen interface.

## Sources of truth

- `src/features/appearance/appearance.ts` owns the six editable base colors, built-in presets, validation, and the base CSS-variable map.
- `src/app/globals.css` owns the derived semantic variables. The combined `:root, [data-appearance-theme-scope]` rule is the single derivation definition for both the published document and isolated previews.
- `src/db/appearance-schema.ts`, `src/features/appearance/appearance-service.ts`, and migration `0037_site_appearance` own the singleton persisted setting and cached public read.
- `src/app/admin/appearance` owns the administrator editor. Draft values stay on the scoped preview until a successful Save publishes them at the document root.

## Interface colors

Use `--st-page`, `--st-surface`, `--st-surface-raised`, `--st-surface-soft`, `--st-surface-deep`, and `--st-input` for backgrounds. Use `--st-text`, `--st-text-strong`, `--st-text-soft`, `--st-text-secondary`, and `--st-muted` for text. Use `--st-border`, `--st-border-strong`, the primary and secondary token families, `--st-brand-gradient`, `--st-focus`, `--st-selection`, and `--st-shadow` for the corresponding interface roles.

Plain CSS and CSS Modules should reference the variables directly. Tailwind classes should use the mapped slate, gray, purple, amber, black, and white appearance families declared by `@theme inline` in `globals.css`; the mapped red, emerald, and orange families are reserved for danger, success, and warning signals. Do not put CSS variables inside Tailwind arbitrary-value classes; use a stylesheet rule or an existing semantic utility class instead.

When a component needs another reusable appearance role, add a derived semantic variable to the shared root/scope rule and use that variable from the component. Do not introduce an independent page palette.

## Scoped themes

A scoped theme owner supplies the base variables returned by `getAppearanceCssVariables` and carries `data-appearance-theme-scope`. The shared derivation rule then recomputes every dependent surface, text, border, gradient, hover, focus, and selection token within that element. Never override only the base variables on an ordinary descendant because inherited derived values would still belong to the outer theme.

## Shared form controls

Builder, placement, and live-operation interfaces use the small shared pattern in `globals.css`:

- `.st-field` owns label layout and label typography.
- `.st-control` owns native input, select, and textarea sizing, padding, radius, border, semantic input background, foreground, focus, and disabled treatment.
- `.st-button` owns the matching action geometry. Add `.is-primary`, `.is-secondary`, or `.is-danger` for the action's actual role.

Apply the class to the native control or button itself; do not rely on a distant page wrapper matching one particular DOM shape. Keep labels associated with their native controls, and retain native keyboard behavior. Dialogs and overlays use the same classes rather than establishing another palette.

Native select popups are partly browser-owned. The shared `select`, `option`, and `optgroup` rule declares the dark color scheme plus `--st-input` and `--st-text`, which prevents bright option menus in supporting browsers while leaving the native arrow and accessibility behavior intact. Page CSS may control layout and width but must not replace these appearance roles. Validate computed select and option colors under the saved appearance and at least one scoped alternate preset when changing this pattern.

Confirmation overlays should use the native `dialog` element and `showModal()` so focus containment, Escape dismissal, and focus restoration remain browser-managed. Keep validation and server feedback inside the open dialog, preserve entered values after failure, and disable dismissal or duplicate submission only while an action is pending. Dialog fields and actions use the same `.st-field`, `.st-control`, and `.st-button` variants as the underlying workspace.

## Intentional exceptions

`--st-health`, `--st-mana`, `--st-success`, `--st-warning`, `--st-danger`, and `--st-info` remain stable semantic signals rather than administrator-adjustable brand colors. Their tinted backgrounds and borders must still be derived with `color-mix`. Dedicated print/export rules remain fixed black, gray, and white for legible physical output and are excluded from screen-theme conversion.
