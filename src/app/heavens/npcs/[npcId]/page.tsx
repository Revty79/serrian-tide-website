import { redirect } from "next/navigation";

import { requireGod } from "@/lib/server-access";
import { getActiveHealth } from "@/features/active-state/active-health-service";
import { getActiveEffects } from "@/features/active-state/active-effects-service";
import { getCharacterEquipmentState } from "@/features/items/equipment-state-service";
import { getCharacterItemChargeState } from "@/features/items/item-charge-service";

import { getCreatureNpc } from "../actions";
import "./creature-npc.css";
import { CreatureNpcWorkspace } from "./creature-npc-workspace";

export default async function CreatureNpcPage({
  params,
}: {
  params: Promise<{ npcId: string }>;
}) {
  await requireGod().catch(() => redirect("/access"));
  const { npcId } = await params;
  const id = Number(npcId);
  if (!Number.isInteger(id) || id <= 0) redirect("/heavens/npcs");
  const draft = await getCreatureNpc(id).catch(() => null);
  if (!draft) redirect("/heavens/npcs");
  const [activeHealth, activeEffects, equipmentState, chargeState] = await Promise.all([
    getActiveHealth(id).catch(() => null),
    getActiveEffects(id, true).catch(() => null),
    getCharacterEquipmentState(id).catch(() => null),
    getCharacterItemChargeState(id).catch(() => null),
  ]);
  if (!activeHealth || !activeEffects || !equipmentState || !chargeState) redirect("/heavens/npcs");
  return <CreatureNpcWorkspace initialDraft={draft} initialActiveHealth={activeHealth} initialActiveEffects={activeEffects} initialEquipmentState={equipmentState} initialChargeState={chargeState} />;
}
