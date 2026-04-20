import { getAuth } from 'firebase/auth';
import { app } from '../firebase';

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

export type RegisterAuthorizedUserInput = {
  nome: string;
  email: string;
  password: string;
  perfil: 'Motorista' | 'Adm1' | 'Adm2';
  celular: boolean;
};

const API_BASE = '/api/admin/users';

async function getAuthHeaders() {
  const currentUser = getAuth(app).currentUser;

  if (!currentUser) {
    throw new Error('Usuario nao autenticado.');
  }

  const token = await currentUser.getIdToken();

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function parseError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    if (typeof data?.error === 'string' && data.error) {
      return data.error;
    }
  } catch {
    // ignore
  }

  return fallback;
}

export async function listUsers(): Promise<AdminUser[]> {
  const response = await fetch(API_BASE, {
    headers: await getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, 'Nao foi possivel carregar usuarios.'));
  }
  const data = await response.json();
  return data.users ?? data;
}

export async function createUser(input: CreateAdminUserInput): Promise<AdminUser> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, 'Erro ao criar usuario.'));
  }
  const data = await response.json();
  return data.user ?? data;
}

export async function deleteUser(uid: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${uid}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, 'Erro ao excluir usuario.'));
  }
}

function mapRegisterError(errorCode: string) {
  switch (errorCode) {
    case 'missing_nome':
      return 'Informe o nome.';
    case 'missing_email':
      return 'Informe um email valido.';
    case 'missing_password':
      return 'Informe a senha inicial.';
    case 'invalid_perfil':
      return 'Selecione um perfil valido.';
    case 'auth/email-already-exists':
      return 'Ja existe um usuario com este email.';
    case 'auth/invalid-email':
      return 'O email informado e invalido.';
    case 'auth/invalid-password':
      return 'A senha inicial nao atende aos requisitos do Firebase.';
    case 'forbidden':
      return 'Voce nao tem permissao para cadastrar usuarios.';
    default:
      return 'Erro ao cadastrar usuario.';
  }
}

export async function registerAuthorizedUser(input: RegisterAuthorizedUserInput) {
  const response = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(mapRegisterError(await parseError(response, 'register_user_failed')));
  }

  return response.json();
}
