import type {AtlasExportData} from "./atlas-export-client";
import {AtlasExportPainter} from "./atlas-export-render";
import {ATLAS_EXPORT_LIMITS,exportOptionsSchema,exportBounds,exportCredits,checkImageSize,type ExportManifest,type ExportOptions} from "./atlas-export";
import {canvasExportBlob,pngExportMetadata,jpegExportDensity,exportBase64,exportXml} from "./atlas-export-image";
import {paintExportOverlays,svgExportOverlays} from "./atlas-export-overlays";

export type ExportFile={blob:Blob;name:string;width?:number;height?:number;pages?:number;sourceSha256:string;metrics:unknown};
export function exportFilename(m:ExportManifest,extension:string){return `${m.title.replace(/[^\p{L}\p{N}\p{M} _-]/gu,"").slice(0,80)||"atlas-map"}${m.historical?`-year-${m.historical.year}`:"-saved"}.${extension}`;}
export function exportSourceMetadata(m:ExportManifest,o:ExportOptions){return{schema:"serrian-atlas-output",version:1,source:m.source,worldId:m.worldId,target:m.target,mode:m.mode,revision:m.revision,historical:m.historical,dependencies:m.dependencies,provenance:m.provenance,sourceSha256:m.pin.sha256,bounds:o.bounds,coordinateFrame:m.coordinateFrame,units:"metres",requestedMapPixels:{width:o.width,height:o.height},dpi:o.dpi,style:o.style,layers:o.layers};}
export function wrapExportText(texts:string[],width:number,measure:(value:string)=>number){
 if(width<=0)throw Error("The selected output is too narrow for its complete source information. Use a wider image or PDF.");const lines:string[]=[];let line="";
 const emit=()=>{if(line.trim())lines.push(line.trimEnd());line="";};
 for(const text of texts){for(const paragraph of text.split(/\r?\n/)){for(const token of paragraph.match(/\S+|\s+/gu)??[]){const part=line?token:token.trimStart();if(measure(line+part)<=width){line+=part;continue;}emit();if(!token.trim())continue;if(measure(token)<=width){line=token;continue;}
   const segments=typeof Intl.Segmenter!=="undefined"?[...new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(token)].map(s=>s.segment):Array.from(token);for(const symbol of segments){if(measure(symbol)>width)throw Error("This output is too narrow for readable source credits. Increase its width or choose PDF.");if(measure(line+symbol)>width)emit();line+=symbol;}}
  emit();}}
 return lines;
}
export function imageExportLayout(m:ExportManifest,o:ExportOptions,ctx:CanvasRenderingContext2D){const font=Math.max(12,Math.round(o.width/125)),padding=Math.max(12,Math.round(o.width*.015)),lineHeight=Math.ceil(font*1.45);ctx.font=`${font}px sans-serif`;const lines=wrapExportText(exportCredits(m,o),o.width-2*padding,t=>ctx.measureText(t).width),footer=lines.length?2*padding+lines.length*lineHeight:0,height=o.height+footer;checkImageSize(o.width,height);return{width:o.width,mapHeight:o.height,height,font,padding,lineHeight,lines};}
export async function createAtlasImage(data:AtlasExportData,raw:ExportOptions,suppliedPainter?:AtlasExportPainter,previewScale=1):Promise<ExportFile>{
 const painter=suppliedPainter??new AtlasExportPainter(data);
 const parsed=exportOptionsSchema.parse(raw),o={...parsed,bounds:exportBounds(data.manifest,parsed.area==="entire"?data.manifest.extent:parsed.bounds),transparent:parsed.format==="jpeg"?false:parsed.transparent};if(o.format==="pdf")throw Error("Choose the print-preparation renderer for PDF.");checkImageSize(o.width,o.height);if(!o.layers.length)throw Error("Choose at least one map layer for this export.");
 const map=document.createElement("canvas"),file=document.createElement("canvas"),probe=document.createElement("canvas");
 try{
  const layout=imageExportLayout(data.manifest,o,probe.getContext("2d")!),width=Math.max(1,Math.round(o.width*previewScale)),height=Math.max(1,Math.round(o.height*previewScale)),fileHeight=Math.max(1,Math.round(layout.height*previewScale)),density=Math.max(1,o.width/1600)*previewScale;
  await painter.render(map,o.bounds,width,height,o,density);data.check();file.width=width;file.height=fileHeight;const ctx=file.getContext("2d");if(!ctx)throw Error("The output surface is unavailable. Lower its resolution and retry.");if(!o.transparent){ctx.fillStyle="#f4efdf";ctx.fillRect(0,0,width,fileHeight);}ctx.drawImage(map,0,0);
  if(o.format!=="svg"){ctx.save();ctx.scale(previewScale,previewScale);paintExportOverlays(ctx,o.bounds,o.width,o.height,o);ctx.restore();}
  if(layout.lines.length){ctx.save();ctx.scale(previewScale,previewScale);ctx.fillStyle="#f4efdf";ctx.fillRect(0,o.height,layout.width,layout.height-o.height);ctx.fillStyle="#34372f";ctx.font=`${layout.font}px sans-serif`;ctx.textAlign="left";ctx.textBaseline="top";layout.lines.forEach((line,i)=>ctx.fillText(line,layout.padding,o.height+layout.padding+i*layout.lineHeight));ctx.restore();}
  const meta=exportSourceMetadata(data.manifest,o);let blob:Blob;
  if(o.format==="svg"&&previewScale===1){
   const png=await canvasExportBlob(map),footer=layout.lines.length?`<rect y="${o.height}" width="${o.width}" height="${layout.height-o.height}" fill="#f4efdf"/>`+layout.lines.map((line,i)=>`<text x="${layout.padding}" y="${o.height+layout.padding+i*layout.lineHeight+layout.font}" font-family="sans-serif" font-size="${layout.font}" fill="#34372f">${exportXml(line)}</text>`).join(""):"",vectors=svgExportOverlays(o.bounds,o.width,o.height,o);
   if(Math.ceil(png.size/3)*4+new TextEncoder().encode(footer+vectors+exportXml(JSON.stringify(meta))).length+4096>ATLAS_EXPORT_LIMITS.svgBytes)throw Error("This embedded-artwork SVG would exceed 32 MiB. Lower the resolution or choose PNG/JPEG.");const image=exportBase64(new Uint8Array(await png.arrayBuffer()));
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${layout.height}" viewBox="0 0 ${o.width} ${layout.height}"><title>${exportXml(o.title?data.manifest.title:"Saved Atlas map")}</title><desc>Hybrid SVG: rendered native map artwork with vector measurement overlays and complete source text. The terrain and map illustration are embedded pixels.</desc><metadata>${exportXml(JSON.stringify(meta))}</metadata><image width="${o.width}" height="${o.height}" href="data:image/png;base64,${image}"/>${vectors}${footer}</svg>`;blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"});if(blob.size>ATLAS_EXPORT_LIMITS.svgBytes)throw Error("This embedded-artwork SVG exceeds 32 MiB. Lower the image resolution or use PNG/JPEG; no source content was dropped.");
  }else{
   // The reduced preview uses the same layout/physical frame. SVG previews show
   // its vector-equivalent overlays without embedding an additional huge SVG.
   if(o.format==="svg"){ctx.save();ctx.scale(previewScale,previewScale);paintExportOverlays(ctx,o.bounds,o.width,o.height,o);ctx.restore();}
   const encoded=await canvasExportBlob(file,o.format==="jpeg"?"image/jpeg":"image/png",o.quality),bytes=new Uint8Array(await encoded.arrayBuffer());blob=o.format==="jpeg"?new Blob([jpegExportDensity(bytes,o.dpi)],{type:"image/jpeg"}):new Blob([pngExportMetadata(bytes,o.dpi,meta)],{type:"image/png"});
  }
  data.check();if(blob.size>ATLAS_EXPORT_LIMITS.bytes)throw Error("This output exceeds 64 MiB. Lower the resolution, use JPEG compression or choose a smaller area.");return{blob,name:exportFilename(data.manifest,o.format==="jpeg"?"jpg":o.format),width,height:fileHeight,sourceSha256:data.manifest.pin.sha256,metrics:{...painter.metrics,...data.metrics}};
 }finally{map.width=map.height=file.width=file.height=probe.width=probe.height=0;if(!suppliedPainter)painter.dispose();}
}
export async function downloadAtlasFile(data:AtlasExportData,file:ExportFile){data.check();await data.authorizeDelivery();data.check();const url=URL.createObjectURL(file.blob);try{const link=document.createElement("a");link.href=url;link.download=file.name;link.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}}
