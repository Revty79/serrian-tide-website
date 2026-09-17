import { redirect } from "next/navigation";

import { requireGodOrAdminAccessContext } from "@/lib/server-access";

import "../skills/skills.css";
import {
  listItemAuthoringReferences,
  listItemFacets,
  listItems,
  getItem,
} from "../items/actions";
import "../items/items.css";
import "../items/item-runtime.css";
import { ItemWorkspace } from "../items/item-workspace";

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<{ item?: string; tab?: string }> }) {
  const { session } = await requireGodOrAdminAccessContext().catch(() => redirect("/access"));
  const query = await searchParams;
  const itemId = Number(query.item);
  const selected = Number.isSafeInteger(itemId) && itemId > 0 ? await getItem(itemId) : null;
  const initialItem = selected?.core.catalogScope === "equipment" ? selected : null;
  const [initialLibrary, initialFacets, initialReferences] = await Promise.all([
    listItems({ catalogScope: "equipment", page: 1, pageSize: 40 }),
    listItemFacets("equipment"),
    listItemAuthoringReferences(initialItem?.id),
  ]);

  return (
    <ItemWorkspace
      scope="equipment"
      initialItem={initialItem}
      initialTab={initialItem && query.tab === "weapon" ? "weapon" : "overview"}
      initialLibrary={initialLibrary}
      initialFacets={initialFacets}
      initialReferences={initialReferences}
      username={session.user.username ?? session.user.name ?? "G.O.D."}
    />
  );
}
