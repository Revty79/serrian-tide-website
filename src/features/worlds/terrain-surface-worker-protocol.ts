import type {TerrainGeometry} from "./terrain";
import type {RefinementMeta,TerrainFrame} from "./terrain-refinement";
import type {MaterialStroke,TerrainMaterials} from "./terrain-materials";
export type SurfaceWorkerSource={root:Int16Array;world:TerrainGeometry;plans:{meta:RefinementMeta;lod:number;keys:number[]}[];tiles:{id:string;revision:number;lod:number;key:number;samples:Int16Array}[];active?:{meta:RefinementMeta;grid:Int16Array;shape:TerrainGeometry};preview?:{meta:RefinementMeta;grid:Int16Array;shape:TerrainGeometry}};
export type SurfaceWorkerRequest=
 |{type:"source";source:SurfaceWorkerSource;profile:boolean}
 |{type:"retry"}
 |{type:"paint";key:string;frame:TerrainFrame;resolution:number;height:number;step:number;originX:number;originY:number;pixelX:number;pixelY:number;sea:number;relief:number;layer:Pick<TerrainMaterials,"visible"|"opacity"|"automatic">;strokes:MaterialStroke[];fine:boolean};
export type SurfaceWorkerReply=
 |{type:"assets";state:"ready"|"error";bytes:number}
 |{type:"image";key:string;width:number;height:number;pixels:ArrayBuffer;ms:number;profile:unknown}
 |{type:"failed";message:string};
