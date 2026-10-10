# Atlas Pass 3B browser evidence

These images are committed release evidence from the actual production-build disposable browser regression. The Worlds and places are synthetic test fixtures; no real-user private information or third-party reference artwork is included.

- [Desktop canvas](desktop.png): existing 3A continent after sculpting, real coastal detail/smoothing, nine terrain brushes, a curved river, settlement/label edits and freehand island creation, all saved and reloaded.
- [Phone canvas](phone.png): the same saved source after actual touch sculpting, additional forest painting and river-point editing, saved and reloaded at a 390 x 844 viewport.
- [Full phone page](phone-page.png): the editor's controls, guidance, feature/drawing lists and actual map in the phone layout.
- [Exported PNG](export.png): full 2000 x 1200 source-derived artwork before the later phone edits, without editing handles. The test compared desktop and phone downloads of this same source and verified identical bytes.

The desktop test viewport was 1440 x 1000. Scoped canvas screenshots are cropped to their actual rendered element bounds. The browser suite is `npm run validate:worlds-disposable`; original test artifacts are generated under ignored `artifacts/guidance/`. Copy final reviewed captures here when deliberately updating release evidence. Public visual-reference screenshots are not application artwork and are not included.
