import { elevationColor } from "./raster";
import { TERRAIN, type TerrainGeometry } from "./terrain";
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
    const encoded = water ? Math.min(0, z - seaLevel) : Math.max(1, z), color = (Math.max(LOW, Math.min(HIGH, encoded)) - LOW) * 3;
    const west = at(shape.wrap ? (gx - 1 + shape.width) % shape.width : Math.max(0, gx - 1),gy), east = at(shape.wrap ? (gx + 1) % shape.width : Math.min(shape.width - 1, gx + 1),gy), north = at(gx,Math.max(0,gy-1)), south = at(gx,Math.min(shape.height-1,gy+1));
    const gradient=relief.mode==="physical"&&!water?physicalGradient(west,east,north,south,gx,gy,shape):null;
    const shade = water ? 1 : gradient?physicalReliefShade(gradient.x,gradient.y,relief.exaggeration):Math.max(.6, Math.min(1.25, 1 + (west - east + north - south) / 1600)), p = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) pixels[p + c] = colors[color + c] * shade;
    pixels[p + 3] = 255;
  }
  return new ImageData(pixels, size, size);
}
export function terrainRenderKeys(keys?: Iterable<number>, shape: TerrainGeometry = TERRAIN) {
  if (!keys) return new Set(Array.from({ length: (shape.width / shape.tileSize * shape.height / shape.tileSize) }, (_, i) => i));
  const all = new Set<number>();
  // Neighbor tiles need their one-cell illumination border refreshed too.
  const columns = shape.width / shape.tileSize;
  for (const key of keys) { const x = key % columns, y = Math.floor(key / columns); for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const nextX = shape.wrap ? (x + i + columns) % columns : x + i; if (nextX >= 0 && nextX < columns && y + j >= 0 && y + j < shape.height / shape.tileSize) all.add((y + j) * columns + nextX); } }
  return all;
}
