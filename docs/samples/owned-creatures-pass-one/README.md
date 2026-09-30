# Owned Creatures Pass 1 review evidence

These are actual Chrome screenshots from disposable synthetic data. No shared DEV or Production records were used. See the [completion report](../../architecture/owned-creatures-pass-one-report.md) for scope, tests, limitations, and the recommended next pass.

Focused captures hide unrelated sticky navigation and the Next development indicator during capture only, so they do not cover the controls being reviewed. Browser interactions and overflow checks use the actual page styles.

| Screenshot | What it shows |
| --- | --- |
| [Item capability, desktop](authoring-control-desktop.png) | Explicit guided authoring control and storage-only explanation |
| [Item capability, 390px](authoring-control-phone.png) | Same field at phone width |
| [Companion list, desktop](companion-list-desktop.png) | Legacy, Accompanying, Away/note, and Vessel-bound together |
| [Companion list, 390px](companion-list-phone.png) | All four readable display states at phone width |
| [Bound editor, 390px](bound-editor-phone.png) | Exact name-first Vessel copy and custody summary |
| [Unbind confirmation, 390px](unbind-editor-phone.png) | Explicit confirmation before changing away from Vessel-bound |
| [Duplicate-copy editor, 390px](duplicate-editor-phone.png) | Current exact binding; browser assertions also inspect the distinct same-name option labels |

[changed-files.txt](changed-files.txt) lists the delivered paths. [validation-results.txt](validation-results.txt) records the validation results without temporary credentials or server logs.
