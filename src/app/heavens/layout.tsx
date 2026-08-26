import { redirect } from "next/navigation";

import { AuthenticatedNavigation } from "@/app/authenticated-navigation";
import { requireAccessContext } from "@/lib/server-access";

export default async function HeavensLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAccessContext("god").catch(() => redirect("/access"));
  return (
    <>
      <AuthenticatedNavigation
        context="heavens"
        roles={access.roles}
        username={access.session.user.username ?? access.session.user.name}
      />
      {children}
    </>
  );
}
