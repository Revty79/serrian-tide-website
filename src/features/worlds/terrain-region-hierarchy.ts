import {z} from "zod";

/** Organizing links never participate in geographic source/permission resolution. */
export const REGION_HIERARCHY_DEPTH=16;
export type RegionHierarchyNode={id:string;name:string;kind:"world"|"region";worldId:string;terrainId:string;sourceWorldMapId:string;organizingParentId:string|null;revision:number;archived:boolean;sourceAvailable:boolean};
export type RegionHierarchy={available:boolean;canEdit:boolean;nodes:RegionHierarchyNode[];maxDepth:number};
export const regionMoveSchema=z.object({action:z.literal("move-region"),requestId:z.uuid(),mapId:z.uuid(),revision:z.number().int().nonnegative(),organizingParentId:z.uuid().nullable()}).strict();
export type RegionMove=z.infer<typeof regionMoveSchema>;

/** Bounded traversal also handles archived/missing grouping parents without promoting children. */
export function regionHierarchyPath(nodes:readonly RegionHierarchyNode[],id:string){
 const path:RegionHierarchyNode[]=[],seen=new Set<string>();let node=nodes.find(n=>n.id===id);
 while(node){if(seen.has(node.id)||path.length>REGION_HIERARCHY_DEPTH)throw Error("This map hierarchy contains a cycle or exceeds its supported depth.");seen.add(node.id);path.unshift(node);if(node.kind==="world")return path;const parent=node.organizingParentId??node.sourceWorldMapId;node=nodes.find(n=>n.id===parent);if(!node)throw Error("The organizing parent is unavailable. Keep this map and choose an available parent or its source World.");}
 return path;
}
export function validateRegionHierarchyMove(nodes:readonly RegionHierarchyNode[],id:string,parentId:string|null){
 const child=nodes.find(n=>n.id===id);if(!child||child.kind!=="region"||child.archived||!child.sourceAvailable)throw Error("Choose an available region whose source World is active.");
 if(parentId===id)throw Error("A region cannot be its own organizing parent.");
 if(parentId){const parent=nodes.find(n=>n.id===parentId);if(!parent||parent.kind!=="region"||parent.archived||!parent.sourceAvailable)throw Error("Choose an available organizing parent region.");if(parent.worldId!==child.worldId||parent.sourceWorldMapId!==child.sourceWorldMapId||parent.terrainId!==child.terrainId)throw Error("An organizing parent must share this region's World, source World map and terrain.");}
 const proposed=nodes.map(n=>n.id===id?{...n,organizingParentId:parentId}:n);
 for(const n of proposed.filter(n=>n.kind==="region"&&n.worldId===child.worldId&&n.sourceWorldMapId===child.sourceWorldMapId)){const path=regionHierarchyPath(proposed,n.id);if(path.length-1>REGION_HIERARCHY_DEPTH)throw Error(`Keep the complete branch within ${REGION_HIERARCHY_DEPTH} regional levels.`);}
 return proposed;
}
export function regionHierarchyDescendants(nodes:readonly RegionHierarchyNode[],id:string){const found=new Set<string>([id]);for(let pass=0;pass<=REGION_HIERARCHY_DEPTH;pass++){let changed=false;for(const n of nodes)if(n.organizingParentId&&found.has(n.organizingParentId)&&!found.has(n.id)){found.add(n.id);changed=true;}if(!changed)return found;}return found;}
