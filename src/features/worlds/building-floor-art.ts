import {wallSegments,openingAnchor,type InteriorShape} from "./interior";
import {floorLayer,legacyFloorShapes,type FloorDesign,type FloorFeature,type FloorFrame} from "./building-floor";
export type FloorView={left:number;top:number;scale:number;width:number;height:number};
export type FloorPalette={paper:string;ink:string;wood:string;accent:string;stone:string};
export function paintFloor(ctx:CanvasRenderingContext2D,design:FloorDesign,frame:FloorFrame,view:FloorView,palette:FloorPalette,reference=false,background?:()=>void){
 const {scale}=view,project=(p:{x:number;y:number})=>({x:(p.x-view.left)*scale,y:(p.y-view.top)*scale}),a=project({x:0,y:0});const opacity=ctx.globalAlpha;let marks=0;const detail=()=>marks++<5000;
 const visible=design.features.filter(f=>!f.archived&&design.layers[floorLayer(f)].visible),shapes=legacyFloorShapes(design.features),gaps=new Map<string,InteriorShape[]>();for(const f of shapes)if(f.variant==="opening"&&!f.archived){const list=gaps.get(f.wallId)??[];list.push(f);gaps.set(f.wallId,list);}
 ctx.save();ctx.beginPath();ctx.rect(a.x,a.y,frame.width*scale,frame.height*scale);ctx.clip();ctx.strokeStyle=palette.ink;ctx.lineJoin="round";ctx.lineCap="butt";
 if(!reference&&design.layers.ground.visible){ctx.fillStyle=palette.paper;ctx.fillRect(a.x,a.y,frame.width*scale,frame.height*scale);if(design.flooring!=="plain"){
  const step=Math.max(design.flooring==="boards"?.3:1,8/scale),left=Math.max(0,Math.floor(view.left/step)*step),top=Math.max(0,Math.floor(view.top/step)*step),right=Math.min(frame.width,view.left+view.width/scale),bottom=Math.min(frame.height,view.top+view.height/scale);ctx.globalAlpha=.13*opacity;ctx.lineWidth=.6;ctx.beginPath();for(let y=top;y<=bottom&&detail();y+=step){const p=project({x:0,y});ctx.moveTo(a.x,p.y);ctx.lineTo(a.x+frame.width*scale,p.y);}if(design.flooring!=="boards")for(let x=left;x<=right&&detail();x+=step){const p=project({x,y:0});ctx.moveTo(p.x,a.y);ctx.lineTo(p.x,a.y+frame.height*scale);}ctx.stroke();ctx.globalAlpha=opacity;
 }}
 if(!reference)background?.();
 for(const f of visible){if(f.variant!=="area")continue;ctx.beginPath();f.points.forEach((p,i)=>{const q=project(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.closePath();ctx.fillStyle=palette.wood;ctx.globalAlpha=.1*opacity;ctx.fill();ctx.globalAlpha=opacity;if(f.name&&scale>4&&detail()){const x=f.points.reduce((n,p)=>n+p.x,0)/f.points.length,y=f.points.reduce((n,p)=>n+p.y,0)/f.points.length,q=project({x,y});ctx.fillStyle=palette.ink;ctx.font="12px Georgia,serif";ctx.textAlign="center";ctx.fillText(f.name.slice(0,40),q.x,q.y);}}
 // Paint all wall bands first; aligned junctions stay continuous and openings are actual missing spans.
 for(const f of visible){if(f.variant!=="wall")continue;ctx.strokeStyle=palette.ink;ctx.lineWidth=Math.max(1.2,f.width*scale);ctx.beginPath();for(const span of wallSegments(f,[f,...gaps.get(f.id)??[]])){const a=project(span.a),b=project(span.b);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}ctx.stroke();}
 const details=[...visible.filter(f=>f.variant==="opening"),...visible.filter(f=>f.variant==="object"&&f.symbol==="rug"),...visible.filter(f=>f.variant==="object"&&f.symbol!=="rug")];
 for(const f of details){if(f.variant==="opening"){let anchor;try{anchor=openingAnchor(legacyFloorShapes([f])[0] as Extract<InteriorShape,{variant:"opening"}>,shapes);}catch{continue;}const q=project(anchor),w=f.width*scale;ctx.save();ctx.translate(q.x,q.y);ctx.rotate(anchor.angle*Math.PI/180);ctx.strokeStyle=f.style==="window"?palette.accent:palette.wood;ctx.lineWidth=1.3;ctx.beginPath();if(f.style==="window"){ctx.moveTo(-w/2,-2);ctx.lineTo(w/2,-2);ctx.moveTo(-w/2,2);ctx.lineTo(w/2,2);}else if(f.style==="door"||f.style==="entrance"){ctx.moveTo(-w/2,0);ctx.lineTo(-w/2,-w);ctx.stroke();ctx.setLineDash([3,2]);ctx.beginPath();ctx.arc(-w/2,0,w,-Math.PI/2,0);}else if(f.style==="double door"){ctx.moveTo(-w/2,0);ctx.lineTo(-w/2,-w/2);ctx.moveTo(w/2,0);ctx.lineTo(w/2,-w/2);ctx.stroke();ctx.setLineDash([2,2]);ctx.beginPath();ctx.arc(-w/2,0,w/2,-Math.PI/2,0);ctx.moveTo(0,0);ctx.arc(w/2,0,w/2,Math.PI,Math.PI*1.5);}else{ctx.moveTo(-w/2,-3);ctx.lineTo(-w/2,3);ctx.moveTo(w/2,-3);ctx.lineTo(w/2,3);}ctx.stroke();ctx.restore();}
  if(f.variant!=="object")continue;const p=project(f.point),w=f.width*scale,h=f.height*scale,r=Math.hypot(w,h)/2;if(p.x+r<0||p.y+r<0||p.x-r>view.width||p.y-r>view.height)continue;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(f.rotation*Math.PI/180);ctx.fillStyle=f.kind==="transition"?palette.stone:f.symbol==="rug"?palette.accent:palette.wood;ctx.strokeStyle=palette.ink;ctx.lineWidth=.8;
  if(f.kind==="annotation"){ctx.fillStyle=palette.ink;ctx.font=Math.max(10,Math.min(28,h))+"px Georgia,serif";ctx.textAlign="center";ctx.fillText(f.name||"Note",0,0);ctx.restore();continue;}
  ctx.globalAlpha=.18*opacity;ctx.fillRect(-w/2+2,-h/2+2,w,h);ctx.globalAlpha=opacity;
  if(f.symbol==="column"||f.symbol==="barrel"){ctx.beginPath();ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();}else{ctx.fillRect(-w/2,-h/2,w,h);ctx.strokeRect(-w/2,-h/2,w,h);}
  if(Math.min(w,h)>4&&detail()){ctx.strokeStyle=f.kind==="transition"?palette.ink:palette.paper;ctx.lineWidth=1;
   const line=(x:number,y:number,xx:number,yy:number)=>{ctx.beginPath();ctx.moveTo(x*w,y*h);ctx.lineTo(xx*w,yy*h);ctx.stroke();};
   if(f.kind==="transition"){for(let i=1;i<7;i++)line(-.42,-.5+i/7,.42,-.5+i/7);line(0,.3,0,-.3);line(0,-.3,-.15,-.1);line(0,-.3,.15,-.1);}
   else if(f.symbol==="bed"){ctx.fillStyle=palette.paper;ctx.globalAlpha=.85*opacity;ctx.fillRect(-w*.42,-h*.42,w*.84,h*.22);ctx.globalAlpha=opacity;line(-.42,.2,.42,.2);line(-.42,.35,.42,.35);}
   else if(f.symbol==="chair"){line(-.42,-.25,.42,-.25);line(-.42,.4,-.42,-.2);line(.42,.4,.42,-.2);}
   else if(["shelf","cabinet","counter","workbench","desk"].includes(f.symbol)){for(let i=1;i<4;i++)line(-.5+i/4,-.4,-.5+i/4,.4);line(-.4,0,.4,0);}
   else if(f.symbol==="stove"||f.symbol==="sink"){ctx.beginPath();ctx.ellipse(0,0,w*.3,h*.32,0,0,Math.PI*2);ctx.stroke();}
   else if(f.symbol==="fireplace"){ctx.fillStyle=palette.paper;ctx.fillRect(-w*.32,-h*.1,w*.64,h*.5);ctx.fillStyle=palette.accent;ctx.beginPath();ctx.moveTo(-w*.2,h*.3);ctx.lineTo(0,-h*.15);ctx.lineTo(w*.2,h*.3);ctx.fill();}
   else if(f.symbol==="table"){ctx.strokeRect(-w*.38,-h*.35,w*.76,h*.7);}
   else if(f.symbol==="rug"){ctx.setLineDash([2,2]);ctx.strokeRect(-w*.4,-h*.4,w*.8,h*.8);}
   else{line(-.4,-.2,.4,-.2);line(-.3,.2,.3,.2);}
  }ctx.restore();
 }ctx.restore();return {marks:Math.min(marks,5000),features:visible.length};
}
export function floorFeatureBounds(f:FloorFeature,features:FloorFeature[]){
 if(f.variant==="opening"){const a=openingAnchor(legacyFloorShapes([f])[0] as Extract<InteriorShape,{variant:"opening"}>,legacyFloorShapes(features));return {x:a.x-f.width/2,y:a.y-f.width/2,width:f.width,height:f.width};}
 if(f.variant==="object"){const r=Math.hypot(f.width,f.height)/2;return {x:f.point.x-r,y:f.point.y-r,width:r*2,height:r*2};}
 const xs=f.points.map(p=>p.x),ys=f.points.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}
