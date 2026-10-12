import { individualFieldGroups } from "./individuals";
import { cosmologyFields } from "./cosmology";
import type { LoreDraft } from "./peoples";
import { isRepairBFamily, repairBFieldSection, repairBIssueSection } from "./peoples-composition";
import { isPoliticalFamily, repairCFieldSection, repairCIssueSection } from "./politics-composition";
import { politicalRelationshipFamilies } from "./politics";
import { isOrganizationFamily, organizationsComposition, repairDFieldSection, repairDIssueSection } from "./organizations-composition";

import { isRepairEFamily, cosmologyComposition, repairEFieldSection, repairEIssueSection } from "./cosmology-composition";

export const individualSections=[{id:"identity",label:"Identity"},{id:"personality",label:"Personality"},{id:"background",label:"Background"},{id:"community",label:"People & communities"},{id:"places",label:"Important places"},{id:"history",label:"History"},{id:"custom",label:"Original details"},{id:"private",label:"Private notes"}];
export const principleSections=[{id:"identity",label:"The rule"},{id:"scope",label:"Where it applies"},{id:"when",label:"Circumstances"},{id:"periods",label:"Through history"},{id:"exceptions",label:"Exceptions"},{id:"accounts",label:"Different accounts"},{id:"history",label:"History"},{id:"custom",label:"Original details"},{id:"private",label:"Private notes"}];
export function pilotFieldSection(family:string,key:string):string {
  if(isRepairBFamily(family))return repairBFieldSection(family,key);
  if(isPoliticalFamily(family))return repairCFieldSection(family,key);
  if(isOrganizationFamily(family))return repairDFieldSection(family,key);
  if(isRepairEFamily(family))return repairEFieldSection(family,key);
  if(family==="individual") {
    if(key==="privateReputation")return "private";
    if(key in individualFieldGroups["Identity and public perception"]||key in individualFieldGroups["Existence and physical nature"])return "identity";
    if(key in individualFieldGroups["Personality and behavior"])return "personality";
    if(key in individualFieldGroups["Social identity"]||key==="communication")return "community";
    return "background";
  }
  return ({classification:"identity",statement:"identity",scope:"scope",conditions:"when",exceptions:"exceptions",interpretations:"accounts",provenance:"accounts",development:"periods"} as Record<string,string>)[key]??"custom";
}
export function pilotIssueSection(family:string,path:PropertyKey[]):string {
  if(isRepairBFamily(family))return repairBIssueSection(family,path);
  if(isPoliticalFamily(family))return repairCIssueSection(family,path);
  if(isOrganizationFamily(family))return repairDIssueSection(family,path);
  if(isRepairEFamily(family))return repairEIssueSection(family,path);
  const first=String(path[0]??"");
  if(first==="fields")return pilotFieldSection(family,String(path[1]??""));
  return ({name:"identity",description:"identity",nameAccounts:"identity",participants:family==="individual"?"community":"scope",geographies:family==="individual"?"places":"scope",periods:"periods",historyRefs:"history",milestones:"history",time:"history",datingSystemId:"history",calendarDate:"history",accuracy:"history",narrative:"history",sections:"custom",protectedFields:"private",visibility:"private",privateNotes:"private"} as Record<string,string>)[first]??"identity";
}
export const principleCopy:Record<keyof typeof cosmologyFields.cosmicPrinciple,{label:string;help:string;hint:string}>={
  classification:{label:"Kind of rule",hint:"Optional: use a familiar term or invent your own.",help:"For example, physical law, metaphysical law or a rule about dreams. This category helps you find the rule later."},
  statement:{label:"What does the rule say?",hint:"Describe how reality behaves. This is the main statement; a summary is optional.",help:"For example: A spoken promise casts a shadow until it is fulfilled. Write your own rule in up to 50,000 characters. Worlds records it as setting lore; it does not enforce gameplay."},
  scope:{label:"Where does it apply?",hint:"Describe unusual or uncertain boundaries, then optionally link existing places or realities below.",help:"For example: Only inside the Dream Sea, or wherever a forgotten name is spoken. Selecting a realm keeps a link to that creation; your description can retain exceptions and uncertainty."},
  conditions:{label:"Under what circumstances does this rule apply?",hint:"Describe triggers or conditions here. Historical stretches of time belong in Through history; things that happened belong in History.",help:"For example: Only while two moons are visible, or after someone accepts a gift. Leave this undecided if you do not know yet. This description does not calculate a schedule."},
  exceptions:{label:"Are there exceptions?",hint:"Keep exceptions and conflicting rules in your own words.",help:"For example: Promises made in silence cast no shadow. You can describe an exception even when its cause is unknown."},
  interpretations:{label:"Do people disagree about it?",hint:"Attribute competing accounts without choosing which is true.",help:"For example: Sailors say the rule binds everyone; scholars believe it affects only the living. You can link saved people or beliefs in Where it applies without choosing which account is true."},
  provenance:{label:"What supports these accounts?",hint:"Describe witnesses, observations or attributed sources; link existing History in its section.",help:"For example: An expedition recorded three unfulfilled vows. Narrative evidence does not create a second historical event or decide whether the rule is true."},
  development:{label:"How has the rule changed?",hint:"Describe changes; use existing History or explicit milestones for dated events.",help:"For example: After the sea vanished, promises cast reflections instead. A historical description alone does not create History entries."},
};
export function individualFieldHelp(key:string,label:string):string {
  const examples:Record<string,string>={aliases:"A familiar nickname, an assumed identity or a disputed name.",titles:"An honorific or a title used by a particular community.",identity:"How this person describes themself, including an original form of identity.",classification:"Your own category, such as historical figure, wanderer or dream-born being.",reputation:"How others see this individual, including conflicting public impressions.",form:"Their appearance, or why they have no fixed physical form.",existence:"How they exist: embodied, imagined, reincarnated or something original.",distinctions:"Recognizable marks, mannerisms or unusual characteristics.",transformations:"Changes of form or different manifestations.",aging:"How time affects them, if it does. Mortality is optional.",personality:"How they tend to think, feel and respond to others.",values:"What matters to them and guides their choices.",beliefs:"Ideas they accept or question. Saved beliefs can also be linked.",motivations:"Why they act and what drives their ambitions.",goals:"What they hope to achieve, including uncertain aims.",fears:"What they fear or avoid.",habits:"Recurring behavior, rituals or quirks.",strengths:"Qualities they rely on, described in narrative terms.",weaknesses:"Limitations or vulnerabilities, without assigning mechanical statistics.",education:"Formal teaching, self-study or other ways of learning.",experience:"What they have learned through living or an original mode of existence.",communication:"How they communicate. Choose saved languages below when relevant.",discoveries:"Things they know or have discovered.",talents:"Narrative talents and accomplishments.",skills:"What they can do in your story; this does not grant Character Skills.",affiliations:"Cultures they identify with; link saved cultures below without replacing this account.",citizenship:"Where they belong, or disputed ideas of homeland.",occupations:"Work, duties and other social roles.",community:"Their place among people and communities.",privateReputation:"Secrets or impressions known only to selected observers. This field starts protected for new individuals.",origins:"Where they came from, including uncertain or conflicting origins. Parents are optional.",development:"Early development, if that idea applies to them.",experiences:"Significant experiences in their biography.",achievements:"What they accomplished, according to this account.",failures:"Setbacks or perceived failures.",returns:"Disappearances, returns or changes in presence.",accounts:"Conflicting versions of their biography and who tells each one."};
  return `${examples[key]??`Describe ${label.toLowerCase()} in your own words.`} Optional; leave it blank when it does not apply. Up to 50,000 characters.`;
}
export function patchPilotField(draft:LoreDraft,key:string,value:string):Partial<LoreDraft>{return {fields:{...draft.fields,[key]:value}};}

