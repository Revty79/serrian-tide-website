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
export async function terrainBitmap(source:SVGGElement,prefix:string,drawing:TerrainDrawing){
  const scene=source.closest("[data-cartography-scene]");if(!scene)throw new Error("Terrain scene unavailable.");
  const defs=document.createElementNS(namespace,"defs");
  for(let variant=0;variant<3;variant++){const symbol=scene.querySelector<SVGGElement>(`[id="${prefix}-${drawing.kind}-${variant}"]`);if(!symbol)throw new Error("Terrain definition unavailable.");defs.append(paintedClone(symbol));}
  const art=source.cloneNode(true) as SVGGElement;
  // Symbol paint lives in the small definition tree; never compute styles for every mark.
  [...source.children].forEach((node,i)=>{if(node.tagName.toLowerCase()!=="use")art.children[i].replaceWith(paintedClone(node as SVGElement));});
  const margin=drawing.radius*1.8,x=Math.floor(Math.min(...drawing.points.map(p=>p.x))-margin),y=Math.floor(Math.min(...drawing.points.map(p=>p.y))-margin);
  const width=Math.ceil(Math.max(...drawing.points.map(p=>p.x))+margin-x),height=Math.ceil(Math.max(...drawing.points.map(p=>p.y))+margin-y);
  const scale=Math.min(2,Math.sqrt(1200000/(width*height)));
  const root=document.createElementNS(namespace,"svg");root.setAttribute("xmlns",namespace);root.setAttribute("width",String(Math.ceil(width*scale)));root.setAttribute("height",String(Math.ceil(height*scale)));root.setAttribute("viewBox",`${x} ${y} ${width} ${height}`);root.append(defs,art);
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)],{type:"image/svg+xml;charset=utf-8"}));
  try{
    const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Terrain cache unavailable."));image.src=url;});
    const canvas=document.createElement("canvas");canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);const context=canvas.getContext("2d");if(!context)throw new Error("Terrain cache unavailable.");context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Terrain cache unavailable.")),"image/png"));
    return {url:URL.createObjectURL(blob),x,y,width,height,scale};
  }finally{URL.revokeObjectURL(url);}
}
