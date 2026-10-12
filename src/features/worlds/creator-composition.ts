import { isRepairBFamily, peoplesComposition, type Composition } from "./peoples-composition";
import { isPoliticalFamily, politicsComposition } from "./politics-composition";
import { isOrganizationFamily, organizationsComposition } from "./organizations-composition";

import { isRepairEFamily, cosmologyComposition } from "./cosmology-composition";

export function getCreatorComposition(family: string): Composition | null {
  return isRepairBFamily(family) ? peoplesComposition[family] : isPoliticalFamily(family) ? politicsComposition[family] : isOrganizationFamily(family) ? organizationsComposition[family] : isRepairEFamily(family) ? cosmologyComposition[family] : null;
}
export function hasCreatorWorkshop(family: string): boolean {
  return family === "individual" || family === "cosmicPrinciple" || !!getCreatorComposition(family);
}
