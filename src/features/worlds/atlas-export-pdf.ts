import type {AtlasExportData} from "./atlas-export-client";
import {AtlasExportPainter} from "./atlas-export-render";
import {ATLAS_EXPORT_LIMITS,exportOptionsSchema,exportBounds,exportCredits,exportPrintLayout,type ExportOptions} from "./atlas-export";
import {wrapExportText,exportFilename,exportSourceMetadata,type ExportFile} from "./atlas-export-output";
import {canvasExportBlob} from "./atlas-export-image";
import {paintExportOverlays} from "./atlas-export-overlays";

const PX_MM=96/25.4;
/** One plan drives preview and PDF, including Unicode credits and poster order. */
export function atlasPrintPlan(data:Pick<AtlasExportData,"manifest">,raw:ExportOptions){
 const parsed=exportOptionsSchema.parse(raw),o={...parsed,bounds:exportBounds(data.manifest,parsed.area==="entire"?data.manifest.extent:parsed.bounds),transparent:false};
 const probe=document.createElement("canvas"),ctx=probe.getContext("2d")!;
 try{
  const preliminary=exportPrintLayout(o),available=preliminary.paper.width-2*o.marginMm;
  ctx.font="bold 4px sans-serif";const title=o.title?wrapExportText([data.manifest.title],available,t=>ctx.measureText(t).width):[],header=title.length?title.length*5+4:3;
  ctx.font="3px sans-serif";const credits=wrapExportText(exportCredits(data.manifest,{...o,title:false}),available,t=>ctx.measureText(t).width),inline=credits.length<=6,footerMm=inline?Math.max(14,(credits.length+2)*3.5+2):14,layout=exportPrintLayout(o,header,footerMm),appendixRows=Math.floor((layout.paper.height-2*o.marginMm-16-title.length*5)/4.3),appendices=inline?0:Math.ceil(credits.length/appendixRows),pages=layout.pages.length+appendices;
  if(pages>ATLAS_EXPORT_LIMITS.pages)throw Error(`Complete map and source credits need ${pages} pages; the limit is 24. Choose a smaller poster, larger paper, or exclude optional uploaded artwork. No credits were omitted.`);
  return{o,layout,title,credits,inline,footerMm,appendixRows,appendices,pages};
 }finally{probe.width=probe.height=0;}
}
export type AtlasPrintPlan=ReturnType<typeof atlasPrintPlan>;
export async function paintAtlasPrintPage(data:AtlasExportData,painter:AtlasExportPainter,plan:AtlasPrintPlan,index:number,canvas:HTMLCanvasElement,preview=false){
 if(index<0||index>=plan.pages)throw Error("Choose an available print page.");data.check();const {o,layout}=plan,dpi=preview?96:o.dpi,width=preview?Math.ceil(layout.paper.width*PX_MM):layout.pixelWidth,height=preview?Math.ceil(layout.paper.height*PX_MM):layout.pixelHeight,map=document.createElement("canvas");
 canvas.width=width;canvas.height=height;const ctx=canvas.getContext("2d");if(!ctx)throw Error("This print surface is unavailable. Lower the DPI and retry.");
 try{
  ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);ctx.save();ctx.scale(width/layout.paper.width,height/layout.paper.height);ctx.fillStyle="#29342f";ctx.font="bold 4px sans-serif";ctx.textBaseline="top";plan.title.forEach((t,i)=>ctx.fillText(t,o.marginMm,o.marginMm+i*5));ctx.restore();
  if(index<layout.pages.length){
   const page=layout.pages[index],mw=preview?Math.max(1,Math.round(page.mapMm.width*PX_MM)):page.mapPixels.width,mh=preview?Math.max(1,Math.round(page.mapMm.height*PX_MM)):page.mapPixels.height;
   await painter.render(map,page.bounds,mw,mh,o,dpi/96);const mc=map.getContext("2d")!;paintExportOverlays(mc,page.bounds,mw,mh,o,dpi/96);data.check();
   ctx.save();ctx.scale(width/layout.paper.width,height/layout.paper.height);const r=page.mapMm;ctx.drawImage(map,r.x,r.y,r.width,r.height);ctx.strokeStyle="#778178";ctx.lineWidth=.15;ctx.strokeRect(r.x,r.y,r.width,r.height);
   if(o.poster&&o.alignmentMarks){ctx.strokeStyle="#303b33";ctx.lineWidth=.2;for(const x of [r.x,r.x+r.width])for(const y of [r.y,r.y+r.height]){ctx.beginPath();ctx.moveTo(x-2,y);ctx.lineTo(x+2,y);ctx.moveTo(x,y-2);ctx.lineTo(x,y+2);ctx.stroke();}}
   ctx.font="3px sans-serif";ctx.fillStyle="#29342f";ctx.textBaseline="top";const footer=layout.paper.height-o.marginMm-plan.footerMm+2;
   const summary=`${layout.fit?"Fit to page":"True scale"} 1:${Number(layout.denominator.toPrecision(8))} | Map ${index+1}/${layout.pages.length} | Row ${page.row+1}, column ${page.column+1}${o.poster?` | Overlap ${layout.overlap} mm`:""}`,summaryLines=wrapExportText([summary],layout.paper.width-2*o.marginMm,t=>ctx.measureText(t).width);if(summaryLines.length>2)throw Error("These margins leave too little room for the complete print scale. Reduce the margins or choose larger paper.");summaryLines.forEach((t,i)=>ctx.fillText(t,o.marginMm,footer+i*3.5));
   const lines=plan.inline?plan.credits:[`Complete source information follows on ${plan.appendices} page${plan.appendices===1?"":"s"}.`];lines.forEach((t,i)=>ctx.fillText(t,o.marginMm,footer+(summaryLines.length+i)*3.5));ctx.restore();
  }else{
   ctx.save();ctx.scale(width/layout.paper.width,height/layout.paper.height);ctx.fillStyle="#29342f";ctx.textBaseline="top";ctx.font="bold 4px sans-serif";ctx.fillText("Map source information",o.marginMm,o.marginMm+plan.title.length*5+3);ctx.font="3px sans-serif";const start=(index-layout.pages.length)*plan.appendixRows;plan.credits.slice(start,start+plan.appendixRows).forEach((t,i)=>ctx.fillText(t,o.marginMm,o.marginMm+plan.title.length*5+11+i*4.3));ctx.fillText(`Source page ${index-layout.pages.length+1}/${plan.appendices}`,o.marginMm,layout.paper.height-o.marginMm-4);ctx.restore();
  }
  data.check();return canvas;
 }finally{map.width=map.height=0;}
}
export async function createAtlasPdf(data:AtlasExportData,raw:ExportOptions):Promise<ExportFile>{
 const plan=atlasPrintPlan(data,raw),{PDFDocument}=await import("pdf-lib"),pdf=await PDFDocument.create(),painter=new AtlasExportPainter(data),canvas=document.createElement("canvas");let compressed=0;
 try{
  pdf.setTitle(plan.o.title?data.manifest.title:"Atlas map");if(plan.o.attribution&&data.manifest.creator)pdf.setAuthor(data.manifest.creator.name);pdf.setSubject(JSON.stringify({...exportSourceMetadata(data.manifest,plan.o),print:{paper:plan.layout.paper,scale:plan.layout.denominator,fit:plan.layout.fit,overlapMm:plan.layout.overlap,columns:plan.layout.columns,rows:plan.layout.rows,pages:plan.layout.pages.map(p=>({sourceBounds:p.bounds,mapMm:p.mapMm}))}}));
  for(let i=0;i<plan.pages;i++){data.progress(`Preparing print page ${i+1} of ${plan.pages}…`);await paintAtlasPrintPage(data,painter,plan,i,canvas);const bytes=new Uint8Array(await(await canvasExportBlob(canvas,"image/jpeg",plan.o.quality)).arrayBuffer());compressed+=bytes.length;if(compressed>ATLAS_EXPORT_LIMITS.bytes-1024*1024)throw Error("This PDF exceeds 64 MiB. Lower the DPI, use fewer poster pages or choose a smaller area.");const image=await pdf.embedJpg(bytes),page=pdf.addPage([plan.layout.paper.width*72/25.4,plan.layout.paper.height*72/25.4]);page.drawImage(image,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});canvas.width=canvas.height=0;data.check();}
  const bytes=await pdf.save();data.check();if(bytes.length>ATLAS_EXPORT_LIMITS.bytes)throw Error("This PDF exceeds the 64 MiB output limit. Lower the DPI or page count.");return{blob:new Blob([bytes as Uint8Array<ArrayBuffer>],{type:"application/pdf"}),name:exportFilename(data.manifest,"pdf"),pages:plan.pages,sourceSha256:data.manifest.pin.sha256,metrics:{...painter.metrics,...data.metrics,compressedPageBytes:compressed}};
 }finally{canvas.width=canvas.height=0;painter.dispose();}
}
