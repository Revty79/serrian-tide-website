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

Stage 3 Pass 5C label and composition inks are cartographic presentation data in `terrain-labels-painter.ts`. Coordinated ink/halo defaults follow the map appearance; custom map-text colors remain label data. Composition outside the geographic paper uses shared semantic foreground/surface contrast. All inspector fields, status, selection and editing chrome retain the shared interface theme. Fonts use existing installed serif/sans/monospace families; this pass adds no font or artwork dependency.

Stage 3 Pass 5B bundles original versioned geographic SVG artwork in `public/worlds/cartography/v1`, generated from `terrain-artwork-assets.ts`. Its coordinated fantasy/natural material colors and natural/antique/vivid/night variants belong to the map, including library thumbnails. The existing map style transforms these colors. Library cards, fields, feedback, focus and placement selection continue to use shared semantic interface colors. These asset colors must not become a separate interface palette.

Stage 3 Pass 2 Realistic Terrain uses the locally bundled CC0 photographic albedo/normal artwork in `public/worlds/terrain-materials/v1`, shared material definitions in `terrain-surface-textures.ts` and water/automatic surface composition in `terrain-surface-art.ts`: rock, scree, earth, grass ground cover, sand, explicit pale/snow and water. These coordinated geographic surface colors and texture normals are render assets, independent of website brand colors. They do not classify climate or vegetation. Material controls, status, fields, cursors and all editor chrome retain shared semantic theme variables; never reuse landscape RGB values as an independent interface palette.

Stage 3 Atlas cartographic materials are shared versioned render assets in `terrain-appearance.ts` and `terrain-cartography.ts`: original ivory/parchment, land/water ramps and geographic pen inks. Every root/refinement/preview painter uses these same map materials; they remain independent of application brand colors so geography and coordinated artwork retain meaning. Map controls, status/legend panels, focus, labels and editing overlays continue to use shared semantic interface roles. Do not use the material palette for website chrome or introduce another independent page palette. The old scientific palette and legacy illustrated appearances remain preserved.

The agreed [Atlas UX-0A contract](worlds-atlas-ux0a-contract.md) requires versioned illustrated styles through shared scoped semantic map-paper, water, land, ink and material roles. A persisted style preserves its coordinated artistic palette across application-brand changes and export; do not derive paper/water blindly from arbitrary brand text/accent colors. Extend the shared system instead of introducing an independent page palette. Studio chrome, fields, feedback, focus and selection retain shared interface semantics. Preserve explicit legacy map styles and scientific color encodings. This records the design requirement, not implementation authorization.

Numerical elevation relief uses a fixed scientific colour scale, shared by the renderer's `ELEVATION_STOPS` and the semantic `--st-terrain-deep`, `--st-terrain-zero`, `--st-terrain-low` and `--st-terrain-high` legend variables. These colours encode numerical heights and remain independent of brand presets. Elevation controls, panels, feedback and text continue to use the shared appearance system. Shading and opacity are presentation preferences; they never change source values.

Categorical land-cover imagery and its `--st-classification-swatch` legend role use the retained source's class RGB values. These are scientific class encodings, independent of brand presets. Class codes, names and definitions accompany colours; unknown cells use semantic surface/border tokens and explicit text. Classification controls, panels and feedback use the shared interface theme. Opacity never changes a class or its certainty. See [Geo C3](worlds-geo-c3.md).

`--st-health`, `--st-mana`, `--st-success`, `--st-warning`, `--st-danger`, and `--st-info` remain stable semantic signals rather than administrator-adjustable brand colors. Their tinted backgrounds and borders must still be derived with `color-mix`. Dedicated print/export rules use fixed ink colors for legible physical output and are excluded from screen-theme conversion. Unified character print templates use restrained genre ink for illustrated mastheads, headings, and rules; the Plain appearance uses black, gray, and white. Body text and writing areas stay black on white, and meaning must remain clear in grayscale. Screen print controls still use the shared semantic theme. See [Unified character printing](unified-character-printing.md).

The appearance check recognizes the dedicated `src/app/characters/printable-character-sheet.css`, only the `@media print` rules in `src/app/characters/paper-character-sheet.css`, and only selectors scoped to `.special-ability-reference--print` in `src/features/special-abilities/reference.css`. Screen controls and ordinary Special Ability references in the latter two files remain subject to the shared-color checks; other application stylesheets do not inherit these exceptions.
