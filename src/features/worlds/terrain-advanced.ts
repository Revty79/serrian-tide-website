import type {TerrainGeometry} from "./terrain";
import type {TerrainFrame} from "./terrain-refinement";
import type {HydroLayer,HydroPoint} from "./terrain-hydrology";
import {insideWaterRings,waterBounds,nearestWaterShore} from "./terrain-water-geometry";
import {regionAreaContainsPoint,regionCanonicalX,validateRegionFootprint} from "./terrain-region-geometry";
import {ADVANCED_TERRAIN_LIMITS as LIMITS,advancedOperationSchema,type AdvancedOperation,type VolcanoOperation} from "./terrain-advanced-spec";

export type AuthoredVolcano={id:string;revision:number;sourceId:string|null;operation:VolcanoOperation};
export type AdvancedTerrainContext={
  frame:TerrainFrame;world:{width:number;height:number;wrap:boolean};seaLevel:number;
  water:HydroLayer;sites:{id:string;x:number;y:number}[];volcanoes:AuthoredVolcano[];
};
export type AdvancedMetrics={
  changed:number;minimum:number;maximum:number;maxLoweringM:number;maxRaisingM:number;
  removedM3:number;addedM3:number;eligible:number;protected:number;waterProtected:number;siteProtected:number;
  visited:number;workingBytes:number;affected:TerrainFrame|null;notices:string[];
};
export type AdvancedResult={grid:Int16Array;patch:{indices:Uint32Array;before:Int16Array;after:Int16Array};metrics:AdvancedMetrics};
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const distance=(a:HydroPoint,b:HydroPoint,w:AdvancedTerrainContext["world"])=>Math.hypot(dx(a.x,b.x,w),b.y-a.y);
const dx=(a:number,b:number,w:AdvancedTerrainContext["world"])=>{let v=b-a;if(w.wrap)v-=Math.round(v/w.width)*w.width;return v;};
const rectContains=(a:TerrainFrame,p:HydroPoint,w:AdvancedTerrainContext["world"])=>{
  const x=w.wrap?((p.x-a.x)%w.width+w.width)%w.width:p.x-a.x;
  return x>=-1e-6&&x<=a.width+1e-6&&p.y>=a.y-1e-6&&p.y<=a.y+a.height+1e-6;
};

/** Resolve accepted graph identities. No caller-provided replacement route is used. */
export function advancedRiverPath(operation:Extract<AdvancedOperation,{kind:"river-channel"}>,context:AdvancedTerrainContext){
  let edge=context.water.edges.find(e=>e.id===operation.riverId);
  if(!edge)throw Error("Choose a saved river. Save or reconcile its water draft before carving.");
  if(edge.flowKind==="exception")throw Error("A fictional flow exception cannot certify a downhill channel. Reconcile its course first.");
  const last=operation.last??edge.points.length-1;
  if(operation.first>=last||last>=edge.points.length)throw Error("Choose an increasing range of saved river control points.");
  const points=edge.points.slice(operation.first,last+1),seen=new Set([edge.id]);
  if(operation.course==="downstream"){
    if(last!==edge.points.length-1)throw Error("The connected course starts from a segment reaching this river's downstream end.");
    while(true){
      const node=context.water.nodes.find(n=>n.id===edge!.to);
      if(node&&["sea-outlet","closed-sink","lake-inlet"].includes(node.kind))break;
      const next=context.water.edges.filter(e=>e.from===edge!.to);
      if(!next.length)break;
      if(next.length!==1)throw Error("Choose a single saved branch before carving this junction.");
      edge=next[0];
      if(seen.has(edge.id)||seen.size>=LIMITS.riverEdges)throw Error("Choose a shorter connected river course (up to 64 edges).");
      if(edge.flowKind==="exception")break;
      seen.add(edge.id);points.push(...edge.points.slice(1));
      if(points.length>2048)throw Error("Choose a shorter river course (up to 2,048 retained control points).");
    }
  }
  return points;
}

