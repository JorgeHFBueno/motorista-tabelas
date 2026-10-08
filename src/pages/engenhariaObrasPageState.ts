import type { MondayObraRow, ObraV2Row } from '../services/mondayObrasReconciliation';

export type EngenhariaObrasCollections = {
  monday: MondayObraRow[];
  obrasV2: ObraV2Row[];
};

export type ReconciliationFilter = 'Todos' | 'Pendentes' | 'Vinculados';

type RenderStateInput = {
  authLoading: boolean;
  loading: boolean;
  authorized: boolean | null;
  error: string | null;
};

export function normalizeEngenhariaObrasCollections(value: unknown): EngenhariaObrasCollections {
  const response = value && typeof value === 'object' ? value as Record<string, unknown> : {};

  return {
    monday: Array.isArray(response.monday) ? response.monday as MondayObraRow[] : [],
    obrasV2: Array.isArray(response.obrasV2) ? response.obrasV2 as ObraV2Row[] : [],
  };
}

export function filterMondayObras(rows: MondayObraRow[], filter: ReconciliationFilter) {
  if (filter === 'Todos') return rows;
  return rows.filter((row) => filter === 'Vinculados' ? Boolean(row.obraV2Id) : !row.obraV2Id);
}

export function filterObrasV2(rows: ObraV2Row[], monday: MondayObraRow[], filter: ReconciliationFilter) {
  if (filter === 'Todos') return rows;
  const usedObraIds = new Set(monday.map((row) => row.obraV2Id).filter(Boolean));
  return rows.filter((row) => filter === 'Vinculados' ? usedObraIds.has(row.documentId) : !usedObraIds.has(row.documentId));
}

export function engenhariaObrasRenderState({ authLoading, loading, authorized, error }: RenderStateInput) {
  if (authLoading || loading) return 'loading' as const;
  if (!authorized) return 'unauthorized' as const;
  if (error) return 'error' as const;
  return 'ready' as const;
}
