import type {TerrainGeometry} from "./terrain";
import {generationRecipeV2Schema,type GenerationRecipeV2} from "./terrain-source";
import {sampleSpacingKm,validatePhysicalHeights} from "./terrain-scale";
import {physicalSeed,physicalRandom as random,physicalFractal as noise,smooth01,wrappedDistance} from "./terrain-physical-noise";

type Feature={x:number;y:number;span:number;rx:number;ry:number;cos:number;sin:number;phase:number;seed:number};
type Range={x:number;y:number;points:{x:number;y:number}[];radius:number;height:number};
type Bounds={left:number;right:number;top:number;bottom:number};
/** Bounded tile bins: candidate work is capped independently of World extent. */
class PhysicalIndex{
 private bins:Set<number>[];private units=0;
 readonly columns:number;readonly rows:number;
 constructor(private shape:TerrainGeometry,private cost:number){this.columns=shape.width/32;this.rows=shape.height/32;this.bins=Array.from({length:this.columns*this.rows},()=>new Set());}
 add(id:number,b:Bounds){const w=this.shape.displayWidth/1000,h=this.shape.displayHeight/1000,bw=w/this.columns,bh=h/this.rows;for(const shift of this.shape.wrap&&b.right-b.left<w?[-w,0,w]:[0]){const left=this.shape.wrap&&b.right-b.left>=w?0:b.left+shift,right=this.shape.wrap&&b.right-b.left>=w?w:b.right+shift;if(right<0||left>w||b.bottom<0||b.top>h)continue;const x0=Math.max(0,Math.floor(left/bw)),x1=Math.min(this.columns-1,Math.floor(right/bw)),y0=Math.max(0,Math.floor(b.top/bh)),y1=Math.min(this.rows-1,Math.floor(b.bottom/bh));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const bin=this.bins[y*this.columns+x];if(bin.has(id))continue;this.units+=1024*this.cost;if(this.units>80_000_000)throw Error("This detail and feature count create too many overlapping terrain candidates. Keep your intended physical sizes and try fewer features or lower numerical detail.");bin.add(id);}}}
 lists(){return this.bins.map(v=>[...v]);}
}
function makeFeatures(shape:TerrainGeometry,r:GenerationRecipeV2,seed:number){
 const w=shape.displayWidth/1000,h=shape.displayHeight/1000,wrap=shape.wrap?w:0,count=["continent","island"].includes(r.preset)?1:r.landmasses,typical=r.preset==="island"||r.preset==="archipelago"?r.islandWidthKm:r.continentWidthKm,centers:{x:number;y:number}[]=[],features:Feature[]=[],warnings:string[]=[];
 const groupSpan=r.preset==="archipelago"?typical+r.clusterSpacingKm*3:typical,placement=Math.max(groupSpan,(groupSpan+r.landmassSpacingKm)*Math.sqrt(count)*1.5),pw=Math.min(w,placement),ph=Math.min(h,placement);
 for(let i=0;i<count;i++){
  let best={x:w/2,y:h/2,score:-Infinity};
  for(let n=0;n<(count===1?1:48);n++){
   const margin=Math.min(typical*.55,w/2),my=Math.min(typical*.4,h/2);let x=count===1?w/2+(random(i,n,seed)-.5)*typical*.04:w/2-pw/2+margin+random(i*71,n,seed)*Math.max(0,pw-2*margin),y=count===1?h/2+(random(i,n+3,seed)-.5)*typical*.025:h/2-ph/2+my+random(i*19,n+11,seed)*Math.max(0,ph-2*my);
   if(count>1&&r.islandDistribution==="chains"){const t=i-(count-1)/2,step=groupSpan+r.landmassSpacingKm;x=w/2+t*step;y=h/2+Math.sin(i*.9+random(1,2,seed)*3)*step*.3;}
   if(count>1&&r.islandDistribution==="clusters"){const angle=random(i,n,seed+31)*Math.PI*2,rad=Math.sqrt(random(i,n,seed+37))*Math.min(pw,ph)*.35;x=w/2+Math.cos(angle)*rad;y=h/2+Math.sin(angle)*rad;}
   x=shape.wrap?(x%w+w)%w:Math.max(margin,Math.min(w-margin,x));y=Math.max(my,Math.min(h-my,y));
   const score=centers.length?Math.min(...centers.map(c=>Math.hypot(wrappedDistance(x,c.x,wrap),y-c.y))):1;if(score>best.score)best={x,y,score};
  }
  if(centers.length&&best.score<groupSpan+r.landmassSpacingKm*.75&&!warnings.length)warnings.push("The requested count, gap and World extent cannot all fit this layout. Feature sizes were retained; some landforms overlap. Try fewer masses, smaller gaps or a larger World.");
  centers.push(best);
  const islands=r.preset==="archipelago"?4:1;
  for(let k=0;k<islands;k++){
   const t=k-(islands-1)/2,spacing=r.clusterSpacingKm*(1+(random(i,k,seed+29)-.5)*r.islandSpacing/200),angle=random(i,9,seed)*Math.PI*2;
   let x=best.x,y=best.y;if(islands>1){if(r.islandDistribution==="chains"){x+=Math.cos(angle)*t*spacing;y+=Math.sin(angle)*t*spacing+Math.sin(k*1.7)*spacing*.2;}else if(r.islandDistribution==="clusters"){const a=random(i,k,seed+41)*Math.PI*2,rad=spacing*(.4+random(i,k,seed+43));x+=Math.cos(a)*rad;y+=Math.sin(a)*rad;}else{x+=(random(i,k,seed+47)-.5)*spacing*4;y+=(random(i,k,seed+53)-.5)*spacing*4;}}
   if(shape.wrap)x=(x%w+w)%w;
   const variation=islands>1?r.islandSize/100:count>1?.15:0,span=typical*(1+(random(i,k,seed+59)-.5)*variation),rotation=random(i,k,seed+61)*Math.PI*2;
   if((!shape.wrap&&(x-span*.55<0||x+span*.55>w)||y-span*.55<0||y+span*.55>h)&&!warnings.some(v=>v.startsWith("Some requested")))warnings.push("Some requested geography reaches beyond the fixed map edges and is cropped. Physical sizes were retained. Try fewer groups, smaller gaps or a larger World.");
   features.push({x,y,span,rx:span*.5,ry:span*(.28+random(i,k,seed+67)*.08),cos:Math.cos(rotation),sin:Math.sin(rotation),phase:random(i,k,seed+71)*Math.PI*2,seed:seed+i*7919+k*131});
  }
 }
 return {features,warnings};
}
function makeRanges(features:Feature[],r:GenerationRecipeV2,seed:number){
 const ranges:Range[]=[];if(r.mountains===0)return ranges;
 for(let i=0;i<features.length;i++){
  const f=features[i],count=Math.min(8,Math.max(1,Math.round(f.span*f.span*.4/(r.mountainSpacingKm*r.mountainSpacingKm)*r.mountains/100*.55)));
  for(let n=0;n<count;n++){
   const dx=(random(i,n,seed+401)-.5)*f.span*.55,dy=(random(i,n,seed+409)-.5)*f.span*.3,x=f.x+dx*f.cos-dy*f.sin,y=f.y+dx*f.sin+dy*f.cos,angle=Math.atan2(f.sin,f.cos)+(random(i,n,seed+419)-.5)*1.8,cos=Math.cos(angle),sin=Math.sin(angle),points=[];
   for(let k=0;k<7;k++){const t=k/6-.5,a=t*r.mountainLengthKm,b=Math.sin((t+.5)*Math.PI)*r.mountainLengthKm*(random(i,n,seed+421)-.5)*.3+Math.sin((t+.5)*Math.PI*2)*r.mountainLengthKm*.045;points.push({x:x+a*cos-b*sin,y:y+a*sin+b*cos});}
   ranges.push({x,y,points,radius:r.mountainWidthKm/2,height:r.mountainHeightM*(.82+.18*random(i,n,seed+431))});
  }
 }
 return ranges;
}
function rangeInfluence(x:number,y:number,range:Range,wrap:number){
 const px=wrap?x+Math.round((range.x-x)/wrap)*wrap:x;let influence=0;
 for(let n=1;n<range.points.length;n++){const a=range.points[n-1],b=range.points[n],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((px-a.x)*dx+(y-a.y)*dy)/length)):0,distance=Math.hypot(px-a.x-t*dx,y-a.y-t*dy)/range.radius;if(distance>=1)continue;const along=(n-1+t)/(range.points.length-1),end=Math.pow(Math.max(0,Math.sin(Math.PI*along)),.45),weight=(1-distance*distance)**2*end;influence=Math.max(influence,weight);}
 return influence;
}
export function generatePhysicalTerrain(shape:TerrainGeometry,raw:GenerationRecipeV2,sea:number,progress?:(p:number)=>void){
 const original=generationRecipeV2Schema.parse(raw);validatePhysicalHeights(shape,original,sea);const seed=physicalSeed(original.seed),r={...original};if(r.preset==="random")r.preset=(["continent","continents","archipelago","island","land"] as const)[seed%5];
 const w=shape.displayWidth/1000,h=shape.displayHeight/1000,wrap=shape.wrap?w:0,spacing=sampleSpacingKm(shape),plan=makeFeatures(shape,r,seed),ranges=makeRanges(plan.features,r,seed),landIndex=new PhysicalIndex(shape,1),ridgeIndex=new PhysicalIndex(shape,6);
 plan.features.forEach((f,i)=>{const radius=f.span*.62+r.coastScaleKm*3+r.coastalPlainKm*2;landIndex.add(i,{left:f.x-radius,right:f.x+radius,top:f.y-radius,bottom:f.y+radius});});
 ranges.forEach((range,i)=>{ridgeIndex.add(i,{left:Math.min(...range.points.map(p=>p.x))-range.radius,right:Math.max(...range.points.map(p=>p.x))+range.radius,top:Math.min(...range.points.map(p=>p.y))-range.radius,bottom:Math.max(...range.points.map(p=>p.y))+range.radius});});
 const lands=landIndex.lists(),ridges=ridgeIndex.lists(),grid=new Int16Array(shape.width*shape.height).fill(sea-r.oceanDepthM),intendedMax=sea+Math.max(r.lowlandHeightM,r.highlandHeightM,r.mountains?r.mountainHeightM:0),shelf=r.coastScaleKm*3+r.coastalPlainKm*.5;
 for(let by=0;by<shape.height/32;by++)for(let bx=0;bx<shape.width/32;bx++){
  const key=by*landIndex.columns+bx,candidates=lands[key],nearRanges=ridges[key];if(!candidates.length)continue;
  for(let iy=by*32;iy<(by+1)*32;iy++)for(let ix=bx*32;ix<(bx+1)*32;ix++){
   const x=(ix+.5)*spacing.x,y=(iy+.5)*spacing.y;let signed=-Infinity;
   for(const id of candidates){const f=plan.features[id],dx=wrappedDistance(x,f.x,wrap),dy=y-f.y,u=(dx*f.cos+dy*f.sin)/f.rx,v=(-dx*f.sin+dy*f.cos)/f.ry,distance=Math.hypot(u,v);if(distance>2)continue;let field:number;if(distance<.5)field=(.8-distance)*f.ry;else{const a=Math.atan2(v,u),rim=.9+.14*Math.sin(a*3+f.phase)+.12*Math.sin(a*5-f.phase)+.06*Math.cos(a*7+f.phase),coast=noise(x-w/2,y-h/2,r.coastScaleKm,f.seed+101,wrap)*r.coastScaleKm*(.15+r.coastline/100*.55),broad=noise(dx,dy,f.span*.2,f.seed+211,wrap)*f.span*.09;field=(rim-distance)*f.ry+coast+broad;}signed=Math.max(signed,field);if(signed>=r.coastalPlainKm)break;}
   if(!Number.isFinite(signed))continue;
   const index=iy*shape.width+ix;if(signed<=0){grid[index]=Math.round(sea-r.oceanDepthM*smooth01(-signed/shelf));continue;}
   const shore=smooth01(signed/r.coastalPlainKm),broad=noise(x-w/2,y-h/2,Math.max(r.mountainSpacingKm*1.5,r.coastalPlainKm*3),seed+1231,wrap),high=r.highlandCoverage===0?0:r.highlandCoverage===100?1:smooth01((.5+broad-(1-r.highlandCoverage/100))/.25+.5),plateau=high+(1-high)*r.plateauStrength/100*smooth01((high-.55)/.45);
   let above=r.lowlandHeightM*(1+broad*.15*r.elevationVariation/100)+(r.highlandHeightM-r.lowlandHeightM)*plateau;
   const rough=noise(x-w/2,y-h/2,r.mountainWidthKm*.3,seed+1877,wrap)*r.ruggedness/100*Math.min(r.mountainHeightM*.06,Math.max(50,r.highlandHeightM*.5));above+=rough;
   for(const id of nearRanges){const range=ranges[id],influence=rangeInfluence(x,y,range,wrap);if(influence>0){const texture=noise(x-w/2,y-h/2,range.radius*1.5,seed+id*391+2017,wrap);above=Math.max(above,r.lowlandHeightM+(range.height-r.lowlandHeightM)*influence*(.91+texture*.09)+texture*r.ruggedness/100*r.mountainHeightM*.1*influence);}}
   grid[index]=Math.max(sea+1,Math.min(intendedMax,Math.round(sea+Math.max(1,above)*shore)));
  }
  progress?.((key+1)/lands.length);
 }
 progress?.(1);return {grid,resolvedPreset:r.preset,layoutWarnings:plan.warnings,featureCount:plan.features.length,rangeCount:ranges.length};
}
