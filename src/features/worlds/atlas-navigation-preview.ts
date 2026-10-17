import {useCallback,useEffect,useRef} from "react";

/** Transient view feedback only. Drafts, source coordinates and export stay authoritative. */
export function useAtlasNavigationPreview(){
 const ref=useRef<SVGGElement>(null),frame=useRef<number|null>(null),next=useRef<string|undefined>(undefined);
 const show=useCallback((transform:string|undefined)=>{
  next.current=transform;
  if(transform===undefined){
   if(frame.current!==null)cancelAnimationFrame(frame.current);
   frame.current=null;ref.current?.removeAttribute("transform");return;
  }
  if(frame.current===null)frame.current=requestAnimationFrame(()=>{
   frame.current=null;if(next.current!==undefined)ref.current?.setAttribute("transform",next.current);
  });
 },[]);
 useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);},[]);
 return {ref,show};
}
