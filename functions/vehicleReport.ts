import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { temCredencial } from './credenciais.js';
import { defineSecret } from 'firebase-functions/params';
import { db } from './firebaseAdmin.js';

const erpToken = defineSecret('ERP360_API_TOKEN');
const ERP_BASE = 'https://s15.elevor.cloud/LedurPreFabricados/ERP360';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function normalizePlate(value: unknown) { return String(value ?? '').toUpperCase().replace(/[-\s]/g, ''); }
/** Até 500 caracteres do que o ERP respondeu: vai no log e no `details` do erro (a callable só atende adm2). */
export function erpResponseExcerpt(text: string) { return text.trim().slice(0, 500); }
function rows(payload: unknown, excerpt: string) {
  if (Array.isArray(payload) && payload.every((row) => row && typeof row === 'object' && !Array.isArray(row))) return payload;
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.result)) return record.result;
  }
  throw new HttpsError('internal', 'ERP_RESPONSE_CONTRACT_UNEXPECTED', { resposta: excerpt });
}
export const VEHICLE_ERP_QUERY_ALLOWLIST = [47] as const;

async function queryErp(queryId: typeof VEHICLE_ERP_QUERY_ALLOWLIST[number], body: Record<string, string>, token: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${ERP_BASE}/api/ConsultaDados/${queryId}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
    });
    const text = await response.text();
    const details = { query: queryId, status: response.status, resposta: erpResponseExcerpt(text) };
    if (response.status === 401 || response.status === 403) throw new HttpsError('permission-denied', 'ERP_AUTH_ERROR', details);
    if (response.status === 404) throw new HttpsError('not-found', 'ERP_QUERY_NOT_FOUND', details);
    if (!response.ok) throw new HttpsError('internal', 'ERP_HTTP_ERROR', details);
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { throw new HttpsError('internal', 'ERP_RESPONSE_NOT_JSON', details); }
    return rows(payload, details.resposta);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const motivo = (error as Error)?.name === 'AbortError' ? 'tempo esgotado (20 s)' : String((error as Error)?.message ?? error);
    throw new HttpsError('unavailable', 'ERP_CONNECTION_ERROR', { query: queryId, motivo });
  } finally { clearTimeout(timer); }
}

/** Mirrors the /frota policy: active employee with adm2 (the WEB administrative screens are adm2-only). */
async function assertFrotaAuthorization(uid: string) {
  const employee = await db.collection('funcionarios').doc(uid).get();
  if (!temCredencial(employee.data())) {
    throw new HttpsError('permission-denied', 'Acesso não autorizado.');
  }
}

/** Authenticated, backend-only ERP gateway. Query IDs are intentionally not client input. */
export const getVehicleErpCosts = onCall({ region: 'southamerica-east1', secrets: [erpToken], timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
  await assertFrotaAuthorization(request.auth.uid);
  const placa = normalizePlate(request.data?.placa);
  const dataInicial = String(request.data?.dataInicial ?? '');
  const dataFinal = String(request.data?.dataFinal ?? '');
  if (!placa || !DAY.test(dataInicial) || !DAY.test(dataFinal) || dataInicial > dataFinal) throw new HttpsError('invalid-argument', 'Período ou placa inválidos.');
  const token = erpToken.value();
  if (!token?.trim()) throw new HttpsError('failed-precondition', 'ERP_API_TOKEN_MISSING');
  const parameters = { DataInicial: dataInicial, DataFinal: dataFinal, Placa: placa };
  try {
    const query47 = await queryErp(47, parameters, token);
    return { request: parameters, query47 };
  } catch (error) {
    // Sem isto a falha some do log (HttpsError não é registrado): fica o pedido e o que o ERP respondeu.
    if (error instanceof HttpsError) console.error('getVehicleErpCosts: ERP falhou', { pedido: parameters, codigo: error.code, mensagem: error.message, detalhe: error.details });
    throw error;
  }
});
