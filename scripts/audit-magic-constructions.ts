import { config } from 'dotenv';
import pg from 'pg';
import { writeFile } from 'node:fs/promises';
import { parseSpellDocument } from '@/features/spell-construction/spellDocumentCodec';
import { adaptSpellToMechanicalEffects } from '@/features/spell-construction/mechanical-effects-adapter';
import { validateSpell } from '@/features/spell-construction/engine/validateSpell';
import { STRUCTURED_RUNTIME_FAMILIES } from '@/features/spell-construction/runtime-application';
import { serrianTideRules } from '@/features/spell-construction/data/spellRules';
import { hasProgressiveSpellModifier, resolveProgressiveSpellForLevel } from '@/features/spell-construction/engine/progressiveSpell';
import { PRACTITIONER_LEVELS } from '@/features/spell-construction/models/rules';

config({ path: '.env.local', quiet: true });
if (process.argv[2] !== '--local-dev') throw new Error('Select --local-dev explicitly. This audit never targets Production.');
const url = new URL(process.env.DATABASE_URL ?? '');
url.hostname = '127.0.0.1'; url.port = '5432'; url.pathname = '/serrian_tide_dev';
const client = new pg.Client({ connectionString: url.toString() });
const constructions: Array<{ owner: string; name: string; valid: boolean; issues: string[]; automatic: number; manual: number; authorable: number; families: Record<string, number>; progressiveTiers?: unknown[] }> = [];
const scanned: Record<string, number> = {};
const families = Object.fromEntries(serrianTideRules.effects.map(rule => [rule.id, { name: rule.name, count: 0, automatic: 0, manual: 0, authorable: 0 }]));
function inspect(owner: string, value: unknown) {
  if (typeof value === 'string' && /^[\s]*[\[{]/.test(value)) { try { inspect(owner, JSON.parse(value)); } catch { /* unrelated narrative JSON is not a construction */ } return; }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((entry, index) => inspect(`${owner}[${index}]`, entry)); return; }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.containers) && Array.isArray(record.modifiers) && typeof record.name === 'string') {
    const row = { owner, name: record.name, valid: false, issues: [] as string[], automatic: 0, manual: 0, authorable: 0, families: {} as Record<string, number>, progressiveTiers: undefined as unknown[] | undefined };
    try {
      const spell = parseSpellDocument(value);
      const adapted = adaptSpellToMechanicalEffects(spell);
      row.issues = validateSpell(spell).issues.filter(issue => issue.severity === 'ERROR').map(issue => issue.explanation);
      row.valid = adapted.valid && row.issues.length === 0;
      if (!adapted.valid) row.issues.push(...adapted.issues.map(issue => issue.message));
      for (const entry of adapted.effects) {
        const automatic = entry.definition.effect.kind !== 'manual';
        const authorable = !automatic && STRUCTURED_RUNTIME_FAMILIES.includes(entry.ruleId);
        row.automatic += Number(automatic); row.manual += Number(!automatic); row.authorable += Number(authorable);
        row.families[entry.ruleId] = (row.families[entry.ruleId] ?? 0) + 1;
        const family = families[entry.ruleId]; if (family) { family.count++; family.automatic += Number(automatic); family.manual += Number(!automatic); family.authorable += Number(authorable); }
      }
      if (hasProgressiveSpellModifier(spell)) row.progressiveTiers = PRACTITIONER_LEVELS.map(level => {
        const resolved = resolveProgressiveSpellForLevel(spell, level);
        const effects = adaptSpellToMechanicalEffects(resolved.resolvedSpell);
        return { level, automatic: effects.effects.filter(entry => entry.definition.effect.kind !== 'manual').length,
          manual: effects.effects.filter(entry => entry.definition.effect.kind === 'manual').length,
          errors: resolved.validation.issues.filter(issue => issue.severity === 'ERROR').map(issue => issue.explanation) };
      });
    } catch (error) { row.issues.push(error instanceof Error ? error.message : 'Malformed construction'); }
    constructions.push(row); return;
  }
  for (const [key, entry] of Object.entries(record)) inspect(`${owner}.${key}`, entry);
}

async function main() { try {
  await client.connect();
  await client.query('begin isolation level repeatable read read only');
  const target = (await client.query("select current_database() as database, host(inet_server_addr()) as address, current_setting('transaction_read_only') as read_only")).rows[0];
  if (target.database !== 'serrian_tide_dev' || target.address !== '127.0.0.1' || target.read_only !== 'on') throw new Error('Read-only DEV identity check failed.');
  for (const table of ['skill_extension', 'campaign_character_spell_document', 'item_power_constructions', 'race_natural_attacks', 'creature_attacks', 'creature_abilities', 'campaign_creature_npc_profile']) {
    if (!(await client.query('select to_regclass($1) as name', [`public.${table}`])).rows[0].name) { scanned[table] = -1; continue; }
    const rows = (await client.query(`select to_jsonb(t) as record from "${table}" t`)).rows;
    scanned[table] = rows.length;
    for (const { record } of rows) inspect(`${table}:${record.id ?? record.character_id ?? record.item_power_id}`, record);
  }
  await client.query('rollback');
  const report = { auditedAt: new Date().toISOString(), target, scanned, total: constructions.length,
    valid: constructions.filter(row => row.valid).length, invalidOrAmbiguous: constructions.filter(row => !row.valid).length,
    effects: Object.values(families).reduce((sum, row) => ({ total: sum.total + row.count, automatic: sum.automatic + row.automatic, manual: sum.manual + row.manual, authorable: sum.authorable + row.authorable }), { total: 0, automatic: 0, manual: 0, authorable: 0 }),
    counting: 'Base documents counted once per stored owner. Progressive tier counts are separate. Automatic means the adapter has executable mechanics; runtime still requires valid owner, target, range, outcome and application.',
    families, reviewCandidates: constructions.filter(row => row.authorable > 0 || row.issues.length).map(row => ({ owner: row.owner, name: row.name, authorable: row.authorable, issues: row.issues })), constructions };
  await writeFile('docs/reports/combat-magic-catalog-audit-2026-10-03.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ target, scanned, total: report.total, valid: report.valid, invalidOrAmbiguous: report.invalidOrAmbiguous, effects: report.effects }));
} finally { await client.end(); } }
void main().catch(error => { console.error('Read-only Magic audit failed:', error instanceof Error ? error.message : 'Unknown error'); process.exitCode = 1; });
