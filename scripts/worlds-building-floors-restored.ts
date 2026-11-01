import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
async function main(){
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.notEqual(url.port,"5432");assert.equal(url.pathname,"/serrian_building_floors_restored");
const receipt=JSON.parse(await readFile(process.argv[2],"utf8")),{getBuildingFloors}=await import("../src/features/worlds/building-floor-service"),{readWorldBusiness}=await import("../src/features/worlds/world-business-service");
for(const floorId of [receipt.groundId,receipt.upperId,receipt.basementId]){const bundle=await getBuildingFloors("world-god",receipt.worldId,{townMapId:receipt.townMap,featureId:receipt.generatedFeature,floorId});assert.equal(bundle.document!.id,floorId);assert.equal(bundle.building!.id,receipt.buildingId);assert.ok(bundle.document!.design.features.length>2);assert.ok(bundle.document!.history.length>0);}
const business=await readWorldBusiness("world-god",receipt.worldId);assert.ok(business.shops.some(s=>s.id===receipt.shopId));assert.ok(business.places.some(p=>p.id===receipt.placeId));const {pool}=await import("../src/db");await pool.end();console.log("PASS fresh-process restored interior identities, layouts, history and original commerce");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
