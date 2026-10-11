import { individualFieldGroups } from "./individuals";
import { cosmologyFields } from "./cosmology";
import type { LoreDraft } from "./peoples";

export const individualSections=[{id:"identity",label:"Identity"},{id:"personality",label:"Personality"},{id:"background",label:"Background"},{id:"community",label:"People & communities"},{id:"places",label:"Important places"},{id:"history",label:"History"},{id:"custom",label:"Original details"},{id:"private",label:"Private notes"}];
export const principleSections=[{id:"identity",label:"The rule"},{id:"scope",label:"Where it applies"},{id:"when",label:"When it applies"},{id:"exceptions",label:"Exceptions"},{id:"accounts",label:"Different accounts"},{id:"history",label:"History"},{id:"custom",label:"Original details"},{id:"private",label:"Private notes"}];
export function pilotFieldSection(family:string,key:string):string {
  if(family==="individual") {
    if(key==="privateReputation")return "private";
    if(key in individualFieldGroups["Identity and public perception"]||key in individualFieldGroups["Existence and physical nature"])return "identity";
    if(key in individualFieldGroups["Personality and behavior"])return "personality";
    if(key in individualFieldGroups["Social identity"]||key==="communication")return "community";
    return "background";
  }
  return ({classification:"identity",statement:"identity",scope:"scope",conditions:"when",exceptions:"exceptions",interpretations:"accounts",provenance:"accounts",development:"history"} as Record<string,string>)[key]??"custom";
}
export function pilotIssueSection(family:string,path:PropertyKey[]):string {
  const first=String(path[0]??"");
  if(first==="fields")return pilotFieldSection(family,String(path[1]??""));
  return ({name:"identity",description:"identity",nameAccounts:"identity",participants:family==="individual"?"community":"scope",geographies:family==="individual"?"places":"scope",periods:"when",historyRefs:"history",milestones:"history",time:"history",datingSystemId:"history",calendarDate:"history",accuracy:"history",narrative:"history",sections:"custom",protectedFields:"private",visibility:"private",privateNotes:"private"} as Record<string,string>)[first]??"identity";
}
export const principleCopy:Record<keyof typeof cosmologyFields.cosmicPrinciple,{label:string;help:string;hint:string}>={
  classification:{label:"Kind of rule",hint:"Optional: use a familiar term or invent your own.",help:"For example, physical law, metaphysical law or a rule about dreams. This category helps you find the rule later."},
  statement:{label:"What does the rule say?",hint:"Describe how reality behaves. This is the main statement; a summary is optional.",help:"For example: A spoken promise casts a shadow until it is fulfilled. Write your own rule in up to 50,000 characters. Worlds records it as setting lore; it does not enforce gameplay."},
  scope:{label:"Where does it apply?",hint:"Describe unusual or uncertain boundaries, then optionally link existing places or realities below.",help:"For example: Only inside the Dream Sea, or wherever a forgotten name is spoken. Selecting a realm keeps a link to that creation; your description can retain exceptions and uncertainty."},
  conditions:{label:"When does it apply?",hint:"Describe triggers or circumstances. Dates and periods below are optional.",help:"For example: Only while two moons are visible, or after someone accepts a gift. These are authored conditions, not an automatic clock or calculation."},
  exceptions:{label:"Are there exceptions?",hint:"Keep exceptions and conflicting rules in your own words.",help:"For example: Promises made in silence cast no shadow. You can describe an exception even when its cause is unknown."},
  interpretations:{label:"Do people disagree about it?",hint:"Attribute competing accounts without choosing which is true.",help:"For example: Sailors say the rule binds everyone; scholars believe it affects only the living. Link saved people or beliefs under scope connections if useful."},
  provenance:{label:"What supports these accounts?",hint:"Describe witnesses, observations or attributed sources; link existing History in its section.",help:"For example: An expedition recorded three unfulfilled vows. Narrative evidence does not create a second historical event or decide whether the rule is true."},
  development:{label:"How has the rule changed?",hint:"Describe changes; use existing History or explicit milestones for dated events.",help:"For example: After the sea vanished, promises cast reflections instead. A historical description alone does not create History entries."},
};
export function individualFieldHelp(key:string,label:string):string {
  const examples:Record<string,string>={aliases:"A familiar nickname, an assumed identity or a disputed name.",titles:"An honorific or a title used by a particular community.",identity:"How this person describes themself, including an original form of identity.",classification:"Your own category, such as historical figure, wanderer or dream-born being.",reputation:"How others see this individual, including conflicting public impressions.",form:"Their appearance, or why they have no fixed physical form.",existence:"How they exist: embodied, imagined, reincarnated or something original.",distinctions:"Recognizable marks, mannerisms or unusual characteristics.",transformations:"Changes of form or different manifestations.",aging:"How time affects them, if it does. Mortality is optional.",personality:"How they tend to think, feel and respond to others.",values:"What matters to them and guides their choices.",beliefs:"Ideas they accept or question. Saved beliefs can also be linked.",motivations:"Why they act and what drives their ambitions.",goals:"What they hope to achieve, including uncertain aims.",fears:"What they fear or avoid.",habits:"Recurring behavior, rituals or quirks.",strengths:"Qualities they rely on, described in narrative terms.",weaknesses:"Limitations or vulnerabilities, without assigning mechanical statistics.",education:"Formal teaching, self-study or other ways of learning.",experience:"What they have learned through living or an original mode of existence.",communication:"How they communicate. Choose saved languages below when relevant.",discoveries:"Things they know or have discovered.",talents:"Narrative talents and accomplishments.",skills:"What they can do in your story; this does not grant Character Skills.",affiliations:"Cultures they identify with; link saved cultures below without replacing this account.",citizenship:"Where they belong, or disputed ideas of homeland.",occupations:"Work, duties and other social roles.",community:"Their place among people and communities.",privateReputation:"Secrets or impressions known only to selected observers. This field starts protected for new individuals.",origins:"Where they came from, including uncertain or conflicting origins. Parents are optional.",development:"Early development, if that idea applies to them.",experiences:"Significant experiences in their biography.",achievements:"What they accomplished, according to this account.",failures:"Setbacks or perceived failures.",returns:"Disappearances, returns or changes in presence.",accounts:"Conflicting versions of their biography and who tells each one."};
  return `${examples[key]??`Describe ${label.toLowerCase()} in your own words.`} Optional; leave it blank when it does not apply. Up to 50,000 characters. No mechanical Character is required.`;
}
export function patchPilotField(draft:LoreDraft,key:string,value:string):Partial<LoreDraft>{return {fields:{...draft.fields,[key]:value}};}

