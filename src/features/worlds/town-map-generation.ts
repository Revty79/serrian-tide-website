import {townFeature,townBounds,townRound,townLayer,townWaterAt,townWaterCrosses,validateTownDesign,TOWN_MAP_LIMITS,type TownBackdrop,type TownDesign,type TownFeature,type TownFrame,type TownGeneration,type TownPoint} from "./town-map";
import {makeTownStamp,defaultTownBrush,townPreset} from "./town-map-presets";
import {nearestTownRoad,sampleTownRoad,townRoadAtDistance,townRoadCategory,townRoadStyle} from "./town-road";

/** Street-front parcels around a market, connected irregular lanes, and protected infill. */
export function generateOrganicTown(config:TownGeneration,f:TownFrame,b:TownBackdrop,existing:TownDesign) {
 const d:TownDesign={...existing,recipe:config,features:[...existing.features]},warnings=[...b.warnings];
 let state=2166136261;for(const c of config.seed)state=Math.imul(state^c.charCodeAt(0),16777619);
 const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
 const uuid=()=>{const h=Array.from({length:4},()=>Math.floor(random()*4294967296).toString(16).padStart(8,"0")).join("");return h.slice(0,8)+"-"+h.slice(8,12)+"-4"+h.slice(13,16)+"-a"+h.slice(17,20)+"-"+h.slice(20);};
 const identities=new Set(existing.features.map(s=>s.id)),kept=existing.features.filter(s=>!s.archived),cell=(p:TownPoint)=>Math.max(0,Math.min(b.size-1,Math.round(p.y/f.height*(b.size-1))))*b.size+Math.max(0,Math.min(b.size-1,Math.round(p.x/f.width*(b.size-1))));
 const wet=(p:TownPoint)=>b.wet[cell(p)]||townWaterAt(p,b),height=(p:TownPoint)=>b.heights[cell(p)],grade=(p:TownPoint)=>Math.max(Math.abs(height({x:p.x+f.width/b.size,y:p.y})-height(p))/(f.width/b.size),Math.abs(height({x:p.x,y:p.y+f.height/b.size})-height(p))/(f.height/b.size));
 let points=d.features.reduce((n,s)=>n+s.points.length,0),skipped=0,crossings=0;
 const protectedBoxes=kept.filter(s=>s.kind!=="district"&&s.kind!=="label").map(s=>townBounds(s));
 const protectedAt=(p:TownPoint,margin=2)=>protectedBoxes.some(q=>p.x>=q.x-margin&&p.x<=q.x+q.width+margin&&p.y>=q.y-margin&&p.y<=q.y+q.height+margin);
 const add=(s:TownFeature)=>{
  if(d.layers[townLayer(s.kind)].locked||d.features.length>=TOWN_MAP_LIMITS.features||points+s.points.length>TOWN_MAP_LIMITS.points)return false;
  if(s.points.some(p=>p.x<0||p.y<0||p.x>f.width||p.y>f.height)||s.points.some(p=>protectedAt(p)))return false;
  while(identities.has(s.id))s={...s,id:uuid()};identities.add(s.id);points+=s.points.length;d.features.push({...s,origin:"generated"});return true;
 };
 const safe=(s:TownFeature)=>!s.points.some(wet)&&!townWaterCrosses(s.points,s.shape==="area",b)&&grade({x:s.points.reduce((n,p)=>n+p.x,0)/s.points.length,y:s.points.reduce((n,p)=>n+p.y,0)/s.points.length})<(config.terrain==="mountain"?.3:.18);
 const base={x:f.width*.5,y:f.height*.5},unit=Math.min(f.width,f.height),candidates=[base,...Array.from({length:16},(_,i)=>({x:base.x+Math.cos(i*Math.PI/8)*unit*.16,y:base.y+Math.sin(i*Math.PI/8)*unit*.16}))];
 const center=candidates.find(p=>!wet(p)&&grade(p)<.18)??base;
 const rings=config.category==="city"?Math.min(11,Math.max(6,Math.ceil(Math.sqrt(config.population/1000)*config.density)+3)):config.category==="town"?Math.min(6,Math.max(3,Math.ceil(Math.sqrt(config.population/500)*config.density)+2)):Math.min(3,Math.max(2,Math.ceil(Math.sqrt(config.population/150)*config.density)));
 const spokes=config.category==="city"?32:config.category==="town"?17:10,radial=config.roads==="radial",rx=Math.min(Math.min(center.x,f.width-center.x)*.84,config.category==="village"?190+Math.sqrt(config.population)*2:Infinity),ry=Math.min(Math.min(center.y,f.height-center.y)*.84,config.category==="village"?130+Math.sqrt(config.population):Infinity);
 const angles=Array.from({length:spokes},(_,j)=>j/spokes*Math.PI*2+(radial?0:(random()-.5)*Math.PI/spokes*.65));
 const nodes:TownPoint[][]=Array.from({length:rings},(_,r)=>angles.map((angle,j)=>{
  const fraction=(r+1)/(rings+.25),ripple=radial?1:1+Math.sin(j*1.8+r*.75)*.055+(random()-.5)*.07;
  let p={x:center.x+Math.cos(angle)*rx*fraction*ripple,y:center.y+Math.sin(angle)*ry*fraction*ripple};
  if(wet(p)||grade(p)>.2){const alternatives=[-.1,.1,-.2,.2].map(da=>({x:center.x+Math.cos(angle+da)*rx*fraction,y:center.y+Math.sin(angle+da)*ry*fraction}));p=alternatives.find(q=>!wet(q)&&grade(q)<.2)??p;}
  return {x:townRound(p.x),y:townRound(p.y)};
 }));
 const roads:TownFeature[]=[];
 const connect=(a:TownPoint,end:TownPoint,main=false)=>{
  const distance=Math.hypot(end.x-a.x,end.y-a.y),bend=radial?0:(random()-.5)*Math.min(18,distance*.2),midpoint={x:townRound((a.x+end.x)/2-(end.y-a.y)/Math.max(1,distance)*bend),y:townRound((a.y+end.y)/2+(end.x-a.x)/Math.max(1,distance)*bend)},s=townFeature("road","line",[a,midpoint,end],uuid());
  s.width=(main?12:config.category==="city"?6:4)*(config.era==="modern"?1.4:1);s.category=townRoadCategory(main?"main":"lane",!radial);const path=sampleTownRoad(s),water=path.filter(wet).length;
  if(water>path.length*.6||path.some(p=>grade(p)>.35)){skipped++;return;}const bridge=!!water||townWaterCrosses(path,false,b);if(bridge)s.category=townRoadCategory("bridge",!radial);
  if(add(s)){roads.push(s);if(bridge)crossings++;}
 };
 if(radial)for(let r=0;r<rings;r++)for(let j=0;j<spokes;j++){
  connect(nodes[r][j],nodes[r][(j+1)%spokes]);
  const main=j%Math.max(2,Math.floor(spokes/4))===0;
  if(r?(radial||main||random()<.5):main){const entrance={x:townRound(center.x+Math.cos(angles[j])*(config.category==="city"?39:28)),y:townRound(center.y+Math.sin(angles[j])*(config.category==="city"?29:21))};connect(r?nodes[r-1][j]:entrance,nodes[r][j],main);}
 }
 else {
  // A small planar street graph produces varied blocks and dead ends instead of rings or a distorted grid.
  const junctions:TownPoint[]=[{x:townRound(center.x-32),y:townRound(center.y-24)},{x:townRound(center.x+32),y:townRound(center.y-24)},{x:townRound(center.x+32),y:townRound(center.y+24)},{x:townRound(center.x-32),y:townRound(center.y+24)}];
  const count=config.category==="city"?Math.min(240,Math.max(100,Math.ceil(Math.sqrt(config.population)*config.density))):config.category==="town"?Math.min(110,Math.max(36,Math.ceil(Math.sqrt(config.population)*config.density))):Math.min(32,Math.max(16,Math.ceil(Math.sqrt(config.population)*config.density)));
  const separation=Math.sqrt(rx*ry*Math.PI/count)*.55;
  for(let tries=0;junctions.length<count&&tries<count*45;tries++){const angle=random()*Math.PI*2,radius=Math.sqrt(random())*.85,p={x:townRound(center.x+Math.cos(angle)*rx*radius),y:townRound(center.y+Math.sin(angle)*ry*radius)};if(Math.hypot(p.x-center.x,p.y-center.y)<48||wet(p)||grade(p)>.25||junctions.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<separation))continue;junctions.push(p);}
  const edges:[number,number][]=[],degree=Array(junctions.length).fill(0),connected=new Set([0,1,2,3]);
  const edge=(i:number,j:number,main=false)=>{connect(junctions[i],junctions[j],main);edges.push([i,j]);degree[i]++;degree[j]++;};
  for(let j=0;j<4;j++)edge(j,(j+1)%4,true);
  while(connected.size<junctions.length){let bestI=-1,bestJ=-1,best=Infinity;for(const i of connected)for(let j=4;j<junctions.length;j++){if(connected.has(j))continue;const a=junctions[i],e=junctions[j],mid={x:(a.x+e.x)/2,y:(a.y+e.y)/2},distance=Math.hypot(a.x-e.x,a.y-e.y)*(wet(mid)?6:1)*(1+grade(mid));if(distance<best){best=distance;bestI=i;bestJ=j;}}if(bestJ<0)break;edge(bestI,bestJ,bestI<4);connected.add(bestJ);}
  const side=(a:TownPoint,b:TownPoint,c:TownPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const crosses=(i:number,j:number)=>edges.some(([a,b])=>a!==i&&a!==j&&b!==i&&b!==j&&side(junctions[i],junctions[j],junctions[a])*side(junctions[i],junctions[j],junctions[b])<0&&side(junctions[a],junctions[b],junctions[i])*side(junctions[a],junctions[b],junctions[j])<0);
  const possibilities=junctions.flatMap((a,i)=>junctions.slice(i+1).map((e,k)=>({i,j:i+k+1,d:Math.hypot(a.x-e.x,a.y-e.y)}))).sort((a,b)=>a.d-b.d);
  for(const q of possibilities){if(q.d>separation*3||degree[q.i]>=4||degree[q.j]>=4||edges.some(([a,b])=>a===q.i&&b===q.j||a===q.j&&b===q.i)||crosses(q.i,q.j))continue;if((degree[q.i]<2||degree[q.j]<2||random()<.32)&&!protectedAt(junctions[q.i])&&!protectedAt(junctions[q.j]))edge(q.i,q.j);}
 }
 // The gathering place gives the town a readable heart rather than another filled block.
 const market=makeTownStamp("square",center,{...defaultTownBrush(),category:"market",size:config.category==="city"?1.4:1},uuid());market.name="Market Square";
 if(safe(market))add(market);
 const occupied=new Map<string,ReturnType<typeof townBounds>[]>(),boxUnit=Math.max(8,unit/64);
 const keys=(box:ReturnType<typeof townBounds>)=>{const result:string[]=[];for(let j=Math.floor(box.y/boxUnit);j<=Math.floor((box.y+box.height)/boxUnit);j++)for(let i=Math.floor(box.x/boxUnit);i<=Math.floor((box.x+box.width)/boxUnit);i++)result.push(i+":"+j);return result;};
 const occupy=(s:TownFeature)=>{const box=townBounds(s);for(const key of keys(box))occupied.set(key,[...(occupied.get(key)??[]),box]);};
 if(d.features.includes(market)||d.features.some(s=>s.id===market.id))occupy(market);
 for(const s of kept.filter(s=>s.kind==="building"||s.kind==="square"))occupy(s);
 const collides=(s:TownFeature)=>{const q=townBounds(s);return keys(q).some(key=>occupied.get(key)?.some(a=>q.x<a.x+a.width+1.2&&q.x+q.width>a.x-1.2&&q.y<a.y+a.height+1.2&&q.y+q.height>a.y-1.2));};
 const distanceToRoad=(p:TownPoint,road:TownFeature)=>nearestTownRoad(p,road,64,.1)?.distance??Infinity;
 let buildings=0,plotSequence=0;
 for(const road of roads){
  if(townRoadStyle(road)==="bridge")continue;
  const path=sampleTownRoad(road),length=path.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-path[i].x,p.y-path[i].y),0);
  const spacing=config.category==="city"?15:config.category==="town"?26:32,plots=Math.max(1,Math.min(24,Math.floor(length/spacing)));
  for(let k=0;k<plots;k++)for(const side of [-1,1]){
   if(random()>.58+config.density*.4||d.features.length>=4000)continue;
   const t=(k+.5)/plots,at=townRoadAtDistance(path,length*t),along=at.point,ux=Math.cos(at.angle),uy=Math.sin(at.angle),nearCenter=Math.hypot((along.x-center.x)/Math.max(1,rx),(along.y-center.y)/Math.max(1,ry))<.35;
   const chance=random(),baseCategory=nearCenter?(chance<.22?"shop":chance<.3?"inn":chance<.34?"public":chance<.38?"temple":"house"):(chance<.48?"cottage":chance<.7?"house":chance<.8?"townhouse":chance<.88?"workshop":chance<.94?"barn":"stable");
   const sequence=plotSequence++%13,variedCategory=sequence===3?"townhouse":sequence===9?"workshop":baseCategory;const category=config.culture==="courtyard"&&["cottage","house","townhouse"].includes(variedCategory)?"courtyard":variedCategory;
   const preset=townPreset(category),size=(config.category==="city"?.65:.85)+random()*.28,offset=road.width/2+preset.height*size/2+3+(config.category==="village"?random()*6:random()*2),p={x:along.x-uy*offset*side,y:along.y+ux*offset*side};
   const brush={...defaultTownBrush(),category,size,rotation:at.angle*180/Math.PI+(side===1?180:0)+(radial?0:(random()-.5)*7),architecture:config.culture==="stone"?"stone" as const:config.culture==="local"?"local" as const:"timber" as const};
   const s=makeTownStamp("building",p,brush,uuid());
   if(!safe(s)||wet(p)||protectedAt(p)||collides(s)||s.points.some(q=>!!nearestTownRoad(q,road,road.width/2+.8,.08))||Math.hypot(p.x-center.x,p.y-center.y)<30||roads.some(other=>other.id!==road.id&&distanceToRoad(p,other)<other.width/2+Math.min(preset.width,preset.height)*size*.35)){skipped++;continue;}
   if(add(s)){occupy(s);buildings++;}
  }
 }
 // Small gardens, trees, and distinct neighborhoods leave useful open space.
 for(let j=0;j<spokes;j+=2){const a=nodes[Math.min(rings-1,1)][j],p={x:townRound((a.x+center.x)/2),y:townRound((a.y+center.y)/2)},park=makeTownStamp("square",p,{...defaultTownBrush(),category:"park",size:.65},uuid());if(safe(park)&&!collides(park)&&!protectedAt(p)&&add(park))occupy(park);}
 for(let i=0;i<Math.min(160,spokes*rings*2);i++){const p={x:townRound(center.x+(random()-.5)*rx*2),y:townRound(center.y+(random()-.5)*ry*2)},s=makeTownStamp("landmark",p,{...defaultTownBrush(),category:"tree",size:.7+random()*.7},uuid());const probe=makeTownStamp("building",p,{...defaultTownBrush(),category:"cottage",size:.6},s.id);if(!wet(p)&&!protectedAt(p)&&!collides(probe)&&!roads.some(r=>distanceToRoad(p,r)<r.width/2+5))add(s);}
 if(config.category==="village")for(let j=0;j<8;j++){const angle=j*Math.PI/4,p={x:center.x+Math.cos(angle)*rx*.95,y:center.y+Math.sin(angle)*ry*.95},field=makeTownStamp("square",p,{...defaultTownBrush(),category:"field",rotation:angle*180/Math.PI+(random()-.5)*25,size:.65+random()*.4},uuid());if(safe(field)&&!collides(field)&&!protectedAt(p)&&!roads.some(r=>distanceToRoad(p,r)<35)&&add(field))occupy(field);}
 for(let cluster=0;cluster<3;cluster++){const angle=cluster*Math.PI*2/3+.4,c={x:center.x+Math.cos(angle)*rx*.9,y:center.y+Math.sin(angle)*ry*.9};for(let i=0;i<10;i++){const p={x:townRound(c.x+(random()-.5)*45),y:townRound(c.y+(random()-.5)*45)},tree=makeTownStamp("landmark",p,{...defaultTownBrush(),category:"tree",size:.8+random()*.5},uuid());if(!wet(p)&&!protectedAt(p)&&!roads.some(r=>distanceToRoad(p,r)<r.width/2+7))add(tree);}}
 for(const [j,name,category]of [[0,"Market quarter","commercial"],[Math.floor(spokes/3),"Homes & gardens","residential"],[Math.floor(spokes*2/3),"Artisans’ quarter","industrial"]] as const){const a=nodes[Math.min(1,rings-1)][j],end=nodes[rings-1][(j+3)%spokes],s=townFeature("district","area",[a,nodes[rings-1][j],end,nodes[Math.min(1,rings-1)][(j+3)%spokes]],uuid());s.name=name;s.category=category;try{validateTownDesign({...d,features:[...d.features,s]},f);add(s);}catch{/* A very small frame may leave no non-crossing district here. */}}
 if(config.fortified||config.mode==="layout"&&config.layout==="fortified"){
  const outer=nodes[rings-1];
  for(let j=0;j<spokes;j++){const a=outer[j],e=outer[(j+1)%spokes],s=townFeature("wall","line",[a,e],uuid());s.category="defense";s.width=4;if(safe(s))add(s);if(j%Math.max(2,Math.floor(spokes/4))===0){const gate=makeTownStamp("landmark",a,{...defaultTownBrush(),category:"gate",rotation:Math.atan2(e.y-a.y,e.x-a.x)*180/Math.PI},uuid());if(!wet(a))add(gate);}}
 }
 if(skipped)warnings.push(skipped+" proposed sites or streets were omitted to avoid water, steep ground, crowding or protected work.");
 if(crossings)warnings.push(crossings+" short crossings are drawn as bridges. Check them before saving.");
 if(kept.length)warnings.push("All accepted features are protected. New proposals avoid their occupied bounds; existing geometry and place links are retained.");
 if(d.features.length>=4000)warnings.push("The 4,000-feature limit was reached; this proposal is bounded.");
 if(!buildings)warnings.push("No suitable empty building sites were found. Keep your work and try a different area or layout.");
 validateTownDesign(d,f);return {design:d,warnings};
}
