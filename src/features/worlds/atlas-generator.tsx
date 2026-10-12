"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { GuidedField } from "@/components/field-guidance";
import type { AtlasMap } from "./atlas";
import { CartographyScene } from "./cartography-scene";
import type { GenerationResult } from "./map-generator";
import { directions, generatorVersions, generationSpecSchema, presetSpec, presets, regions, type GenerationPlan, type GenerationSettings, type GenerationSpec, type Preset } from "./generation-spec";
import { descriptionExample, interpretDescription, validateDescriptionSpec } from "./description-interpreter";
import { GenerationPlanReview } from "./generation-plan-review";
import styles from "./generation.module.css";

type Preview = GenerationResult & {spec: GenerationSpec; id:string};
export function AtlasGenerator({source,onClose,onSave,onDirtyChange}:{source:AtlasMap|null;onClose:()=>void;onSave:(body:unknown)=>Promise<void>;onDirtyChange:(dirty:boolean)=>void}) {
  const [spec,setSpec]=useState<GenerationSpec>(()=>source?.generation?.spec?structuredClone(source.generation.spec):presetSpec("continental","serrian-tide"));
  const [name,setName]=useState(source?`${source.name.slice(0,140)} variation`:"New generated map"),[description,setDescription]=useState("");
  const [preview,setPreview]=useState<Preview|null>(null),[pending,setPending]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[dirty,setDirty]=useState(false);
  const [method,setMethod]=useState(source?.generation?.spec?.description?"describe":"configure"),[written,setWritten]=useState(source?.generation?.spec?.description??""),[warningsAccepted,setWarningsAccepted]=useState(false);
  const worker=useRef<Worker|null>(null);
  useEffect(()=>()=>{worker.current?.terminate();worker.current=null;},[]);
  function cancelPreview(){worker.current?.terminate();worker.current=null;setBusy(false);}
  const sceneId=useId().replace(/:/g,""),reviewed=method==="describe"&&spec.description===written.trim()&&spec.interpretation!==null;
  const ready=method==="configure"||reviewed&&(!spec.interpretation!.warnings.length||warningsAccepted);
  const stale=!!preview&&(JSON.stringify(spec)!==JSON.stringify(preview.spec)||!ready);
  useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false);},[dirty,onDirtyChange]);
  useEffect(()=>{
    const guard=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue="";}};
    const navigation=(e:MouseEvent)=>{const anchor=(e.target as Element).closest?.("a[href]") as HTMLAnchorElement|null;if(!dirty||!anchor||anchor.hasAttribute("download")||anchor.href===location.href)return;if(!window.confirm("Leave this unsaved map preview?"))e.preventDefault();};
    window.addEventListener("beforeunload",guard);document.addEventListener("click",navigation);
    return()=>{window.removeEventListener("beforeunload",guard);document.removeEventListener("click",navigation);};
  },[dirty]);
  function change(next:GenerationSpec){setSpec(next);setDirty(true);setError("");}
  function setting<K extends keyof GenerationSettings>(key:K,value:GenerationSettings[K]){const settings={...spec.settings,[key]:value};if(key==="mapType"&&value==="continent")settings.continents=1;const plan={...spec.plan};if(settings.continents!==1)plan.landPosition="center";change({...spec,settings,plan});}
  function plan<K extends keyof GenerationPlan>(key:K,value:GenerationPlan[K]){change({...spec,plan:{...spec.plan,[key]:value}});}
  function changeMethod(value:string){setMethod(value);setWarningsAccepted(false);change({...spec,description:null,interpretation:null});}
  function interpret(){setError("");setWarningsAccepted(false);try{change(interpretDescription(written,spec));}catch(failure){setError((failure as Error).message);}}
  function buildPreview(next=spec){
    if(!ready||worker.current)return;
    setBusy(true);setError("");
    try{
      const parsed=generationSpecSchema.parse(next);validateDescriptionSpec(parsed);
      const job=new Worker(new URL("./generation.worker.ts",import.meta.url),{type:"module"});worker.current=job;
      const finish=()=>{job.terminate();if(worker.current===job){worker.current=null;setBusy(false);}};
      job.onmessage=(event:MessageEvent<{result?:GenerationResult;error?:string}>)=>{
        if(worker.current!==job)return;
        if(event.data.error)setError(event.data.error);
        else if(event.data.result){setSpec(parsed);setPreview({...event.data.result,spec:parsed,id:crypto.randomUUID()});setDirty(true);}
        else setError("The preview worker returned an incomplete result. Try again.");
        finish();
      };
      job.onerror=event=>{event.preventDefault();if(worker.current===job)setError("The preview could not start. Reload this page or try again; your recipe is retained.");finish();};
      job.postMessage(parsed);
    }catch(failure){worker.current?.terminate();worker.current=null;setError((failure as Error).message);setBusy(false);}
  }
  function close(){if(!pending&&(!dirty||window.confirm("Discard this unsaved map preview?"))){onDirtyChange(false);onClose();}}
  const select=<K extends keyof GenerationSettings>(key:K,label:string,help:string,values:readonly GenerationSettings[K][],disabled=false)=><GuidedField label={label} help={help}><select className="st-control" disabled={disabled} value={String(spec.settings[key])} onChange={e=>setting(key,e.target.value as GenerationSettings[K])}>{values.map(v=><option key={String(v)} value={String(v)}>{String(v)}</option>)}</select></GuidedField>;
  const number=(key:keyof GenerationSettings,label:string,help:string,min:number,max:number)=><GuidedField label={label} help={help}><input className="st-control" type="number" min={min} max={max} step={1} required value={String(spec.settings[key])} onChange={e=>setting(key,Number(e.target.value))}/></GuidedField>;
  const placement=(key:keyof GenerationPlan,label:string,help:string,values:readonly string[],disabled=false)=><GuidedField label={label} help={help}><select className="st-control" disabled={disabled} value={String(spec.plan[key])} onChange={e=>plan(key,e.target.value as GenerationPlan[typeof key])}>{values.map(v=><option key={v}>{v}</option>)}</select></GuidedField>;
  async function accept(e:FormEvent){e.preventDefault();if(!preview||stale||!ready)return;setPending(true);setError("");try{await onSave({action:"generate",id:preview.id,name,description,spec:preview.spec,sourceMapId:source?.id??null,sourceRevision:source?.revision??null,...(preview.spec.interpretation?.warnings.length&&warningsAccepted?{descriptionWarningsAccepted:true}:{})});setDirty(false);}catch(failure){setError((failure as Error).message);}finally{setPending(false);}}
  return <section className={styles.generator} aria-label="Generate a World map"><header className={styles.heading}><div><p className={styles.eyebrow}>Shape a new horizon</p><h2>Generate map</h2><p>Create editable land, terrain and waterways, then make the map your own.</p></div><button className="st-button is-secondary" disabled={pending||busy} onClick={close}>Map library</button></header>
    {source&&<p className={styles.source}>Starting a variation of <strong>{source.name}</strong>. Saving creates a new map with new geography. Its source map and all manual edits stay saved.</p>}
    <form onSubmit={e=>{e.preventDefault();void buildPreview();}}><fieldset disabled={pending||busy} className={styles.settings}>
      <GuidedField label="Landscape generation" help="Choose Natural landscapes for varied coastlines and terrain groups, or Original 3C for the earlier landscape style. Your choice affects the next preview. Existing saved maps keep their original drawing and creation record."><select className="st-control" value={spec.algorithm} onChange={e=>change({...spec,algorithm:e.target.value as GenerationSpec["algorithm"]})}>{generatorVersions.map(v=><option key={v} value={v}>{v==="serrian-atlas-v2"?"Natural landscapes":"Original 3C landscapes"}</option>)}</select></GuidedField>
      <GuidedField label="Creation method" help="Choose starting settings, or describe a landscape in short sentences and review what was understood. Switching to settings keeps the reviewed choices, which you can then adjust directly."><select className="st-control" value={method} onChange={e=>changeMethod(e.target.value)}><option value="configure">Configure settings</option><option value="describe">Describe geography</option></select></GuidedField>
      {method==="describe"&&<div className={styles.description}>
        <GuidedField label="Describe the geography" help="Describe land and terrain in short English clauses, such as one large northern continent, three eastern islands, and sparse forests. Review the plan before previewing. The supported vocabulary below explains what can be understood; your text stays in this application."><textarea className="st-control" maxLength={4000} rows={6} value={written} onChange={e=>{setWritten(e.target.value);setWarningsAccepted(false);setDirty(true);setError("");}}/></GuidedField>
        <div className={styles.actions}><button type="button" className="st-button" onClick={interpret}>Interpret description</button><button type="button" className="st-button is-secondary" onClick={()=>{setWritten(descriptionExample);setWarningsAccepted(false);setDirty(true);}}>Use example description</button></div>
        <details className={styles.advanced}><summary>Supported description vocabulary</summary><p>Use digits, zero through twelve, a/an, several (3), or many islands (24). Describe the size/shape of one main continent and its north, south, east, west, center or diagonal position; offshore island count/side; jagged or smooth coasts; shallow or deep bays; north–south, east–west or diagonal ranges; dense/sparse regional forests; cardinal river outlets; inland regional lakes; desert, grassland, wetlands, snow, hills or valleys. Cold, temperate, arid, tropical or mixed select broad terrain. Use a separate clause for each feature.</p><p>Independent sizes for offshore islands, river width and lake size, named locations, simulations and arbitrary instructions are not interpreted. Rivers reach coasts; lake-connected routing is not supported. Review any limits before using a partial plan.</p></details>
        {reviewed?<><GenerationPlanReview spec={spec}/>{!!spec.interpretation!.warnings.length&&<section className={styles.limits} aria-label="Description limits"><h3>Details needing review</h3><ul>{spec.interpretation!.warnings.map((line,i)=><li key={i}>{line}</li>)}</ul><GuidedField label="Use the supported plan despite these limits" help="Check this only if you are happy to leave the listed details out of this generated landscape. Otherwise revise your description and interpret it again. The preview follows the supported plan."><input type="checkbox" checked={warningsAccepted} onChange={e=>setWarningsAccepted(e.target.checked)}/></GuidedField></section>}</>:<p>Interpret your current description before previewing. Editing the text requires another review.</p>}
      </div>}
      {method==="configure"&&<fieldset className={styles.configuration}>
      <GuidedField label="Generation preset" help="Choose a starting landscape, such as an archipelago or a northern continent, then adjust it to suit your World. This replaces the preview settings, not an existing saved map."><select className="st-control" defaultValue="" onChange={e=>{if(e.target.value)change({...presetSpec(e.target.value as Preset,spec.seed),algorithm:spec.algorithm});}}><option value="">Choose a starting recipe</option>{Object.entries(presets).map(([key,p])=><option key={key} value={key}>{p.label}</option>)}</select></GuidedField>
      <div className={styles.basicFields}>{select("mapType","Map type","Choose a continent chart for one main landmass, or a World overview for several continents or an island-only landscape. Both become editable drawings when accepted.",["world","continent"])}{number("continents","Major continents","Choose how many main continents to generate, from zero to six. A continent chart has one. Zero leaves only your chosen offshore islands.",spec.settings.mapType==="continent"?1:0,spec.settings.mapType==="continent"?1:6)}{number("islands","Offshore islands","Add zero to 32 islands around the main landmasses. If they cannot fit with clear separation, try a different seed or fewer islands. Each accepted island has an editable outline.",0,32)}{select("biome","Terrain tendency","Choose the broad landscape you want to see, such as northern woods or arid terrain. This guides the illustrated terrain; it does not calculate weather or climate.",["temperate","northern","arid","tropical","mixed"])}{select("style","Map appearance","Choose Parchment, Illuminated or Night to change the chart's visual treatment. The generated shapes remain the same, and you can restyle the accepted map later.",["parchment","illuminated","night"])}</div>
      <details className={styles.advanced}><summary>Advanced geography settings</summary><div className={styles.basicFields}>
        {number("landCoverage","Approximate land coverage (%)","Aim for roughly this much land, from 10 to 55 percent. Shape and available ocean space can reduce the result. Check the actual coverage in the preview before accepting it.",10,55)}
        {select("size","Landmass size","Choose smaller or larger landmasses within the chart, or Varied for a mixture. This changes the preview's outlines, not the scale of any saved map.",["small","medium","large","varied"])}
        {select("shape","General shape","Choose a broad outline style, such as a long continent or a crescent. The resulting coastline can still be reshaped point by point after saving.",["balanced","elongated","crescent","varied"])}
        {number("ruggedness","Coastline ruggedness (%)","Raise this for more headlands and small coastal inlets; lower it for smoother shores. Bay depth is a separate choice. The preview shows how this seed responds.",0,100)}
        {number("mountains","Mountain density (%)","Raise this for more illustrated peaks along mountain ranges, or use zero for none. Peaks remain editable terrain strokes rather than calculated elevation.",0,100)}
        {number("forest","Woodland coverage tendency (%)","Raise this for fuller groups of trees, or use zero for no woodland. This is a landscape tendency, not an exact percentage of forested land; check the preview.",0,100)}
        {number("rivers","Rivers and streams","Choose zero to twelve rivers flowing toward the coast. Narrow landmasses may not fit every route; reduce the count if generation fails. Accepted rivers remain editable paths.",0,12)}
        {number("lakes","Lakes","Choose zero to ten inland lake groups. After accepting the map, you can move or restyle these painted groups just like other terrain.",0,10)}
      </div></details>
      <details className={styles.advanced}><summary>Place major features</summary><p>Directions are relative to the map for the main continent, and to each landmass for terrain. Detailed placement is optional.</p><div className={styles.basicFields}>
        {placement("landPosition","Continent position","For one main continent, choose where it sits on the chart. With several continents, their positions are chosen together to keep them separate.",regions,spec.settings.continents!==1)}
        {placement("islandPosition","Island placement","Scatter islands across available ocean, or favor one side of the first continent, such as islands off its eastern shore. The preview lets you check their actual placement.",["scattered",...regions])}
        {placement("ruggedCoast","Rugged coast","Choose which side of each landmass should have the finer headlands and inlets, or use all sides. This changes the generated outline, which remains editable.",["all","north","south","east","west"])}
        {placement("additionalBaySide","Additional bay coast","Add a bay on another side, such as an eastern inlet alongside western bays. None keeps only your main bay choices. The preview shows the new coastal shape.",["none","north","south","east","west"])}
        {placement("baySide","Bay side","Choose a side for the main bays, or all sides to distribute them around the landmass. Bay count and depth control how many and how deeply they cut into the coast.",["all","north","south","east","west"])}
        <GuidedField label="Bay count" help="Choose zero to four major bays on each continent. This changes its outline; smaller islands can still have irregular shores when the count is zero."><input className="st-control" type="number" min={0} max={4} required value={spec.plan.bays} onChange={e=>plan("bays",Number(e.target.value))}/></GuidedField>
        <GuidedField label="Bay depth" help="Choose one for shallow bays or three for deeper inlets. Review the coastline in the preview; you can sculpt or reshape it after accepting the map."><input className="st-control" type="number" min={1} max={3} required value={spec.plan.bayDepth} onChange={e=>plan("bayDepth",Number(e.target.value))}/></GuidedField>
        {placement("mountainRegion","Mountain region","Place the mountain ranges in a broad part of each landmass, such as the north. This guides their location; the seed supplies their individual bends and peaks.",regions)}
        {placement("mountainOrientation","Range orientation","Choose how the mountain ranges run, such as north to south, or Varied for different directions. Their editable strokes still have natural bends.",["north-south","east-west","northeast-southwest","northwest-southeast","varied"])}
        <GuidedField label="Mountain ranges" help="Choose one to three ranges on each main continent when mountains are enabled. Islands use a smaller range. Mountain density controls the number of illustrated peaks."><input className="st-control" type="number" min={1} max={3} required value={spec.plan.mountainRanges} onChange={e=>plan("mountainRanges",Number(e.target.value))}/></GuidedField>
        {placement("forestRegion","Woodland region","Favor woodland in a part of each landmass, such as the south, or let the seed choose. Trees become editable painted groups after you accept the preview.",["automatic",...regions])}
        {placement("riverDirection","River outlet direction","Choose the side where rivers reach the coast, or Automatic for varied outlets. A bay may become a river mouth; lake-connected river networks are not generated.",directions)}
        {placement("lakeRegion","Lake region","Favor lakes in a broad part of the landmass, or let the seed choose inland positions. Check the preview; accepted lake groups can be moved later.",["automatic",...regions])}
      </div></details>
      </fieldset>}
      <GuidedField label="Generation seed" help="Keep this seed to reproduce the same landscape with the same settings and landscape edition. New seed and preview tries a different arrangement. Accepting it creates a separate map and keeps your earlier charts."><input className="st-control" required maxLength={64} value={spec.seed} onChange={e=>change({...spec,seed:e.target.value})}/></GuidedField>
      <div className={styles.actions}><button className="st-button" type="submit" disabled={!ready}>{busy?"Generating preview...":"Preview map"}</button><button className="st-button is-secondary" type="button" disabled={!ready} onClick={()=>{const next={...spec,seed:crypto.randomUUID()};change(next);void buildPreview(next);}}>New seed and preview</button></div>
    </fieldset></form>
    {busy&&<p role="status">Building your landscape in the background. <button type="button" className="st-button is-secondary" onClick={cancelPreview}>Cancel preview</button></p>}
    {error&&<p role="alert" className={styles.feedback}>{error} Your settings and preview are retained.</p>}
    <div className={styles.preview} aria-label="Generated map preview" aria-busy={busy}>{preview?<><div className={styles.previewHeading}><h3>{stale?"Preview needs updating":"Unsaved preview"}</h3><p role="status">{preview.stats.continents} continents · {preview.stats.islands} islands · {preview.stats.landCoverage}% land · {preview.stats.drawings} editable drawings</p></div><svg viewBox="0 0 2000 1200" aria-label="Generated map artwork"><CartographyScene draft={preview.draft} id={`generation-${sceneId}`} editable={false}/></svg>{preview.notices.map(n=><p key={n}>{n}</p>)}{stale&&<p>Your landscape choices or reviewed description changed. Preview again before saving so you can see the result.</p>}</>:<div className={styles.empty}><h3>Your new geography starts here</h3><p>Choose settings or describe geography, then preview the result. Nothing is saved until you accept it.</p></div>}</div>
    <form onSubmit={accept} className={styles.accept}><fieldset disabled={pending||busy}>
      <GuidedField label="Generated map name" help="Name the new chart you will save, such as Eastern Island Survey. After saving, you can rename its individual places and continue editing the drawing."><input className="st-control" required maxLength={160} value={name} onChange={e=>{setName(e.target.value);setDirty(true);}}/></GuidedField>
      <GuidedField label="Map description" help="Add notes about this chart's purpose or landscape. These notes do not affect generation. The original description and settings used to create it remain in its creation record."><textarea className="st-control" maxLength={12000} rows={2} value={description} onChange={e=>{setDescription(e.target.value);setDirty(true);}}/></GuidedField>
      <button className="st-button" disabled={!preview||stale||pending||busy}>{pending?"Saving...":"Save as new editable map"}</button><p>Saving opens the existing editor. It creates a new map and never replaces another chart.</p>
    </fieldset></form>
  </section>;
}
