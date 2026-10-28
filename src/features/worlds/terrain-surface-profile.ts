/** Optional sampled CPU diagnostics. Timings are inclusive where stages nest;
 * the default renderer does not take per-pixel clocks. No geography is retained. */
export type SurfaceStage="field"|"numerical-read"|"neighborhood"|"classification"|"strokes"|"texture"|"mip-filter"|"lighting"|"pixels"|"upload"|"composition"|"cache";
export class TerrainSurfaceProfile {
 readonly stages:Partial<Record<SurfaceStage,{ms:number;calls:number}>>={};
 pixels=0;sampling=false;hits=0;misses=0;allocations=0;evictions=0;inputEvents=0;maxInputLagMs=0;
 constructor(readonly enabled=false,readonly stride=128){}
 beginPixel(){this.sampling=this.enabled&&++this.pixels%this.stride===0;return this.sampling;}
 record(stage:SurfaceStage,ms:number){const s=this.stages[stage]??(this.stages[stage]={ms:0,calls:0});s.ms+=ms;s.calls++;}
 input(event:Event){if(!this.enabled)return;this.inputEvents++;this.maxInputLagMs=Math.max(this.maxInputLagMs,Math.max(0,performance.now()-event.timeStamp));}
 snapshot(){return {enabled:this.enabled,stride:this.stride,pixels:this.pixels,stages:this.stages,neighborhoodHits:this.hits,neighborhoodMisses:this.misses,allocations:this.allocations,evictions:this.evictions,inputEvents:this.inputEvents,maxInputLagMs:this.maxInputLagMs,timingSemantics:"Sampled pixel stages; nested stages are inclusive. Upload/composition/cache are full batch timings."};}
}
export const SURFACE_RENDERER_VERSION="stage3-5a-terrain-art-1";
