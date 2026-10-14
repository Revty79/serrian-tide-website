import assert from "node:assert/strict";
import test from "node:test";
import { geographicPages,GeographicPageError } from "./geographic-pages";
import type { GeographicViewport } from "./geographic";
const id=(n:number)=>`${n.toString(16).padStart(8,"0")}-0000-4000-8000-000000000000`;
function page(n:number,last=false):GeographicViewport{return {layer:{mapId:id(0),mapName:"Current map",surface:{id:id(1),name:"Earth",realmId:null,protected:false,reference:{version:1,kind:"sphere",crs:"EPSG:4326",units:"degrees"}}},canEdit:true,context:"authorized-current-sources",bounds:[-180,-90,180,90],projection:"equirectangular",lod:"detail",shapes:[{id:id(n),versionId:id(n),geographyId:id(n),name:`Source ${n}`,semantic:"physical-geography",revision:1,part:0,geometryType:"Point",path:"M1,1",sourceBounds:[0,0,0,0]}],attributions:[],nextCursor:last?null:`${id(n)}:0`};}
test("full Detailed pagination continues beyond 256 pages and retains successful partial coverage",()=>{
  const pages=geographicPages(id(0));let after="";
  for(let i=1;i<=500;i++){const value=page(i,i===500);pages.append(value,after);after=value.nextCursor??"";}
  assert.equal(pages.value()?.shapes.length,500);assert.equal(pages.value()?.nextCursor,null);
});
test("repeated, empty, duplicate and nonadvancing pages cannot complete or loop silently",()=>{
  for(const invalid of [ {...page(2),nextCursor:`${id(1)}:0`},{...page(2),shapes:[]},{...page(2),shapes:[...page(2).shapes,...page(2).shapes]},page(1)]){
    const pages=geographicPages(id(0));pages.append(page(1),"");assert.throws(()=>pages.append(invalid,`${id(1)}:0`),GeographicPageError);assert.equal(pages.value()?.shapes.length,1);
  }
});
test("changed source protection, access, map, bounds or projection invalidates retained pages",()=>{
  for(const changed of [{...page(2),context:"changed-current-sources"},{...page(2),canEdit:false},{...page(2),layer:{...page(2).layer,mapId:id(3)}},{...page(2),bounds:[0,0,10,10] as GeographicViewport["bounds"]},{...page(2),projection:"mercator" as const}]){
    const pages=geographicPages(id(0));pages.append(page(1),"");assert.throws(()=>pages.append(changed,`${id(1)}:0`),(e:unknown)=>e instanceof GeographicPageError&&e.clear);
  }
  assert.equal(geographicPages(id(0)).value(),null,"retry starts without earlier authorized data");
});
