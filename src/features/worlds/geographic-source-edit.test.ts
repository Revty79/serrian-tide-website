import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editSourceVertex,moveSourceExtent,sourceRing,sourceSelection,SOURCE_VERTEX_WINDOW} from './geographic-source-edit';
import {validateSourceGeometry} from './geographic-geometry';
import {type SourceGeometry,type Coordinate} from './geographic';
const selection={component:0,ring:0,vertex:0};
test('a detailed source edit preserves every untouched ring and island exactly',()=>{
 const outer:Coordinate[]=Array.from({length:8000},(_,i)=>[Math.cos(i*Math.PI/4000)*8,Math.sin(i*Math.PI/4000)*8]);outer.push(outer[0]);
 const original:SourceGeometry={type:'MultiPolygon',coordinates:[[outer,[[-1,-1],[-1,1],[1,1],[1,-1],[-1,-1]]],[[[20,0],[21,0],[21,1],[20,1],[20,0]]]]},before=structuredClone(original);
 const result=editSourceVertex(original,{...selection,vertex:1200},'move',[outer[1200][0]*1.00001,outer[1200][1]*1.00001]);assert.equal(result.type,'MultiPolygon');if(result.type!=='MultiPolygon')throw Error();assert.equal(result.coordinates[0][0].length,8001);assert.deepEqual(result.coordinates[0][1],original.coordinates[0][1]);assert.deepEqual(result.coordinates[1],original.coordinates[1]);for(let i=0;i<outer.length;i++)if(i!==1200)assert.deepEqual(result.coordinates[0][0][i],outer[i]);assert.deepEqual(original,before);validateSourceGeometry(result,{version:1,kind:'sphere',crs:'EPSG:4326',units:'degrees'});assert.equal(SOURCE_VERTEX_WINDOW,64);
});
test('closure follows the first vertex without reordering an exterior or hole',()=>{
 const original:SourceGeometry={type:'Polygon',coordinates:[[[0,0],[8,0],[8,8],[0,8],[0,0]],[[1,1],[1,2],[2,2],[2,1],[1,1]]]};const moved=editSourceVertex(original,selection,'move',[-1,-1]);assert.equal(moved.type,'Polygon');if(moved.type!=='Polygon')throw Error();assert.deepEqual(moved.coordinates[0],[[-1,-1],[8,0],[8,8],[0,8],[-1,-1]]);assert.deepEqual(moved.coordinates[1],original.coordinates[1]);const hole=editSourceVertex(original,{...selection,ring:1},'move',[.9,.9]);assert.equal(hole.type,'Polygon');if(hole.type!=='Polygon')throw Error();assert.deepEqual(hole.coordinates[1].at(-1),[.9,.9]);assert.deepEqual(hole.coordinates[0],original.coordinates[0]);
});
test('insert and remove retain native geometry type and minimal valid rings',()=>{
 const g:SourceGeometry={type:'Polygon',coordinates:[[[0,0],[3,0],[0,3],[0,0]]]};assert.throws(()=>editSourceVertex(g,selection,'remove'),/at least three/);const inserted=editSourceVertex(g,{...selection,vertex:2},'insert',[-1,1]);assert.equal(inserted.type,'Polygon');assert.deepEqual(editSourceVertex(inserted,{...selection,vertex:3},'remove'),g);assert.throws(()=>editSourceVertex(g,selection,'move',[NaN,0]),/finite/);assert.throws(()=>sourceRing({type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[2,2]]]},0,0),/Close each/);
});
test('large multipart, seam and polar selections do not impose legacy visual caps',()=>{
 const g:SourceGeometry={type:'MultiPolygon',coordinates:Array.from({length:512},(_,i)=>[[[179,80+i/1000],[-179,80+i/1000],[-179,80.0001+i/1000],[179,80.0001+i/1000],[179,80+i/1000]]])};const s=sourceSelection(g,{component:511,ring:1000,vertex:1000000});assert.deepEqual(s,{component:511,ring:0,vertex:3});const moved=editSourceVertex(g,s,'move',[178.9,80.5111]);assert.equal(moved.type,'MultiPolygon');if(moved.type!=='MultiPolygon')throw Error();assert.equal(moved.coordinates.length,512);assert.deepEqual(moved.coordinates.slice(0,-1),g.coordinates.slice(0,-1));
});
test('point and multipart line edits preserve structure and reject invalid selections',()=>{
 const p:SourceGeometry={type:'Point',coordinates:[2,3]};assert.deepEqual(editSourceVertex(p,selection,'move',[3,4]),{type:'Point',coordinates:[3,4]});assert.throws(()=>editSourceVertex(p,selection,'insert',[3,4]),/remains one/);const line:SourceGeometry={type:'MultiLineString',coordinates:[[[0,0],[1,1]],[[4,4],[5,5],[6,6]]]};assert.deepEqual(editSourceVertex(line,{component:1,ring:0,vertex:1},'remove'),{type:'MultiLineString',coordinates:[[[0,0],[1,1]],[[4,4],[6,6]]]});assert.throws(()=>editSourceVertex(line,{component:9,ring:0,vertex:0},'move',[0,0]),/existing source/);
});
test('visual navigation wraps longitude and retains valid bounded planar and polar extents',()=>{
 const sphere={version:1,kind:'sphere',crs:'EPSG:4326',units:'degrees'} as const;assert.deepEqual(moveSourceExtent([170,80,-170,90],sphere,0,0,.5),[175,82.5,-175,87.5]);const north=moveSourceExtent([170,80,-170,90],sphere,0,10);assert.equal(north[3],90);const whole=moveSourceExtent([-180,-90,180,90],sphere,0,0,2);assert.deepEqual(whole,[-180,-90,180,90]);const plane={version:1,kind:'plane',crs:'AUTHORED:fixture',units:'m',bounds:[0,0,100,100]} as const;assert.deepEqual(moveSourceExtent([0,0,10,10],{...plane,bounds:[...plane.bounds]},-10,-10),[0,0,10,10]);
});
