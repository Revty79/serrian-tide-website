"use client";
import type {AdvancedOperation} from "./terrain-advanced-spec";
type Profile=Extract<AdvancedOperation,{kind:"landform-profile"}>;
export function LandformProfileControls({value,onChange,onDraw,onMove}:{value:Profile;onChange:(value:Partial<Profile>)=>void;onDraw:()=>void;onMove:()=>void}){
  return <>
    <p>Draw a path, then vary its elevations and full widths. Shape can raise and lower existing terrain; Minimum and Maximum retain heights beyond the chosen bound. Inspect the numerical preview and its joins before accepting.</p>
    <label>Profile effect<select aria-label="Profile effect" value={value.mode} onChange={e=>onChange({mode:e.target.value as Profile["mode"]})}><option value="shape">Shape toward profile elevations</option><option value="minimum">Raise toward minimum elevations</option><option value="maximum">Lower toward maximum elevations</option></select></label>
    <label>Profile hardness (%)<input aria-label="Profile hardness (%)" type="number" min={0} max={100} value={value.hardness*100} onChange={e=>onChange({hardness:Number(e.target.value)/100})}/></label>
    <label>Profile end blend (m)<input aria-label="Profile end blend (m)" type="number" min={0} value={value.endBlendM} onChange={e=>onChange({endBlendM:Number(e.target.value)})}/></label>
    <label>Selection edge feather (m)<input aria-label="Selection edge feather (m)" type="number" min={0} value={value.featherM} onChange={e=>onChange({featherM:Number(e.target.value)})}/></label>
    <p>End blend fades the path into accepted terrain over the given distance at each end. Widths and elevations blend smoothly between points. Sea and neighboring shoreline supports, lake beds, wetlands and finer terrain are protected. The path line shows the centre; Prepare Preview shows its actual footprint.</p>
    <button type="button" className="st-button is-secondary" onClick={onDraw}>Add profile points on map</button>
    <button type="button" className="st-button is-secondary" onClick={onMove}>Move profile points on map</button>
    <button type="button" className="st-button is-secondary" onClick={()=>onChange({points:[]})}>Clear profile path</button>
    <p>{value.points.length} of 128 profile points. Draw at least two points. New points inherit the last point&apos;s height and width.</p>
    {value.points.map((point,index)=><fieldset key={index}><legend>Profile point {index+1}</legend>
      {([['x','east (m)'],['y','south (m)'],['elevationM','elevation (m)'],['widthM','full width (m)']] as const).map(([key,label])=><label key={key}>{`Profile point ${index+1} ${label}`}<input aria-label={`Profile point ${index+1} ${label}`} type="number" step="any" value={point[key]} onChange={e=>onChange({points:value.points.map((p,i)=>i===index?{...p,[key]:Number(e.target.value)}:p)})}/></label>)}
      <button type="button" className="st-button is-secondary" onClick={()=>onChange({points:value.points.filter((_,i)=>i!==index)})}>Remove profile point {index+1}</button>
    </fieldset>)}
  </>;
}
