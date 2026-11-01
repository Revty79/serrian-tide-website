import type {TownFeature,TownPoint} from "./town-map";
import {townRoadStyle,traceTownRoad,sampleTownRoad} from "./town-road";
import type {TownArtBudget} from "./town-map-art";

/** Clip before walking detail marks, so extreme zoom cannot enumerate offscreen kilometres. */
export function townVisibleLineMarks(ps:TownPoint[],width:number,height:number,budget:TownArtBudget,spacing:number,draw:(p:TownPoint,n:TownPoint)=>void){
 for(let i=1;i<ps.length&&budget.remaining>0;i++){const a=ps[i-1],b=ps[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<.01)continue;let lo=0,hi=1,visible=true;for(const [d,q]of [[-dx,a.x+20],[dx,width+20-a.x],[-dy,a.y+20],[dy,height+20-a.y]]){if(d===0){if(q<0)visible=false;continue;}const t=q/d;if(d<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}if(!visible||lo>hi)continue;
  for(let n=Math.ceil(Math.max(0,lo)*length/spacing)*spacing;n<=Math.min(1,hi)*length&&budget.remaining>0;n+=spacing){budget.remaining--;draw({x:a.x+dx*n/length,y:a.y+dy*n/length},{x:-dy/length,y:dx/length});}
 }
}

/** Borders first, then every street surface: junctions have no interior doubled outlines. */
export function paintTownRoadNetwork(ctx:CanvasRenderingContext2D,roads:TownFeature[],project:(p:TownPoint)=>TownPoint,scale:number,selected:string,selection:string,budget:TownArtBudget,width:number,height:number){
 const paths=roads.map(road=>{const path=new Path2D();traceTownRoad(path,road,project);return {road,path,width:Math.max(1.5,road.width*scale),style:townRoadStyle(road)};});
 ctx.save();ctx.lineCap="round";ctx.lineJoin="round";
 for(const p of paths){ctx.strokeStyle=p.style==="trail"?"#a18a62":p.style==="bridge"?"#655646":"#87775e";ctx.lineWidth=p.width+1.8;ctx.stroke(p.path);}
 for(const p of paths){ctx.strokeStyle=p.style==="trail"?"#b9ac87":p.style==="dock"?"#a58b62":p.style==="bridge"?"#bdab87":p.style==="main"?"#d8c6a1":"#d1bd92";ctx.lineWidth=p.width;ctx.stroke(p.path);}
 for(const p of paths){if(p.width>5){ctx.globalAlpha=.25;ctx.strokeStyle="#f4e5c5";ctx.lineWidth=Math.max(.5,p.width*.2);ctx.stroke(p.path);ctx.globalAlpha=1;}
  if((p.style==="bridge"||p.style==="dock"||p.style==="trail")&&p.width>2&&budget.remaining>0){ctx.beginPath();townVisibleLineMarks(sampleTownRoad(p.road).map(project),width,height,budget,p.style==="trail"?7:5,(q,n)=>{const half=p.style==="trail"?.5:p.width*.4;ctx.moveTo(q.x-n.x*half,q.y-n.y*half);ctx.lineTo(q.x+n.x*half,q.y+n.y*half);});ctx.strokeStyle=p.style==="trail"?"#8a7c5e":"#7d694f";ctx.lineWidth=.7;ctx.stroke();}
  if(p.road.id===selected){ctx.strokeStyle=selection;ctx.lineWidth=2;ctx.stroke(p.path);}}
 ctx.restore();
}
