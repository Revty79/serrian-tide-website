import type { TerrainDrawing } from "./cartography";

const namespace="http://www.w3.org/2000/svg";
const properties=["fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","stroke-dasharray","opacity","fill-opacity","stroke-opacity"];
function paintedClone(node:SVGElement){
  const clone=node.cloneNode(true) as SVGElement;
  const originals=[node,...node.querySelectorAll<SVGElement>("*")],copies=[clone,...clone.querySelectorAll<SVGElement>("*")];
  originals.forEach((source,i)=>{const style=getComputedStyle(source);properties.forEach(key=>copies[i].style.setProperty(key,style.getPropertyValue(key)));});
  return clone;
}

// A temporary display cache only. Editable source and full vector export stay authoritative.
export async function terrainBitmap(source:SVGGElement,prefix:string,drawing:TerrainDrawing,signal?:AbortSignal){
  signal?.throwIfAborted();
  const scene=source.closest("[data-cartography-scene]");if(!scene)throw new Error("Terrain scene unavailable.");
  const defs=document.createElementNS(namespace,"defs");
  if(drawing.version===2){
    // Exact already-rendered definitions only; no catalog/network or alternate art.
    const ids=new Set([...source.querySelectorAll("use")].map(node=>node.getAttribute("href")));
    for(const href of ids){const symbol=href?.startsWith("#")?scene.querySelector<SVGGElement>(`[id="${href.slice(1)}"]`):null;if(!symbol)throw new Error("Illustration definition unavailable.");defs.append(paintedClone(symbol));}
  }else for(let variant=0;variant<3;variant++){const symbol=scene.querySelector<SVGGElement>(`[id="${prefix}-${drawing.kind}-${variant}"]`);if(!symbol)throw new Error("Terrain definition unavailable.");defs.append(paintedClone(symbol));}
  const art=source.cloneNode(true) as SVGGElement;
  // Symbol paint lives in the small definition tree; never compute styles for every mark.
  [...source.children].forEach((node,i)=>{if(node.tagName.toLowerCase()!=="use")art.children[i].replaceWith(paintedClone(node as SVGElement));});
  const box=source.getBBox(),margin=drawing.version===1?Math.max(4,drawing.radius*1.8):4,x=Math.floor(box.x-margin),y=Math.floor(box.y-margin);
  const width=Math.max(1,Math.ceil(box.x+box.width+margin-x)),height=Math.max(1,Math.ceil(box.y+box.height+margin-y));
  const scale=Math.min(2,4096/Math.max(width,height),Math.sqrt(1200000/(width*height)));
  const root=document.createElementNS(namespace,"svg");root.setAttribute("xmlns",namespace);root.setAttribute("width",String(Math.ceil(width*scale)));root.setAttribute("height",String(Math.ceil(height*scale)));root.setAttribute("viewBox",`${x} ${y} ${width} ${height}`);root.append(defs,art);
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)],{type:"image/svg+xml;charset=utf-8"}));
  const image=new Image();let canvas:HTMLCanvasElement|undefined;
  try{
    await new Promise<void>((resolve,reject)=>{
      const aborted=()=>{image.src="";reject(signal?.reason??new DOMException("Terrain cache cancelled.","AbortError"));};
      const finish=(error?:Error)=>{signal?.removeEventListener("abort",aborted);if(error)reject(error);else resolve();};
      image.onload=()=>finish();image.onerror=()=>finish(new Error("Terrain cache unavailable."));
      signal?.addEventListener("abort",aborted,{once:true});if(signal?.aborted)aborted();else image.src=url;
    });
    signal?.throwIfAborted();canvas=document.createElement("canvas");canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);const context=canvas.getContext("2d");if(!context)throw new Error("Terrain cache unavailable.");context.drawImage(image,0,0,canvas.width,canvas.height);
    signal?.throwIfAborted();const target=canvas,blob=await new Promise<Blob>((resolve,reject)=>target.toBlob(b=>b?resolve(b):reject(new Error("Terrain cache unavailable.")),"image/png"));
    signal?.throwIfAborted();return {url:URL.createObjectURL(blob),x,y,width,height,scale};
  }finally{if(canvas){canvas.width=0;canvas.height=0;}image.src="";URL.revokeObjectURL(url);}
}
