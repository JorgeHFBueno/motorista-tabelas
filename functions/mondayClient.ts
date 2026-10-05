import { defineSecret } from 'firebase-functions/params';

export const mondayApiToken = defineSecret('MONDAY_API_TOKEN');
export const MONDAY_API_VERSION = '2026-07';
const MONDAY_URL = 'https://api.monday.com/v2';
type AnyRecord = Record<string, any>;
export type MondayQueryMeta = { requestedApiVersion: string; effectiveApiVersion: string | null };

export async function queryMonday(token: string, query: string, variables: AnyRecord, onMeta?: (meta: MondayQueryMeta) => void) {
  const response = await fetch(MONDAY_URL, { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': MONDAY_API_VERSION }, body: JSON.stringify({ query, variables }) });
  onMeta?.({ requestedApiVersion: MONDAY_API_VERSION, effectiveApiVersion: response.headers.get('API-Version') ?? response.headers.get('X-API-Version') });
  const payload = await response.json().catch(() => ({})) as AnyRecord;
  if (!response.ok || payload.errors?.length) throw new Error(`MONDAY_API: ${payload.errors?.map((error: any) => error.message).join('; ') || payload.error_message || response.status}`);
  return payload.data;
}
