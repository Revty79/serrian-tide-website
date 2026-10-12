import { exact, isAstronomyFamily } from "./astronomy";
import { elapsedDaySchema } from "./calendar-dates";
import type { LoreDraft, LoreFamily } from "./peoples";
import type { Composition } from "./peoples-composition";

export const repairFFamilies = ["skyCycle", "skyObservation", "skyCalendarLink"] as const;
export type RepairFFamily = typeof repairFFamilies[number];
const q = (section: string, label: string, help: string) => ({ section, label, help: `${help} Optional; use your own wording or leave this undecided. Up to 50,000 characters.` });
const s = (id: string, label: string, introduction: string) => ({ id, label, introduction });
const c = (kind: LoreFamily, role: string, label: string) => ({ kind, role, label });
const body = c("celestial", "associated celestial creation", "Add celestial body"), realm = c("realm", "described in this realm", "Add realm"), cycle = c("skyCycle", "associated sky pattern", "Add sky cycle"), observation = c("skyObservation", "attributed observation", "Add sky observation"), association = c("skyCalendarLink", "related calendar tradition", "Add sky calendar account"), person = c("individual", "observer or source", "Add observer"), culture = c("culture", "attributed tradition", "Add culture"), belief = c("belief", "attributed belief", "Add belief"), principle = c("cosmicPrinciple", "associated rule", "Add rule of reality");
export const skyPeriodCopy: Record<RepairFFamily, { introduction: string; account: string; state: string; examples: string }> = {
  skyCycle: { introduction: "Describe periods when a pattern or model was understood differently. These historical accounts do not change calculation anchors or automatically create events.", account: "How was this sky pattern understood during this time?", state: "What was this pattern's described state?", examples: "changing, interrupted, disputed, no longer observed or unknown" },
  skyObservation: { introduction: "Keep stretches of observation or differing accounts separate from when something allegedly happened. Overlapping witnesses may disagree.", account: "What was observed or claimed during this time?", state: "How was this account regarded?", examples: "reported, predicted, disputed, exceptional or unknown" },
  skyCalendarLink: { introduction: "Describe periods of a calendar tradition or claim, including changes and disagreements. An unknown ending does not establish continuing use.", account: "How was this calendar connection understood during this time?", state: "What was this tradition's status?", examples: "ceremonial, observed, disputed, abandoned or unknown" },
};
function compose(family: RepairFFamily, value: Composition): Composition {
  return { ...value, savedConnectionsOnly: true, sections: [...value.sections,
    s("connections", "Connected creations", "Choose real saved bodies, realms, observers and other accounts, keeping their roles in your own words."),
    s("calendars", "Calendar connections", "Choose particular saved calendar rules and describe their meaning. An association does not change a calendar."),
    s("places", "Places & viewpoints", "Connect existing Atlas places without inventing an observatory or a location from prose."),
    s("periods", "Periods & perspectives", skyPeriodCopy[family].introduction),
    s("history", "History", "Account dates, alleged observations, calculation anchors, periods and actual events keep their separate meanings."),
    s("custom", "Original details", "Give any other idea its own title and account."),
    s("private", "Private notes", "Protecting any sky field, calendar association or revealing source withholds the whole account and its projections from ordinary knowledge."),
  ] };
}
export const astronomyComposition: Record<RepairFFamily, Composition> = {
  skyCycle: compose("skyCycle", {
    subject: "sky pattern or cycle", introduction: "Describe a changing moon, impossible season, moving star or an original sky pattern. A moon could change color or a magical sun move backward. Begin with a name and a story; repeating calculations are an optional way to develop it.", overview: "Introduce this sky pattern", overviewHelp: "Give an impression of what happens, such as a constellation appearing only during storms. A narrative account is enough; it does not need a repeating period, conventional physics or a calculation.",
    sections: [s("identity", "What happens in the sky?", "Name the pattern and describe it before choosing any advanced settings."), s("change", "Changes & exceptions", "Patterns may change direction, be interrupted or never repeat exactly."), s("sources", "Accounts & changes over time", "Keep who describes the pattern and how their model has changed."), s("cycle", "Optional calculations", "Define exact recurrence only when you want it. Qualitative phases and unknown anchors remain valid authored information.")],
    fields: {
      classification: q("identity", "What kind of sky pattern is this?", "Use an original category, such as a seven-year season, changing moon or storm-born constellation."), behavior: q("identity", "What happens in this pattern?", "Describe appearances, colors, seasons or something original. Written behavior does not generate a mathematical cycle."),
      progression: q("change", "How does it move or change?", "Describe direction, backward motion, an irregular sequence or stillness. Named phases can be developed separately in Optional calculations."), conditions: q("change", "What can interrupt or alter it?", "Describe storms, promises or other exceptional conditions. Prose does not calculate triggers or override a saved recurrence."),
      perspective: q("sources", "Who describes this pattern, and why?", "Attribute witnesses, evidence and competing accounts. An observer's model need not be objective truth."), calculation: q("sources", "What about this model should remain confidential?", "Describe confidential knowledge or calculations in your own words. To actually keep a sky source out of ordinary knowledge and projections, use the protection controls in Private notes."), development: q("sources", "How has the model or pattern changed?", "Keep revisions, abandoned interpretations and disagreements. Authored periods, actual events and calculation applicability stay separate."),
    },
    connections: [body, realm, cycle, observation, person, culture, belief, principle], connectionHelp: "Choose actual saved celestial creations, realms, observers and models with original roles. Added connections require saved identities; uncertain sources belong in narrative answers rather than invented observers or bodies.", placeHelp: "Choose actual viewing places or areas associated with the pattern. This does not create an observatory, change geography or grant travel.", eventHelp: "Reuse or explicitly write observations, discoveries or model changes in History. A repeating rule and a written description do not automatically create historical events.",
  }),
  skyObservation: compose("skyObservation", {
    subject: "sky observation or account", introduction: "Describe something observed, predicted, attributed to a source or reported as an exceptional event. Different observers can disagree. Begin with your account's name; this records a perspective and does not automatically establish a fact or create History.", overview: "Introduce this sky account", overviewHelp: "Describe the observation, prediction or claim in your own words. Keep this account distinct from a calculated occurrence and from any canonical event you deliberately connect in History.",
    sections: [s("identity", "What is this account?", "Distinguish a witnessed observation, forecast or exceptional claim."), s("experience", "What was seen or predicted?", "Keep the named state and circumstances in the source's own terms."), s("sources", "Observers & interpretations", "Different witnesses may keep separate, conflicting accounts.")],
    fields: {
      classification: q("identity", "What kind of sky phenomenon is described?", "Use a familiar term or an original category, such as a listening eclipse or a moon's changing color."), accountKind: q("identity", "Was this observed, predicted or claimed?", "Describe a direct observation, forecast, attributed claim, disputed event or original account type. This wording does not establish objective truth."),
      state: q("experience", "What state or appearance was described?", "Use a name or description, such as The Silver Awakening. A written name does not select or create a calculated phase."), conditions: q("experience", "Under what circumstances was it described?", "Describe conditions, exceptions or what the source could observe. The date of this authored account, alleged observation and actual event remain distinct."),
      perspective: q("sources", "Who observed or described it?", "Attribute testimony, records or competing witnesses. Connect actual saved observers separately without creating one from a name in prose."), interpretation: q("sources", "How is this account interpreted or disputed?", "Keep uncertainty, disagreement and exceptional explanations. Another observer may retain a separate account without being merged into this one."),
    },
    connections: [body, cycle, realm, person, culture, belief, observation, principle], connectionHelp: "Choose real saved observers, bodies, patterns and sources. Added connections require saved identities. Attribute uncertain witnesses or predictions in narrative answers instead of placeholder identities.", placeHelp: "Link existing viewpoints or places concerning this account. A viewing place does not automatically become an observatory.", eventHelp: "Connect an existing event or deliberately write one when appropriate. An observation or forecast alone does not create an event; its source, alleged time and account date stay distinct.",
  }),
  skyCalendarLink: compose("skyCalendarLink", {
    subject: "calendar and sky account", introduction: "Describe a calendar tradition or claim concerning the sky. A culture might name a month for a constellation, celebrate a star's appearance or describe a year beginning with a moon phase. Choose actual calendar rules when adding an association; this account does not rewrite them.", overview: "Introduce this calendar tradition", overviewHelp: "Explain what the connection means. An observational, ceremonial or defining claim remains authored information until an explicit mathematical correspondence is separately supported.",
    sections: [s("identity", "What is this tradition?", "Name the connection between a calendar and the sky."), s("meaning", "Convention & meaning", "Keep observed signs, ceremonies and claimed definitions distinct."), s("sources", "People & perspectives", "Attribute who follows or describes the connection without assigning ownership or use automatically.")],
    fields: {
      classification: q("identity", "What kind of calendar connection is this?", "Describe a festival sign, month naming, seasonal tradition or an original association."), convention: q("meaning", "Is this an observed sign, ceremony or defining claim?", "Distinguish watching for a star, celebrating its appearance and claiming it defines a year. None silently alters calendar rules."), interpretation: q("meaning", "What does the sky mean for this calendar?", "Describe the claimed relationship, including incompatible or disputed accounts. Exact calendar versions and original roles can be connected in Calendar connections."), perspective: q("sources", "Who follows or describes this connection?", "Attribute cultures, communities, witnesses or evidence. Choose existing creations separately; this does not establish a calendar's owner or infer who uses it."),
    },
    connections: [cycle, body, observation, culture, c("population", "community describing the tradition", "Add community"), person, belief, association], connectionHelp: "Choose real saved sky patterns, bodies, observations and communities, with your own roles and descriptions. Added connections require saved identities. Calendar versions are selected separately in Calendar connections.", placeHelp: "Connect real places associated with a tradition, without inferring where a calendar is used or maintained.", eventHelp: "Reuse or explicitly write events concerning the tradition. A claimed calendar definition, recurring phase or ceremonial association does not generate History or alter chronology.",
  }),
};
export function repairFFieldSection(family: RepairFFamily, key: string): string { return astronomyComposition[family].fields[key]?.section ?? "custom"; }
export function repairFIssueSection(family: RepairFFamily, path: PropertyKey[]): string {
  const root = String(path[0] ?? "");
  if (root === "fields") return repairFFieldSection(family, String(path[1] ?? ""));
  return ({ cycle: "cycle", calendarBindings: "calendars", participants: "connections", geographies: "places", periods: "periods", sections: "custom", protectedFields: "private", visibility: "private", privateNotes: "private", historyRefs: "history", milestones: "history", time: "history", calendarDate: "history", datingSystemId: "history", datingSystemRevision: "history", accuracy: "history", narrative: "history" } as Record<string, string>)[root] ?? "identity";
}

