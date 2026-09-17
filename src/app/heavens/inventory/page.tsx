import { redirect } from "next/navigation";

import { requireGodOrAdminAccessContext } from "@/lib/server-access";

import "../skills/skills.css";
import {
  getItem,
  listItemAuthoringReferences,
  listItemFacets,
  listItems,
} from "../items/actions";
import "../items/items.css";
import "../items/item-runtime.css";
import { ItemWorkspace } from "../items/item-workspace";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ item?: string; tab?: string }> }) {
  const { session } = await requireGodOrAdminAccessContext().catch(() => redirect("/access"));
  const query = await searchParams;
  const itemId = Number(query.item);
  const selected = Number.isSafeInteger(itemId) && itemId > 0 ? await getItem(itemId) : null;
  const initialItem = selected?.core.catalogScope === "inventory" ? selected : null;
  const [initialLibrary, initialFacets, initialReferences] = await Promise.all([
    listItems({ catalogScope: "inventory", page: 1, pageSize: 40 }),
    listItemFacets("inventory"),
    listItemAuthoringReferences(initialItem?.id),
  ]);

  return (
    <ItemWorkspace
      scope="inventory"
      initialItem={initialItem}
      initialTab={initialItem && (query.tab === "weapon" || query.tab === "ammunition") ? query.tab : "overview"}
      initialLibrary={initialLibrary}
      initialFacets={initialFacets}
      initialReferences={initialReferences}
      username={session.user.username ?? session.user.name ?? "G.O.D."}
    />
  );
}
