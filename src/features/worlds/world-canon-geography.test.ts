import test from "node:test";
import assert from "node:assert/strict";
import {canonDefinedIds,canonGeographyRow,canonOrdinaryGeography,canonReferencedIds,remapCanonGeography,rebaseCanonSourcePins} from "./world-canon-geography";
import type {HydroSources} from "./terrain-hydrology";
const source="005c6430-1920-4bd8-86a2-994809750cbc",target="c8ac7a63-af51-4775-8d5d-9ad285ce3f45";
test("independent geography remaps forward links, native resource keys and keyed attributes without changing coordinates",()=>{
 const value={id:source,point:{x:192.5,y:-5},attributes:{[source]:{notes:""}},destination:{floorId:source},key:"refinement:"+source,parentPin:"source:"+source+":17",route:"craft-route:"+source};
 const mapped=remapCanonGeography(value,new Map([[source,target]]));assert.deepEqual(mapped,{id:target,point:{x:192.5,y:-5},attributes:{[target]:{notes:""}},destination:{floorId:target},key:"refinement:"+target,parentPin:"source:"+target+":17",route:"craft-route:"+target});assert.equal(value.id,source);assert.ok(canonReferencedIds(value).has(source));assert.ok(canonDefinedIds(value).has(source));
});
test("private creator notes, hidden records and unrelated catalog bindings cannot enter ordinary copies",()=>{
 assert.deepEqual(canonOrdinaryGeography({privateConnection:{name:"Hidden route account",protected:true,startYear:12,endYear:18,status:"available",account:"Confidential route source"},notes:"secret",privateNotes:"secret",godNotes:"secret",story:{visibility:"protected",account:"secret"},calendarSource:{private:"source"},shopLocationId:source,features:[{id:source,visibility:"ordinary",x:5},{visibility:"secret",x:9}]}),{notes:"",privateNotes:"",godNotes:"",calendarSource:null,shopLocationId:null,features:[{id:source,visibility:"ordinary",x:5}]});
});
test("independent native heads retain geography but reset current counters, author and confidential import metadata",()=>{
 const row=canonGeographyRow("world_terrain_version",{terrain_id:source,revision:42,previous_revision:41,sea_level:-20,source:{kind:"imported",fileName:"private local path"},author_id:"owner"},"player");
 assert.equal(row.revision,1);assert.equal(row.previous_revision,null);assert.deepEqual(row.source,{kind:"manual"});assert.equal(row.sea_level,-20);assert.equal(row.author_id,"player");
});
test("ordinary historical composition excludes private image pins and private histories",()=>{
 const row=canonGeographyRow("world_map_state_component",{id:source,revision:12,kind:"composition",payload:{revision:12,history:[{private:true}],layer:{placements:[{assetId:source},{assetId:"builtin:tree"}]}}},"player");
 assert.equal(row.revision,12);assert.deepEqual((row.payload as {layer:unknown}).layer,{placements:[{assetId:"builtin:tree"}]});assert.deepEqual((row.payload as {history:unknown}).history,[]);
});
test("independent current pins rebase without falsely refreshing a stale analysis",()=>{
 const before={fingerprint:"a".repeat(64),rootRevision:42} as HydroSources,after={fingerprint:"b".repeat(64),rootRevision:1,sources:[{id:target,revision:1,contentHash:"c".repeat(64)}]} as HydroSources;
 const values=[{fingerprint:before.fingerprint,rootRevision:42,pins:[{id:target,revision:42,contentHash:"c".repeat(64)}]},{fingerprint:"d".repeat(64),rootRevision:40,pins:[{id:target,revision:40,contentHash:"e".repeat(64)}]}];
 assert.deepEqual(rebaseCanonSourcePins(values,before,after),[{fingerprint:after.fingerprint,rootRevision:1,pins:[{id:target,revision:1,contentHash:"c".repeat(64)}]},{fingerprint:"d".repeat(64),rootRevision:40,pins:[{id:target,revision:40,contentHash:"e".repeat(64)}]}]);
});

test("minimal pinned numerical ancestry retains its new contiguous counters and exact parent pins",()=>{
 const row=canonGeographyRow("world_terrain_refinement_version",{revision:42,previous_revision:41,parent_revision:18,root_revision:26,restored_from_revision:7,source:{kind:"manual"},__copy_revision:3,__copy_parent_revision:2,__copy_root_revision:4},"player");
 assert.equal(row.revision,3);assert.equal(row.previous_revision,2);assert.equal(row.parent_revision,2);assert.equal(row.root_revision,4);assert.equal(row.restored_from_revision,null);
});

test("historical numerical source recipes and unrelated lore pickers are removed from editable copies",()=>{
 const row=canonGeographyRow("world_map_state_component",{id:source,kind:"places",payload:{version:{source:{kind:"imported",fileName:"confidential-source.png",sha256:"a".repeat(64)}},references:{cultures:[{id:source,name:"Confidential culture"}],governments:[{id:source,name:"Protected government"}],history:[{id:source,name:"Hidden source"}],timelineId:target}}},"player");
 assert.deepEqual((row.payload as {version:unknown}).version,{source:{kind:"manual"}});assert.deepEqual((row.payload as {references:unknown}).references,{cultures:[],governments:[],history:[],timelineId:target});
});
