import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { boundedSourceDisplay } from "./geographic-display";
import { geographicLandMask } from "./geographic-land-mask";
import { GeographicLandMaskScene } from "./geographic-land-mask-scene";
import { atlasGeographicFrame } from "./atlas-geographic-frame";
import type { Coordinate, GeographicBounds, GeographicShape, GeographicViewport, SourceGeometry, SpatialReference } from "./geographic";

const plane: SpatialReference = { version: 1, kind: "plane", crs: "AUTHORED:mask-proof", units: "map units", bounds: [0, 0, 2000, 1200] };
const sphere: SpatialReference = { version: 1, kind: "sphere", crs: "EPSG:4326", units: "degrees" };
const ring = (x: number, y: number, width: number, height: number): Coordinate[] => [[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]];
const polygon = (x: number, y: number, width: number, height: number): SourceGeometry => ({ type: "Polygon", coordinates: [ring(x, y, width, height)] });
function viewport(geometries: SourceGeometry[], reference = plane, bounds: GeographicBounds = reference.kind === "plane" ? reference.bounds : [-180, -90, 180, 90]): GeographicViewport {
  const projection = reference.kind === "plane" ? "planar" : "equirectangular";
  return {
    layer: { mapId: "map", mapName: "Mask proof", surface: { id: "surface", name: "Mask proof", reference, realmId: null, protected: false } },
    canEdit: true, context: "current-authorized-snapshot", bounds, projection, lod: "detail", attributions: [], nextCursor: null,
    shapes: geometries.map((geometry, i): GeographicShape => ({ id: `source-${i}`, versionId: `version-${i}`, geographyId: `place-${i}`, name: `Land ${i}`, semantic: "authored-geography", revision: 1, part: 0, geometryType: geometry.type, path: boundedSourceDisplay(geometry, reference, bounds, projection).path, sourceBounds: bounds, theme: "authored", style: "land" })),
  };
}
const alphaAt = (data: Buffer, width: number, x: number, y: number) => data[(y * width + x) * 4 + 3];
async function raster(view: GeographicViewport) {
  const mask = geographicLandMask(view, true), svg = renderToStaticMarkup(createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: 2000, height: 1200 },
    createElement("defs", null, createElement(GeographicLandMaskScene, { id: "land", mask })),
    createElement("rect", { width: 2000, height: 1200, fill: "black", mask: "url(#land)" })));
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

test("independent land paths union overlaps, preserve holes and admit another island inside a hole", async () => {
  const main: SourceGeometry = { type: "Polygon", coordinates: [ring(200, 200, 1250, 800), ring(500, 450, 400, 350)] };
  const view = viewport([main, polygon(600, 550, 180, 130), polygon(1600, 250, 250, 250), polygon(1300, 700, 400, 350)]), before = structuredClone(view);
  const { data, info } = await raster(view);
  for (const [x, y] of [[300, 300], [650, 600], [1750, 400], [1400, 800], [1650, 950]]) assert.equal(alphaAt(data, info.width, x, y), 255, `Land at ${x},${y}`);
  for (const [x, y] of [[550, 500], [850, 750], [100, 100], [1900, 1100]]) assert.equal(alphaAt(data, info.width, x, y), 0, `Outside authorized land at ${x},${y}`);
  assert.deepEqual(view, before);
});

test("a MultiPolygon retains all components, ring semantics and exact source identities", async () => {
  const geometry: SourceGeometry = { type: "MultiPolygon", coordinates: [[ring(200, 200, 600, 700), ring(350, 400, 200, 200)], [ring(1200, 300, 500, 400)]] };
  const view = viewport([geometry]), mask = geographicLandMask(view, true), { data, info } = await raster(view);
  assert.deepEqual(mask.parts.map(p => [p.sourceId, p.versionId, p.part]), [["source-0", "version-0", 0]]);
  assert.equal(alphaAt(data, info.width, 250, 250), 255);
  assert.equal(alphaAt(data, info.width, 450, 500), 0);
  assert.equal(alphaAt(data, info.width, 1450, 500), 255);
});

test("only explicit physical/authored land and legacy physical land defaults contribute", () => {
  const view = viewport([polygon(100, 100, 500, 500)]), source = view.shapes[0];
  const excluded: GeographicShape[] = [
    { ...source, id: "administrative", semantic: "administrative-boundary" },
    { ...source, id: "water", style: "water", theme: "inland-water" },
    { ...source, id: "region", style: "region", theme: "landscapes" },
    { ...source, id: "marine", style: "marine", theme: "marine" },
    { ...source, id: "outline", style: "outline" },
    { ...source, id: "unknown-authored", style: undefined },
    { ...source, id: "point", geometryType: "Point" },
    { ...source, id: "river", geometryType: "LineString" },
    { ...source, id: "empty", path: "" },
  ];
  const legacy = { ...source, id: "legacy", semantic: "physical-geography", theme: undefined, style: undefined };
  assert.deepEqual(geographicLandMask({ ...view, shapes: [...excluded, source, legacy] }, true).parts.map(p => p.sourceId), [source.id, "legacy"]);
});

test("loading, unavailable and zero-land views cannot reuse a previous authorized mask", () => {
  const view = viewport([polygon(100, 100, 500, 500)]), previous = geographicLandMask(view, true);
  assert.equal(previous.parts.length, 1);
  assert.equal(geographicLandMask(null, true).status, "unavailable");
  for (const mask of [geographicLandMask(null, true), geographicLandMask(view, false), geographicLandMask({ ...view, nextCursor: "next" }, true), geographicLandMask({ ...view, context: "loading" }, true), geographicLandMask({ ...view, context: "ordinary-new-snapshot", canEdit: false, shapes: [] }, true)]) assert.deepEqual(mask.parts, []);
  assert.equal(previous.parts.length, 1);
  assert.throws(() => geographicLandMask({ ...view, shapes: [view.shapes[0], view.shapes[0]] }, true), /repeats/);
});

test("planar masks share original Atlas registration after pan and zoom", async () => {
  const bounds: GeographicBounds = [400, 300, 1400, 900], view = viewport([polygon(600, 450, 400, 200)], plane, bounds), frame = atlasGeographicFrame(plane, bounds, "planar"), center = frame.project(frame.atlas([800, 550]));
  const { data, info } = await raster(view);
  assert.equal(alphaAt(data, info.width, Math.round(center.x), Math.round(center.y)), 255);
  const outside = frame.project(frame.atlas([1100, 550]));
  assert.equal(alphaAt(data, info.width, Math.round(outside.x), Math.round(outside.y)), 0);
});

test("spherical masks share registered projections across seams and in Mercator", async () => {
  const geometry: SourceGeometry = { type: "Polygon", coordinates: [[[175, -20], [-175, -20], [-175, 20], [175, 20], [175, -20]]] };
  for (const bounds of [[-180, -60, 180, 60], [170, -30, -170, 30]] as GeographicBounds[]) {
    for (const projection of ["equirectangular", "mercator"] as const) {
      const view = viewport([geometry], sphere, bounds);
      view.projection = projection;
      view.shapes[0].path = boundedSourceDisplay(geometry, sphere, bounds, projection).path;
      const frame = atlasGeographicFrame(sphere, bounds, projection), { data, info } = await raster(view);
      for (const longitude of [178, -178]) {
        const point = frame.project(frame.atlas([longitude, 0]));
        assert.equal(alphaAt(data, info.width, Math.round(point.x), Math.round(point.y)), 255, `${projection}: ${longitude}`);
      }
      assert.equal(geographicLandMask(view, true).transform, "scale(2)");
    }
  }
});
