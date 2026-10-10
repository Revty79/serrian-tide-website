"use client";
import { dateLabels, type HistoricalTime } from "./history";
import { historicalPeriod } from "./calendar-evolution";
import { Field } from "./world-field";
import { ChronologyYearInput } from "./chronology-year-input";
import styles from "./calendar.module.css";
export function CalendarPeriodFields({value,onChange,label}:{value:HistoricalTime;onChange:(value:HistoricalTime)=>void;label:string}){return <>
  <Field label={`${label} representation`} help="Canonical World-year context only. Known/approximate years, uncertain occurrence windows, durations and unknown time remain distinct. None establishes an exact day."><select value={value.kind} onChange={e=>onChange(historicalPeriod(e.target.value as HistoricalTime["kind"],"year"in value?value.year:"startYear"in value?value.startYear:0))}>{Object.entries(dateLabels).map(([kind,text])=><option key={kind} value={kind}>{text}</option>)}</select></Field>
  {value.kind!=="undated"&&<div className={styles.columns}>{("year"in value?["year"]:["startYear","endYear"]).map(key=><ChronologyYearInput key={`${value.kind}:${key}`} label={`${label} ${key==="year"?"year":key==="startYear"?"starting year":"ending year"}`} system={null} value={(value as unknown as Record<string,number>)[key]} onChange={n=>onChange({...value,[key]:n??NaN} as HistoricalTime)}/>)}</div>}
</>;}
