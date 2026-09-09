"use client";
import { useEffect, useState } from "react";
import type { FrozenActionSourceSnapshot } from "@/features/tabletop-operations/action-effect-bridge";
import type { CombatScreenData, CombatScreenScope } from "./screen-types";
import { readCombatTargetAnatomy } from "./command-actions";
import styles from "./combat-screen.module.css";
export function EffectOptions({ scope, source, roster, values, onChange }: { scope: CombatScreenScope; source: FrozenActionSourceSnapshot;
  roster: CombatScreenData["roster"]; values: Record<string, { poolKey?: string; hitLocationNumber?: number }>; onChange: (value: typeof values) => void }) {
  const [locations, setLocations] = useState<Record<number, Awaited<ReturnType<typeof readCombatTargetAnatomy>>>>({});
  const targets = JSON.stringify([...new Set(source.effects.flatMap((effect) => effect.targetParticipantIds))]);
  useEffect(() => { let active = true; void Promise.all((JSON.parse(targets) as number[]).map(async (id) => [id, await readCombatTargetAnatomy(scope, id)] as const)).then((rows) => { if (active) setLocations(Object.fromEntries(rows)); }).catch(() => {}); return () => { active = false; }; }, [scope, targets]);
  return <>{source.effects.filter((entry) => entry.effect?.kind === "health.damage" || entry.effect?.kind === "health.heal" && entry.effect.scope === "area").flatMap((entry) => entry.targetParticipantIds.map((target) => {
    const key = source.kind === "spell" ? `${entry.instruction.spellEffectId}:${target}` : source.kind === "creature-ability" ? `${entry.instruction.effectKey}:${target}` : source.kind === "derived-ability" ? String(entry.instruction.sortOrder) : entry.key.replace("item-effect:", "");
    const selection = values[key];
    return <label key={`${entry.key}:${target}`} className="st-field">{roster.find((member) => member.participantId === target)?.name}: {entry.effect?.kind === "health.heal" ? "area to heal" : "damage location"}
      <select className="st-control" value={selection?.hitLocationNumber ?? ""} onChange={(event) => { const location = locations[target]?.find((entry) => String(entry.number) === event.target.value); if (location) onChange({ ...values, [key]: { hitLocationNumber: location.number, ...(location.poolKey ? { poolKey: location.poolKey } : {}) } }); }}><option value="">Select an authored location</option>{locations[target]?.map((entry) => <option value={entry.number} key={entry.number}>{entry.name}</option>)}</select>
      <span className={styles.muted}>Check the action again after choosing its application.</span></label>;
  }))}</>;
}
