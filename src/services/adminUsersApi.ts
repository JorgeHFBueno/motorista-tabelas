import { getAuth } from 'firebase/auth';
import { app } from '../firebase';

export type AdminUser = {
  uid: string;
  email?: string;
  displayName?: string;
  providerId?: string;
  createdAt?: string;
  lastLoginAt?: string;
  disabled: boolean;
  authorization: {
    exists: boolean;
    nome?: string | null;
    adm1: boolean;
    adm2: boolean;
    profile: 'Motorista' | 'Adm1' | 'Adm2';
  };
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

export type UpdateAdminUserInput = {
  uid: string;
  disabled: boolean;
  perfil: 'Motorista' | 'Adm1' | 'Adm2';
};

const API_BASE = '/api/admin/users';

class AdminApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

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

async function parseErrorCode(response: Response, fallback: string) {
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

function mapAdminApiError(code: string, fallback: string) {
  switch (code) {
    case 'missing_authorization':
    case 'invalid_token':
    case 'expired_token':
      return 'Sua sessao expirou ou o token de autenticacao e invalido. Faca login novamente.';
    case 'requester_missing_email':
      return 'Seu usuario autenticado nao possui email valido para validar permissao.';
    case 'forbidden':
      return 'Seu usuario nao possui permissao adm2 em 00-autorizados para administrar usuarios.';
    default:
      return fallback;
  }
}

async function requestAdminApi(path: string, options: RequestInit = {}, fallback = 'Erro ao processar solicitacao.') {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const code = await parseErrorCode(response, 'request_failed');
    throw new AdminApiError(response.status, code, mapAdminApiError(code, fallback));
  }

  return response;
}

export async function listUsers(): Promise<AdminUser[]> {
  const response = await requestAdminApi('', {}, 'Nao foi possivel carregar usuarios.');
  const data = await response.json();
  return data.users ?? data;
}

export async function createUser(input: CreateAdminUserInput): Promise<AdminUser> {
  const response = await requestAdminApi('', {
    method: 'POST',
    body: JSON.stringify(input),
  }, 'Erro ao criar usuario.');
  const data = await response.json();
  return data.user ?? data;
}

export async function deleteUser(uid: string): Promise<void> {
  await requestAdminApi(`/${uid}`, {
    method: 'DELETE',
  }, 'Erro ao excluir usuario.');
}

function mapUpdateError(errorCode: string) {
  switch (errorCode) {
    case 'missing_authorization':
    case 'invalid_token':
    case 'expired_token':
      return 'Sua sessao expirou ou o token de autenticacao e invalido. Faca login novamente.';
    case 'requester_missing_email':
      return 'Seu usuario autenticado nao possui email valido para validar permissao.';
    case 'missing_email':
      return 'O usuario precisa ter um email para sincronizar a autorizacao.';
    case 'invalid_disabled':
      return 'Informe um status valido para o usuario.';
    case 'invalid_perfil':
      return 'Selecione um perfil valido.';
    case 'auth/user-not-found':
      return 'Usuario nao encontrado no Firebase Authentication.';
    case 'forbidden':
      return 'Voce nao tem permissao para editar usuarios.';
    default:
      return 'Erro ao atualizar usuario.';
  }
}

export async function updateUser(input: UpdateAdminUserInput): Promise<AdminUser> {
  const response = await fetch(`${API_BASE}/${input.uid}`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      disabled: input.disabled,
      perfil: input.perfil,
    }),
  });

  if (!response.ok) {
    throw new Error(mapUpdateError(await parseErrorCode(response, 'update_user_failed')));
  }

  const data = await response.json();
  return data.user ?? data;
}

function mapRegisterError(errorCode: string) {
  switch (errorCode) {
    case 'missing_authorization':
    case 'invalid_token':
    case 'expired_token':
      return 'Sua sessao expirou ou o token de autenticacao e invalido. Faca login novamente.';
    case 'requester_missing_email':
      return 'Seu usuario autenticado nao possui email valido para validar permissao.';
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
    throw new Error(mapRegisterError(await parseErrorCode(response, 'register_user_failed')));
  }

  return response.json();
}
