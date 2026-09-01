import { redirect } from "next/navigation";

import { requireGod } from "@/lib/server-access";

import "../skills/skills.css";
import {
  listItemAuthoringReferences,
  listItemFacets,
  listItems,
} from "../items/actions";
import "../items/items.css";
import "../items/item-runtime.css";
import { ItemWorkspace } from "../items/item-workspace";

export default async function EquipmentPage() {
  const session = await requireGod().catch(() => redirect("/access"));
  const [initialLibrary, initialFacets, initialReferences] = await Promise.all([
    listItems({ catalogScope: "equipment", page: 1, pageSize: 40 }),
    listItemFacets("equipment"),
    listItemAuthoringReferences(),
  ]);

  return (
    <ItemWorkspace
      scope="equipment"
      initialLibrary={initialLibrary}
      initialFacets={initialFacets}
      initialReferences={initialReferences}
      username={session.user.username ?? session.user.name ?? "G.O.D."}
    />
  );
}
