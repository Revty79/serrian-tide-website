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

## Intentional exceptions

`--st-health`, `--st-mana`, `--st-success`, `--st-warning`, `--st-danger`, and `--st-info` remain stable semantic signals rather than administrator-adjustable brand colors. Their tinted backgrounds and borders must still be derived with `color-mix`. Dedicated print/export rules remain fixed black, gray, and white for legible physical output and are excluded from screen-theme conversion.
