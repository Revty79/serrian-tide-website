export const MAP_WIDTH = 2000, MAP_HEIGHT = 1200;
export type MapPoint = { x: number; y: number };
export const rounded = (value: number) => Math.round(value * 100) / 100;
export const boundedPoint = (p: MapPoint): MapPoint => ({
  x: rounded(Math.max(0, Math.min(MAP_WIDTH, p.x))),
  y: rounded(Math.max(0, Math.min(MAP_HEIGHT, p.y))),
});
