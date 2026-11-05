import { randomBytes } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db } from './firebaseAdmin.js';
import { mondayApiToken } from './mondayClient.js';
import { CREDENCIAIS, lerCredenciais, type Credenciais } from './credenciais.js';
import { exigirAdm2, gql } from './fridayMondayImport.js';

// Pessoas do monday → funcionários do sistema (só adm2). O monday só é lido.
// - "listar": cada usuário do monday com a situação dele aqui (novo, já funcionário, já ligado ou fora).
// - "criar": quem é novo ganha conta no Auth SEM senha e funcionarios/{uid}; quem já é funcionário só é ligado.
//   Em ambos, funcionarios.mondayId guarda o id do monday (a importação dos quadros usa para preencher as colunas
//   de pessoa). A senha a própria pessoa define pelo "Primeiro acesso" do login, com o link que chega no e-mail.

const REGIAO = 'southamerica-east1';
const LOGIN_CELULAR = '@example.com';
const MAX_POR_CHAMADA = 100;

export type UsuarioMonday = { id: string; nome: string; email: string; ativo: boolean; convidado: boolean; pendente: boolean };
export type FuncionarioResumo = { uid: string; nome: string | null; ativo: boolean; mondayId: string | null };
export type Situacao = 'novo' | 'funcionario' | 'vinculado' | 'fora';
export type PessoaMonday = {
  id: string; nome: string; email: string; situacao: Situacao;
  /** Funcionário encontrado (pelo mondayId ou pelo e-mail da conta). */
  uid: string | null; funcionario: string | null;
  /** Por que fica fora (desativado no monday, convidado, sem e-mail, conta de cliente…). */
  motivo: string | null;
};

const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const normalizarEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');

/**
 * Situação de cada usuário do monday. `contas`: UID da conta do Auth por e-mail; `clientes`: UIDs de contas do
 * portal do cliente (nunca viram funcionário).
 */
export function classificarPessoas(
  usuarios: UsuarioMonday[], funcionarios: FuncionarioResumo[], contas: Map<string, string>, clientes: Set<string>,
): PessoaMonday[] {
  const porUid = new Map(funcionarios.map(f => [f.uid, f]));
  const porMonday = new Map(funcionarios.filter(f => f.mondayId).map(f => [f.mondayId!, f]));
  return usuarios.map(u => {
    const email = normalizarEmail(u.email);
    const base = { id: u.id, nome: u.nome, email, uid: null, funcionario: null, motivo: null };
    const ligado = porMonday.get(u.id);
    if (ligado) return { ...base, situacao: 'vinculado', uid: ligado.uid, funcionario: ligado.nome };
    const fora = (motivo: string): PessoaMonday => ({ ...base, situacao: 'fora', motivo });
    if (!u.ativo) return fora('desativado no monday');
    if (u.convidado) return fora('convidado (de fora da Ledur)');
    if (u.pendente) return fora('convite pendente no monday');
    if (!emailValido(email) || email.endsWith(LOGIN_CELULAR)) return fora('sem e-mail que receba o link');
    const uid = contas.get(email) ?? null;
    if (uid && clientes.has(uid)) return fora('conta de cliente do portal');
    const f = uid ? porUid.get(uid) : undefined;
    if (f?.mondayId && f.mondayId !== u.id) return { ...fora('o funcionário já está ligado a outro usuário do monday'), uid: f.uid, funcionario: f.nome };
    if (f) return { ...base, situacao: 'funcionario', uid: f.uid, funcionario: f.nome };
    return { ...base, situacao: 'novo', uid };
  });
}

