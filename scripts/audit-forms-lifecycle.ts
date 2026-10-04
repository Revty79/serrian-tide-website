import { config } from 'dotenv';
import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';

config({ path: '.env.local', quiet: true });
if (process.argv[2] !== '--local-dev') throw new Error('Choose --local-dev. This audit only reads loopback serrian_tide_dev.');
const url = new URL(process.env.DATABASE_URL ?? '');
url.hostname = '127.0.0.1'; url.port = '5432'; url.pathname = '/serrian_tide_dev';
const client = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
const catalog: Array<Record<string, unknown>> = [];
const scanned: Record<string, number> = {};
async function main() { try {
  await client.connect();
  await client.query('begin isolation level repeatable read read only');
  const target = (await client.query("select current_database() database, host(inet_server_addr()) address, current_setting('transaction_read_only') read_only")).rows[0];
  if (target.database !== 'serrian_tide_dev' || target.address !== '127.0.0.1' || target.read_only !== 'on') throw new Error('Read-only DEV identity check failed.');
  for (const table of ['race_forms', 'creature_forms']) {
    if (!(await client.query('select to_regclass($1) name', [`public.${table}`])).rows[0].name) { scanned[table] = -1; continue; }
    const rows = (await client.query(`select to_jsonb(t) record from "${table}" t order by id`)).rows;
    scanned[table] = rows.length;
    for (const { record } of rows) catalog.push({ table, id: record.id, sourceId: record.race_id ?? record.creature_id, key: record.key ?? record.form_key, name: record.name,
      transformation: record.transformation_json ?? null, equipment: record.mechanics_json?.equipment ?? null });
  }
  const counts: Record<string, Record<string, number>> = {};
  for (const form of catalog) {
    const t = form.transformation as Record<string, unknown> | null;
    for (const [key, value] of Object.entries({ entryMethod: t?.entryMethod, entryTiming: (t?.entryTiming as { mode?: string })?.mode,
      entryCosts: (t?.entryCosts as { mode?: string })?.mode, duration: (t?.duration as { mode?: string })?.mode,
      exitTiming: (t?.exitTiming as { mode?: string })?.mode, exitCosts: (t?.exitCosts as { mode?: string })?.mode,
      limitMode: t?.limitMode, cooldown: t?.cooldown ? 'authored prose' : 'blank', equipment: (form.equipment as { state?: string } | null)?.state,
      involuntaryTriggers: Array.isArray(t?.involuntaryTriggers) && t.involuntaryTriggers.length ? 'authored' : 'none' })) {
      const label = String(value ?? 'unspecified'); counts[key] ??= {}; counts[key][label] = (counts[key][label] ?? 0) + 1;
    }
  }
  const migrations = (await client.query('select count(*)::int count from drizzle.__drizzle_migrations')).rows[0].count;
  const latestMigration = (await client.query('select hash, created_at from drizzle.__drizzle_migrations order by id desc limit 1')).rows[0];
  const resetTriggers = (await client.query("select pg_get_triggerdef(oid) definition from pg_trigger where tgrelid=to_regclass('public.form_use_reset_event') and not tgisinternal order by tgname")).rows;
  await client.query('rollback');
  await mkdir('artifacts/guidance', { recursive: true });
  await writeFile('artifacts/guidance/forms-pass3-local-dev-audit.json', JSON.stringify({ auditedAt: new Date().toISOString(), target, migrations, scanned, counts, catalog }, null, 2));
  console.log(JSON.stringify({ target, migrations, latestMigration, resetTriggers, scanned, counts, artifact: 'artifacts/guidance/forms-pass3-local-dev-audit.json' }, null, 2));
} finally { await client.end(); } }
main().catch(error => { console.error(error instanceof Error ? error.message : "DEV audit failed"); process.exitCode = 1; });
