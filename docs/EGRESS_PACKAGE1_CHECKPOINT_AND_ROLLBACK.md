# Checkpoint and Rollback Plan (Package 1)

## Goal

This document фиксирует безопасную точку отката перед оптимизациями egress (Package 1: low-risk changes), включая код и инструкции по БД.

## Checkpoint Metadata

- Date: 2026-04-16
- Type: local git stash checkpoint
- Stash entry: `stash@{0}`
- Stash message: `checkpoint: before egress package1 optimization`

This stash contains tracked and untracked local files at the moment before Package 1 changes.

## What Is Included in This Checkpoint

- Current working tree state (tracked modifications).
- Untracked local files in workspace (including local temp artifacts).

## Important Limitation

Git stash does **not** store Supabase cloud database state.
If schema/data changes are applied in Supabase, rollback requires separate DB procedures.

## Code Rollback Steps

If Package 1 changes need to be fully discarded and restored to checkpoint state:

1. Save any work you want to keep (optional: create a new stash).
2. Reset working tree to current `HEAD`.
3. Re-apply checkpoint stash.

Suggested commands:

```bash
git stash push -u -m "temp: save current work before rollback"
git reset --hard HEAD
git clean -fd
git stash apply stash@{0}
```

Notes:
- `git clean -fd` removes untracked files.
- If you do not want to remove all untracked files, skip `git clean -fd` and restore selectively.

## Safer Partial Rollback

To rollback only selected files, apply stash for specific paths:

```bash
git checkout stash@{0} -- src/path/to/file.ts
```

## Supabase DB Rollback Strategy (If DB Is Changed)

Before any DB migration/data rewrite:

1. Export current schema and critical tables (`initiatives`, `people`, `person_initiative_assignments`, `team_quarter_snapshots`, `allowed_users`).
2. Save SQL migration scripts in version control.
3. Record forward and rollback SQL for each migration.
4. Validate rollback SQL on staging/dev first.

Minimum operational checklist:

- [ ] Backup completed and timestamped.
- [ ] Migration SQL stored in repo.
- [ ] Rollback SQL prepared and reviewed.
- [ ] Recovery owner assigned.
- [ ] Validation query list prepared (row counts, key samples, app smoke checks).

## Scope of Package 1 Changes

Package 1 should include only low-risk egress optimizations:

- Narrow `select` column lists in high-traffic queries.
- Skip no-op updates.
- Coalesce frequent invalidations/refetches.
- Reduce payload size in assignment synchronization queries.

No intentional UX/flow redesign should be introduced in Package 1.
