import type {TerrainGeometry} from "./terrain";

export type TerrainPolygonPoint={x:number;y:number};
const epsilon=1e-8;
const cross=(a:TerrainPolygonPoint,b:TerrainPolygonPoint,c:TerrainPolygonPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const between=(a:number,b:number,c:number)=>c>=Math.min(a,b)-epsilon&&c<=Math.max(a,b)+epsilon;
function touches(a:TerrainPolygonPoint,b:TerrainPolygonPoint,c:TerrainPolygonPoint,d:TerrainPolygonPoint){
 const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
 if(((abC>epsilon&&abD< -epsilon)||(abC< -epsilon&&abD>epsilon))&&((cdA>epsilon&&cdB< -epsilon)||(cdA< -epsilon&&cdB>epsilon)))return true;
 const on=(v:number,p:TerrainPolygonPoint,q:TerrainPolygonPoint,r:TerrainPolygonPoint)=>Math.abs(v)<=epsilon&&between(q.x,r.x,p.x)&&between(q.y,r.y,p.y);
 return on(abC,c,a,b)||on(abD,d,a,b)||on(cdA,a,c,d)||on(cdB,b,c,d);
}
/** One simple polygon, sampled at cell centres. Wrapping follows the same short
 * segments as the native path tool; larger selections must be split deliberately. */
export function terrainPolygonSelection(raw:TerrainPolygonPoint[],shape:TerrainGeometry){
 if(raw.length<3||raw.length>256||raw.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>shape.width||p.y<0||p.y>shape.height))throw Error("Choose 3 to 256 polygon corners inside this map's sample grid.");
 const points:TerrainPolygonPoint[]=[];
 for(const p of raw){const last=points.at(-1),x=shape.wrap&&last?p.x+Math.round((last.x-p.x)/shape.width)*shape.width:p.x;if(!last||Math.hypot(x-last.x,p.y-last.y)>epsilon)points.push({x,y:p.y});}
 if(points.length>1&&Math.hypot(points[0].x-points.at(-1)!.x,points[0].y-points.at(-1)!.y)<=epsilon)points.pop();
 if(points.length<3)throw Error("Choose at least three distinct polygon corners.");
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
 if(shape.wrap&&(maxX-minX>shape.width/2+epsilon||Math.abs(points.at(-1)!.x-points[0].x)>shape.width/2+epsilon))throw Error("Keep a polygon within half the wrapping World. Split a larger selection into smaller areas.");
 let area2=0;
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];area2+=a.x*b.y-b.x*a.y;
  if(Math.abs(cross(a,b,c))<=epsilon&&(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)< -epsilon)throw Error("A polygon edge doubles back. Adjust its corners before previewing.");
  for(let j=i+1;j<points.length;j++)if(j!==i+1&&!(i===0&&j===points.length-1)&&touches(a,b,points[j],points[(j+1)%points.length]))throw Error("The polygon crosses or touches itself. Adjust its corners before previewing.");
 }
 if(Math.abs(area2)<=epsilon)throw Error("The polygon needs a non-zero area.");
 const area={x:Math.floor(minX),y:Math.floor(Math.min(...points.map(p=>p.y))),width:Math.ceil(maxX)-Math.floor(minX),height:Math.ceil(Math.max(...points.map(p=>p.y)))-Math.floor(Math.min(...points.map(p=>p.y)))};
 const mask=new Uint8Array(area.width*area.height);let samples=0;
 for(let y=area.y;y<area.y+area.height;y++){
  const at=y+.5,xs:number[]=[];
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a.y>at)!==(b.y>at))xs.push(a.x+(at-a.y)/(b.y-a.y)*(b.x-a.x));}xs.sort((a,b)=>a-b);
  for(let n=0;n+1<xs.length;n+=2)for(let x=Math.max(area.x,Math.ceil(xs[n]-.5));x<Math.min(area.x+area.width,Math.ceil(xs[n+1]-.5));x++){mask[(y-area.y)*area.width+x-area.x]=1;samples++;}
 }
 if(!samples)throw Error("This polygon contains no sample centres. Add finer terrain detail or adjust its corners.");
 // Only each edge's feather-width corridor needs distance work. Deep interior
 // samples retain the full effect without a points-times-area distance loop.
 const interiorDistances=(feather:number)=>{
  const distances=new Float32Array(mask.length).fill(feather);
  for(let n=0;n<points.length;n++){
   const a=points[n],b=points[(n+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
   const left=Math.max(area.x,Math.floor(Math.min(a.x,b.x)-feather)),right=Math.min(area.x+area.width,Math.ceil(Math.max(a.x,b.x)+feather)),top=Math.max(area.y,Math.floor(Math.min(a.y,b.y)-feather)),bottom=Math.min(area.y+area.height,Math.ceil(Math.max(a.y,b.y)+feather));
   for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    const i=(y-area.y)*area.width+x-area.x;if(!mask[i])continue;
    const px=x+.5-a.x,py=y+.5-a.y,t=length?Math.max(0,Math.min(1,(px*dx+py*dy)/length)):0,distance2=(px-t*dx)**2+(py-t*dy)**2;
    if(distance2<distances[i]**2)distances[i]=Math.sqrt(distance2);
   }
  }
  return distances;
 };
 return {points,area,mask,samples,interiorDistances};
}
