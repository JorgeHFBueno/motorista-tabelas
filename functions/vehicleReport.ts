import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { db } from './firebaseAdmin.js';

const erpToken = defineSecret('ERP360_API_TOKEN');
const ERP_BASE = 'https://s15.elevor.cloud/LedurPreFabricados/ERP360';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function normalizePlate(value: unknown) { return String(value ?? '').toUpperCase().replace(/[-\s]/g, ''); }
function rows(payload: unknown) {
  if (Array.isArray(payload) && payload.every((row) => row && typeof row === 'object' && !Array.isArray(row))) return payload;
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.result)) return record.result;
  }
  throw new HttpsError('internal', 'ERP_RESPONSE_CONTRACT_UNEXPECTED');
}
async function queryErp(queryId: 46 | 47, body: Record<string, string>, token: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${ERP_BASE}/api/ConsultaDados/${queryId}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) throw new HttpsError('permission-denied', 'ERP_AUTH_ERROR');
    if (response.status === 404) throw new HttpsError('not-found', 'ERP_QUERY_NOT_FOUND');
    if (!response.ok) throw new HttpsError('internal', 'ERP_HTTP_ERROR');
    return rows(await response.json());
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', 'ERP_CONNECTION_ERROR');
  } finally { clearTimeout(timer); }
}

/** Mirrors the effective /frota policy: funcionarios/{uid}, active, and adm1 or adm2. */
async function assertFrotaAuthorization(uid: string) {
  const employee = await db.collection('funcionarios').doc(uid).get();
  const profiles = employee.data()?.perfis;
  if (!employee.exists || employee.data()?.ativo !== true || (profiles?.adm1 !== true && profiles?.adm2 !== true)) {
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
  const query46 = await queryErp(46, parameters, token);
  const query47 = await queryErp(47, parameters, token);
  return { request: parameters, query46, query47 };
});
