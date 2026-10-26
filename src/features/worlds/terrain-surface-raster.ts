import type {SurfaceWorkerRequest} from "./terrain-surface-worker-protocol";
import {surfacePixel,surfacePixelWork,type SurfacePixelWork} from "./terrain-surface-art";
import {surfaceFieldWork,type terrainSurfaceSampler} from "./terrain-surface-field";
import {EMPTY_TERRAIN_MATERIALS} from "./terrain-materials";
import type {SurfaceTextureSet} from "./terrain-surface-textures";
import {TerrainSurfaceProfile} from "./terrain-surface-profile";

/** Full-density RGBA raster on the existing World pixel lattice. Cropping only
 * omits offscreen pixels; its one-pixel halo is evaluated at the same positions. */
export function rasterSurfaceJob(message:Extract<SurfaceWorkerRequest,{type:"paint"}>,sample:ReturnType<typeof terrainSurfaceSampler>,period:number|null,textures:SurfaceTextureSet,profile=new TerrainSurfaceProfile(),field=surfaceFieldWork(),work:SurfacePixelWork=surfacePixelWork()){
 const started=performance.now(),width=message.resolution+2,height=message.height+2,pixels=new Uint8ClampedArray(width*height*4),layer={...EMPTY_TERRAIN_MATERIALS,...message.layer};
 for(let row=0;row<height;row++)for(let col=0;col<width;col++){
  let x=message.originX+(col+message.pixelX-.5)*message.step;const y=message.originY+(row+message.pixelY-.5)*message.step;if(period)x=((x%period)+period)%period;
  const measured=profile.beginPixel(),start=measured?performance.now():0,f=sample(x,y,profile,field);if(measured)profile.record("field",performance.now()-start);
  const rgb=surfacePixel(f,x,y,message.step,message.sea,message.relief,layer,message.strokes,period,textures,profile,work),i=(row*width+col)*4;pixels[i]=rgb[0];pixels[i+1]=rgb[1];pixels[i+2]=rgb[2];pixels[i+3]=255;if(measured)profile.record("pixels",performance.now()-start);
 }
 return {pixels,width,height,ms:performance.now()-started};
}
