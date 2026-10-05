import type { User } from 'firebase/auth';

export const MONDAY_WEBHOOK_PROVISION_ENDPOINT = 'https://southamerica-east1-app-motor-api.cloudfunctions.net/mondayWebhookProvision';
export type ProvisionMode = 'AUDIT' | 'ENSURE_CANARY' | 'CLEANUP_CANARY_DUPLICATES' | 'RECREATE_CANARY';
export type SafeWebhook = { id: string | null; event: string | null; boardId: string | null; config: { url: string | null } };
export type AuditResult = { webhooks: SafeWebhook[]; canaryExists: boolean; canaryWebhookIds: string[] };
export type EnsureResult = AuditResult & { result: 'CREATED' | 'ALREADY_EXISTS' | 'DUPLICATES_DETECTED'; webhook: SafeWebhook | null; webhookId?: string; event?: string; boardId?: string; count?: number; webhookIds?: string[] };
export type CleanupResult = { result: 'NOT_FOUND' | 'ALREADY_CLEAN' | 'CLEANED' | 'PARTIAL_FAILURE'; keptWebhookId?: string; deletedWebhookIds?: string[]; failedWebhookId?: string | null; remainingCount: number };
export type RecreateResult = { result: 'NOT_FOUND' | 'DUPLICATES_DETECTED' | 'DELETE_VERIFICATION_FAILED' | 'CREATE_VERIFICATION_FAILED' | 'RECREATED'; deletedWebhookId?: string; createdWebhookId?: string | null; webhookIds?: string[]; count?: number; remainingCount: number };

export class MondayWebhookProvisionError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = 'MondayWebhookProvisionError'; this.status = status; }
}

type Dependencies = { currentUser?: User | null; fetch?: typeof fetch };

function safeWebhook(value: any): SafeWebhook {
  let config: any = value?.config;
  if (typeof config === 'string') { try { config = JSON.parse(config); } catch { config = null; } }
  return {
    id: value?.id == null ? null : String(value.id),
    event: typeof value?.event === 'string' ? value.event : null,
    boardId: value?.boardId == null ? value?.board_id == null ? null : String(value.board_id) : String(value.boardId),
    config: { url: typeof config?.url === 'string' ? config.url : null },
  };
}

export function sanitizeProvisionResult(mode: ProvisionMode, value: any): AuditResult | EnsureResult | CleanupResult | RecreateResult {
  const audit: AuditResult = { webhooks: Array.isArray(value?.webhooks) ? value.webhooks.map(safeWebhook) : [], canaryExists: value?.canaryExists === true, canaryWebhookIds: Array.isArray(value?.canaryWebhookIds) ? value.canaryWebhookIds.filter((id: unknown) => typeof id === 'string' && /^\d+$/.test(id)) : [] };
  if (mode === 'AUDIT') return audit;
  if (mode === 'CLEANUP_CANARY_DUPLICATES') return { result: ['NOT_FOUND', 'ALREADY_CLEAN', 'CLEANED', 'PARTIAL_FAILURE'].includes(value?.result) ? value.result : 'PARTIAL_FAILURE', keptWebhookId: typeof value?.keptWebhookId === 'string' ? value.keptWebhookId : undefined, deletedWebhookIds: Array.isArray(value?.deletedWebhookIds) ? value.deletedWebhookIds.filter((id: unknown) => typeof id === 'string' && /^\d+$/.test(id)) : undefined, failedWebhookId: typeof value?.failedWebhookId === 'string' ? value.failedWebhookId : value?.failedWebhookId === null ? null : undefined, remainingCount: Number.isInteger(value?.remainingCount) && value.remainingCount >= 0 ? value.remainingCount : 0 };
  if (mode === 'RECREATE_CANARY') return { result: ['NOT_FOUND', 'DUPLICATES_DETECTED', 'DELETE_VERIFICATION_FAILED', 'CREATE_VERIFICATION_FAILED', 'RECREATED'].includes(value?.result) ? value.result : 'CREATE_VERIFICATION_FAILED', deletedWebhookId: typeof value?.deletedWebhookId === 'string' ? value.deletedWebhookId : undefined, createdWebhookId: typeof value?.createdWebhookId === 'string' ? value.createdWebhookId : value?.createdWebhookId === null ? null : undefined, webhookIds: Array.isArray(value?.webhookIds) ? value.webhookIds.filter((id: unknown) => typeof id === 'string' && /^\d+$/.test(id)) : undefined, count: Number.isInteger(value?.count) ? value.count : undefined, remainingCount: Number.isInteger(value?.remainingCount) && value.remainingCount >= 0 ? value.remainingCount : 0 };
  const result = ['CREATED', 'ALREADY_EXISTS', 'DUPLICATES_DETECTED'].includes(value?.result) ? value.result : 'ALREADY_EXISTS';
  return { ...audit, result, webhook: value?.webhook ? safeWebhook(value.webhook) : null, webhookId: typeof value?.webhookId === 'string' ? value.webhookId : undefined, event: typeof value?.event === 'string' ? value.event : undefined, boardId: typeof value?.boardId === 'string' ? value.boardId : undefined, count: Number.isInteger(value?.count) ? value.count : undefined, webhookIds: Array.isArray(value?.webhookIds) ? value.webhookIds.filter((id: unknown) => typeof id === 'string' && /^\d+$/.test(id)) : undefined };
}

function messageForStatus(status: number) {
  if (status === 401) return 'Sessão inválida ou expirada.';
  if (status === 403) return 'Seu usuário não possui permissão para esta operação.';
  return status >= 500 ? 'Não foi possível consultar/criar o webhook.' : 'Não foi possível obter autorização da Monday.';
}

export async function provisionMondayWebhook(mode: ProvisionMode, dependencies: Dependencies = {}): Promise<AuditResult | EnsureResult | CleanupResult | RecreateResult> {
  const user = dependencies.currentUser === undefined ? (await import('firebase/auth')).getAuth().currentUser : dependencies.currentUser;
  if (!user) throw new MondayWebhookProvisionError(401, 'Sessão inválida ou expirada.');
  try {
    const token = await user.getIdToken();
    const response = await (dependencies.fetch ?? fetch)(MONDAY_WEBHOOK_PROVISION_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new MondayWebhookProvisionError(response.status, messageForStatus(response.status));
    return sanitizeProvisionResult(mode, body);
  } catch (cause) {
    if (cause instanceof MondayWebhookProvisionError) throw cause;
    throw new MondayWebhookProvisionError(0, 'Não foi possível consultar/criar o webhook.');
  }
}
