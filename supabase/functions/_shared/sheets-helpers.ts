/** Ensure a worksheet with the given title exists; returns sheetId. */
export async function ensureWorksheet(
  accessToken: string,
  spreadsheetId: string,
  title: string
): Promise<number> {
  const sid = encodeURIComponent(spreadsheetId);
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) {
    const t = await metaRes.text();
    if (metaRes.status === 404) {
      const hint =
        spreadsheetId.length >= 8
          ? ` Сейчас в запросе id: «${spreadsheetId.slice(0, 6)}…${spreadsheetId.slice(-4)}» (длина ${spreadsheetId.length}).`
          : '';
      throw new Error(
        'Таблица не найдена (Google 404).' +
          hint +
          ' В секрете GOOGLE_SHEETS_SPREADSHEET_ID должен быть ID из URL …/spreadsheets/d/ЭТОТ_ИД/… (не число #gid=). ' +
          'Проверьте секрет без лишних пробелов; таблица должна быть расшарена на client_email из JSON ключа. ' +
          'В Google Cloud для проекта ключа должен быть включён Google Sheets API.'
      );
    }
    throw new Error(`Sheets metadata ${metaRes.status}: ${t.slice(0, 400)}`);
  }
  const meta = (await metaRes.json()) as {
    sheets?: { properties: { sheetId: number; title: string } }[];
  };
  const existing = meta.sheets?.find((s) => s.properties.title === title);
  if (existing) return existing.properties.sheetId;

  const batchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title } } }],
      }),
    }
  );
  const batchText = await batchRes.text();
  if (!batchRes.ok) {
    throw new Error(`Sheets addSheet ${batchRes.status}: ${batchText.slice(0, 400)}`);
  }
  const batch = JSON.parse(batchText) as {
    replies?: { addSheet?: { properties: { sheetId: number } } }[];
  };
  const sheetId = batch.replies?.[0]?.addSheet?.properties?.sheetId;
  if (sheetId == null) {
    throw new Error('addSheet response missing sheetId');
  }
  return sheetId;
}
