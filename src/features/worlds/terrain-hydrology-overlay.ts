import type {TerrainView} from "./terrain";
import type {HydroEdge,HydroGeometry,HydroLayer,HydroPoint} from "./terrain-hydrology";

export type HydroOverlay={layer:HydroLayer;suggestions:HydroLayer|null;selected:string|null;selectedPreview:boolean;analysisCount?:number};
function dx(a:number,b:number,world:HydroGeometry){let delta=b-a;if(world.wrap)delta-=Math.round(delta/world.width)*world.width;return delta;}
function segments(edge:HydroEdge,world:HydroGeometry,run:(a:HydroPoint,b:HydroPoint)=>void){for(let i=1;i<edge.points.length;i++){const a=edge.points[i-1],b=edge.points[i];for(const offset of world.wrap?[-world.width,0,world.width]:[0])run({x:a.x+offset,y:a.y},{x:a.x+offset+dx(a.x,b.x,world),y:b.y});}}

/** A geographic overlay, independent of imagery tiles/LOD and terrain editing.
 * Stroke weight expresses relative drainage area, not a measured river width. */
export function drawHydrology(ctx:CanvasRenderingContext2D,view:TerrainView,world:HydroGeometry,overlay?:HydroOverlay){
  if(!overlay)return;const width=ctx.canvas.width,height=ctx.canvas.height;
  const paint=(layer:HydroLayer,preview:boolean)=>{
    if(!layer.visible||layer.opacity===0)return;ctx.save();ctx.globalAlpha=layer.opacity;ctx.shadowBlur=0;ctx.lineCap="round";ctx.lineJoin="round";
    for(const edge of layer.edges){const selected=overlay.selected===edge.id&&overlay.selectedPreview===preview;
      ctx.beginPath();let visible=false;
      segments(edge,world,(a,b)=>{const x=view.x+a.x*view.scale,y=view.y+a.y*view.scale,xx=view.x+b.x*view.scale,yy=view.y+b.y*view.scale;if(Math.max(x,xx)<-10||Math.min(x,xx)>width+10||Math.max(y,yy)<-10||Math.min(y,yy)>height+10)return;ctx.moveTo(x,y);ctx.lineTo(xx,yy);visible=true;});
      if(!visible)continue;const weight=1.3+Math.min(3.4,Math.log10(Math.max(1,edge.drainageM2/1e6))*.35);
      ctx.setLineDash(preview?[7,4]:edge.flowKind==="exception"?[3,3]:[]);ctx.lineWidth=weight+2;ctx.strokeStyle=selected?"#fff1b6":"#143342";ctx.stroke();ctx.lineWidth=weight;ctx.strokeStyle=selected?"#ffd66e":edge.flowKind==="exception"?"#d99bea":preview?"#a0e6f4":edge.flowKind==="manual"?"#72d9d2":"#65bdeb";ctx.stroke();
    }
    const selected=layer.edges.find(e=>e.id===overlay.selected&&overlay.selectedPreview===preview);
    if(selected)for(const p of [selected.points[0],selected.points.at(-1)!])for(const offset of world.wrap?[-world.width,0,world.width]:[0]){ctx.beginPath();ctx.arc(view.x+(p.x+offset)*view.scale,view.y+p.y*view.scale,4,0,Math.PI*2);ctx.fillStyle="#fff1b6";ctx.fill();ctx.strokeStyle="#143342";ctx.lineWidth=1;ctx.stroke();}
    ctx.restore();
  };
  paint(overlay.layer,false);if(overlay.suggestions)paint(overlay.suggestions,true);
}

export function hitHydrology(layer:HydroLayer,point:HydroPoint,world:HydroGeometry,tolerance:number){
  let best=tolerance*tolerance,result:string|undefined;
  for(const edge of layer.edges)for(let i=1;i<edge.points.length;i++){
    const a=edge.points[i-1],b=edge.points[i],x=dx(a.x,point.x,world),y=point.y-a.y,sx=dx(a.x,b.x,world),sy=b.y-a.y,t=Math.max(0,Math.min(1,(x*sx+y*sy)/(sx*sx+sy*sy||1))),distance=(x-t*sx)**2+(y-t*sy)**2;
    if(distance<=best){best=distance;result=edge.id;}
  }
  return result;
}
