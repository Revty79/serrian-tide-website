/** Numerical capacity is separate from request, renderer and operation budgets. */
export const TERRAIN_RESOLUTION = Object.freeze({worldAxis:2048,detailAxis:4096,tileSize:32,worldTiles:4096,detailTiles:16384,maxLod:7});
export const DETAIL_RESOLUTIONS=[32,64,128,256,512,1024,2048,4096] as const;
export const TERRAIN_TRANSFER = Object.freeze({chunkTiles:64,chunkBytes:800000,activePerActor:2,retainedPerActor:16});
export function numericalPayload(width:number,height:number){return width*height*2;}
export function advancedResolution(width:number,height:number){return width>2048||height>2048;}
export const ADVANCED_TERRAIN_WARNING="This resolution contains up to 16.8 million editable terrain samples and is intended for computers with faster processors and sufficient memory. Generating, editing, saving and loading may take significantly longer on slower computers. For better performance, choose 2048 × 2048 or a smaller high-detail region. Display quality does not change these samples.";
