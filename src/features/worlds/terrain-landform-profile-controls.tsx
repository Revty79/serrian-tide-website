"use client";
import type {AdvancedOperation} from "./terrain-advanced-spec";
type Profile=Extract<AdvancedOperation,{kind:"landform-profile"}>;
export function LandformProfileControls({value,onChange,onDraw,onMove,drawingReady=true}:{value:Profile;onChange:(value:Partial<Profile>)=>void;onDraw:()=>void;onMove:()=>void;drawingReady?:boolean}){
  return <>
    <p>Draw a path, then vary its elevations and full widths. Shape can raise and lower existing terrain; Minimum and Maximum retain heights beyond the chosen bound. Inspect the numerical preview and its joins before accepting.</p>
    <label>Profile effect<select aria-label="Profile effect" value={value.mode} onChange={e=>{const mode=e.target.value as Profile["mode"];onChange({mode,...(mode!=="upper-envelope"?{envelopeBaseM:undefined}:{}),...(mode==="shape"?{preserveGradualJoins:undefined}:{})});}}><option value="shape">Shape toward profile elevations</option><option value="minimum">Raise toward minimum elevations</option><option value="maximum">Lower toward maximum elevations</option><option value="upper-envelope">Limit to profile envelope</option></select></label>
    {value.mode!=="shape"&&<><label><input aria-label="Keep adjoining slopes gradual" type="checkbox" checked={value.preserveGradualJoins??false} onChange={e=>onChange({preserveGradualJoins:e.target.checked})}/> Keep adjoining slopes gradual.</label><p>Reduce the proposed raise or cut where needed to avoid new or steeper steps above 45 degrees on this map&apos;s native grid. Existing steep steps are not steepened; protected heights stay exact. Review the adjusted shape; numerical grid slopes are not surveyed ground slopes.</p></>}
    {value.mode==="upper-envelope"&&<><label>Envelope base elevation (m)<input aria-label="Envelope base elevation (m)" type="number" step="1" value={value.envelopeBaseM??""} onChange={e=>onChange({envelopeBaseM:e.target.value===""?undefined:Number(e.target.value)})}/></label><p>The envelope can lower land throughout the selected area, including outside the path. Choose its base explicitly. Profile heights are ceilings: existing lower terrain remains, and no summit is raised. Review the entire selection and standing-water banks before accepting.</p></>}
    <label>Profile hardness (%)<input aria-label="Profile hardness (%)" type="number" min={0} max={100} value={value.hardness*100} onChange={e=>onChange({hardness:Number(e.target.value)/100})}/></label>
    <label>Profile end blend (m)<input aria-label="Profile end blend (m)" type="number" min={0} value={value.endBlendM} onChange={e=>onChange({endBlendM:Number(e.target.value)})}/></label>
    <label><input aria-label="Keep both profile ends gradual" type="checkbox" checked={value.continuousEndBlend??false} onChange={e=>onChange({continuousEndBlend:e.target.checked})}/> Keep both profile ends gradual.</label>
    <p>For wide paths with overlapping segments, apply the end blend once across the full shape. Leave this off to retain the original blending.</p>
    <label>Selection edge feather (m)<input aria-label="Selection edge feather (m)" type="number" min={0} value={value.featherM} onChange={e=>onChange({featherM:Number(e.target.value)})}/></label>
    <p>{value.mode==="upper-envelope"?"End blend brings the envelope ceiling down to its base over the given distance at each path end.":"End blend fades the path into accepted terrain over the given distance at each end."} Widths and elevations blend smoothly between points. Sea and neighboring shoreline supports, lake beds, wetlands and finer terrain are protected. The path line shows the centre; Prepare Preview shows its actual footprint.</p>
    <button type="button" className="st-button is-secondary" disabled={!drawingReady} onClick={onDraw}>Add profile points on map</button>
    <button type="button" className="st-button is-secondary" disabled={!drawingReady} onClick={onMove}>Move profile points on map</button>
    <button type="button" className="st-button is-secondary" onClick={()=>onChange({points:[]})}>Clear profile path</button>
    <p>{value.points.length} of 128 profile points. Draw at least two points. New points inherit the last point&apos;s height and width.</p>
    {value.points.map((point,index)=><fieldset key={index}><legend>Profile point {index+1}</legend>
      {([['x','east (m)'],['y','south (m)'],['elevationM','elevation (m)'],['widthM','full width (m)']] as const).map(([key,label])=><label key={key}>{`Profile point ${index+1} ${label}`}<input aria-label={`Profile point ${index+1} ${label}`} type="number" step="any" value={point[key]} onChange={e=>onChange({points:value.points.map((p,i)=>i===index?{...p,[key]:Number(e.target.value)}:p)})}/></label>)}
      <button type="button" className="st-button is-secondary" onClick={()=>onChange({points:value.points.filter((_,i)=>i!==index)})}>Remove profile point {index+1}</button>
    </fieldset>)}
  </>;
}
