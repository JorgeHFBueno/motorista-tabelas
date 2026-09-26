export const ERP_API_TOKEN_MISSING = 'ERP_API_TOKEN_MISSING';
export const ERP_RESPONSE_CONTRACT_UNEXPECTED = 'ERP_RESPONSE_CONTRACT_UNEXPECTED';
export const DEFAULT_ERP360_API_BASE_URL = 'https://s15.elevor.cloud/LedurPreFabricados/ERP360';

const ALLOWED_QUERY_IDS = new Set([46, 47]);
const TIMEOUT_MS = 20_000;

export class ErpClientError extends Error {
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = 'ErpClientError';
    this.code = code;
    this.metadata = metadata;
  }
}

function safeResponseShape(payload) {
  if (Array.isArray(payload)) return { kind: 'array', length: payload.length };
  if (payload && typeof payload === 'object') return { kind: 'object', keys: Object.keys(payload).sort() };
  return { kind: typeof payload };
}

export function normalizeErpRows(payload) {
  const isObjectArray = (value) => Array.isArray(value)
    && value.every((row) => row && typeof row === 'object' && !Array.isArray(row));
  if (isObjectArray(payload)) return payload;
  for (const key of ['data', 'result']) {
    if (payload && typeof payload === 'object' && isObjectArray(payload[key])) return payload[key];
  }
  throw new ErpClientError(
    ERP_RESPONSE_CONTRACT_UNEXPECTED,
    'A resposta ERP não é um array de objetos nem contém data/result como array de objetos.',
    { responseShape: safeResponseShape(payload) },
  );
}

function classifyHttpStatus(status) {
  if (status === 401 || status === 403) return 'ERP_AUTH_ERROR';
  if (status === 404) return 'ERP_QUERY_NOT_FOUND';
  return 'ERP_HTTP_ERROR';
}

/** Executa exclusivamente POSTs de leitura das queries ERP 46 ou 47. */
export async function consultarQueryErp({
  queryId,
  parameters,
  token = process.env.ERP360_API_TOKEN,
  baseUrl = process.env.ERP360_API_BASE_URL || DEFAULT_ERP360_API_BASE_URL,
}) {
  if (!ALLOWED_QUERY_IDS.has(queryId)) {
    throw new ErpClientError('ERP_QUERY_ID_NOT_ALLOWED', 'Esta ferramenta aceita somente as queries 46 e 47.');
  }
  if (typeof token !== 'string' || token.trim() === '') {
    throw new ErpClientError(ERP_API_TOKEN_MISSING, 'ERP360_API_TOKEN não está definido.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = `${baseUrl.replace(/\/+$/, '')}/api/ConsultaDados/${queryId}`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(parameters),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ErpClientError('ERP_CONNECTION_ERROR', 'Não foi possível conectar à API ERP.', {
      queryId,
      timeout: error?.name === 'AbortError',
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ErpClientError(classifyHttpStatus(response.status), 'A API ERP respondeu com status não aceito.', {
      queryId,
      httpStatus: response.status,
    });
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ErpClientError('ERP_RESPONSE_JSON_INVALID', 'A resposta ERP não contém JSON válido.', {
      queryId,
      httpStatus: response.status,
    });
  }
  const rows = normalizeErpRows(payload);
  return {
    rows,
    metadata: {
      queryId,
      httpStatus: response.status,
      contentType: response.headers.get('content-type') || null,
      rowCount: rows.length,
      firstRecordFields: Object.keys(rows[0] ?? {}).sort(),
    },
  };
}
