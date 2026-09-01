import type { MechanicalEffect } from "./models";

function formatAmount(amount: number): string {
  return String(amount);
}

export function formatMechanicalEffectSummary(effect: MechanicalEffect): string {
  switch (effect.kind) {
    case "health.heal":
      return effect.scope === "full-body"
        ? `Heal ${formatAmount(effect.amount)} · Full Body`
        : `Heal ${formatAmount(effect.amount)} · Area Applied`;
    case "health.damage":
      return `Deal ${formatAmount(effect.amount)} Damage · Localized`;
    case "condition.apply":
      return `Apply Condition · ${effect.name.trim()}`;
    case "modifier.apply":
      return `${effect.label.trim()} · ${effect.amount > 0 ? "+" : ""}${effect.amount}`;
    case "manual":
      return `Manual · ${effect.title.trim()}`;
  }
}
