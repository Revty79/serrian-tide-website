import {z} from "zod";
import type {TerrainDocument,TerrainGeometry,TerrainTile} from "./terrain";

export const REFINEMENT_LIMIT=128;
export const REFINEMENT_DEPTH=8;
export const REFINEMENT_COLLAR=4;
export const refinementSizes=[32,64,128,256,512,1024] as const;
const finite=z.number().finite(),dimension=finite.min(100).max(1e9);
export const refinementFrameSchema=z.object({x:finite.min(0).max(1e9),y:finite.min(0).max(1e9),width:dimension,height:dimension}).strict();
export type TerrainFrame=z.infer<typeof refinementFrameSchema>;
export const refinementGridSize=z.number().int().refine(n=>(refinementSizes as readonly number[]).includes(n),"Choose 32, 64, 128, 256, 512 or 1024 samples.");
export const refinementCreateSchema=z.object({action:z.literal("create"),requestId:z.uuid(),mapId:z.uuid(),parentId:z.uuid().nullable(),parentRevision:z.number().int().positive(),name:z.string().trim().min(1).max(160),frame:refinementFrameSchema,gridWidth:refinementGridSize,gridHeight:refinementGridSize,previewHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type RefinementCreate=z.infer<typeof refinementCreateSchema>;
export type RefinementMeta={id:string;worldId:string;terrainId:string;mapId:string;name:string;parentId:string|null;parentRevision:number;level:number;revision:number;frame:TerrainFrame;gridWidth:number;gridHeight:number;overviewLevels:number;updatedAt:string};
export type RefinementDocument=TerrainDocument&{refinement:RefinementMeta};
export type TerrainViewport={left:number;top:number;right:number;bottom:number;scale:number;width:number;height:number};
export const rootFrame=(s:TerrainGeometry):TerrainFrame=>({x:0,y:0,width:s.displayWidth,height:s.displayHeight});
export const frameGeometry=(m:RefinementMeta,root:TerrainGeometry):TerrainGeometry=>({...root,width:m.gridWidth,height:m.gridHeight,displayWidth:m.frame.width,displayHeight:m.frame.height,wrap:false});
export const normalizeTerrainX=(x:number,width:number)=>((x%width)+width)%width;

/** Lift a canonical World X into the continuous interval starting at frame.x. */
export function frameLocalPoint(point:{x:number;y:number},frame:TerrainFrame,worldWidth:number,wrap:boolean){
 const x=wrap?normalizeTerrainX(point.x-frame.x,worldWidth):point.x-frame.x;
 return {x,y:point.y-frame.y};
}
export function frameContains(frame:TerrainFrame,point:{x:number;y:number},worldWidth:number,wrap:boolean){const p=frameLocalPoint(point,frame,worldWidth,wrap);return p.x>=0&&p.x<frame.width&&p.y>=0&&p.y<frame.height;}
export function framesOverlap(a:TerrainFrame,b:TerrainFrame,worldWidth:number,wrap:boolean,margin=0){
 if(a.y+a.height+margin<=b.y||b.y+b.height+margin<=a.y)return false;
 return (wrap?[-worldWidth,0,worldWidth]:[0]).some(offset=>a.x+a.width+margin>b.x+offset&&b.x+offset+b.width+margin>a.x);
}
export function frameInside(child:TerrainFrame,parent:TerrainFrame,worldWidth:number,wrap:boolean){const p=frameLocalPoint(child,parent,worldWidth,wrap);return (wrap&&parent.width>=worldWidth-1e-6||p.x>=0&&p.x+child.width<=parent.width+1e-6)&&p.y>=0&&p.y+child.height<=parent.height+1e-6;}
export function validateRefinement(frame:TerrainFrame,width:number,height:number,parent:TerrainGeometry,parentFrame:TerrainFrame,world:TerrainGeometry){
 refinementFrameSchema.parse(frame);refinementGridSize.parse(width);refinementGridSize.parse(height);
 if(frame.x>=world.displayWidth||frame.y+frame.height>world.displayHeight||frame.width>world.displayWidth||!world.wrap&&frame.x+frame.width>world.displayWidth||!frameInside(frame,parentFrame,world.displayWidth,world.wrap))throw Error("Keep the complete refinement inside its parent and the fixed north/south World edges.");
 if(frame.width/width>parent.displayWidth/parent.width/2||frame.height/height>parent.displayHeight/parent.height/2)throw Error("Choose at least twice the parent's numerical detail on both axes, or select a smaller physical area.");
}
export function overviewLevels(width:number,height:number){return Math.log2(Math.min(width,height)/32);}
export function lodGeometry(shape:TerrainGeometry,lod:number):TerrainGeometry{return {...shape,width:shape.width/2**lod,height:shape.height/2**lod};}
export function chooseTerrainLod(shape:TerrainGeometry,scale:number,previous?:number){
 const density=Math.max(shape.displayWidth/shape.width,shape.displayHeight/shape.height)*scale,max=overviewLevels(shape.width,shape.height);
 if(previous!==undefined&&previous>=0&&previous<=max&&density*2**previous>=1&&density*2**previous<=3.6)return previous;
 return Math.max(0,Math.min(max,Math.floor(Math.log2(2/Math.max(1e-12,density)))));
}

/** Existing node-based metre/sample convention. No new World coordinate engine. */
export function sampleTerrainGrid(grid:Int16Array,shape:TerrainGeometry,x:number,y:number){
 const gx=shape.wrap?normalizeTerrainX(x,shape.displayWidth)/shape.displayWidth*shape.width:Math.max(0,Math.min(shape.width-1,x/shape.displayWidth*shape.width)),gy=Math.max(0,Math.min(shape.height-1,y/shape.displayHeight*shape.height)),ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy;
 const at=(px:number,py:number)=>grid[Math.min(shape.height-1,py)*shape.width+(shape.wrap?px%shape.width:Math.min(shape.width-1,px))];
 return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;
}
/** Initial inherited heights, not invented detail. Deterministic whole-metre samples. */
export function initializeRefinement(parent:Int16Array,parentShape:TerrainGeometry,parentFrame:TerrainFrame,frame:TerrainFrame,width:number,height:number,world:TerrainGeometry){
 validateRefinement(frame,width,height,parentShape,parentFrame,world);const grid=new Int16Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=frameLocalPoint({x:frame.x+x/width*frame.width,y:frame.y+y/height*frame.height},parentFrame,world.displayWidth,world.wrap);grid[y*width+x]=Math.round(sampleTerrainGrid(parent,parentShape,p.x,p.y));}
 return grid;
}
export function isRefinementBoundary(x:number,y:number,width:number,height:number){return x<REFINEMENT_COLLAR||y<REFINEMENT_COLLAR||x>=width-REFINEMENT_COLLAR||y>=height-REFINEMENT_COLLAR;}
/** Lock inherited boundary samples and parent interpolation support beneath children. */
export function terrainEditMask(shape:TerrainGeometry,frame:TerrainFrame,children:RefinementMeta[],world:TerrainGeometry,boundary=false){
 const mask=new Uint8Array(shape.width*shape.height),dx=shape.displayWidth/shape.width,dy=shape.displayHeight/shape.height;
 if(boundary)for(let y=0;y<shape.height;y++){if(y<REFINEMENT_COLLAR||y>=shape.height-REFINEMENT_COLLAR)mask.fill(1,y*shape.width,(y+1)*shape.width);else{mask.fill(1,y*shape.width,y*shape.width+REFINEMENT_COLLAR);mask.fill(1,(y+1)*shape.width-REFINEMENT_COLLAR,(y+1)*shape.width);}}
 for(const child of children)for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){
  const left=Math.max(0,Math.ceil((child.frame.x+offset-frame.x)/dx-1)),right=Math.min(shape.width-1,Math.floor((child.frame.x+offset+child.frame.width-frame.x)/dx+1)),top=Math.max(0,Math.ceil((child.frame.y-frame.y)/dy-1)),bottom=Math.min(shape.height-1,Math.floor((child.frame.y+child.frame.height-frame.y)/dy+1));
  if(right<left||bottom<top)continue;for(let y=top;y<=bottom;y++)mask.fill(1,y*shape.width+left,y*shape.width+right+1);
 }
 return mask;
}
export function tileKeysForView(frame:TerrainFrame,shape:TerrainGeometry,view:TerrainViewport,world:TerrainGeometry,halo=1){
 const keys=new Set<number>(),columns=shape.width/32,rows=shape.height/32;
 for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){
  const left=Math.max(0,(view.left-frame.x-offset)/frame.width*shape.width),right=Math.min(shape.width,(view.right-frame.x-offset)/frame.width*shape.width),top=Math.max(0,(view.top-frame.y)/frame.height*shape.height),bottom=Math.min(shape.height,(view.bottom-frame.y)/frame.height*shape.height);
  if(right<=left||bottom<=top)continue;
  for(let y=Math.max(0,Math.floor(top/32)-halo);y<=Math.min(rows-1,Math.floor(bottom/32)+halo);y++)for(let x=Math.max(0,Math.floor(left/32)-halo);x<=Math.min(columns-1,Math.floor(right/32)+halo);x++)keys.add(y*columns+x);
 }
 return keys;
}
export function gridTile(grid:Int16Array,width:number,x:number,y:number):TerrainTile{const samples:number[]=[];for(let row=0;row<32;row++)for(let column=0;column<32;column++)samples.push(grid[(y*32+row)*width+x*32+column]);return {x,y,samples};}
/** Four accepted child tiles produce one exact, deterministic numerical overview. */
export function overviewTile(x:number,y:number,children:Map<string,number[]>):TerrainTile{
 const samples:number[]=[];const at=(gx:number,gy:number)=>children.get(`${x*2+Math.floor(gx/32)}:${y*2+Math.floor(gy/32)}`)![gy%32*32+gx%32];
 for(let row=0;row<32;row++)for(let column=0;column<32;column++){const a=column*2,b=row*2;samples.push(Math.round((at(a,b)+at(a+1,b)+at(a,b+1)+at(a+1,b+1))/4));}
 return {x,y,samples};
}
