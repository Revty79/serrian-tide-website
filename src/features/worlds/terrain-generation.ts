import type {TerrainGeometry} from "./terrain";
import {generationRecipeSchema,terrainAreaSchema,type GenerationRecipe,type TerrainArea} from "./terrain-source";

function seedHash(seed:string){let hash=2166136261;for(let i=0;i<seed.length;i++)hash=Math.imul(hash^seed.charCodeAt(i),16777619);return hash>>>0;}
function lattice(x:number,y:number,seed:number){let v=Math.imul(x,374761393)+Math.imul(y,668265263)+seed;v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967295;}
const smooth=(x:number)=>x*x*x*(x*(x*6-15)+10);
const gradients=[[1,0],[-1,0],[0,1],[0,-1],[.7071,.7071],[-.7071,.7071],[.7071,-.7071],[-.7071,-.7071]];
function noise(x:number,y:number,frequency:number,seed:number,wrap:boolean){
 const px=x*frequency,py=y*frequency,ix=Math.floor(px),iy=Math.floor(py),a=smooth(px-ix),b=smooth(py-iy);
 const at=(xx:number,yy:number)=>{const g=gradients[Math.floor(lattice(wrap?(xx%frequency+frequency)%frequency:xx,yy,seed)*8)%8];return g[0]*(px-xx)+g[1]*(py-yy);};
 const low=at(ix,iy)*(1-a)+at(ix+1,iy)*a,high=at(ix,iy+1)*(1-a)+at(ix+1,iy+1)*a;return .5+(low*(1-b)+high*b)*.7;
}
function fractal(x:number,y:number,frequency:number,seed:number,wrap:boolean,octaves=3){let value=0,weight=1,total=0;for(let n=0;n<octaves;n++){value+=weight*noise(x,y,frequency,seed+n*1103,wrap);total+=weight;weight*=.5;frequency*=2;}return value/total;}
type Mass={x:number;y:number;rx:number;ry:number;angle:number;lobes:number;phase:number;cos:number;sin:number};
const dx=(x:number,c:number,wrap:boolean)=>wrap?((x-c+.5)%1+1)%1-.5:x-c;
function masses(recipe:GenerationRecipe,seed:number,wrap:boolean):Mass[]{
 const count=recipe.preset==="island"||recipe.preset==="continent"?1:recipe.landmasses;
 const centers:Mass[]=[];for(let i=0;i<count;i++){
  let best={x:.5,y:.5,score:-1};for(let k=0;k<48;k++){const x=count===1?.5+(lattice(i,k,seed)-.5)*.1:(wrap?.03:.14)+lattice(i*73,k,seed)* (wrap?.94:.72),y=.18+lattice(i*17,k+12,seed)*.64;const score=Math.min(...centers.map(c=>Math.hypot(dx(x,c.x,wrap),y-c.y)),2);if(score>best.score)best={x,y,score};}
  const scale=1/Math.sqrt(count),stretch=.75+lattice(i,8,seed)*.65;centers.push({x:best.x,y:best.y,rx:.35*scale*stretch,ry:.35*scale/stretch,angle:lattice(i,19,seed)*Math.PI,cos:Math.cos(lattice(i,19,seed)*Math.PI),sin:Math.sin(lattice(i,19,seed)*Math.PI),phase:lattice(i,29,seed)*Math.PI*2,lobes:3+Math.floor(lattice(i,31,seed)*4)});
 }
 if(recipe.preset!=="archipelago")return centers;
 const islands:Mass[]=[],perCluster=Math.round(5+(100-recipe.islandSize)*.12),spacing=.03+recipe.islandSpacing*.0016;
 for(let i=0;i<centers.length;i++)for(let n=0;n<perCluster;n++){
  const c=centers[i],t=n/(perCluster-1)-.5,angle=c.angle+t*1.4;
  let x=c.x+Math.cos(angle)*t*spacing*3,y=c.y+Math.sin(angle)*t*spacing*3;
  if(recipe.islandDistribution==="clusters"){x=c.x+(lattice(i,n,seed+3)-.5)*spacing*2;y=c.y+(lattice(i,n,seed+7)-.5)*spacing*2;}
  if(recipe.islandDistribution==="scattered"){x=lattice(i,n,seed+3);y=.08+lattice(i,n,seed+7)*.84;}
  const radius=(.024+recipe.islandSize*.00055)*( .7+lattice(i,n,seed+13)*.7);islands.push({...c,x:wrap?(x%1+1)%1:x,y,rx:radius*1.3,ry:radius*.8,phase:c.phase+n,lobes:3+n%3});
 }
 return islands;
}

