import type {BusinessBundle,BusinessPerson} from "./world-business";

export function matchesCreationSearch(query:string,values:unknown[]){
 const needle=query.trim().toLocaleLowerCase();
 return !needle||values.some(value=>typeof value==="string"&&value.toLocaleLowerCase().includes(needle));
}

/** A person appears once; each independently saved local role remains accessible. */
export function townPeopleDirectory(business:BusinessBundle,subjectId:string|null,query=""){
 const subjects=new Set<string>();
 if(subjectId){
  subjects.add(subjectId);
  for(const place of business.places)if(place.townId===subjectId&&!place.archived)subjects.add(place.id);
  for(const entrance of business.shopLocations)if(entrance.townId===subjectId&&business.shops.some(s=>s.id===entrance.shopId&&!s.archived))subjects.add(entrance.shopId);
 }
 const people=new Map<string,{id:string;name:string;archived:boolean;individualId:string|null;associations:BusinessPerson[]}>();
 for(const association of business.people){
  if(subjectId&&!subjects.has(association.geographyId))continue;
  const retained=business.residents.find(p=>p.id===association.residentId),individualId=retained?.loreId??association.residentId;
  const individual=business.individuals.find(p=>p.id===individualId),id=individual?.id??association.residentId;
  let person=people.get(id);
  if(!person){person={id,name:individual?.name??retained?.name??"Retained inhabitant",archived:!!individual?.archived||!!retained?.archived,individualId:individual?.id??null,associations:[]};people.set(id,person);}
  person.associations.push(association);
 }
 return [...people.values()].filter(person=>matchesCreationSearch(query,[person.name,...person.associations.flatMap(p=>[p.role,p.note,business.shops.find(s=>s.id===p.geographyId)?.definition.name,business.places.find(v=>v.id===p.geographyId)?.name]) ]));
}
