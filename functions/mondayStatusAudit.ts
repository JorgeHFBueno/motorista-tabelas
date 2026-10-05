import express from 'express';
import cors from 'cors';
import { adminAuthMiddleware, type AdminRequest } from './adminAuth.js';
import { mondayApiToken, MONDAY_API_VERSION, queryMonday, type MondayQueryMeta } from './mondayClient.js';

const PRINCIPAL_BOARD_ID = '8515762377';
const STATUS_COLUMN_ID = 'color_mknqcdnw';
const CANDIDATE_SUBITEM_ID = '13149530541';
const EXPECTED_PARENT_ID = '12581501883';
const EXPECTED_PERSISTED_STATUS = 'Revisar escopo';
type AnyRecord = Record<string, any>;

const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const normalizeDomainKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

function findSubitemsColumn(columns: AnyRecord[]) {
  return columns.find((column) => column?.type === 'subtasks' || column?.type === 'subitems') ?? null;
}

function labelsFromSettings(settings: AnyRecord | null) {
  return (Array.isArray(settings?.labels) ? settings.labels : []).map((label: AnyRecord) => ({
    id: label?.id ?? null,
    index: label?.index ?? null,
    label: text(label?.label),
    color: label?.color ?? null,
    is_done: label?.is_done ?? null,
    ...(Object.prototype.hasOwnProperty.call(label ?? {}, 'is_deactivated') ? { is_deactivated: label.is_deactivated } : {}),
  }));
}

export function buildDomainLabelMap(labels: AnyRecord[]) {
  return Object.fromEntries(labels.filter((label) => label.label).map((label) => [normalizeDomainKey(label.label), { label: label.label, labelId: label.id }]));
}

export function buildStatusAuditReport(input: { principalBoard: AnyRecord; subitemBoard: AnyRecord; candidate: AnyRecord; subitemBoards: AnyRecord[]; apiMeta: MondayQueryMeta[] }) {
  const subitemsColumn = findSubitemsColumn(input.principalBoard.columns ?? []);
  const statusColumn = (input.subitemBoard.columns ?? []).find((column: AnyRecord) => column?.id === STATUS_COLUMN_ID) ?? null;
  const labels = labelsFromSettings(statusColumn?.settings ?? null);
  const candidateStatus = (input.candidate.column_values ?? []).find((column: AnyRecord) => column?.id === STATUS_COLUMN_ID) ?? null;
  const candidateParentId = String(input.candidate.parent_item?.id ?? '');
  const subitemBoardIds = [...new Set(input.subitemBoards.map((board) => String(board.id)))];
  return {
    api: { requestedVersion: MONDAY_API_VERSION, effectiveVersions: [...new Set(input.apiMeta.map((meta) => meta.effectiveApiVersion).filter(Boolean))], headerCorrected: true },
    principalBoard: { id: input.principalBoard.id, name: input.principalBoard.name, subitemsColumn: subitemsColumn ? { id: subitemsColumn.id, title: subitemsColumn.title, type: subitemsColumn.type, settings: subitemsColumn.settings ?? null, boardIds: subitemsColumn.settings?.boardIds ?? [] } : null },
    subitemBoard: { id: input.subitemBoard.id, name: input.subitemBoard.name },
    statusColumn: statusColumn ? { id: statusColumn.id, title: statusColumn.title, type: statusColumn.type, settings: statusColumn.settings ?? null } : null,
    labels,
    domainLabelMap: buildDomainLabelMap(labels),
    candidate: {
      id: String(input.candidate.id), name: input.candidate.name ?? null, parentItemId: candidateParentId || null,
      board: input.candidate.board ?? null, statusColumnId: candidateStatus?.id ?? null,
      statusText: candidateStatus?.text ?? null, statusRawValue: candidateStatus?.value ?? null,
      statusTyped: { index: candidateStatus?.index ?? null, label: candidateStatus?.label ?? null },
      parentMatches: candidateParentId === EXPECTED_PARENT_ID,
      persistedStatus: EXPECTED_PERSISTED_STATUS,
      statusMatchesPersisted: candidateStatus?.text === EXPECTED_PERSISTED_STATUS,
    },
    uniformity: { subitemBoardIds, subitemBoards: input.subitemBoards, count: subitemBoardIds.length, singleSchema: subitemBoardIds.length === 1 && subitemBoardIds[0] === String(input.subitemBoard.id) },
    futureWrite: { mutation: 'change_multiple_column_values', boardId: String(input.subitemBoard.id), itemId: CANDIDATE_SUBITEM_ID, columnId: STATUS_COLUMN_ID, statusPayloadIdentifier: 'StatusLabel.id enviado na propriedade JSON chamada index', create_labels_if_missing: false },
    safety: { tokenExposed: false, mutationExecuted: 0, firestoreWrites: 0 },
  };
}

