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
function silhouette(center: Point, rx: number, ry: number, random: Random, id: Id, spec: GenerationSpec, major: boolean): Vertex[] {
  const s = spec.settings, plan = spec.plan, count = major ? 160 : 64;
  const phases = Array.from({length: 7}, () => random()*TAU), frequencies = [1,2,3,6,11,19,31];
  const amplitudes = [.14,.12,.075,.065,.045,.030,.021];
  const bayAngles = Array.from({length: major ? plan.bays : 1}, (_, i) => plan.baySide === "all" ? random()*TAU : sideAngle[plan.baySide]+(i-(plan.bays-1)/2)*.33);
  if(major&&plan.additionalBaySide!=="none")bayAngles.push(sideAngle[plan.additionalBaySide]);
  const crescent = s.shape === "crescent" || (s.shape === "varied" && random()<.3), crescentAngle = random()*TAU;
  return Array.from({length: count}, (_, i) => {
    const angle = i*TAU/count;
    const sideWeight = plan.ruggedCoast === "all" ? 1 : .25+.75*Math.exp(-((angleDistance(angle,sideAngle[plan.ruggedCoast])/.9)**2));
    let radius = .83;
    frequencies.forEach((frequency, j) => {radius += Math.sin(angle*frequency+phases[j])*amplitudes[j]*(j<3 ? 1 : s.ruggedness/100*sideWeight);});
    for (const bay of bayAngles) radius -= (.14+.045*plan.bayDepth)*Math.exp(-((angleDistance(angle,bay)/.19)**2));
    if (crescent) radius -= .32*Math.exp(-((angleDistance(angle,crescentAngle)/.58)**2));
    radius = Math.max(.32,Math.min(1.05,radius));
    return vertex({x:center.x+Math.cos(angle)*rx*radius,y:center.y+Math.sin(angle)*ry*radius},id);
  });
}
function landAt(points: Vertex[], name: string, major: boolean): Land {return {points, center: polygonCenter(points), name, major, area: Math.abs(signedArea(points))};}
function createLand(spec: GenerationSpec, random: Random, id: Id): Land[] {
  const s=spec.settings, result: Land[]=[], names=["Asterfall","Velmora","Nareth","Thalen","Caerwyn","Orinth"];
  const columns=s.continents<=2?s.continents:Math.ceil(Math.sqrt(s.continents)), rows=Math.ceil(s.continents/Math.max(1,columns));
  for(let i=0;i<s.continents;i++) {
    const row=Math.floor(i/columns), inRow=Math.min(columns,s.continents-row*columns), cellW=1840/columns, cellH=1040/rows;
    const offset=regionOffset(spec.plan.landPosition);
    let center={x:1000+(i%columns-(inRow-1)/2)*cellW+(random()-.5)*cellW*.09,y:80+(row+.5)*cellH+(random()-.5)*cellH*.07};
    let rx=cellW*.46,ry=cellH*.45;
    if(s.continents===1){center={x:1000+offset.x*1000,y:600+offset.y*680};rx=Math.min(830,center.x-65,1935-center.x);ry=Math.min(470,center.y-65,1135-center.y);}
    const scale=Math.sqrt(s.landCoverage/50)*(s.size==="small"?.72:s.size==="medium"?.87:s.size==="varied"?.80+random()*.18:1);
    rx*=scale;ry*=scale;
    if(s.shape==="elongated"){if(random()<.65)rx*=.72;else ry*=.72;}
    const points=silhouette(center,rx,ry,random,id,spec,true);
    validateGeometry({version:1,type:"polygon",points});result.push(landAt(points,names[(i+Math.floor(random()*names.length))%names.length]+(i?` ${i+1}`:""),true));
  }
  for(let i=0;i<s.islands;i++) {
    let accepted:Land|undefined;
    const solo=!s.continents, columns=Math.ceil(Math.sqrt(s.islands*MAP_WIDTH/MAP_HEIGHT)), rows=Math.ceil(s.islands/columns);
    for(let attempt=0;attempt<100&&!accepted;attempt++) {
      let center:Point,rx:number,ry:number;
      const varied=s.size==="varied"?.45+random()*.85:s.size==="small"?.70:s.size==="large"?1.10:.90;
      if(solo){const offset=regionOffset(spec.plan.islandPosition),regional=spec.plan.islandPosition!=="scattered",worldWidth=regional?Math.abs(offset.x)>0?1050:1450:1840,worldHeight=regional?Math.abs(offset.y)>0?620:800:1040,originX=1000+offset.x*1500-worldWidth/2,originY=600+offset.y*850-worldHeight/2;const cellW=worldWidth/columns,cellH=worldHeight/rows;center={x:originX+random()*worldWidth,y:originY+random()*worldHeight};const scale=Math.sqrt(s.landCoverage/28)*varied;rx=cellW*.40*scale;ry=cellH*.40*scale;}
      else {
        center={x:65+random()*1870,y:65+random()*1070};
        const main=bounds(result[0].points),side=spec.plan.islandPosition;
        if(side!=="scattered") {
          const offset=regionOffset(side);
          if(side==="center")center={x:650+random()*700,y:350+random()*500};
          if(offset.x)center.x=offset.x>0?main.x+main.width+35+random()*Math.max(10,1880-main.x-main.width):80+random()*Math.max(10,main.x-125);
          if(offset.y)center.y=offset.y>0?main.y+main.height+35+random()*Math.max(10,1080-main.y-main.height):80+random()*Math.max(10,main.y-125);
        }
        rx=(23+random()*40)*varied;ry=(20+random()*38)*varied;
      }
      rx=Math.min(rx,(center.x-32)*.88,(1968-center.x)*.88);ry=Math.min(ry,(center.y-32)*.88,(1168-center.y)*.88);
      if(rx<15||ry<15)continue;
      const points=silhouette(center,rx,ry,random,id,spec,false);
      if(result.some(l=>!separated(l.points,points,14)))continue;
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
    const spread=region==="automatic"?.65:.25,p=position(cx+(random()-.5)*b.width*spread,cy+(random()-.5)*b.height*spread);
    if(inside(p,land.points)&&edgeDistance(p,land.points)>=Math.min(clearance,Math.min(b.width,b.height)*.08))return p;
  }
  throw new Error(`The ${region} terrain region is too narrow in this design. Change its placement, coastline ruggedness or seed.`);
}
function rangePoints(land: Land, plan: GenerationPlan, random: Random, id: Id, index: number): Vertex[] {
  const b=bounds(land.points),center=regionPoint(land,plan.mountainRegion,random,20);
  const angle=plan.mountainOrientation==="north-south"?Math.PI/2:plan.mountainOrientation==="east-west"?0:plan.mountainOrientation==="northeast-southwest"?-Math.PI/4:plan.mountainOrientation==="northwest-southeast"?Math.PI/4:(random()-.5)*Math.PI;
  const length=Math.min(b.width/(Math.abs(Math.cos(angle))||.1),b.height/(Math.abs(Math.sin(angle))||.1))*(.30+random()*.15),phase=random()*TAU;
  const result:Vertex[]=[];
  for(let i=0;i<12;i++){const t=(i/11-.5)*length,bend=Math.sin(i/11*Math.PI*2+phase)*Math.min(32,length*.12),p=position(center.x+Math.cos(angle)*t-Math.sin(angle)*(bend+index*18),center.y+Math.sin(angle)*t+Math.cos(angle)*(bend+index*18));if(inside(p,land.points)&&edgeDistance(p,land.points)>12)result.push(vertex(p,id));}
  if(!result.length)result.push(vertex(center,id));return result;
}
function woodland(land: Land, center: Point, random: Random, id: Id, radius: number): Vertex[] {
  const b=bounds(land.points),width=Math.min(b.width*.24,220),height=Math.min(b.height*.16,130),result:Vertex[]=[];
  for(let row=0;row<5;row++)for(let col=0;col<7;col++){
    const t=row%2?6-col:col,p=position(center.x+(t/6-.5)*width+(random()-.5)*radius*.3,center.y+(row/4-.5)*height+(random()-.5)*radius*.2);
    if(inside(p,land.points)&&edgeDistance(p,land.points)>Math.min(radius*.5,12))result.push(vertex(p,id));
  }
  return result.length?result:[vertex(center,id)];
}
function terrain(id: Id, random: Random, kind: TerrainDrawing["kind"], points: Vertex[], radius: number, density: number, name: string): TerrainDrawing {
  return {version:1,id:id(),type:"terrain",kind,name,geographyId:null,archived:false,points,radius:rounded(Math.max(12,Math.min(160,radius))),spacing:kind==="forest"?24:kind==="mountains"?37:40,density,seed:1+Math.floor(random()*2147483646)};
}
function distanceToRanges(p:Point,ranges:Vertex[][]) {return Math.min(Infinity,...ranges.flat().map(q=>Math.hypot(q.x-p.x,q.y-p.y)));}

function riverPath(land: Land, ranges: Vertex[][], direction: GenerationPlan["riverDirection"], index: number, id: Id, random: Random): PathDrawing {
  const b=bounds(land.points),cols=42,rows=28,dx=b.width/(cols-1),dy=b.height/(rows-1);
  const targetSide=direction==="automatic"?(["east","west","south","north"] as const)[index%4]:direction;
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
  const elevation=(p:Point)=>edgeDistance(p,land.points)*.25+Math.max(0,120-distanceToRanges(p,ranges))*1.7;
  const queue=[start.key],scores=new Map([[start.key,0]]),previous=new Map<number,number>(),visited=new Set<number>();
  let reached=false;
  for(let attempt=0;queue.length&&attempt<cols*rows;attempt++){
    queue.sort((a,c)=>(scores.get(a)!+Math.hypot(cells.get(a)!.x-goal.p.x,cells.get(a)!.y-goal.p.y))-(scores.get(c)!+Math.hypot(cells.get(c)!.x-goal.p.x,cells.get(c)!.y-goal.p.y)));
    const current=queue.shift()!;if(visited.has(current))continue;visited.add(current);if(current===goal.key){reached=true;break;}
    const p=cells.get(current)!,x=current%cols,y=Math.floor(current/cols);
    for(const [ox,oy]of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]){
      const nx=x+ox,ny=y+oy,key=ny*cols+nx;if(nx<0||nx>=cols||ny<0||ny>=rows||visited.has(key)||!cells.has(key))continue;const q=cells.get(key)!;
      if(!visible(p,q))continue;
      const cost=scores.get(current)!+Math.hypot(q.x-p.x,q.y-p.y)+Math.max(0,elevation(q)-elevation(p))*4+Math.max(0,70-distanceToRanges(q,ranges))*.7;
      if(cost>=(scores.get(key)??Infinity))continue;scores.set(key,cost);previous.set(key,current);if(!queue.includes(key))queue.push(key);
    }
  }
  if(!reached)throw new Error("A river could not reach the requested coast in this design. Reduce bay depth/ruggedness or change the seed.");
  const route=[goal.p];let at=goal.key;while(at!==start.key){at=previous.get(at)!;route.unshift(cells.get(at)!);}
  // Keep turns, then smooth modestly; never replace a land route with an ocean-crossing shortcut.
  const kept=route.filter((p,i)=>i===0||i===route.length-1||i%2===0),phase=random()*TAU;
  const bent=kept.map((p,i)=>{if(!i||i===kept.length-1)return p;const a=kept[i-1],c=kept[i+1],length=Math.hypot(c.x-a.x,c.y-a.y)||1,offset=Math.sin(i/kept.length*TAU*1.7+phase)*Math.min(dx,dy)*.48;const q=position(p.x-(c.y-a.y)/length*offset,p.y+(c.x-a.x)/length*offset);return inside(q,land.points)&&edgeDistance(q,land.points)>4?q:p;});
  let points=bent.map(p=>vertex(p,id));
  if(Math.hypot(points.at(-1)!.x-reference.x,points.at(-1)!.y-reference.y)>.1)points.push(vertex(reference,id));
  let curve=.65;
  if(bezierSamples(points,curve).some(p=>!inside(p,land.points)&&edgeDistance(p,land.points)>1)){points=kept.map(p=>vertex(p,id));if(Math.hypot(points.at(-1)!.x-reference.x,points.at(-1)!.y-reference.y)>.1)points.push(vertex(reference,id));curve=.45;}
  if(bezierSamples(points,curve).some(p=>!inside(p,land.points)&&edgeDistance(p,land.points)>1))curve=0;
  if(!bezierSamples(points,curve).every(onLand)){points=route.map(p=>vertex(p,id));if(Math.hypot(points.at(-1)!.x-reference.x,points.at(-1)!.y-reference.y)>.1)points.push(vertex(reference,id));curve=0;}
  if(!bezierSamples(points,curve).every(onLand))throw new Error("A river would cross ocean in this design. Change its direction or seed.");
  if(points.length<2||Math.hypot(points[0].x-points.at(-1)!.x,points[0].y-points.at(-1)!.y)<2)throw new Error("This landmass is too narrow for a river. Reduce the river count or choose larger landmasses.");
  return {version:1,id:id(),name:`${land.name} River ${index+1}`,type:"path",kind:index%3===2?"stream":"river",points,width:rounded(4+(index%3)*1.4),curve,geographyId:null,archived:false};
}

