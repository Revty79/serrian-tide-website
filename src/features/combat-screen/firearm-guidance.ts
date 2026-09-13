import type { FirearmInstanceView } from "@/features/tabletop-operations/firearm-readiness-service";
import type { FirearmPreparationOperation } from "@/features/tabletop-operations/firearm-readiness";

export const preparationLabels: Record<FirearmPreparationOperation, string> = {
  draw: "Draw weapon", ready: "Ready weapon", load: "Load ammunition", reload: "Reload weapon",
  unload: "Unload weapon", "change-mode": "Change firing mode", cycle: "Cycle weapon", "recover-recoil": "Prepare next shot",
};

/** Guidance describes the authoritative state; it never assumes a load or grants an action. */
export function firearmGuidance(firearm: FirearmInstanceView, selectedModeId = firearm.state?.selectedFiringModeId) {
  const { state, canonical } = firearm;
  const mode = firearm.modes.find((entry) => entry.id === selectedModeId);
  const catalogUpdate = !!state && (
    canonical.capacityRounds !== null && canonical.capacityRounds > 0 && state.capacitySource !== "magazine" && state.capacityRounds !== canonical.capacityRounds
    || ["draw-is-ready", "separate-ready-action"].includes(canonical.readinessMode ?? "") && state.readinessMode !== canonical.readinessMode);
  const setup: string[] = [];
  if (!state) setup.push("The G.O.D. must confirm this exact copy's initial state below.");
  if (state?.capacityRounds == null && canonical.reloadType !== "Magazine" && canonical.capacityRounds === null) setup.push("Set Capacity (rounds) in the weapon's item profile. Legacy capacity text alone does not configure combat.");
  if (!state?.readinessMode && !canonical.readinessMode) setup.push("Set the drawing/readying relationship in the weapon's item profile.");
  if (!canonical.ammunitionName) setup.push("Link this weapon to its exact ammunition item and ammunition profile.");
  if (!mode?.timing || !mode.deliveryCadence || !mode.roundsPerCadence) setup.push("Finish this firing mode's cycling cost, recoil recovery cost, delivery cadence and rounds per cadence in the weapon's item profile. Enter 0 explicitly for a free step.");
  if (!state?.loadedRounds && !["Single", "Magazine"].includes(canonical.reloadType ?? "")) setup.push("Set Reload Type to Single or Magazine in the weapon's item profile.");
  if (catalogUpdate) setup.push("Updated item settings are available. Apply them to this copy below, then complete its preparation.");
  for (const entry of firearm.readiness.blockers) {
    if (entry.classification === "invalid" && !["invalid-firing-mode", "stale-canonical-runtime-divergence"].includes(entry.code)) setup.push(entry.message);
    if (entry.code === "stale-canonical-runtime-divergence" && !catalogUpdate) setup.push("This copy's saved settings differ from the item profile. The G.O.D. must review the settings before firing.");
  }
  const modeChange = !!state && selectedModeId !== state.selectedFiringModeId;
  const needsPreparation = !!state && (modeChange || firearm.equipmentState !== "wielded" || !state.loadedRounds || !state.readied
    || state.requiresCycling || state.requiresRecoilRecovery || firearm.readiness.blockers.some((entry) => entry.code === "insufficient-rounds"));
  const operation: FirearmPreparationOperation = modeChange ? "change-mode"
    : firearm.equipmentState !== "wielded" ? "draw"
      : !state?.loadedRounds || firearm.readiness.blockers.some((entry) => entry.code === "insufficient-rounds") ? "reload"
        : !state.readied ? state.readinessMode === "draw-is-ready" ? "draw" : "ready"
          : state.requiresCycling || state.requiresRecoilRecovery ? "recover-recoil" : "reload";
  const canFire = firearm.readiness.status === "ready" && !modeChange && !!mode?.timing && !!mode.deliveryCadence && !!mode.roundsPerCadence;
  const next = setup.length ? "Complete weapon setup"
    : firearm.preparation ? "Preparation in progress"
      : canFire ? "Ready to fire"
        : operation === "reload" && canonical.reloadType === "Magazine" ? "Load a magazine"
          : preparationLabels[operation];
  return { setup: [...new Set(setup)], catalogUpdate, canFire, next, operation, needsPreparation };
}
