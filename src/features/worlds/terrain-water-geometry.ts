import type {HydroGeometry,HydroPoint} from "./terrain-hydrology";

export const waterDx=(a:number,b:number,world:HydroGeometry)=>{let d=b-a;if(world.wrap)d-=Math.round(d/world.width)*world.width;return d;};
export function waterPoint(point:HydroPoint,world:HydroGeometry):HydroPoint{return {x:world.wrap?((point.x%world.width)+world.width)%world.width:point.x,y:point.y};}
export function unwrapWaterRing(ring:HydroPoint[],world:HydroGeometry){const out:HydroPoint[]=[];for(const p of ring)out.push({x:out.length?out.at(-1)!.x+waterDx(out.at(-1)!.x,p.x,world):p.x,y:p.y});return out;}
const cross=(a:HydroPoint,b:HydroPoint,c:HydroPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function onSegment(a:HydroPoint,b:HydroPoint,p:HydroPoint){return Math.abs(cross(a,b,p))<=1e-7*Math.max(1,Math.hypot(b.x-a.x,b.y-a.y))&&p.x>=Math.min(a.x,b.x)-1e-7&&p.x<=Math.max(a.x,b.x)+1e-7&&p.y>=Math.min(a.y,b.y)-1e-7&&p.y<=Math.max(a.y,b.y)+1e-7;}
export function waterSegmentsIntersect(a:HydroPoint,b:HydroPoint,c:HydroPoint,d:HydroPoint){const aa=cross(a,b,c),bb=cross(a,b,d),cc=cross(c,d,a),dd=cross(c,d,b);return aa*bb<0&&cc*dd<0||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);}
export function waterRingArea(ring:HydroPoint[],world:HydroGeometry){const p=unwrapWaterRing(ring,world),origin=p[0];return Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+(a.x-origin.x)*(b.y-origin.y)-(b.x-origin.x)*(a.y-origin.y);},0))/2;}
export function insideWaterRings(point:HydroPoint,rings:HydroPoint[][],world:HydroGeometry){let inside=false;for(const ring of rings){const p=unwrapWaterRing(ring,world),q={x:p[0].x+waterDx(p[0].x,point.x,world),y:point.y};for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if(onSegment(a,b,q))return true;if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}}return inside;}
export function nearestWaterShore(point:HydroPoint,rings:HydroPoint[][],world:HydroGeometry){let best=Infinity,result=point;for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=waterDx(a.x,b.x,world),dy=b.y-a.y,x=waterDx(a.x,point.x,world),y=point.y-a.y,t=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy||1))),distance=(x-t*dx)**2+(y-t*dy)**2;if(distance<best){best=distance;result=waterPoint({x:a.x+t*dx,y:a.y+t*dy},world);}}return {point:result,distance:Math.sqrt(best)};}
export function waterBodiesOverlap(a:HydroPoint[][],b:HydroPoint[][],world:HydroGeometry){
  const ar=a.map(r=>unwrapWaterRing(r,world)),br=b.map(r=>unwrapWaterRing(r,world)),origin=ar[0][0].x;
  for(const ring of br){const shift=world.wrap?Math.round((origin-ring[0].x)/world.width)*world.width:0;for(const p of ring)p.x+=shift;}
  const bounds=(rings:HydroPoint[][])=>{let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(const p of rings.flat()){left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);}return {left,right,top,bottom};},aa=bounds(ar),bb=bounds(br);
  if(aa.right<bb.left||bb.right<aa.left||aa.bottom<bb.top||bb.bottom<aa.top)return false;
  if(a.some(r=>insideWaterRings(r[0],b,world))||b.some(r=>insideWaterRings(r[0],a,world)))return true;
  for(const r of ar)for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];for(const s of br)for(let j=0;j<s.length;j++){const x=s[j],y=s[(j+1)%s.length];if(Math.max(p.x,q.x)<Math.min(x.x,y.x)||Math.max(x.x,y.x)<Math.min(p.x,q.x)||Math.max(p.y,q.y)<Math.min(x.y,y.y)||Math.max(x.y,y.y)<Math.min(p.y,q.y))continue;if(waterSegmentsIntersect(p,q,x,y))return true;}}
  return false;
}

/** Sweep bounding boxes before exact intersections; bounded to 8,192 vertices. */
export function validateWaterRings(rings:HydroPoint[][],world:HydroGeometry){
  let total=0;const segments:{a:HydroPoint;b:HydroPoint;ring:number;index:number;length:number;left:number;right:number;top:number;bottom:number}[]=[];
  for(let r=0;r<rings.length;r++){
    const ring=unwrapWaterRing(rings[r],world);total+=ring.length;if(ring.length<3||waterRingArea(rings[r],world)<1e-6)throw Error("A shoreline needs at least three distinct points enclosing an area.");
    if(Math.max(...ring.map(p=>p.x))-Math.min(...ring.map(p=>p.x))>=world.width*.999999&&world.wrap)throw Error("A shoreline cannot encircle the entire wrapped World. Use separate bounded waterbodies.");
    const shift=r?Math.round((segments[0].a.x-ring[0].x)/world.width)*(world.wrap?world.width:0):0;
    for(let i=0;i<ring.length;i++){const a={...ring[i],x:ring[i].x+shift},b={...ring[(i+1)%ring.length],x:ring[(i+1)%ring.length].x+shift};if(Math.hypot(a.x-b.x,a.y-b.y)<1e-7)throw Error("Shoreline points must be distinct.");segments.push({a,b,ring:r,index:i,length:ring.length,left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)});}
  }
  if(total>8192)throw Error("This shoreline exceeds the 8,192-point geometry budget.");
  const active:typeof segments=[];for(const s of segments.sort((a,b)=>a.left-b.left||a.top-b.top)){for(let i=active.length-1;i>=0;i--)if(active[i].right<s.left)active.splice(i,1);for(const other of active){if(s.ring===other.ring&&(Math.abs(s.index-other.index)===1||Math.abs(s.index-other.index)===s.length-1))continue;if(s.bottom<other.top||s.top>other.bottom)continue;if(waterSegmentsIntersect(s.a,s.b,other.a,other.b))throw Error("Shorelines cannot cross or touch themselves or another shoreline ring.");}active.push(s);}
}

export function waterBounds(points:HydroPoint[],world:HydroGeometry,padding=0){const p=unwrapWaterRing(points,world);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const q of p){minX=Math.min(minX,q.x);minY=Math.min(minY,q.y);maxX=Math.max(maxX,q.x);maxY=Math.max(maxY,q.y);}const left=minX-padding,top=Math.max(0,minY-padding),right=maxX+padding,bottom=Math.min(world.height,maxY+padding);return {x:world.wrap?((left%world.width)+world.width)%world.width:Math.max(0,left),y:top,width:Math.min(world.width,Math.max(1,right-Math.max(world.wrap?-Infinity:0,left))),height:Math.max(1,bottom-top)};}
