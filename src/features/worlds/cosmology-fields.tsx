"use client";
import { useId } from "react";
import { Field } from "./world-field";
import { cosmicKinds, cosmologyFields, cosmologyFieldHelp, isCosmologyFamily } from "./cosmology";
import type { LoreDraft } from "./peoples";
import styles from "./peoples.module.css";

export function CosmologyCharacteristics({draft,patch}:{draft:LoreDraft;patch:(value:Partial<LoreDraft>)=>void}) {
  const kindList=useId();
  if(!isCosmologyFamily(draft.family))return null;
  const family=draft.family;
  return <details className={styles.section}><summary>Characteristics and authored detail</summary><p>Every characteristic is optional. Select saved identities for relationships; no cosmic hierarchy, ordinary physics or measurable distance is required.</p><div>{Object.entries(cosmologyFields[family]).map(([key,label])=><Field key={key} label={label} help={cosmologyFieldHelp(key)}>{key==="classification"?<><input list={kindList} value={draft.fields[key]??""} maxLength={160} onChange={e=>patch({fields:{...draft.fields,[key]:e.target.value}})}/><datalist id={kindList}>{cosmicKinds[family].map(kind=><option key={kind} value={kind}/>)}</datalist></>:<textarea rows={3} value={draft.fields[key]??""} onChange={e=>patch({fields:{...draft.fields,[key]:e.target.value}})}/>}</Field>)}</div></details>;
}