/** The existing operation engine consumes this generator and returns its ordinary tile patch.
 * Buffers are local to the selected window; no second terrain store or history is created.
 * Yields bound fallback slices and permit cancellation between numerical batches. */
export function* advancedTerrainSteps(
  base:Int16Array,shape:TerrainGeometry,raw:AdvancedOperation,context:AdvancedTerrainContext,
  blocked?:Uint8Array,manual?:Uint8Array,
):Generator<number,AdvancedResult,void>{
  const op=advancedOperationSchema.parse(raw),n=shape.width*shape.height;
  if(base.length!==n||n>16777216||blocked&&blocked.length!==n||manual&&manual.length!==n)throw Error("The accepted terrain buffers do not match this bounded source.");
  const {frame,world,seaLevel}=context,selection=op.selection,sx=frame.width/shape.width,sy=frame.height/shape.height;
  if(![sx,sy,world.width,world.height].every(v=>Number.isFinite(v)&&v>0)||!Number.isFinite(seaLevel))throw Error("The accepted physical terrain frame is invalid.");
  if(selection.footprint)validateRegionFootprint(selection.footprint,world,selection.frame);
  if(selection.frame.x>=world.width||selection.frame.width>world.width||selection.frame.y+selection.frame.height>world.height+1e-5||!world.wrap&&selection.frame.x+selection.frame.width>world.width+1e-5)throw Error("Keep the selection inside the World.");
  const checkedPoint=op.kind==="volcano"?op.centre:op.kind==="eruption"?op.source:undefined;
  if(checkedPoint&&(checkedPoint.x>=world.width||checkedPoint.y>=world.height))throw Error("Choose a canonical location inside this World.");
  const notices:string[]=[],river=op.kind==="river-channel"?advancedRiverPath(op,context):undefined;
  const authored=op.kind==="eruption"?context.volcanoes.find(v=>v.id===op.volcanoId):undefined;
  if(op.kind==="eruption"&&!authored)throw Error("Choose a retained authored volcano from this terrain's accepted history.");
  let influence:TerrainFrame|undefined;
  if(op.kind==="volcano"||op.kind==="eruption"){
    const centre=op.kind==="volcano"?op.centre:op.effect==="lava"?op.source:authored!.operation.centre;
    const r=op.kind==="volcano"?op.radiusM+op.blendM:op.extentM;
    if(r<Math.max(sx,sy)*2)throw Error("Use a radius covering at least two native samples, or choose finer terrain. No automatic widening is applied.");
    influence={x:world.wrap?regionCanonicalX(centre.x-r,world):centre.x-r,y:centre.y-r,width:Math.min(world.width,2*r),height:2*r};
    if(op.kind==="volcano"&&op.craterDiameterM>0&&op.craterDiameterM<Math.max(sx,sy)*2)throw Error("The crater needs at least two native samples across its diameter. Choose a larger crater or finer terrain.");
  }else if(river){
    const r=op.kind==="river-channel"?op.widthM/2*(1+op.bankSoftness*2):0,b=waterBounds(river,world);
    influence={x:world.wrap?regionCanonicalX(b.x-r,world):b.x-r,y:b.y-r,width:Math.min(world.width,b.width+2*r),height:b.height+2*r};
    if(op.kind==="river-channel"&&op.widthM<Math.max(sx,sy))throw Error("This channel is narrower than the native sample spacing. Choose finer terrain or an explicit supported width.");
  }
  const xs:Array<{x:number;offset:number}>=[],ys:number[]=[];
  for(let x=0;x<shape.width;x++){
    const wx=regionCanonicalX(frame.x+x*sx,world),p={x:wx,y:selection.frame.y};
    if(!rectContains({...selection.frame,y:0,height:world.height},p,world))continue;
    if(influence&&!rectContains({...influence,y:0,height:world.height},p,world))continue;
    xs.push({x,offset:world.wrap?((wx-selection.frame.x)%world.width+world.width)%world.width:wx-selection.frame.x});
  }
  xs.sort((a,b)=>a.offset-b.offset);
  for(let y=0;y<shape.height;y++){const wy=frame.y+y*sy;if(wy>=selection.frame.y-1e-6&&wy<=selection.frame.y+selection.frame.height+1e-6&&(!influence||wy>=influence.y&&wy<=influence.y+influence.height))ys.push(y);}
  const cells=xs.length*ys.length;
  if(!cells)throw Error("This selection has no native samples in the active terrain source.");
  if(cells>LIMITS.cells||op.kind==="erosion"&&cells*op.iterations>LIMITS.work)throw Error("Choose a smaller area or fewer erosion steps. The limit is 262,144 samples and 8,388,608 sample-steps; fidelity is unchanged.");
  const bytes=n*12+cells*64;
  if(bytes>LIMITS.workingBytes)throw Error("This operation exceeds its 32 MiB numerical working-buffer budget. Choose a smaller area.");
  const lookup=new Int32Array(n).fill(-1),indices=new Uint32Array(cells),weights=new Float32Array(cells),
    bed=new Float64Array(cells),delta=new Float64Array(cells),removed=new Float64Array(cells);
  let protectedCount=0,waterProtected=0,siteProtected=0,eligible=0,visited=0,geometryWork=0,lastYield=performance.now();
  const wet=[...(context.water.lakes??[]).map(l=>({rings:l.rings,bounds:waterBounds(l.rings.flat(),world)})),
    ...(context.water.features??[]).filter(f=>f.kind==="wetland").map(f=>({rings:f.rings,bounds:waterBounds(f.rings.flat(),world)}))];
  const position=(i:number)=>({x:regionCanonicalX(frame.x+(i%shape.width)*sx,world),y:frame.y+Math.floor(i/shape.width)*sy});
  if(context.sites.length>8192)throw Error("This source exceeds 8,192 settlement supports. Choose a finer source for a bounded operation.");
  const siteMask=new Uint8Array(n);
  for(const site of context.sites){
    const gx=(world.wrap?((site.x-frame.x)%world.width+world.width)%world.width:site.x-frame.x)/sx,gy=(site.y-frame.y)/sy;
    if(gx<0||gx>=shape.width||gy<0||gy>=shape.height)continue;
    const x=shape.wrap?Math.round(gx)%shape.width:Math.min(shape.width-1,Math.round(gx)),y=Math.min(shape.height-1,Math.round(gy));
    for(let ey=-1;ey<=1;ey++)for(let ex=-1;ex<=1;ex++){
      const xx=shape.wrap?(x+ex+shape.width)%shape.width:x+ex,yy=y+ey;
      if(xx>=0&&xx<shape.width&&yy>=0&&yy<shape.height)siteMask[yy*shape.width+xx]=1;
    }
  }
  const counts=()=>{visited++;return (visited&255)===0&&performance.now()-lastYield>4;};
  for(let k=0;k<cells;k++){
    if(counts()){lastYield=performance.now();yield .12*k/cells;}
    const x=xs[k%xs.length].x,y=ys[Math.floor(k/xs.length)],i=y*shape.width+x,p=position(i);indices[k]=i;bed[k]=base[i];
    if(blocked?.[i]||op.preserveManual&&manual?.[i]){protectedCount++;continue;}
    if(base[i]<=seaLevel){waterProtected++;continue;}
    if(selection.footprint){geometryWork+=selection.footprint.parts.reduce((n,r)=>n+r.length,0);if(geometryWork>LIMITS.work)throw Error("Simplify the selected outline or choose a smaller operation area.");if(!regionAreaContainsPoint(selection,p,world))continue;}
    let underwater=false;
    for(const water of wet)if(rectContains(water.bounds,p,world)){
      geometryWork+=water.rings.reduce((n,r)=>n+r.length,0);
      if(geometryWork>LIMITS.work)throw Error("This area contains too much shoreline detail for one operation. Select a smaller area.");
      if(insideWaterRings(p,water.rings,world)){underwater=true;break;}
    }
    if(underwater){waterProtected++;continue;}
    if(siteMask[i]){siteProtected++;continue;}
    const a=selection.frame,px=world.wrap?((p.x-a.x)%world.width+world.width)%world.width:p.x-a.x,
      feather=op.kind==="erosion"?op.featherM:0;
    let edge=Math.min(px,a.width-px,p.y-a.y,a.y+a.height-p.y);
    if(feather&&selection.footprint){
      geometryWork+=selection.footprint.parts.reduce((n,r)=>n+r.length,0);
      if(geometryWork>LIMITS.work)throw Error("Simplify the selected outline or choose a smaller operation area.");
      edge=Math.min(edge,nearestWaterShore(p,selection.footprint.parts,world).distance);
    }
    const weight=feather?smooth(Math.max(0,edge)/feather):1;
    if(weight>0){weights[k]=weight;lookup[i]=k;eligible++;}
    if(counts()){lastYield=performance.now();yield .12*k/cells;}
  }
  const globalIndex=(x:number,y:number)=>y<0||y>=shape.height||!shape.wrap&&(x<0||x>=shape.width)?-1:y*shape.width+((x%shape.width+shape.width)%shape.width);
  const nearby=(i:number)=>{const x=i%shape.width,y=Math.floor(i/shape.width),out:Array<{k:number;east:number;south:number;length:number}>=[];
    for(let ey=-1;ey<=1;ey++)for(let ex=-1;ex<=1;ex++){if(!ex&&!ey)continue;const j=globalIndex(x+ex,y+ey),k=j<0?-1:lookup[j];if(k>=0)out.push({k,east:ex,south:ey,length:Math.hypot(ex*sx,ey*sy)});}return out;};
  const sample=(p:HydroPoint)=>{
    const gx=(world.wrap?((p.x-frame.x)%world.width+world.width)%world.width:p.x-frame.x)/sx,gy=(p.y-frame.y)/sy;
    if(gx<0||gx>=shape.width||gy<0||gy>=shape.height)return null;
    const x=shape.wrap?Math.round(gx)%shape.width:Math.min(shape.width-1,Math.round(gx)),y=Math.min(shape.height-1,Math.round(gy));
    return y*shape.width+x;
  };
  if(op.kind==="erosion"){
    const angle=op.direction*Math.PI/180,repose=Math.tan(op.reposeDegrees*Math.PI/180),directions=[];
    for(let east=-1;east<=1;east++)for(let south=-1;south<=1;south++)if(east||south){const length=Math.hypot(east*sx,south*sy);directions.push({east,south,length,cosine:(east*sx*Math.sin(angle)-south*sy*Math.cos(angle))/length});}
    // Reuse eight offsets; no neighbour arrays or objects are allocated per sample-step.
    for(let step=0;step<op.iterations;step++){
      delta.fill(0);
      for(let k=0;k<cells;k++){
        if(!weights[k])continue;
        let best=-1,bestScore=-Infinity,bestDrop=0;
        const x=indices[k]%shape.width,y=Math.floor(indices[k]/shape.width);
        for(const q of directions){
          const i=globalIndex(x+q.east,y+q.south),other=i<0?-1:lookup[i];if(other<0)continue;
          const drop=bed[k]-bed[other],excess=drop-(op.model==="thermal"?q.length*repose:0);
          if(excess<=0)continue;
          const score=excess/q.length*(1+op.directionInfluence*q.cosine*.95);
          if(score>bestScore){best=other;bestScore=score;bestDrop=excess;}
        }
        if(best>=0){
          const amount=Math.max(0,Math.min(bestDrop*.125,op.maxDepthM/8,op.maxDepthM-removed[k]))*
            op.strength/100*Math.min(weights[k],weights[best]);
          delta[k]-=amount;removed[k]+=amount;if(op.deposition)delta[best]+=amount;
        }
        if(counts()){lastYield=performance.now();yield .12+.7*(step+k/cells)/op.iterations;}
      }
      for(let k=0;k<cells;k++)if(weights[k])bed[k]=Math.max(seaLevel+1,Math.min(shape.max,bed[k]+delta[k]));
    }
    notices.push(op.model==="thermal"?"Stylized downhill talus transport above the chosen repose angle; this is not a geological forecast.":"Stylized directional runoff detaches material toward the steepest weighted downhill neighbour; it is not a hydraulic simulation.");
    notices.push(op.deposition?"Transport retains material inside eligible samples before metre rounding and elevation bounds. Reported cut/fill volumes include that quantization.":"Deposition is off: eroded material leaves the model. Material conservation is not claimed.");
  }else if(op.kind==="volcano"){
    const summit={x:regionCanonicalX(op.centre.x+op.summitEastM,world),y:op.centre.y+op.summitSouthM},
      centreIndex=sample(op.centre);
    if(centreIndex===null||base[centreIndex]<=seaLevel)throw Error("Choose a volcano centre on saved land inside this terrain source.");
    for(let k=0;k<cells;k++)if(weights[k]){
      const p=position(indices[k]),outer=distance(p,op.centre,world),r=distance(p,summit,world)/(op.radiusM+op.blendM);
      if(outer>op.radiusM+op.blendM)continue;
      const taper=op.blendM?1-smooth((outer-op.radiusM)/op.blendM):outer<=op.radiusM?1:0;
      let profile=Math.max(0,1-r);
      if(op.form==="shield")profile=Math.max(0,Math.cos(Math.min(1,r)*Math.PI/2))**(.65*op.profile);
      else if(op.form==="composite")profile=profile**(1.6*op.profile);
      else if(op.form==="cratered")profile=Math.min(1,profile/.8)**op.profile;
      else if(op.form==="caldera")profile=Math.min(1,profile/Math.max(.15,1-op.craterDiameterM/(2*op.radiusM)))**op.profile;
      else profile=profile**op.profile;
      const craterR=op.craterDiameterM/2,craterDistance=distance(p,summit,world),
        crater=craterR>0&&craterDistance<craterR?op.craterDepthM*(1-(craterDistance/craterR)**2)**2:0;
      bed[k]=Math.max(seaLevel+1,Math.min(shape.max,base[indices[k]]+(op.heightM*profile-crater)*taper*op.strength/100));
      if(counts()){lastYield=performance.now();yield .12+.7*k/cells;}
    }
    notices.push("The landform is an additive numerical profile blended into the accepted landscape. Lake surfaces, sea, finer detail and settlement supports stay protected.");
  }else if(op.kind==="eruption"&&op.effect==="collapse"){
    const centre=authored!.operation.centre;
    for(let k=0;k<cells;k++)if(weights[k]){
      const r=distance(position(indices[k]),centre,world)/op.extentM;
      if(r<1)bed[k]=Math.max(seaLevel+1,base[indices[k]]-op.magnitudeM*(1-r*r)**2*op.strength/100);
      if(counts()){lastYield=performance.now();yield .12+.7*k/cells;}
    }
    notices.push("Summit collapse lowers only the explicitly bounded land samples. Water and settlement records are retained.");
  }else{
    const paths:HydroPoint[]=[],targets:number[]=[];
    let radius=0,smoothing=0,depth=0,lava=false;
    if(op.kind==="river-channel"){
      if(river!.some(p=>sample(p)===null))throw Error("Choose a river segment entirely within this active source; use another saved terrain source for the remaining course.");
      radius=op.widthM/2*(1+op.bankSoftness*2);smoothing=op.smoothing;depth=op.depthM;
      let previous=Infinity;
      for(let s=1;s<river!.length;s++){
        const a=river![s-1],b=river![s],length=distance(a,b,world),steps=Math.max(1,Math.ceil(length/Math.min(sx,sy)*2));
        if(paths.length+steps+1>LIMITS.pathSamples)throw Error("Choose a shorter channel segment; the routing budget is 8,192 native probes.");
        for(let t=s===1?0:1;t<=steps;t++){
          const p={x:regionCanonicalX(a.x+dx(a.x,b.x,world)*t/steps,world),y:a.y+(b.y-a.y)*t/steps},i=sample(p)!;
          if(base[i]>previous+2)throw Error("This accepted route now crosses uphill terrain. Review its saved water course before carving; no uphill channel was forced.");
          previous=base[i];paths.push(p);targets.push(Math.max(seaLevel+1,base[i]-depth*op.strength/100));
          if(base[i]<=seaLevel)break;
        }
      }
      for(let j=1;j<targets.length;j++)targets[j]=Math.min(targets[j],targets[j-1]);
      notices.push("The saved river identity, description, connections and overrides are unchanged. Its source analysis will require review after terrain saves.");
    }else{
      lava=true;radius=op.widthM/2;
      if(op.widthM<Math.max(sx,sy))throw Error("Choose a lava-deposit width at least one native sample wide, or use finer terrain.");
      if(distance(op.source,authored!.operation.centre,world)>authored!.operation.radiusM+authored!.operation.blendM)throw Error("Choose a lava source on the retained volcano footprint.");
      let i=sample(op.source),length=0;const seen=new Set<number>();let reason="step limit";
      for(let step=0;i!==null&&step<op.steps;step++){
        const k=lookup[i];if(k<0){reason="protected land, shoreline or selection boundary";break;}
        if(seen.has(i)){reason="retained sink";break;}seen.add(i);paths.push(position(i));targets.push(base[i]+op.magnitudeM*op.strength/100);
        const next=nearby(i).filter(q=>base[indices[q.k]]<base[i!]).sort((a,b)=>(base[i!]-base[indices[b.k]])/b.length-(base[i!]-base[indices[a.k]])/a.length)[0];
        if(!next){reason="sink or protected boundary";break;}
        length+=next.length;if(length>op.extentM){reason="chosen maximum extent";break;}
        i=indices[next.k];
      }
      if(paths.length<2)throw Error("This lava source is a sink or protected sample. Choose a downhill rim position; flow is never forced uphill.");
      notices.push("Lava follows the accepted pre-eruption gradients and adds a bounded deposit; this is not real-time fluid simulation. Stopped at "+reason+".");
    }
    if(radius>Math.min(sx,sy)*128)throw Error("This influence is wider than the native 128-sample operation bound. Choose a narrower channel/deposit or a coarser eligible source.");
    const target=new Float64Array(cells).fill(lava?-Infinity:Infinity),coverage=new Float32Array(cells);let work=0;
    for(let j=0;j<paths.length;j++){
      const p=paths[j],cx=(world.wrap?((p.x-frame.x)%world.width+world.width)%world.width:p.x-frame.x)/sx,cy=(p.y-frame.y)/sy,
        rx=Math.ceil(radius/sx),ry=Math.ceil(radius/sy),left=Math.floor(cx-rx),right=Math.ceil(cx+rx),top=Math.max(0,Math.floor(cy-ry)),bottom=Math.min(shape.height-1,Math.ceil(cy+ry));
      work+=(right-left+1)*(bottom-top+1);if(work>LIMITS.work)throw Error("Choose a shorter or narrower channel/deposit; its corridor exceeds the bounded visit budget.");
      const bedTarget=!lava&&j>0&&j+1<targets.length?Math.min(targets[j],targets[j]*(1-smoothing)+(targets[j-1]+targets[j+1])/2*smoothing):targets[j];
      for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
        if(counts()){lastYield=performance.now();yield .12+.7*j/paths.length;}
        const i=globalIndex(x,y),k=i<0?-1:lookup[i];if(k<0)continue;
        const r=Math.hypot((x-cx)*sx,(y-cy)*sy)/radius;if(r>=1)continue;
        const weight=(1-r*r)**2;
        coverage[k]=Math.max(coverage[k],weight);
        if(lava)target[k]=Math.max(target[k],bedTarget);else target[k]=Math.min(target[k],bedTarget);
      }
      if(counts()){lastYield=performance.now();yield .12+.7*j/paths.length;}
    }
    for(let k=0;k<cells;k++)if(coverage[k]){
      const value=base[indices[k]];
      bed[k]=lava?value+Math.max(0,target[k]-value)*coverage[k]:value-Math.min(depth*op.strength/100,Math.max(0,value-target[k]))*coverage[k];
    }
  }
  const grid=base.slice();let changed=0,min=Infinity,max=-Infinity,maxLoweringM=0,maxRaisingM=0,removedM3=0,addedM3=0;
  const changedIndices=new Uint32Array(cells),before=new Int16Array(cells),after=new Int16Array(cells);
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  const affectedOrigin=world.wrap?(influence?.x??selection.frame.x):selection.frame.x;
  for(let k=0;k<cells;k++){
    if(!weights[k])continue;
    const i=indices[k],value=Math.round(Math.max(shape.min,Math.min(shape.max,bed[k]))),difference=value-base[i];
    if(!difference)continue;grid[i]=value;changedIndices[changed]=i;before[changed]=base[i];after[changed]=value;changed++;
    maxLoweringM=Math.max(maxLoweringM,-difference);maxRaisingM=Math.max(maxRaisingM,difference);
    if(difference<0)removedM3-=difference*sx*sy;else addedM3+=difference*sx*sy;
    const p=position(i),offset=world.wrap?((p.x-affectedOrigin)%world.width+world.width)%world.width:p.x-affectedOrigin;
    left=Math.min(left,offset);right=Math.max(right,offset);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);
    if(counts()){lastYield=performance.now();yield .82+.13*k/cells;}
  }
  for(let i=0;i<n;i++){min=Math.min(min,grid[i]);max=Math.max(max,grid[i]);if((i&8191)===0&&performance.now()-lastYield>4){lastYield=performance.now();yield .96;}}
  if(protectedCount)notices.push(protectedCount.toLocaleString()+" protected samples were retained exactly.");
  if(waterProtected)notices.push(waterProtected.toLocaleString()+" sea/lake/wetland samples were retained exactly.");
  if(siteProtected)notices.push(siteProtected.toLocaleString()+" settlement-support samples were retained exactly.");
  return {grid,patch:{indices:changedIndices.slice(0,changed),before:before.slice(0,changed),after:after.slice(0,changed)},metrics:{
    changed,minimum:min,maximum:max,maxLoweringM,maxRaisingM,removedM3,addedM3,eligible,protected:protectedCount,waterProtected,siteProtected,
    visited,workingBytes:bytes,affected:changed?{x:regionCanonicalX(affectedOrigin+left,world),y:top,width:Math.min(world.width,Math.max(sx,right-left)),height:Math.max(sy,bottom-top)}:null,notices,
  }};
}

