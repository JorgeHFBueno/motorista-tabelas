import { getAuth } from 'firebase/auth';
import { app } from '../firebase';
import type { Credenciais } from './credenciais';
import { descreverLogin, formatarCelular } from './loginIdentifier';

// Usuários da WEB (Cadastros, só adm2), pela Function adminApi. Contrato: The Manuscript, funcionarios.md.
export type FuncionarioResumo = {
  nome: string | null;
  email: string | null;
  ativo: boolean;
  credenciais: Credenciais;
  ultimoAcesso: string | null;
};

export type AdminUser = {
  uid: string;
  email?: string;
  displayName?: string;
  createdAt?: string;
  lastLoginAt?: string;
  disabled: boolean;
  // null = conta do login sem funcionário (por exemplo, criada pelo antigo cadastro aberto).
  funcionario: FuncionarioResumo | null;
};

export type RegisterAuthorizedUserInput = {
  nome: string;
  email: string;
  password: string;
  credenciais: Credenciais;
  celular: boolean;
};

export type UpdateAdminUserInput = {
  uid: string;
  ativo: boolean;
  credenciais: Credenciais;
};

// contaExistente: já havia conta com esse login (sem funcionário); a senha dela passou a ser a informada.
export type RegisterAuthorizedUserResponse = { funcionarioDocumentId: string; contaExistente?: boolean };

const API_BASE = '/api/admin';

const MENSAGENS: Record<string, string> = {
  missing_authorization: 'Sua sessão expirou. Faça login novamente.',
  invalid_token: 'Sua sessão expirou. Faça login novamente.',
  expired_token: 'Sua sessão expirou. Faça login novamente.',
  authorization_unavailable: 'Não foi possível verificar sua autorização agora. Tente novamente.',
  forbidden: 'Seu usuário não tem a credencial adm2 ativa para administrar usuários.',
  missing_nome: 'Informe o nome.',
  missing_email: 'Informe um login válido.',
  missing_password: 'Informe a senha inicial.',
  invalid_password: 'A senha precisa ter ao menos 6 caracteres.',
  invalid_credenciais: 'Marque ao menos uma credencial.',
  invalid_ativo: 'Informe a situação do usuário.',
  cannot_remove_own_adm2: 'Você não pode tirar a sua própria credencial adm2 nem se desativar.',
  employee_already_exists: 'Já existe um funcionário com este login.',
  employee_not_found: 'Esta conta não tem funcionário: cadastre em Novo usuário ou exclua a conta.',
  employee_exists: 'Funcionário não se exclui: desative-o.',
  'auth/user-not-found': 'Usuário não encontrado no login do sistema.',
  'auth/invalid-email': 'O login informado é inválido.',
  'auth/invalid-password': 'A senha não atende aos requisitos do Firebase.',
};

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

async function requestAdminApi<T>(path: string, options: RequestInit = {}, fallback = 'Erro ao processar a solicitação.'): Promise<T> {
  const currentUser = getAuth(app).currentUser;
  if (!currentUser) throw new Error('Usuário não autenticado.');
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await currentUser.getIdToken()}` },
  });
  if (!response.ok) {
    let code = 'request_failed';
    try {
      const data = await response.json();
      if (typeof data?.error === 'string' && data.error) code = data.error;
    } catch {
      // resposta sem corpo
    }
    throw new AdminApiError(response.status, code, MENSAGENS[code] ?? fallback);
  }
  return response.json() as Promise<T>;
}

export async function listUsers(): Promise<AdminUser[]> {
  const data = await requestAdminApi<{ users: AdminUser[] }>('/users', {}, 'Não foi possível carregar os usuários.');
  return data.users ?? [];
}

export function registerAuthorizedUser(input: RegisterAuthorizedUserInput) {
  return requestAdminApi<RegisterAuthorizedUserResponse>('/users/register', { method: 'POST', body: JSON.stringify(input) }, 'Erro ao cadastrar o usuário.');
}

export async function updateUser(input: UpdateAdminUserInput): Promise<AdminUser> {
  const data = await requestAdminApi<{ user: AdminUser }>(`/users/${encodeURIComponent(input.uid)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ativo: input.ativo, credenciais: input.credenciais }),
  }, 'Erro ao atualizar o usuário.');
  return data.user;
}

/** Senha nova definida pelo adm2; as sessões abertas da conta são encerradas. */
export async function definirSenha(uid: string, password: string): Promise<void> {
  await requestAdminApi(`/users/${encodeURIComponent(uid)}/senha`, { method: 'POST', body: JSON.stringify({ password }) }, 'Erro ao definir a senha.');
}

/** Só contas sem funcionário (funcionário se desativa). */
export async function deleteUser(uid: string): Promise<void> {
  await requestAdminApi(`/users/${encodeURIComponent(uid)}`, { method: 'DELETE' }, 'Erro ao excluir a conta.');
}

export function nomeDoUsuario(user: AdminUser) {
  return user.funcionario?.nome?.trim() || user.displayName?.trim() || user.email?.split('@')[0] || user.uid;
}

/** Login em texto: celular formatado ou o e-mail. */
export function loginDoUsuario(user: AdminUser) {
  const login = descreverLogin(user.email);
  return login.tipo === 'celular' ? `Celular ${formatarCelular(login.valor)}` : login.valor || '—';
}
