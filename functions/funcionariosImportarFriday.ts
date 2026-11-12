import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db } from './firebaseAdmin.js';
import { credenciaisDe, temCredencial } from './credenciais.js';
import { nomesBatem } from './fridayMondayPessoas.js';
import { QUADRO_FUNCIONARIOS } from './logisticaPessoas.js';

// Importar do quadro FUNCIONARIOS do Friday para Cadastros → Usuários (escritorio ou adm2). O quadro só é lido.
// - "listar": cada item ativo do quadro com a situação dele aqui (novo, já funcionário, ligado, incompleto ou fora).
// - "criar": quem é novo ganha conta (login = celular, senha = 6 primeiros dígitos do CPF) e funcionarios/{uid} só
//   com a credencial Motorista; quem já é funcionário (mesmo celular) só é ligado. O CPF não é guardado.
// - "ligar": liga um item a um funcionário escolhido na tela (a pessoa já está aqui com outro login).
// Em todos, funcionarios.fridayItemId guarda o id do item. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/funcionarios.md
// e 03_APLICACAO_WEB/05_CADASTROS.md.

type AnyRecord = Record<string, any>;
const REGIAO = 'southamerica-east1';
export const LOGIN_CELULAR = '@example.com';
const MAX_POR_CHAMADA = 100;

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
const digitos = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\D/g, '') : '');

export type Coluna = { id: number; titulo?: unknown; tipo?: unknown };
export type ColunasPessoa = { telefone: Coluna | null; cpf: Coluna | null };

/** Telefone: coluna "Telefone" ou "Celular" (sem acento e maiúsculas), senão a primeira do tipo telefone. CPF: coluna "CPF". */
export function colunasDaPessoa(colunas: Coluna[]): ColunasPessoa {
  const titulo = (c: Coluna) => (typeof c.titulo === 'string' ? semAcento(c.titulo) : '');
  const telefone = colunas.find(c => ['telefone', 'celular'].includes(titulo(c))) ?? colunas.find(c => c.tipo === 'telefone') ?? null;
  return { telefone, cpf: colunas.find(c => titulo(c) === 'cpf') ?? null };
}

/** Celular com DDD (10 ou 11 dígitos; o 55 do país sai); null quando não serve de login. */
export function celularDe(valor: unknown): string | null {
  let d = digitos(valor);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

/** CPF com 11 dígitos e dígitos verificadores certos; coluna numérica perde os zeros da frente, que voltam. */
export function cpfDe(valor: unknown): string | null {
  let d = digitos(valor);
  if (typeof valor === 'number' && d.length >= 9 && d.length < 11) d = d.padStart(11, '0');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return null;
  const dv = (n: number) => {
    const soma = [...d.slice(0, n)].reduce((t, c, k) => t + Number(c) * (n + 1 - k), 0);
    return ((soma * 10) % 11) % 10;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]) ? d : null;
}

/** Senha da conta nova: os 6 primeiros dígitos do CPF (decisão do responsável de 2026-11-12). */
export const senhaDoCpf = (cpf: string) => cpf.slice(0, 6);
export const loginDoCelular = (celular: string) => `${celular}${LOGIN_CELULAR}`;

export type Situacao = 'novo' | 'funcionario' | 'vinculado' | 'incompleto' | 'fora';
export type FuncionarioResumo = { uid: string; nome: string | null; ativo: boolean; email: string | null; fridayItemId: string | null };
export type PessoaQuadro = {
  id: string; nome: string; celular: string | null; situacao: Situacao;
  /** Funcionário ligado, ou dono do celular; no "novo", a conta solta (sem funcionário) que será reaproveitada. */
  uid: string | null; funcionario: string | null;
  motivo: string | null;
  /** Só no "novo" e no "incompleto": funcionário ainda sem item cujo nome bate (provável a mesma pessoa, com outro login). */
  sugestao: { uid: string; nome: string } | null;
};
type Interno = PessoaQuadro & { cpf: string | null };

