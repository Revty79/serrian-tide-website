import type { TerrainGeometry } from "./terrain";
import { frameLocalPoint, normalizeTerrainX, type TerrainFrame } from "./terrain-refinement";

export type NumericalSampleSource = {
  id: string; revision: number; parentId: string | null; parentRevision: number | null;
  shape: TerrainGeometry; frame: TerrainFrame; at: (column: number, row: number) => number | Promise<number>;
};
export type NumericalSampleLoader = (id: string, revision: number) => NumericalSampleSource | Promise<NumericalSampleSource>;
/** The established bilinear/native-parent sampling convention, shared by the
 * current-map reader and immutable dated source reader. */
export async function samplePinnedTerrainPoint(point: { x: number; y: number }, id: string, revision: number, world: TerrainGeometry,
  load: NumericalSampleLoader): Promise<number> {
  return samplePinnedTerrainPointReady(point, id, revision, world, load);
}
/** A request-local reader may already hold the verified native samples. Keep
 * that hot path synchronous; only actual source/tile reads need a promise.
 * The ordinary async entry point above retains its existing public contract. */
export function samplePinnedTerrainPointReady(point: { x: number; y: number }, id: string, revision: number, world: TerrainGeometry,
  load: NumericalSampleLoader): number | Promise<number> {
  const loaded = load(id, revision);
  return loaded instanceof Promise ? loaded.then(sample) : sample(loaded);
  function sample(source: NumericalSampleSource): number | Promise<number> {
  const { shape, frame } = source;
  const local = frameLocalPoint(point, frame, world.displayWidth, world.wrap), gx = local.x / shape.displayWidth * shape.width, gy = local.y / shape.displayHeight * shape.height;
  const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const at = (x: number, y: number): number | Promise<number> => {
    if (source.parentId && (x < 0 || x >= shape.width || y < 0 || y >= shape.height)) {
      if (source.parentRevision === null) throw Error("The retained numerical parent revision is missing.");
      return samplePinnedTerrainPointReady({ x: world.wrap ? normalizeTerrainX(frame.x + x / shape.width * frame.width, world.displayWidth) : Math.max(0, Math.min(world.displayWidth, frame.x + x / shape.width * frame.width)), y: Math.max(0, Math.min(world.displayHeight, frame.y + y / shape.height * frame.height)) }, source.parentId, source.parentRevision, world, load);
    }
    const column = world.wrap && !source.parentId ? ((x % shape.width) + shape.width) % shape.width : Math.max(0, Math.min(shape.width - 1, x));
    return source.at(column, Math.max(0, Math.min(shape.height - 1, y)));
  };
  const values = [at(ix, iy), at(ix + 1, iy), at(ix, iy + 1), at(ix + 1, iy + 1)];
  const interpolate = ([a, b, c, d]: number[]) => (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  return values.every((value): value is number => typeof value === "number") ? interpolate(values) : Promise.all(values).then(interpolate);
  }
}
