import { Pool } from "pg";

import {
  REVIEW_REQUIRED_ATTRIBUTE_KEY,
  buildRecursiveSkillLibrary,
} from "../src/features/skills/recursive-skill-library";

type CountRow = { count: string };

function assertGuardedDevelopmentDatabase(connectionString: string): URL {
  const url = new URL(connectionString);
  const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const database = url.pathname.slice(1);
  if (!loopback.has(url.hostname) || !database.endsWith("_dev")) {
    throw new Error("Recursive Skill audit is restricted to a loopback database ending in _dev.");
  }
  return url;
}

async function main(): Promise<void> {
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const url = assertGuardedDevelopmentDatabase(connectionString);
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query("begin transaction read only");
  const skills = (await client.query<{
    id: number;
    name: string;
    classification: string;
    tier: number | null;
    primaryAttribute: string | null;
    secondaryAttribute: string | null;
    definition: string;
    sourceSystem: string | null;
    sourceExternalId: string | null;
  }>(`select id, name, classification, tier, primary_attribute as "primaryAttribute",
      secondary_attribute as "secondaryAttribute", definition,
      source_system as "sourceSystem", source_external_id as "sourceExternalId"
    from skill order by name, id`)).rows;
  const relationships = (await client.query<{
    id: number;
    skillId: number;
    relatedSkillId: number;
    relationshipType: string;
    sortOrder: number;
  }>(`select id, skill_id as "skillId", related_skill_id as "relatedSkillId",
      relationship_type as "relationshipType", sort_order as "sortOrder"
    from skill_relationship order by skill_id, sort_order, id`)).rows;
  const library = buildRecursiveSkillLibrary(skills, relationships);
  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
  const memberships = new Map<string, Set<number>>();
  for (const path of library.paths) {
    const current = memberships.get(path.attributeGroupKey) ?? new Set<number>();
    current.add(path.endpointSkillId);
    memberships.set(path.attributeGroupKey, current);
  }
  const multipleParentSkills = library.skills
    .filter(({ reviewReasons }) => reviewReasons.some(({ code }) => code === "multiple-parents"))
    .map(({ id, name, parentIds }) => ({ id, name, parentIds }));
  const cycleSkills = library.skills
    .filter(({ reviewReasons }) => reviewReasons.some(({ code }) => code === "cycle"))
    .map(({ id, name }) => ({ id, name }));
  const brokenReferences = library.reviewReasons
    .filter(({ code }) => code === "broken-parent" || code === "broken-child");
  const missingRootAttributes = library.roots
    .filter(({ attributeGroupKey, reviewReasons }) => (
      attributeGroupKey === REVIEW_REQUIRED_ATTRIBUTE_KEY &&
      reviewReasons.some(({ code }) => code === "missing-root-attribute")
    ))
    .map(({ skillId, name }) => ({ skillId, name }));

  function supernaturalBranches(rootName: string) {
    const roots = library.roots.filter(({ name }) => name.trim().toLocaleLowerCase("en-US") === rootName.toLocaleLowerCase("en-US"));
    return roots.map((root) => ({
      rootSkillId: root.skillId,
      rootName: root.name,
      effectiveAttribute: root.effectiveAttribute,
      immediateBranches: (skillsById.get(root.skillId) ? library.skills.find(({ id }) => id === root.skillId)?.childIds ?? [] : [])
        .map((id) => ({ id, name: skillsById.get(id)?.name ?? "Missing" })),
      descendantIdentities: new Set(
        library.paths
          .filter(({ rootSkillId }) => rootSkillId === root.skillId)
          .map(({ endpointSkillId }) => endpointSkillId),
      ).size - 1,
    }));
  }

  const count = async (sql: string): Promise<number> => Number((await client.query<CountRow>(sql)).rows[0]?.count ?? 0);
  const raceReferences = await count("select count(*) from race_skill_links");
  const brokenRaceReferences = await count("select count(*) from race_skill_links rsl left join skill s on s.id=rsl.skill_id where s.id is null");
  const characterAllocationReferences = await count("select count(*) from campaign_character_skill_allocation");
  const brokenCharacterAllocationReferences = await count("select count(*) from campaign_character_skill_allocation a left join skill s on s.id=a.skill_id where s.id is null");
  const weaponGovernanceEndpointReferences = await count("select count(*) from weapon_skill_path_mappings");
  const brokenWeaponGovernanceEndpointReferences = await count("select count(*) from weapon_skill_path_mappings w left join skill s on s.id=w.endpoint_skill_id where s.id is null");
  const calledCheckReferences = await count("select count(*) from campaign_session_called_check_batch where endpoint_skill_id is not null");

  const report = {
    database: {
      host: url.hostname,
      name: url.pathname.slice(1),
      guarded: true,
      transaction: "read only",
    },
    skillCount: skills.length,
    rootCount: library.roots.length,
    relationshipCount: relationships.length,
    parentRelationshipCount: relationships.filter(({ relationshipType }) => relationshipType.trim().toLocaleLowerCase("en-US") === "parent").length,
    skillsByEffectiveAttribute: Object.fromEntries(
      [...memberships.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, ids]) => [key, ids.size]),
    ),
    maximumObservedHierarchyDepth: library.maximumDepth,
    duplicateNames: library.duplicateNames,
    multipleParentSkills,
    cycles: cycleSkills,
    brokenReferences,
    duplicateRelationships: library.reviewReasons.filter(({ code }) => code === "duplicate-relationship"),
    missingRootAttributes,
    spellcraftBranches: supernaturalBranches("Spellcraft"),
    faithBranches: supernaturalBranches("Faith"),
    talismanismBranches: supernaturalBranches("Talismanism"),
    raceSkillReferences: { count: raceReferences, broken: brokenRaceReferences },
    characterAllocationReferences: { count: characterAllocationReferences, broken: brokenCharacterAllocationReferences },
    weaponGovernanceEndpointReferences: { count: weaponGovernanceEndpointReferences, broken: brokenWeaponGovernanceEndpointReferences },
    calledCheckReferences,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  await client.query("rollback");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
