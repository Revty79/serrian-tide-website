import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AtlasMapScene, type GeographicCompositionPreview } from "./atlas-map-scene";
import { atlasGeographicFrame } from "./atlas-geographic-frame";
import { boundedSourceDisplay } from "./geographic-display";
import type { GeographicViewport, SourceGeometry, SpatialReference } from "./geographic";
import type { MapDraft } from "./atlas";
import { defaultPresentation } from "./cartography";

const plane: SpatialReference = { version: 1, kind: "plane", crs: "AUTHORED:composition-proof", units: "map units", bounds: [0, 0, 2000, 1200] };
const polygon: SourceGeometry = { type: "Polygon", coordinates: [[[200, 200], [1500, 200], [1500, 1000], [200, 1000], [200, 200]], [[500, 400], [500, 700], [800, 700], [800, 400], [500, 400]]] };
const path = boundedSourceDisplay(polygon, plane, plane.bounds, "planar").path;
const view: GeographicViewport = { layer: { mapId: "map", mapName: "Proof", surface: { id: "surface", name: "Proof", reference: plane, realmId: null, protected: false } }, canEdit: true, context: "authorized", bounds: plane.bounds, projection: "planar", lod: "detail", attributions: [], nextCursor: null, shapes: [{ id: "mainland", versionId: "retained-v1", geographyId: "island", name: "Island", semantic: "authored-geography", revision: 1, part: 0, geometryType: "Polygon", sourceBounds: plane.bounds, style: "land", path }] };
const draft: MapDraft = { name: "Proof", description: "", scope: "regional", features: [], geographies: [], presentation: { ...defaultPresentation(), version: 2, styleRef: { id: "island-ink-wash", revision: 1 } }, drawings: [{ version: 1, type: "terrain", id: "stroke", name: "Retained stroke across water and land", kind: "forest", archived: false, geographyId: null, points: [{ id: "first", x: 50, y: 500 }, { id: "last", x: 1800, y: 500 }], radius: 25, spacing: 50, density: 1, seed: 1 }] };
function render(viewport: GeographicViewport | null = view, ready = true, preview?: GeographicCompositionPreview, themes?: string[],source=draft) {
  return renderToStaticMarkup(createElement("svg", null, createElement(AtlasMapScene, { draft:source, id: "proof", viewport, ready, geographicFrame: viewport ? atlasGeographicFrame(viewport.layer.surface.reference, viewport.bounds, viewport.projection) : undefined, elevation: null, landCover: null, preview, themes, editable: false })));
}

test("shared composition uses one authorized land path for display and clipping without changing stroke originals", () => {
  const before = structuredClone({ view, draft }), markup = render();
  assert.equal((markup.split(`d="${path}"`).length - 1), 2, "Same source path appears in visible fill and transient mask");
  assert.match(markup, /mask="url\(#proof-source-land\)"/);
  assert.match(markup, /data-cartographic-style="island-ink-wash:1"/);
  assert.match(markup, /data-map-background="fictional-water"/);
  assert.deepEqual({ view, draft }, before);
});

test("hiding land's visual theme does not remove its clipping boundary or fetch protected data", () => {
  const hidden = render(view, true, undefined, []);
  assert.equal(hidden.split(`d="${path}"`).length - 1, 1, "Mask survives independent display filtering");
  const ordinary = render({ ...view, context: "ordinary-authorized", canEdit: false, shapes: [] });
  assert.ok(!ordinary.includes(path)); assert.ok(!ordinary.includes("mainland"));
});

test("coastline and generation previews derive transient masks; saved versions remain unmodified", () => {
  const before = structuredClone(view), preview: SourceGeometry = { type: "Polygon", coordinates: [[[300, 300], [600, 300], [600, 900], [300, 900], [300, 300]]] };
  const markup = render(view, true, { replaceSource: "mainland", geometry: preview, generation: polygon });
  assert.ok(!markup.includes('data-source="mainland"')); assert.match(markup, /data-source="draft-0"/); assert.match(markup, /data-source="draft-1"/);
  assert.deepEqual(view, before);
});

test("incomplete access views use an empty mask, scientific unknowns remain neutral, and artwork-only maps retain v1 clipping", () => {
  const pending = render(view, false); assert.match(pending, /data-geographic-land-mask="loading"/);
  assert.equal(pending.split(`d="${path}"`).length - 1, 1, "Partial visible geography cannot supply a stale mask");
  assert.match(render({ ...view, layer: { ...view.layer, surface: { ...view.layer.surface, reference: { ...plane, crs: "LOCAL:scientific" } } } }), /data-map-background="unknown-coverage"/);
  assert.match(render(null),/data-geographic-land-mask="unavailable"/,"New empty island maps do not paint terrain across unknown water");
  const legacy = render(null,true,undefined,undefined,{...draft,presentation:defaultPresentation()}); assert.ok(!legacy.includes("data-geographic-land-mask")); assert.match(legacy, /clip-path="url\(#proof-land\)"/);
});

test("retained v1 coast/terrain keep their original clip when an empty or loading geographic reference is attached",()=>{
 const feature:MapDraft["features"][number]={id:"retained-coast",geographyId:"retained-island",geometry:{version:1,type:"polygon",points:[{id:"a",x:100,y:100},{id:"b",x:1500,y:100},{id:"c",x:1500,y:1000},{id:"d",x:100,y:1000}]},archived:false};
 const legacy={...draft,presentation:defaultPresentation(),features:[feature]},before=structuredClone(legacy);
 const cases:[GeographicViewport,boolean][]=[[{...view,shapes:[]},true],[view,false],[view,true]];
 for(const [viewport,ready] of cases){const markup=render(viewport,ready,undefined,undefined,legacy);assert.match(markup,/clip-path="url\(#proof-land\)"/);assert.ok(!markup.includes('mask="url(#proof-source-land)"'));assert.match(markup,/data-terrain-mark/);}
 assert.deepEqual(legacy,before);
});
test("explicit authored-only and dated artwork retain complete strokes without borrowing current geographic data",()=>{
 const before=structuredClone(draft),markup=renderToStaticMarkup(createElement("svg",null,createElement(AtlasMapScene,{draft,id:"authored",viewport:view,ready:true,geographicFrame:atlasGeographicFrame(plane,plane.bounds,"planar"),elevation:null,landCover:null,editable:false,authoredOnly:true})));
 assert.match(markup,/data-terrain-mark/);assert.match(markup,/clip-path="url\(#authored-land\)"/);assert.ok(!markup.includes("data-geographic-land-mask"));assert.ok(!markup.includes('data-source="mainland"'));assert.deepEqual(draft,before);
});
