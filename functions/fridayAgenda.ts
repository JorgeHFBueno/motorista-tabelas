// Friday → Google Agenda de cada pessoa (decisão de 2026-11-16; contrato: The Manuscript, 01_FIRESTORE/COLECOES/friday.md,
// "Google Agenda"). Só neste sentido: o Friday grava, a agenda não volta para o Friday.
// - fridayAgenda (callable): status, conectar (devolve o endereço do Google), sincronizar de novo e desconectar.
// - fridayAgendaRetorno: volta do Google (OAuth com PKCE); cria a agenda "Friday" da pessoa e guarda a autorização
//   permanente cifrada em integrations-internal/google-agenda/contas/{uid} (sem Rules: só as Functions leem).
// - Gatilhos: item, quadro e grupo do Friday mudam → eventos gravados ou removidos; conta conectada → carga inicial.
// Regras puras em fridayAgendaDominio.ts.
import crypto from 'node:crypto';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { db } from './firebaseAdmin.js';
import { veArea } from './credenciais.js';
import {
  candidatosDoItem, cifrar, configAgenda, decifrar, desafioPkce, emailDoIdToken, ESCOPO_AGENDA, ESCOPOS, eventoId,
  grupoMudouParaAgenda, hashState, itemMudouParaAgenda, NOME_AGENDA, ORIGEM_PADRAO, origemPermitida, PENDENTE_MS,
  planejarItem, quadroMudouParaAgenda, type Conta, type Plano,
} from './fridayAgendaDominio.js';

type AnyRecord = Record<string, any>;
const REGIAO = 'southamerica-east1';

// Cliente OAuth do Google Cloud (tipo "Aplicativo da Web") e a chave que cifra as autorizações guardadas.
export const agendaClientId = defineSecret('GOOGLE_AGENDA_CLIENT_ID');
export const agendaClientSecret = defineSecret('GOOGLE_AGENDA_CLIENT_SECRET');
export const agendaChave = defineSecret('GOOGLE_AGENDA_CHAVE');
const SEGREDOS = [agendaClientId, agendaClientSecret, agendaChave];

export const REDIRECT_URI = 'https://southamerica-east1-app-motor-api.cloudfunctions.net/fridayAgendaRetorno';
const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOGAR = 'https://oauth2.googleapis.com/revoke';
const CALENDAR = 'https://www.googleapis.com/calendar/v3';

export type ContaDoc = Conta & { token: string; calendario_id: string; email: string | null; conectado_em: Date; erro: string | null; sincronizar: boolean };
type Pendente = { uid: string; verificador: string; origem: string; expira_em: number };
type Segredos = { clientId: string; clientSecret: string; chave: string };

/** reconectar: autorização revogada ou vencida; agenda_apagada: a pessoa apagou a agenda "Friday" no Google. */
export class ErroGoogle extends Error {
  constructor(readonly motivo: 'reconectar' | 'agenda_apagada' | 'google', readonly status = 0) { super(`google:${motivo}:${status}`); }
}

