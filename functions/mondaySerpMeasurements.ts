import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';

const erpToken = defineSecret('ERP360_API_TOKEN');
const ERP_BASE = 'https://s15.elevor.cloud/LedurPreFabricados/ERP360';
const QUERY_ID = 55;
const CENTRO_CUSTO = '4';
type ErpRow = Record<string, unknown>;
export type MondaySerpMeasurements = { idObra: string; subcentroErp: string; qtd_notas: number; valor_bruto_servico: number; atualizadoEm: Timestamp };

export function validRows(payload: unknown): ErpRow[] {
  // Query 55 explicitly returns JSON null when a valid query finds no rows.
  if (payload === null) return [];
  if (Array.isArray(payload) && payload.every((row) => row && typeof row === 'object' && !Array.isArray(row))) return payload as ErpRow[];
  throw new HttpsError('internal', 'ERP_RESPONSE_CONTRACT_UNEXPECTED');
}

/** Consolidates the only ERP fields persisted for a work. Empty is a confirmed zero. */
export function consolidateMeasurements(rows: ErpRow[]): { qtd_notas: number; valor_bruto_servico: number } {
  return rows.reduce<{ qtd_notas: number; valor_bruto_servico: number }>((total, row) => {
    const qtd = row.qtd_notas;
    const value = row.valor_bruto_servico;
    if (typeof qtd !== 'number' || !Number.isSafeInteger(qtd) || qtd < 0 || typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new HttpsError('internal', 'ERP_RESPONSE_CONTRACT_UNEXPECTED');
    return { qtd_notas: total.qtd_notas + qtd, valor_bruto_servico: total.valor_bruto_servico + value };
  }, { qtd_notas: 0, valor_bruto_servico: 0 });
}

// Active employee in funcionarios/{uid}; 00-autorizados (legacy) no longer authorizes.
async function assertCronoObraAuthorization(uid: string) {
  const employee = await db.collection('funcionarios').doc(uid).get();
  if (employee.exists && employee.data()?.ativo === true) return;
  throw new HttpsError('permission-denied', 'Acesso não autorizado.');
}

async function query55(subcentroErp: string, token: string) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${ERP_BASE}/api/ConsultaDados/${QUERY_ID}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ CentroCusto: CENTRO_CUSTO, SubCentro: subcentroErp }), signal: controller.signal });
    logger.info('monday-serp:erp-response', { queryId: QUERY_ID, CentroCusto: CENTRO_CUSTO, SubCentro: subcentroErp, httpStatus: response.status, responseType: response.headers.get('content-type') ?? null, responseLength: response.headers.get('content-length') ?? null });
    if (response.status === 401 || response.status === 403) throw new HttpsError('permission-denied', 'ERP_AUTH_ERROR');
    if (response.status === 404) throw new HttpsError('not-found', 'ERP_QUERY_NOT_FOUND');
    if (!response.ok) throw new HttpsError('internal', 'ERP_HTTP_ERROR');
    try { return validRows(await response.json()); } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('internal', 'ERP_RESPONSE_JSON_INVALID'); }
  } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('unavailable', 'ERP_CONNECTION_ERROR'); } finally { clearTimeout(timer); }
}

export const syncMondaySerpMeasurements = onCall({ region: 'southamerica-east1', secrets: [erpToken], timeoutSeconds: 60 }, async (request) => {
  let stage = 'start';
  try {
    logger.info('monday-serp:start', { hasAuth: Boolean(request.auth), hasIdObra: Boolean(request.data?.idObra), hasSubcentroErp: Boolean(request.data?.subcentroErp) });
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    stage = 'authorization';
    await assertCronoObraAuthorization(request.auth.uid);
    logger.info('monday-serp:authorized');
    stage = 'validation';
    const idObra = typeof request.data?.idObra === 'string' ? request.data.idObra.trim() : '';
    const subcentroErp = typeof request.data?.subcentroErp === 'string' ? request.data.subcentroErp.trim() : '';
    if (!idObra || !subcentroErp) throw new HttpsError('invalid-argument', 'idObra ou subcentroErp inválido.');
    logger.info('monday-serp:request-valid', { hasIdObra: true, subcentroErp });
    stage = 'erp';
    const token = erpToken.value(); if (!token?.trim()) throw new HttpsError('failed-precondition', 'ERP_API_TOKEN_MISSING');
    logger.info('monday-serp:erp-start', { queryId: QUERY_ID, CentroCusto: CENTRO_CUSTO, SubCentro: subcentroErp });
    const totals = consolidateMeasurements(await query55(subcentroErp, token));
    logger.info('monday-serp:consolidated', { qtdNotas: totals.qtd_notas, valorBrutoServico: totals.valor_bruto_servico });
    stage = 'firestore';
    const snapshot: MondaySerpMeasurements = { idObra, subcentroErp, ...totals, atualizadoEm: Timestamp.now() };
    await db.collection('monday-serp').doc(idObra).set(snapshot);
    logger.info('monday-serp:firestore-written');
    logger.info('monday-serp:done');
    return snapshot;
  } catch (error) {
    logger.error('monday-serp:failed', { stage, message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Falha ao sincronizar medições.');
  }
});