/** Locate cross-field domain errors in the form without changing validation or arithmetic. */
export function astronomyIssuePath(draft: LoreDraft, path: PropertyKey[], message: string): PropertyKey[] {
  if (!isAstronomyFamily(draft.family)) return path;
  if (path.length === 1 && path[0] === "cycle") {
    if (message.includes("World-year cycles use year units")) return ["cycle", "unit"];
    if (message.includes("two conflicting origins")) return ["cycle", "anchor"];
    if (message.includes("Calendar days cannot supply")) return ["cycle", "anchorCalendar"];
    if (message.includes("trillion-year range")) {
      const key = (["anchor", "beginning", "ending"] as const).find(key => { const value = draft.cycle?.[key]; return value && /^-?\d+$/.test(value) && (BigInt(value) < -BigInt("1000000000000") || BigInt(value) > BigInt("1000000000000")); });
      return ["cycle", key ?? "anchor"];
    }
    if (message.includes("ending must not precede")) return ["cycle", "ending"];
    if (message.includes("phase durations must sum")) return ["cycle", "phases", 0, "duration"];
    if (message.includes("phase identity")) return ["cycle", "phases"];
    if (message.includes("window cannot exceed")) return ["cycle", "window"];
  }
  if (!path.length && message.includes("calendar binding identity")) return ["calendarBindings"];
  return path;
}
export function astronomySaveIssue(message: string): { path: PropertyKey[]; message: string } | null {
  if (message.includes("shared day reference")) return { path: ["cycle", "anchor"], message };
  if (message.includes("Hour/minute periods") || message.includes("hours-per-day")) return { path: ["cycle", "unit"], message };
  if (message.includes("calendar") && (message.includes("anchor") || message.includes("anchored"))) return { path: ["cycle", "anchorCalendar"], message };
  if (message.includes("calendar version in this World") || message.includes("selected calendar version changed") || message.includes("Restore this calendar version")) return { path: ["calendarBindings"], message };
  return null;
}

