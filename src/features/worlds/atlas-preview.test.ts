import assert from "node:assert/strict";
import {test} from "node:test";
import {atlasPreviewBundle} from "./atlas-preview";
import {type AtlasBundle,type AtlasMap,type GeographyRecord} from "./atlas";
test("thumbnail responses trim unrelated geographic catalog records without adding filtered-out artwork",()=>{
 const map={id:"map",name:"Test",description:"",scope:"world",width:2000,height:1200,revision:1,archived:false,features:[{id:"feature",geographyId:"place",archived:false,geometry:{version:1,type:"point",point:{x:1,y:2}}}],drawings:[]} as AtlasMap,bundle={canEdit:false,maps:[map,{...map,id:"other"}],geographies:[{id:"place",name:"Included"},{id:"private",name:"Not represented"}] as GeographyRecord[],connections:[]} as AtlasBundle,original=structuredClone(bundle);
 const preview=atlasPreviewBundle(bundle,"map");assert.equal(preview.maps.length,1);assert.deepEqual(preview.geographies.map(g=>g.id),["place"]);assert.equal(atlasPreviewBundle(bundle,"unavailable").maps.length,0);assert.deepEqual(bundle,original);
});