/** Explain a domain validation failure without depending on interface labels. */
export function pilotIssueMessage(family:string,issue:{path:PropertyKey[];message:string}):string {
  const path=issue.path.map(String),root=path[0],leaf=path.at(-1);
  if(family==="origin"&&issue.message.startsWith("Choose at least one saved subject"))return issue.message;
  if(isPoliticalFamily(family)&&root==="participants"&&leaf==="targetId")return politicalRelationshipFamilies.some(f=>f===family)?"Choose a saved creation or remove this undecided connection. Keep uncertain parties in the narrative account.":"Choose a saved creation, or describe one uncertain connection. Keep the two alternatives separate.";
  if(isOrganizationFamily(family)&&root==="participants"&&leaf==="targetId")return organizationsComposition[family].savedConnectionsOnly?"Choose a saved creation or remove this undecided connection. Keep uncertain membership, assignments or partners in the narrative account.":"Choose a saved creation, or describe one uncertain connection. Keep the two alternatives separate.";
  if(isRepairEFamily(family)&&root==="participants"&&leaf==="targetId")return cosmologyComposition[family].savedConnectionsOnly?"Choose a saved creation or remove this undecided connection. Keep uncertain cosmic claims in the narrative account.":"Choose a saved creation, or describe one uncertain connection. Keep the two alternatives separate.";
  if(isRepairBFamily(family)&&root==="participants"&&leaf==="targetId")return "Choose a saved creation, or describe one uncertain connection. Keep the two alternatives separate.";
  if(root==="participants"&&family==="cosmicPrinciple"&&(path.length===2||leaf==="targetId"))return "Choose a saved creation or remove this undecided connection. Describe uncertain reach in the rule's account.";
  if(issue.message.startsWith("Too small")) {
    if(root==="sections"&&leaf==="title")return "Give this original detail a title.";
    if(root==="periods"&&leaf==="label")return "Give this period a name.";
    if(root==="periods"&&leaf==="status")return isPoliticalFamily(family)||isOrganizationFamily(family)||isRepairEFamily(family)?"Describe this period's status, or write unknown.":"Describe the rule's state, or write unknown.";
    if(root==="participants"&&leaf==="role")return "Describe what this connection means.";
    if(root==="milestones"&&leaf==="eventType")return "Describe how this event relates to the creation.";
    if(root==="nameAccounts"&&leaf==="kind")return "Describe how this name was used.";
  }
  if(issue.message.startsWith("Invalid input")&&["year","startYear","endYear"].includes(leaf??""))return "Enter a whole year, or choose an unknown date.";
  if(issue.message.startsWith("Invalid UUID"))return "Choose an available saved creation or place.";
  return issue.message;
}
