import { redirect } from "next/navigation";

import { requireGodOrAdminAccessContext } from "@/lib/server-access";

import "../skills/skills.css";
import {
  listItemAuthoringReferences,
  listItemFacets,
  listItems,
} from "../items/actions";
import "../items/items.css";
import "../items/item-runtime.css";
import { ItemWorkspace } from "../items/item-workspace";

export default async function InventoryPage() {
  const { session } = await requireGodOrAdminAccessContext().catch(() => redirect("/access"));
  const [initialLibrary, initialFacets, initialReferences] = await Promise.all([
    listItems({ catalogScope: "inventory", page: 1, pageSize: 40 }),
    listItemFacets("inventory"),
    listItemAuthoringReferences(),
  ]);

  return (
    <ItemWorkspace
      scope="inventory"
      initialLibrary={initialLibrary}
      initialFacets={initialFacets}
      initialReferences={initialReferences}
      username={session.user.username ?? session.user.name ?? "G.O.D."}
    />
  );
}
