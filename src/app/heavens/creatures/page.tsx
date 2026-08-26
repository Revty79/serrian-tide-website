import { redirect } from "next/navigation";

import { requireGod } from "@/lib/server-access";

import "../skills/skills.css";
import {
  listChallengeRatingReferences,
  listCreatureFacets,
  listCreatures,
} from "./actions";
import "./creatures.css";
import { CreatureWorkspace } from "./creature-workspace";

export default async function CreaturesPage() {
  const session = await requireGod().catch(() => redirect("/access"));
  const [initialLibrary, initialFacets, initialReferences] = await Promise.all([
    listCreatures({ page: 1, pageSize: 40 }),
    listCreatureFacets(),
    listChallengeRatingReferences(),
  ]);

  return (
    <CreatureWorkspace
      initialLibrary={initialLibrary}
      initialFacets={initialFacets}
      initialReferences={initialReferences}
      username={session.user.username ?? session.user.name ?? "G.O.D."}
    />
  );
}