export async function runMondayStatusAudit(token: string, mondayQuery: typeof queryMonday = queryMonday) {
  const apiMeta: MondayQueryMeta[] = [];
  const q = (query: string, variables: AnyRecord) => mondayQuery(token, query, variables, (meta) => apiMeta.push(meta));
  const principalData = await q('query($id:ID!){boards(ids:[$id]){id name columns{id title type settings}}}', { id: PRINCIPAL_BOARD_ID });
  const principalBoard = principalData.boards?.[0];
  if (!principalBoard) throw new Error('MONDAY_PRINCIPAL_BOARD_UNAVAILABLE');
  const subitemsColumn = findSubitemsColumn(principalBoard.columns ?? []);
  const configuredBoardId = subitemsColumn?.settings?.boardIds?.[0];
  if (configuredBoardId === undefined || configuredBoardId === null) throw new Error('MONDAY_SUBITEM_BOARD_ID_UNAVAILABLE');
  const subitemBoardId = String(configuredBoardId);
  const subitemData = await q('query($id:ID!){boards(ids:[$id]){id name columns{id title type settings}}}', { id: subitemBoardId });
  const subitemBoard = subitemData.boards?.[0];
  if (!subitemBoard) throw new Error('MONDAY_SUBITEM_BOARD_UNAVAILABLE');
  const candidateData = await q('query($id:ID!){items(ids:[$id]){id name board{id name} parent_item{id name board{id name}} column_values(ids:["color_mknqcdnw"]){id type text value ... on StatusValue{index label}}}}', { id: CANDIDATE_SUBITEM_ID });
  const candidate = candidateData.items?.[0];
  if (!candidate) throw new Error('MONDAY_SUBITEM_UNAVAILABLE');
  const allItemsData = await q('query($id:ID!){boards(ids:[$id]){items_page(limit:100){items{subitems{board{id name}}}cursor}}}', { id: PRINCIPAL_BOARD_ID });
  const subitemBoards: AnyRecord[] = [];
  for (const item of allItemsData.boards?.[0]?.items_page?.items ?? []) for (const subitem of item.subitems ?? []) if (subitem.board?.id && !subitemBoards.some((board: AnyRecord) => String(board.id) === String(subitem.board.id))) subitemBoards.push(subitem.board);
  return buildStatusAuditReport({ principalBoard, subitemBoard, candidate, subitemBoards, apiMeta });
}

type AuditOptions = { authMiddleware?: typeof adminAuthMiddleware; token?: () => string | undefined; runner?: typeof runMondayStatusAudit };
export function createMondayStatusAuditApp(options: AuditOptions = {}) {
  const app = express(); app.use(cors({ origin: true })); app.use(express.json()); app.use(options.authMiddleware ?? adminAuthMiddleware);
  app.post(['/', '/api/monday-status-audit'], async (req: AdminRequest, res) => {
    if (Object.keys(req.body ?? {}).length) { res.status(400).json({ error: 'invalid_request' }); return; }
    const token = (options.token ?? (() => mondayApiToken.value()))();
    if (!token) { res.status(503).json({ error: 'monday_secret_unavailable' }); return; }
    try { res.json(await (options.runner ?? runMondayStatusAudit)(token)); }
    catch (error) { console.error('MONDAY_STATUS_AUDIT_FAILED', { uid: req.user?.uid, message: error instanceof Error ? error.message : 'unknown_error' }); res.status(500).json({ error: 'monday_status_audit_failed' }); }
  });
  return app;
}

export const mondayStatusAuditApp = createMondayStatusAuditApp();
