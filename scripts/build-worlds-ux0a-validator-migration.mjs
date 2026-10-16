/** Preserve exact 0104 v1 function bodies and append strict UX-0A v2 wrappers. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const target = "drizzle/0132_worlds_atlas_starter_library.sql";
const original = (await readFile("drizzle/0104_worlds_atlas_cartography.sql", "utf8")).replaceAll("\r\n", "\n");
const retained = original.slice(original.indexOf("CREATE FUNCTION"), original.indexOf('CREATE TABLE "world_atlas_drawing"')).replaceAll("CREATE FUNCTION world_atlas_presentation_valid", "CREATE FUNCTION world_atlas_presentation_v1_0132_valid").replaceAll("CREATE FUNCTION world_atlas_drawing_valid", "CREATE FUNCTION world_atlas_drawing_v1_0132_valid");
assert.equal((retained.match(/CREATE FUNCTION/g) ?? []).length, 2);
const wrapper = `
-- Structural references are extensible; the server checks the exact shipped catalog.
CREATE FUNCTION world_atlas_asset_ref_valid(p jsonb, style_ref boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE keys text[]; k text; v numeric;
BEGIN
  keys:=CASE WHEN style_ref THEN ARRAY['id','revision'] ELSE ARRAY['libraryId','libraryRevision','assetId','assetRevision'] END;
  IF jsonb_typeof(p)<>'object' OR p-keys<>'{}'::jsonb OR NOT(p ?& keys) THEN RETURN false; END IF;
  FOREACH k IN ARRAY keys LOOP
    IF k IN ('id','libraryId','assetId') THEN
      IF jsonb_typeof(p->k)<>'string' OR length(p->>k) NOT BETWEEN 1 AND 80 OR p->>k !~ '^[a-z][a-z0-9-]*$' THEN RETURN false; END IF;
    ELSE
      IF jsonb_typeof(p->k)<>'number' THEN RETURN false; END IF;
      v:=(p->>k)::numeric;
      IF v NOT BETWEEN 1 AND 2147483647 OR v<>trunc(v) THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_atlas_presentation_valid(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  IF p->'version'='1'::jsonb THEN RETURN world_atlas_presentation_v1_0132_valid(p); END IF;
  IF jsonb_typeof(p)<>'object' OR p->'version' IS DISTINCT FROM '2'::jsonb OR world_atlas_asset_ref_valid(p->'styleRef',true) IS NOT TRUE THEN RETURN false; END IF;
  RETURN world_atlas_presentation_v1_0132_valid((p-'styleRef')||'{}'::jsonb||jsonb_build_object('version',1)) IS TRUE;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_atlas_drawing_valid(d jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE item jsonb; seen text[]:=ARRAY[]::text[]; legacy jsonb;
BEGIN
  IF d->'version'='1'::jsonb THEN RETURN world_atlas_drawing_v1_0132_valid(d); END IF;
  IF jsonb_typeof(d)<>'object' OR d->'version' IS DISTINCT FROM '2'::jsonb THEN RETURN false; END IF;
  IF d->>'type'='symbol' THEN
    IF jsonb_typeof(d->'role') IS DISTINCT FROM 'string' OR d->>'role' NOT IN ('decoration','place') OR d->>'style' IS DISTINCT FROM 'colored'
      OR world_atlas_asset_ref_valid(d->'assetRef') IS NOT TRUE
      OR (d->>'role'='place' AND (d->'geographyId' IS NULL OR d->'geographyId'='null'::jsonb)) THEN RETURN false; END IF;
    legacy:=d-ARRAY['assetRef','role'];
  ELSIF d->>'type'='terrain' THEN
    IF jsonb_typeof(d->'assetRefs') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'assetRefs') NOT BETWEEN 1 AND 4 THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(d->'assetRefs') LOOP
      IF world_atlas_asset_ref_valid(item) IS NOT TRUE OR item::text=ANY(seen) THEN RETURN false; END IF;
      seen:=array_append(seen,item::text);
    END LOOP;
    legacy:=d-'assetRefs';
  ELSE RETURN false; END IF;
  RETURN world_atlas_drawing_v1_0132_valid(legacy||jsonb_build_object('version',1)) IS TRUE;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
--> statement-breakpoint
-- CREATE OR REPLACE keeps each original function OID and all delegating history
-- wrappers. Recreate and validate affected CHECKs over every populated old row.
-- No stored content, source/history identity, default or index is rewritten.
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT c.conrelid::regclass relation,c.conname,pg_get_constraintdef(c.oid) definition
    FROM pg_constraint c WHERE c.contype='c' AND
      ((c.conrelid='world_atlas_map'::regclass AND c.conname='world_atlas_presentation_valid') OR
       (c.conrelid='world_atlas_drawing'::regclass AND c.conname='world_atlas_drawing_content_valid') OR
       (c.conrelid='world_map_state_version'::regclass AND c.conname='map_state_payload_valid'))
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.relation,item.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s NOT VALID',item.relation,item.conname,item.definition);
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I',item.relation,item.conname);
  END LOOP;
END;
$$;
`;
const sql = `-- Additive UX-0A: retain published v1 validation byte-for-byte in named helpers.\n-- Apply only after backup/rehearsal in an explicitly authorized target.\n${retained}${wrapper}`;
let committed;
try { committed = execFileSync("git", ["show", `HEAD:${target}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replaceAll("\r\n", "\n"); } catch { /* New uncommitted migration. */ }
if (committed) assert.equal(sql, committed, "Published migration is immutable; add another migration for any later change");
await writeFile(target, sql);
console.log(`${target}: exact v1 helpers, structural v2 references, unchanged function identities and populated CHECK revalidation`);
