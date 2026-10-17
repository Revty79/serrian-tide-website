# Retrieve the preserved Atlas

The owner authorized publishing the completed Atlas removal to `origin/main` on 2026-10-17 and asked for a durable way to retrieve the previous work. Worlds remains the information-based authoring application. Atlas implementation, schemas, migrations and stored relationships remain retained, with map-making access disabled.

## Named checkpoint

| Reference | Exact commit | Contents |
| --- | --- | --- |
| `archive/worlds-atlas-before-removal-2026-10-17` | `8743854ecc52412e141569472684f34e553255cb` | Complete tracked repository immediately before removal, including Atlas code, tracked artwork, architectural decisions and historical evidence. |
| Removal implementation | `b7889ced70260a7a64e0d77123a50a85a53245dc` | Completed interface/API separation and technical evidence; see the [removal report](worlds-atlas-removal.md). |

The annotated checkpoint tag is published to `origin` alongside the main update. Keep it at this exact commit; any later checkpoint needs a new name. The snapshot retains the implementation's documented limitations and pending acceptance status.

[Browse the pre-removal Atlas on GitHub](https://github.com/Revty79/serrian-tide-website/tree/archive/worlds-atlas-before-removal-2026-10-17). The earlier [roadmap](../architecture/worlds-map-maker-decisions.md), [UX-0A contract](../architecture/worlds-atlas-ux0a-contract.md) and [coordination record](worlds-atlas-ux0a-coordination.md) remain available in both the snapshot and current repository as historical reference.

## Retrieve without changing the active application

Fetch the published tag and confirm its underlying commit:

```powershell
git fetch origin tag archive/worlds-atlas-before-removal-2026-10-17
git rev-parse 'archive/worlds-atlas-before-removal-2026-10-17^{commit}'
```

The result must be `8743854ecc52412e141569472684f34e553255cb`. Read an individual historical file directly:

```powershell
git show archive/worlds-atlas-before-removal-2026-10-17:src/features/worlds/atlas-workspace.tsx
```

For a separate copy of all tracked files, choose a new output location:

```powershell
git archive --format=zip --output=atlas-before-removal.zip archive/worlds-atlas-before-removal-2026-10-17
```

These commands retrieve reference material without reverting `main` or re-enabling Atlas. Future reuse or a separate Map Maker requires its own approved scope and checks.

## Stored data and private assets

The removal adds no migration and deletes no saved map, geographic source, identity, historical appearance or relationship. The [preservation receipt](../screenshots/worlds-atlas-removal/results.json) records unchanged disposable fixtures; it is not a backup of shared DEV or Production.

The Git checkpoint contains tracked files only. Databases, ignored private raster/geographic assets, environment files and local backup artifacts are outside it. Preserve existing paired PostgreSQL/private-asset backups separately. Actual data recovery requires verified backups and a successful isolated restoration under separate authorization; never restore an old database over current content merely to inspect historical code. No shared database or private asset was moved, restored or changed for this publication.
