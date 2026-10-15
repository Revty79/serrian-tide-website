import assert from "node:assert/strict";
import {test} from "node:test";
import {sameGeographicPreview,sameRasterPreview,type GeographicPreviewStatus} from "./thumbnail-refresh";
import type {GeographicViewport} from "./geographic";
import type {RasterView} from "./raster";

const view={previewReader:"owner",sourceId:"source",versionId:"original",stamp:"old-authorization",archived:false,preferences:{visible:true,opacity:.7,style:"tint"},grid:{width:270,height:135,bounds:[-180,-90,180,90]},level:{factor:80,width:270,height:135},tiles:[{key:"tint/80/0-0.webp"}]} as RasterView;
test("fresh authorization can retain the same original pixels after unrelated stamps or opacity change",()=>{
 const next={...view,stamp:"fresh-authorization",viewRevision:2,preferences:{...view.preferences,opacity:.3}};
 assert.equal(sameRasterPreview(view,next),true);
 assert.equal(sameRasterPreview(view,{...next,preferences:{...next.preferences,style:"shaded"}}),false);
});
test("preview pixels cannot cross readers, immutable originals, grids, tile plans or revoked access",()=>{
 for(const next of [null,{...view,previewReader:"other"},{...view,previewReader:undefined},{...view,versionId:"revised"},{...view,sourceId:"other"},{...view,archived:true},{...view,preferences:{...view.preferences,visible:false}},{...view,grid:{...view.grid,width:100}},{...view,tiles:[]},{...view,level:{...view.level,factor:40}}])assert.equal(sameRasterPreview(view,next),false);
 assert.equal(sameRasterPreview(null,view),false);
});
const status:GeographicPreviewStatus={previewReader:"owner",context:"eligible-heads",canEdit:true,layer:{mapId:"map",mapName:"Old title",surface:{id:"surface",name:"Earth",realmId:null,protected:false,reference:{version:1,kind:"sphere",units:"degrees",crs:"EPSG:4326"}}}};
test("artwork titles and revisions do not invalidate unchanged geographic paths",()=>{
 assert.equal(sameGeographicPreview(status as GeographicViewport,{...status,layer:{...status.layer,mapName:"New title"}}),true);
});
test("geographic status invalidates changed sources, permissions, readers and surface contexts",()=>{
 for(const next of [{...status,context:"new-heads"},{...status,previewReader:"other"},{...status,canEdit:false},{...status,layer:{...status.layer,mapId:"other"}},{...status,layer:{...status.layer,surface:{...status.layer.surface,protected:true}}}])assert.equal(sameGeographicPreview(status as GeographicViewport,next),false);
});