export type GenerationResult = {draft: MapDraft; stats: {landCoverage:number; continents:number; islands:number; drawings:number; terrainMarks:number}; notices:string[]};
export function generateMap(input: GenerationSpec, makeId: Id = () => crypto.randomUUID()): GenerationResult {
  const spec=generationSpecSchema.parse(input),s=spec.settings,random=seededRandom(`${spec.algorithm}:${spec.seed}`),lands=createLand(spec,random,makeId),drawings:MapDrawing[]=[],allRanges=new Map<Land,Vertex[][]>();
  const usable=[...lands].sort((a,b)=>b.area-a.area),largest=usable[0].area;
  for(const land of usable){
    const b=bounds(land.points),scale=Math.min(1,Math.sqrt(land.area/largest)),ranges:Vertex[][]=[];
    if(s.mountains){const count=land.major?spec.plan.mountainRanges:1;for(let i=0;i<count;i++){const points=rangePoints(land,spec.plan,random,makeId,i);ranges.push(points);const stroke=terrain(makeId,random,"mountains",points,Math.max(16,40*scale),s.mountains>65?2:1,`${land.name} Range ${i+1}`);stroke.spacing=rounded(55-s.mountains*.30);drawings.push(stroke);}}
    allRanges.set(land,ranges);
    if(s.forest){const count=land.major?Math.max(1,Math.round(s.forest/18)):1;for(let i=0;i<count;i++){const center=regionPoint(land,spec.plan.forestRegion,random,18),radius=Math.max(13,29*scale);drawings.push(terrain(makeId,random,"forest",woodland(land,center,random,makeId,radius),radius,s.forest>70?3:2,`${land.name} Woodland ${i+1}`));}}
    const biomes:TerrainDrawing["kind"][]=s.biome==="northern"?["snow","grassland","hills"]:s.biome==="arid"?["desert","hills"]:s.biome==="tropical"?["wetland","grassland"]:s.biome==="mixed"?["grassland",land.center.y<430?"snow":land.center.y>700?"desert":"wetland"]:["grassland","hills"];
    const extras=[...new Set([...biomes,...spec.plan.extraTerrain])];
    for(const kind of extras){if(!land.major&&land.area<18000&&kind!=="grassland")continue;const region=kind==="snow"?(spec.plan.snowRegion==="automatic"?"north":spec.plan.snowRegion):kind==="desert"?spec.plan.desertRegion:kind==="wetland"?spec.plan.wetlandRegion:spec.plan.grasslandRegion;const center=regionPoint(land,region,random,15),radius=Math.max(13,kind==="snow"?28*scale:35*scale);const points=woodland(land,center,random,makeId,radius).filter((_,i)=>i%3===0);drawings.push(terrain(makeId,random,kind,points,radius,1,`${land.name} ${kind}`));}
    // A small valley chain reinforces the illustrated mountain range without extra place identities.
    if(ranges.length&&land.major){const points=ranges[0].map(p=>vertex({x:p.x+Math.min(35,b.width*.04),y:p.y+20},makeId)).filter(p=>inside(p,land.points));if(points.length)drawings.push(terrain(makeId,random,"valleys",points,24,1,`${land.name} Foothill valleys`));}
  }
  const main=usable.filter(l=>l.major),waterLands=main.length?main:usable.slice(0,Math.min(8,usable.length));
  for(let i=0;i<s.lakes;i++){const land=waterLands[i%waterLands.length],p=regionPoint(land,spec.plan.lakeRegion,random,35);drawings.push(terrain(makeId,random,"lake",[vertex(p,makeId)],Math.max(14,Math.min(48,Math.sqrt(land.area)*.065)),1,`${land.name} Lake ${i+1}`));}
  for(let i=0;i<s.rivers;i++){const land=waterLands[i%waterLands.length];drawings.push(riverPath(land,allRanges.get(land)??[],spec.plan.riverDirection,Math.floor(i/waterLands.length),makeId,random));}
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
