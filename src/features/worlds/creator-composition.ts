import { isRepairBFamily, peoplesComposition, type Composition } from "./peoples-composition";
import { isPoliticalFamily, politicsComposition } from "./politics-composition";

export function getCreatorComposition(family: string): Composition | null {
  return isRepairBFamily(family) ? peoplesComposition[family] : isPoliticalFamily(family) ? politicsComposition[family] : null;
}
export function hasCreatorWorkshop(family: string): boolean {
  return family === "individual" || family === "cosmicPrinciple" || !!getCreatorComposition(family);
}