/** Pedido de "criar": ids do monday (sem repetir, até 100) e as credenciais das contas novas (ao menos uma). */
export function lerPedido(dados: unknown): { ids: string[]; credenciais: Credenciais } | { erro: string } {
  const d = (dados ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(d.ids) ? [...new Set(d.ids.map(String).filter(id => /^\d+$/.test(id)))] : [];
  if (!ids.length) return { erro: 'Escolha ao menos uma pessoa.' };
  if (ids.length > MAX_POR_CHAMADA) return { erro: `No máximo ${MAX_POR_CHAMADA} pessoas por vez.` };
  const credenciais = lerCredenciais(d.credenciais);
  if (!credenciais || !CREDENCIAIS.some(c => credenciais[c])) return { erro: 'Marque ao menos uma credencial.' };
  return { ids, credenciais };
}

async function usuariosDoMonday(token: string): Promise<UsuarioMonday[]> {
  const todos: UsuarioMonday[] = [];
  for (let page = 1; ; page++) {
    const d = await gql(token, 'query ($p: Int) { users(limit: 100, page: $p) { id name email enabled is_guest is_pending } }', { p: page });
    const lote = (d.users ?? []) as Record<string, unknown>[];
    todos.push(...lote.map(u => ({
      id: String(u.id), nome: String(u.name ?? '').trim(), email: String(u.email ?? ''),
      ativo: u.enabled !== false, convidado: u.is_guest === true, pendente: u.is_pending === true,
    })));
    if (lote.length < 100) break;
  }
  return todos;
}

async function situacaoAtual(usuarios: UsuarioMonday[]): Promise<PessoaMonday[]> {
  const funcionarios = (await db.collection('funcionarios').get()).docs.map(d => ({
    uid: d.id, nome: typeof d.get('nome') === 'string' ? d.get('nome') : null, ativo: d.get('ativo') === true,
    mondayId: d.get('mondayId') != null ? String(d.get('mondayId')) : null,
  }));
  const emails = [...new Set(usuarios.map(u => normalizarEmail(u.email)).filter(emailValido))];
  const contas = new Map<string, string>();
  for (let k = 0; k < emails.length; k += 100) {
    const r = await adminAuth.getUsers(emails.slice(k, k + 100).map(email => ({ email })));
    for (const u of r.users) if (u.email) contas.set(u.email.toLowerCase(), u.uid);
  }
  const uids = [...new Set(contas.values())];
  const clientes = new Set<string>();
  for (let k = 0; k < uids.length; k += 100) {
    const snaps = await db.getAll(...uids.slice(k, k + 100).map(uid => db.collection('users').doc(uid)));
    for (const s of snaps) if (s.exists) clientes.add(s.id);
  }
  return classificarPessoas(usuarios, funcionarios, contas, clientes)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

export type ResultadoPessoa = { id: string; nome: string; resultado: 'criado' | 'vinculado' | 'erro'; mensagem?: string };

/** Cria ou liga as pessoas escolhidas, de acordo com a situação recalculada agora (não a da tela). */
export async function criarPessoas(pessoas: PessoaMonday[], credenciais: Credenciais): Promise<ResultadoPessoa[]> {
  const out: ResultadoPessoa[] = [];
  for (const p of pessoas) {
    try {
      if (p.situacao === 'vinculado') { out.push({ id: p.id, nome: p.nome, resultado: 'vinculado', mensagem: 'já estava ligado' }); continue; }
      if (p.situacao === 'fora') { out.push({ id: p.id, nome: p.nome, resultado: 'erro', mensagem: p.motivo ?? 'fora da importação' }); continue; }
      if (p.situacao === 'funcionario') {
        // Já é funcionário: só liga ao monday; credenciais e situação não mudam.
        await db.collection('funcionarios').doc(p.uid!).update({ mondayId: p.id, updatedAt: FieldValue.serverTimestamp() });
        out.push({ id: p.id, nome: p.nome, resultado: 'vinculado' });
        continue;
      }
      let uid = p.uid;
      let criada: string | null = null;
      if (uid) {
        // Conta solta (sem funcionário, ex.: antigo cadastro aberto): quem a criou pode saber a senha. Ela é
        // trocada por uma que ninguém conhece e as sessões abertas caem; a pessoa define a dela pelo e-mail.
        await adminAuth.updateUser(uid, { displayName: p.nome || undefined, password: randomBytes(24).toString('base64url'), disabled: false });
        await adminAuth.revokeRefreshTokens(uid);
      } else {
        const u = await adminAuth.createUser({ email: p.email, displayName: p.nome || undefined });
        uid = criada = u.uid;
      }
      try {
        await db.collection('funcionarios').doc(uid).create({
          nome: p.nome || p.email, email: p.email, ativo: true, perfis: credenciais,
          ...(credenciais.motorista ? { motorista: { ordem: 0 } } : {}),
          mondayId: p.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (e) {
        if (criada) await adminAuth.deleteUser(criada).catch(() => undefined);
        throw e;
      }
      out.push({ id: p.id, nome: p.nome, resultado: 'criado' });
    } catch (e) {
      logger.error('friday-monday-pessoas:criar', { mondayId: p.id, mensagem: String(e) });
      out.push({ id: p.id, nome: p.nome, resultado: 'erro', mensagem: (e as { code?: string })?.code ?? String((e as Error)?.message ?? e) });
    }
  }
  return out;
}

/** Pessoas do monday: { modo: 'listar' } ou { modo: 'criar', ids, credenciais }. Só adm2. */
export const fridayMondayPessoas = onCall({ region: REGIAO, secrets: [mondayApiToken], timeoutSeconds: 300, memory: '512MiB' }, async (request) => {
  await exigirAdm2(request.auth?.uid, 'importar pessoas do monday');
  const token = mondayApiToken.value();
  if (!token?.trim()) throw new HttpsError('failed-precondition', 'MONDAY_API_TOKEN ausente.');
  const modo = String(request.data?.modo ?? 'listar');
  if (modo === 'listar') return { pessoas: await situacaoAtual(await usuariosDoMonday(token)) };
  if (modo !== 'criar') throw new HttpsError('invalid-argument', 'modo inválido.');
  const pedido = lerPedido(request.data);
  if ('erro' in pedido) throw new HttpsError('invalid-argument', pedido.erro);
  const atuais = await situacaoAtual(await usuariosDoMonday(token));
  const escolhidas = pedido.ids.map(id => atuais.find(p => p.id === id)).filter((p): p is PessoaMonday => !!p);
  if (escolhidas.length !== pedido.ids.length) throw new HttpsError('not-found', 'Alguma pessoa escolhida não está mais no monday.');
  const resultados = await criarPessoas(escolhidas, pedido.credenciais);
  logger.info('friday-monday-pessoas', { por: request.auth?.uid, criados: resultados.filter(r => r.resultado === 'criado').length, vinculados: resultados.filter(r => r.resultado === 'vinculado').length, erros: resultados.filter(r => r.resultado === 'erro').length });
  return { resultados };
});
