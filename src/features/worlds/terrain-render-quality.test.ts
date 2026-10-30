import {engravingTilePlan} from "./terrain-engraving-plan";
import test from "node:test";
import assert from "node:assert/strict";
import {renderQuality,qualityPixelRatio,environmentPixelTarget} from "./terrain-render-quality";
import {environmentTilePlan} from "./terrain-environment-plan";
import {refinementLogicalBytes} from "./terrain-refinement";
test("device quality is validated, bounded and independent of author records",()=>{
 assert.equal(renderQuality("elaborate"),"balanced");assert.equal(renderQuality("maximum"),"maximum");
 for(const dpr of [1,2,3,NaN])for(const q of ["fast","balanced","detailed","maximum"] as const){assert.ok(qualityPixelRatio(dpr,q)<=2);assert.ok(qualityPixelRatio(dpr,q)>=.5);assert.ok(environmentPixelTarget(.1,q)<=128);}
});
test("high-DPR artwork work is explicit while all DPR1 quality contracts stay exact",()=>{
 const modes=["fast","balanced","detailed","maximum"] as const;assert.deepEqual(modes.map(q=>qualityPixelRatio(1,q)),[.75,1,1.25,1.5]);
 for(const dpr of [2,3,4])assert.deepEqual(modes.map(q=>qualityPixelRatio(dpr,q)),[.75,1,1.5,2]);
});
test("initialized logical bytes include every overview without claiming allocated storage",()=>{
 assert.equal(refinementLogicalBytes(256,256),174080);assert.equal(refinementLogicalBytes(512,512),698368);assert.equal(refinementLogicalBytes(1024,1024),2795520);
});
test("close artwork plans stay bounded at every device quality",()=>{
 const world={width:64,height:64,tileSize:32,displayWidth:1e9,displayHeight:5e8,min:-100,max:100,wrap:true};
 for(const q of ["fast","balanced","detailed","maximum"] as const)for(const scale of [1e-9,.001,1,100]){const plan=environmentTilePlan(world,{left:0,top:0,right:1440/scale,bottom:900/scale,width:1440,height:900,scale},qualityPixelRatio(2,q),environmentPixelTarget(scale,q));assert.ok(plan);assert.ok(plan.unique<=1024);}
});

test("Balanced keeps accepted engraved preparation while richer intermediate lattices are opt-in",()=>{
 const world={width:128,height:128,tileSize:32,displayWidth:64000,displayHeight:64000,min:-12000,max:12000,wrap:false},scale=.009958125*Math.exp(1.05),view={left:32000-706/scale,right:32000+706/scale,top:32000-385/scale,bottom:32000+385/scale,width:1412,height:770,scale},balanced=engravingTilePlan(world,view,1)!,detailed=engravingTilePlan(world,view,1,true)!;assert.equal(balanced.count,8);assert.equal(detailed.count,12);assert.ok(detailed.unique>balanced.unique);assert.ok(detailed.unique*(192+48)**2*4<=24*1048576);
});
