export type AdminUser = {
  uid: string;
  email?: string;
  displayName?: string;
  providerId?: string;
  createdAt?: string;
  lastLoginAt?: string;
};

export type CreateAdminUserInput = {
  email: string;
  password: string;
  displayName?: string;
};

const API_BASE = '/api/admin/users';

/**
 * Cliente mínimo para endpoints de administração de usuários.
 *
 * TODO: implementar endpoints no backend (Firebase Admin SDK) para que estas chamadas
 * funcionem em produção. O formato de resposta foi baseado na API REST do Firebase Admin.
 */
export async function listUsers(): Promise<AdminUser[]> {
  const response = await fetch(API_BASE);
  if (!response.ok) {
    throw new Error('Não foi possível carregar usuários. Confirme se o endpoint /api/admin/users está disponível.');
  }
  const data = await response.json();
  return data.users ?? data;
}

export async function createUser(input: CreateAdminUserInput): Promise<AdminUser> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Erro ao criar usuário. Endpoint /api/admin/users precisa estar implementado.');
  }
  return response.json();
}

export async function deleteUser(uid: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${uid}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Erro ao excluir usuário. Endpoint /api/admin/users precisa estar implementado.');
  }
}