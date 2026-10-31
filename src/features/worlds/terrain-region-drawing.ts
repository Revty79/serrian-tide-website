import type {RegionPoint} from "./terrain-region-geometry";
export type RegionOutlinePart={points:RegionPoint[];closed:boolean};
export type RegionOutlineDrawing={editable?:boolean;method:"freehand"|"points";parts:RegionOutlinePart[];activePart:number;operation:"append"|"move"|"insert";vertex:number;onPick:(point:RegionPoint,tolerance:number)=>void;onTrace:(points:RegionPoint[],phase:"start"|"update"|"finish"|"cancel")=>void};
