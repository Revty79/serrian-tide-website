import { redirect } from "next/navigation";

import { requireGodOrAdminAccessContext } from "@/lib/server-access";

export default async function ShopsPage() {
  await requireGodOrAdminAccessContext().catch(() => redirect("/access"));
  redirect("/worlds/towns?section=shops");
}
