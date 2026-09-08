import pg from 'pg';
import { readMigrationFiles } from 'drizzle-orm/migrator';
const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (url.hostname !== '127.0.0.1' || url.pathname !== '/serrian_runner_dev') throw new Error('Use the isolated loopback runner database only.');
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
try {
  const existing = await pool.query("select count(*)::int count from information_schema.tables where table_schema='public'");
  if (existing.rows[0].count !== 0) throw new Error('Runner schema bootstrap refuses a nonempty database.');
  // Fixture construction, NOT validation of the production migration command.
  // Existing historical enum alterations must commit before later statements use them.
  const migrations = readMigrationFiles({migrationsFolder: 'drizzle'});
  for (const migration of migrations) for (const statement of migration.sql) if(statement.trim()) await pool.query(statement);
  console.log(`Constructed isolated schema from ${migrations.length} migration files.`);
} finally { await pool.end(); }
