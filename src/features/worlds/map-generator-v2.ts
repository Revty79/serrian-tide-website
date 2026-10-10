import { mapDraftSchema, polygonCenter, signedArea, validateGeometry, validateMapDraft, type MapDraft, type Point, type Vertex } from "./atlas";
import { MAP_HEIGHT, MAP_WIDTH, rounded } from "./atlas-coordinates";
import { defaultPresentation, strokeSamples, terrainMarks, type MapDrawing, type PathDrawing, type TerrainDrawing } from "./cartography";
import { bezierSamples, bounds, edgeDistance, inside, position, seededRandom, separated } from "./generation-geometry";
import { generationSpecSchema, type GenerationPlan, type GenerationSpec } from "./generation-spec";

type Land = {points: Vertex[]; center: Point; name: string; major: boolean; area: number};
type Random = () => number;
type Id = () => string;
const TAU = Math.PI * 2;
const sideAngle = {east: 0, south: Math.PI/2, west: Math.PI, north: -Math.PI/2};
const angleDistance = (a: number, b: number) => Math.atan2(Math.sin(a-b), Math.cos(a-b));
const regionOffset = (region: string): Point => ({x: region.includes("west") ? -.25 : region.includes("east") ? .25 : 0, y: region.includes("north") ? -.25 : region.includes("south") ? .25 : 0});
const vertex = (p: Point, id: Id): Vertex => ({id: id(), ...position(p.x,p.y)});
// v2: asymmetry comes from seeded regional structure, not jitter on a grid.
function silhouette(center: Point, rx: number, ry: number, random: Random, id: Id, spec: GenerationSpec, major: boolean, rotation=0): Vertex[] {
  const s=spec.settings,plan=spec.plan,count=major?192:72;
  const phases=Array.from({length:8},()=>random()*TAU),frequencies=[1,2,3,5,9,17,29,47];
  const amplitudes=[.18,.13,.10,.075,.05,.032,.022,.012];
  const folds=Array.from({length:major?5:3},()=>({angle:random()*TAU,width:.10+random()*.43,depth:(random()<.55?-1:1)*(.07+random()*.23)}));
  const bays=Array.from({length:major?plan.bays:1},(_,i)=>({angle:plan.baySide==="all"?random()*TAU:sideAngle[plan.baySide]+(i-(plan.bays-1)/2)*(.22+random()*.24),width:.065+random()*.11,depth:.15+.07*plan.bayDepth+random()*.10}));
  if(major&&plan.additionalBaySide!=="none")bays.push({angle:sideAngle[plan.additionalBaySide],width:.12,depth:.22});
  const crescent=s.shape==="crescent"||(s.shape==="varied"&&random()<.25),crescentAngle=random()*TAU;
  const coastPhase=random()*TAU;
  return Array.from({length:count},(_,i)=>{
    const angle=i*TAU/count,worldAngle=angle+rotation;
    const sideWeight=plan.ruggedCoast==="all"?1:.12+.88*Math.exp(-((angleDistance(worldAngle,sideAngle[plan.ruggedCoast])/.85)**2));
    const localRoughness=.25+.75*(.5+.5*Math.sin(angle*2+coastPhase));
    let radius=.79;
    frequencies.forEach((frequency,j)=>{radius+=Math.sin(angle*frequency+phases[j])*amplitudes[j]*(j<3?1:s.ruggedness/100*sideWeight*localRoughness);});
    for(const fold of folds)radius+=fold.depth*Math.exp(-((angleDistance(angle,fold.angle)/fold.width)**2));
    for(const bay of bays)radius-=bay.depth*Math.exp(-((angleDistance(worldAngle,bay.angle)/bay.width)**2));
    if(crescent)radius-=.36*Math.exp(-((angleDistance(angle,crescentAngle)/.57)**2));
    radius=Math.max(.24,Math.min(1.13,radius));
    const x=Math.cos(angle)*rx*radius,y=Math.sin(angle)*ry*radius;
    return vertex({x:center.x+x*Math.cos(rotation)-y*Math.sin(rotation),y:center.y+x*Math.sin(rotation)+y*Math.cos(rotation)},id);
  });
}
function landAt(points: Vertex[], name: string, major: boolean): Land {return {points,center:polygonCenter(points),name,major,area:Math.abs(signedArea(points))};}
function createLand(spec: GenerationSpec, random: Random, id: Id): Land[] {
  const s=spec.settings,result:Land[]=[],names=["Asterfall","Velmora","Nareth","Thalen","Caerwyn","Orinth"];
  const clear=(points:Vertex[],gap:number)=>{const b=bounds(points);return result.every(l=>{const a=bounds(l.points);return a.x+a.width+gap<b.x||b.x+b.width+gap<a.x||a.y+a.height+gap<b.y||b.y+b.height+gap<a.y||separated(l.points,points,gap);});};
  const fits=(points:Vertex[])=>points.every(p=>p.x>38&&p.x<1962&&p.y>38&&p.y<1162);
  const anchor={x:450+random()*1100,y:260+random()*680};
  // One heavier landmass and several unequal companions; rejection leaves genuine ocean gaps.
  const weights=Array.from({length:s.continents},(_,i)=>i===0?1.35+random()*.45:.55+random()*.75),weightSum=weights.reduce((a,b)=>a+b,0);
  for(let i=0;i<s.continents;i++){
    let accepted:Land|undefined;
    for(let attempt=0;attempt<320&&!accepted;attempt++){
      const shrink=Math.pow(.90,Math.floor(attempt/20));
      const area=MAP_WIDTH*MAP_HEIGHT*s.landCoverage/100*weights[i]/weightSum;
      const size=(s.size==="small"?.68:s.size==="medium"?.84:1)*(s.continents>1?.86:1);
      const aspect=s.shape==="elongated"?1.9+random()*.8:s.shape==="varied"?.85+random()*1.6:1.1+random()*.7;
      let rx=Math.sqrt(area/(Math.PI*.63)*aspect)*size*shrink,ry=rx/aspect;
      let rotation=(random()-.5)*Math.PI;
      const offset=regionOffset(spec.plan.landPosition);
      let center:Point;
      if(s.continents===1){
        center={x:1000+offset.x*1000+(random()-.5)*100,y:600+offset.y*680+(random()-.5)*60};
        rx=Math.min(rx,850);ry=Math.min(ry,470);
        rotation=(random()-.5)*.8;
        const extentX=Math.abs(rx*Math.cos(rotation))+Math.abs(ry*Math.sin(rotation)),extentY=Math.abs(rx*Math.sin(rotation))+Math.abs(ry*Math.cos(rotation));
        const fit=Math.min(1,(Math.min(center.x-45,1955-center.x))/(extentX*1.13),(Math.min(center.y-45,1155-center.y))/(extentY*1.13));rx*=fit;ry*=fit;
      }else{
        const ex=Math.sqrt((rx*Math.cos(rotation))**2+(ry*Math.sin(rotation))**2)*1.13,ey=Math.sqrt((rx*Math.sin(rotation))**2+(ry*Math.cos(rotation))**2)*1.13;
        if(ex>870||ey>500)continue;
        const clustered=random()<.5;
        center={x:clustered?anchor.x+(random()-.5)*1200:50+ex+random()*(1900-ex*2),y:clustered?anchor.y+(random()-.5)*850:50+ey+random()*(1100-ey*2)};
      }
      const points=silhouette(center,rx,ry,random,id,spec,true,rotation);
      if(!fits(points)||!clear(points,22))continue;
      validateGeometry({version:1,type:"polygon",points});accepted=landAt(points,names[(i+Math.floor(random()*names.length))%names.length]+(i?` ${i+1}`:""),true);
    }
    if(!accepted)throw new Error("These continents need more ocean room. Reduce land coverage or change the seed.");
    result.push(accepted);
  }
  const solo=!s.continents,side=spec.plan.islandPosition,offset=regionOffset(side);
  const clusters=Array.from({length:2+Math.floor(random()*3)},()=>({x:220+random()*1560,y:170+random()*860,angle:random()*TAU,spread:80+random()*170}));
  for(let i=0;i<s.islands;i++){
    let accepted:Land|undefined;
    for(let attempt=0;attempt<200&&!accepted;attempt++){
      const cluster=clusters[Math.floor(random()*clusters.length)],chain=(random()-.5)*2*cluster.spread,isolated=random()<.17||attempt>90;
      let center:Point=isolated?{x:80+random()*1840,y:80+random()*1040}:{x:cluster.x+Math.cos(cluster.angle)*chain+(random()-.5)*cluster.spread*.5,y:cluster.y+Math.sin(cluster.angle)*chain+(random()-.5)*cluster.spread*.35};
      const main=result[0]&&bounds(result[0].points);
      if(side!=="scattered"){
        if(!solo&&main){
          if(offset.x)center.x=offset.x>0?main.x+main.width+40+random()*Math.max(10,1880-main.x-main.width):80+random()*Math.max(10,main.x-125);
          if(offset.y)center.y=offset.y>0?main.y+main.height+40+random()*Math.max(10,1080-main.y-main.height):80+random()*Math.max(10,main.y-125);
          if(side==="center")center={x:650+random()*700,y:350+random()*500};
        }else center={x:1000+offset.x*1450+(random()-.5)*(offset.x?850:1500),y:600+offset.y*820+(random()-.5)*(offset.y?510:900)};
      }
      const mixed=s.size==="varied"?.4+Math.pow(random(),1.5)*1.35:s.size==="small"?.65:s.size==="large"?1.15:.85;
      const base=solo?Math.sqrt(MAP_WIDTH*MAP_HEIGHT*s.landCoverage/100/(Math.max(1,s.islands)*Math.PI*.65)):45;
      const shrink=Math.pow(.91,Math.floor(attempt/40));
      let rx=base*mixed*(.75+random()*.45)*shrink,ry=base*mixed*(.48+random()*.55)*shrink;
      const rotation=random()*Math.PI;
      const margin=Math.min(center.x-38,1962-center.x,center.y-38,1162-center.y);
      const fit=Math.min(1,margin/(Math.max(rx,ry)*1.15));rx*=fit;ry*=fit;
      if(rx<13||ry<13)continue;
      const points=silhouette(center,rx,ry,random,id,spec,false,rotation);
      if(!fits(points)||!clear(points,12))continue;
      validateGeometry({version:1,type:"polygon",points});accepted=landAt(points,`Isle ${i+1}`,false);
    }
    if(!accepted)throw new Error("These islands do not fit with enough ocean between them. Reduce island count or land coverage, change island placement, or try another seed.");
    result.push(accepted);
  }
  return result;
}
function regionPoint(land: Land, region: string, random: Random, clearance=12): Point {
  const b=bounds(land.points),offset=regionOffset(region),cx=b.x+b.width*(.5+offset.x),cy=b.y+b.height*(.5+offset.y);
  for(let attempt=0;attempt<80;attempt++){
    const spread=region==="automatic"?.90:.30,p=position(cx+(random()-.5)*b.width*spread,cy+(random()-.5)*b.height*spread);
    if(inside(p,land.points)&&edgeDistance(p,land.points)>=Math.min(clearance,Math.min(b.width,b.height)*.08))return p;
  }
  throw new Error(`The ${region} terrain region is too narrow in this design. Change its placement, coastline ruggedness or seed.`);
}
function rangePoints(land: Land, plan: GenerationPlan, random: Random, id: Id, index: number): Vertex[] {
  const b=bounds(land.points),center=regionPoint(land,plan.mountainRegion,random,20);
  const angle=plan.mountainOrientation==="north-south"?Math.PI/2:plan.mountainOrientation==="east-west"?0:plan.mountainOrientation==="northeast-southwest"?-Math.PI/4:plan.mountainOrientation==="northwest-southeast"?Math.PI/4:(random()-.5)*Math.PI;
  const length=Math.min(b.width/(Math.abs(Math.cos(angle))||.1),b.height/(Math.abs(Math.sin(angle))||.1))*(.21+random()*.38)/(1+index*.18),phase=random()*TAU;
  const result:Vertex[]=[];
  for(let i=0;i<18;i++){
    const t=(i/17-.5)*length,bend=(Math.sin(i/17*Math.PI*1.6+phase)+.35*Math.sin(i/17*Math.PI*4.2+phase))*Math.min(38,length*.12);
    const p=position(center.x+Math.cos(angle)*t-Math.sin(angle)*bend,center.y+Math.sin(angle)*t+Math.cos(angle)*bend);
    if(inside(p,land.points)&&edgeDistance(p,land.points)>12)result.push(vertex(p,id));
  }
  if(!result.length)result.push(vertex(center,id));return result;
}
// Uneven spiral sweeps create editable woodland pockets with a denser core and sparse fringes.
function woodland(land: Land, center: Point, random: Random, id: Id, radius: number): Vertex[] {
  const b=bounds(land.points),width=Math.min(b.width*(.13+random()*.15),220),height=Math.min(b.height*(.10+random()*.17),150),result:Vertex[]=[];
  const phase=random()*TAU,turns=1.3+random()*1.3,lean=random()*TAU;
  for(let i=0;i<32;i++){
    const t=i/31,angle=phase+t*TAU*turns,r=.10+Math.pow(t,.9)*.85;
    const x=Math.cos(angle)*width*r/2,y=Math.sin(angle)*height*r/2;
    const p=position(center.x+x*Math.cos(lean)-y*Math.sin(lean)+(random()-.5)*radius*.35,center.y+x*Math.sin(lean)+y*Math.cos(lean)+(random()-.5)*radius*.25);
    if(inside(p,land.points)&&edgeDistance(p,land.points)>Math.min(radius*.4,10))result.push(vertex(p,id));
  }
  return result.length?result:[vertex(center,id)];
}
function terrain(id: Id, random: Random, kind: TerrainDrawing["kind"], points: Vertex[], radius: number, density: number, name: string): TerrainDrawing {
  return {version:1,id:id(),type:"terrain",kind,name,geographyId:null,archived:false,points,radius:rounded(Math.max(12,Math.min(160,radius))),spacing:kind==="forest"?24:kind==="mountains"?37:40,density,seed:1+Math.floor(random()*2147483646)};
}
function distanceToRanges(p:Point,ranges:Vertex[][]) {return Math.min(Infinity,...ranges.flat().map(q=>Math.hypot(q.x-p.x,q.y-p.y)));}

