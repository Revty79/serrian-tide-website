import { redirect } from "next/navigation";

import { requireGod } from "@/lib/server-access";

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
  return <CreatureNpcWorkspace initialDraft={draft} />;
}
