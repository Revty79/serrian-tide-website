import { z } from "zod";

export const historicalConditions = ["present", "absent", "not established", "abandoned", "ruined", "destroyed", "rebuilt", "unknown"] as const;
export const historicalPlaceSchema = z.object({geographyId:z.string().uuid(),condition:z.enum(historicalConditions)}).strict();
export type HistoricalPlace = z.infer<typeof historicalPlaceSchema>;
export function placeIsPresent(places:HistoricalPlace[]|undefined,id:string|null|undefined) {
  const condition=places?.find(p=>p.geographyId===id)?.condition;
  return condition===undefined||["present","abandoned","ruined","rebuilt"].includes(condition);
}
export function conditionLabel(condition:typeof historicalConditions[number]) {
  return condition==="present"?"Known present":condition==="absent"?"Known absent":condition==="not established"?"Not yet established":condition==="unknown"?"Unknown / insufficient documentation":condition[0].toUpperCase()+condition.slice(1);
}