function riverPath(land: Land, ranges: Vertex[][], direction: GenerationPlan["riverDirection"], index: number, id: Id, random: Random): PathDrawing {
  const b=bounds(land.points),cols=42,rows=28,dx=b.width/(cols-1),dy=b.height/(rows-1);
  const targetSide=direction==="automatic"?(["east","west","south","north"] as const)[Math.floor(random()*4)]:direction;
  const theta=sideAngle[targetSide]+(index%3-1)*.14;
  // Select the boundary by direction from the known radial interior, including a carved bay.
  const reference=land.points.reduce((chosen,p)=>Math.abs(angleDistance(Math.atan2(p.y-land.center.y,p.x-land.center.x),theta))<Math.abs(angleDistance(Math.atan2(chosen.y-land.center.y,chosen.x-land.center.x),theta))?p:chosen);
  const candidates: {p:Point; key:number}[]=[];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const p=position(b.x+x*dx,b.y+y*dy);if(inside(p,land.points)&&edgeDistance(p,land.points)>2)candidates.push({p,key:y*cols+x});}
  const onLand=(p:Point)=>inside(p,land.points)||edgeDistance(p,land.points)<=1;
  const visible=(a:Point,c:Point)=>Array.from({length:15},(_,i)=>({x:a.x+(c.x-a.x)*(i+1)/16,y:a.y+(c.y-a.y)*(i+1)/16})).every(onLand);
  const nearest=(point:Point,choices=candidates)=>choices.reduce((best,n)=>Math.hypot(n.p.x-point.x,n.p.y-point.y)<Math.hypot(best.p.x-point.x,best.p.y-point.y)?n:best);
  const range=ranges[index%Math.max(1,ranges.length)],peak=range?.[Math.floor(range.length*(.3+(index%3)*.2))]??land.center;
  const toward={x:reference.x-peak.x,y:reference.y-peak.y},length=Math.hypot(toward.x,toward.y)||1;
  const outlets=candidates.filter(n=>visible(n.p,reference));if(!outlets.length)throw new Error("A river cannot enter this narrow bay. Reduce bay depth or change the river direction or seed.");
  const start=nearest({x:peak.x+toward.x/length*30,y:peak.y+toward.y/length*30}),goal=nearest(reference,outlets),cells=new Map(candidates.map(n=>[n.key,n.p]));
  const heights=new Map(candidates.map(n=>[n.p,edgeDistance(n.p,land.points)*.25+Math.max(0,120-distanceToRanges(n.p,ranges))*1.7]));
  const rangeDistances=new Map(candidates.map(n=>[n.p,distanceToRanges(n.p,ranges)]));
  const elevation=(p:Point)=>heights.get(p)!;
  const queue=[start.key],scores=new Map([[start.key,0]]),previous=new Map<number,number>(),visited=new Set<number>();
  let reached=false;
  for(let attempt=0;queue.length&&attempt<cols*rows;attempt++){
    queue.sort((a,c)=>(scores.get(a)!+Math.hypot(cells.get(a)!.x-goal.p.x,cells.get(a)!.y-goal.p.y))-(scores.get(c)!+Math.hypot(cells.get(c)!.x-goal.p.x,cells.get(c)!.y-goal.p.y)));
    const current=queue.shift()!;if(visited.has(current))continue;visited.add(current);if(current===goal.key){reached=true;break;}
    const p=cells.get(current)!,x=current%cols,y=Math.floor(current/cols);
    for(const [ox,oy]of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]){
      const nx=x+ox,ny=y+oy,key=ny*cols+nx;if(nx<0||nx>=cols||ny<0||ny>=rows||visited.has(key)||!cells.has(key))continue;const q=cells.get(key)!;
      if(!visible(p,q))continue;
      const cost=scores.get(current)!+Math.hypot(q.x-p.x,q.y-p.y)+Math.max(0,elevation(q)-elevation(p))*4+Math.max(0,70-rangeDistances.get(q)!)*.7;
      if(cost>=(scores.get(key)??Infinity))continue;scores.set(key,cost);previous.set(key,current);if(!queue.includes(key))queue.push(key);
    }
  }
  if(!reached)throw new Error("A river could not reach the requested coast in this design. Reduce bay depth/ruggedness or change the seed.");
  const route=[goal.p];let at=goal.key;while(at!==start.key){at=previous.get(at)!;route.unshift(cells.get(at)!);}
  // Keep turns, then smooth modestly; never replace a land route with an ocean-crossing shortcut.
  const kept=route.filter((p,i)=>i===0||i===route.length-1||i%2===0),phase=random()*TAU;
  const bent=kept.map((p,i)=>{if(!i||i===kept.length-1)return p;const a=kept[i-1],c=kept[i+1],length=Math.hypot(c.x-a.x,c.y-a.y)||1,offset=(Math.sin(i/kept.length*TAU*(1.2+index*.27)+phase)+.35*Math.sin(i/kept.length*TAU*3.7+phase))*Math.min(dx,dy)*.65;const q=position(p.x-(c.y-a.y)/length*offset,p.y+(c.x-a.x)/length*offset);return inside(q,land.points)&&edgeDistance(q,land.points)>4?q:p;});
  let points=bent.map(p=>vertex(p,id));
  if(Math.hypot(points.at(-1)!.x-reference.x,points.at(-1)!.y-reference.y)>.1)points.push(vertex(reference,id));
  let curve=.65;
  if(bezierSamples(points,curve).some(p=>!inside(p,land.points)&&edgeDistance(p,land.points)>1)){points=kept.map(p=>vertex(p,id));if(Math.hypot(points.at(-1)!.x-reference.x,points.at(-1)!.y-reference.y)>.1)points.push(vertex(reference,id));curve=.45;}
  if(bezierSamples(points,curve).some(p=>!inside(p,land.points)&&edgeDistance(p,land.points)>1))curve=0;
  if(!bezierSamples(points,curve).every(onLand)){points=route.map(p=>vertex(p,id));if(Math.hypot(points.at(-1)!.x-reference.x,points.at(-1)!.y-reference.y)>.1)points.push(vertex(reference,id));curve=0;}
  if(!bezierSamples(points,curve).every(onLand))throw new Error("A river would cross ocean in this design. Change its direction or seed.");
  if(points.length<2||Math.hypot(points[0].x-points.at(-1)!.x,points[0].y-points.at(-1)!.y)<2)throw new Error("This landmass is too narrow for a river. Reduce the river count or choose larger landmasses.");
  return {version:1,id:id(),name:`${land.name} River ${index+1}`,type:"path",kind:index%3===2?"stream":"river",points,width:rounded(3.5+random()*3.5),curve,geographyId:null,archived:false};
}

