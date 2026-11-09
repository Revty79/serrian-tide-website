import type {TerrainPathPoint} from "./terrain-operations";

/** Atomic coordinate entry. Invalid text must never partially replace a draft. */
export function parseTerrainCoordinates(text:string,width:number,height:number,limit=256,boundary=false):TerrainPathPoint[]{
 const lines=text.trim().split(/\r?\n/).filter(line=>line.trim());
 if(!text.trim()||lines.length>limit)throw Error(`Enter from 1 to ${limit} coordinate pairs, one column, row pair per line.`);
 return lines.map((line,index)=>{
  const values=line.trim().split(/\s*,\s*|\s+/);
  if(values.length!==2||values.some(v=>!v.trim()||!Number.isFinite(Number(v))))throw Error(`Check coordinate pair ${index+1}. Use two finite numbers.`);
  const [x,y]=values.map(Number);
  if(x<0||y<0||(boundary?x>width||y>height:x>=width||y>=height))throw Error(`Coordinate pair ${index+1} is outside the selected source.`);
  return {x,y};
 });
}
