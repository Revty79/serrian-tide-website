import type {GeographicShape} from './geographic';
/** Multipart paths are one choice. Repeated names retain meaningful context. */
export function geographicSourceChoiceLabels(shapes:GeographicShape[]){
 const records=[...new Map(shapes.map(s=>[s.id,s])).values()],names=new Map<string,number>();for(const r of records)names.set(r.name,(names.get(r.name)??0)+1);
 const bases=records.map(r=>({r,label:names.get(r.name)!>1?`${r.name} — ${r.parentName??'World root'}`:r.name})),counts=new Map<string,number>();for(const b of bases)counts.set(b.label,(counts.get(b.label)??0)+1);
 return new Map(bases.map(({r,label})=>[r.id,counts.get(label)!>1?`${label} · ${[r.sourceLabel,r.externalId].filter(Boolean).join(' / ')||r.sourceBounds.map(v=>Number(v.toFixed(3))).join(', ')}`:label]));
}
export function geographicSourceSearch(shape:GeographicShape,search:string){return [shape.name,shape.parentName,shape.sourceLabel,shape.externalId].filter(Boolean).join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase());}
