import {geometryParts,type Coordinate,type SourceGeometry,type SpatialReference} from "./geographic";
import {SPHERICAL_SOURCE_EPSILON} from "./geographic-projection";

/** Display-only outlines: retain true rings/holes, omit paired wrapping cuts. */
export function sourceBoundaryParts(geometry:SourceGeometry,reference:SpatialReference):SourceGeometry[]{
  const parts=geometryParts(geometry),seams:{low:number;high:number;side:number}[]=[];
  const seam=(a:Coordinate,b:Coordinate)=>{
    if(reference.kind!=="sphere"||Math.abs(Math.abs(a[0])-180)>SPHERICAL_SOURCE_EPSILON||Math.abs(Math.abs(b[0])-180)>SPHERICAL_SOURCE_EPSILON||Math.sign(a[0])!==Math.sign(b[0]))return null;
    return {low:Math.min(a[1],b[1]),high:Math.max(a[1],b[1]),side:Math.sign(a[0])};
  };
  for(const part of parts)if(part.type==="Polygon")for(const ring of part.coordinates)for(let i=1;i<ring.length;i++){const cut=seam(ring[i-1],ring[i]);if(cut)seams.push(cut);}
  const same=(a:Coordinate,b:Coordinate)=>a[0]===b[0]&&a[1]===b[1];
  function fragments(a:Coordinate,b:Coordinate):[Coordinate,Coordinate][]{
    if(reference.kind==="sphere"&&Math.abs(a[1])>=90-SPHERICAL_SOURCE_EPSILON&&a[1]===b[1])return [];
    const edge=seam(a,b);if(!edge)return [[a,b]];
    // Source distributions can split one side into several edges, or retain
    // slightly different seam endpoints. Cancel only proven overlapping cuts;
    // retain unmatched source portions instead of inventing a coastline.
    const opposite=seams.filter(s=>s.side!==edge.side&&Math.min(s.high,edge.high)-Math.max(s.low,edge.low)>SPHERICAL_SOURCE_EPSILON);
    if(!opposite.length)return [[a,b]];
    const cuts=[...new Set([edge.low,edge.high,...opposite.flatMap(s=>[Math.max(s.low,edge.low),Math.min(s.high,edge.high)])])].sort((a,b)=>a-b),result:[Coordinate,Coordinate][]=[];
    for(let i=1;i<cuts.length;i++){const middle=(cuts[i-1]+cuts[i])/2;if(opposite.some(s=>middle>=s.low&&middle<=s.high))continue;const low:Coordinate=[a[0],cuts[i-1]],high:Coordinate=[a[0],cuts[i]];result.push(a[1]<b[1]?[low,high]:[high,low]);}
    return a[1]<b[1]?result:result.reverse();
  }
  return parts.map(part=>{
    if(part.type!=="Polygon")return part;const lines:Coordinate[][]=[];
    for(const ring of part.coordinates){let active:Coordinate[]=[];const flush=()=>{if(active.length>=2)lines.push(active);active=[];};for(let i=1;i<ring.length;i++){
      const pieces=fragments(ring[i-1],ring[i]);if(!pieces.length){flush();continue;}
      for(const [a,b] of pieces){if(active.length&&!same(active.at(-1)!,a))flush();if(!active.length)active.push([...a]);active.push([...b]);}
      if(!same(pieces.at(-1)![1],ring[i]))flush();
    }flush();}
    return lines.length===1?{type:"LineString",coordinates:lines[0]}:lines.length?{type:"MultiLineString",coordinates:lines}:part;
  });
}
