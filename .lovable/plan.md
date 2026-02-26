
# Исправление парсера CSV: многострочные поля

## Корень проблемы

В `src/lib/adminDataManager.ts` строка 108:
```typescript
const lines = text.split('\n').filter(line => line.trim());
```

Парсер сначала делит весь текст по `\n`, а потом парсит каждую строку. Но в CSV описания инициатив содержат **переносы строк внутри кавычек** — это валидный CSV формат. В итоге:

- Описание с несколькими абзацами разбивается на 10+ «строк»
- Каждый фрагмент не является полноценной CSV-строкой
- Условие `if (values.length < 4) continue` отбрасывает их
- Следующая нормальная строка после такого описания тоже может быть пропущена, если парсер «сбился» со счёта полей

Новые строки без переносов в описании (например, FAP/Marketplace/Трансферные услуги) читаются нормально.

## Решение: правильная токенизация CSV на уровне символов

Вместо `text.split('\n')` нужно парсить весь файл посимвольно, собирая строки с учётом кавычек. Это стандартный подход для RFC 4180-совместимого CSV.

### Алгоритм

```
Читаем символ за символом:
  - Если " и мы не в кавычках → начинаем кавычки
  - Если " и мы в кавычках:
      - Если следующий " → добавляем экранированную кавычку
      - Иначе → заканчиваем кавычки
  - Если \n и мы НЕ в кавычках → конец строки → сохраняем строку
  - Если \n и мы В кавычках → это часть значения, добавляем \n в текущее поле
  - Если , и мы не в кавычках → конец поля
  - Иначе → добавляем символ в текущее поле
```

### Что меняем

**Файл: `src/lib/adminDataManager.ts`**

1. Добавляем функцию `splitCSVIntoRows(text: string): string[][]` которая парсит весь CSV сразу на уровне символов и возвращает массив строк (каждая строка — массив значений полей).

2. Убираем `text.split('\n')` из `parseAdminCSV`.

3. Убираем вызов `parseCSVLine(lines[i])` внутри цикла — вместо этого используем уже готовые значения из `splitCSVIntoRows`.

4. Логика определения заголовков, квартальных данных и остальное — без изменений.

### Пример нового кода

```typescript
function parseCSVToRows(text: string): string[][] {
  const rows: string[][] = [];
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (char === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        current += '"'; // escaped quote
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else if (char === '\n' && !inQuotes) {
      fields.push(current.trim());
      current = '';
      if (fields.some(f => f.length > 0)) {
        rows.push([...fields]);
      }
      fields.length = 0;
    } else {
      current += char;
    }
  }

  // Handle last row (no trailing newline)
  if (current || fields.length > 0) {
    fields.push(current.trim());
    if (fields.some(f => f.length > 0)) {
      rows.push([...fields]);
    }
  }

  return rows;
}
```

Затем в `parseAdminCSV`:
```typescript
export function parseAdminCSV(text: string): { data: AdminDataRow[]; quarters: string[]; originalHeaders: string[] } {
  const rows = parseCSVToRows(text);
  if (rows.length < 2) return { data: [], quarters: [], originalHeaders: [] };

  const headers = rows[0];
  const quarters = detectPeriodsFromHeaders(headers);
  const data: AdminDataRow[] = [];

  // ... column index detection (без изменений) ...

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.length < 4) continue;
    // ... остальная логика без изменений ...
  }
  
  return { data, quarters, originalHeaders: headers };
}
```

## Итог

- Одно место изменений: `src/lib/adminDataManager.ts`
- Удаляем `parseCSVLine` (или оставляем для других нужд) и `text.split('\n')`
- Добавляем `parseCSVToRows` которая корректно обрабатывает многострочные поля
- Все существующие инициативы с многострочными описаниями будут читаться корректно
- Новые строки с простыми описаниями также без изменений
