// Friday → Google Agenda (decisão de 2026-11-16; contrato: The Manuscript, 01_FIRESTORE/COLECOES/friday.md, "Google Agenda").
// Regras puras: o evento de cada item, quem recebe e quem perde o evento, a origem aceita na volta do Google e a cifra
// da autorização guardada. As chamadas ao Google e ao Firestore ficam em fridayAgenda.ts.
import crypto from 'node:crypto';
import { credenciaisDe, veArea } from './credenciais.js';

type AnyRecord = Record<string, any>;

// calendar.app.created: o sistema cria a agenda "Friday" da pessoa e só mexe nela (não lê nem altera as outras).
// openid e email: mostrar em Meu perfil com qual conta Google a pessoa conectou.
export const ESCOPO_AGENDA = 'https://www.googleapis.com/auth/calendar.app.created';
export const ESCOPOS = ['openid', 'email', ESCOPO_AGENDA] as const;
// Endereço oficial da WEB desde 2026-11-22: a volta sem origem conhecida e os links dos eventos vão para ele.
export const ORIGEM_PADRAO = 'https://interno.ledurprefabricados.com.br';
export const PENDENTE_MS = 10 * 60 * 1000;
export const NOME_AGENDA = 'Friday';

/** Endereço da WEB para onde a pessoa volta depois do Google: o endereço oficial, o site, os canais de prévia e o servidor local. */
export function origemPermitida(origem: unknown): string | null {
  if (typeof origem !== 'string') return null;
  const ok = origem === ORIGEM_PADRAO
    || /^https:\/\/app-motor-api(--[a-z0-9-]+)?\.(web\.app|firebaseapp\.com)$/.test(origem)
    || /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(origem);
  return ok ? origem : null;
}

export type ConfigAgenda = { coluna_pessoa: number; coluna_data: number };

/** Configuração do quadro (friday-quadros.config.agenda): a coluna de pessoa e a de Data ou Período. */
export function configAgenda(quadro: AnyRecord | null | undefined): ConfigAgenda | null {
  const a = quadro?.config?.agenda;
  const pessoa = Number(a?.coluna_pessoa);
  const data = Number(a?.coluna_data);
  return Number.isInteger(pessoa) && pessoa > 0 && Number.isInteger(data) && data > 0 ? { coluna_pessoa: pessoa, coluna_data: data } : null;
}

/**
 * Id do evento no Google: fixo por item, então o mesmo item sempre atualiza o mesmo evento (sem guardar um mapa).
 * O Google aceita só 0-9 e a-v (base32hex), de 5 a 1024 caracteres.
 */
export function eventoId(itemId: unknown): string {
  const id = String(itemId);
  return `ledurfd${/^\d+$/.test(id) ? id : Buffer.from(id, 'utf8').toString('hex')}`;
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})/;
function dia(valor: unknown): string | null {
  const m = typeof valor === 'string' ? DIA.exec(valor) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function diaSeguinte(d: string): string {
  const [a, m, n] = d.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, n + 1)).toISOString().slice(0, 10);
}

/** Dias do valor da célula: Data ('AAAA-MM-DD') ou Período ({inicio, fim}); só uma ponta do período vale como um dia. */
export function intervalo(valor: unknown, tipo: string): { inicio: string; fim: string } | null {
  if (tipo === 'data') { const d = dia(valor); return d ? { inicio: d, fim: d } : null; }
  if (tipo !== 'periodo' || !valor || typeof valor !== 'object') return null;
  const inicio = dia((valor as AnyRecord).inicio);
  const fim = dia((valor as AnyRecord).fim);
  if (!inicio && !fim) return null;
  const a = inicio ?? fim as string;
  const b = fim ?? inicio as string;
  return a <= b ? { inicio: a, fim: b } : { inicio: b, fim: a };
}

/** Evento de dia inteiro (vários dias para Período), que não marca a pessoa como ocupada, com link para o item. */
export function eventoDoItem(item: AnyRecord, quadro: AnyRecord, dias: { inicio: string; fim: string }, origem: string) {
  const link = `${origem}/friday/quadros/${quadro.id}?item=${item.id}`;
  const nome = typeof item.nome === 'string' && item.nome.trim() ? item.nome.trim() : '(sem nome)';
  return {
    summary: nome,
    description: `Quadro: ${quadro.nome ?? ''}\n${link}`,
    start: { date: dias.inicio },
    end: { date: diaSeguinte(dias.fim) },
    transparency: 'transparent',
    status: 'confirmed',
    source: { title: 'Friday', url: link },
    extendedProperties: { private: { friday_item: String(item.id), friday_quadro: String(quadro.id) } },
  };
}

