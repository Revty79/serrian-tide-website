# Worlds calendars: creator and historical evolution

Start at 9617b32, with the journal ending at 0099. Preserve canonical version-1 world years and Pass 2A reckonings. Calendar years do not imply world years or a universal day length. The older StFinal creator was reviewed: named months/weekdays, optional day units and cultural observances are useful; descriptive previews, free-text leap expressions, global ownership and celestial controls are not carried forward.

## Working checkpoints

A delivers world-owned calendar identities and immutable structural versions, validated calculations, gallery, contextual rule authoring, navigable actual month/year previews, weekday rules, time units, intercalation, seasons and recurrence. Version copies are independently readable. A has a complete migration, upgrade/role/conflict/database/browser/build verification and local commit before B begins.

B adds explicit world elapsed-day origins, version anchors, effective periods, adoption labels, reform relationships and precise History references. Exact days are stored as decimal integers with BigInt arithmetic. A version needs an authored anchor to convert; an effective year interval does not establish a day-level transition. Cross-version notation ambiguity must remain explicit. Historical precision and canonical ordering never gain fabricated days. No unfinished B controls or empty B tables are included in A.

## Creator rule grammar

Version-1 definitions contain 1-40 named months of 1-400 ordinary days, 1-20 named weekdays, year-zero/no-zero numbering, continuous/year-reset/month-reset weekday progression and a zero-based weekday origin at the beginning of the epoch year (0, or 1 when zero is excluded). Optional day units are explicitly authored positive integer hours/day and minutes/hour, without weather mechanics.

At most 20 named intercalary days each specify insertion after an ordinary month/day (day 0 means before that month's first ordinary day), participation in the weekday cycle and a periodic rule. Periodic rules match printed year minus offset modulo every N; optional exception multiples and restoring multiples must nest exactly. Bounded explicit included/excluded years override that rule; contradictory years are rejected. Every 1 is annual. No arbitrary code or natural-language expression is executed. Added days have stable IDs and separate notation instead of changing the meaning of ordinary month/day labels. Maximum authored year size is bounded; larger definitions fail visibly.

Seasons use explicit ordinary month/day boundaries, may wrap the year and overlap, and need not number four. Observances support annual month/day, actual ordinal day of the year, and a named intercalary day, with their own periodic rule. A skipped recurrence has no occurrence that year. Invalid ordinary boundaries are rejected. No shortened ordinary month can silently normalize a date. The preview shows the actual days, participating weekdays, out-of-week days, season names and observed festivals/holidays/recurrences.

Year prefixes count periodic matches with integer floor division and explicit exception adjustments; they never traverse elapsed years. Date lookup within a year is bounded by authored year size; inverse lookup uses bounded binary search over supported signed years. No JavaScript Date is used for fantasy time. All elapsed-day arithmetic uses BigInt internally, and strings across JSON. Calendar years support the same signed trillion-year range while legacy canonical years keep their own meaning.

## Persistence and authorization

Reuse the Worlds service actor/owned-world transaction lock and private HTTP wrapper. Calendar identities and versions have same-world composite keys; default preference references a version in that world. All structural definitions are immutable after save: revision creates another version. Metadata/lifecycle/default writes have revision checks. Archive retains rules and blocks new uses until restored; explicit Administrator review remains read-only. Owned-World account-deletion protection covers descendants without new User FKs. Each migration is additive, versioned and tested with existing data. Reverting code does not reverse schema; retain metadata and pause incompatible writers during recovery. No remote push, Production migration or deployment is authorized.
