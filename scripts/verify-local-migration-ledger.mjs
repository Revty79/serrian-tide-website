import { readFile } from "node:fs/promises";

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured.");
const url = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || !url.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Refusing migration-ledger verification outside a loopback _dev database.");
}

const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
const client = new pg.Client({ connectionString });
await client.connect();
try {
  const result = await client.query("select id, hash, created_at from drizzle.__drizzle_migrations order by id");
  const expectedCount = journal.entries.length;
  const actualCount = result.rows.length;
  const lastExpected = journal.entries.at(-1) ?? null;
  const lastActual = result.rows.at(-1) ?? null;
  console.log(JSON.stringify({
    database: url.pathname.slice(1),
    journalCount: expectedCount,
    ledgerCount: actualCount,
    expectedLast: lastExpected && { idx: lastExpected.idx, tag: lastExpected.tag, when: lastExpected.when },
    actualLast: lastActual && { id: lastActual.id, createdAt: Number(lastActual.created_at), hashPrefix: String(lastActual.hash).slice(0, 12) },
    matches: actualCount === expectedCount && Number(lastActual?.created_at) === Number(lastExpected?.when),
  }, null, 2));
  if (actualCount !== expectedCount || Number(lastActual?.created_at) !== Number(lastExpected?.when)) process.exitCode = 1;
} finally {
  await client.end();
}
