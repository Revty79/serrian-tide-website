import { elevationColor } from "./raster";
import {styleColor} from "./terrain-style";
import { TERRAIN, type TerrainGeometry } from "./terrain";
import type {CartographicWindow} from "./terrain-cartography-window";
import {CLASSIC_RELIEF,physicalGradient,physicalReliefShade,type TerrainRelief} from "./terrain-relief";
// Scientific elevation encoding is shared with retained numerical rasters.
const LOW = -30000, HIGH = 30000;
const colors = new Uint8ClampedArray((HIGH - LOW + 1) * 3);
for (let z = LOW; z <= HIGH; z++) colors.set(elevationColor(z), (z - LOW) * 3);
/** A single tile plus its read-only halo. No whole-map work per brush dab. */
export function paintTerrainTile(grid: Int16Array, seaLevel: number, key: number, shape: TerrainGeometry = TERRAIN,relief:TerrainRelief=CLASSIC_RELIEF,sample?:(x:number,y:number)=>number) {
  const size = shape.tileSize, x0 = key % (shape.width / shape.tileSize) * size, y0 = Math.floor(key / (shape.width / shape.tileSize)) * size, pixels = new Uint8ClampedArray(size * size * 4);
  const at=sample??((x:number,y:number)=>grid[y*shape.width+x]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = x0 + x, gy = y0 + y, z = at(gx,gy), water = z <= seaLevel;
    const west = at(shape.wrap ? (gx - 1 + shape.width) % shape.width : Math.max(0, gx - 1),gy), east = at(shape.wrap ? (gx + 1) % shape.width : Math.min(shape.width - 1, gx + 1),gy), north = at(gx,Math.max(0,gy-1)), south = at(gx,Math.min(shape.height-1,gy+1));
    shadePixel(pixels,(y*size+x)*4,z,water,west,east,north,south,gx,gy,shape,seaLevel,relief);
  }
  return new ImageData(pixels, size, size);
}

/** Same palette/lighting for numerical overview pixels and close visual windows. */
function shadePixel(pixels:Uint8ClampedArray,p:number,z:number,water:boolean,west:number,east:number,north:number,south:number,gx:number,gy:number,shape:TerrainGeometry,seaLevel:number,relief:TerrainRelief){
 const encoded=water?Math.min(0,z-seaLevel):Math.max(1,z),color=(Math.max(LOW,Math.min(HIGH,Math.round(encoded)))-LOW)*3;
 const gradient=relief.mode==="physical"&&!water?physicalGradient(west,east,north,south,gx,gy,shape):null;
 const shade=water?1:gradient?physicalReliefShade(gradient.x,gradient.y,relief.exaggeration):Math.max(.6,Math.min(1.25,1+(west-east+north-south)/1600));
 for(let c=0;c<3;c++)pixels[p+c]=colors[color+c]*shade;
 if(relief.appearance?.art){const rgb=styleColor([pixels[p],pixels[p+1],pixels[p+2]],water,relief.appearance.art);for(let c=0;c<3;c++)pixels[p+c]=rgb[c];}pixels[p+3]=255;
}
/** Read-only bilinear visual reconstruction, never a new elevation source.
 * A row yield bounds main-thread work; the accepted sea crossing is evaluated
 * per output pixel rather than blurring land/water colors together. */
export function* paintTerrainWindow(sample:(x:number,y:number)=>number,x0:number,y0:number,shape:TerrainGeometry,sea:number,relief:TerrainRelief,window:CartographicWindow):Generator<void,ImageData>{
 const width=window.pixelsX,height=window.pixelsY,pixels=new Uint8ClampedArray(width*height*4);
 const at=(x:number,y:number)=>{x=shape.wrap?(x%shape.width+shape.width)%shape.width:Math.max(0,Math.min(shape.width-1,x));y=Math.max(0,Math.min(shape.height-1,y));const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,xx=shape.wrap?(ix+1)%shape.width:Math.min(shape.width-1,ix+1),yy=Math.min(shape.height-1,iy+1);return (sample(ix,iy)*(1-fx)+sample(xx,iy)*fx)*(1-fy)+(sample(ix,yy)*(1-fx)+sample(xx,yy)*fx)*fy;};
 const constant=at(x0,y0);let uniform=true;
 for(let y=-1;y<=32&&uniform;y++){for(let x=-1;x<=32;x++)if(at(x0+x,y0+y)!==constant){uniform=false;break;}yield;}
 if(uniform){const row=new Uint8ClampedArray(width*4);for(let x=0;x<width;x++)shadePixel(row,x*4,constant,constant<=sea,constant,constant,constant,constant,x0,y0,shape,sea,relief);for(let y=0;y<height;y++){pixels.set(row,y*width*4);yield;}return new ImageData(pixels,width,height);}
 // Reuse horizontal interpolation rows; the five derivative probes share
 // their exact accepted samples. At most 35 rows x 3 x 256 Float64 values.
 const xs=Array.from({length:width},(_,x)=>x0+window.x+(x+.5)/width*window.width),axes=xs.map(gx=>[gx,gx-1,gx+1].map(x=>{x=shape.wrap?(x%shape.width+shape.width)%shape.width:Math.max(0,Math.min(shape.width-1,x));const i=Math.floor(x);return {i,j:shape.wrap?(i+1)%shape.width:Math.min(shape.width-1,i+1),f:x-i};})),rows=new Map<number,Float64Array>();
 const row=(y:number)=>{let values=rows.get(y);if(!values){values=new Float64Array(width*3);for(let x=0;x<width;x++)for(let p=0;p<3;p++){const a=axes[x][p];values[x*3+p]=sample(a.i,y)*(1-a.f)+sample(a.j,y)*a.f;}rows.set(y,values);}return values;};
 const vertical=(y:number)=>{y=Math.max(0,Math.min(shape.height-1,y));const i=Math.floor(y);return {a:row(i),b:row(Math.min(shape.height-1,i+1)),f:y-i};};
 for(let y=0;y<height;y++){const gy=y0+window.y+(y+.5)/height*window.height,c=vertical(gy),n=vertical(gy-1),s=vertical(gy+1);for(let x=0;x<width;x++){const k=x*3,gx=xs[x],z=c.a[k]*(1-c.f)+c.b[k]*c.f;shadePixel(pixels,(y*width+x)*4,z,z<=sea,c.a[k+1]*(1-c.f)+c.b[k+1]*c.f,c.a[k+2]*(1-c.f)+c.b[k+2]*c.f,n.a[k]*(1-n.f)+n.b[k]*n.f,s.a[k]*(1-s.f)+s.b[k]*s.f,gx,gy,shape,sea,relief);}yield;}
 return new ImageData(pixels,width,height);
}

export function terrainRenderKeys(keys?: Iterable<number>, shape: TerrainGeometry = TERRAIN) {
  if (!keys) return new Set(Array.from({ length: (shape.width / shape.tileSize * shape.height / shape.tileSize) }, (_, i) => i));
  const all = new Set<number>();
  // Neighbor tiles need their one-cell illumination border refreshed too.
  const columns = shape.width / shape.tileSize;
  for (const key of keys) { const x = key % columns, y = Math.floor(key / columns); for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const nextX = shape.wrap ? (x + i + columns) % columns : x + i; if (nextX >= 0 && nextX < columns && y + j >= 0 && y + j < shape.height / shape.tileSize) all.add((y + j) * columns + nextX); } }
  return all;
}
