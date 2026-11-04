import type {CraftMarker} from "./craft";
import type {TownPoint} from "./town-map";
export type CraftOverlay={markers:CraftMarker[];selected:string;choosing:boolean;point:TownPoint|null;rotation:number};
/** Empty/unchanged craft responses must not repaint the geographic workspace. */
export function sameCraftOverlay(a:CraftOverlay,b:CraftOverlay){return a.selected===b.selected&&a.choosing===b.choosing&&a.rotation===b.rotation&&a.point?.x===b.point?.x&&a.point?.y===b.point?.y&&a.markers.length===b.markers.length&&a.markers.every((m,i)=>{const n=b.markers[i];return m.id===n.id&&m.name===n.name&&m.classification===n.classification&&m.x===n.x&&m.y===n.y&&m.rotation===n.rotation&&m.revision===n.revision;});}
type View={x:number;y:number;scale:number};
export function craftMarkerAt(p:TownPoint,overlay:CraftOverlay|undefined,view:View,width:number,wrap:boolean){
 for(const m of [...overlay?.markers??[]].reverse())for(const offset of wrap?[-width,0,width]:[0])if(Math.hypot(p.x-view.x-(m.x+offset)*view.scale,p.y-view.y-m.y*view.scale)<22)return m;
}
export function drawCraftMarkers(ctx:CanvasRenderingContext2D,overlay:CraftOverlay|undefined,view:View,worldWidth:number,wrap:boolean,width:number,height:number,ink:string,paper:string){
 if(!overlay)return;ctx.save();ctx.font="600 12px system-ui";ctx.lineWidth=2;
 for(const m of overlay.markers)for(const offset of wrap?[-worldWidth,0,worldWidth]:[0]){
  const x=view.x+(m.x+offset)*view.scale,y=view.y+m.y*view.scale;if(x< -24||y< -24||x>width+24||y>height+24)continue;
  ctx.save();ctx.translate(x,y);ctx.rotate(m.rotation*Math.PI/180);ctx.fillStyle=paper;ctx.strokeStyle=ink;ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(10,4);ctx.lineTo(7,12);ctx.lineTo(-7,12);ctx.lineTo(-10,4);ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(0,8);ctx.moveTo(-5,3);ctx.lineTo(5,3);ctx.stroke();if(m.id===overlay.selected){ctx.setLineDash([3,3]);ctx.strokeRect(-15,-18,30,36);}ctx.restore();
  if(m.id===overlay.selected){const text=m.name.slice(0,70);ctx.fillStyle=paper;ctx.fillRect(x+17,y-13,Math.min(240,ctx.measureText(text).width+10),21);ctx.fillStyle=ink;ctx.fillText(text,x+22,y+2,230);}
 }
 if(overlay.point){const p=overlay.point;ctx.strokeStyle=ink;ctx.setLineDash([4,3]);for(const offset of wrap?[-worldWidth,0,worldWidth]:[0]){const x=view.x+(p.x+offset)*view.scale,y=view.y+p.y*view.scale;ctx.strokeRect(x-14,y-18,28,36);}}ctx.restore();
}
