import { redirect } from "next/navigation";

import { AuthenticatedNavigation } from "@/app/authenticated-navigation";
import { requireAccessContext } from "@/lib/server-access";

export default async function RealmsLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAccessContext("player").catch(() => redirect("/access"));
  return (
    <>
      <AuthenticatedNavigation
        context="realms"
        roles={access.roles}
        username={access.session.user.username ?? access.session.user.name}
      />
      {children}
    </>
  );
}
