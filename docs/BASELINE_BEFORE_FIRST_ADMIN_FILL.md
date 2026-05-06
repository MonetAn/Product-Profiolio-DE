# Baseline: перед первым заполнением админки

Эталонная точка отката перед массовым заполнением админки.

## Идентификатор baseline

- **Метка:** `before-first-admin-fill`
- **Ссылка-алиас:** `backups/baseline-before-first-admin-fill`
- **Физический снапшот:** `backups/2026-05-05T17-08Z`
- **Тип:** полный дамп (`schema.sql` + `data.sql`)

> Используй именно алиас `backups/baseline-before-first-admin-fill`: если позже потребуется
> переназначить эталон, достаточно переставить symlink, а runbook останется валиден.

## Что делать при команде «вернуться к baseline before-first-admin-fill»

1. Восстановить baseline в локальную БД (для проверки/диффа):

```bash
npm run db:restore-preview -- 2026-05-05T17-08Z
```

2. Сравнить локальное восстановление и текущий прод (целенаправленно по таблицам/строкам).
3. Для точечного отката в прод использовать SQL-скрипт с `BEGIN ... COMMIT`.
4. Полный откат прода целиком из дампа — только в крайнем случае и вручную через Supabase SQL Editor.

## Быстрые ссылки

- Общий runbook: `docs/DB_BACKUP_AND_DEV.md`
- Runbook на день открытия доступа: `docs/PRE_OPEN_ACCESS_RUNBOOK.md`
- Лог ежедневных бэкапов: `backups/.log`
