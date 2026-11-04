import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
async function main(){const receipt=JSON.parse(await readFile(process.argv[2],"utf8"));
const {getCrafts}=await import("../src/features/worlds/craft-service"),{getAssetComposition,getAssetImage}=await import("../src/features/worlds/atlas-asset-service");
const b=await getCrafts("world-god",(await(await import("../src/db")).db.execute((await import("drizzle-orm")).sql`select world_id from world_craft where id=${receipt.craftId}`)).rows[0].world_id as string,{craftId:receipt.craftId,surface:receipt.decks[0]});
assert.equal(b.deck!.id,receipt.decks[0]);assert.equal(b.decks.length,3);assert.ok(b.connections.length>=2);assert.equal((await getAssetComposition("world-god",b.worldId,{kind:"craft-deck",id:receipt.decks[0]})).layer.placements[0].assetId,receipt.assetId);assert.ok((await getAssetImage("world-god",b.worldId,receipt.assetId,1,"128")).length);console.log("Restored craft/deck/routes and paired private image reads pass.");}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await(await import("../src/db")).pool.end();});
