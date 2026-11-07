import {niceDistance} from "./terrain-measurement";
import {exportDistance,type ExportFrame,type ExportOptions} from "./atlas-export";
import {exportXml} from "./atlas-export-image";

export function exportOverlayPlan(bounds:ExportFrame,width:number,height:number,o:ExportOptions,density=Math.max(1,width/1600)){
 const scale=Math.min(width/bounds.width,height/bounds.height),padX=(width-bounds.width*scale)/2,padY=(height-bounds.height*scale)/2,vertical:number[]=[],horizontal:number[]=[];
 if(o.grid){const count=Math.ceil(bounds.width/o.gridMetres)+Math.ceil(bounds.height/o.gridMetres)+2;if(!Number.isFinite(count)||count>4000)throw Error("This physical grid would exceed 4,000 lines. Choose wider spacing or a smaller area; the requested spacing was not silently changed.");for(let i=Math.ceil(bounds.x/o.gridMetres);i*o.gridMetres<=bounds.x+bounds.width;i++)vertical.push(padX+(i*o.gridMetres-bounds.x)*scale);for(let i=Math.ceil(bounds.y/o.gridMetres);i*o.gridMetres<=bounds.y+bounds.height;i++)horizontal.push(padY+(i*o.gridMetres-bounds.y)*scale);}
 const font=12*density,margin=16*density,step=niceDistance(Math.max(10*density,Math.min(width*.2,160*density))/scale,o.unit),bar=o.scaleBar?{x:margin,y:height-margin-font*1.4,width:step.metres*scale,label:exportDistance(step.metres,o.unit),font}:null;
 if((o.scaleBar||o.axes)&&(height<font*4||width<font*8))throw Error("This image is too narrow for readable measurement overlays. Increase the resolution, hide those overlays or choose a less narrow area.");
 return{width,height,vertical,horizontal,lineWidth:Math.max(.6,density*.6),bar,axes:o.axes?{x:width-margin-42*density,y:margin+8*density,size:28*density,font}:null};
}
export function paintExportOverlays(ctx:CanvasRenderingContext2D,bounds:ExportFrame,width:number,height:number,o:ExportOptions,density=Math.max(1,width/1600)){
 const p=exportOverlayPlan(bounds,width,height,o,density);ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();ctx.strokeStyle="#4d5c61";ctx.globalAlpha=.35;ctx.lineWidth=p.lineWidth;ctx.beginPath();for(const x of p.vertical){ctx.moveTo(x,0);ctx.lineTo(x,height);}for(const y of p.horizontal){ctx.moveTo(0,y);ctx.lineTo(width,y);}ctx.stroke();ctx.globalAlpha=1;
 if(p.bar){const b=p.bar;ctx.font=`${b.font}px sans-serif`;ctx.textAlign="left";ctx.fillStyle="rgba(249,246,232,.94)";ctx.fillRect(b.x-5,b.y-b.font*1.5,b.width+16,b.font*2.3);ctx.strokeStyle="#25332e";ctx.fillStyle="#25332e";ctx.lineWidth=Math.max(1,b.font/10);ctx.beginPath();ctx.moveTo(b.x,b.y-4);ctx.lineTo(b.x,b.y+4);ctx.moveTo(b.x,b.y);ctx.lineTo(b.x+b.width,b.y);ctx.moveTo(b.x+b.width,b.y-4);ctx.lineTo(b.x+b.width,b.y+4);ctx.stroke();ctx.fillText(b.label,b.x,b.y-b.font*.35);}
 if(p.axes){const a=p.axes;ctx.strokeStyle="#25332e";ctx.fillStyle="#25332e";ctx.font=`${a.font}px sans-serif`;ctx.textAlign="left";ctx.lineWidth=Math.max(1,a.font/10);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x+a.size,a.y);ctx.lineTo(a.x+a.size-5,a.y-3);ctx.moveTo(a.x+a.size,a.y);ctx.lineTo(a.x+a.size-5,a.y+3);ctx.moveTo(a.x,a.y);ctx.lineTo(a.x,a.y+a.size);ctx.lineTo(a.x-3,a.y+a.size-5);ctx.moveTo(a.x,a.y+a.size);ctx.lineTo(a.x+3,a.y+a.size-5);ctx.stroke();ctx.fillText("X",a.x+a.size+3,a.y+4);ctx.fillText("Y",a.x-4,a.y+a.size+a.font);}
 ctx.restore();return p;
}
export function svgExportOverlays(bounds:ExportFrame,width:number,height:number,o:ExportOptions){
 const p=exportOverlayPlan(bounds,width,height,o),paths=[...p.vertical.map(x=>`M${x} 0V${height}`),...p.horizontal.map(y=>`M0 ${y}H${width}`)],elements=[`<path d="${paths.join(" ")}" fill="none" stroke="#4d5c61" stroke-opacity=".35" stroke-width="${p.lineWidth}"/>`];
 if(p.bar){const b=p.bar;elements.push(`<g fill="#25332e" stroke="#25332e"><rect x="${b.x-5}" y="${b.y-b.font*1.5}" width="${b.width+16}" height="${b.font*2.3}" fill="#f9f6e8" fill-opacity=".94" stroke="none"/><path d="M${b.x} ${b.y-4}v8m0 -4h${b.width}m0 -4v8" fill="none"/><text x="${b.x}" y="${b.y-b.font*.35}" font-family="sans-serif" font-size="${b.font}" stroke="none">${exportXml(b.label)}</text></g>`);}
 if(p.axes){const a=p.axes;elements.push(`<g fill="#25332e" stroke="#25332e"><path d="M${a.x} ${a.y}h${a.size}m-5 -3l5 3l-5 3M${a.x} ${a.y}v${a.size}m-3 -5l3 5l3 -5" fill="none"/><text x="${a.x+a.size+3}" y="${a.y+4}" font-family="sans-serif" font-size="${a.font}" stroke="none">X</text><text x="${a.x-4}" y="${a.y+a.size+a.font}" font-family="sans-serif" font-size="${a.font}" stroke="none">Y</text></g>`);}
 return elements.join("");
}
