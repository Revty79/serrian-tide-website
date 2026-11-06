"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { atlasRecordViewBinding, type AtlasRecordView } from "./atlas-record-view";
export function useAtlasRecordViewCapture(kind: AtlasRecordView["kind"], read: () => { x: number; y: number; scale: number } | undefined) {
  const latest = useRef(read); useLayoutEffect(()=>{latest.current=read;});
  useEffect(() => {
    const capture = (event: Event) => {
      const value = latest.current(), binding = atlasRecordViewBinding(new URL(location.href));
      if (binding && value) (event as CustomEvent<{ view?: AtlasRecordView }>).detail.view = { binding, kind, ...value };
    };
    window.addEventListener("atlas:capture-view", capture);
    return () => window.removeEventListener("atlas:capture-view", capture);
  }, [kind]);
}
