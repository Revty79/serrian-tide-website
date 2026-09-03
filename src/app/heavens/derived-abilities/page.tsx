import { redirect } from "next/navigation";

import { requireGod } from "@/lib/server-access";

import "../skills/skills.css";
import {
  getDerivedAbilityEditorReferences,
  listDerivedAbilities,
} from "./actions";
import "./derived-abilities.css";
import { DerivedAbilityWorkspace } from "./derived-ability-workspace";

export default async function DerivedAbilitiesPage() {
  const session = await requireGod().catch(() => redirect("/access"));
  const [initialLibrary, references] = await Promise.all([
    listDerivedAbilities({ page: 1, pageSize: 40 }),
    getDerivedAbilityEditorReferences(),
  ]);
  return (
    <DerivedAbilityWorkspace
      initialLibrary={initialLibrary}
      references={references}
      username={session.user.username ?? session.user.name ?? "G.O.D."}
    />
  );
}
