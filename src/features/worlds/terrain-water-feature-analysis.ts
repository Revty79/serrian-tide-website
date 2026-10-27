import {hydroLayerSchema,type HydroAnalysis,type HydroLayer,type WaterFeature} from "./terrain-hydrology";
import type {HydroFlow} from "./terrain-hydrology-flow";
import {waterDx,insideWaterRings,waterPoint} from "./terrain-water-geometry";
import {featureIdentity,nearestRiverPoint} from "./terrain-water-features";
import {waterContours} from "./terrain-water-contours";

/** Provisional terrain evidence only. Neither a discrete step nor low ground
 * establishes permanent water, groundwater, vegetation or hydraulic discharge. */
export function suggestWaterFeatures(flow:HydroFlow,analysis:HydroAnalysis,accepted:HydroLayer){
  const started=performance.now(),{mesh}=flow,features:WaterFeature[]=[],nearCells=new Set<number>();let samples=0;const omittedContours:string[]=[];
  const spacingAt=(id:number)=>{const p=mesh.patches[mesh.sourceIds[id]];return Math.max(p.source.frame.width/p.width,p.source.frame.height/p.height);};
  const inFocus=(p:{x:number;y:number})=>{const x=mesh.world.wrap?((p.x-analysis.focus.x)%mesh.world.width+mesh.world.width)%mesh.world.width:p.x-analysis.focus.x;return x>=0&&x<analysis.focus.width&&p.y>=analysis.focus.y&&p.y<analysis.focus.y+analysis.focus.height;};
  const sourceIds=analysis.pins.map(p=>p.id),common={description:"",flowKind:"derived" as const,exceptionReason:"",protected:false,analysisId:analysis.id,sourceIds,review:false};
  for(const river of accepted.edges){
    let lastPoint:typeof river.points[number]|undefined;
    for(let k=1;k<river.points.length;k++){
      const a=river.points[k-1],b=river.points[k],dx=waterDx(a.x,b.x,mesh.world),dy=b.y-a.y,length=Math.hypot(dx,dy),cell=mesh.locate(a);if(cell<0)continue;
      let interval:[number,number]|undefined;for(const offset of mesh.world.wrap?[-mesh.world.width,0,mesh.world.width]:[0]){let low=0,high=1;const axes=[[a.y,dy,analysis.focus.y,analysis.focus.y+analysis.focus.height],...mesh.world.wrap&&analysis.focus.width>=mesh.world.width?[]:[[a.x+offset,dx,analysis.focus.x,analysis.focus.x+analysis.focus.width]]];for(const [origin,delta,min,max]of axes){if(Math.abs(delta)<1e-12){if(origin<min||origin>max){high=-1;break;}}else{const t=(min-origin)/delta,u=(max-origin)/delta;low=Math.max(low,Math.min(t,u));high=Math.min(high,Math.max(t,u));}}if(low<=high&&high>=0&&low<=1){interval=[Math.max(0,low),Math.min(1,high)];break;}}if(!interval)continue;
      const [first,last]=interval,spacing=spacingAt(cell),steps=Math.max(1,Math.min(128,Math.ceil(length*(last-first)/spacing)));let previous=waterPoint({x:a.x+dx*first,y:a.y+dy*first},mesh.world),previousZ=mesh.sampleAt(previous);
      for(let j=1;j<=steps;j++){
        if(++samples>65536)throw Error("Special-feature review reached its sample budget. Review a smaller saved network.");
        const point=waterPoint({x:a.x+dx*(first+(last-first)*j/steps),y:a.y+dy*(first+(last-first)*j/steps)},mesh.world),z=mesh.sampleAt(point),distance=Math.hypot(waterDx(previous.x,point.x,mesh.world),point.y-previous.y),drop=previousZ-z,grade=drop/Math.max(1,distance),id=mesh.locate(point);
        if(id>=0){nearCells.add(id);for(let n=mesh.offsets[id];n<mesh.offsets[id+1];n++)nearCells.add(mesh.neighbors[n]);}
        if(drop>=Math.max(3,spacing*.06)&&grade>=.08&&distance<=spacing*2.5&&features.filter(f=>f.kind!=="wetland").length<64){
          const p=nearestRiverPoint(accepted,river.id,previous,mesh.world).point,kind=spacing<=50&&distance<=150&&grade>=.2?"waterfall" as const:"rapids" as const;
          const existing=(accepted.features??[]).find(f=>f.kind===kind&&f.riverId===river.id&&Math.hypot(waterDx(f.point.x,p.x,mesh.world),f.point.y-p.y)<spacing*4);
          if((!lastPoint||Math.hypot(waterDx(lastPoint.x,p.x,mesh.world),lastPoint.y-p.y)>Math.max(200,spacing*4))&&!(existing&&(existing.protected||existing.flowKind!=="derived"))&&!features.some(f=>f.id===(existing?.id??featureIdentity(kind,river.id,p)))){
            features.push({...common,id:existing?.id??featureIdentity(kind,river.id,p),kind,point:p,riverId:river.id,name:kind==="waterfall"?"Potential waterfall":"Potential rapids",evidence:{spacingM:spacing,distanceM:distance,dropM:drop,slope:grade,confidence:spacing<=50?"potential":"coarse",reason:spacing<=50?"A short steep sampled reach; review locally. Numerical ground does not confirm a waterfall or continuous water.":"Coarse steep-reach evidence only. A sample step may conceal a smooth slope; no waterfall is established."}});lastPoint=p;
          }
        }
        previous=point;previousZ=z;
      }
    }
  }
  for(const lake of accepted.lakes??[])for(const ring of lake.rings)for(const p of ring){const id=mesh.locate(p);if(id>=0&&inFocus(p)){nearCells.add(id);for(let n=mesh.offsets[id];n<mesh.offsets[id+1];n++)nearCells.add(mesh.neighbors[n]);}}
  const eligible=new Map<number,number>();for(const id of nearCells){const p=mesh.point(id),z=mesh.heights[id];if(z<=flow.seaLevel||(accepted.lakes??[]).some(l=>l.condition!=="dry"&&insideWaterRings(p,l.rings,mesh.world))||(accepted.features??[]).some(f=>f.kind==="wetland"&&(f.protected||f.flowKind!=="derived")&&insideWaterRings(p,f.rings,mesh.world)))continue;let gradient=0;for(let n=mesh.offsets[id];n<mesh.offsets[id+1];n++){const other=mesh.neighbors[n],q=mesh.point(other);gradient=Math.max(gradient,Math.abs(mesh.heights[other]-z)/Math.max(1,Math.hypot(waterDx(p.x,q.x,mesh.world),p.y-q.y)));}if(gradient<=.012)eligible.set(id,gradient);}
  let wetCount=0;const visited=new Set<number>();for(const start of eligible.keys()){if(visited.has(start)||wetCount>=12)continue;const queue=[start];visited.add(start);for(let i=0;i<queue.length&&queue.length<2048;i++)for(let j=mesh.offsets[queue[i]];j<mesh.offsets[queue[i]+1];j++){const next=mesh.neighbors[j];if(eligible.has(next)&&!visited.has(next)){visited.add(next);queue.push(next);}}
    if(queue.length<4)continue;const seed=mesh.point(start),spacing=spacingAt(start);try{const contour=waterContours(mesh,queue,null,seed);if(contour.frameMode){if(omittedContours.length<12)omittedContours.push("A wet area spans all wrapped longitudes; draw a bounded creator-defined area instead.");continue;}const river=accepted.edges.find(e=>nearestRiverPoint(accepted,e.id,seed,mesh.world).distance<spacing*5),lake=accepted.lakes?.find(l=>l.rings.some(r=>r.some(p=>Math.hypot(waterDx(p.x,seed.x,mesh.world),p.y-seed.y)<spacing*5)));
      const heights=queue.map(id=>mesh.heights[id]),extent=Math.hypot(Math.max(...contour.rings.flat().map(p=>p.x))-Math.min(...contour.rings.flat().map(p=>p.x)),Math.max(...contour.rings.flat().map(p=>p.y))-Math.min(...contour.rings.flat().map(p=>p.y)));
      const existing=accepted.features?.find(f=>f.kind==="wetland"&&f.flowKind==="derived"&&!f.protected&&insideWaterRings(seed,f.rings,mesh.world));if(existing&&features.some(f=>f.id===existing.id))continue;
      features.push({...common,id:existing?.id??featureIdentity("wetland",river?.id??lake?.id??"terrain",seed),kind:"wetland",name:"Potential wet area",rings:contour.rings,classification:"potential",riverId:river?.id??null,lakeId:lake?.id??null,evidence:{spacingM:Math.max(spacing,contour.samplingM),distanceM:Math.max(spacing,extent),dropM:Math.max(...heights)-Math.min(...heights),slope:Math.max(...queue.map(id=>eligible.get(id)??0)),confidence:"potential",reason:"Low-gradient sampled land adjoining saved water. Soil, climate, vegetation and wetland permanence are unknown; the boundary is provisional."}});wetCount++;
    }catch(e){if(omittedContours.length<12)omittedContours.push(e instanceof Error?e.message:"A wetland contour could not be prepared.");}
  }
  const layer=hydroLayerSchema.parse({...accepted,systemVersion:3,analyses:features.length?[...accepted.analyses.filter(a=>a.id!==analysis.id),analysis]:accepted.analyses,features});
  return {layer,samples,omittedContours,elapsedMs:performance.now()-started,estimatedWorkingBytes:(nearCells.size+eligible.size+visited.size)*32};
}
