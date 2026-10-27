import {hydroSuggestions,type HydroFlow} from "./terrain-hydrology-flow";
import {type HydroAnalysis,type HydroPoint,HYDROLOGY_LIMITS} from "./terrain-hydrology";
import {waterDx} from "./terrain-water-geometry";

function focused(p:HydroPoint,a:HydroAnalysis,f:HydroFlow){const x=f.mesh.world.wrap?((p.x-a.focus.x)%f.mesh.world.width+f.mesh.world.width)%f.mesh.world.width:p.x-a.focus.x;return x>=0&&x<a.focus.width&&p.y>=a.focus.y&&p.y<a.focus.y+a.focus.height;}
/** Select significant headwater branches, then retain their exact downstream
 * receivers. No elevations, receivers or existing accepted records change. */
export function naturalWaterSuggestions(flow:HydroFlow,analysis:HydroAnalysis){
  const {mesh,receiver,area}=flow,n=mesh.count,main=new Int32Array(n).fill(-1),incoming=new Int32Array(n),orders=new Uint16Array(n),maxOrder=new Uint16Array(n),ties=new Uint16Array(n),queue=new Int32Array(n);
  for(let i=0;i<n;i++){const to=receiver[i];if(to<0||area[i]===0)continue;incoming[to]++;if(main[to]<0||area[i]>area[main[to]]||area[i]===area[main[to]]&&i<main[to])main[to]=i;}
  let head=0,tail=0;for(let i=0;i<n;i++)if(!incoming[i])queue[tail++]=i;
  while(head<tail){const i=queue[head++];orders[i]=Math.max(1,maxOrder[i]+(ties[i]>1?1:0));const to=receiver[i];if(to<0)continue;if(orders[i]>maxOrder[to]){maxOrder[to]=orders[i];ties[to]=1;}else if(orders[i]===maxOrder[to])ties[to]++;if(--incoming[to]===0)queue[tail++]=to;}
  const detail=analysis.naturalDetail??"balanced",ratio=detail==="sparse"?.09:detail==="fine"?.015:.045,minimum=analysis.minimumAreaM2,branches:{start:number;end:number;join:number;length:number;area:number;order:number;spacing:number}[]=[];
  for(let i=0;i<n;i++){
    const threshold=Math.max(minimum,mesh.cellArea(i)*6);if(mesh.heights[i]<=flow.seaLevel||area[i]<threshold||main[i]>=0&&area[main[i]]>=threshold||!focused(mesh.point(i),analysis,flow))continue;
    if(branches.length>=16384)throw Error("Too many headwaters for one natural review. Raise the minimum contributing area or choose a smaller geography.");
    let end=i,length=0,spacing=Math.sqrt(mesh.cellArea(i));
    while(receiver[end]>=0){const to=receiver[end],a=mesh.point(end),b=mesh.point(to);length+=Math.hypot(waterDx(a.x,b.x,mesh.world),b.y-a.y);spacing=Math.max(spacing,Math.sqrt(mesh.cellArea(to)));if(main[to]!==end)break;end=to;}
    branches.push({start:i,end,join:receiver[end],length,area:area[end],order:orders[end],spacing});
  }
  branches.sort((a,b)=>(b.join<0?1:0)-(a.join<0?1:0)||b.area-a.area||b.length-a.length||a.start-b.start);
  const selected=new Uint8Array(n),joins:HydroPoint[]=[],limits=detail==="sparse"?24:detail==="fine"?160:72;let accepted=0;
  for(const b of branches){
    const receiverArea=b.join<0?b.area:area[b.join],significance=b.area/Math.max(1,receiverArea),isTrunk=b.join<0;
    if(accepted&&(!isTrunk&&(significance<ratio||b.order<2&&detail!=="fine"&&significance<.15)||b.length<b.spacing*(detail==="fine"?2:4)))continue;
    const junction=mesh.point(b.join<0?b.end:b.join),separation=Math.max(b.spacing*2,Math.sqrt(receiverArea)*(detail==="sparse"?.1:detail==="fine"?.025:.055));
    if(!isTrunk&&joins.some(p=>Math.hypot(waterDx(p.x,junction.x,mesh.world),p.y-junction.y)<separation))continue;
    if(isTrunk&&accepted&&b.area<minimum*4)continue;
    let i=b.start;while(i>=0&&!selected[i]){selected[i]=1;i=receiver[i];}joins.push(junction);if(++accepted>=limits)break;
  }
  const layer=hydroSuggestions(flow,analysis,undefined,selected);
  if(layer.edges.length>HYDROLOGY_LIMITS.edges)throw Error("Natural selection exceeded the existing channel budget.");
  return {layer,diagnostics:{candidateBranches:branches.length,retainedHeadwaters:accepted,selectedCells:selected.reduce((sum,v)=>sum+v,0),bytes:main.byteLength+incoming.byteLength+orders.byteLength+maxOrder.byteLength+ties.byteLength+queue.byteLength+selected.byteLength}};
}
