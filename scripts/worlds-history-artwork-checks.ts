import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { RegionalFixture } from "./worlds-regional-editing-fixture";
import type { NativeHistoryScope } from "../src/features/worlds/native-map-history";
import { defaultAssetMetadata } from "../src/features/worlds/atlas-assets";

export async function validateHistoricalArtwork(f: RegionalFixture, scope: NativeHistoryScope) {
  const privateRoot = path.join(f.root, "private-artwork");
  assert.ok(privateRoot.startsWith(path.resolve(f.out, "owned-temp") + path.sep));
  await mkdir(privateRoot, { recursive: true }); process.env.SERRIAN_ASSET_ROOT = privateRoot;
  const { changeAtlasAsset, getAssetImage, getAssetLibrary } = await import("../src/features/worlds/atlas-asset-service");
  const { nativeContentRequest } = await import("../src/features/worlds/native-map-history-api");
  const { nativeHistoryUrl } = await import("../src/features/worlds/native-map-history");
  const assetId = randomUUID(), unusedId = randomUUID();
  const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 30, g: 80, b: 120, alpha: 1 } } }).png().toBuffer();
  const original = await changeAtlasAsset("world-god", f.world, { action: "import", requestId: randomUUID(), assetId, revision: 0, filename: "historical-original.png", mime: "image/png", metadata: defaultAssetMetadata("Historical original private image") }, png);
  await changeAtlasAsset("world-god", f.world, { action: "import", requestId: randomUUID(), assetId, revision: original.revision, filename: "later-unused-version.png", mime: "image/png", metadata: defaultAssetMetadata("Later unreferenced private image version") }, png);
  await changeAtlasAsset("world-god", f.world, { action: "import", requestId: randomUUID(), assetId: unusedId, revision: 0, filename: "private-unreferenced.png", mime: "image/png", metadata: defaultAssetMetadata("Private unreferenced library record") }, png);
  const baselineRows = (await f.pool.query("select * from atlas_asset_usage where world_id=$1 order by asset_id,asset_version", [f.world])).rows;
  const layer = { version: 1, placements: [{ id: randomUUID(), assetId, version: 1, name: "Retained original", x: 40, y: 40, width: 30, height: 30, rotation: 0, opacity: 1, flipX: false, flipY: false, visible: true, locked: false, tier: "overlay" }] };
  const command = { action: "compose", requestId: randomUUID(), target: { kind: "town", id: scope.target.id }, revision: 0, layer };
  const send = () => nativeContentRequest(new Request("http://owned.invalid" + nativeHistoryUrl(`/api/worlds/${f.world}/assets`, scope), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) }), "world-god");
  const accepted = await send(); assert.deepEqual(await send(), accepted);
  assert.deepEqual((await f.pool.query("select * from atlas_asset_usage where world_id=$1 order by asset_id,asset_version", [f.world])).rows, baselineRows);
  const library = await getAssetLibrary("world-admin", f.world, true);
  assert.equal(library.canEdit, false); assert.deepEqual(library.assets.map(asset => asset.id), [assetId]);
  assert.deepEqual(library.assets[0].versions.map(version => version.version), [1]); assert.equal(library.assets[0].headVersion, 1);
  assert.ok((await getAssetImage("world-admin", f.world, assetId, 1, "128", true)).length);
  await assert.rejects(getAssetImage("world-admin", f.world, assetId, 2, "128", true), /unavailable/);
  await assert.rejects(getAssetImage("world-admin", f.world, unusedId, 1, "128", true), /unavailable/);
  await assert.rejects(getAssetImage("other-god", f.world, assetId, 1, "128"), /unavailable/);
  assert.equal(JSON.stringify(library).includes("Later unreferenced"), false); assert.equal(JSON.stringify(library).includes("Private unreferenced"), false);
  await writeFile(path.join(f.out, "historical-private-artwork.json"), JSON.stringify({ passed: true, ownedPrivateFiles: true, historicalOnlyComposition: true, exactRetry: true, baselineUsageRowsExact: true, explicitAdminReviewOnlyRetainedVersion: true, unusedVersionAndAssetWithheld: true, otherWorldOwnerDenied: true, privateRoot, assetId, sourceVersion: 1, sharedDatabaseAccess: false }, null, 2));
}
