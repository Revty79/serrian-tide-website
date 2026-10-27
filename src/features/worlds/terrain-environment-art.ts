import type {EnvironmentLayer,Biome,Vegetation} from "./terrain-environment";
import {biomeKeys} from "./terrain-environment";
import {environmentSampler,environmentSampleWork} from "./terrain-environment-sample";
import {environmentalWaterIndex} from "./terrain-environment-water";
import {materialCoverage,type TerrainMaterials} from "./terrain-materials";
import type {HydroLayer,HydroGeometry} from "./terrain-hydrology";
import type {SurfaceField} from "./terrain-surface-field";
import {surfaceNoise} from "./terrain-surface-art";

/** Geographic render materials, deliberately independent of interface colors. */
export const environmentalPalette:Record<Biome,[number,number,number]>={water:[35,91,105],rainforest:[34,76,43],seasonal:[76,103,48],deciduous:[66,103,50],conifer:[49,82,65],boreal:[57,82,69],savanna:[145,144,72],grassland:[110,137,67],scrub:[125,126,79],steppe:[154,145,100],hotDesert:[206,178,123],coldDesert:[163,157,128],tundra:[125,139,117],alpine:[143,151,134],ice:[228,235,232],wetland:[67,111,91]};
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n)),smooth=(n:number)=>{n=clamp(n);return n*n*(3-2*n);};
function hash(x:number,y:number,seed:number){let n=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function seedCode(text:string){let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return n|0;}
export function manualMaterialAuthority(layer:TerrainMaterials,x:number,y:number,period:number|null){if(!layer.visible||!layer.opacity)return 0;let remaining=1,authority=0;for(let i=layer.strokes.length-1;i>=0&&remaining>.001;i--){const s=layer.strokes[i],amount=materialCoverage(s,x,y,period)*layer.opacity;if(s.material!=="automatic")authority+=amount*remaining;remaining*=1-amount;}return authority;}
/** Upright layered conifer silhouette; the mask is illustrative, not surveyed. */
export function illustratedConiferMask(x:number,y:number){let result=0;for(let tier=0;tier<3;tier++){const top=-.58+tier*.2,bottom=.02+tier*.2;if(y<top||y>bottom)continue;const width=(y-top)*.62;if(Math.abs(x)<width)result=Math.max(result,Math.abs(Math.abs(x)-width)<.025||Math.abs(y-bottom)<.025?2:1);}return result;}
/** Artistic crown positions are deterministic coverage texture, never surveyed
 * trees or new terrain. The same physical cells are used by every image tile. */
function canopy(x:number,y:number,scale:number,seed:number,kind:Vegetation,illustrated:boolean,period:number|null,out:{coverage:number;shade:number;edge:number}){
  const count=period?Math.max(1,Math.round(period/scale)):0;if(period)scale=period/count;const randomAt=(x:number,y:number)=>hash(count?((x%count)+count)%count:x,y,seed),ix=Math.floor(x/scale),iy=Math.floor(y/scale);let coverage=0,shade=1,edge=0,highest=-1;
  for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){const cx=ix+ox,cy=iy+oy,random=randomAt(cx,cy),dx=x/scale-(cx+.12+random*.76),dy=y/scale-(cy+.12+randomAt(cx+409,cy-817)*.76),radius=.35+randomAt(cx-29,cy+71)*.25;
    if(kind==="conifer"&&illustrated){const size=radius/.48,mask=illustratedConiferMask((dx+(random-.5)*dy*.18)/size,dy/size);if(mask){coverage=1;shade=.7+clamp(-dx)*.34+(random-.5)*.1;edge=mask===2?1:0;}continue;}
    const angle=Math.atan2(dy,dx),elongation=.78+randomAt(cx+43,cy+89)*.56,d=Math.sqrt(dx*dx*elongation+dy*dy/elongation),lobes=1+.09*Math.sin(angle*(kind==="conifer"?9:5)+random*17)+.045*Math.sin(angle*11+random*31),r=radius*lobes,height=1-(d/r)**2;if(d<r&&height>highest){highest=height;coverage=1;shade=.57+clamp(height)*.43+(-dx-dy)*.31+(random-.5)*.17;edge=d>r-.035?1:0;}else if((dx-.15)**2+(dy-.22)**2<radius*radius*1.05&&coverage===0){coverage=.4;shade=.42;}}
  out.coverage=coverage;out.shade=shade;out.edge=edge;return out;
}
export function createEnvironmentArtist(layer:EnvironmentLayer,world:HydroGeometry,water:HydroLayer,materials:TerrainMaterials,style:string,sea=0){
  const sample=environmentSampler(layer,world,environmentalPalette),waterAt=environmentalWaterIndex(water,world),work=environmentSampleWork(),canopyWork={coverage:0,shade:1,edge:0},period=world.wrap?world.width:null,seed=seedCode(layer.settings.seed),illustrated=style==="illustrated-fantasy",realistic=style==="realistic-terrain";
  return (x:number,y:number,footprint:number,field:SurfaceField,out:number[]=[0,0,0,0])=>{
    out[0]=out[1]=out[2]=out[3]=0;if(!layer.visible||!layer.opacity||field.waterHeight<=sea||waterAt(x,y)==="water")return out;const e=sample(x,y,work);if(!e||e.biome==="water")return out;
    const authority=manualMaterialAuthority(materials,x,y,period);if(authority>.999)return out;
    const n=(scale:number,offset=0)=>surfaceNoise(x+offset,y,Math.max(.1,scale),period),band=(scale:number)=>smooth(scale/(footprint*2)-.4),slope=Math.hypot(field.gx,field.gy),light=clamp(.92-.24*Math.atan(field.gx*3)-.2*Math.atan(field.gy*3),.55,1.22),broad=n(16000),clumps=.5+(n(Math.max(60,e.scaleM*17))-.5)*band(Math.max(60,e.scaleM*17))+(n(12000)-.5)*.5,ground=.5+(n(800)-.5)*.4*band(800)+(n(32)-.5)*.35*band(32)+(n(4)-.5)*.25*band(4),scale=Math.max(2,e.scaleM),forest=e.woody>.001,treeKind:Vegetation=e.conifers>e.woody*.5?"conifer":e.tropics>e.woody*.5?"tropical":"deciduous",cluster=smooth((clumps-(1-e.density)*e.clustering*.65)*1.8),cover=clamp(e.density*(1-e.clustering*.45)+cluster*e.density*.65)*e.woody,resolved=smooth(scale/(footprint*1.5)-.2);
    let r=0,g=0,b=0;for(let i=0;i<e.weights.length;i++){const weight=e.weights[i];if(!weight)continue;const color=environmentalPalette[biomeKeys[e.biomes[i]]];r+=color[0]*weight;g+=color[1]*weight;b+=color[2]*weight;}if(!e.weights.some(v=>v>0)){const c=environmentalPalette[e.biome];r=c[0];g=c[1];b=c[2];}
    if(!layer.biomes){r=e.color[0];g=e.color[1];b=e.color[2];}let alpha=realistic?.56:illustrated?.18:.14;
    if(layer.climateView!=="none"){const t=layer.climateView==="moisture"?e.moisture:clamp((e.temperature+30)/70);r=layer.climateView==="moisture"?182-145*t:49+176*t;g=layer.climateView==="moisture"?151-40*t:127-57*Math.abs(t-.5)*2;b=layer.climateView==="moisture"?91+81*t:210-153*t;alpha=.58;}
    else if(layer.biomes){alpha=.46;}
    else{
      const variation=.84+broad*.18+(ground-.5)*.12+(clumps-.5)*.13;r*=variation*light;g*=variation*light;b*=variation*light;
      if(layer.vegetation&&forest){const canopyTone=.65+clumps*.35+(ground-.5)*.09,green=treeKind==="conifer"?[38,69,58]:treeKind==="tropical"?[34,78,42]:[55,91,42];r=r*(1-cover*.5)+green[0]*cover*.5*canopyTone;g=g*(1-cover*.5)+green[1]*cover*.5*canopyTone;b=b*(1-cover*.5)+green[2]*cover*.5*canopyTone;alpha=Math.max(alpha,cover*(realistic?.84:illustrated?.48:.22));
        const dapple=1+((n(2.2)-.5)*.22*band(2.2)+(n(13)-.5)*.16*band(13))*e.woody;r*=dapple;g*=dapple;b*=dapple;
        if(layer.artwork&&resolved>0){const artistic=canopy(period?((x%period)+period)%period:x,y,scale,seed,treeKind,illustrated,period,canopyWork),threshold=n(scale*5);const density=e.vegetation==="savanna"?cover*.35:cover;if(threshold<density){const amount=artistic.coverage*resolved,ink=illustrated&&artistic.edge?.64:1,foliage=1+(n(.85)-.5)*.32*band(.85)+(n(.22)-.5)*.18*band(.22),shade=artistic.shade*light*ink*foliage;r+=(green[0]*shade-r)*amount;g+=(green[1]*shade-g)*amount;b+=(green[2]*shade-b)*amount;alpha=Math.max(alpha,amount*(realistic?.94:illustrated?.88:.28));}}
      }else if(layer.vegetation&&layer.artwork&&["grass","scrub","tundra","alpine","wetland"].includes(e.vegetation)){const grain=(n(4)-.5)*band(4),tufts=(n(11)-.5)*Math.min(1,15/footprint),shade=1+grain*.15+tufts*.16;r*=shade;g*=shade;b*=shade;alpha=Math.max(alpha,e.density*(realistic?.57:.22));}
      if(e.biome==="hotDesert"||e.biome==="coldDesert"){const periodicX=period?Math.sin(2*Math.PI*x/period)*period/(2*Math.PI):x,wave=periodicX/16+y/46+(n(180)-.5)*4,dune=Math.sin(wave)*band(90),crest=Math.max(0,Math.cos(wave))**4*band(90),grain=(n(1.2)-.5)*band(1.2);r+=dune*21+crest*9+grain*10;g+=dune*17+crest*7+grain*8;b+=dune*11+crest*4+grain*6;alpha=Math.max(alpha,realistic?(e.biome==="hotDesert"?.88:.79):illustrated?.3:.14);}
      if(e.biome==="tundra"){const moss=smooth((n(12)-.32)*1.6),gravel=n(1.5)*band(1.5);r+=(moss-.5)*19+gravel*5;g+=(moss-.5)*25+gravel*5;b-=(moss-.5)*7;alpha=Math.max(alpha,realistic?.73:.2);}if(e.biome==="ice")alpha=Math.max(alpha,realistic?.82:.22);if(slope>1.2){alpha*=.4;}
    }
    out[0]=clamp(r,0,255);out[1]=clamp(g,0,255);out[2]=clamp(b,0,255);out[3]=clamp(alpha*layer.opacity*e.coverage*(1-authority))*255;return out;
  };
}
