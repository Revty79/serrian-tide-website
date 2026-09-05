import { redirect } from "next/navigation";

import { requireGodOrAdminAccessContext } from "@/lib/server-access";

import "../skills/skills.css";
import { listRaces } from "./actions";
import "./races.css";
import { RaceWorkspace } from "./race-workspace";

export default async function RacesPage() {
  const { session } = await requireGodOrAdminAccessContext()
    .catch(() => redirect("/access"));

  const initialLibrary = await listRaces({ page: 1, pageSize: 40 });

  return (
    <RaceWorkspace
      initialLibrary={initialLibrary}
      username={session.user.username ?? session.user.name ?? "G.O.D."}
    />
  );
}
