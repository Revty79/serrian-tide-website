/** Node transport shim for the unchanged browser numerical inheritance worker. */
import {parentPort} from "node:worker_threads";
import {tsImport} from "tsx/esm/api";
if(!parentPort)throw Error("This validation shim requires an owned worker thread.");
globalThis.self=globalThis;
globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);
await tsImport("../src/features/worlds/terrain-refinement.worker.ts",import.meta.url);
parentPort.on("message",data=>globalThis.self.onmessage({data}));
parentPort.postMessage({ready:true});
