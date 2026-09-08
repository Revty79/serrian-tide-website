import { redirect } from "next/navigation";
import Link from "next/link";

import { getCharacter } from "@/app/characters/actions";
import { CharacterEditor } from "@/app/characters/character-editor";
import "@/app/characters/character.css";
import { getActiveHealth } from "@/features/active-state/active-health-service";
import { getActiveMana } from "@/features/active-state/active-mana-service";
import { getActiveEffects } from "@/features/active-state/active-effects-service";
import { getCharacterEquipmentState } from "@/features/items/equipment-state-service";
import { getCharacterItemChargeState } from "@/features/items/item-charge-service";
import { requirePlayer } from "@/lib/server-access";
import { db } from "@/db";
import { hasActivePlayerInitiativeInTransaction } from "@/features/tabletop-operations/player-encounter-service";
import { getPlayerWeaponGovernance } from "./weapon-governance-actions";
import { PlayerWeaponGovernancePanel } from "./player-weapon-governance-panel";

export default async function PlayerCharacterPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const access = await requirePlayer().catch(() => redirect("/access"));
  const { characterId } = await params;
  const id = Number(characterId);
  if (!Number.isInteger(id) || id <= 0) redirect("/realms");

  const aggregate = await getCharacter(id, false).catch(() => null);
  if (!aggregate) redirect("/realms");
  const [activeHealth, activeMana, activeEffects, equipmentState, chargeState] = await Promise.all([
    getActiveHealth(id).catch(() => null),
    getActiveMana(id).catch(() => null),
    getActiveEffects(id).catch(() => null),
    getCharacterEquipmentState(id).catch(() => null),
    getCharacterItemChargeState(id).catch(() => null),
  ]);
  if (!activeHealth || !activeMana || !activeEffects || !equipmentState || !chargeState) redirect("/realms");
  const [itemUseTimingBlocked, weaponGovernance] = await Promise.all([
    db.transaction((tx) => hasActivePlayerInitiativeInTransaction(tx, id, access.user.id)).catch(() => true),
    getPlayerWeaponGovernance(id).catch(() => null),
  ]);
  if (!weaponGovernance) redirect("/realms");

  return <>
    <aside className="mx-auto mb-4 flex w-[min(88rem,calc(100%-2rem))] flex-wrap items-center justify-between gap-4 rounded-2xl border border-purple-300/25 bg-black/40 p-4 text-slate-100">
      <div><p className="m-0 text-xs font-bold tracking-[.14em] text-purple-200">LIVE TABLETOP</p><strong className="mt-1 block">Requests and Session state now live in one dedicated console.</strong></div>
      <Link className="inline-flex min-h-11 items-center rounded-xl border border-purple-300/60 bg-purple-950/60 px-4 font-bold text-purple-50" href={`/realms/tabletop?character=${id}`}>Open Player Tabletop</Link>
    </aside>
    <PlayerWeaponGovernancePanel view={weaponGovernance} showLiveStatus />
    <CharacterEditor initialAggregate={aggregate} initialActiveHealth={activeHealth} initialActiveMana={activeMana} initialActiveEffects={activeEffects} initialEquipmentState={equipmentState} initialChargeState={chargeState} godMode={false} canOperateRuntime itemUseTimingBlocked={itemUseTimingBlocked} />
  </>;
}
