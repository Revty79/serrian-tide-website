import type { MechanicsRule } from "./models";
export function summarizeMechanicsRule(rule: MechanicsRule): string {
  const kind = rule.kind === "capability" ? `Capability (${rule.domain})` : "Manual / G.O.D.";
  return [`${kind}: ${rule.title}`, rule.description, rule.limitations && `Limitations: ${rule.limitations}`,
    rule.notes && `Notes: ${rule.notes}`, rule.kind === "manual" ? `G.O.D. determination: ${rule.adjudication}` : ""].filter(Boolean).join("\n");
}
