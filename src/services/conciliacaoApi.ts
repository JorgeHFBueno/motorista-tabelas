import { getAuth } from 'firebase/auth';
import { app } from '../firebase';
import type { Funcionario, LegacyAuthorizedRecord, LegacyMotoristaRecord } from './funcionarios';

export type ConciliacaoStatus = 'PRONTO' | 'PENDENTE' | 'CONFLITO' | 'SEM_AUTH' | 'JA_CONCILIADO';
export type ConciliacaoRow = {
  auth: { uid: string; email: string; nome: string; disabled: boolean } | null;
  autorizado: LegacyAuthorizedRecord | null;
  motorista: LegacyMotoristaRecord | null;
  sugestoesMotorista: LegacyMotoristaRecord[];
  funcionario: Funcionario | null;
  status: ConciliacaoStatus;
};

const API_BASE = '/api/admin/conciliation';

async function headers() {
  const user = getAuth(app).currentUser;
  if (!user) throw new Error('Usuario nao autenticado.');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` };
}

async function request(path = '', options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: await headers() });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Erro na conciliacao.');
  }
  return response;
}

export async function listConciliacao(): Promise<ConciliacaoRow[]> {
  const response = await request();
  return (await response.json()).rows ?? [];
}

export async function reconcileFuncionario(input: {
  uid: string;
  motoristaId?: string | null;
  nome: string;
  ativo: boolean;
  perfis: Funcionario['perfis'];
  allowExisting?: boolean;
}) {
  const response = await request(`/${encodeURIComponent(input.uid)}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.json();
}
