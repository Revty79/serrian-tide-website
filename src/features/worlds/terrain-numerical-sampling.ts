import type { TerrainGeometry } from "./terrain";
import { frameLocalPoint, normalizeTerrainX, type TerrainFrame } from "./terrain-refinement";

export type NumericalSampleSource = {
  id: string; revision: number; parentId: string | null; parentRevision: number | null;
  shape: TerrainGeometry; frame: TerrainFrame; at: (column: number, row: number) => Promise<number>;
};
/** The established bilinear/native-parent sampling convention, shared by the
 * current-map reader and immutable dated source reader. */
export async function samplePinnedTerrainPoint(point: { x: number; y: number }, id: string, revision: number, world: TerrainGeometry,
  load: (id: string, revision: number) => Promise<NumericalSampleSource>): Promise<number> {
  const source = await load(id, revision), { shape, frame } = source;
  const local = frameLocalPoint(point, frame, world.displayWidth, world.wrap), gx = local.x / shape.displayWidth * shape.width, gy = local.y / shape.displayHeight * shape.height;
  const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const at = async (x: number, y: number): Promise<number> => {
    if (source.parentId && (x < 0 || x >= shape.width || y < 0 || y >= shape.height)) {
      if (source.parentRevision === null) throw Error("The retained numerical parent revision is missing.");
      return samplePinnedTerrainPoint({ x: world.wrap ? normalizeTerrainX(frame.x + x / shape.width * frame.width, world.displayWidth) : Math.max(0, Math.min(world.displayWidth, frame.x + x / shape.width * frame.width)), y: Math.max(0, Math.min(world.displayHeight, frame.y + y / shape.height * frame.height)) }, source.parentId, source.parentRevision, world, load);
    }
    const column = world.wrap && !source.parentId ? ((x % shape.width) + shape.width) % shape.width : Math.max(0, Math.min(shape.width - 1, x));
    return source.at(column, Math.max(0, Math.min(shape.height - 1, y)));
  };
  const [a, b, c, d] = await Promise.all([at(ix, iy), at(ix + 1, iy), at(ix, iy + 1), at(ix + 1, iy + 1)]);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
