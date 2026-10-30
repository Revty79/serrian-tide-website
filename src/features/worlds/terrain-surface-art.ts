import type {TerrainSurfaceProfile} from "./terrain-surface-profile";
import {terrainStyle,styleColor,type TerrainStyle} from "./terrain-style";
import type {SurfaceField} from "./terrain-surface-field";
import {paintMaterialWeights,type TerrainMaterials,type MaterialStroke} from "./terrain-materials";
import {shadeSurfaceTextures,surfaceLightingScale} from "./terrain-surface-texture-shading";
import {surfaceTextureWork,type SurfaceTextureWork,type SurfaceTextureSet} from "./terrain-surface-textures";

const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=(n:number)=>{n=clamp(n);return n*n*(3-2*n);};
function hash(x:number,y:number){let n=Math.imul(x|0,374761393)^Math.imul(y|0,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(x:number,y:number){const a=Math.floor(x),b=Math.floor(y),u=smooth(x-a),v=smooth(y-b);return (hash(a,b)*(1-u)+hash(a+1,b)*u)*(1-v)+(hash(a,b+1)*(1-u)+hash(a+1,b+1)*u)*v;}
/** Nonrepeating physical mineral plates / clasts, independent of image tiles. */
function stoneCells(x:number,y:number){const ix=Math.floor(x),iy=Math.floor(y);let first=Infinity,second=Infinity,tone=.5,nx=0,ny=0;for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const cx=ix+i,cy=iy+j,px=cx+.18+hash(cx,cy)*.64,py=cy+.18+hash(cx+701,cy-393)*.64,dx=x-px,dy=y-py,d=dx*dx+dy*dy;if(d<first){second=first;first=d;tone=hash(cx-183,cy+439);nx=dx;ny=dy;}else second=Math.min(second,d);}return {edge:Math.sqrt(second)-Math.sqrt(first),radius:Math.sqrt(first),tone,nx,ny};}
/** Coordinate-anchored, periodic in wrapped Worlds, band limited by artwork footprint. */
export function surfaceNoise(x:number,y:number,scale:number,period:number|null){if(period)x=((x%period)+period)%period;const a=noise(x/scale,y/scale);if(!period)return a;const t=smooth(x/period);return a*(1-t)+noise((x-period)/scale,y/scale)*t;}
export type SurfacePixelWork={weights:number[];original:number[];water:[number,number,number];rgb:[number,number,number];texture:SurfaceTextureWork;lighting:{footprint:number;relief:number;scale:number}};
export const surfacePixelWork=():SurfacePixelWork=>({weights:[0,0,0,0,0,0],original:[0,0,0,0,0,0],water:[0,0,0],rgb:[0,0,0],texture:surfaceTextureWork(),lighting:{footprint:NaN,relief:NaN,scale:1}});
const OPAQUE_MATERIAL={visible:true,opacity:1};
export function automaticSurface(field:SurfaceField,sea:number,out:number[]=[0,0,0,0,0,0]){
 const slope=Math.hypot(field.gx,field.gy),height=Math.max(0,field.height-sea),high=height/(height+1000),steep=slope/(slope+.65),rugged=field.rough/(field.rough+1.8),rock=clamp(.70*steep+.22*rugged+.48*high,0,.94);
 // Nearby accepted relief suggests loose material below a cliff, without
 // changing the flat shelf's height or claiming unseen geology.
 const rise=Math.max(0,(field.coastHigh??field.height)-field.height),talus=rise/(rise+80)*Math.min(1,80/Math.max(80,field.spacing)),loose=clamp(steep*.48+talus*.5,0,.75),scree=(1-rock)*loose;
 const coastDistance=Math.abs(field.waterHeight-sea)/Math.max(.02,slope),beach=(1-smooth(coastDistance/60))*(1-smooth(slope/.45))*(field.spacing<=200&&(field.coastLow??Infinity)<=sea&&(field.coastHigh??-Infinity)>sea?1:0),soil=(1-rock-scree)*(.15+.2*high+.2*talus),grass=Math.max(0,1-rock-scree-soil);
 out[0]=rock*(1-beach);out[1]=scree*(1-beach);out[2]=soil*(1-beach);out[3]=grass*(1-beach);out[4]=beach;out[5]=0;let sum=0;for(let i=0;i<6;i++)sum+=out[i];for(let i=0;i<6;i++)out[i]/=sum||1;return out;
}
/** Original procedural surface artwork. Texture normals affect light only and are
 * never exposed as measured relief. Snow is explicit paint, never a climate inference. */
export function surfacePixel(field:SurfaceField,x:number,y:number,footprint:number,sea:number,relief:number,layer:TerrainMaterials,strokes:MaterialStroke[],period:number|null,textures?:SurfaceTextureSet,profile?:TerrainSurfaceProfile,work?:SurfacePixelWork,art?:TerrainStyle):[number,number,number]{
 const style=terrainStyle(art);relief=Math.max(1,relief*style.relief);
 const band=(scale:number)=>smooth(scale/(footprint*2)-.4),n=(scale:number,ox=0,oy=0)=>{const weight=band(scale);return weight ? .5+(surfaceNoise(x+ox,y+oy,scale,period)-.5)*weight:.5;},slope=Math.hypot(field.gx,field.gy),depth=sea-field.waterHeight,water=work?.water??[0,0,0],landFraction=slope<1e-6?(depth>=0?0:1):clamp(.5-depth/(slope*footprint));
 if(landFraction<1){const shallow=Math.exp(-Math.max(0,depth)/45),shelf=Math.exp(-Math.max(0,depth)/700),ripple=Math.sin(n(4)*6+n(320)*5)*band(5)*.25;water[0]=12+shallow*56+shelf*9+ripple;water[1]=39+shallow*94+shelf*22+ripple*2;water[2]=57+shallow*74+shelf*24+ripple*2;}else water[0]=water[1]=water[2]=0;
 if(landFraction===0)return (art?styleColor(water,true,style,water):water) as [number,number,number];
 const density=(style?.detail??1)*(style?.scale??1),broad=style?.texture===0?.5:.5+(n(2700/density)-.5)*.6+(n(320/density)-.5)*.4;
 const timed=profile?.sampling,classificationStart=timed?performance.now():0;
 const coverage=layer.visible?layer.opacity:0,weights=layer.automatic?automaticSurface(field,sea,work?.weights):(work?.weights??[0,0,0,0,0,0]);if(!layer.automatic){weights.fill(0);weights[2]=1;}if(layer.automatic){const mineral=weights[0]+weights[1],ground=weights[2]+weights[3],shift=(n(80)-.5)*.5*Math.min(mineral,ground);if(mineral>0&&ground>0){weights[0]+=shift*weights[0]/mineral;weights[1]+=shift*weights[1]/mineral;weights[2]-=shift*weights[2]/ground;weights[3]-=shift*weights[3]/ground;}}if(timed)profile!.record("classification",performance.now()-classificationStart);const strokeStart=timed?performance.now():0;if(strokes.length)paintMaterialWeights(weights,OPAQUE_MATERIAL,strokes,x,y,period,work?.original);if(timed)profile!.record("strokes",performance.now()-strokeStart);for(let i=0;i<6;i++)weights[i]=weights[i]*coverage+(i===2?1-coverage:0);
 if(textures){if(work&&(work.lighting.footprint!==footprint||work.lighting.relief!==relief)){work.lighting.footprint=footprint;work.lighting.relief=relief;work.lighting.scale=surfaceLightingScale(relief,footprint);}const rgb=shadeSurfaceTextures(textures,field,weights,x,y,footprint,relief,period,broad,water,landFraction,profile,work?.texture,work?.rgb,work?.lighting.scale,style.texture);// Retain geological texture between the photographic mip scale and broad relief.
 // These normals/strata are illustration only; the accepted height is untouched.
 if(field.spacing<=100&&footprint<8){const mineral=weights[0]+weights[1],meso=(broad-.5)*.12,periodicX=period?Math.sin(2*Math.PI*x/period)*period/(2*Math.PI):x;
 const strata=Math.sin((periodicX*.28+y*.47)/38+field.height*.018+(broad-.5)*2)*band(220)*.055*mineral;
 const ground=(broad-.5)*band(18)*.07*(weights[2]+weights[3]),variation=1+(meso+strata+ground)*style.texture;
 for(let k=0;k<3;k++)rgb[k]=clamp(rgb[k]*variation,0,255);}
 return art?styleColor(rgb,false,style,rgb) as [number,number,number]:rgb;}
 // Warped, stratified stone: connected ridges, mineral faces and narrow joints.
 const meso=n(320),grain=n(5),detail=band(20);
 const warp=n(65)*3,periodicX=period?Math.sin(2*Math.PI*x/period)*period/(2*Math.PI):x,axis=(periodicX*.72+y*.43)/17+warp+field.height*.012,vein=Math.abs(Math.sin(axis)),joints=smooth((.12-vein)/.12),facets=Math.abs(n(28)-.5)*2;
 const plates=weights[0]>.08&&band(30)>0?stoneCells((periodicX*.8+y*.6)/28+n(90)*1.2,(-periodicX*.6+y*.8)/28+field.height*.003):{edge:1,radius:0,tone:.5,nx:0,ny:0},cracks=(1-smooth(plates.edge/Math.max(.035,footprint/28)))*band(30),plateNormal=(plates.nx*.16+plates.ny*.11)*band(30);
 const rockTone=clamp(.53+(broad-.5)*.16+(meso-.5)*.22*detail+(plates.tone-.5)*.25*band(30)+facets*.18*detail-joints*.18*detail-cracks*.2),clasts=weights[1]>.1&&band(2)>0?stoneCells(periodicX/1.6,y/1.6):{radius:.5,tone:.5},gravel=(grain-.5)*detail+(1-smooth(clasts.radius/.48))*(clasts.tone-.25)*band(2),grassPatch=(meso-.5)*.22*detail+broad*.52,soilClods=(n(13)-.5)*detail;
 const sandRipple=Math.sin((periodicX*.75+y*.66)/1.7+n(38)*4)*band(2);
 const materials=[[65+rockTone*62,65+rockTone*59,59+rockTone*56],[99+gravel*36+meso*15,95+gravel*34+meso*13,80+gravel*30+meso*12],[102+soilClods*32+meso*18,77+soilClods*24+meso*13,49+soilClods*18+meso*11],[46+grassPatch*38+grain*detail*7,66+grassPatch*36+grain*detail*9,30+grassPatch*23],[188+meso*24+sandRipple*6,171+meso*22+sandRipple*5,128+meso*19+sandRipple*3],[217+meso*21,225+meso*18,224+meso*20]];
 const micro=weights[0]*(detail*.13*(n(12,3,0)-n(12,-3,0))+plateNormal)+weights[1]*gravel*.15,exaggeration=Math.sqrt(relief)*.35,gx=Math.atan(field.gx*exaggeration)+micro,gy=Math.atan(field.gy*exaggeration)+weights[0]*detail*.13*(n(12,0,3)-n(12,0,-3)),light=clamp((.82-.48*gx-.35*gy)/Math.hypot(gx,gy,1),.10,1.28),ambient=.66+light*.42;
 const occlusion=1-clamp(field.rough*.15,0,.18),coastalWet=1-(1-smooth(depth/-2))*.13;
 const rgb=[0,1,2].map(k=>clamp(materials.reduce((s,c,i)=>s+c[k]*weights[i],0)*ambient*occlusion*coastalWet,0,255)*landFraction+water[k]*(1-landFraction)) as [number,number,number];return art?styleColor(rgb,false,style,rgb) as [number,number,number]:rgb;
}
