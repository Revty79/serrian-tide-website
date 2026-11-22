import type {TerrainGeometry} from "./terrain";
import type {TerrainFrame} from "./terrain-refinement";
import type {HydroLayer,HydroPoint} from "./terrain-hydrology";
import {insideWaterRings,waterBounds,nearestWaterShore} from "./terrain-water-geometry";
import {regionAreaContainsPoint,regionCanonicalX,validateRegionFootprint} from "./terrain-region-geometry";
import {ADVANCED_TERRAIN_LIMITS as LIMITS,advancedOperationSchema,advancedTerrainCellBytes,advancedTerrainSampleSteps,advancedTerrainShoreSteps,type AdvancedOperation,type VolcanoOperation} from "./terrain-advanced-spec";
import {prepareLandformProfile} from "./terrain-landform-profile";
import {profileWorkArea} from "./terrain-profile-work-area";

export type AuthoredVolcano={id:string;revision:number;sourceId:string|null;operation:VolcanoOperation};
export type AdvancedTerrainContext={
  frame:TerrainFrame;world:{width:number;height:number;wrap:boolean};seaLevel:number;
  water:HydroLayer;sites:{id:string;x:number;y:number}[];volcanoes:AuthoredVolcano[];
  /** Internal derived workspace only; never accepted from operation provenance. */
  nativeLattice?:{frame:TerrainFrame;width:number;height:number;x:number;y:number};
  /** Internal native shared-relief work area. Its east/south edges are open. */
  processingArea?:TerrainFrame;
  /** Internal accepted cross-source shoreline supports; never authored input. */
  shoreSupports?:Uint8Array;
};
export type AdvancedMetrics={
  changed:number;minimum:number;maximum:number;maxLoweringM:number;maxRaisingM:number;
  removedM3:number;addedM3:number;eligible:number;protected:number;waterProtected:number;siteProtected:number;
  visited:number;workingBytes:number;affected:TerrainFrame|null;notices:string[];
  geometryWork?:number;
  bankSupportConflicts?:number;maxBankSupportStepM?:number;
};
export type AdvancedResult={grid:Int16Array;patch:{indices:Uint32Array;before:Int16Array;after:Int16Array};metrics:AdvancedMetrics;window?:import("./terrain-profile-window").ProfileWindow};
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
  if(base.length!==n||n>16777216||blocked&&blocked.length!==n||manual&&manual.length!==n||context.shoreSupports&&context.shoreSupports.length!==n)throw Error("The accepted terrain buffers do not match this bounded source.");
  const {frame,world,seaLevel,nativeLattice,processingArea}=context,selection=op.selection,
    sx=nativeLattice?nativeLattice.frame.width/nativeLattice.width:frame.width/shape.width,
    sy=nativeLattice?nativeLattice.frame.height/nativeLattice.height:frame.height/shape.height,
    nativeX=(x:number)=>nativeLattice?nativeLattice.frame.x+(nativeLattice.x+x)*sx:frame.x+x*sx,
    nativeY=(y:number)=>nativeLattice?nativeLattice.frame.y+(nativeLattice.y+y)*sy:frame.y+y*sy;
  if(![sx,sy,world.width,world.height].every(v=>Number.isFinite(v)&&v>0)||!Number.isFinite(seaLevel))throw Error("The accepted physical terrain frame is invalid.");
  if(selection.footprint)validateRegionFootprint(selection.footprint,world,selection.frame);
  if(selection.frame.x>=world.width||selection.frame.width>world.width||selection.frame.y+selection.frame.height>world.height+1e-5||!world.wrap&&selection.frame.x+selection.frame.width>world.width+1e-5)throw Error("Keep the selection inside the World.");
  const checkedPoint=op.kind==="volcano"?op.centre:op.kind==="eruption"?op.source:undefined;
  if(checkedPoint&&(checkedPoint.x>=world.width||checkedPoint.y>=world.height))throw Error("Choose a canonical location inside this World.");
  const notices:string[]=[],river=op.kind==="river-channel"?advancedRiverPath(op,context):undefined;
  const profile=op.kind==="landform-profile"?prepareLandformProfile(op,shape,context):undefined;
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
  const xs:Array<{x:number;offset:number}>=[],ys:number[]=[],workArea=processingArea?profileWorkArea(selection.frame,processingArea,world):undefined;
  for(let x=0;x<shape.width;x++){
    const wx=regionCanonicalX(nativeX(x),world),p={x:wx,y:selection.frame.y};
    if(!rectContains({...selection.frame,y:0,height:world.height},p,world))continue;
    if(workArea&&!workArea.containsX(wx))continue;
    if(influence&&!rectContains({...influence,y:0,height:world.height},p,world))continue;
    xs.push({x,offset:world.wrap?((wx-selection.frame.x)%world.width+world.width)%world.width:wx-selection.frame.x});
  }
  xs.sort((a,b)=>a.offset-b.offset);
  for(let y=0;y<shape.height;y++){const wy=nativeY(y);if(wy>=selection.frame.y-1e-6&&wy<=selection.frame.y+selection.frame.height+1e-6&&(!workArea||workArea.containsY(wy))&&(!influence||wy>=influence.y&&wy<=influence.y+influence.height))ys.push(y);}
  const cells=xs.length*ys.length;
  if(!cells)throw Error("This selection has no native samples in the active terrain source.");
  if(cells>LIMITS.cells||advancedTerrainSampleSteps(op,cells)>LIMITS.work)throw Error("Choose a smaller area or fewer operation steps or profile points. The limit is 262,144 samples and 8,388,608 sample-steps; fidelity is unchanged.");
  // Retain the previous source/selected-work reserves, less the full-source
  // Int32 lookup and Uint8 settlement mask that are no longer allocated.
  // Axis ranks cover wrapped/non-contiguous columns; protection stays local.
  const bytes=n*7+cells*advancedTerrainCellBytes(op)+(shape.width+shape.height)*Int32Array.BYTES_PER_ELEMENT;
  if(bytes>LIMITS.workingBytes)throw Error("This operation exceeds its 32 MiB numerical working-buffer budget. Choose a smaller area.");
  const columns=new Int32Array(shape.width).fill(-1),rows=new Int32Array(shape.height).fill(-1),
    indices=new Uint32Array(cells),weights=new Float32Array(cells),eligibility=new Uint8Array(cells),
    bed=new Float64Array(cells),delta=new Float64Array(cells),removed=new Float64Array(cells);
  xs.forEach((value,index)=>{columns[value.x]=index;});ys.forEach((value,index)=>{rows[value]=index;});
  const windowIndex=(i:number)=>{const x=columns[i%shape.width],y=rows[Math.floor(i/shape.width)];return x<0||y<0?-1:y*xs.length+x;};
  const eligibleIndex=(i:number)=>{const k=windowIndex(i);return k>=0&&eligibility[k]?k:-1;};
  const shoreReceivers=op.kind==="erosion"&&op.preserveShoreline?new Uint8Array(cells):undefined;
  const fixedNativeShore=op.kind!=="erosion"&&op.kind!=="landform-profile"&&op.preserveShoreline,
    shoreGuardWork=advancedTerrainShoreSteps(op,cells);
  let bankFloor=op.kind==="erosion"&&op.bankReinforcementM!==undefined?new Float64Array(cells).fill(-Infinity):undefined,
    nextBankFloor=bankFloor?new Float64Array(cells).fill(-Infinity):undefined;
  let protectedCount=0,waterProtected=0,siteProtected=0,eligible=0,visited=0,geometryWork=0,bankSupportConflicts=0,maxBankSupportStepM=0,lastYield=performance.now();
  const wet=[...(context.water.lakes??[]).map(l=>({rings:l.rings,bounds:waterBounds(l.rings.flat(),world)})),
    ...(context.water.features??[]).filter(f=>f.kind==="wetland").map(f=>({rings:f.rings,bounds:waterBounds(f.rings.flat(),world)}))];
  const position=(i:number)=>({x:regionCanonicalX(nativeX(i%shape.width),world),y:nativeY(Math.floor(i/shape.width))});
  if(context.sites.length>8192)throw Error("This source exceeds 8,192 settlement supports. Choose a finer source for a bounded operation.");
  const siteMask=new Uint8Array(cells);
  for(const site of context.sites){
    const sourceFrame=nativeLattice?.frame??frame,sourceWidth=nativeLattice?.width??shape.width,sourceHeight=nativeLattice?.height??shape.height,
      gx=(world.wrap?((site.x-sourceFrame.x)%world.width+world.width)%world.width:site.x-sourceFrame.x)/sx,gy=(site.y-sourceFrame.y)/sy;
    if(gx<0||gx>=sourceWidth||gy<0||gy>=sourceHeight)continue;
    const x=(shape.wrap?Math.round(gx)%sourceWidth:Math.min(sourceWidth-1,Math.round(gx)))-(nativeLattice?.x??0),y=Math.min(sourceHeight-1,Math.round(gy))-(nativeLattice?.y??0);
    for(let ey=-1;ey<=1;ey++)for(let ex=-1;ex<=1;ex++){
      const xx=shape.wrap?(x+ex+shape.width)%shape.width:x+ex,yy=y+ey;
      if(xx>=0&&xx<shape.width&&yy>=0&&yy<shape.height){const k=windowIndex(yy*shape.width+xx);if(k>=0)siteMask[k]=1;}
    }
  }
  const counts=()=>{visited++;return (visited&255)===0&&performance.now()-lastYield>4;};
  for(let k=0;k<cells;k++){
    if(counts()){lastYield=performance.now();yield .12*k/cells;}
    const x=xs[k%xs.length].x,y=ys[Math.floor(k/xs.length)],i=y*shape.width+x,p=position(i);indices[k]=i;bed[k]=base[i];
    if(shoreReceivers&&base[i]>seaLevel){
      let shore=!!context.shoreSupports?.[i];
      for(let ey=-1;ey<=1&&!shore;ey++)for(let ex=-1;ex<=1;ex++){
        const xx=shape.wrap?(x+ex+shape.width)%shape.width:x+ex,yy=y+ey;
        if(xx>=0&&xx<shape.width&&yy>=0&&yy<shape.height&&base[yy*shape.width+xx]<=seaLevel){shore=true;break;}
      }
      if(shore){
        let receiver=!siteMask[k]&&(!blocked?.[i]||!!context.shoreSupports?.[i])&&!(op.preserveManual&&manual?.[i]);
        if(receiver&&selection.footprint){
          geometryWork+=selection.footprint.parts.reduce((n,r)=>n+r.length,0);
          if(geometryWork>LIMITS.work)throw Error("Simplify the selected outline or choose a smaller operation area.");
          receiver=regionAreaContainsPoint(selection,p,world);
        }
        for(const water of wet)if(receiver&&rectContains(water.bounds,p,world)){
          geometryWork+=water.rings.reduce((n,r)=>n+r.length,0);
          if(geometryWork>LIMITS.work)throw Error("This area contains too much shoreline detail for one operation. Select a smaller area.");
          if(insideWaterRings(p,water.rings,world))receiver=false;
        }
        if(receiver)shoreReceivers[k]=1;
        waterProtected++;continue;
      }
    }
    if(fixedNativeShore&&base[i]>seaLevel){
      let shore=!!context.shoreSupports?.[i];
      for(let ey=-1;ey<=1&&!shore;ey++)for(let ex=-1;ex<=1;ex++){
        if(!ex&&!ey)continue;
        if(counts()){lastYield=performance.now();yield .12*k/cells;}
        const xx=shape.wrap?(x+ex+shape.width)%shape.width:x+ex,yy=y+ey;
        if(xx>=0&&xx<shape.width&&yy>=0&&yy<shape.height&&base[yy*shape.width+xx]<=seaLevel){shore=true;break;}
      }
      if(shore){waterProtected++;continue;}
    }
    if(blocked?.[i]||op.preserveManual&&manual?.[i]){protectedCount++;continue;}
    if(base[i]<=seaLevel){waterProtected++;continue;}
    if(profile){
      // Preserve all interpolation supports of the accepted sea boundary.
      let shore=false;
      for(let ey=-1;ey<=1&&!shore;ey++)for(let ex=-1;ex<=1;ex++){
        const xx=shape.wrap?(x+ex+shape.width)%shape.width:x+ex,yy=y+ey;
        if(xx>=0&&xx<shape.width&&yy>=0&&yy<shape.height&&base[yy*shape.width+xx]<=seaLevel){shore=true;break;}
      }
      if(shore){waterProtected++;continue;}
    }
    if(selection.footprint){geometryWork+=selection.footprint.parts.reduce((n,r)=>n+r.length,0);if(geometryWork>LIMITS.work)throw Error("Simplify the selected outline or choose a smaller operation area.");if(!regionAreaContainsPoint(selection,p,world))continue;}
    let underwater=false;
    for(const water of wet)if(rectContains(water.bounds,p,world)){
      geometryWork+=water.rings.reduce((n,r)=>n+r.length,0);
      if(geometryWork>LIMITS.work)throw Error("This area contains too much shoreline detail for one operation. Select a smaller area.");
      if(insideWaterRings(p,water.rings,world)){underwater=true;break;}
    }
    if(underwater){waterProtected++;continue;}
    if(siteMask[k]){siteProtected++;continue;}
    const a=selection.frame,px=world.wrap?((p.x-a.x)%world.width+world.width)%world.width:p.x-a.x,
      feather=op.kind==="erosion"||op.kind==="landform-profile"?op.featherM:0;
    let edge=Math.min(px,a.width-px,p.y-a.y,a.y+a.height-p.y);
    if(feather&&selection.footprint){
      geometryWork+=selection.footprint.parts.reduce((n,r)=>n+r.length,0);
      if(geometryWork>LIMITS.work)throw Error("Simplify the selected outline or choose a smaller operation area.");
      edge=Math.min(edge,nearestWaterShore(p,selection.footprint.parts,world).distance);
    }
    const weight=feather?smooth(Math.max(0,edge)/feather):1;
    // Preserve admission before Float32 rounding, as the original lookup did.
    if(weight>0){weights[k]=weight;eligibility[k]=1;eligible++;}
    if(counts()){lastYield=performance.now();yield .12*k/cells;}
  }
  const globalIndex=(x:number,y:number)=>y<0||y>=shape.height||!shape.wrap&&(x<0||x>=shape.width)?-1:y*shape.width+((x%shape.width+shape.width)%shape.width);
  const nearby=(i:number)=>{const x=i%shape.width,y=Math.floor(i/shape.width),out:Array<{k:number;east:number;south:number;length:number}>=[];
    for(let ey=-1;ey<=1;ey++)for(let ex=-1;ex<=1;ex++){if(!ex&&!ey)continue;const j=globalIndex(x+ex,y+ey),k=j<0?-1:eligibleIndex(j);if(k>=0)out.push({k,east:ex,south:ey,length:Math.hypot(ex*sx,ey*sy)});}return out;};
  const sample=(p:HydroPoint)=>{
    const sourceFrame=nativeLattice?.frame??frame,sourceWidth=nativeLattice?.width??shape.width,sourceHeight=nativeLattice?.height??shape.height,
      gx=(world.wrap?((p.x-sourceFrame.x)%world.width+world.width)%world.width:p.x-sourceFrame.x)/sx,gy=(p.y-sourceFrame.y)/sy;
    if(gx<0||gx>=sourceWidth||gy<0||gy>=sourceHeight)return null;
    const x=(shape.wrap?Math.round(gx)%sourceWidth:Math.min(sourceWidth-1,Math.round(gx)))-(nativeLattice?.x??0),
      y=Math.min(sourceHeight-1,Math.round(gy))-(nativeLattice?.y??0);
    if(x<0||x>=shape.width||y<0||y>=shape.height)throw Error("The numerical workspace omits a required accepted source sample.");
    return y*shape.width+x;
  };
  if(op.kind==="landform-profile"){
    for(let k=0;k<cells;k++)if(weights[k]){
      const original=base[indices[k]],p=profile!(position(indices[k]));
      if(op.mode==="upper-envelope"){
        // The profile is a ceiling over the complete selected area. Outside its
        // footprint the ceiling is the explicit base, rather than a no-op.
        // Lower accepted terrain stays intact; no extra grid or mask is needed.
        const floor=op.envelopeBaseM!,ceiling=floor+(p.target-floor)*p.weight,target=Math.min(original,ceiling);
        bed[k]=Math.max(seaLevel+1,Math.min(shape.max,original+(target-original)*weights[k]*op.strength/100));
      }else{
        const target=op.mode==="minimum"?Math.max(original,p.target):op.mode==="maximum"?Math.min(original,p.target):p.target;
        bed[k]=Math.max(seaLevel+1,Math.min(shape.max,original+(target-original)*p.weight*weights[k]*op.strength/100));
      }
      if(counts()){lastYield=performance.now();yield .12+.7*k/cells;}
    }
    notices.push(op.mode==="upper-envelope"?"The envelope only lowers selected unprotected land. Its heights are upper bounds, not inserted summits. Width and end blends shape the ceiling down to the explicit base; outside the path the base still applies. Strength and selection feather blend this change. Review the whole selected area, including standing-water banks.":"Profile heights and widths blend smoothly along the physical path. Shape mode may raise and lower existing land; bound modes retain heights beyond their bound. Intersections do not stack changes.");
    notices.push("Sea, its neighboring shoreline supports, saved lake and wetland beds, finer terrain and settlement supports remain exact. End and selection blends act inside the chosen footprint; inspect its joins before acceptance.");
  }else if(op.kind==="erosion"){
    const angle=op.direction*Math.PI/180,repose=Math.tan(op.reposeDegrees*Math.PI/180),directions=[];
    for(let east=-1;east<=1;east++)for(let south=-1;south<=1;south++)if(east||south){const length=Math.hypot(east*sx,south*sy);directions.push({east,south,length,cosine:(east*sx*Math.sin(angle)-south*sy*Math.cos(angle))/length});}
    // Reuse eight offsets; no neighbour arrays or objects are allocated per sample-step.
    for(let step=0;step<op.iterations;step++){
      delta.fill(0);
      for(let k=0;k<cells;k++){
        if(!weights[k])continue;
        let best=-1,bestScore=-Infinity,bestDrop=0,bestFixed=false;
        let requiredBank=bankFloor?.[k]??-Infinity;
        const x=indices[k]%shape.width,y=Math.floor(indices[k]/shape.width);
        for(const q of directions){
          const i=globalIndex(x+q.east,y+q.south),normal=i<0?-1:eligibleIndex(i),fixed=normal<0&&i>=0&&!op.deposition?windowIndex(i):-1,
            isFixed=fixed>=0&&!!shoreReceivers?.[fixed],other=normal>=0?normal:isFixed?fixed:-1;
          // Carry a fixed bank's crown into its first editable land supports;
          // taper farther reinforcement by conservative whole-metre talus steps.
          if(bankFloor&&i>=0&&base[i]>seaLevel)requiredBank=Math.max(requiredBank,normal>=0?bankFloor[normal]-Math.floor(q.length*repose):base[i]);
          if(other<0)continue;
          // One metre of headroom prevents final rounding from creating a new
          // excessive step in the explicitly reinforced transport result.
          const drop=bed[k]-bed[other],excess=drop-(op.model==="thermal"?bankFloor?Math.max(0,Math.floor(q.length*repose)-1):q.length*repose:0);
          if(excess<=0)continue;
          const score=excess/q.length*(1+op.directionInfluence*q.cosine*.95);
          if(score>bestScore){best=other;bestScore=score;bestDrop=excess;bestFixed=isFixed;}
        }
        let bankMinimum=-Infinity;
        if(bankFloor){
          nextBankFloor![k]=requiredBank;
          if(Number.isFinite(requiredBank)){
            const original=base[indices[k]];
            bankMinimum=Math.ceil(original+(requiredBank-original)*weights[k]*op.strength/100);
            if(bankMinimum-original>op.bankReinforcementM!)throw Error("The bank reinforcement exceeds its chosen maximum. Increase that limit deliberately or revise the selected area; saved terrain is unchanged.");
          }
        }
        if(best>=0){
          const transport=Math.max(0,Math.min(bestDrop*.125*(op.outflowRate??1),op.maxDepthM/8,op.maxDepthM-removed[k]))*
            op.strength/100*(bestFixed?weights[k]:Math.min(weights[k],weights[best]));
          const amount=bankFloor?Math.min(transport,Math.max(0,bed[k]-bankMinimum)):transport;
          delta[k]-=amount;removed[k]+=amount;if(op.deposition)delta[best]+=amount;
        }
        if(counts()){lastYield=performance.now();yield .12+.7*(step+k/cells)/op.iterations;}
      }
      if(bankFloor){
        for(let k=0;k<cells;k++){
          if(weights[k]){
            const floor=Number.isFinite(nextBankFloor![k])?Math.ceil(base[indices[k]]+(nextBankFloor![k]-base[indices[k]])*weights[k]*op.strength/100):-Infinity;
            bed[k]=Math.max(seaLevel+1,Math.min(shape.max,Math.max(floor,bed[k]+delta[k])));
          }
          // Applying the same charged sample-step must also remain cooperative.
          if((k&255)===0&&performance.now()-lastYield>4){lastYield=performance.now();yield .12+.7*(step+1)/op.iterations;}
        }
        [bankFloor,nextBankFloor]=[nextBankFloor!,bankFloor];
      }else for(let k=0;k<cells;k++)if(weights[k])bed[k]=Math.max(seaLevel+1,Math.min(shape.max,bed[k]+delta[k]));
    }
    if(bankFloor){
      // Refuse a partly reinforced join rather than accepting a new or steeper
      // dry step. The eight-neighbour audit is charged in the original budget.
      for(let k=0;k<cells;k++)if(weights[k]){
        const i=indices[k],x=i%shape.width,y=Math.floor(i/shape.width),value=Math.round(bed[k]);
        for(const q of directions){
          if(counts()){lastYield=performance.now();yield .84+.04*k/cells;}
          const j=globalIndex(x+q.east,y+q.south);if(j<0||base[j]<=seaLevel)continue;
          const other=eligibleIndex(j),next=other>=0?Math.round(bed[other]):base[j],allowed=Math.max(Math.abs(base[i]-base[j]),Math.floor(q.length*repose));
          if(Math.abs(value-next)>allowed){
            if(other<0&&value>next&&value>base[i]){
              // Conflicting fixed heights can make a gentle bank impossible.
              // Keep them exact and expose the raised shoulder's sharp join.
              bankSupportConflicts++;maxBankSupportStepM=Math.max(maxBankSupportStepM,value-next);
            }else throw Error("Bank reinforcement cannot finish a safe join at these settings. Review a larger adjoining area, more duration or the selection blend; saved terrain is unchanged.");
          }
        }
      }
      notices.push("Bank reinforcement may raise eligible land beside fixed protected ground and selection boundaries. Added material is limited by the explicit maximum and blended by strength and selection feather; it is not conserved eroded material. Saved supports remain exact. New or steeper joins between editable samples are refused.");
      if(bankSupportConflicts)notices.push(`${bankSupportConflicts.toLocaleString()} reinforced supports meet lower fixed ground with sharp steps up to ${maxBankSupportStepM} m. Conflicting protected heights are unchanged; inspect these bank joins before acceptance.`);
    }
    notices.push(op.model==="thermal"?"Stylized downhill talus transport above the chosen repose angle; this is not a geological forecast.":"Stylized directional runoff detaches material toward the steepest weighted downhill neighbour; it is not a hydraulic simulation.");
    notices.push(op.deposition?"Transport retains material inside eligible samples before metre rounding and elevation bounds. Reported cut/fill volumes include that quantization.":"Deposition is off: eroded material leaves the model. Material conservation is not claimed.");
    if(op.preserveShoreline)notices.push("Saved sea and eight-neighbour shoreline support heights remain exact. With deposition off, shoreline land may receive outflow without changing its height; protected water, sites and finer terrain are not transport receivers.");
    if((op.outflowRate??1)>1)notices.push(`Outflow response is ${op.outflowRate} times the original response. The existing per-step and total wear, sea-level and numerical work limits remain in force.`);
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
        const k=eligibleIndex(i);if(k<0){reason="protected land, shoreline or selection boundary";break;}
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
      const p=paths[j],sourceFrame=nativeLattice?.frame??frame,ox=nativeLattice?.x??0,oy=nativeLattice?.y??0,
        cx=(world.wrap?((p.x-sourceFrame.x)%world.width+world.width)%world.width:p.x-sourceFrame.x)/sx,cy=(p.y-sourceFrame.y)/sy,
        rx=Math.ceil(radius/sx),ry=Math.ceil(radius/sy),left=Math.floor(cx-rx)-ox,right=Math.ceil(cx+rx)-ox,top=Math.max(0,Math.floor(cy-ry)-oy),bottom=Math.min(shape.height-1,Math.ceil(cy+ry)-oy);
      work+=(right-left+1)*(bottom-top+1);if(work+shoreGuardWork>LIMITS.work)throw Error("Choose a shorter or narrower channel/deposit; its corridor exceeds the bounded visit budget.");
      const bedTarget=!lava&&j>0&&j+1<targets.length?Math.min(targets[j],targets[j]*(1-smoothing)+(targets[j-1]+targets[j+1])/2*smoothing):targets[j];
      for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
        if(counts()){lastYield=performance.now();yield .12+.7*j/paths.length;}
        const i=globalIndex(x,y),k=i<0?-1:eligibleIndex(i);if(k<0)continue;
        const r=Math.hypot((x+ox-cx)*sx,(y+oy-cy)*sy)/radius;if(r>=1)continue;
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
    if(counts()){lastYield=performance.now();yield bankFloor ? .89+.06*k/cells : .82+.13*k/cells;}
  }
  for(let i=0;i<n;i++){min=Math.min(min,grid[i]);max=Math.max(max,grid[i]);if((i&8191)===0&&performance.now()-lastYield>4){lastYield=performance.now();yield .96;}}
  if(profile){
    let beforeStep=0,afterStep=0,beforeSlope=0,afterSlope=0;
    for(let k=0;k<changed;k++){
      const i=changedIndices[k],x=i%shape.width,y=Math.floor(i/shape.width);
      for(let ey=-1;ey<=1;ey++)for(let ex=-1;ex<=1;ex++){
        if(!ex&&!ey)continue;const j=globalIndex(x+ex,y+ey);if(j<0||base[j]<=seaLevel)continue;
        const previous=Math.abs(base[i]-base[j]),next=Math.abs(grid[i]-grid[j]),run=Math.hypot(ex*sx,ey*sy);
        beforeStep=Math.max(beforeStep,previous);afterStep=Math.max(afterStep,next);
        beforeSlope=Math.max(beforeSlope,Math.atan(previous/run)*180/Math.PI);afterSlope=Math.max(afterSlope,Math.atan(next/run)*180/Math.PI);
      }
      if(counts()){lastYield=performance.now();yield .97;}
    }
    notices.push(`Adjacent land-sample review (including retained lake beds): maximum step ${beforeStep} → ${afterStep} m; steepest planar slope ${beforeSlope.toFixed(2)}° → ${afterSlope.toFixed(2)}°. These are diagnostics, not acceptance thresholds.`);
  }
  if(protectedCount)notices.push(protectedCount.toLocaleString()+" protected samples were retained exactly.");
  if(waterProtected)notices.push(waterProtected.toLocaleString()+" sea/lake/wetland samples were retained exactly.");
  if(siteProtected)notices.push(siteProtected.toLocaleString()+" settlement-support samples were retained exactly.");
  if(fixedNativeShore)notices.push("Saved sea and eight-neighbour shoreline support heights stay exact. Inspect the adjoining land slopes; this guard does not automatically reshape a coastal bank.");
  return {grid,patch:{indices:changedIndices.slice(0,changed),before:before.slice(0,changed),after:after.slice(0,changed)},metrics:{
    changed,minimum:min,maximum:max,maxLoweringM,maxRaisingM,removedM3,addedM3,eligible,protected:protectedCount,waterProtected,siteProtected,
    visited,workingBytes:bytes,geometryWork,...bankFloor?{bankSupportConflicts,maxBankSupportStepM}:{},affected:changed?{x:regionCanonicalX(affectedOrigin+left,world),y:top,width:Math.min(world.width,Math.max(sx,right-left)),height:Math.max(sy,bottom-top)}:null,notices,
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
