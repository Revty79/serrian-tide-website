import { defineConfig } from "drizzle-kit";

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured.");
}

export default defineConfig({
  schema: [
    "./src/db/auth-schema.ts",
    "./src/db/authorization-schema.ts",
    "./src/db/campaign-schema.ts",
    "./src/db/skill-schema.ts",
    "./src/db/race-schema.ts",
    "./src/db/creature-schema.ts",
    "./src/db/item-schema.ts",
    "./src/db/realm-schema.ts",
    "./src/db/attribute-reference-schema.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
