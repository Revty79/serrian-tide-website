# Serrian Tide Website

The web edition of **Serrian Tide**, converted from the STSTandAlone desktop application into a shared Next.js/PostgreSQL application.

The conversion keeps STSTandAlone as the mechanical reference while using the visual language established by this website and StFinal.

## Application Areas

### The Heavens — G.O.D. tools

- Campaign Control and Campaign authoring
- Races
- Skills
- Equipment
- Inventory
- Creatures and Challenge Rating
- Race NPCs
- Creature NPC individuals
- G.O.D. Character editing

Shared system libraries are global Serrian Tide content. `createdByUserId` on shared library records is audit information, not private ownership.

Campaigns are private creator-owned records. Only the Campaign creator may administratively mutate the Campaign or its Player/Character context.

### The Realms — Player tools

- Campaign and Character dashboard
- Character creation and Character sheet
- Guided Random Character
- Completely Random Character
- Character advancement
- Experience and Quintessence spending
- Spellbook
- Magic Calculator / Spell Construction

Player Character records remain ownership-protected server-side. Completing Character creation permanently locks the creation record for ordinary Player editing; later progression happens through advancement systems.

## Technology

- Next.js 16 / React 19 / TypeScript
- PostgreSQL
- Drizzle ORM / Drizzle Kit
- Better Auth
- Tailwind CSS 4 plus feature-specific styles

## Database Setup

The application reads its PostgreSQL connection from `DATABASE_URL`. Local development uses `.env.local`; environment files and credentials must never be committed.

Schema files are registered in `drizzle.config.ts`. After schema changes, generate and review a migration before applying it:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Do not run the canonical-data importer before the required schema migration has been applied.

## STSTandAlone Canon Import

The website includes an idempotent bootstrap/import command for the canonical STSTandAlone shared libraries:

```bash
npm run db:import:canon
```

By default it reads the canonical source files from the public STSTandAlone repository. For an offline/local import, set `STSTANDALONE_DATA_DIR` to the old repository's `data` directory before running the command.

The command is safe for both a freshly migrated PostgreSQL database and an existing development database. It imports the dependency chain in order—Skills and spell extensions first, then Races, Creatures, Equipment, and Inventory—while leaving G.O.D.-created records outside the canonical source identities in place.

The expected archive currently contains:

- 1,137 canonical Skills
- 1,022 final canonical parent relationships, including the shared Spellcraft/Talismanism/Faith Sphere branches
- 371 Spell Construction extensions and 371 source/reference extensions
- 56 Races and 283 Race-to-Skill links
- 87 Creatures and all 50 Challenge Rating references
- 1,007 Items: 494 Equipment and 513 Inventory records

Spell Construction import preserves the original STSTandAlone behavior: if an authored construction/source extension already exists for a canonical Skill, the bootstrap does not overwrite that document.

## Validation

Run these checks after pulling conversion work or before deployment:

```bash
npm run typecheck
npm run lint
npm run build
```

A GitHub validation workflow also runs TypeScript and ESLint checks when GitHub Actions is enabled for the repository.

## Development

```bash
npm run dev
```

The local site is normally available at `http://localhost:3000`.

## Production Order

A production installation should be brought online in this order:

1. Provision PostgreSQL and application environment variables.
2. Install dependencies.
3. Apply reviewed Drizzle migrations.
4. Run `npm run db:import:canon` to bootstrap the full shared Serrian Tide library.
5. Run TypeScript, lint, and production build validation.
6. Start the Next.js production server behind the chosen HTTPS/reverse-proxy setup.

Production secrets, Better Auth secrets, database credentials, and session data must remain outside the repository.