const ativo = (item: AnyRecord) => !item.arquivado_em && !item.excluido_em && item.item_pai_id == null
  && typeof item.nome === 'string' && item.nome.trim() !== '';

/**
 * Situação de cada item ativo do quadro. `contas`: UID da conta do Auth por login; `clientes`: UIDs de contas do portal
 * do cliente (nunca viram funcionário). O CPF só fica no retorno interno (para a senha); a tela não o recebe.
 */
export function classificarItens(
  itens: AnyRecord[], colunas: ColunasPessoa, funcionarios: FuncionarioResumo[], contas: Map<string, string>, clientes: Set<string>,
): Interno[] {
  const porUid = new Map(funcionarios.map(f => [f.uid, f]));
  const porItem = new Map(funcionarios.filter(f => f.fridayItemId).map(f => [f.fridayItemId!, f]));
  const livres = funcionarios.filter(f => !f.fridayItemId);
  const sugerir = (nome: string, celular: string | null) => {
    const achados = livres.filter(f => nomesBatem(nome, f.nome) && (!celular || f.email !== loginDoCelular(celular)));
    return achados.length === 1 ? { uid: achados[0].uid, nome: achados[0].nome ?? '' } : null;
  };
  const celulas = (item: AnyRecord) => (item.valores ?? {}) as AnyRecord;
  const ativos = itens.filter(ativo);
  const celularDoItem = (item: AnyRecord) => (colunas.telefone ? celularDe(celulas(item)[String(colunas.telefone.id)]) : null);
  const repetidos = new Map<string, number>();
  for (const item of ativos) { const c = celularDoItem(item); if (c) repetidos.set(c, (repetidos.get(c) ?? 0) + 1); }

  return ativos.map(item => {
    const id = String(item.id);
    const nome = String(item.nome).trim().replace(/\s+/g, ' ');
    const brutoCelular = colunas.telefone ? celulas(item)[String(colunas.telefone.id)] : null;
    const brutoCpf = colunas.cpf ? celulas(item)[String(colunas.cpf.id)] : null;
    const celular = celularDoItem(item);
    const cpf = cpfDe(brutoCpf);
    const base: Interno = { id, nome, celular, situacao: 'novo', uid: null, funcionario: null, motivo: null, sugestao: null, cpf };
    const ligado = porItem.get(id);
    if (ligado) return { ...base, situacao: 'vinculado', uid: ligado.uid, funcionario: ligado.nome };
    const fora = (motivo: string, extra: Partial<Interno> = {}): Interno => ({ ...base, situacao: 'fora', motivo, ...extra });
    const incompleto = (motivo: string): Interno => ({ ...base, situacao: 'incompleto', motivo, sugestao: sugerir(nome, celular) });
    if (!celular) return incompleto(digitos(brutoCelular) ? 'telefone sem DDD ou com dígitos a mais' : 'sem telefone');
    if ((repetidos.get(celular) ?? 0) > 1) return fora('o mesmo telefone está em outro item do quadro');
    const uid = contas.get(loginDoCelular(celular)) ?? null;
    if (uid && clientes.has(uid)) return fora('o telefone é login de um cliente do portal');
    const f = uid ? porUid.get(uid) : undefined;
    if (f?.fridayItemId && f.fridayItemId !== id) return fora('o funcionário deste telefone já está ligado a outro item', { uid: f.uid, funcionario: f.nome });
    if (f) return { ...base, situacao: 'funcionario', uid: f.uid, funcionario: f.nome };
    if (!cpf) return incompleto(digitos(brutoCpf) ? 'CPF inválido' : 'sem CPF');
    return { ...base, uid, sugestao: sugerir(nome, celular) };
  });
}

const publica = (p: Interno): PessoaQuadro => {
  const copia: Partial<Interno> = { ...p };
  delete copia.cpf;
  return copia as PessoaQuadro;
};

