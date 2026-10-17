/** Canvas/editor shortcuts must leave text editing and native form activation alone. */
export type CanvasShortcut="undo"|"redo"|"remove"|"pan";
export function atlasEditorShortcut(event:{key:string;ctrlKey:boolean;metaKey:boolean;shiftKey:boolean;altKey:boolean;repeat:boolean},textEntry:boolean):CanvasShortcut|null{
 if(textEntry||event.altKey)return null;
 const key=event.key.toLowerCase(),command=event.ctrlKey||event.metaKey;
 if(command&&key==="z")return event.shiftKey?"redo":"undo";
 if(event.ctrlKey&&!event.metaKey&&key==="y"&&!event.shiftKey)return "redo";
 if(command)return null;
 if((key==="delete"||key==="backspace")&&!event.repeat)return "remove";
 if(key===" "&&!event.shiftKey)return "pan";
 return null;
}