const uidsDe = (valor: unknown): string[] => (Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string' && v.length > 0) : []);

/**
 * Quem pode ter um evento do item: o índice "pessoas" e tudo o que parece lista de UIDs nos valores (uma coluna de
 * pessoa que deixou de ser a da agenda continua aqui, para o evento sair). Só as contas conectadas importam.
 */
export function candidatosDoItem(...itens: (AnyRecord | null | undefined)[]): Set<string> {
  const uids = new Set<string>();
  for (const item of itens) {
    if (!item) continue;
    for (const u of uidsDe(item.pessoas)) uids.add(u);
    for (const v of Object.values((item.valores ?? {}) as AnyRecord)) for (const u of uidsDe(v)) uids.add(u);
  }
  return uids;
}

const apagado = (r: AnyRecord | null | undefined) => Boolean(r?.arquivado_em || r?.excluido_em);

/** Mesma liberação das Rules: área friday e quadro aberto, ou restrito com a pessoa em "acesso" (adm2 vê todos). */
export function podeVerQuadro(funcionario: AnyRecord | null | undefined, quadro: AnyRecord, uid: string): boolean {
  if (!veArea(funcionario, 'friday')) return false;
  if (credenciaisDe(funcionario?.perfis).adm2) return true;
  return Number(quadro.restrito) !== 1 || (Array.isArray(quadro.acesso) && quadro.acesso.includes(uid));
}

export type Conta = { uid: string; origem: string };
export type Plano = { gravar: { uid: string; evento: ReturnType<typeof eventoDoItem> }[]; remover: string[] };

/**
 * O que fazer com um item: gravar o evento para quem está na coluna de pessoa da agenda (conta conectada e acesso ao
 * quadro) e remover de todos os outros candidatos conectados. Item apagado, arquivado, na lixeira, de grupo ou
 * quadro arquivado/na lixeira, subitem, sem data ou quadro sem configuração: o evento sai de todos.
 */
export function planejarItem(args: {
  item: AnyRecord | null; candidatos: Set<string>; quadro: AnyRecord | null; grupo: AnyRecord | null | undefined;
  colunas: AnyRecord[]; contas: Map<string, Conta>; funcionarios: Map<string, AnyRecord | undefined>;
}): Plano {
  const { item, quadro, grupo, colunas, contas, funcionarios } = args;
  const conectados = [...args.candidatos].filter(u => contas.has(u));
  const plano: Plano = { gravar: [], remover: [] };
  const cfg = configAgenda(quadro);
  const colData = cfg && colunas.find(c => Number(c.id) === cfg.coluna_data && (c.tipo === 'data' || c.tipo === 'periodo'));
  const colPessoa = cfg && colunas.find(c => Number(c.id) === cfg.coluna_pessoa && c.tipo === 'pessoa');
  const ativo = item && quadro && cfg && colData && colPessoa && !apagado(item) && !apagado(quadro) && !apagado(grupo)
    && item.item_pai_id == null && Number(item.quadro_id) === Number(quadro.id);
  const dias = ativo ? intervalo(item.valores?.[String(cfg.coluna_data)], colData.tipo) : null;
  const alvo = new Set(dias ? uidsDe(item!.valores?.[String(cfg!.coluna_pessoa)]) : []);
  for (const uid of conectados) {
    const conta = contas.get(uid)!;
    if (dias && alvo.has(uid) && podeVerQuadro(funcionarios.get(uid), quadro!, uid)) plano.gravar.push({ uid, evento: eventoDoItem(item!, quadro!, dias, conta.origem) });
    else plano.remover.push(uid);
  }
  return plano;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Mudança do item que altera a agenda (nome, estado, grupo, quadro, ou as duas colunas configuradas). */
export function itemMudouParaAgenda(antes: AnyRecord | null | undefined, depois: AnyRecord | null | undefined, cfg: ConfigAgenda): boolean {
  if (!antes || !depois) return true;
  if (['nome', 'quadro_id', 'grupo_id', 'item_pai_id', 'arquivado_em', 'excluido_em'].some(k => !igual(antes[k], depois[k]))) return true;
  return [cfg.coluna_pessoa, cfg.coluna_data].some(c => !igual(antes.valores?.[String(c)], depois.valores?.[String(c)]));
}

/** Mudança do quadro que altera a agenda dos itens dele. */
export function quadroMudouParaAgenda(antes: AnyRecord | null | undefined, depois: AnyRecord | null | undefined): boolean {
  if (!antes || !depois) return true;
  return !igual(antes.config?.agenda, depois.config?.agenda)
    || ['nome', 'arquivado_em', 'excluido_em', 'restrito', 'acesso'].some(k => !igual(antes[k], depois[k]));
}

export const grupoMudouParaAgenda = (antes: AnyRecord | null | undefined, depois: AnyRecord | null | undefined) =>
  !antes || !depois || apagado(antes) !== apagado(depois);

// ---------------------------------------------------------------- cifra da autorização (AES-256-GCM)
// A autorização permanente do Google (refresh token) fica cifrada no Firestore; a chave é um segredo das Functions.
const chaveDe = (segredo: string) => crypto.createHash('sha256').update(segredo, 'utf8').digest();

export function cifrar(texto: string, segredo: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chaveDe(segredo), iv);
  const corpo = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64');
}

export function decifrar(cifrado: string, segredo: string): string {
  const dados = Buffer.from(cifrado, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', chaveDe(segredo), dados.subarray(0, 12));
  d.setAuthTag(dados.subarray(12, 28));
  return Buffer.concat([d.update(dados.subarray(28)), d.final()]).toString('utf8');
}

export const hashState = (state: string) => crypto.createHash('sha256').update(state).digest('hex');
export const desafioPkce = (verificador: string) => crypto.createHash('sha256').update(verificador).digest('base64url');

/** E-mail do id_token recebido direto do Google (na troca do código, por TLS): só lido, sem nova verificação. */
export function emailDoIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  try {
    const dados = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof dados.email === 'string' ? dados.email : null;
  } catch { return null; }
}
