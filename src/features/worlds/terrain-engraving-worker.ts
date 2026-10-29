import {engravingSource,type EngravingSource} from "./terrain-engraving-source";
import {engraveTile,type EngravingJob} from "./terrain-engraving-art";
import {ENGRAVING_LIMITS} from "./terrain-engraving";
export type EngravingReply={type:"image";key:string;width:number;pixels:ArrayBuffer;ms:number;strokes:number}|{type:"failed";message:string};
export type EngravingRequest={type:"source";source:EngravingSource}|{type:"paint";job:EngravingJob};
const endpoint=globalThis as unknown as {onmessage:((e:MessageEvent<EngravingRequest>)=>void)|null;postMessage:(message:EngravingReply,options?:{transfer:ArrayBuffer[]})=>void};
let artist:ReturnType<typeof engravingSource>|undefined;
endpoint.onmessage=event=>{try{const message=event.data;if(message.type==="source"){artist=engravingSource(message.source);return;}if(!artist||typeof OffscreenCanvas==="undefined")throw Error("Engraving uses the main-thread fallback on this browser.");const started=performance.now(),edge=message.job.size+2*ENGRAVING_LIMITS.halo,canvas=new OffscreenCanvas(edge,edge),ctx=canvas.getContext("2d");if(!ctx)throw Error("No worker Canvas2D context.");const job=engraveTile(ctx,artist,message.job);let result=job.next();while(!result.done)result=job.next();const pixels=ctx.getImageData(0,0,edge,edge).data;endpoint.postMessage({type:"image",key:message.job.key,width:edge,pixels:pixels.buffer,ms:performance.now()-started,strokes:result.value.strokes},{transfer:[pixels.buffer]});}catch(error){endpoint.postMessage({type:"failed",message:error instanceof Error?error.message:"Engraving preparation failed."});}};
