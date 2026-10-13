import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { draftOf, mapDraftSchema, type AtlasBundle } from "./atlas";
import { defaultSettlementState } from "./settlement";
import { SettlementScene } from "./settlement-scene";
import { historicalConditions, placeIsPresent } from "./historical-places";
import { projectOrdinarySettlement } from "./historical-settlement-projection";

function fixture():AtlasBundle {
 const settlement=id(),building=id(),district=id(),future=id(),child=id(),map=id(),destination=id();
 return {canEdit:true,geographies:[settlement,building,district,future,child].map((gid,i)=>({id:gid,revision:1,name:["Town","HOUSE_SECRET_ABSENT","DISTRICT_SECRET_ABSENT","FUTURE_SHARED_BUILDING","INVERSE_CHILD"][i],description:"Local description",kind:"location",context:i===0?"settlement":"building site",parentId:i===0?null:i===4?building:settlement,archived:false})),
 maps:[{id:map,name:"Town chart",description:"",mapKind:"settlement",geographyId:settlement,scope:"local",width:2000,height:1200,revision:1,archived:false,features:[],drawings:[],settlementState:defaultSettlementState(),settlementEntities:[{geographyId:building,revision:1,kind:"building",classification:"home",districtIds:[district]},{geographyId:district,revision:1,kind:"district",classification:"",districtIds:[]}],settlementShapes:[building,district].map(gid=>({version:1,id:id(),geographyId:gid,archived:false,variant:"plain",type:"area",points:[[300,300],[900,300],[900,800],[300,800]].map(([x,y])=>({id:id(),x,y}))})),historicalPlaces:[{geographyId:settlement,condition:"present"},{geographyId:building,condition:"present"},{geographyId:district,condition:"absent"}]},
 {id:destination,name:"INVERSE_BUILDING_MAP",description:"",geographyId:building,scope:"local",width:2000,height:1200,revision:1,archived:false,features:[]}],connections:[{id:id(),sourceMapId:map,geographyId:building,destinationMapId:destination,revision:1}]};
}
test("historical conditions do not infer existence from archival status",()=>{
 for(const condition of historicalConditions)assert.equal(placeIsPresent([{geographyId:"place",condition}],"place"),["present","abandoned","ruined","rebuilt"].includes(condition));
 assert.equal(placeIsPresent(undefined,"place"),true,"shared baseline remains unchanged");
});
test("real SettlementScene omits unavailable geometry and labels while retaining source",()=>{
 const b=fixture(),m=b.maps[0];
 for(const condition of historicalConditions){m.historicalPlaces![1].condition=condition;const draft=draftOf(m,b.geographies),html=renderToStaticMarkup(<svg><SettlementScene draft={draft}/></svg>);assert.equal(html.includes(m.settlementShapes![0].id),placeIsPresent(m.historicalPlaces,m.historicalPlaces![1].geographyId));assert.equal(html.includes("DISTRICT_SECRET_ABSENT"),false);assert.equal(draft.settlementShapes!.length,2);}
});
test("whole-settlement absence hides all real settlement shapes",()=>{
 const b=fixture(),m=b.maps[0];m.historicalPlaces![0].condition="destroyed";
 assert.equal(renderToStaticMarkup(<svg><SettlementScene draft={draftOf(m,b.geographies)}/></svg>).includes("data-settlement="),false);
});
test("another settlement in background geography cannot replace the authored subject condition",()=>{
 const b=fixture(),m=b.maps[0];m.historicalPlaces![0].condition="destroyed";
 const other={...b.geographies[0],id:id(),name:"Another settlement"};b.geographies.unshift(other);
 m.features.push({id:id(),geographyId:other.id,archived:false,geometry:{version:1,type:"point",point:{x:100,y:100}}});
 assert.equal(renderToStaticMarkup(<svg><SettlementScene draft={draftOf(m,b.geographies)}/></svg>).includes("data-settlement="),false);
});
test("ordinary projection removes unavailable names, memberships, later shared places and inverse references",()=>{
 const b=fixture(),m=b.maps[0];m.historicalPlaces![1].condition="destroyed";const original=JSON.stringify(b),filtered=projectOrdinarySettlement(b,m.id),text=JSON.stringify(filtered);
 for(const label of ["HOUSE_SECRET_ABSENT","DISTRICT_SECRET_ABSENT","FUTURE_SHARED_BUILDING","INVERSE_CHILD","INVERSE_BUILDING_MAP"])assert.equal(text.includes(label),false,label);
 assert.equal(filtered.maps[0].settlementShapes!.length,0);assert.equal(filtered.connections!.length,0);assert.equal(filtered.canEdit,false);assert.equal(JSON.stringify(b),original);
});
test("ordinary projection preserves available identities and removes missing district membership",()=>{
 const b=fixture(),filtered=projectOrdinarySettlement(b,b.maps[0].id);
 assert.equal(filtered.maps[0].settlementEntities![0].geographyId,b.maps[0].settlementEntities![0].geographyId);assert.deepEqual(filtered.maps[0].settlementEntities![0].districtIds,[]);assert.equal(filtered.maps[0].settlementShapes!.length,1);
});
test("capturing the settlement subject preserves capacity for the existing 4,128 place entries",()=>{
 const b=fixture(),draft=draftOf(b.maps[0],b.geographies);
 draft.geographies=Array.from({length:4129},(_,i)=>({id:id(),revision:1,name:`Saved place ${i}`,description:"",kind:"location",context:"place",parentId:null}));
 assert.equal(mapDraftSchema.parse(draft).geographies.length,4129);
 draft.geographies.push({...draft.geographies[0],id:id()});assert.equal(mapDraftSchema.safeParse(draft).success,false);
});
