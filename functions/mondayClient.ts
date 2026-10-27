import { defineSecret } from 'firebase-functions/params';

// Token e versão da API do monday, usados pela importação de quadros do monday para o Friday (fridayMondayImport).
export const mondayApiToken = defineSecret('MONDAY_API_TOKEN');
export const MONDAY_API_VERSION = '2026-07';
