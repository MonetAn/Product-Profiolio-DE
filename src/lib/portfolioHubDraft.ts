import {
  createEmptyQuarterData,
  type AdminDataRow,
  type AdminQuarterData,
} from '@/lib/adminDataManager';

/** Префикс строк, созданных локально до «Сохранить». */
export const HUB_LOCAL_ROW_PREFIX = 'hub-local-';

export function isHubLocalRowId(id: string): boolean {
  return id.startsWith(HUB_LOCAL_ROW_PREFIX);
}

export type HubRowFieldPatch = Partial<
  Pick<
    AdminDataRow,
    | 'initiative'
    | 'stakeholdersList'
    | 'description'
    | 'documentationLink'
    | 'isTimelineStub'
    | 'initiativeGeoCostSplit'
  >
>;

export type PortfolioHubDraftSnapshot = {
  v: 1;
  ts: number;
  rowPatches: [string, HubRowFieldPatch][];
  quarterPatches: [string, Record<string, Partial<AdminQuarterData>>][];
  pendingRows: AdminDataRow[];
  deletedIds: string[];
};

const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function portfolioHubDraftStorageKey(userId: string, unit: string, team: string): string {
  return `portfolio-hub-draft:${userId}:${unit}\u001f${team}`;
}

export function loadPortfolioHubDraft(storageKey: string): PortfolioHubDraftSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortfolioHubDraftSnapshot;
    if (parsed.v !== 1 || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > STORAGE_TTL_MS) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePortfolioHubDraft(storageKey: string, snapshot: PortfolioHubDraftSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

export function clearPortfolioHubDraft(storageKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* noop */
  }
}

function applyRowPatches(rows: AdminDataRow[], patches: Map<string, HubRowFieldPatch>): AdminDataRow[] {
  if (patches.size === 0) return rows;
  return rows.map((row) => {
    const p = patches.get(row.id);
    return p ? { ...row, ...p } : row;
  });
}

function applyQuarterPatches(
  rows: AdminDataRow[],
  patches: Map<string, Record<string, Partial<AdminQuarterData>>>
): AdminDataRow[] {
  if (patches.size === 0) return rows;
  return rows.map((row) => {
    const byQuarter = patches.get(row.id);
    if (!byQuarter) return row;
    const quarterlyData = { ...row.quarterlyData };
    for (const [q, patch] of Object.entries(byQuarter)) {
      quarterlyData[q] = { ...createEmptyQuarterData(), ...row.quarterlyData[q], ...patch };
    }
    return { ...row, quarterlyData };
  });
}

function applyPatchesToRow(row: AdminDataRow, draft: {
  rowPatches: Map<string, HubRowFieldPatch>;
  quarterPatches: Map<string, Record<string, Partial<AdminQuarterData>>>;
}): AdminDataRow {
  let x: AdminDataRow = row;
  const rp = draft.rowPatches.get(row.id);
  if (rp) x = { ...x, ...rp };
  const qp = draft.quarterPatches.get(row.id);
  if (qp) {
    const quarterlyData = { ...x.quarterlyData };
    for (const [q, patch] of Object.entries(qp)) {
      quarterlyData[q] = { ...createEmptyQuarterData(), ...x.quarterlyData[q], ...patch };
    }
    x = { ...x, quarterlyData };
  }
  return x;
}

/** Снимок таблицы хаба: серверные строки + локальные правки + новые строки (с патчами по temp-id). */
export function mergePortfolioHubDisplay(
  serverRows: AdminDataRow[],
  draft: {
    rowPatches: Map<string, HubRowFieldPatch>;
    quarterPatches: Map<string, Record<string, Partial<AdminQuarterData>>>;
    pendingRows: AdminDataRow[];
    deletedIds: Set<string>;
  }
): AdminDataRow[] {
  const visible = serverRows.filter((r) => !draft.deletedIds.has(r.id));
  let merged = applyQuarterPatches(applyRowPatches(visible, draft.rowPatches), draft.quarterPatches);
  if (draft.pendingRows.length > 0) {
    const pendingLifted = draft.pendingRows.map((r) => applyPatchesToRow(r, draft));
    merged = [...pendingLifted, ...merged];
  }
  return merged;
}

export function snapshotFromDraftState(draft: {
  rowPatches: Map<string, HubRowFieldPatch>;
  quarterPatches: Map<string, Record<string, Partial<AdminQuarterData>>>;
  pendingRows: AdminDataRow[];
  deletedIds: Set<string>;
}): PortfolioHubDraftSnapshot {
  return {
    v: 1,
    ts: Date.now(),
    rowPatches: [...draft.rowPatches.entries()],
    quarterPatches: [...draft.quarterPatches.entries()],
    pendingRows: draft.pendingRows,
    deletedIds: [...draft.deletedIds],
  };
}

export function draftStateFromSnapshot(s: PortfolioHubDraftSnapshot): {
  rowPatches: Map<string, HubRowFieldPatch>;
  quarterPatches: Map<string, Record<string, Partial<AdminQuarterData>>>;
  pendingRows: AdminDataRow[];
  deletedIds: Set<string>;
} {
  return {
    rowPatches: new Map(s.rowPatches),
    quarterPatches: new Map(s.quarterPatches),
    pendingRows: s.pendingRows,
    deletedIds: new Set(s.deletedIds),
  };
}
