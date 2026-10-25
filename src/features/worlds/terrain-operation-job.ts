import type {TerrainGeometry} from "./terrain";
import type {TerrainOperation} from "./terrain-operations";
export type TerrainOperationJob={base:ArrayBuffer;blocked?:ArrayBuffer;shape:TerrainGeometry;operation:TerrainOperation};
export type TerrainOperationReply={type:"progress";progress:number}|{type:"error";message:string}|{type:"ready";grid:ArrayBuffer;indices:ArrayBuffer;before:ArrayBuffer;after:ArrayBuffer;changed:number;minimum:number;maximum:number;elapsedMs:number};
