# Database migration

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Schema change: <table, column, index, or foreign key>
Product repo: <path>
Disposable database url: <url>
Read AGENTS.md, then .agents/skills/database-migration/SKILL.md.
Write down.sql. Run the pendulum on the disposable database only.

Done: migrate status is up to date after deploy, down.sql, history delete, deploy.
pnpm test returns 0. Do not db push and do not edit a shared database by hand.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Schema change: <table, column, index, or foreign key>
Disposable database url: <url>
Read the product AGENTS.md, then .agents/skills/database-migration/SKILL.md.

Done: migration.sql and down.sql exist, the pendulum passed, pnpm test returns 0.
```
