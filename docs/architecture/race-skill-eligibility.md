# Race Skill Eligibility

Races may link Tier 1 Skills and Special Abilities of any tier, including an
unset tier. Other untiered Skills are not eligible. The existing `Granted`
link type still requires a Special Ability.

The race picker follows saved `parent` relationships when a search matches a
Tier 2 or higher ordinary Skill. It returns the active Tier 1 ancestor(s),
deduplicated before the result limit. It never infers ancestry from names or
substitutes an unrelated Skill. Archived entries remain unavailable for new
links. Saving validates the database's current classification and tier, not
the draft's display metadata.

## Catalog Cleanup

`scripts/cleanup-race-skills.ts` reads `.env.local`. Both modes require the
explicit `host:port/database` target to match `DATABASE_URL`:

```powershell
node --import tsx scripts/cleanup-race-skills.ts --plan <host:port/database>
node --import tsx scripts/cleanup-race-skills.ts --apply <host:port/database> <plan-digest>
```

Apply takes a full custom-format PostgreSQL backup and verifies archive decoding,
then checks the reviewed plan under transaction locks. Only ineligible
`race_skill_links` rows are deleted. Eligible links and every other public table
are checked for exact preservation. Local plans and receipts live in the ignored
`artifacts/race-skill-cleanup/` directory; backups are retained outside Git.

The user-authorized server cleanup on 2026-09-13 removed 121 links from
`serrian_tide_prod` (42 Tier 2 and 79 Tier 3), retaining 162 links including all
35 Special Ability links. The final read-only audit found zero ineligible links.
Character allocations, Skill records, race details, and all other public tables
were unchanged. No cleanup was applied to the local development database.

## Verification

Run `node --import tsx --test scripts/race-skills-disposable.test.ts` for an
isolated, fully migrated PostgreSQL regression run. Set `SERRIAN_RACE_BROWSER=true`
to include desktop/mobile picker and real Server Action save checks. Fixtures
never use `.env.local`'s database. Pure eligibility tests also run in `validate:unit`.
