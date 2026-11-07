import assert from "node:assert/strict";
import {test} from "node:test";
import {consumptionGeometrySchema,consumptionManifestSchema,consumptionPinSchema,consumptionResourceSchema,consumptionToParent} from "./atlas-map-consumption";
import {consumptionFloorDesign,consumptionTownDesign,consumptionUndergroundDesign} from "./atlas-map-consumption-projection";
import {emptyFloor} from "./building-floor";
import {townToWorld,emptyTownDesign} from "./town-map";
import {emptyUnderground} from "./underground";
const id="71000000-0000-4000-8000-000000000001",other="71000000-0000-4000-8000-000000000002",hash="a".repeat(64);
const source={worldId:id,target:{kind:"floor",id} as const,timelineId:id,year:0,stateId:id,versionId:id};
const pin={schema:"serrian-atlas-map",schemaVersion:1,projectionVersion:1,source,sha256:hash} as const;
function manifest(){return {schema:"serrian-atlas-map",schemaVersion:1,projectionVersion:1,stage:"accepted-saved",publication:"not-published",readOnly:true,source,family:"floor",sourceRevision:3,history:{originTimelineId:id,startYear:-100,endYear:100,coverage:"established",archived:false},coordinates:{system:"local-metres",unit:"metre",elevationUnit:"metre",x:"right",y:"down",width:20,height:10,wrapX:false,sampleOrigin:"grid-node",parent:null},provenance:{kind:"authored-world",sourceWorldId:null,sourceTimelineId:null,sourceTarget:null,sourceVersionId:null},resources:[{key:"geometry",kind:"geometry",componentId:id,sourceSha256:hash,sha256:hash,bytes:200}],connections:{count:0,resourceKey:null},records:[],omissions:["no-publication-approval"],pin};}
test("only the explicit supported saved schema can be consumed",()=>{
 assert.ok(consumptionManifestSchema.safeParse(manifest()).success);
 for(const change of [{schemaVersion:2},{projectionVersion:2},{stage:"working"},{stage:"published-consumer"},{publication:"approved"},{readOnly:false}])assert.equal(consumptionManifestSchema.safeParse({...manifest(),...change}).success,false);
 assert.equal(consumptionPinSchema.safeParse({...pin,publicationId:id}).success,false);
});
test("pin identity, source family and unknown historical coverage are explicit",()=>{
 assert.equal(consumptionManifestSchema.safeParse({...manifest(),pin:{...pin,source:{...source,versionId:other}}}).success,false);
 assert.equal(consumptionManifestSchema.safeParse({...manifest(),family:"town"}).success,false);
 assert.equal(consumptionManifestSchema.safeParse({...manifest(),history:{originTimelineId:id,startYear:1,endYear:5,coverage:"established",archived:false}}).success,false);
 assert.ok(consumptionManifestSchema.safeParse({...manifest(),history:{originTimelineId:id,startYear:1,endYear:5,coverage:"unknown",archived:false}}).success);
});
test("resource keys, destination references and family structures are validated",()=>{
 assert.equal(consumptionManifestSchema.safeParse({...manifest(),resources:[...manifest().resources,...manifest().resources]}).success,false);
 assert.equal(consumptionResourceSchema.safeParse({kind:"connections",target:source.target,value:[{id,kind:"entrance",twoWay:true,source:{target:{kind:"town",id:other},versionId:id,geographyVersionId:null,entranceId:null,point:{x:0,y:0}},destination:{target:{kind:"town",id:other},versionId:id,geographyVersionId:null,entranceId:null,point:{x:0,y:0}}}]}).success,false);
 assert.equal(consumptionGeometrySchema.safeParse({family:"floor",buildingId:id,frame:{width:10,height:10},elevation:null,order:0,design:emptyTownDesign()}).success,false);
 assert.equal(consumptionResourceSchema.safeParse({kind:"numerical",file:"../../private.i16"}).success,false);
});
test("physical centre rotation and wrapped World coordinates match native Town geometry",()=>{
 for(const rotation of [-180,-73,0,36,180])for(const x of [0,7,100]){
  const frame={x:997,y:20,width:100,height:50,rotation},point={x,y:13},world={width:1000,wrap:true};
  assert.deepEqual(consumptionToParent(point,frame,world),townToWorld(point,frame,world));
 }
});
test("ordinary floors keep exact geometry but remove hidden, absent and orphaned shapes and raw destinations",()=>{
 const design=emptyFloor();design.features=[{version:1,id,entityId:id,name:"stairs",archived:false,variant:"object",kind:"transition",point:{x:3,y:4},width:1,height:1,rotation:0,symbol:"stairs",destination:{floorId:other,point:{x:2,y:3}}}];
 const before=structuredClone(design),projected=consumptionFloorDesign(design);assert.deepEqual(projected.features[0],{...design.features[0],destination:null});assert.deepEqual(design,before);
 assert.equal(consumptionFloorDesign(design,[{id,condition:"destroyed",account:"private note"}]).features.length,0);
 design.layers.transitions.visible=false;assert.equal(consumptionFloorDesign(design).features.length,0);
});
test("ordinary underground projection excludes secret rooms and confidential notes without modifying sources",()=>{
 const design=emptyUnderground();design.features=[{version:1,id,entityId:id,name:"public room",archived:false,variant:"area",kind:"room",points:[{id,x:1,y:1},{id:other,x:8,y:1},{id:"71000000-0000-4000-8000-000000000003",x:8,y:8}]}];
 design.attributes[id]={category:"room",visibility:"ordinary",notes:"CONFIDENTIAL",material:"stone",width:1};
 const before=structuredClone(design),ordinary=consumptionUndergroundDesign(design);assert.equal(ordinary.attributes[id].notes,"");assert.deepEqual(ordinary.features,design.features);assert.deepEqual(design,before);
 design.attributes[id].visibility="secret";assert.deepEqual(consumptionUndergroundDesign(design).features,[]);
});
test("authored Town visibility remains separate from source geometry",()=>{const design=emptyTownDesign(),copy=consumptionTownDesign(design);assert.deepEqual(design,copy);assert.notEqual(design,copy);});
test("numeric references cannot duplicate tiles or point outside their accepted grid",()=>{
 const geometry={family:"world",settings:{gridWidth:32,gridHeight:32,widthKm:1,heightKm:1,wrap:false,minElevation:-12000,maxElevation:12000},terrainId:id,revision:1,baseElevation:0,seaLevel:0,tiles:[{x:0,y:0,lod:0,sha256:hash,bytes:2048,encoding:"i16le-v1"}],region:null};
 assert.ok(consumptionResourceSchema.safeParse({kind:"geometry",value:geometry}).success);
 assert.equal(consumptionResourceSchema.safeParse({kind:"geometry",value:{...geometry,tiles:[...geometry.tiles,...geometry.tiles]}}).success,false);
 assert.equal(consumptionResourceSchema.safeParse({kind:"geometry",value:{...geometry,tiles:[{...geometry.tiles[0],x:1}]}}).success,false);
});
test("craft outlines must resolve within the included plan",()=>{
 const value={family:"deck",craftId:id,frame:{width:20,height:10},height:null,order:-1,outlineId:id,plan:emptyFloor()};
 assert.equal(consumptionResourceSchema.safeParse({kind:"geometry",value}).success,false);
 assert.ok(consumptionResourceSchema.safeParse({kind:"geometry",value:{...value,outlineId:null}}).success);
});
