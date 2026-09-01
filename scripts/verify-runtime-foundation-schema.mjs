import { readFile } from "node:fs/promises";

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured.");

const url = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
  throw new Error(`Refusing schema verification against non-local host ${url.hostname}.`);
}

const snapshot = JSON.parse(
  await readFile(new URL("../drizzle/meta/0006_snapshot.json", import.meta.url), "utf8"),
);
const expectedTables = Object.values(snapshot.tables).filter(
  (table) => table.schema === "" || table.schema === "public",
);

function fail(message) {
  throw new Error(`Runtime Foundation schema mismatch: ${message}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
}

function assertSet(actual, expected, label) {
  const actualValues = [...actual].sort();
  const expectedValues = [...expected].sort();
  assertEqual(JSON.stringify(actualValues), JSON.stringify(expectedValues), label);
}

function expectedPostgresType(type) {
  if (type === "serial") return "integer";
  if (type === "timestamp") return "timestamp without time zone";
  const varchar = /^varchar\((\d+)\)$/.exec(type);
  if (varchar) return `character varying(${varchar[1]})`;
  return type;
}

function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  return String(value)
    .replace(/::(?:[a-z_][a-z0-9_]*|character varying)(?:\(\d+\))?/gi, "")
    .replace(/^\((.*)\)$/s, "$1")
    .trim();
}

function normalizeExpression(value) {
  return String(value ?? "")
    .replaceAll('"', "")
    .replace(/::(?:[a-z_][a-z0-9_]*|character varying)(?:\(\d+\))?/gi, "")
    .replace(/\b[a-z_][a-z0-9_]*\./gi, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function key(tableName, objectName) {
  return `${tableName}.${objectName}`;
}

function postgresIdentifier(name) {
  return Buffer.from(name, "utf8").subarray(0, 63).toString("utf8");
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  const identity = await client.query(
    "select inet_server_addr()::text as address, inet_server_port() as port, current_database() as database",
  );
  if (!["127.0.0.1/32", "::1/128"].includes(identity.rows[0].address)) {
    throw new Error(`Refusing non-loopback PostgreSQL server ${identity.rows[0].address}.`);
  }

  const tableRows = await client.query(`
    select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r'
     order by c.relname
  `);
  assertSet(
    tableRows.rows.map((row) => row.table_name),
    expectedTables.map((table) => table.name),
    "public tables",
  );

  const columnRows = await client.query(`
    select c.relname as table_name,
           a.attname as column_name,
           format_type(a.atttypid, a.atttypmod) as data_type,
           a.attnotnull as not_null,
           pg_get_expr(d.adbin, d.adrelid) as default_expression
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attnum > 0 and not a.attisdropped
      left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
     where n.nspname='public' and c.relkind='r'
     order by c.relname, a.attnum
  `);
  const actualColumns = new Map(
    columnRows.rows.map((row) => [key(row.table_name, row.column_name), row]),
  );
  const expectedColumnKeys = [];
  for (const table of expectedTables) {
    for (const column of Object.values(table.columns)) {
      const columnKey = key(table.name, column.name);
      expectedColumnKeys.push(columnKey);
      const actual = actualColumns.get(columnKey);
      if (!actual) fail(`missing column ${columnKey}`);
      assertEqual(actual.data_type, expectedPostgresType(column.type), `${columnKey} type`);
      assertEqual(actual.not_null, column.notNull, `${columnKey} nullability`);
      if (column.type === "serial") {
        if (!actual.default_expression?.startsWith("nextval(")) fail(`${columnKey} lost its serial sequence default`);
      } else {
        assertEqual(
          normalizeDefault(actual.default_expression),
          normalizeDefault(column.default),
          `${columnKey} default`,
        );
      }
    }
  }
  assertSet(actualColumns.keys(), expectedColumnKeys, "columns");

  const enumRows = await client.query(`
    select t.typname as enum_name, e.enumlabel as enum_value
      from pg_type t
      join pg_namespace n on n.oid=t.typnamespace
      join pg_enum e on e.enumtypid=t.oid
     where n.nspname='public'
     order by t.typname, e.enumsortorder
  `);
  const actualEnums = new Map();
  for (const row of enumRows.rows) {
    const values = actualEnums.get(row.enum_name) ?? [];
    values.push(row.enum_value);
    actualEnums.set(row.enum_name, values);
  }
  const expectedEnums = new Map(
    Object.values(snapshot.enums).map((entry) => [entry.name, entry.values]),
  );
  assertSet(actualEnums.keys(), expectedEnums.keys(), "enum types");
  for (const [name, values] of expectedEnums) {
    assertEqual(JSON.stringify(actualEnums.get(name)), JSON.stringify(values), `${name} enum values`);
  }

  const constraintRows = await client.query(`
    select t.relname as table_name,
           con.conname as constraint_name,
           con.contype as constraint_type,
           coalesce(array(
             select a.attname
               from unnest(con.conkey) with ordinality keys(attnum, ord)
               join pg_attribute a on a.attrelid=con.conrelid and a.attnum=keys.attnum
              order by keys.ord
           )::text[], array[]::text[]) as columns_from,
           ft.relname as foreign_table,
           coalesce(array(
             select a.attname
               from unnest(con.confkey) with ordinality keys(attnum, ord)
               join pg_attribute a on a.attrelid=con.confrelid and a.attnum=keys.attnum
              order by keys.ord
           )::text[], array[]::text[]) as columns_to,
           con.confdeltype as delete_action,
           con.confupdtype as update_action
      from pg_constraint con
      join pg_class t on t.oid=con.conrelid
      join pg_namespace n on n.oid=t.relnamespace
      left join pg_class ft on ft.oid=con.confrelid
     where n.nspname='public' and con.contype in ('p','u','f','c')
     order by t.relname, con.conname
  `);
  const actualConstraints = new Map(
    constraintRows.rows.map((row) => [key(row.table_name, row.constraint_name), row]),
  );
  const expectedConstraintKeys = [];
  const actionCode = { "no action": "a", restrict: "r", cascade: "c", "set null": "n", "set default": "d" };
  for (const table of expectedTables) {
    const primaryColumns = Object.values(table.columns)
      .filter((column) => column.primaryKey)
      .map((column) => column.name);
    for (const primary of Object.values(table.compositePrimaryKeys ?? {})) {
      primaryColumns.push(...primary.columns);
    }
    if (primaryColumns.length > 0) {
      const actual = constraintRows.rows.find(
        (row) => row.table_name === table.name && row.constraint_type === "p",
      );
      if (!actual) fail(`missing primary key on ${table.name}`);
      assertEqual(JSON.stringify(actual.columns_from), JSON.stringify(primaryColumns), `${table.name} primary key`);
      expectedConstraintKeys.push(key(table.name, actual.constraint_name));
    }
    for (const unique of Object.values(table.uniqueConstraints ?? {})) {
      const constraintKey = key(table.name, postgresIdentifier(unique.name));
      expectedConstraintKeys.push(constraintKey);
      const actual = actualConstraints.get(constraintKey);
      if (!actual || actual.constraint_type !== "u") fail(`missing unique constraint ${constraintKey}`);
      assertEqual(JSON.stringify(actual.columns_from), JSON.stringify(unique.columns), `${constraintKey} columns`);
    }
    for (const foreign of Object.values(table.foreignKeys ?? {})) {
      const constraintKey = key(table.name, postgresIdentifier(foreign.name));
      expectedConstraintKeys.push(constraintKey);
      const actual = actualConstraints.get(constraintKey);
      if (!actual || actual.constraint_type !== "f") fail(`missing foreign key ${constraintKey}`);
      assertEqual(JSON.stringify(actual.columns_from), JSON.stringify(foreign.columnsFrom), `${constraintKey} source columns`);
      assertEqual(actual.foreign_table, foreign.tableTo, `${constraintKey} target table`);
      assertEqual(JSON.stringify(actual.columns_to), JSON.stringify(foreign.columnsTo), `${constraintKey} target columns`);
      assertEqual(actual.delete_action, actionCode[foreign.onDelete ?? "no action"], `${constraintKey} delete action`);
      assertEqual(actual.update_action, actionCode[foreign.onUpdate ?? "no action"], `${constraintKey} update action`);
    }
    for (const check of Object.values(table.checkConstraints ?? {})) {
      const constraintKey = key(table.name, postgresIdentifier(check.name));
      expectedConstraintKeys.push(constraintKey);
      const actual = actualConstraints.get(constraintKey);
      if (!actual || actual.constraint_type !== "c") fail(`missing check constraint ${constraintKey}`);
    }
  }
  assertSet(actualConstraints.keys(), expectedConstraintKeys, "primary, unique, foreign-key, and check constraints");

  const indexRows = await client.query(`
    select t.relname as table_name,
           ix.relname as index_name,
           i.indisunique as is_unique,
           am.amname as method,
           pg_get_expr(i.indpred, i.indrelid) as predicate,
           array(
             select pg_get_indexdef(i.indexrelid, position, true)
               from generate_series(1, i.indnkeyatts) position
              order by position
           ) as expressions
      from pg_index i
      join pg_class t on t.oid=i.indrelid
      join pg_namespace n on n.oid=t.relnamespace
      join pg_class ix on ix.oid=i.indexrelid
      join pg_am am on am.oid=ix.relam
     where n.nspname='public'
       and not exists (
         select 1
           from pg_constraint con
          where con.conindid=i.indexrelid
            and con.contype in ('p','u','x')
       )
     order by t.relname, ix.relname
  `);
  const actualIndexes = new Map(indexRows.rows.map((row) => [key(row.table_name, row.index_name), row]));
  const expectedIndexKeys = [];
  for (const table of expectedTables) {
    for (const index of Object.values(table.indexes ?? {})) {
      const indexKey = key(table.name, postgresIdentifier(index.name));
      expectedIndexKeys.push(indexKey);
      const actual = actualIndexes.get(indexKey);
      if (!actual) fail(`missing index ${indexKey}`);
      assertEqual(actual.is_unique, index.isUnique, `${indexKey} uniqueness`);
      assertEqual(actual.method, index.method, `${indexKey} method`);
      assertEqual(
        JSON.stringify(actual.expressions.map(normalizeExpression)),
        JSON.stringify(index.columns.map((column) => normalizeExpression(column.expression))),
        `${indexKey} columns`,
      );
      assertEqual(normalizeExpression(actual.predicate), normalizeExpression(index.where), `${indexKey} predicate`);
    }
  }
  assertSet(actualIndexes.keys(), expectedIndexKeys, "explicit indexes, including partial indexes");

  console.log(
    `Runtime Foundation schema parity passed on ${identity.rows[0].address}:${identity.rows[0].port}/${identity.rows[0].database}: ` +
      `${expectedTables.length} tables, ${expectedColumnKeys.length} columns, ${expectedConstraintKeys.length} constraints, ` +
      `${expectedIndexKeys.length} explicit indexes, ${expectedEnums.size} enums.`,
  );
} finally {
  await client.end();
}
