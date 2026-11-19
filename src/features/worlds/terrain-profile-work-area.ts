import type {TerrainFrame} from "./terrain-refinement";

/** Adjacent work areas share no samples. The original profile's final closed
 * boundary is retained, except the duplicate east endpoint of a wrapped World. */
export function profileWorkArea(selection:TerrainFrame,area:TerrainFrame,world:{width:number;height:number;wrap:boolean}) {
 const canonical=(x:number)=>world.wrap?((x%world.width)+world.width)%world.width:x,
  closedEast=(!world.wrap||selection.width<world.width)&&Math.abs(canonical(area.x+area.width)-canonical(selection.x+selection.width))<1e-6,
  closedSouth=Math.abs(area.y+area.height-selection.y-selection.height)<1e-6;
 return {
  containsX:(x:number)=>{const offset=world.wrap?((x-area.x)%world.width+world.width)%world.width:x-area.x;return offset>=0&&(offset<area.width||closedEast&&offset<=area.width+1e-6);},
  containsY:(y:number)=>y>=area.y&&(y<area.y+area.height||closedSouth&&y<=area.y+area.height+1e-6),
 };
}