// ---------------------------------------------------------------- Google
export function criarGoogle(segredos: () => Segredos, f: typeof fetch = fetch, esperar = (ms: number) => new Promise(r => setTimeout(r, ms))) {
  async function token(form: Record<string, string>): Promise<AnyRecord> {
    const r = await f(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
    const corpo = await r.json().catch(() => ({})) as AnyRecord;
    if (!r.ok) throw new ErroGoogle(corpo.error === 'invalid_grant' ? 'reconectar' : 'google', r.status);
    return corpo;
  }
  return {
    trocarCodigo: (code: string, verificador: string) => {
      const s = segredos();
      return token({ code, client_id: s.clientId, client_secret: s.clientSecret, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code', code_verifier: verificador });
    },
    async acesso(refresh: string): Promise<string> {
      const s = segredos();
      const t = await token({ refresh_token: refresh, client_id: s.clientId, client_secret: s.clientSecret, grant_type: 'refresh_token' });
      if (typeof t.access_token !== 'string') throw new ErroGoogle('google');
      return t.access_token;
    },
    /** Chamada à Calendar API; limite de uso (429 ou 403 rateLimit) espera e tenta de novo até 3 vezes. */
    async api(acesso: string, metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; ok: boolean; json: AnyRecord }> {
      for (let tentativa = 0; ; tentativa++) {
        const r = await f(`${CALENDAR}${caminho}`, {
          method: metodo,
          headers: { Authorization: `Bearer ${acesso}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
          body: corpo ? JSON.stringify(corpo) : undefined,
        });
        const json = await r.json().catch(() => ({})) as AnyRecord;
        const limite = r.status === 429 || (r.status === 403 && /rateLimit/i.test(JSON.stringify(json.error?.errors ?? '')));
        if (limite && tentativa < 3) { await esperar(1000 * (tentativa + 1)); continue; }
        return { status: r.status, ok: r.ok, json };
      }
    },
    async revogar(tokenGoogle: string) {
      await f(REVOGAR, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: tokenGoogle }).toString() }).catch(() => undefined);
    },
  };
}
export type Google = ReturnType<typeof criarGoogle>;

// ---------------------------------------------------------------- Firestore
const raiz = () => db.collection('integrations-internal').doc('google-agenda');
const contasCol = () => raiz().collection('contas');

export interface AgendaStore {
  funcionario(uid: string): Promise<AnyRecord | undefined>;
  salvarPendente(hash: string, p: Pendente): Promise<void>;
  consumirPendente(hash: string, agora: number): Promise<Pendente | null>;
  conta(uid: string): Promise<ContaDoc | undefined>;
  gravarConta(uid: string, dados: ContaDoc): Promise<void>;
  atualizarConta(uid: string, dados: Partial<ContaDoc> & AnyRecord): Promise<void>;
  apagarConta(uid: string): Promise<void>;
}

const firestoreStore: AgendaStore = {
  async funcionario(uid) { const s = await db.collection('funcionarios').doc(uid).get(); return s.exists ? s.data() : undefined; },
  async salvarPendente(hash, p) { await raiz().collection('pendentes').doc(hash).create(p); },
  consumirPendente(hash, agora) {
    return db.runTransaction(async t => {
      const ref = raiz().collection('pendentes').doc(hash);
      const s = await t.get(ref);
      if (!s.exists) return null;
      t.delete(ref);
      const p = s.data() as Pendente;
      return p.expira_em > agora && p.uid && p.verificador ? p : null;
    });
  },
  async conta(uid) {
    const s = await contasCol().doc(uid).get();
    if (!s.exists) return undefined;
    const d = s.data() as AnyRecord;
    return { ...d, uid, conectado_em: d.conectado_em?.toDate?.() ?? d.conectado_em } as ContaDoc;
  },
  async gravarConta(uid, dados) { await contasCol().doc(uid).set(dados); },
  async atualizarConta(uid, dados) { await contasCol().doc(uid).update(dados); },
  async apagarConta(uid) { await contasCol().doc(uid).delete(); },
};

const segredosReais = (): Segredos => ({ clientId: agendaClientId.value(), clientSecret: agendaClientSecret.value(), chave: agendaChave.value() });

// ---------------------------------------------------------------- callable e volta do Google
type Deps = { store: AgendaStore; google: Google; segredos: () => Segredos; agora?: () => number };
const URL_PERFIL = (origem: string, resultado: string) => `${origem}/perfil?agenda=${resultado}`;

async function criarOuReusarAgenda(google: Google, acesso: string, anterior?: string): Promise<string> {
  if (anterior) {
    const r = await google.api(acesso, 'GET', `/calendars/${encodeURIComponent(anterior)}`);
    if (r.ok) return anterior;
  }
  const r = await google.api(acesso, 'POST', '/calendars', {
    summary: NOME_AGENDA,
    description: 'Prazos do Friday (Ledur), gravados pelo sistema. Para parar, desconecte em Meu perfil.',
    timeZone: 'America/Sao_Paulo',
  });
  if (!r.ok || typeof r.json.id !== 'string') throw new ErroGoogle('google', r.status);
  return r.json.id;
}

export function criarServicoAgenda(deps: Deps) {
  const agora = deps.agora ?? Date.now;
  return async (uid: string | undefined, dados: unknown) => {
    if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    const acao = (dados as AnyRecord | null)?.acao;
    const conta = await deps.store.conta(uid);

    if (acao === 'status') {
      return conta
        ? { conectado: true, email: conta.email ?? null, erro: conta.erro ?? null, sincronizando: conta.sincronizar === true, conectado_em: new Date(conta.conectado_em).toISOString() }
        : { conectado: false };
    }

    if (acao === 'desconectar') {
      if (!conta) return { conectado: false };
      try {
        const refresh = decifrar(conta.token, deps.segredos().chave);
        const acesso = await deps.google.acesso(refresh);
        await deps.google.api(acesso, 'DELETE', `/calendars/${encodeURIComponent(conta.calendario_id)}`);
        await deps.google.revogar(refresh);
      } catch (e) {
        // Autorização já revogada no Google: a agenda fica com a pessoa, que pode apagá-la lá.
        logger.warn('friday-agenda:desconectar-google', { uid, erro: e instanceof Error ? e.message : String(e) });
      }
      await deps.store.apagarConta(uid);
      logger.info('friday-agenda:desconectada', { uid });
      return { conectado: false };
    }

    if (!veArea(await deps.store.funcionario(uid), 'friday')) throw new HttpsError('permission-denied', 'Acesso não autorizado.');

    if (acao === 'sincronizar') {
      if (!conta || conta.erro) throw new HttpsError('failed-precondition', 'Conecte o Google Agenda de novo.');
      await deps.store.atualizarConta(uid, { sincronizar: true });
      return { ok: true };
    }

    if (acao === 'conectar') {
      const verificador = crypto.randomBytes(32).toString('base64url');
      const state = crypto.randomBytes(32).toString('base64url');
      const origem = origemPermitida((dados as AnyRecord).origem) ?? ORIGEM_PADRAO;
      await deps.store.salvarPendente(hashState(state), { uid, verificador, origem, expira_em: agora() + PENDENTE_MS });
      const url = new URL(AUTORIZAR);
      url.search = new URLSearchParams({
        client_id: deps.segredos().clientId, redirect_uri: REDIRECT_URI, response_type: 'code', scope: ESCOPOS.join(' '),
        state, code_challenge: desafioPkce(verificador), code_challenge_method: 'S256',
        // offline + consent: o Google sempre devolve a autorização permanente (refresh token), também ao reconectar.
        access_type: 'offline', prompt: 'consent',
      }).toString();
      return { url: url.toString() };
    }

    throw new HttpsError('invalid-argument', 'Ação desconhecida.');
  };
}

export function criarRetorno(deps: Deps) {
  const agora = deps.agora ?? Date.now;
  return async (query: AnyRecord): Promise<string> => {
    const state = typeof query.state === 'string' ? query.state : '';
    const pendente = state ? await deps.store.consumirPendente(hashState(state), agora()) : null;
    if (!pendente) return URL_PERFIL(ORIGEM_PADRAO, 'erro');
    const { uid, origem } = pendente;
    if (query.error || typeof query.code !== 'string' || !query.code) return URL_PERFIL(origem, 'cancelada');
    try {
      const t = await deps.google.trocarCodigo(query.code, pendente.verificador);
      const escopos = String(t.scope ?? '').split(/\s+/);
      if (typeof t.refresh_token !== 'string' || typeof t.access_token !== 'string' || !escopos.includes(ESCOPO_AGENDA)) {
        // Na tela do Google dá para desmarcar a permissão da agenda: sem ela não há o que sincronizar.
        if (typeof t.access_token === 'string') await deps.google.revogar(t.access_token);
        return URL_PERFIL(origem, 'sem-permissao');
      }
      if (!veArea(await deps.store.funcionario(uid), 'friday')) { await deps.google.revogar(t.refresh_token); return URL_PERFIL(origem, 'erro'); }
      const anterior = await deps.store.conta(uid);
      const calendario = await criarOuReusarAgenda(deps.google, t.access_token, anterior?.calendario_id);
      await deps.store.gravarConta(uid, {
        uid, origem, token: cifrar(t.refresh_token, deps.segredos().chave), calendario_id: calendario,
        email: emailDoIdToken(t.id_token), conectado_em: new Date(agora()), erro: null, sincronizar: true,
      });
      logger.info('friday-agenda:conectada', { uid, nova_agenda: calendario !== anterior?.calendario_id });
      return URL_PERFIL(origem, 'conectada');
    } catch (e) {
      logger.error('friday-agenda:retorno', { uid, erro: e instanceof Error ? e.message : String(e) });
      return URL_PERFIL(origem, 'erro');
    }
  };
}

const depsReais = (): Deps => ({ store: firestoreStore, google: criarGoogle(segredosReais), segredos: segredosReais });

export const fridayAgenda = onCall({ region: REGIAO, secrets: SEGREDOS }, request => criarServicoAgenda(depsReais())(request.auth?.uid, request.data));

export const fridayAgendaRetorno = onRequest({ region: REGIAO, secrets: SEGREDOS }, async (req, res) => {
  if (req.method !== 'GET') { res.status(405).send('Método não permitido.'); return; }
  res.redirect(302, await criarRetorno(depsReais())(req.query as AnyRecord));
});

// ---------------------------------------------------------------- sincronização
/** Grava e remove eventos de um plano; a conta com autorização perdida ou agenda apagada fica marcada e é pulada. */
export function criarAplicador(google: Google, chave: () => string, marcarErro: (uid: string, motivo: string) => Promise<void>) {
  const acessos = new Map<string, Promise<string>>();
  const falhas = new Set<string>();
  const acessoDe = (c: ContaDoc) => {
    if (!acessos.has(c.uid)) acessos.set(c.uid, google.acesso(decifrar(c.token, chave())));
    return acessos.get(c.uid)!;
  };
  async function executar(c: ContaDoc, acao: (acesso: string, cal: string) => Promise<void>) {
    if (falhas.has(c.uid)) return;
    try {
      await acao(await acessoDe(c), encodeURIComponent(c.calendario_id));
    } catch (e) {
      if (e instanceof ErroGoogle && e.motivo !== 'google') {
        falhas.add(c.uid);
        await marcarErro(c.uid, e.motivo).catch(() => undefined);
        logger.warn('friday-agenda:conta-com-erro', { uid: c.uid, motivo: e.motivo });
      } else logger.error('friday-agenda:google', { uid: c.uid, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  const falhou = (r: { status: number }) => { throw new ErroGoogle(r.status === 401 ? 'reconectar' : r.status === 404 ? 'agenda_apagada' : 'google', r.status); };
  return async (plano: Plano, itemId: unknown, contas: Map<string, ContaDoc>) => {
    const id = eventoId(itemId);
    for (const { uid, evento } of plano.gravar) {
      await executar(contas.get(uid)!, async (acesso, cal) => {
        // PUT atualiza (e restaura um evento removido antes); 404 = ainda não existe, então cria com o id fixo.
        let r = await google.api(acesso, 'PUT', `/calendars/${cal}/events/${id}`, evento);
        if (r.status === 404) r = await google.api(acesso, 'POST', `/calendars/${cal}/events`, { id, ...evento });
        if (!r.ok) falhou(r);
      });
    }
    for (const uid of plano.remover) {
      await executar(contas.get(uid)!, async (acesso, cal) => {
        const r = await google.api(acesso, 'DELETE', `/calendars/${cal}/events/${id}`);
        if (!r.ok && r.status !== 404 && r.status !== 410) falhou(r);
      });
    }
  };
}

async function emParalelo<T>(lista: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => { while (i < lista.length) await fn(lista[i++]); }));
}

async function lerVarios(colecao: string, ids: string[]): Promise<Map<string, AnyRecord | undefined>> {
  const mapa = new Map<string, AnyRecord | undefined>();
  for (let k = 0; k < ids.length; k += 100) {
    for (const s of await db.getAll(...ids.slice(k, k + 100).map(id => db.doc(`${colecao}/${id}`)))) mapa.set(s.id, s.data());
  }
  return mapa;
}

/** Contas conectadas e sem erro entre os candidatos. */
async function contasConectadas(uids: string[]): Promise<Map<string, ContaDoc>> {
  const docs = await lerVarios(contasCol().path, uids);
  const contas = new Map<string, ContaDoc>();
  for (const [uid, d] of docs) if (d && !d.erro && d.token && d.calendario_id) contas.set(uid, { ...(d as ContaDoc), uid });
  return contas;
}

type Entrada = { id: string; item: AnyRecord | null; candidatos: Set<string> };

/** Planeja e aplica os itens de um quadro; `so` limita a uma pessoa (carga inicial da conta). */
async function sincronizar(quadro: AnyRecord | null, entradas: Entrada[], so?: string) {
  const todos = new Set(entradas.flatMap(e => [...e.candidatos]));
  const contas = await contasConectadas(so ? (todos.has(so) ? [so] : []) : [...todos]);
  if (!contas.size || !entradas.length) return { itens: entradas.length, contas: contas.size };
  const quadroId = quadro ? Number(quadro.id) : null;
  const colunas = quadroId != null ? (await db.collection('friday-colunas').where('quadro_id', '==', quadroId).get()).docs.map(d => d.data()) : [];
  const grupos = new Map(quadroId != null ? (await db.collection('friday-grupos').where('quadro_id', '==', quadroId).get()).docs.map(d => [Number(d.data().id ?? d.id), d.data()]) : []);
  const funcionarios = await lerVarios('funcionarios', [...contas.keys()]);
  const aplicar = criarAplicador(criarGoogle(segredosReais), () => agendaChave.value(), async (uid, motivo) => { await contasCol().doc(uid).update({ erro: motivo }); });
  await emParalelo(entradas, 4, async e => {
    const plano = planejarItem({ item: e.item, candidatos: e.candidatos, quadro, grupo: e.item ? grupos.get(Number(e.item.grupo_id)) : null, colunas, contas, funcionarios });
    await aplicar(plano, e.id, contas);
  });
  return { itens: entradas.length, contas: contas.size };
}

const lerQuadro = async (id: unknown) => (id == null ? null : (await db.collection('friday-quadros').doc(String(id)).get()).data() ?? null);
const itensDoQuadro = async (quadroId: number) =>
  (await db.collection('friday-itens').where('quadro_id', '==', quadroId).get()).docs.map(d => ({ id: d.id, item: d.data(), candidatos: candidatosDoItem(d.data()) }));

const OPCOES = { region: REGIAO, secrets: SEGREDOS, timeoutSeconds: 300 };

/** Item mudou (valor, nome, estado, grupo, quadro): evento gravado ou removido. Lê o item de novo para valer o mais recente. */
export const fridayAgendaItem = onDocumentWritten({ ...OPCOES, document: 'friday-itens/{itemId}' }, async event => {
  const antes = event.data?.before?.data() ?? null;
  const depois = event.data?.after?.data() ?? null;
  const quadro = await lerQuadro((depois ?? antes)?.quadro_id);
  const mudouDeQuadro = antes && depois && Number(antes.quadro_id) !== Number(depois.quadro_id);
  const cfg = configAgenda(quadro) ?? (mudouDeQuadro ? configAgenda(await lerQuadro(antes.quadro_id)) : null);
  if (!cfg || (!mudouDeQuadro && !itemMudouParaAgenda(antes, depois, cfg))) return;
  const ref = db.collection('friday-itens').doc(event.params.itemId);
  const atual = (await ref.get()).data() ?? null;
  const r = await sincronizar(atual ? await lerQuadro(atual.quadro_id) : quadro, [{ id: ref.id, item: atual, candidatos: candidatosDoItem(antes, depois, atual) }]);
  if (r.contas) logger.info('friday-agenda:item', { itemId: ref.id, ...r });
});

/** Configuração da agenda, nome, permissões ou estado do quadro mudaram: todos os itens dele. */
export const fridayAgendaQuadro = onDocumentWritten({ ...OPCOES, document: 'friday-quadros/{quadroId}' }, async event => {
  const antes = event.data?.before?.data() ?? null;
  const depois = event.data?.after?.data() ?? null;
  if (!configAgenda(antes) && !configAgenda(depois)) return;
  if (!quadroMudouParaAgenda(antes, depois)) return;
  const quadro = await lerQuadro(event.params.quadroId);
  const r = await sincronizar(quadro, await itensDoQuadro(Number(event.params.quadroId)));
  logger.info('friday-agenda:quadro', { quadroId: event.params.quadroId, ...r });
});

/** Grupo arquivado, na lixeira ou restaurado: os itens dele. */
export const fridayAgendaGrupo = onDocumentWritten({ ...OPCOES, document: 'friday-grupos/{grupoId}' }, async event => {
  const antes = event.data?.before?.data() ?? null;
  const depois = event.data?.after?.data() ?? null;
  if (!grupoMudouParaAgenda(antes, depois)) return;
  const grupo = (depois ?? antes)!;
  const quadro = await lerQuadro(grupo.quadro_id);
  if (!configAgenda(quadro)) return;
  const grupoId = Number(grupo.id ?? event.params.grupoId);
  const entradas = (await itensDoQuadro(Number(grupo.quadro_id))).filter(e => Number(e.item.grupo_id) === grupoId);
  const r = await sincronizar(quadro, entradas);
  logger.info('friday-agenda:grupo', { grupoId, ...r });
});

/** Conta conectada (ou "Sincronizar de novo"): grava os itens em que a pessoa está, quadro por quadro. */
export const fridayAgendaConta = onDocumentWritten({ ...OPCOES, document: 'integrations-internal/google-agenda/contas/{uid}' }, async event => {
  const depois = event.data?.after?.data();
  if (depois?.sincronizar !== true || depois.erro) return;
  const uid = event.params.uid;
  const itens = (await db.collection('friday-itens').where('pessoas', 'array-contains', uid).get()).docs;
  const porQuadro = new Map<number, Entrada[]>();
  for (const d of itens) {
    const q = Number(d.data().quadro_id);
    if (!porQuadro.has(q)) porQuadro.set(q, []);
    porQuadro.get(q)!.push({ id: d.id, item: d.data(), candidatos: new Set([uid]) });
  }
  let quadros = 0;
  for (const [quadroId, entradas] of porQuadro) {
    const quadro = await lerQuadro(quadroId);
    if (!configAgenda(quadro)) continue;
    quadros++;
    await sincronizar(quadro, entradas, uid);
  }
  await contasCol().doc(uid).update({ sincronizar: false, sincronizado_em: new Date() }).catch(() => undefined);
  logger.info('friday-agenda:carga', { uid, itens: itens.length, quadros });
});
