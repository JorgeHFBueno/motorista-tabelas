import { getAuth } from 'firebase/auth';
import { app } from '../firebase';

export type MondayObraRow = {
  documentId: string; nome: string | null; numeroContrato: string | number | null; empresa: string | null;
  status: string | null; tipoObra: string | null; obraV2Id: string | null; raw: Record<string, unknown>;
};
export type ObraV2Row = {
  documentId: string; codObra: string | number | null; siglaObra: string | null; nomeObra: string | null;
  local: string | null; status: string | null; data: Record<string, unknown>;
};

const endpoint = '/api/monday-link-obra-v2';

async function request(path = '', options: RequestInit = {}) {
  const user = getAuth(app).currentUser;
  if (!user) throw new Error('Usuário não autenticado.');
  const response = await fetch(`${endpoint}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}`, ...(options.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível concluir a operação.');
  return data;
}

export async function listMondayObras(): Promise<{ monday: MondayObraRow[]; obrasV2: ObraV2Row[] }> { return request(); }
export async function linkMondayObra(mondayItemId: string, obraV2Id: string): Promise<{ result: 'UPDATED' | 'NO_CHANGE' }> {
  return request('', { method: 'POST', body: JSON.stringify({ action: 'LINK_EXISTING', mondayItemId, obraV2Id }) });
}
export async function createAndLinkMondayObra(mondayItemId: string): Promise<{ result: 'CREATED_AND_LINKED'; obraV2Id: string }> {
  return request('', { method: 'POST', body: JSON.stringify({ action: 'CREATE_AND_LINK', mondayItemId }) });
}
