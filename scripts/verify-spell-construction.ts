import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { eq } = await import("drizzle-orm");

  const { db, pool } = await import("../src/db");

  const {
    skill,
    skillExtension,
  } = await import("../src/db/skill-schema");

  const {
    parseSpellDocument,
  } = await import(
    "../src/features/spell-construction/spellDocumentCodec"
  );

  const {
    calculateSpell,
  } = await import(
    "../src/features/spell-construction/engine/calculateSpell"
  );

  const {
    validateSpell,
  } = await import(
    "../src/features/spell-construction/engine/validateSpell"
  );

  const rows = await db
    .select({
      extensionId: skillExtension.id,
      skillId: skill.id,
      skillName: skill.name,
      dataJson: skillExtension.dataJson,
    })
    .from(skillExtension)
    .innerJoin(
      skill,
      eq(skill.id, skillExtension.skillId),
    )
    .where(
      eq(
        skillExtension.extensionType,
        "spell-construction",
      ),
    )
    .orderBy(skillExtension.id);

  let parsed = 0;
  let calculated = 0;

  const validationCounts = {
    VALID: 0,
    WARNING: 0,
    ERROR: 0,
  };

  const failures: {
    skillId: number;
    skillName: string;
    message: string;
  }[] = [];

  for (const row of rows) {
    try {
      const document = parseSpellDocument(
        row.dataJson,
      );

      parsed += 1;

      const calculation =
        calculateSpell(document);

      calculated += 1;

      const validation = validateSpell(
        document,
        undefined,
        calculation,
      );

      validationCounts[
        validation.status
      ] += 1;
    } catch (error) {
      failures.push({
        skillId: row.skillId,
        skillName: row.skillName,
        message:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  console.log("");
  console.log("SPELL CONSTRUCTION CHECK");
  console.log("------------------------");
  console.log(`Records found: ${rows.length}`);
  console.log(`Parsed:        ${parsed}`);
  console.log(`Calculated:    ${calculated}`);
  console.log(`Failed:        ${failures.length}`);
  console.log("");
  console.log("Validation results:");
  console.log(
    `  VALID:   ${validationCounts.VALID}`,
  );
  console.log(
    `  WARNING: ${validationCounts.WARNING}`,
  );
  console.log(
    `  ERROR:   ${validationCounts.ERROR}`,
  );

  if (failures.length > 0) {
    console.log("");
    console.log("FAILURES:");

    for (const failure of failures) {
      console.log(
        `#${failure.skillId} ${failure.skillName}: ${failure.message}`,
      );
    }

    process.exitCode = 1;
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});