/** Numerical samples are authoritative. This version never runs during ordinary sculpting. */
export function generateTerrain(shape:TerrainGeometry,raw:GenerationRecipe,seaLevel:number,progress?:(done:number)=>void){
 if(seaLevel<=shape.min||seaLevel>=shape.max)throw new Error("Choose a sea level strictly between the lowest and highest elevations so both land and water are possible.");
 const original=generationRecipeSchema.parse(raw),seed=seedHash(original.seed),recipe={...original};
 if(recipe.preset==="random")recipe.preset=(["continent","continents","archipelago","island","land"] as const)[seed%5];
 const land=masses(recipe,seed,shape.wrap),field=new Float32Array(shape.width*shape.height),coast=recipe.coastline/100;
 for(let y=0;y<shape.height;y++){
  const v=(y+.5)/shape.height;for(let x=0;x<shape.width;x++){
   const u=x/shape.width,warpX=(fractal(u,v,3,seed+211,shape.wrap,2)-.5)*(.035+.065*coast),warpY=(fractal(u,v,3,seed+479,shape.wrap,2)-.5)*(.035+.065*coast),wx=u+warpX,wy=v+warpY;
   let value=-10;for(const c of land){const a=dx(wx,c.x,shape.wrap),b=wy-c.y,xx=(a*c.cos+b*c.sin)/c.rx,yy=(-a*c.sin+b*c.cos)/c.ry,distance=Math.hypot(xx,yy);if(1.24-distance<=value)continue;const angle=Math.atan2(yy,xx),rim=1+.15*Math.sin(angle*c.lobes+c.phase)+.09*Math.cos(angle*(c.lobes+2)-c.phase);value=Math.max(value,rim-distance);}
   const variation=fractal(u,v,6,seed+1019,shape.wrap,3)-.5;
   if(recipe.preset==="land")value=value*.42+(fractal(u,v,3,seed+1741,shape.wrap,3)-.5)*.9;
   value+=variation*(.08+coast*.42);
   if(recipe.preset!=="land"){const edge=Math.min(v,1-v,shape.wrap?1:u,shape.wrap?1:1-u);value-=Math.max(0,.045-edge)*18;}
   field[y*shape.width+x]=value;
  }
  if(y%32===0)progress?.(y/shape.height*.55);
 }
 const ordered=field.slice().sort(),threshold=ordered[Math.floor((1-recipe.landCoverage/100)*(ordered.length-1))],above=Math.max(.00001,ordered[ordered.length-1]-threshold),below=Math.max(.00001,threshold-ordered[0]);
 const grid=new Int16Array(field.length),variation=.1+recipe.elevationVariation/100*.9,mountain=recipe.mountains/100,ruggedness=recipe.ruggedness/100;
 const high=(shape.max-seaLevel)*variation,deep=(seaLevel-shape.min)*variation;
 for(let y=0;y<shape.height;y++){
  const v=(y+.5)/shape.height;for(let x=0;x<shape.width;x++){
   const u=x/shape.width,index=y*shape.width+x,d=field[index]-threshold;
   if(d<=0){grid[index]=Math.round(seaLevel-deep*Math.pow(Math.min(1,-d/below),.65));continue;}
   const inland=Math.min(1,d/above),large=fractal(u,v,4,seed+3079,shape.wrap,2),warp=fractal(u,v,5,seed+3203,shape.wrap,2)-.5,ridge=Math.pow(1-Math.abs(noise(u+warp*.14,v*.55+warp*.16,14,seed+4001,shape.wrap)*2-1),4),belt=smooth(Math.max(0,Math.min(1,(large-.38)*4))),fine=fractal(u,v,48,seed+5011,shape.wrap,2)-.5;
   const shore=smooth(Math.min(1,inland*18)),plains=.015+.24*Math.pow(inland,.85),ranges=mountain*.85*ridge*belt*smooth(Math.min(1,inland*5)),rough=fine*ruggedness*.1*Math.sqrt(inland);
   grid[index]=Math.max(seaLevel+1,Math.min(shape.max,Math.round(seaLevel+high*Math.max(.0001,(plains+ranges+rough)*shore))));
  }
  if(y%32===0)progress?.(.55+y/shape.height*.45);
 }
 progress?.(1);return {grid,resolvedPreset:recipe.preset};
}

export function regenerateArea(base:Int16Array,proposed:Int16Array,shape:TerrainGeometry,area:TerrainArea,protectedCells:Uint8Array,preserveManual:boolean,feather:number){
 area=terrainAreaSchema.parse(area);if(base.length!==shape.width*shape.height||proposed.length!==base.length||protectedCells.length!==base.length)throw new Error("The regeneration buffers do not match this map.");
 if(area.x+area.width>shape.width||area.y+area.height>shape.height)throw new Error("Choose an area inside this map.");
 const output=base.slice();let changed=0,protectedCount=0;
 for(let y=area.y;y<area.y+area.height;y++)for(let x=area.x;x<area.x+area.width;x++){
  const i=y*shape.width+x;if(preserveManual&&protectedCells[i]){protectedCount++;continue;}
  const edge=Math.min(x-area.x+1,area.x+area.width-x,y-area.y+1,area.y+area.height-y),weight=feather?smooth(Math.min(1,edge/(feather+1))):1;
  output[i]=Math.round(base[i]+(proposed[i]-base[i])*weight);if(output[i]!==base[i])changed++;
 }
 return {grid:output,changed,protectedCount};
}
