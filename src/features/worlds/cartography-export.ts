import {EXPORT_SVG_BYTES,mapExportLayout} from "./map-export-layout";
export type MapExportOptions={visible?:boolean;credits?:string[];background?:string;beforeDownload?:()=>Promise<void>};
// Browser-only derivative; only embedded raster pixels, no external asset URLs.
export async function exportMapPng(svg:SVGSVGElement,name:string,options:MapExportOptions={}) {
  const scene=svg.querySelector<SVGGElement>(options.visible?"[data-visible-export]":"[data-cartography-scene]");
  if(!scene)throw new Error("The map artwork is unavailable for export.");
  if(scene.querySelector("[data-missing-artwork]"))throw new Error("An exact saved illustration revision is unavailable. Restore its matching artwork release before exporting; the editable source is retained.");
  const clone=scene.cloneNode(true) as SVGGElement;
  const sourceNodes=[scene,...scene.querySelectorAll<SVGElement>("*")],cloneNodes=[clone,...clone.querySelectorAll<SVGElement>("*")];
  const properties=["fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","stroke-dasharray","opacity","fill-opacity","stroke-opacity","font-family","font-size","font-weight","font-style","font-variant","letter-spacing","paint-order","vector-effect","fill-rule","text-anchor"];
  sourceNodes.forEach((node,i)=>{const computed=getComputedStyle(node);properties.forEach(property=>cloneNodes[i].style.setProperty(property,computed.getPropertyValue(property)));});
  clone.querySelectorAll("[data-export-omit]").forEach(node=>node.remove());
  for(const image of clone.querySelectorAll("image"))if(!/^data:image\/(png|webp);base64,/.test(image.getAttribute("href")??""))throw new Error("An export image is unavailable or is not embedded. Retry its map layer before exporting.");
  const layout=mapExportLayout(options.credits??[]),root=document.createElementNS("http://www.w3.org/2000/svg","svg");root.setAttribute("xmlns","http://www.w3.org/2000/svg");root.setAttribute("width","2000");root.setAttribute("height","1200");root.setAttribute("viewBox",options.visible?svg.getAttribute("viewBox")??"0 0 2000 1200":"0 0 2000 1200");root.append(clone);
  const source=new Blob([new XMLSerializer().serializeToString(root)],{type:"image/svg+xml;charset=utf-8"});if(source.size>EXPORT_SVG_BYTES)throw new Error("This map exceeds the bounded image-export size. Zoom closer or reduce visible layers; your editable draft is retained.");
  const url=URL.createObjectURL(source);let releaseImage=()=>{},releaseCanvas=()=>{};
  try {
    const image=new Image();releaseImage=()=>{image.src="";};await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("The browser could not render the export; your map draft is retained."));image.src=url;});
    const canvas=document.createElement("canvas");canvas.width=layout.width;canvas.height=layout.height;releaseCanvas=()=>{canvas.width=0;canvas.height=0;};const context=canvas.getContext("2d");if(!context)throw new Error("Image export is unavailable in this browser.");if(options.background){context.fillStyle=options.background;context.fillRect(0,0,2000,1200);}context.drawImage(image,0,0);
    if(layout.lines.length){const probe=document.createElement("span");probe.style.cssText="position:fixed;visibility:hidden;color:var(--st-text);background:var(--st-surface-deep)";(svg.parentElement??document.body).append(probe);const theme=getComputedStyle(probe);context.fillStyle=theme.backgroundColor;context.fillRect(0,1200,2000,layout.height-1200);context.fillStyle=theme.color;probe.remove();context.font="20px sans-serif";layout.lines.forEach((line,i)=>context.fillText(line,24,1232+i*26));}
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Image export failed; your map draft is retained.")),"image/png"));
    await options.beforeDownload?.();
    const downloadUrl=URL.createObjectURL(blob);try{const anchor=document.createElement("a");anchor.download=`${name.replace(/[^\p{L}\p{N} _-]/gu,"").slice(0,80)||"serrian-atlas"}${options.visible?"-visible":"-authored"}.png`;anchor.href=downloadUrl;anchor.click();}finally{setTimeout(()=>URL.revokeObjectURL(downloadUrl),1000);}
    return {...layout,pngBytes:blob.size,svgBytes:source.size};
  }finally{releaseCanvas();releaseImage();URL.revokeObjectURL(url);}
}