export type GenerationResult = {draft: MapDraft; stats: {landCoverage:number; continents:number; islands:number; drawings:number; terrainMarks:number}; notices:string[]};
export function generateMap(input: GenerationSpec, makeId: Id = () => crypto.randomUUID()): GenerationResult {
  const spec=generationSpecSchema.parse(input),s=spec.settings,random=seededRandom(`${spec.algorithm}:${spec.seed}`),lands=createLand(spec,random,makeId),drawings:MapDrawing[]=[],allRanges=new Map<Land,Vertex[][]>();
  const usable=[...lands].sort((a,b)=>b.area-a.area),largest=usable[0].area;
  for(const land of usable){
    const b=bounds(land.points),scale=Math.min(1,Math.sqrt(land.area/largest)),ranges:Vertex[][]=[];
    if(s.mountains){const count=land.major?spec.plan.mountainRanges:1;for(let i=0;i<count;i++){const points=rangePoints(land,spec.plan,random,makeId,i);ranges.push(points);
      const split=points.length>10&&random()<.65?6+Math.floor(random()*4):points.length;
      const chunks=split<points.length?[points.slice(0,split),points.slice(split+1)]:[points];
      for(const [part,chunk] of chunks.entries()){if(!chunk.length)continue;const stroke=terrain(makeId,random,"mountains",chunk,Math.max(14,(27+random()*15)*scale),s.mountains>65?2:1,`${land.name} Range ${i+1}${part?" spur":""}`);stroke.spacing=rounded(48-s.mountains*.23+random()*13);drawings.push(stroke);}
      if(land.major){const foothills=points.filter((_,j)=>j%3===0).map(p=>vertex({x:p.x+(random()-.5)*42,y:p.y+16+random()*23},makeId)).filter(p=>inside(p,land.points));if(foothills.length)drawings.push(terrain(makeId,random,"hills",foothills,Math.max(13,23*scale),1,`${land.name} Foothills ${i+1}`));}}}
    allRanges.set(land,ranges);
    if(s.forest){const count=land.major?Math.max(1,Math.round(s.forest/20)+Math.floor(random()*3)):random()<.22?0:1;for(let i=0;i<count;i++){const center=regionPoint(land,spec.plan.forestRegion,random,18),radius=Math.max(13,(21+random()*15)*scale);const points=woodland(land,center,random,makeId,radius),core=Math.max(1,Math.floor(points.length*.58));
      drawings.push(terrain(makeId,random,"forest",points.slice(0,core),radius,s.forest>70?3:2,`${land.name} Woodland ${i+1}`));
      if(points.length>core)drawings.push(terrain(makeId,random,"forest",points.slice(core),radius*.8,1,`${land.name} Woodland ${i+1} fringe`));}}
    const biomes:TerrainDrawing["kind"][]=s.biome==="northern"?["snow","grassland","hills"]:s.biome==="arid"?["desert","hills"]:s.biome==="tropical"?["wetland","grassland"]:s.biome==="mixed"?["grassland",land.center.y<430?"snow":land.center.y>700?"desert":"wetland"]:["grassland","hills"];
    const extras=[...new Set([...biomes,...spec.plan.extraTerrain])];
    for(const kind of extras){if(spec.plan.extraTerrain.indexOf(kind as typeof spec.plan.extraTerrain[number])<0&&s.biome==="mixed"&&random()<.3)continue;if(!land.major&&land.area<18000&&kind!=="grassland")continue;const region=kind==="snow"?(spec.plan.snowRegion==="automatic"?"north":spec.plan.snowRegion):kind==="desert"?spec.plan.desertRegion:kind==="wetland"?spec.plan.wetlandRegion:spec.plan.grasslandRegion;const center=regionPoint(land,region,random,15),radius=Math.max(13,kind==="snow"?28*scale:35*scale);const points=woodland(land,center,random,makeId,radius).filter((_,i)=>i%3===0);drawings.push(terrain(makeId,random,kind,points,radius,1,`${land.name} ${kind}`));}
    // A small valley chain reinforces the illustrated mountain range without extra place identities.
    if(ranges.length&&land.major){const points=ranges[0].map(p=>vertex({x:p.x+Math.min(35,b.width*.04),y:p.y+20},makeId)).filter(p=>inside(p,land.points));if(points.length)drawings.push(terrain(makeId,random,"valleys",points,24,1,`${land.name} Foothill valleys`));}
  }
  const main=usable.filter(l=>l.major),waterLands=main.length?main:usable.slice(0,Math.min(8,usable.length));
  const chooseWaterLand=()=>{let at=random()*waterLands.reduce((sum,l)=>sum+l.area,0);return waterLands.find(l=>(at-=l.area)<0)??waterLands[0];};
  for(let i=0;i<s.lakes;i++){const land=chooseWaterLand(),p=regionPoint(land,spec.plan.lakeRegion,random,35),radius=Math.max(14,Math.min(48,Math.sqrt(land.area)*(.035+random()*.045))),angle=random()*TAU;const points=[vertex(p,makeId)];const q=position(p.x+Math.cos(angle)*radius*.7,p.y+Math.sin(angle)*radius*.7);if(inside(q,land.points)&&edgeDistance(q,land.points)>radius*.5)points.push(vertex(q,makeId));drawings.push(terrain(makeId,random,"lake",points,radius,1,`${land.name} Lake ${i+1}`));}
  for(let i=0;i<s.rivers;i++){const land=chooseWaterLand();drawings.push(riverPath(land,allRanges.get(land)??[],spec.plan.riverDirection,Math.floor(i/waterLands.length),makeId,random));}
  // Coverage/density are tendencies. Keep all requested groups and tune their mark spacing to the map budget.
  const terrainDrawings=drawings.filter((d):d is TerrainDrawing=>d.type==="terrain");
  for(let attempt=0;attempt<4;attempt++){
    const marks=terrainDrawings.reduce((sum,d)=>sum+strokeSamples(d.points,d.spacing).length*d.density,0);
    if(marks<=5300&&terrainDrawings.every(d=>strokeSamples(d.points,d.spacing).length*d.density<=580))break;
    for(const d of terrainDrawings)d.spacing=rounded(Math.min(100,d.spacing*1.35));
  }
  const geographies=lands.map(l=>({id:makeId(),revision:null,name:l.name,description:`${l.major?"Continent":"Island"} created from seed ${spec.seed}. Its saved geography is fully editable.`,kind:l.major?"continent" as const:"island" as const,parentId:null}));
  const occupied:{x:number;y:number;width:number;height:number}[]=[];
  const marks=terrainDrawings.flatMap(d=>terrainMarks(d).map(m=>({...m,weight:d.kind==="mountains"?3:1})));
  for(const land of usable){
    const index=lands.indexOf(land),b=bounds(land.points),size=land.major?29:Math.max(14,Math.min(22,Math.sqrt(land.area)*.065)),width=land.name.length*size*.58,height=size*1.2;
    const candidates=[land.center,...[.25,.5,.75].flatMap(x=>[.28,.52,.76].map(y=>({x:b.x+b.width*x,y:b.y+b.height*y}))),{x:land.center.x,y:b.y+b.height+height*1.4}];
    let best=Infinity,chosen=land.center;
    for(const at of candidates){const p=position(Math.max(35+width/2,Math.min(1965-width/2,at.x)),Math.max(45,Math.min(1150,at.y))),box={x:p.x-width/2,y:p.y-height,width,height};
      const hits=occupied.filter(q=>box.x<q.x+q.width&&box.x+width>q.x&&box.y<q.y+q.height&&box.y+height>q.y).length;
      const terrainCost=marks.filter(m=>Math.abs(m.x-p.x)<width/2+22*m.scale&&Math.abs(m.y-p.y)<height+24*m.scale).reduce((sum,m)=>sum+m.weight,0);
      const score=hits*10000+terrainCost*10+(inside(p,land.points)?0:3)+Math.hypot(p.x-land.center.x,p.y-land.center.y)*.002;
      if(score<best){chosen=p;best=score;}
    }
    occupied.push({x:chosen.x-width/2,y:chosen.y-height,width,height});
    drawings.push({version:1,id:makeId(),name:`Name: ${land.name}`,type:"label",text:land.name,point:chosen,size:rounded(size),rotation:0,style:"place",geographyId:geographies[index].id,archived:false});
  }
  const draft:MapDraft={name:"Generated map",description:"",scope:s.mapType,presentation:{...defaultPresentation(),style:s.style},geographies,features:lands.map((land,i)=>({id:makeId(),geographyId:geographies[i].id,geometry:{version:1,type:"polygon",points:land.points},archived:false})),drawings};
  mapDraftSchema.parse(draft);validateMapDraft(draft);
  const coverage=rounded(lands.reduce((sum,l)=>sum+l.area,0)/(MAP_WIDTH*MAP_HEIGHT)*100),markCount=terrainDrawings.reduce((sum,d)=>sum+strokeSamples(d.points,d.spacing).length*d.density,0);
  return {draft,stats:{landCoverage:coverage,continents:s.continents,islands:s.islands,drawings:drawings.length,terrainMarks:markCount},notices:[`Actual land coverage: ${coverage}%. Requested coverage, mountain density and woodland coverage are broad tendencies; ocean separation and editable-source limits take priority.`]};
}
