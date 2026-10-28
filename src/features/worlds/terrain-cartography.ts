import type {TerrainGeometry} from "./terrain";
import {physicalReliefShade} from "./terrain-relief";
import type {MapAppearance} from "./terrain-appearance";
import {terrainStyle,styleColor,artLight} from "./terrain-style";
import {surfaceNoise} from "./terrain-surface-art";

export type HeightSampler=(x:number,y:number)=>number;
export type ContourSegment={a:[number,number];b:[number,number];height:number;major:boolean};
type RGB=readonly[number,number,number];
// Original cartographic material palettes, independent of application chrome.
const topo:readonly[number,RGB][]=[[0,[218,228,192]],[150,[222,230,198]],[500,[233,232,195]],[1000,[232,217,178]],[2000,[213,192,159]],[3500,[198,183,167]],[5000,[226,220,207]],[7000,[250,247,238]]];
const fantasy:readonly[number,RGB][]=[[0,[235,230,203]],[200,[229,224,192]],[700,[221,210,177]],[1600,[210,194,159]],[3200,[193,176,147]],[5500,[227,218,195]],[8000,[246,239,220]]];
function ramp(z:number,stops:readonly[number,RGB][]):RGB{let i=1;while(i<stops.length-1&&z>stops[i][0])i++;const [lo,a]=stops[i-1],[hi,b]=stops[i],t=Math.max(0,Math.min(1,(z-lo)/(hi-lo)));return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
export function cartographicColor(relativeHeight:number,spec:MapAppearance):RGB{
 const illustrated=spec.style==="illustrated-fantasy";
 if(relativeHeight<=0){const t=spec.bathymetry?Math.min(1,Math.sqrt(-relativeHeight/6000)): .35,a=illustrated?[189,211,211]:[185,212,222],b=illustrated?[131,168,179]:[112,160,186];return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
 const rgb=ramp(relativeHeight,illustrated?fantasy:topo),warm=illustrated&&spec.paper==="parchment";return rgb.map((c,i)=>Math.max(0,Math.min(255,(c-210)*spec.contrast+210-(warm?[0,8,20][i]:0)))) as unknown as RGB;
}
/** Marching squares in sample-centre coordinates. Saddle pairs use the actual centre height. */
export function contourCell(values:readonly[number,number,number,number],level:number):Array<[[number,number],[number,number]]>{
 const corners:readonly[number,number][]=[[0,0],[1,0],[1,1],[0,1]],points:{edge:number;p:[number,number]}[]=[];
 for(let edge=0;edge<4;edge++){const next=(edge+1)%4,a=values[edge],b=values[next];if((a>level)===(b>level))continue;const t=(level-a)/(b-a);points.push({edge,p:[corners[edge][0]+(corners[next][0]-corners[edge][0])*t,corners[edge][1]+(corners[next][1]-corners[edge][1])*t]});}
 if(points.length===2)return [[points[0].p,points[1].p]];if(points.length!==4)return [];
 const high=values.reduce((n,z)=>n+z,0)/4>level,first=values[0]>level;
 return high===first?[[points[0].p,points[1].p],[points[2].p,points[3].p]]:[[points[0].p,points[3].p],[points[1].p,points[2].p]];
}
/** Work is bounded per numerical cell, even for a manually requested one-metre interval. */
export function tileContours(sample:HeightSampler,x0:number,y0:number,sea:number,interval:number,depth=false):ContourSegment[]{
 const out:ContourSegment[]=[];
 for(let y=-1;y<32;y++)for(let x=-1;x<32;x++){
  const values=[sample(x0+x,y0+y),sample(x0+x+1,y0+y),sample(x0+x+1,y0+y+1),sample(x0+x,y0+y+1)] as const,min=Math.min(...values)-sea,max=Math.max(...values)-sea;
  let step=interval;while((max-min)/step>12)step*=5;
  const levels:number[]=[];if(min<=0&&max>=0)levels.push(0);
  for(let z=Math.ceil(min/step)*step;z<=max&&levels.length<15;z+=step)if(z!==0&&(z>0||depth))levels.push(z);
  for(const height of levels)for(const [a,b] of contourCell(values,height+sea))out.push({a:[x+a[0]+.5,y+a[1]+.5],b:[x+b[0]+.5,y+b[1]+.5],height,major:height===0||Math.abs(height/(interval*5)-Math.round(height/(interval*5)))<1e-7});
 }return out;
}
export const CARTOGRAPHIC_TILE_PIXELS=96;
const summitNeighbors=[[-2,0],[2,0],[0,-2],[0,2],[-1,-1],[1,-1],[-1,1],[1,1]] as const;
/** An ink summit is permitted only at a distinct local maximum of saved relief. */
export function cartographicSummit(sample:HeightSampler,x:number,y:number,sea:number){
 const z=sample(x,y);if(z<=sea+450)return 0;let highest=-Infinity,lowest=Infinity;
 for(const [dx,dy] of summitNeighbors){const n=sample(x+dx,y+dy);highest=Math.max(highest,n);lowest=Math.min(lowest,n);}
 return z>highest+3?Math.min(1,(z-lowest)/180):0;
}
/** A smoothed numerical principal-curvature crease, not an invented mountain symbol. */
export function terrainInkField(sample:HeightSampler,x:number,y:number,sea:number){
 const smooth=(x:number,y:number)=>(4*sample(x,y)+2*(sample(x-1,y)+sample(x+1,y)+sample(x,y-1)+sample(x,y+1))+sample(x-1,y-1)+sample(x+1,y-1)+sample(x-1,y+1)+sample(x+1,y+1))/16;
 const z=smooth(x,y);if(z<sea+250)return null;const west=smooth(x-1,y),east=smooth(x+1,y),north=smooth(x,y-1),south=smooth(x,y+1),xx=east+west-2*z,yy=north+south-2*z,xy=(smooth(x+1,y+1)-smooth(x-1,y+1)-smooth(x+1,y-1)+smooth(x-1,y-1))/4,span=Math.hypot(xx-yy,2*xy),hi=(xx+yy+span)/2,lo=(xx+yy-span)/2,low=Math.abs(lo)>Math.abs(hi),curvature=low?lo:hi;
 if(Math.abs(curvature)<5)return null;const angle=.5*Math.atan2(2*xy,xx-yy)+(low?Math.PI/2:0);let nx=Math.cos(angle),ny=Math.sin(angle);if(nx<0){nx=-nx;ny=-ny;}
 return {z,nx,ny,derivative:(east-west)/2*nx+(south-north)/2*ny,ridge:curvature<0};
}
/** Bilinear presentation, not new terrain detail. Every line and wash is sampled from numerical heights. */
export function drawCartographicTile(canvas:HTMLCanvasElement,sample:HeightSampler,x0:number,y0:number,shape:TerrainGeometry,sea:number,spec:MapAppearance,interval:number,origin:{x:number;y:number},scale:number,pixels=CARTOGRAPHIC_TILE_PIXELS,periodX:number|null=shape.wrap?shape.displayWidth:null){
 const size=pixels,factor=size/32,ctx=canvas.getContext("2d")!,dx=shape.displayWidth/shape.width,dy=shape.displayHeight/shape.height;
 canvas.width=canvas.height=size;
 // Read a bounded numerical halo once. No mutable terrain or whole-World work here.
 const halo=new Float64Array(64*64);for(let y=-16;y<48;y++)for(let x=-16;x<48;x++)halo[(y+16)*64+x+16]=sample(x0+x,y0+y);
 const at=(x:number,y:number)=>halo[(Math.max(-16,Math.min(47,y))+16)*64+Math.max(-16,Math.min(47,x))+16];
 const interpolate=(x:number,y:number)=>{const a=Math.floor(x),b=Math.floor(y),u=x-a,v=y-b;return (at(a,b)*(1-u)+at(a+1,b)*u)*(1-v)+(at(a,b+1)*(1-u)+at(a+1,b+1)*u)*v;};
 const image=ctx.createImageData(size,size),illustrated=spec.style==="illustrated-fantasy",art=terrainStyle(spec.art);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const gx=(x+.5)/factor-.5,gy=(y+.5)/factor-.5,z=interpolate(gx,gy),rgb=cartographicColor(z-sea,spec),spanX=shape.wrap?2:Math.min(shape.width-1,x0+gx+1)-Math.max(0,x0+gx-1),spanY=Math.min(shape.height-1,y0+gy+1)-Math.max(0,y0+gy-1),gradientX=(interpolate(gx+1,gy)-interpolate(gx-1,gy))/(Math.max(.25,spanX)*dx),gradientY=(interpolate(gx,gy+1)-interpolate(gx,gy-1))/(Math.max(.25,spanY)*dy),light=z>sea?physicalReliefShade(gradientX,gradientY,spec.relief):1,shade=illustrated?.86+.14*light:.42+.58*light,p=(y*size+x)*4;
  let tone=shade;
  if(illustrated){const px=origin.x+(x0+gx)*dx,py=origin.y+(y0+gy)*dy,footprint=Math.max(dx,dy)/factor,light=artLight(gradientX,gradientY,footprint,spec.relief,art.relief),grain=surfaceNoise(px,py,Math.max(80,1200/art.detail),periodX)-.5;
   tone=z>sea?(.63+.39*light)*(1+grain*.095*art.texture):1;}
  const painted=[rgb[0]*tone,rgb[1]*tone,rgb[2]*tone];if(spec.art)styleColor(painted,z<=sea,art,painted);
  for(let c=0;c<3;c++)image.data[p+c]=painted[c];image.data[p+3]=255;
 }ctx.putImageData(image,0,0);ctx.scale(factor,factor);ctx.lineCap="round";ctx.lineJoin="round";
 const segments=tileContours((x,y)=>at(x-x0,y-y0),x0,y0,sea,interval,spec.bathymetry),coasts=new Path2D(),major=new Path2D(),minor=new Path2D(),depth=new Path2D();
 for(const s of segments){if(s.height<0&&Math.abs(s.height/Math.max(500,interval*5)-Math.round(s.height/Math.max(500,interval*5)))>1e-7)continue;const path=s.height===0?coasts:s.height<0?depth:s.major?major:minor;path.moveTo(...s.a);path.lineTo(...s.b);}
 if(spec.contours){ctx.strokeStyle=illustrated?"rgba(102,81,56,.19)":"rgba(117,83,59,.32)";ctx.lineWidth=illustrated?.16:.18;ctx.stroke(minor);ctx.strokeStyle=illustrated?"rgba(92,69,46,.32)":"rgba(104,70,47,.55)";ctx.lineWidth=.3;ctx.stroke(major);}
 if(spec.bathymetry&&spec.decoration>0){ctx.strokeStyle=illustrated?"rgba(63,102,117,.21)":"rgba(65,117,146,.2)";ctx.lineWidth=.18;ctx.stroke(depth);}
 if(illustrated&&spec.decoration>0&&art.ink>0){
  // Continuous numerical ridge/valley axes and curved, tapered slope hachures.
  // The halo includes stroke origins outside a tile, so pen lines cross its edge.
  const fields=new Map<number,ReturnType<typeof terrainInkField>>(),field=(x:number,y:number)=>{const key=(y+12)*57+x+12;if(!fields.has(key))fields.set(key,terrainInkField(at,x,y,sea));return fields.get(key)!;},ridges=new Path2D(),valleys=new Path2D(),hatches=[new Path2D(),new Path2D(),new Path2D()],spacing=Math.max(dx*1.25,dy*1.25,4/Math.max(1e-9,scale));let strokes=0;
  for(let y=-11;y<43;y++)for(let x=-11;x<43;x++){
   const f=[field(x,y),field(x+1,y),field(x+1,y+1),field(x,y+1)];if(f.some(v=>!v)||f.some(v=>v!.ridge!==f[0]!.ridge))continue;
   for(const [a,b] of contourCell(f.map(v=>v!.derivative) as [number,number,number,number],0)){
    const ridge=f[0]!.ridge,path=ridge?ridges:valleys,ax=x+a[0]+.5,ay=y+a[1]+.5,bx=x+b[0]+.5,by=y+b[1]+.5;path.moveTo(ax,ay);path.lineTo(bx,by);
    const horizontal=Math.abs(bx-ax)>Math.abs(by-ay),wa=horizontal?origin.x+(x0+ax)*dx:origin.y+(y0+ay)*dy,wb=horizontal?origin.x+(x0+bx)*dx:origin.y+(y0+by)*dy;const step=horizontal&&periodX?periodX/Math.max(1,Math.round(periodX/spacing)):spacing;if(strokes>=384)continue;
    const lower=Math.min(wa,wb),upper=Math.max(wa,wb),periods=horizontal&&periodX?Math.round(periodX/step):0;
    let along:number|undefined,penIndex=0;for(let n=Math.floor(lower/step);n<=Math.floor(upper/step);n++){const phase=periods?((n%periods)+periods)%periods:n,target=(n+.5+.22*Math.sin(phase*2.399963229728653))*step;if(target>=lower&&target<=upper){along=target;penIndex=phase;break;}}if(along===undefined)continue;
    const t=(along-wa)/(wb-wa),start={x:ax+(bx-ax)*t-.5,y:ay+(by-ay)*t-.5},normal=f[0]!,strokeSteps=10+Math.floor(2*(1+Math.sin(penIndex*2.399963229728653)));
    for(const side of [-1,1]){let px=start.x+normal.nx*side*(ridge ? .55 : 2.3),py=start.y+normal.ny*side*(ridge ? .55 : 2.3);if(interpolate(px,py)<sea+80)continue;let begun=false;
     for(let n=0;n<strokeSteps;n++){const hx=interpolate(px+1,py)-interpolate(px-1,py),hy=interpolate(px,py+1)-interpolate(px,py-1),gx=hx/dx,gy=hy/dy,length=Math.hypot(gx,gy);if(Math.hypot(hx,hy)<8||px< -12||px>44||py< -12||py>44||interpolate(px,py)<sea+180)break;
      if(!begun){begun=true;strokes++;}const pen=hatches[n<2||n>9?0:gx+gy>0?1:2];pen.moveTo(px+.5,py+.5);const unit=Math.min(dx,dy)*.58;px-=gx/length*unit/dx;py-=gy/length*unit/dy;pen.lineTo(px+.5,py+.5);
     }
    }
   }
  }
  const penWidth=Math.max(.055,.85/Math.max(.01,Math.max(dx,dy)*scale))*art.ink;for(let n=0;n<3;n++){ctx.strokeStyle=`rgba(67,49,32,${Math.min(.9,[.22,.42,.64][n]*spec.decoration*spec.contrast)})`;ctx.lineWidth=penWidth*(n===0?.6:1);ctx.stroke(hatches[n]);}ctx.strokeStyle="rgba(255,248,222,.68)";ctx.lineWidth=penWidth*1.6;ctx.stroke(ridges);ctx.strokeStyle=`rgba(105,85,60,${.25*spec.decoration})`;ctx.lineWidth=penWidth*.7;ctx.stroke(valleys);
 }
 if(illustrated&&spec.decoration>0&&art.ink>0){
  // Bounded summit silhouettes complement continuous terrain-following hachures.
  // Their tips are numerical maxima; the pen footprint is artwork, never elevation.
  let count=0;const pen=Math.max(.035,.7/Math.max(.01,Math.max(dx,dy)*scale))*art.ink;
  for(let y=-3;y<35&&count<96;y++)for(let x=-3;x<35&&count<96;x++){const strength=cartographicSummit(at,x,y,sea);if(!strength)continue;const r=Math.min(1.8,12/Math.max(.01,Math.max(dx,dy)*scale))*Math.sqrt(strength)*Math.min(1.3,art.detail),rise=r*1.15,px=x+.5,py=y+.5;if(interpolate(x-r,y+rise)<=sea+30||interpolate(x+r,y+rise)<=sea+30)continue;count++;ctx.globalAlpha=spec.decoration;
   ctx.beginPath();ctx.moveTo(px-r,py+rise);ctx.lineTo(px,py);ctx.lineTo(px+r,py+rise);ctx.lineTo(px+.12*r,py+.55*rise);ctx.closePath();ctx.fillStyle="rgba(241,227,190,.82)";ctx.fill();ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+r,py+rise);ctx.lineTo(px+.12*r,py+.55*rise);ctx.closePath();ctx.fillStyle="rgba(111,94,67,.3)";ctx.fill();ctx.beginPath();ctx.moveTo(px-r,py+rise);ctx.lineTo(px,py);ctx.lineTo(px+r,py+rise);ctx.moveTo(px,py);ctx.lineTo(px+.12*r,py+.55*rise);ctx.strokeStyle="rgba(78,60,39,.75)";ctx.lineWidth=pen;ctx.stroke();ctx.globalAlpha=1;
  }
 }
 if(spec.coastline>0){ctx.strokeStyle=illustrated?"rgba(251,244,221,.9)":"rgba(246,244,223,.85)";ctx.lineWidth=1.05*spec.coastline;ctx.stroke(coasts);ctx.strokeStyle=illustrated?"#4e625b":"#426b70";ctx.lineWidth=.36*spec.coastline;ctx.stroke(coasts);}
 return {segments:segments.length};
}
