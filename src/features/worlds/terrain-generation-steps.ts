import type {GenerationRecipe} from "./terrain-source";
export type GenerationStep={progress:number;sort?:Float32Array};
export type GenerationResult={grid:Int16Array;resolvedPreset:GenerationRecipe["preset"];layoutWarnings?:string[];featureCount?:number;rangeCount?:number};
export type GenerationSteps=Generator<GenerationStep,GenerationResult,Float32Array|undefined>;
/** Both drivers execute the same native sample calculations in the same order. */
export function runGenerationSteps(steps:GenerationSteps,progress?:(n:number)=>void){let value=steps.next();while(!value.done){progress?.(value.value.progress);value=steps.next(value.value.sort?.sort());}return value.value;}
/** Exact IEEE-754 ordering, yielded in bounded blocks instead of a long native
 * sort on the UI thread. Generated fields are finite; -0 remains before +0. */
async function orderedFloats(values:Float32Array,cooperate:()=>Promise<void>){
 let source:Uint32Array=new Uint32Array(values.buffer,values.byteOffset,values.length),target:Uint32Array=new Uint32Array(source.length);
 const key=(bits:number)=>bits&0x80000000?~bits:bits^0x80000000,counts=new Uint32Array(256);
 for(let pass=0;pass<4;pass++){counts.fill(0);const shift=pass*8;
  for(let offset=0;offset<source.length;offset+=32768){const end=Math.min(source.length,offset+32768);for(let i=offset;i<end;i++)counts[(key(source[i])>>>shift)&255]++;await cooperate();}
  let sum=0;for(let n=0;n<256;n++){const count=counts[n];counts[n]=sum;sum+=count;}
  for(let offset=0;offset<source.length;offset+=32768){const end=Math.min(source.length,offset+32768);for(let i=offset;i<end;i++){const bits=source[i];target[counts[(key(bits)>>>shift)&255]++]=bits;}await cooperate();}
  [source,target]=[target,source];
 }
 return new Float32Array(source.buffer,source.byteOffset,source.length);
}
export async function runGenerationStepsAsync(steps:GenerationSteps,progress?:(n:number)=>void,signal?:AbortSignal){
 let deadline=performance.now()+8;
 const cooperate=async()=>{if(signal?.aborted)throw new DOMException("Numerical preview cancelled before acceptance.","AbortError");if(performance.now()>=deadline){await new Promise<void>(resolve=>setTimeout(resolve,0));deadline=performance.now()+8;if(signal?.aborted)throw new DOMException("Numerical preview cancelled before acceptance.","AbortError");}};
 let value=steps.next();while(!value.done){progress?.(value.value.progress);const sorted=value.value.sort?await orderedFloats(value.value.sort,cooperate):undefined;await cooperate();value=steps.next(sorted);}return value.value;
}
