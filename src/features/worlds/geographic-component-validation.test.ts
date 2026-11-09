import test from 'node:test';
import assert from 'node:assert/strict';
import type {Coordinate,SourceGeometry,SpatialReference} from './geographic';
import {validateSourceGeometry} from './geographic-geometry';
const plane:SpatialReference={version:1,kind:'plane',crs:'AUTHORED:component-validation',units:'local units',bounds:[0,0,1000,1000]},sphere:SpatialReference={version:1,kind:'sphere',crs:'EPSG:4326',units:'degrees'};
const box=(x:number,y:number,w:number,h:number):Coordinate[]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
test('many disconnected source components retain every original coordinate',()=>{
 const coast:Coordinate[]=Array.from({length:4096},(_,i)=>[100+50*Math.cos(i*2*Math.PI/4096),100+50*Math.sin(i*2*Math.PI/4096)]);coast.push([...coast[0]]);
 const geometry:SourceGeometry={type:'MultiPolygon',coordinates:[[coast],...Array.from({length:160},(_,i)=>[box(200+i%20*3,20+Math.floor(i/20)*3,1,1)])]},before=structuredClone(geometry);validateSourceGeometry(geometry,plane);assert.deepEqual(geometry,before);
});
test('cached component bounds preserve touching, tiny overlap and reordered duplicate decisions',()=>{
 const geometry:SourceGeometry={type:'MultiPolygon',coordinates:[[box(10,10,10,10)],[box(20,12,2,4)]]};validateSourceGeometry(geometry,plane);
 const overlap=structuredClone(geometry);overlap.coordinates[1]=[box(20-1e-8,12,2,4)];assert.throws(()=>validateSourceGeometry(overlap,plane),/overlap|cross/);
 const ring=box(10,10,10,10),rotated=[...ring.slice(2,-1),...ring.slice(0,2),ring[2]];assert.throws(()=>validateSourceGeometry({type:'MultiPolygon',coordinates:[[ring],[rotated]]},plane),/overlap/);
});
test('component alignment retains wrapping contact and overlap checks',()=>{
 const wrapping:Coordinate[]=[[179,-3],[-179,-3],[-179,3],[179,3],[179,-3]],geometry:SourceGeometry={type:'MultiPolygon',coordinates:[[wrapping],[box(-178,-2,1,2)]]},before=structuredClone(geometry);validateSourceGeometry(geometry,sphere);assert.deepEqual(geometry,before);
 const overlap=structuredClone(geometry);overlap.coordinates[1]=[box(-179.5,-2,1,2)];assert.throws(()=>validateSourceGeometry(overlap,sphere),/overlap|cross/);
});
test('an island may touch an enclosing hole but cannot extend into its surrounding area',()=>{
 const geometry:SourceGeometry={type:'MultiPolygon',coordinates:[[box(0,0,10,10),box(2,2,6,6)],[box(2,3,1,1)]]};validateSourceGeometry(geometry,plane);
 const overlap=structuredClone(geometry);overlap.coordinates[1]=[box(2-1e-8,3,1,1)];assert.throws(()=>validateSourceGeometry(overlap,plane),/overlap|cross/);
});
