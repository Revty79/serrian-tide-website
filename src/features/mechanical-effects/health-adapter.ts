import {
  applyAreaHealing,
  applyFullBodyHealing,
  applyLocalizedDamage,
  resolveActiveHealthView,
} from "../active-state/health-rules";
import type { ActiveHealthAnatomy, ActiveHealthState } from "../active-state/models";

import type {
  HealthDamageEffect,
  HealthHealEffect,
  MechanicalEffectApplication,
  MechanicalEffectHealthResult,
  MechanicalEffectPoolDamageChange,
} from "./models";

type HealthEffect = HealthHealEffect | HealthDamageEffect;

function resolvePoolChanges(
  before: MechanicalEffectHealthResult["before"],
  after: MechanicalEffectHealthResult["after"],
): MechanicalEffectPoolDamageChange[] {
  const beforeByKey = new Map(before.tracks.map((track) => [track.key, track]));
  const afterByKey = new Map(after.tracks.map((track) => [track.key, track]));
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);

  return [...keys].flatMap((poolKey) => {
    const beforeTrack = beforeByKey.get(poolKey);
    const afterTrack = afterByKey.get(poolKey);
    const beforeDamage = beforeTrack?.damage ?? 0;
    const afterDamage = afterTrack?.damage ?? 0;
    if (beforeDamage === afterDamage) return [];
    return [{
      poolKey,
      poolName: afterTrack?.name ?? beforeTrack?.name ?? poolKey,
      before: beforeDamage,
      after: afterDamage,
    }];
  });
}

export function resolveHealthMechanicalEffect(
  effect: HealthEffect,
  application: MechanicalEffectApplication,
  state: ActiveHealthState,
  anatomy: ActiveHealthAnatomy,
): MechanicalEffectHealthResult {
  let nextState: ActiveHealthState;

  if (effect.kind === "health.heal") {
    if (effect.scope === "full-body") {
      nextState = applyFullBodyHealing(state, effect.amount);
    } else {
      nextState = applyAreaHealing(state, anatomy, application.poolKey?.trim() ?? "", effect.amount);
    }
  } else {
    nextState = applyLocalizedDamage(state, anatomy, {
      amount: effect.amount,
      hitLocationNumber: application.hitLocationNumber,
      poolKey: application.poolKey,
    });
  }

  const before = resolveActiveHealthView(anatomy, state);
  const after = resolveActiveHealthView(anatomy, nextState);
  return {
    previousState: state,
    nextState,
    before,
    after,
    totalDamage: { before: before.totalDamage, after: after.totalDamage },
    poolDamage: resolvePoolChanges(before, after),
  };
}
