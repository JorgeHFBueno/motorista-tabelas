import { getAuth } from 'firebase/auth';
import { collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { app, db } from '../../firebase';
import { PORTAL_COLECOES, type ClientePortal } from './portalDominio';

// Clientes do portal (users/{uid}), só adm2. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/users.md.
// A conta do login nasce e é ativada/desativada pela Function adminApi; nome e CNPJ/CPF o adm2 grava direto no Firestore.

const API_BASE = '/api/admin';

const MENSAGENS: Record<string, string> = {
  missing_authorization: 'Sua sessão expirou. Faça login novamente.',
  invalid_token: 'Sua sessão expirou. Faça login novamente.',
  expired_token: 'Sua sessão expirou. Faça login novamente.',
  authorization_unavailable: 'Não foi possível verificar sua autorização agora. Tente novamente.',
  forbidden: 'Seu usuário não tem a credencial adm2 ativa para administrar clientes.',
  missing_nome: 'Informe o nome.',
  missing_email: 'Informe um e-mail válido para o login.',
  invalid_password: 'A senha precisa ter ao menos 6 caracteres.',
  invalid_documentos: 'Informe ao menos um CNPJ/CPF válido.',
  invalid_ativo: 'Informe a situação do cliente.',
  employee_account: 'Este login é de um funcionário da Ledur. Funcionário não pode ser cliente do portal.',
  client_already_exists: 'Já existe um cliente com este login.',
  client_not_found: 'Cliente não encontrado.',
  'auth/user-not-found': 'Conta não encontrada no login do sistema.',
  'auth/invalid-email': 'O e-mail informado é inválido.',
  'auth/invalid-password': 'A senha não atende aos requisitos do Firebase.',
};

class ClientesApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ClientesApiError';
    this.status = status;
    this.code = code;
  }
}

async function requestApi<T>(path: string, options: RequestInit, fallback: string): Promise<T> {
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
    throw new ClientesApiError(response.status, code, MENSAGENS[code] ?? fallback);
  }
  return response.json() as Promise<T>;
}

export type NovoClienteInput = { nome: string; email: string; password: string; documentos: string[] };

// contaExistente: já havia conta com esse login, sem funcionário nem cliente; a senha dela passou a ser a informada.
export function criarCliente(input: NovoClienteInput) {
  return requestApi<{ uid: string; contaExistente: boolean }>('/clientes', { method: 'POST', body: JSON.stringify(input) }, 'Erro ao cadastrar o cliente.');
}

/** Ativa ou desativa o login; ao desativar, as sessões abertas do cliente são encerradas. */
export async function definirClienteAtivo(uid: string, ativo: boolean): Promise<void> {
  await requestApi(`/clientes/${encodeURIComponent(uid)}`, { method: 'PATCH', body: JSON.stringify({ ativo }) }, 'Erro ao alterar a situação do cliente.');
}

const textoOu = (valor: unknown, padrao: string) => (typeof valor === 'string' && valor.trim() ? valor.trim() : padrao);

export async function listarClientes(): Promise<ClientePortal[]> {
  const snap = await getDocs(collection(db, PORTAL_COLECOES.clientes));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        nome: textoOu(data.nome, d.id),
        email: textoOu(data.email, ''),
        documentos: Array.isArray(data.documentos) ? data.documentos.filter((x): x is string => typeof x === 'string') : [],
        ativo: data.ativo === true,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Contratos publicados (portal-obras) por CNPJ/CPF. */
export async function contarContratosPorDocumento(): Promise<Map<string, number>> {
  const snap = await getDocs(collection(db, PORTAL_COLECOES.obras));
  const contagem = new Map<string, number>();
  snap.docs.forEach((d) => {
    const documento = d.get('clienteDocumento');
    if (typeof documento === 'string') contagem.set(documento, (contagem.get(documento) ?? 0) + 1);
  });
  return contagem;
}

/** Nome e CNPJ/CPF, gravados pelo adm2 (as Rules permitem); os CNPJ/CPF definem quais contratos o cliente vê. */
export function salvarCliente(uid: string, dados: { nome: string; documentos: string[] }) {
  return updateDoc(doc(db, PORTAL_COLECOES.clientes, uid), { nome: dados.nome, documentos: dados.documentos, atualizadoEm: serverTimestamp() });
}
