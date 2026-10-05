import { getAuth } from 'firebase/auth';

export type MondaySubitemStatusCode = 'EM_ANDAMENTO' | 'FINALIZADO' | 'PARADA' | 'PROXIMA_A_INICIAR' | 'REVISAR_ESCOPO' | 'NAO_INICIADA';
export type MondaySubitemStatus = { code: MondaySubitemStatusCode; label: string };
export const MONDAY_SUBITEM_STATUS_OPTIONS: readonly MondaySubitemStatus[] = [
  { code: 'EM_ANDAMENTO', label: 'Em andamento' }, { code: 'FINALIZADO', label: 'Finalizado' },
  { code: 'PARADA', label: 'Parada' }, { code: 'PROXIMA_A_INICIAR', label: 'Próxima a Iniciar' },
  { code: 'REVISAR_ESCOPO', label: 'Revisar escopo' }, { code: 'NAO_INICIADA', label: 'Não iniciada' },
] as const;
const endpoint = 'https://southamerica-east1-app-motor-api.cloudfunctions.net/mondayUpdateSubitemStatus';
const byCode = new Map(MONDAY_SUBITEM_STATUS_OPTIONS.map((status) => [status.code, status]));
const byLabel = new Map(MONDAY_SUBITEM_STATUS_OPTIONS.map((status) => [status.label, status]));
export const mondayStatusFromCode = (code: MondaySubitemStatusCode) => byCode.get(code)!;
export const mondayStatusFromLabel = (label: string) => byLabel.get(label) ?? null;
export type MondaySubitemStatusResponse = { result: 'UPDATED' | 'NO_CHANGE' | 'DRY_RUN'; subitemId: string; statusAnterior: MondaySubitemStatus; statusAtual?: MondaySubitemStatus; statusProposto?: MondaySubitemStatus; snapshotUpdated?: boolean };
export class MondaySubitemStatusRequestError extends Error { constructor(readonly code: string, message: string, readonly mondayUpdated = false, readonly statusAtual?: MondaySubitemStatus) { super(message); } }

const messageFor = (status: number, code: unknown) => {
  if (status === 401) return 'Faça login para atualizar o Status no Monday.';
  if (status === 403) return 'Você não possui permissão para atualizar o Status no Monday.';
  switch (code) {
    case 'SUBITEM_NOT_FOUND': return 'Este LOTE não foi encontrado no Monday.';
    case 'SUBITEM_BOARD_MISMATCH': return 'Este LOTE não pertence ao quadro esperado do Monday.';
    case 'STATUS_COLUMN_MISSING': return 'A coluna Status não foi encontrada no Monday.';
    case 'UNKNOWN_CURRENT_STATUS': return 'O Status atual do Monday não é reconhecido pela aplicação.';
    case 'POST_WRITE_VERIFICATION_FAILED': return 'O Monday respondeu à alteração, mas não foi possível confirmar o novo Status.';
    case 'SNAPSHOT_UPDATE_FAILED': return 'Status atualizado no Monday, mas não foi possível atualizar o snapshot local.';
    default: return 'Não foi possível atualizar o Status no Monday.';
  }
};

export async function updateMondaySubitemStatus(subitemId: string, novoStatus: MondaySubitemStatusCode, dependencies: { currentUser?: () => ReturnType<typeof getAuth>['currentUser']; fetch?: typeof fetch } = {}): Promise<MondaySubitemStatusResponse> {
  const user = dependencies.currentUser?.() ?? getAuth().currentUser;
  if (!user) throw new MondaySubitemStatusRequestError('UNAUTHENTICATED', messageFor(401, null));
  const token = await user.getIdToken(); const request = dependencies.fetch ?? fetch;
  const response = await request(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subitemId, novoStatus, dryRun: false }) });
  const payload = await response.json().catch(() => ({})) as Partial<MondaySubitemStatusResponse> & { error?: unknown };
  if (!response.ok) { const code = typeof payload.error === 'string' ? payload.error : 'REQUEST_FAILED'; const mondayUpdated = payload.mondayUpdated === true; const statusAtual = payload.statusAtual && typeof payload.statusAtual === 'object' ? payload.statusAtual as MondaySubitemStatus : undefined; throw new MondaySubitemStatusRequestError(code, messageFor(response.status, code), mondayUpdated, statusAtual); }
  if (!payload.result || !payload.subitemId || !payload.statusAnterior) throw new MondaySubitemStatusRequestError('INVALID_RESPONSE', messageFor(500, null));
  return payload as MondaySubitemStatusResponse;
}
