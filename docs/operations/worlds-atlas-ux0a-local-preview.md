# Safe local IDE review of the feature checkpoint

The owner's existing server release command remains `cd /apps/serrian-tide-next && git pull --ff-only`, followed by his established exact-SHA Docker build and controlled container replacement. Fully approved work must reach `origin/main` through the reviewed implementation PR after explicit integration authorization. Nothing in this feature checkpoint authorizes a merge, deployment or Production migration. PR #6 is discussion only and must never be merged.

A Cloud push does not change the separate IDE checkout. `npm run dev` runs the branch/files in its local folder, including uncommitted files. The owner now requires acceptance in the IDE with its normal **DEV** database. Cloud must never connect to that database. The local IDE agent must inspect its actual environment and confirm that its application target is DEV, preserve local changes and backups, and follow the owner’s existing migration policy. No migration is added by the N0 corrections; do not reapply 0132. A separate review checkout is recommended when another IDE task is active. For the optional disposable preview below, create a separate review clone, fetch `origin/codex/atlas-ux0a`, and check out the **exact pushed review SHA from PR #6** in detached HEAD. Do not switch the server checkout. A local DEV review is the owner’s explicit acceptance workflow and must be prepared locally after the joint readiness gate; never infer a DEV target from an environment filename. Do not copy `.env.local`, `.env.production`, backups or Production secrets into the review clone.

```sh
git clone --no-checkout https://github.com/Revty79/serrian-tide-website.git serrian-tide-ux0a-review
cd serrian-tide-ux0a-review
git fetch origin codex/atlas-ux0a
git switch --detach EXACT_REVIEW_SHA_FROM_PR6
npm ci
```

## Optional disposable local fixture preview

This isolated preview is a technical aid and does not replace the owner’s normal-DEV acceptance. Use Node 22 and installed PostgreSQL/Chromium tools. Prepare a new disposable cluster with the [correction setup procedure](worlds-atlas-ux0a-corrections.md#reproduction-in-an-isolated-cloud-target), then run the two normal website journey recipes in this review clone. Their fresh local receipts and maps belong to this checkout, not to Codex Cloud or the active IDE folder. Paths and cluster identities are positively checked; do not copy an environment receipt and alter its ownership fields to make it pass.

The optional clone source must be an explicitly identified **task-owned disposable zero-World test baseline** with all committed migrations already present, such as the old isolated UX-0A test baseline. It must never be owner/shared DEV or Production. The setup validates the live database/data directory, zero Worlds/maps and all 133 hashes/timestamps; it runs no migrations. If no eligible disposable source exists locally, have the local IDE agent prepare the isolated test baseline under the owner's database policy first. Do not substitute `.env.local` or reapply 0132 to an existing database.

After the journey receipts are prepared, run one local fixture at a time:

```sh
node --conditions=react-server --import tsx scripts/worlds-geo-ux0a-local-preview.ts --branch=manual
# Stop with Ctrl+C, then inspect the other fixture:
node --conditions=react-server --import tsx scripts/worlds-geo-ux0a-local-preview.ts --branch=generated
```

The helper refuses real environment files, verifies the journey's owned local database/cluster, binds loopback, supplies explicit disposable auth/storage/database values and prints the local map URL and fake login. Its `next dev` process runs the exact review checkout's source. It does not switch the active workspace, install a system service or start a deployment. Stop only this preview process and its task-owned PostgreSQL cluster after review. Keep source review edits out of this clone; report findings against the exact SHA.

This procedure and guard are prepared here. **The owner's separate IDE preview has not been started or verified from Cloud.** Local preparation/browser inspection must happen in that IDE environment; Cloud localhost addresses cannot substitute for it. Technical Cloud evidence and a merge into another feature branch do not record owner visual/functional approval. Ember's UX-0A independent re-review and joint initial testing gate remain pending; the procedure does not assert that gate has been cleared.
