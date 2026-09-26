/** Shared display wording only. Stored choices and mechanics are unchanged. */
const labels: Record<string, string> = {
  voluntary: "By choice", involuntary: "Forced by a trigger", either: "By choice or forced by a trigger",
  custom: "G.O.D. ruling described in notes", unspecified: "Not decided", manual: "G.O.D. ruling",
  initiative: "Costs Initiative", time: "Takes time", instant: "Instant",
  "voluntary-end": "Until choosing to return", fixed: "For a set length of time",
  "condition-end": "Until an ending condition is met", scene: "For the scene", encounter: "For the encounter",
  persistent: "Continues until a return rule ends it", "duration-end": "When its time runs out",
  "resource-depletion": "When the required resource runs out", action: "By taking a return action",
  unlimited: "No limit on uses", limited: "Limited number of uses", costs: "Listed resource costs",
  health: "HP", resource: "Named resource", event: "Event", state: "Current circumstances",
};
export function formChoiceLabel(value: string | null | undefined): string {
  return value ? labels[value] ?? value.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ") : "Not decided";
}
export function formRefreshLabel(value: string): string {
  const refresh: Record<string, string> = { round: "Each round", encounter: "Each encounter", scene: "Each scene", manual: "When the G.O.D. restores them", never: "Never", event: "After the named event" };
  return refresh[value] ?? formChoiceLabel(value);
}
