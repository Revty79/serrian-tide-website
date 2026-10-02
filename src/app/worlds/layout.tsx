import { redirect } from "next/navigation";

import { AuthenticatedNavigation } from "@/app/authenticated-navigation";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

export default async function WorldsLayout({ children }: { children: React.ReactNode }) {
  const access = await requireGodOrAdminAccessContext().catch(() => redirect("/access"));
  return (
    <>
      <AuthenticatedNavigation
        context="worlds"
        roles={access.roles}
        username={access.session.user.username ?? access.session.user.name}
      />
      {children}
    </>
  );
}
