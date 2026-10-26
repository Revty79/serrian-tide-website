import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import type {checkPass7Database} from "./worlds-atlas-pass7-db-checks";
import {DESCRIPTION_EXAMPLE} from "../src/features/worlds/terrain-description";
import {describedRecipe} from "../src/features/worlds/terrain-description-recipe";
import {generateTerrain} from "../src/features/worlds/terrain-generation";
import {terrainGeometry,terrainSettingsSchema,readTile,createGrid} from "../src/features/worlds/terrain";
export async function checkPass8Database(options:Parameters<typeof checkPass7Database>[0]){
 await (await import("./worlds-atlas-pass7-db-checks")).checkPass7Database(options);
 const service=await import("../src/features/worlds/terrain-service"),{world}=options,settings=terrainSettingsSchema.parse({gridWidth:256,gridHeight:256}),shape=terrainGeometry(settings),space={x:0,y:0,width:shape.displayWidth,height:shape.displayHeight,periodX:null},recipe=describedRecipe(DESCRIPTION_EXAMPLE,space,{x:0,y:0,width:space.width,height:space.height});recipe.planConfirmed=true;
 const generated=generateTerrain(shape,recipe,0),tiles=Array.from({length:shape.width*shape.height/1024},(_,key)=>readTile(generated.grid,key,shape)),command={action:"create",requestId:randomUUID(),name:"Pass 8 confirmed authored World",initial:"generated",settings,seaLevel:0,source:{kind:"generated",recipe,scaleAcknowledged:true},tiles};
 await assert.rejects(service.changeTerrain("world-god",world,{...command,requestId:randomUUID(),source:{...command.source,recipe:{...recipe,planConfirmed:false}}}),/Confirm/);await assert.rejects(service.changeTerrain("world-god",world,{...command,requestId:randomUUID(),source:{...command.source,recipe:{...recipe,plan:{...recipe.plan,space:{...space,x:1000}}}}}),/frame/);
 const saved=await service.changeTerrain("world-god",world,command);assert.deepEqual(await service.changeTerrain("world-god",world,command),saved);const doc=(await service.getTerrain("world-god",world,{mapId:saved.id})).document!;assert.deepEqual(doc.source,command.source);assert.deepEqual(createGrid(doc.baseElevation,doc.tiles,shape),generated.grid);const edit=readTile(generated.grid,0,shape);edit.samples[0]++;await service.changeTerrain("world-god",world,{action:"save",requestId:randomUUID(),mapId:saved.id,revision:1,seaLevel:0,tiles:[edit]});assert.deepEqual((await service.getTerrain("world-god",world,{mapId:saved.id})).document!.origin,command.source);
 await writeFile("docs/screenshots/worlds-atlas-pass8/description-persistence.json",JSON.stringify({passed:true,v3StructuredPlanRoundTrip:true,numericalEquality:true,originalProvenanceRetainedAfterSculpt:true,exactRetry:true,unconfirmedRejected:true,foreignFrameRejected:true,newMigrationRequired:false,sharedDatabaseAccess:false},null,2)+"\n");console.log("PASS Pass 8 v3 structured/numerical persistence, original provenance, retry and strict physical-frame admission");
}