/** Authoritative scalar parsers guard cross-field refinements while the form is incomplete. */
export function astronomyInputIssues(draft: LoreDraft): { path: PropertyKey[]; message: string }[] {
  if (!isAstronomyFamily(draft.family) || !draft.cycle) return [];
  const cycle = draft.cycle, issues: { path: PropertyKey[]; message: string }[] = [];
  const number = (value: string | null, path: PropertyKey[], positive: boolean) => {
    if (value === null) return;
    try { const result = exact(value); if (positive && result.n <= BigInt("0")) issues.push({ path, message: "Enter a positive duration. Leave it blank if it is unknown." }); }
    catch { issues.push({ path, message: "Enter an exact integer, decimal or fraction with a nonzero denominator. Scientific notation is unsupported." }); }
  };
  number(cycle.period, ["cycle", "period"], true); number(cycle.offset, ["cycle", "offset"], false); number(cycle.window, ["cycle", "window"], true);
  cycle.phases.forEach((phase, index) => number(phase.duration, ["cycle", "phases", index, "duration"], true));
  for (const key of ["anchor", "beginning", "ending"] as const) if (cycle[key] !== null) {
    const parsed = elapsedDaySchema.safeParse(cycle[key]); if (!parsed.success) issues.push({ path: ["cycle", key], message: parsed.error.issues[0].message });
  }
  return issues;
}
