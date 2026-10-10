// Export only the original vector scene; no external assets or server storage.
export async function exportMapPng(svg:SVGSVGElement,name:string) {
  const scene=svg.querySelector<SVGGElement>("[data-cartography-scene]");
  if(!scene)throw new Error("The map artwork is unavailable for export.");
  const clone=scene.cloneNode(true) as SVGGElement;
  const sourceNodes=[scene,...scene.querySelectorAll<SVGElement>("*")],cloneNodes=[clone,...clone.querySelectorAll<SVGElement>("*")];
  const properties=["fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","stroke-dasharray","opacity","fill-opacity","stroke-opacity","font-family","font-size","font-weight","font-style","font-variant","letter-spacing","paint-order"];
  sourceNodes.forEach((node,i)=>{const computed=getComputedStyle(node);properties.forEach(property=>cloneNodes[i].style.setProperty(property,computed.getPropertyValue(property)));});
  clone.querySelectorAll("[data-export-omit]").forEach(node=>node.remove());
  const root=document.createElementNS("http://www.w3.org/2000/svg","svg");root.setAttribute("xmlns","http://www.w3.org/2000/svg");root.setAttribute("width","2000");root.setAttribute("height","1200");root.setAttribute("viewBox","0 0 2000 1200");root.append(clone);
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)],{type:"image/svg+xml;charset=utf-8"}));
  try {
    const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("The browser could not render the export; your map draft is retained."));image.src=url;});
    const canvas=document.createElement("canvas");canvas.width=2000;canvas.height=1200;const context=canvas.getContext("2d");if(!context)throw new Error("Image export is unavailable in this browser.");context.drawImage(image,0,0);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Image export failed; your map draft is retained.")),"image/png"));
    const downloadUrl=URL.createObjectURL(blob);try{const anchor=document.createElement("a");anchor.download=`${name.replace(/[^\p{L}\p{N} _-]/gu,"").slice(0,80)||"serrian-atlas"}.png`;anchor.href=downloadUrl;anchor.click();}finally{setTimeout(()=>URL.revokeObjectURL(downloadUrl),1000);}
  }finally{URL.revokeObjectURL(url);}
}
