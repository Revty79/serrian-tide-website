import type {HydroGeometry,HydroLayer,HydroPoint} from "./terrain-hydrology";
import {waterDx} from "./terrain-water-geometry";
/** Bounded presentation index over retained actual segments, never simplified
 * shortcuts between sampled vertices. Sparse omission cannot invent a bank. */
export function artworkBankIndex(layer:HydroLayer,world:HydroGeometry){
 type Segment={a:HydroPoint;dx:number;dy:number;width:number;kind:"bank"|"coast"};
 const lines=[...layer.edges.map(e=>({points:e.points,closed:false,width:e.widthM??0,kind:"bank" as const})),...(layer.lakes??[]).filter(l=>l.condition==="standing").flatMap(l=>l.rings.map(points=>({points,closed:true,width:0,kind:"coast" as const})))],total=lines.reduce((n,l)=>n+l.points.length-Number(!l.closed),0),stride=Math.max(1,Math.ceil(total/4096)),bins=new Map<number,Segment[]>();let seen=0,entries=0;
 const bx=(x:number)=>{const n=Math.floor(x/world.width*32);return world.wrap?((n%32)+32)%32:Math.max(0,Math.min(31,n));},by=(y:number)=>Math.max(0,Math.min(31,Math.floor(y/world.height*32)));
 for(const l of lines)for(let i=0;i<l.points.length-Number(!l.closed);i++){if(seen++%stride)continue;const a=l.points[i],b=l.points[(i+1)%l.points.length],s:Segment={a,dx:waterDx(a.x,b.x,world),dy:b.y-a.y,width:l.width,kind:l.kind},x=bx(a.x+s.dx/2),y=by(a.y+s.dy/2);for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){if(entries>=65536)break;if(y+oy<0||y+oy>31||!world.wrap&&(x+ox<0||x+ox>31))continue;const key=(y+oy)*32+((x+ox+32)%32),bin=bins.get(key)??[];if(bin.length<128&&!bin.includes(s)){bin.push(s);bins.set(key,bin);entries++;}}}
 return (x:number,y:number,radius:number):"bank"|"coast"|null=>{let nearest=Infinity,result:"bank"|"coast"|null=null;for(const s of bins.get(by(y)*32+bx(x))??[]){const dx=waterDx(s.a.x,x,world),dy=y-s.a.y,t=Math.max(0,Math.min(1,(dx*s.dx+dy*s.dy)/(s.dx*s.dx+s.dy*s.dy||1))),distance=Math.hypot(dx-t*s.dx,dy-t*s.dy)-s.width/2;if(distance<radius&&distance<nearest){nearest=distance;result=s.kind;}}return result;};
}
