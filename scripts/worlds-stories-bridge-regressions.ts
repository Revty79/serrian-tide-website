/** Reuses the nine 3550 bridge corrections against the additive Phase 6A schema. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type pg from "pg";
import { linkingFixtures, sourceSnapshot } from "./worlds-linking-checks";
export async function storyBridgeRegressions(pool:pg.Pool,directory:string){
  const receipts:string[]=[];
  const links=await import("../src/features/worlds/linking-service"),worlds=await import("../src/features/worlds/world-service"),atlas=await import("../src/features/worlds/atlas-service"),timelines=await import("../src/features/worlds/branching-history-service");
    const fixtures = await linkingFixtures(pool);

    fixtures.publicLink=randomUUID();await links.changeWorldLink("world-god",fixtures.worldId,{action:"save",timelineId:fixtures.primary,id:fixtures.publicLink,draft:{kind:"realm-map",loreId:fixtures.realms[0],mapId:fixtures.maps[0],label:"Preserved authored bridge"}});
    const get = (timelineId = fixtures.primary) => links.getWorldLinks("world-god", fixtures.worldId, timelineId);
    async function rejectUnchanged(command: unknown, message: RegExp) {
      const before = await sourceSnapshot(pool!, true);
      await assert.rejects(links.changeWorldLink("world-god", fixtures.worldId, command), message);
      assert.deepEqual(await sourceSnapshot(pool!, true), before);
    }
    const authored = (await get()).links.find(link => link.id === fixtures.publicLink)!;
    await rejectUnchanged({ action: "exclude", timelineId: fixtures.primary, id: authored.id, revision: authored.revision }, /Only an active connection included/);
    receipts.push("Primary authored exclusion rejected without changing any World database row");
    const independentId = randomUUID();
    await links.changeWorldLink("world-god", fixtures.worldId, { action: "save", timelineId: fixtures.alternate, id: independentId, draft: { ...authored.draft, label: "Independent alternate account" } });
    const independent = (await get(fixtures.alternate)).links.find(link => link.id === independentId)!;
    assert.equal(independent.mode, "authored");
    await rejectUnchanged({ action: "exclude", timelineId: fixtures.alternate, id: independent.id, revision: independent.revision }, /Only an active connection included/);
    receipts.push("Independent alternate exclusion rejected without changing any World database row");
    const inheritedId = randomUUID();
    await links.changeWorldLink("world-god", fixtures.worldId, { action: "save", timelineId: fixtures.primary, id: inheritedId, draft: { ...authored.draft, label: "Retained parent account" } });
    const parent = (await get()).links.find(link => link.id === inheritedId)!;
    const include = (revision?: number) => links.changeWorldLink("world-god", fixtures.worldId, { action: "include", timelineId: fixtures.alternate, id: parent.id, sourceVersionId: parent.versionId, sourceRevision: parent.revision, revision });
    await include();
    const inherited = (await get(fixtures.alternate)).links.find(link => link.id === parent.id)!;
    assert.equal(inherited.mode, "inherited");
    const retained = (await pool.query("select to_jsonb(t) row from world_link_version t where link_id=$1 order by id", [parent.id])).rows;
    await links.changeWorldLink("world-god", fixtures.worldId, { action: "exclude", timelineId: fixtures.alternate, id: inherited.id, revision: inherited.revision });
    const excluded = (await get(fixtures.alternate)).links.find(link => link.id === parent.id)!;
    assert.equal(excluded.mode, "excluded");assert.equal(excluded.revision, inherited.revision + 1);assert.equal(excluded.versionId, inherited.versionId);assert.deepEqual(excluded.source, inherited.source);
    assert.deepEqual((await pool.query("select to_jsonb(t) row from world_link_version t where link_id=$1 order by id", [parent.id])).rows, retained);
    assert.deepEqual((await get()).links.find(link => link.id === parent.id), parent);
    receipts.push("Valid inherited exclusion changes only the branch head, preserving parent, identity and immutable source/version");
    await rejectUnchanged({ action: "exclude", timelineId: fixtures.alternate, id: excluded.id, revision: inherited.revision }, /newer connection/);
    await rejectUnchanged({ action: "exclude", timelineId: fixtures.alternate, id: excluded.id, revision: excluded.revision }, /Only an active connection included/);
    receipts.push("Repeated exclusions rejected safely with both stale and current revisions");
    await include(excluded.revision);
    let interpretation = (await get(fixtures.alternate)).links.find(link => link.id === parent.id)!;
    assert.equal(interpretation.mode, "inherited");assert.equal(interpretation.versionId, parent.versionId);
    await links.changeWorldLink("world-god", fixtures.worldId, { action: "save", timelineId: fixtures.alternate, id: interpretation.id, revision: interpretation.revision, draft: { ...interpretation.draft, label: "Independent interpreted parent account" } });
    interpretation = (await get(fixtures.alternate)).links.find(link => link.id === parent.id)!;
    assert.equal(interpretation.mode, "interpretation");assert.deepEqual(interpretation.source, parent.source);
    await rejectUnchanged({ action: "exclude", timelineId: fixtures.alternate, id: interpretation.id, revision: interpretation.revision }, /Only an active connection included/);
    for (const id of [independent.id, interpretation.id]) {
      let record = (await get(fixtures.alternate)).links.find(link => link.id === id)!;
      const source = record.source, mode = record.mode;
      await links.changeWorldLink("world-god", fixtures.worldId, { action: "archive", timelineId: fixtures.alternate, id, revision: record.revision });
      record = (await get(fixtures.alternate)).links.find(link => link.id === id)!;assert.equal(record.archived, true);
      await rejectUnchanged({ action: "exclude", timelineId: fixtures.alternate, id, revision: record.revision }, /Only an active connection included/);
      await links.changeWorldLink("world-god", fixtures.worldId, { action: "restore", timelineId: fixtures.alternate, id, revision: record.revision });
      record = (await get(fixtures.alternate)).links.find(link => link.id === id)!;
      assert.equal(record.archived, false);assert.equal(record.mode, mode);assert.deepEqual(record.source, source);
    }
    receipts.push("Reinclusion, retained ancestry, independent interpretation and archive/restore preserved; interpreted accounts use archive rather than exclusion");
    console.log("PASS five focused exclusion and recovery groups.");

    const capacityWorld = await worlds.createWorld("world-god", { name: "Disposable eligible capacity fixture" });
    const primary = (await worlds.getWorld("world-god", capacityWorld)).selectedTimeline.id;
    const alternate = await timelines.changeTimeline("world-god", capacityWorld, { action: "create", parentRevision: 1, draft: { name: "Capacity branch", parentId: primary, divergenceYear: 0 } });
    async function seed(count: number, family: "language" | "realm", visibility: "ordinary" | "protected", prefix: string, mode?: "inherited" | "pending" | "excluded") {
      const records = Array.from({ length: count }, (_, index) => ({ id: randomUUID(), version: randomUUID(), name: `${prefix} ${index}`, mode: mode === "pending" && index % 2 ? "excluded" : mode }));
      const json = JSON.stringify(records), client = await pool!.connect();
      try {
        await client.query("begin");
        await client.query("insert into world_lore_identity(id,world_id,family,origin_timeline_id,creator_id,request_id,request_hash) select r.id,$2,$3,$4,'world-god',r.id,'disposable-capacity-fixture' from jsonb_to_recordset($1::jsonb) r(id text)", [json, capacityWorld, family, primary]);
        await client.query("insert into world_lore_version(id,world_id,entity_id,family,timeline_id,author_id,historical_time,accuracy,narrative,visibility) select r.version,$2,r.id,$3,$4,'world-god','{\"version\":1,\"scale\":\"world-year\",\"kind\":\"undated\"}'::jsonb,'unverified','recorded',$5 from jsonb_to_recordset($1::jsonb) r(id text,version text)", [json, capacityWorld, family, primary, visibility]);
        // Only these two existing typed family tables are permitted in this local bulk fixture.
        const table = family === "realm" ? "world_realm_version" : "world_language_version";
        await client.query(`insert into ${table}(version_id,world_id,name) select r.version,$2,r.name from jsonb_to_recordset($1::jsonb) r(version text,name text)`, [json, capacityWorld]);
        await client.query("insert into world_lore_head(world_id,timeline_id,entity_id,version_id,revision,mode) select $2,$3,r.id,r.version,1,'authored' from jsonb_to_recordset($1::jsonb) r(id text,version text)", [json, capacityWorld, primary]);
        if (mode) await client.query("insert into world_lore_head(world_id,timeline_id,entity_id,version_id,revision,mode,source_timeline_id,source_version_id,source_revision) select $2,$3,r.id,r.version,1,r.mode,$4,r.version,1 from jsonb_to_recordset($1::jsonb) r(id text,version text,mode text)", [json, capacityWorld, alternate, primary]);
        await client.query("commit");for(const fixtureTable of ["world_lore_head","world_lore_version","world_lore_identity",table])await pool.query(`analyze ${fixtureTable}`);return records;
      } catch (error) { await client.query("rollback");throw error; } finally { client.release(); }
    }
    await seed(2001, "language", "ordinary", "Unrelated language", "inherited");
    const eligible = await seed(2, "realm", "ordinary", "Visible Realm", "inherited");
    let bundle = await links.getWorldLinks("world-god", capacityWorld, primary);
    assert.equal(bundle.choices.lore.length, 2);assert.ok(bundle.choices.lore.every(record => record.family === "realm"));
    const map = await atlas.changeAtlas("world-god", capacityWorld, { action: "create", name: "Capacity map", description: "", scope: "world" });
    await links.changeWorldLink("world-god", capacityWorld, { action: "save", timelineId: primary, id: randomUUID(), draft: { kind: "realm-map", loreId: eligible[0].id, mapId: map, label: "Small eligible collection remains usable" } });
    receipts.push("2001 unrelated lore records do not consume eligible capacity or prevent real connection saves");
    await seed(1998, "realm", "ordinary", "Additional Realm", "inherited");
    for (const ordinary of [false, true]) {
      bundle = await links.getWorldLinks("world-god", capacityWorld, primary, false, ordinary);
      assert.equal(bundle.choices.lore.length, 2000);assert.equal(bundle.links.length, 1);
    }
    receipts.push("Exactly 2000 eligible records supported in author and ordinary views without truncation");
    await seed(1, "realm", "ordinary", "Over limit Realm");
    for (const ordinary of [false, true]) await assert.rejects(links.getWorldLinks("world-god", capacityWorld, primary, false, ordinary), error => {
      assert.equal((error as { status: number }).status, 409);assert.match((error as Error).message, /Too many records/);return true;
    });
    receipts.push("2001 eligible records return an explicit 409 limit response in author and ordinary views");
    await seed(2001, "realm", "protected", "SECRET_CAPACITY_REALM", "inherited");
    await seed(2001, "realm", "ordinary", "UNAVAILABLE_CAPACITY_REALM", "pending");
    bundle = await links.getWorldLinks("world-god", capacityWorld, alternate, false, true);
    assert.equal(bundle.choices.lore.length, 2000);assert.equal(bundle.links.length, 0);
    assert.ok(!JSON.stringify(bundle).includes("SECRET_CAPACITY"));assert.ok(!JSON.stringify(bundle).includes("UNAVAILABLE_CAPACITY"));assert.ok(!JSON.stringify(bundle).includes("Unrelated language"));
    receipts.push("2001 protected and 2001 pending/excluded records consume no ordinary capacity or selector/inverse/count disclosure");
    console.log("PASS four focused eligible-capacity and privacy groups.");

  assert.equal(receipts.length,9);
  await writeFile(`${directory}/bridge-correction-results.json`,JSON.stringify({total:receipts.length,receipts},null,2)+"\n");
}
