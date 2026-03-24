/**
 * Нормализует ID таблицы из секрета GOOGLE_SHEETS_SPREADSHEET_ID.
 * Частые ошибки: полный URL, кавычки, gid вместо /d/…/, невидимые пробелы, «типографский» дефис в ID.
 */
export function normalizeSpreadsheetId(raw: string): string {
  let s = raw
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/\s+/g, '')
    .trim();

  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).replace(/\s+/g, '').trim();
  }

  const fromUrl = s.match(/\/spreadsheets\/d\/([^/?#]+)/i);
  if (fromUrl) {
    try {
      return decodeURIComponent(fromUrl[1].trim());
    } catch {
      return fromUrl[1].trim();
    }
  }

  try {
    return decodeURIComponent(s.trim());
  } catch {
    return s.trim();
  }
}

/** Ожидаемый вид file id в Google Sheets (латиница, цифры, - и _). */
export function looksLikeSpreadsheetFileId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{30,128}$/.test(id);
}
