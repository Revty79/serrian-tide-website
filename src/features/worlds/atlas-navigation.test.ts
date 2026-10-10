import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { geographyDraftSchema, validateParents, type AtlasBundle, type AtlasMap, type GeographyRecord } from "./atlas";
import { geographyPath, navigationIndex, representedPlaces, visitMap } from "./atlas-navigation";
const place=(name:string,parentId:string|null=null):GeographyRecord=>({id:randomUUID(),name,parentId,revision:1,description:"",kind:"location",context:"settlement",archived:false});
const map=(geographyId:string|null,archived=false):AtlasMap=>({id:randomUUID(),name:"Chart",geographyId,archived,description:"",scope:"local",width:2000,height:1200,revision:1,features:[]});
test("several charts share a stable place; archived charts disappear without losing the preferred reference",()=>{
  const p=place("Grayhaven"),a=map(null),b=map(p.id),c=map(p.id,true),bundle:AtlasBundle={maps:[a,b,c],geographies:[p],canEdit:true,connections:[{id:randomUUID(),sourceMapId:a.id,geographyId:p.id,destinationMapId:c.id,revision:1}]};
  const index=navigationIndex(bundle);assert.deepEqual(index.destinations.get(p.id)?.map(m=>m.id),[b.id]);assert.equal(index.preferred.get(`${a.id}:${p.id}`),c.id);assert.ok(representedPlaces(a,bundle).has(p.id));
  c.archived=false;assert.equal(navigationIndex(bundle).destinations.get(p.id)?.length,2);p.name="New Grayhaven";assert.equal(navigationIndex(bundle).places.get(p.id)?.name,p.name);
});
test("geographic ancestry is independent of a revisited navigation trail",()=>{
  const continent=place("Valdoria"),region=place("Ashenfall",continent.id),town=place("Grayhaven",region.id);
  assert.deepEqual(geographyPath(town.id,[town,continent,region]).map(p=>p.id),[continent.id,region.id,town.id]);
  assert.deepEqual(visitMap(["world","continent","region","town"],"continent"),["world","continent"]);assert.equal(visitMap(Array.from({length:40},(_,i)=>String(i)),"new").length,40);
  continent.parentId=town.id;assert.throws(()=>validateParents([continent,region,town]),/itself/);assert.ok(geographyPath(town.id,[continent,region,town]).length<=3);
});
test("region and future site contexts remain existing location identities with strict authored classification",()=>{
  const p=place("Ashenfall"),draft={id:p.id,revision:p.revision,name:p.name,description:p.description,kind:p.kind,parentId:p.parentId};for(const context of ["region","settlement","building site","interior"])assert.equal(geographyDraftSchema.parse({...draft,context}).context,context);
});