/** Pedido de "criar": ids de itens (sem repetir, até 100). */
export function lerPedido(dados: unknown): { ids: string[] } | { erro: string } {
  const d = (dados ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(d.ids) ? [...new Set(d.ids.map(String).filter(id => /^\d+$/.test(id)))] : [];
  if (!ids.length) return { erro: 'Escolha ao menos uma pessoa.' };
  if (ids.length > MAX_POR_CHAMADA) return { erro: `No máximo ${MAX_POR_CHAMADA} pessoas por vez.` };
  return { ids };
}

/** Pedido de "ligar": o id do item e o UID do funcionário escolhido. */
export function lerLigacao(dados: unknown): { itemId: string; uid: string } | { erro: string } {
  const d = (dados ?? {}) as Record<string, unknown>;
  const itemId = String(d.itemId ?? '');
  const uid = typeof d.uid === 'string' ? d.uid.trim() : '';
  if (!/^\d+$/.test(itemId) || !uid || uid.includes('/')) return { erro: 'Escolha a pessoa do quadro e o funcionário.' };
  return { itemId, uid };
}

export type ResultadoPessoa = { id: string; nome: string; resultado: 'criado' | 'vinculado' | 'erro'; mensagem?: string };

export interface ImportarFridayStore {
  getEmployee(uid: string): Promise<AnyRecord | undefined>;
  itensDoQuadro(): Promise<AnyRecord[]>;
  colunasDoQuadro(): Promise<Coluna[]>;
  funcionarios(): Promise<FuncionarioResumo[]>;
  /** UID da conta do Auth de cada login encontrado. */
  contas(logins: string[]): Promise<Map<string, string>>;
  clientes(uids: string[]): Promise<Set<string>>;
  criarConta(login: string, senha: string, nome: string): Promise<string>;
  /** Conta solta (sem funcionário): nome e senha novos, ativada, sessões abertas encerradas. */
  reaproveitarConta(uid: string, senha: string, nome: string): Promise<void>;
  apagarConta(uid: string): Promise<void>;
  criarFuncionario(uid: string, dados: AnyRecord): Promise<void>;
  /** Grava fridayItemId no funcionário, se ele existe e ainda não está ligado a um item. */
  ligar(uid: string, itemId: string): Promise<void>;
}

/** Documento do funcionário criado pelo quadro: só Motorista; `motorista.ordem` como nos outros pontos de criação. */
export function novoFuncionario(p: { nome: string; celular: string; id: string }): AnyRecord {
  return {
    nome: p.nome, email: loginDoCelular(p.celular), ativo: true, perfis: credenciaisDe({ motorista: true }),
    motorista: { ordem: 0 }, fridayItemId: p.id,
  };
}

export function createImportarFridayService(store: ImportarFridayStore) {
  async function exigirAcesso(uid: string | undefined) {
    if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    if (!temCredencial(await store.getEmployee(uid), 'escritorio')) throw new HttpsError('permission-denied', 'Acesso não autorizado.');
  }

  async function situacaoAtual(): Promise<{ pessoas: Interno[]; livres: { uid: string; nome: string; ativo: boolean }[] }> {
    const [itens, colunasQuadro, funcionarios] = await Promise.all([store.itensDoQuadro(), store.colunasDoQuadro(), store.funcionarios()]);
    const colunas = colunasDaPessoa(colunasQuadro);
    const faltam = [!colunas.telefone && 'Telefone', !colunas.cpf && 'CPF'].filter(Boolean);
    if (faltam.length) throw new HttpsError('failed-precondition', `O quadro FUNCIONARIOS não tem a coluna ${faltam.join(' nem a coluna ')}.`);
    const logins = [...new Set(itens.filter(ativo).map(i => celularDe((i.valores ?? {})[String(colunas.telefone!.id)])).filter((c): c is string => !!c).map(loginDoCelular))];
    const contas = await store.contas(logins);
    const clientes = await store.clientes([...new Set(contas.values())]);
    const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
    return {
      pessoas: classificarItens(itens, colunas, funcionarios, contas, clientes).sort((a, b) => porNome(a.nome, b.nome)),
      livres: funcionarios.filter(f => !f.fridayItemId).map(f => ({ uid: f.uid, nome: f.nome ?? f.uid, ativo: f.ativo })).sort((a, b) => porNome(a.nome, b.nome)),
    };
  }

  async function criarUma(p: Interno): Promise<ResultadoPessoa> {
    const r = (resultado: ResultadoPessoa['resultado'], mensagem?: string): ResultadoPessoa => ({ id: p.id, nome: p.nome, resultado, ...(mensagem ? { mensagem } : {}) });
    if (p.situacao === 'vinculado') return r('vinculado', 'já estava ligado');
    if (p.situacao === 'fora' || p.situacao === 'incompleto') return r('erro', p.motivo ?? 'fora da importação');
    if (p.situacao === 'funcionario') {
      // Já é funcionário (mesmo celular): só liga ao item; login, senha, credenciais e situação não mudam.
      await store.ligar(p.uid!, p.id);
      return r('vinculado');
    }
    const senha = senhaDoCpf(p.cpf!);
    let uid = p.uid;
    let criada: string | null = null;
    if (uid) await store.reaproveitarConta(uid, senha, p.nome);
    else uid = criada = await store.criarConta(loginDoCelular(p.celular!), senha, p.nome);
    try {
      await store.criarFuncionario(uid, novoFuncionario({ nome: p.nome, celular: p.celular!, id: p.id }));
    } catch (e) {
      if (criada) await store.apagarConta(criada).catch(() => undefined);
      throw e;
    }
    return r('criado');
  }

  return {
    async listar(uid: string | undefined) {
      await exigirAcesso(uid);
      const { pessoas, livres } = await situacaoAtual();
      return { pessoas: pessoas.map(publica), livres };
    },
    /** Cria ou liga os itens escolhidos, pela situação recalculada agora (não a da tela). */
    async criar(uid: string | undefined, dados: unknown) {
      await exigirAcesso(uid);
      const pedido = lerPedido(dados);
      if ('erro' in pedido) throw new HttpsError('invalid-argument', pedido.erro);
      const atuais = (await situacaoAtual()).pessoas;
      const escolhidas = pedido.ids.map(id => atuais.find(p => p.id === id)).filter((p): p is Interno => !!p);
      if (escolhidas.length !== pedido.ids.length) throw new HttpsError('not-found', 'Alguma pessoa escolhida não está mais no quadro.');
      const resultados: ResultadoPessoa[] = [];
      for (const p of escolhidas) {
        try {
          resultados.push(await criarUma(p));
        } catch (e) {
          logger.error('funcionarios-importar-friday:criar', { itemId: p.id, mensagem: String(e) });
          const codigo = (e as { code?: string })?.code;
          const mensagem = codigo === 'auth/email-already-exists' ? 'o telefone virou login de outra conta; atualize a lista'
            : (e as Error)?.message || codigo || String(e);
          resultados.push({ id: p.id, nome: p.nome, resultado: 'erro', mensagem });
        }
      }
      return { resultados };
    },
    async ligar(uid: string | undefined, dados: unknown) {
      await exigirAcesso(uid);
      const ligacao = lerLigacao(dados);
      if ('erro' in ligacao) throw new HttpsError('invalid-argument', ligacao.erro);
      const p = (await situacaoAtual()).pessoas.find(x => x.id === ligacao.itemId);
      if (!p) throw new HttpsError('not-found', 'A pessoa escolhida não está mais no quadro.');
      if (p.situacao !== 'novo' && p.situacao !== 'incompleto') throw new HttpsError('failed-precondition', `${p.nome} não aparece mais como nova. Atualize a lista.`);
      await store.ligar(ligacao.uid, p.id);
      return { resultado: { id: p.id, nome: p.nome, resultado: 'vinculado' } satisfies ResultadoPessoa };
    },
  };
}

const funcionariosRef = db.collection('funcionarios');
const service = createImportarFridayService({
  async getEmployee(uid) {
    const snapshot = await funcionariosRef.doc(uid).get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  async itensDoQuadro() {
    return (await db.collection('friday-itens').where('quadro_id', '==', QUADRO_FUNCIONARIOS).get()).docs.map(d => d.data());
  },
  async colunasDoQuadro() {
    return (await db.collection('friday-colunas').where('quadro_id', '==', QUADRO_FUNCIONARIOS).get()).docs.map(d => d.data() as Coluna);
  },
  async funcionarios() {
    return (await funcionariosRef.get()).docs.map(d => ({
      uid: d.id, nome: typeof d.get('nome') === 'string' ? d.get('nome') : null, ativo: d.get('ativo') === true,
      email: typeof d.get('email') === 'string' ? d.get('email').toLowerCase() : null,
      fridayItemId: d.get('fridayItemId') != null ? String(d.get('fridayItemId')) : null,
    }));
  },
  async contas(logins) {
    const contas = new Map<string, string>();
    for (let k = 0; k < logins.length; k += 100) {
      const r = await adminAuth.getUsers(logins.slice(k, k + 100).map(email => ({ email })));
      for (const u of r.users) if (u.email) contas.set(u.email.toLowerCase(), u.uid);
    }
    return contas;
  },
  async clientes(uids) {
    const clientes = new Set<string>();
    for (let k = 0; k < uids.length; k += 100) {
      const snaps = await db.getAll(...uids.slice(k, k + 100).map(uid => db.collection('users').doc(uid)));
      for (const s of snaps) if (s.exists) clientes.add(s.id);
    }
    return clientes;
  },
  async criarConta(login, senha, nome) {
    return (await adminAuth.createUser({ email: login, password: senha, displayName: nome })).uid;
  },
  async reaproveitarConta(uid, senha, nome) {
    // Quem criou a conta antes pode saber a senha: ela é trocada e as sessões abertas caem (como em Novo usuário).
    await adminAuth.updateUser(uid, { displayName: nome, password: senha, disabled: false });
    await adminAuth.revokeRefreshTokens(uid);
  },
  async apagarConta(uid) {
    await adminAuth.deleteUser(uid);
  },
  async criarFuncionario(uid, dados) {
    await funcionariosRef.doc(uid).create({ ...dados, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  },
  async ligar(uid, itemId) {
    const ref = funcionariosRef.doc(uid);
    await db.runTransaction(async tx => {
      const [f, outros] = await Promise.all([tx.get(ref), tx.get(funcionariosRef.where('fridayItemId', '==', itemId).limit(1))]);
      if (!f.exists) throw new HttpsError('not-found', 'Funcionário não encontrado.');
      if (f.get('fridayItemId') != null) throw new HttpsError('failed-precondition', 'Este funcionário já está ligado a outro item do quadro.');
      if (!outros.empty) throw new HttpsError('failed-precondition', 'Este item já está ligado a outro funcionário.');
      tx.update(ref, { fridayItemId: itemId, updatedAt: FieldValue.serverTimestamp() });
    });
  },
});

/** { modo: 'listar' }, { modo: 'criar', ids } ou { modo: 'ligar', itemId, uid }. escritorio ou adm2. */
export const funcionariosImportarFriday = onCall({ region: REGIAO, timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  const uid = request.auth?.uid;
  const modo = String(request.data?.modo ?? 'listar');
  if (modo === 'listar') return service.listar(uid);
  if (modo === 'ligar') {
    const r = await service.ligar(uid, request.data);
    logger.info('funcionarios-importar-friday:ligar', { por: uid, itemId: r.resultado.id });
    return r;
  }
  if (modo !== 'criar') throw new HttpsError('invalid-argument', 'modo inválido.');
  const r = await service.criar(uid, request.data);
  logger.info('funcionarios-importar-friday', { por: uid, criados: r.resultados.filter(x => x.resultado === 'criado').length, vinculados: r.resultados.filter(x => x.resultado === 'vinculado').length, erros: r.resultados.filter(x => x.resultado === 'erro').length });
  return r;
});
