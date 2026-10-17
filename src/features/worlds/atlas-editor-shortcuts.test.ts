import assert from "node:assert/strict";
import test from "node:test";
import {atlasEditorShortcut} from "./atlas-editor-shortcuts";
const event=(key:string,patch:Partial<Parameters<typeof atlasEditorShortcut>[0]>={})=>({key,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,repeat:false,...patch});
test("canvas history supports Windows and Mac undo and both redo conventions",()=>{
 for(const modifier of [{ctrlKey:true},{metaKey:true}]){assert.equal(atlasEditorShortcut(event("z",modifier),false),"undo");assert.equal(atlasEditorShortcut(event("Z",{...modifier,shiftKey:true}),false),"redo");}
 assert.equal(atlasEditorShortcut(event("y",{ctrlKey:true}),false),"redo");assert.equal(atlasEditorShortcut(event("y",{metaKey:true}),false),null,"Keep the browser’s Mac history shortcut");
});
test("text fields retain native undo, redo, deletion and space",()=>{
 for(const key of ["z","y","Delete","Backspace"," "])for(const ctrlKey of [false,true])assert.equal(atlasEditorShortcut(event(key,{ctrlKey}),true),null);
});
test("destructive keys ignore repeat and browser command combinations",()=>{
 for(const key of ["Delete","Backspace"]){assert.equal(atlasEditorShortcut(event(key),false),"remove");for(const patch of [{repeat:true},{ctrlKey:true},{metaKey:true},{altKey:true}])assert.equal(atlasEditorShortcut(event(key,patch),false),null);}
 assert.equal(atlasEditorShortcut(event(" "),false),"pan");assert.equal(atlasEditorShortcut(event(" ",{altKey:true}),false),null);assert.equal(atlasEditorShortcut(event("q"),false),null);
});
