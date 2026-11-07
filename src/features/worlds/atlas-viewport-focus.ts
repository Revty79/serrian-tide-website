/** The History dialog owns its keyboard and viewport while open. Underlying
 * canvases retain their exact size/camera; toolbar focus does not resize them. */
export function shouldUpdateAtlasViewport(root:HTMLElement,event?:Event){
  if(document.querySelector('dialog[data-native-history][open]'))return false;
  if(event?.type==="focusin"||event?.type==="focusout"){
    const focus=event as FocusEvent,target=focus.target,related=focus.relatedTarget;
    if(target instanceof Element&&target.closest("[data-native-history-action],dialog[aria-label='Map browser']")||related instanceof Element&&related.closest("[data-native-history-action],dialog[aria-label='Map browser']"))return false;
    return target instanceof Element&&root.contains(target)&&target.matches("input,textarea,select,[contenteditable=true]");
  }
  return true;
}
