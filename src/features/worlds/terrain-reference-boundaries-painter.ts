import type {GeographicViewport,GeographicShape} from "./geographic";
import {terrainReferenceTransform,type ReferenceBoundaryWorld} from "./terrain-reference-boundaries";

export class TerrainReferenceBoundaryPainter{
 private paths=new WeakMap<GeographicShape,Path2D>();
 paint(ctx:CanvasRenderingContext2D,packet:GeographicViewport|undefined,view:{x:number;y:number;scale:number},world:ReferenceBoundaryWorld,colors:{line:string;disputed:string;text:string}){
  if(!packet)return;const frame=terrainReferenceTransform(packet,world),offsets=world.wrap?[-world.displayWidth,0,world.displayWidth]:[0],unit=Math.max(frame.scaleX,frame.scaleY)*view.scale;
  ctx.save();ctx.lineJoin="round";ctx.lineCap="round";
  for(const offset of offsets){ctx.save();ctx.translate(view.x+(frame.x+offset)*view.scale,view.y+frame.y*view.scale);ctx.scale(frame.scaleX*view.scale,frame.scaleY*view.scale);
   for(const shape of packet.shapes){let path=this.paths.get(shape);if(!path){path=new Path2D(shape.path);this.paths.set(shape,path);}ctx.strokeStyle=shape.style==="disputed"?colors.disputed:colors.line;ctx.lineWidth=1.3/unit;ctx.setLineDash(shape.style==="disputed"?[5/unit,4/unit]:[]);ctx.stroke(path);}ctx.restore();
  }
  ctx.setLineDash([]);ctx.font="12px sans-serif";ctx.textBaseline="middle";ctx.lineWidth=3;ctx.strokeStyle="rgba(0,0,0,.7)";ctx.fillStyle=colors.text;
  const seen=new Set<string>(),boxes:{x:number;y:number;w:number}[]=[];
  for(const shape of [...packet.shapes].filter(s=>s.label).sort((a,b)=>a.label!.rank-b.label!.rank)){if(seen.has(shape.id)||seen.size>=48)continue;const label=shape.label!,w=Math.min(220,ctx.measureText(shape.name).width)+6;
   for(const offset of offsets){const x=view.x+(frame.x+offset+label.x*frame.scaleX)*view.scale,y=view.y+(frame.y+label.y*frame.scaleY)*view.scale;if(x<0||x>ctx.canvas.width||y<0||y>ctx.canvas.height||boxes.some(b=>Math.abs(b.y-y)<17&&x<b.x+b.w&&b.x<x+w))continue;ctx.strokeText(shape.name,x+3,y,214);ctx.fillText(shape.name,x+3,y,214);boxes.push({x,y,w});seen.add(shape.id);}
  }
  ctx.restore();
 }
}
