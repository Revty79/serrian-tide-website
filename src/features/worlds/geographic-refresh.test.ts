import assert from "node:assert/strict";
import test from "node:test";
import {sameGeographicViewport,type GeographicViewport,type GeographicViewportStatus} from "./geographic";

const status:GeographicViewportStatus={readerId:"owner",context:"authorized-heads",canEdit:true,layer:{mapId:"map",mapName:"Map",surface:{id:"surface",name:"Original surface",protected:false,realmId:null,reference:{version:1,kind:"plane",crs:"AUTHORED:test",units:"paces",bounds:[0,0,2000,1200]}}}};
test("unchanged freshly authorized heads retain a completed viewport, including empty display extents",()=>{
 const view={...status,bounds:[1800,1000,1900,1100],projection:"planar",lod:"detail",shapes:[],attributions:[],nextCursor:null} as GeographicViewport;
 assert.equal(sameGeographicViewport(view,status),true);
 assert.equal(sameGeographicViewport(view,{...status,layer:{...status.layer,mapName:"Renamed artwork"}}),true);
});
test("viewport reuse cannot cross readers, old payloads, source changes, permissions or surface protection/reference",()=>{
 const view=status as GeographicViewport;
 for(const next of [{...status,readerId:undefined},{...status,readerId:"other"},{...status,context:"revised-heads"},{...status,canEdit:false},{...status,layer:{...status.layer,mapId:"other"}},{...status,layer:{...status.layer,surface:{...status.layer.surface,protected:true}}},{...status,layer:{...status.layer,surface:{...status.layer.surface,realmId:"restricted-realm"}}},{...status,layer:{...status.layer,surface:{...status.layer.surface,reference:{version:1 as const,kind:"plane" as const,crs:"AUTHORED:other",units:"other units",bounds:[0,0,2000,1200] as [number,number,number,number]}}}}])assert.equal(sameGeographicViewport(view,next),false);
 assert.equal(sameGeographicViewport({...view,readerId:undefined},status),false);
});
