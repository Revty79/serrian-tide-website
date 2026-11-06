import type {NativeTerritory} from "./native-map-history-territories";
import {activeTerritoryRelationships} from "./historical-territories";
export type NativeTerritoryOverlay={territories:NativeTerritory[];year:number;selectedId?:string};
/** Bounded vector overlay only. Numerical terrain and historical sources stay
 * untouched. Holes use the same even-odd rule as the boundary validator. */
export function paintNativeTerritories(ctx:CanvasRenderingContext2D,overlay:NativeTerritoryOverlay|undefined,view:{x:number;y:number;scale:number},world:{displayWidth:number;wrap:boolean},colors:{known:string;unknown:string;text:string}){
  if(!overlay)return;
  ctx.save();ctx.font="12px sans-serif";
  for(const t of overlay.territories){if(t.archived)continue;
    const rings=t.boundaries.filter(b=>!b.archived&&(!b.parentId||!t.boundaries.find(p=>p.id===b.parentId)?.archived));
    const active=activeTerritoryRelationships(t,overlay.year),known=t.coverage==="unclaimed"||t.coverage!=="unknown"&&active.length>0,color=known?colors.known:colors.unknown;
    for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){
      ctx.beginPath();for(const ring of rings){ring.points.forEach((p,i)=>{const x=view.x+(p.x+offset)*view.scale,y=view.y+p.y*view.scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();}
      ctx.fillStyle=color;ctx.globalAlpha=t.id===overlay.selectedId?0.22:0.09;ctx.fill("evenodd");ctx.globalAlpha=1;ctx.strokeStyle=color;ctx.lineWidth=t.id===overlay.selectedId?3:1.5;ctx.setLineDash(known?[]:[6,4]);ctx.stroke();ctx.setLineDash([]);
      const outer=rings.find(r=>!r.parentId);if(outer){const p=outer.points[0];ctx.fillStyle=colors.text;ctx.fillText(t.name+(known?"":" (politics unknown)"),view.x+(p.x+offset)*view.scale+4,view.y+p.y*view.scale-5,240);}
    }
  }
  ctx.restore();
}
