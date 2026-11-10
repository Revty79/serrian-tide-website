import type {Brush,TerrainGeometry} from "./terrain";
import type {TerrainFrame} from "./terrain-refinement";
import type {RegionOutlineDrawing} from "./terrain-region-drawing";
import type {TerrainMeasurement} from "./terrain-measurement";
import {regionContainsPoint} from "./terrain-regions";
import {boundedKeyboardPoint,keyboardPosition,keyboardWorldPoint,keyboardSculptTools,stepKeyboardPoint,terrainKeyboardAction,type PrecisionPoint,type TerrainKeyboardSettings,type TerrainKeyboardStatus} from "./terrain-keyboard";

export type KeyboardTerrainContext={shape:TerrainGeometry;world:TerrainGeometry;frame?:TerrainFrame;grid:Int16Array;blocked?:Uint8Array;brush:Brush;tool:string;canEdit:boolean;presentationPreview?:boolean;regionExtent?:TerrainFrame;regionFootprint?:import("./terrain-region-geometry").RegionFootprint;regionDrawing?:RegionOutlineDrawing;path?:PrecisionPoint[];pathClosed?:boolean;pathPointLimit?:number;onPath?:(points:PrecisionPoint[])=>void;measurement?:TerrainMeasurement;onMeasurement?:(value:TerrainMeasurement)=>void};
type KeyboardEventLike=Parameters<typeof terrainKeyboardAction>[0];
/** Input/selection adapter only. All numerical dabs and patches stay in TerrainCanvas/TerrainStroke. */
export class TerrainKeyboardBinding{
 private point:PrecisionPoint|null=null;
 private vertex=-1;
 private message="";
 private sourceGrid?:Int16Array;
 private sourceKey="";
 private tool="";
 private brush="";
 private mask?:Uint8Array;
 private reportKey="";
 private cancelling=false;
 private pointTarget="";
 constructor(private host:{context:()=>KeyboardTerrainContext;settings:()=>TerrainKeyboardSettings;focused:()=>boolean;center:()=>PrecisionPoint;reveal:(point:PrecisionPoint)=>void;redraw:()=>void;report:(status:TerrainKeyboardStatus)=>void;exit:()=>void;stroke:{active:()=>boolean;busy:()=>boolean;start:(point:PrecisionPoint)=>boolean;enqueue:(point:PrecisionPoint)=>void;finish:()=>void;cancel:()=>void}}){}
 private boundary(){const c=this.host.context();return c.tool==="path"&&c.pathClosed||c.tool==="region"||c.tool==="measure";}
 private target(){const c=this.host.context();return c.tool==="region"&&c.regionDrawing?"regional outline":c.tool==="path"&&c.onPath?c.pathClosed?"polygon":"path":c.tool==="measure"&&c.measurement&&!c.measurement.finished?"measurement":"terrain";}
 private points(){const c=this.host.context(),target=this.target();if(target==="regional outline")return c.regionDrawing!.parts[c.regionDrawing!.activePart]?.points??[];if(target==="measurement")return c.measurement!.points;return target==="terrain"?[]:c.path??[];}
 private sourcePoint(p:PrecisionPoint){const c=this.host.context();return keyboardPosition(p,["regional outline","measurement"].includes(this.target())?"world":"samples",c.shape,c.frame,c.world,this.boundary());}
 sync(){
  const c=this.host.context(),key=[c.shape.width,c.shape.height,c.shape.displayWidth,c.shape.displayHeight,c.shape.wrap,c.frame?.x,c.frame?.y].join("/"),brush=JSON.stringify(c.brush),changed=this.sourceGrid!==c.grid||this.sourceKey!==key;
  const target=this.target()+":"+(c.regionDrawing?.activePart??0);if(target!==this.pointTarget){this.vertex=-1;this.pointTarget=target;}
  if(changed||this.tool!==c.tool||this.brush!==brush||this.mask!==c.blocked||!c.canEdit||!this.host.settings().enabled||c.presentationPreview){
   if(this.host.stroke.active())this.cancelStroke("Unfinished stroke cancelled because its tool, source, settings or editing access changed.");
   if(changed){if(this.point)this.message="Editing source changed. The cursor is reset inside its visible numerical grid; the readout shows its actual sample spacing.";this.point=null;this.vertex=-1;}
   if(this.tool!==c.tool)this.vertex=-1;
  }
  this.sourceGrid=c.grid;this.sourceKey=key;this.tool=c.tool;this.brush=brush;this.mask=c.blocked;
  if(this.vertex>=this.points().length)this.vertex=-1;
  if(this.host.settings().enabled&&!this.point)this.point=boundedKeyboardPoint(this.host.center(),c.shape,this.boundary());
 }
 cursor(){this.sync();return this.host.settings().enabled&&!this.host.context().presentationPreview?this.point:null;}
 world(){const c=this.host.context();return this.point?keyboardWorldPoint(this.point,c.shape,c.frame,c.world):null;}
 report(){if(!this.host.settings().enabled||!this.point)return;const c=this.host.context(),status:TerrainKeyboardStatus={point:{...this.point},world:this.world()!,spacing:{x:c.shape.displayWidth/c.shape.width,y:c.shape.displayHeight/c.shape.height},focused:this.host.focused(),stroking:this.host.stroke.active(),editable:this.target()==="terrain"?c.canEdit:this.target()==="regional outline"?c.regionDrawing?.editable!==false:true,vertex:this.vertex,vertices:this.points().length,target:this.target(),message:this.message},key=JSON.stringify(status);if(key!==this.reportKey){this.reportKey=key;this.host.report(status);}}
 cancelStroke(message="Unfinished keyboard stroke cancelled. Accepted terrain is unchanged."){if(!this.cancelling&&this.host.stroke.active()){this.cancelling=true;try{this.host.stroke.cancel();this.message=message;}finally{this.cancelling=false;}}}
 completed(samples:number,reason:string){this.message=samples?`${samples.toLocaleString()} samples changed through the native brush. Undo is available; normal autosave follows.`:reason;this.report();}
 blur(){this.cancelStroke();this.report();}
 private allowed(point:PrecisionPoint){const c=this.host.context(),world=keyboardWorldPoint(point,c.shape,c.frame,c.world);if(c.regionExtent&&c.regionFootprint&&!regionContainsPoint({frame:c.regionExtent,footprint:c.regionFootprint},world,c.world)){this.message="Outside this region's accepted outline. Choose a contained cursor position.";return false;}return true;}
 position(point:PrecisionPoint,units:"samples"|"world",editSelected=true){
  this.sync();this.cancelStroke("Unfinished stroke cancelled before exact repositioning.");const c=this.host.context();
  try{const p=keyboardPosition(point,units,c.shape,c.frame,c.world,this.boundary());if(!this.allowed(p))return false;if(editSelected&&this.vertex>=0&&!this.moveVertex(p))return false;if(!editSelected)this.vertex=-1;this.point=p;if(this.vertex<0)this.message="Exact position selected. Moving the cursor alone does not sculpt terrain.";this.host.reveal(p);return true;}
  catch(e){this.message=e instanceof Error?e.message:"That position is unavailable.";return false;}
  finally{this.host.redraw();this.report();}
 }
 private moveVertex(point:PrecisionPoint){
  const c=this.host.context(),points=this.points();if(this.vertex<0||!points[this.vertex])return false;
  if(this.target()==="regional outline"){
   const d=c.regionDrawing!;if(d.editable===false||!d.onVertexDrag){this.message="This outline is read-only or has a pending proposal/request. Its points were retained.";return false;}
   const world=keyboardWorldPoint(point,c.shape,c.frame,c.world),original=points[this.vertex];
   d.onVertexDrag(d.activePart,this.vertex,original,"start");d.onVertexDrag(d.activePart,this.vertex,world,"finish");
  }else if(this.target()==="measurement"){
   c.onMeasurement?.({...c.measurement!,selected:this.vertex,points:points.map((p,i)=>i===this.vertex?keyboardWorldPoint(point,c.shape,c.frame,c.world):p)});
  }else c.onPath?.(points.map((p,i)=>i===this.vertex?point:p));
  this.message="Control point adjusted in its native preview. Review and apply/accept using the existing controls.";return true;
 }
 private start(){const c=this.host.context();if(!keyboardSculptTools.has(c.tool)){this.message="Choose a Sculpt tool to stamp terrain. V selects existing supported outline/path points.";return false;}if(!c.canEdit||c.presentationPreview){this.message="Terrain editing is unavailable. Resolve permissions, editing lease, pending work or the selected numerical source.";return false;}if(!this.point||!this.allowed(this.point)||this.host.stroke.busy())return false;return this.host.stroke.start(this.point);}
 key(event:KeyboardEventLike){
  if(!this.host.settings().enabled||!this.host.focused())return false;
  this.sync();const action=terrainKeyboardAction(event,this.host.focused());
  if(!action)return false;
  if(!this.point)return true;
  const c=this.host.context(),settings=this.host.settings();
  if(action==="cancel"){
   if(this.host.stroke.active())this.cancelStroke();else if(this.vertex>=0){this.vertex=-1;this.message="Control point deselected.";}else this.host.exit();
  }else if(action==="center")this.host.reveal(this.point);
  else if(action==="next"||action==="previous"){
   this.cancelStroke();const points=this.points();if(points.length){this.vertex=(this.vertex+(action==="next"?1:this.vertex<0?0:-1)+points.length)%points.length;try{this.point=this.sourcePoint(points[this.vertex]);this.host.reveal(this.point);this.message="Arrows adjust this control point through its native preview. Esc deselects it.";}catch{this.vertex=-1;this.message="This point is outside the current numerical source. Choose its containing source first.";}}else this.message="No editable points on this tool. Draw a path or outline first.";
  }else if(action==="left"||action==="right"||action==="up"||action==="down"){
   const amount=event.shiftKey?settings.coarse:settings.movement==="single"?1:settings[settings.movement],next=stepKeyboardPoint(this.point,action,amount,c.shape,this.boundary());
   if(next.x===this.point.x&&next.y===this.point.y){this.message="Source boundary reached. Geography remains unchanged.";}
   else if(this.allowed(next)&&!(this.vertex>=0&&!this.moveVertex(next))){this.point=next;this.host.reveal(next);if(this.host.stroke.active())this.host.stroke.enqueue(next);else if(this.vertex<0)this.message="Cursor moved; terrain is unchanged. Enter stamps, Shift+Enter starts a stroke.";}
  }else if(action==="stroke"){
   if(this.host.stroke.active()){this.host.stroke.finish();this.message="Finishing the native stroke; normal Undo and autosave follow.";}else if(this.start())this.message="Stroke preview active. Move with arrows; Shift+Enter accepts, Esc cancels.";
  }else if(action==="stamp"){
   if(this.host.stroke.active()){this.message="Finish with Shift+Enter or cancel with Esc before stamping.";}
   else if(this.target()==="regional outline"){
    const d=c.regionDrawing!;if(d.editable===false)this.message="This regional outline is read-only or awaiting its original request.";else{d.onPick(this.world()!,0);this.message="Point sent to the existing regional outline preview.";}
   }else if(c.tool==="path"&&c.onPath){const points=c.path??[],limit=Math.min(256,c.pathPointLimit??256);if(points.length>=limit)this.message="Point limit reached; the existing outline is retained.";else{c.onPath([...points,{...this.point}]);this.vertex=-1;this.message="Point added to the native path preview. Review and apply the existing operation.";}}
   else if(this.start()){this.host.stroke.finish();this.message="Single native brush stamp accepted; normal Undo and autosave follow.";}
  }
  this.host.redraw();this.report();return true;
 }
}
