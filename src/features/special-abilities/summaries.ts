import type { MechanicsRule } from "./models";
import { v2RuleSummary } from "./v2-summaries";
export function summarizeMechanicsRule(rule: MechanicsRule, rules: readonly MechanicsRule[] = []): string {
  const kind = rule.kind === "capability" ? `Capability (${rule.domain})` : rule.kind === "manual" ? "Manual / G.O.D." : rule.kind;
  return [`${kind}: ${rule.title}`, rule.description, rule.limitations && `Limitations: ${rule.limitations}`,
    rule.notes && `Notes: ${rule.notes}`, rule.kind === "manual" ? `G.O.D. determination: ${rule.adjudication}` : "", ...v2RuleSummary(rule, rules)].filter(Boolean).join("\n");
}
