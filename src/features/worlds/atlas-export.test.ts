import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_EXPORT_OPTIONS,exportBounds,exportImageSize,exportPrintLayout,checkImageSize,exportCredits,exportSourceRequestSchema,publicExportCredit,exportDistance,exportFrameNear,exportCameraFrame,type ExportManifest} from "./atlas-export";
import {exportOverlayPlan} from "./atlas-export-overlays";

test("export selections use continuous physical World X and fixed north/south bounds",()=>{
 const world={extent:{x:0,y:0,width:1000,height:500},wrapWidth:1000};
 assert.deepEqual(exportBounds(world,{x:-50,y:40,width:100,height:80}),{x:950,y:40,width:100,height:80});
 assert.throws(()=>exportBounds(world,{x:950,y:490,width:100,height:20}),/top and bottom/);
 const region={extent:{x:950,y:30,width:100,height:80},wrapWidth:1000};
 assert.deepEqual(exportBounds(region,{x:5,y:40,width:30,height:40}),{x:1005,y:40,width:30,height:40});
 assert.throws(()=>exportBounds(region,{x:40,y:40,width:30,height:40}),/saved extent/);
 assert.throws(()=>exportBounds({...world,wrapWidth:null},{x:950,y:40,width:100,height:80}),/saved extent/);
});
test("whole-map resolution retains the source aspect at multiple requested qualities",()=>{
 for(const edge of [1600,3200,6400]){const size=exportImageSize({x:800,y:60,width:240,height:120},edge);assert.deepEqual(size,{width:edge,height:edge/2});checkImageSize(size.width,size.height);}
 assert.throws(()=>checkImageSize(8192,8192),/Lower the resolution/);
 assert.throws(()=>checkImageSize(9000,100),/edge/);
});
test("fit PDF uses exact paper millimetres with no crop or stretched geography",()=>{
 const layout=exportPrintLayout({...DEFAULT_EXPORT_OPTIONS,format:"pdf",paper:"Letter",orientation:"portrait",bounds:{x:31,y:72,width:1000,height:500}});
 assert.deepEqual(layout.paper,{width:215.9,height:279.4});assert.equal(layout.pages.length,1);const p=layout.pages[0];
 assert.ok(Math.abs(p.mapMm.width/p.mapMm.height-2)<1e-10);assert.equal(p.bounds.x,31);assert.equal(p.bounds.y,72);assert.ok(Math.abs(p.bounds.width-1000)<1e-9);assert.ok(Math.abs(p.bounds.height-500)<1e-9);
 assert.ok(p.mapMm.x>=10&&p.mapMm.y>=22);assert.equal(layout.fit,true);
});
test("poster pages retain physical scale, row-major ordering and exact overlap",()=>{
 const options={...DEFAULT_EXPORT_OPTIONS,format:"pdf" as const,printMode:"scale" as const,denominator:100,poster:true,bounds:{x:15,y:28,width:60,height:40},paper:"A4" as const,orientation:"landscape" as const};
 const layout=exportPrintLayout(options);assert.equal(layout.denominator,100);assert.equal(layout.fit,false);assert.ok(layout.columns>1&&layout.rows>1);
 for(const page of layout.pages){assert.ok(Math.abs(page.bounds.width/page.mapMm.width-.1)<1e-12);assert.ok(Math.abs(page.bounds.height/page.mapMm.height-.1)<1e-12);}
 const first=layout.pages[0],second=layout.pages[1];assert.equal(second.row,0);assert.equal(second.column,1);assert.ok(Math.abs(first.bounds.x+first.bounds.width-second.bounds.x-.5)<1e-12);
 assert.ok(layout.pages.at(-1)!.bounds.x+layout.pages.at(-1)!.bounds.width<=75+1e-9);
 assert.throws(()=>exportPrintLayout({...options,poster:false}),/does not fit/);
 assert.throws(()=>exportPrintLayout({...options,denominator:1}),/map pages/);
 assert.throws(()=>exportPrintLayout({...options,paper:"A2",dpi:600}),/megapixel/);
});
test("historical export references cannot be redirected to a different map family",()=>{
 const id="10000000-0000-4000-8000-000000000001",other="10000000-0000-4000-8000-000000000002";
 assert.throws(()=>exportSourceRequestSchema.parse({target:{kind:"town",id},historical:{target:{kind:"floor",id:other},timelineId:id,stateId:id,year:500,edit:false}}),/exact map/);
});
test("required credits stay complete while optional creator display comes from the real account",()=>{
 const manifest={title:"A map",worldName:"My variation",creator:{id:"actual-account",name:"Revty79"},revision:3,historical:null,provenance:{kind:"personal-variation"},credits:["Full source credit "+"complete ".repeat(2000)],images:[]} as unknown as ExportManifest;
 const credits=exportCredits(manifest,DEFAULT_EXPORT_OPTIONS);assert.ok(credits.includes("Built by Revty79"));assert.ok(credits.includes("My variation - independent personal variation"));assert.equal(credits.at(-1),manifest.credits[0]);
 assert.ok(exportCredits(manifest,{...DEFAULT_EXPORT_OPTIONS,attribution:false}).includes(manifest.credits[0]));
 assert.throws(()=>exportCredits({...manifest,credits:["x".repeat(96_001)]},DEFAULT_EXPORT_OPTIONS),/no credits have been dropped/);
});
test("public source credits remain intact while internal paths and credential URLs are withheld",()=>{
 const credit="Source survey - CC BY 4.0 - https://example.org/surveys/complete-original";assert.equal(publicExportCredit(credit),credit);
 for(const value of ["C:\\private\\image.png","Source https://127.0.0.1/private","https://user:secret@example.org/image","https://example.org/asset?token=private","\\\\server\\private","file:///D:/storage/image","/private/fixture/image.png","https://assets.internal/private","http://100.64.0.1/source"]){assert.throws(()=>publicExportCredit(value),/private|internal|credential/);}
 const m={title:"Map",worldName:"World",creator:null,revision:1,historical:null,provenance:{kind:"authored-world"},credits:[],images:[{assetId:"an-image",version:1,width:1,height:1,credits:[],creditIssue:"Correct the image credit before sharing"}]} as unknown as ExportManifest;
 assert.doesNotThrow(()=>exportCredits(m,DEFAULT_EXPORT_OPTIONS));assert.throws(()=>exportCredits(m,{...DEFAULT_EXPORT_OPTIONS,uploadedArtwork:true,layers:["composition"]}),/Correct the image credit/);
});
test("small physical distances remain nonzero and oversubscribed grids fail explicitly",()=>{
 assert.equal(exportDistance(.000001,"m"),"0.000001 m");
 assert.throws(()=>exportOverlayPlan({x:0,y:0,width:1000,height:1000},1200,1200,{...DEFAULT_EXPORT_OPTIONS,grid:true,gridMetres:.1}),/4,000 lines/);
 const bounds={x:1.25,y:2.5,width:10,height:8},o={...DEFAULT_EXPORT_OPTIONS,grid:true,gridMetres:2,scaleBar:false};
 const p=exportOverlayPlan(bounds,1000,800,o);assert.equal(p.vertical[0],75);assert.equal(p.horizontal[0],150);
 const preview=exportOverlayPlan(bounds,1000,800,{...o,grid:false,scaleBar:true},1),print=exportOverlayPlan(bounds,3000,2400,{...o,grid:false,scaleBar:true},3);assert.equal(print.bar!.font,preview.bar!.font*3);assert.equal(print.bar!.width,preview.bar!.width*3);
});
test("wrapped crop handles use the same physical area on both visible sides of the seam",()=>{
 const m={extent:{x:0,y:0,width:1000,height:500},wrapWidth:1000},b={x:950,y:100,width:100,height:80};
 assert.deepEqual(exportFrameNear(m,b,{x:20,y:120}),{...b,x:-50});assert.deepEqual(exportFrameNear(m,b,{x:980,y:120}),b);
 assert.deepEqual(exportBounds(m,{...exportFrameNear(m,b,{x:20,y:120}),x:-40}),{...b,x:960});
 assert.deepEqual(exportCameraFrame(m,{x:1980,y:-20,width:200,height:100}),{x:980,y:0,width:200,height:100});
 const region={extent:{x:950,y:30,width:100,height:80},wrapWidth:1000};assert.deepEqual(exportCameraFrame(region,{x:2000,y:80,width:50,height:40}),{x:1000,y:70,width:50,height:40});
});
