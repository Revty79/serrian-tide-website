import type { ActionEffectPlanView, ActionEffectRowView } from "@/features/tabletop-operations/action-effect-plan-service";
import { incomingObject, storedIncomingResolution } from "@/features/incoming-effects/effect-proposal";

export function isItemResultReport(plan: Pick<ActionEffectPlanView, "sourceKind" | "status">) {
  return plan.sourceKind === "item" && ["calculated", "requires-god-ruling", "approved", "partially-applied", "application-failed"].includes(plan.status);
}

export function itemEffectReview(effect: ActionEffectRowView) {
  const settled = ["applied", "declined", "manual-resolved"].includes(effect.status);
  const final = incomingObject(effect.finalValue), authored = incomingObject(effect.authoredValue);
  const definition = incomingObject(final.effect ?? authored.incomingOriginalEffect ?? authored.effect);
  const application = incomingObject(final.application);
  const resolution = storedIncomingResolution(effect.authoredValue);
  const locations = resolution?.input.target.applicationLocations?.filter((entry) => entry.poolKey) ?? [];
  const needsLocation = !settled && definition.kind === "health.damage" && definition.application !== "full-body"
    && !application.poolKey && !Number.isInteger(application.hitLocationNumber) && locations.length > 0;
  const blocked = !settled && (effect.godReviewRequired || !effect.applicationSupported || effect.status === "requires-god-ruling");
  return { settled, definition, application, locations, needsLocation, blocked,
    amount: typeof definition.amount === "number" ? definition.amount : null,
    issues: blocked ? resolution?.issues.map((entry) => entry.message) ?? [] : [],
  };
}
