import assert from "node:assert/strict";
import test from "node:test";
import {nativeMapNavigationDestination} from "./native-map-navigation";
const world="11111111-1111-4111-8111-111111111111",current=`https://example.invalid/worlds/${world}?tab=atlas&atlasYear=500`;
test("same-World floor to dungeon keeps the exact dated destination and editor tab",()=>{
 const path=`/worlds/${world}?tab=atlas&undergroundNew=1&atlasYear=500&atlasTimeline=timeline&atlasEditing=1&undergroundSource=%7B%22kind%22%3A%22interior%22%7D&undergroundSourceRevision=4`;
 const plan=nativeMapNavigationDestination(current,path);assert.equal(plan.retainEditor,true);assert.equal(plan.path,path);
});
test("retained craft routes preserve exact version, return and arrival bindings",()=>{
 const path=`/worlds/${world}?tab=atlas&craft=ship&craftDeck=deck&atlasVersion=version&atlasConnectionSource=source&craftArrival=%7B%22x%22%3A3%7D#map`;
 assert.deepEqual(nativeMapNavigationDestination(current,path),{href:"https://example.invalid"+path,path,retainEditor:true});
});
test("another World and another site cannot inherit this World's editing tab",()=>{
 assert.equal(nativeMapNavigationDestination(current,"/worlds/22222222-2222-4222-8222-222222222222?tab=atlas").retainEditor,false);
 assert.equal(nativeMapNavigationDestination(current,`https://other.invalid/worlds/${world}`).retainEditor,false);
});
test("registry and retired Atlas routes use ordinary document navigation",()=>{
 assert.equal(nativeMapNavigationDestination(current,"/worlds").retainEditor,false);assert.equal(nativeMapNavigationDestination(current,`/worlds/${world}/atlas/retired`).retainEditor,false);
});
