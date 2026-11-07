"use client";
import { useEffect, useRef, useState } from "react";
import type { ZodType } from "zod";
import { accountWorldStorage } from "./world-draft-storage";
/** Retain exact requests before sending. Acknowledgements never remove newer
 * work written by another tab, and unreadable bytes remain exportable. */
export function useCanonPacket<T>(key:string,schema:ZodType<T>){
  const storage=accountWorldStorage(),original=useRef<T|undefined>(undefined),raw=useRef<string|null>(null),[recovered,setRecovered]=useState<T>(),[unreadable,setUnreadable]=useState(false);
  useEffect(()=>{let live=true;queueMicrotask(()=>{if(!live)return;try{const value=storage.getItem(key);raw.current=value;if(value){const command=schema.parse(JSON.parse(value));original.current=command;setRecovered(command);}}catch{setUnreadable(true);}});return()=>{live=false;};},[key,schema,storage]);
  function retain(input:T){const command=schema.parse(input),value=JSON.stringify(command);if(storage.getItem(key)!==raw.current)throw Error("Another tab changed this retained canon request. Keep both drafts and reopen recovery.");storage.setItem(key,value);if(storage.getItem(key)!==value)throw Error("The original canon request could not be retained. Keep this page open.");raw.current=value;original.current=command;setRecovered(command);return command;}
  function accepted(){if(storage.getItem(key)===raw.current)storage.removeItem(key);raw.current=null;original.current=undefined;setRecovered(undefined);}
  function exportOriginal(){const value=storage.getItem(key);if(!value)return;const url=URL.createObjectURL(new Blob([value],{type:"application/json"})),anchor=document.createElement("a");anchor.href=url;anchor.download="retained-canon-request.json";anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function discard(){if(!window.confirm("Discard only this local canon request? Check current server state afterward; an already accepted decision is not undone."))return;if(storage.getItem(key)!==raw.current)throw Error("Another tab changed this packet. Its new bytes remain preserved.");if(raw.current!==null)storage.removeItem(key);raw.current=null;original.current=undefined;setRecovered(undefined);setUnreadable(false);}
  return {original,recovered,unreadable,retain,accepted,exportOriginal,discard};
}