export function prepareAdvancedTerrain(base:Int16Array,shape:TerrainGeometry,op:AdvancedOperation,context:AdvancedTerrainContext,blocked?:Uint8Array,manual?:Uint8Array,progress?:(value:number)=>void){
  const steps=advancedTerrainSteps(base,shape,op,context,blocked,manual);
  for(;;){const next=steps.next();if(next.done){progress?.(1);return next.value;}progress?.(next.value);}
}
export async function prepareAdvancedTerrainAsync(base:Int16Array,shape:TerrainGeometry,op:AdvancedOperation,context:AdvancedTerrainContext,blocked?:Uint8Array,manual?:Uint8Array,progress?:(value:number)=>void,signal?:AbortSignal){
  const steps=advancedTerrainSteps(base,shape,op,context,blocked,manual),started=performance.now();
  for(;;){
    const sliceStarted=performance.now();
    // A resumed generator may yield immediately after its timer pause. Consume
    // those checkpoints inside one work slice instead of paying another pause.
    do{
      if(signal?.aborted)throw new DOMException("Terrain preview cancelled.","AbortError");
      if(performance.now()-started>LIMITS.workerMs)throw Error("This operation exceeded 30 seconds. Choose a smaller area; accepted terrain is intact.");
      const next=steps.next();if(next.done){progress?.(1);return next.value;}
      progress?.(next.value);
    }while(performance.now()-sliceStarted<4);
    await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
}
