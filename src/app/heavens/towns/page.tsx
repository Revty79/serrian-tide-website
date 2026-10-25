import { redirect } from "next/navigation";

import { requireGodOrAdminAccessContext } from "@/lib/server-access";

export default async function TownsPage() {
  await requireGodOrAdminAccessContext().catch(() => redirect("/access"));
  redirect("/worlds/towns");
}