/** Accessible field labels for nested validation; hidden sections never use native submission validation. */
export function pilotIssueLabel(family:string,path:PropertyKey[]):string|undefined {
  const [root,index,next,leaf]=path.map(String),n=Number(index)+1;
  if(root==="name")return family==="individual"?"Name":"Name this rule";
  if(root==="time")return ({year:"Account year",startYear:"Account starting year",endYear:"Account ending year"} as Record<string,string>)[index];
  if(root==="participants")return ({targetId:`Choose connection ${n}`,authoredReference:`Unresolved connection ${n}`,role:`Connection ${n} meaning`,account:`Connection ${n} account`} as Record<string,string>)[next];
  if(root==="sections")return next==="title"?`Custom section ${n} title`:`Custom section ${n} content`;
  if(root==="nameAccounts")return `Name account ${n} ${next==="time"?leaf==="year"?"year":leaf==="startYear"?"starting year":"ending year":next}`;
  if(root==="periods")return `Period ${n} ${next==="beginning"||next==="ending"?`${next} ${leaf==="year"?"year":leaf==="startYear"?"starting year":"ending year"}`:next==="perspective"?"provenance and perspective":next}`;
  if(root==="milestones")return next==="eventType"?`Milestone ${n} type`:next==="draft"?`Milestone ${n} ${leaf==="time"?String(path[4])==="year"?"year":String(path[4])==="startYear"?"starting year":"ending year":leaf}`:undefined;
  if(root==="geographies")return `Place association ${n} ${{geographyId:"place",destinationId:"destination",relationshipType:"relationship"}[next]??next}`;
}
