// Regras da API do CronoObra (cronoObraApi.ts), sem Firestore, para serem testadas: a chave e a consulta do Cronograma de
// Obras, montada como a tela /engenharia/cronograma monta (src/features/cronograma-obras: obrasV2CronogramaAdapter,
// mestresFirestoreAdapter, alocacaoReconciliation e hydrateFirestoreAlocacoes da CronogramaObrasPage).
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/cronoobra-chaves-api.md e 02_APIS_FUNCTIONS/10_APIS_POR_AREA.md.
import { createHash } from 'node:crypto';
import { veArea } from './credenciais.js';

type AnyRecord = Record<string, any>;
export type Doc = { id: string; data: AnyRecord | undefined };

/** Chave: "encr_" + 40 letras e números (gerada em Cadastros → APIs, seção CronoObra, só adm2). */
export const formatoChaveCronoObra = (chave: unknown): chave is string => typeof chave === 'string' && /^encr_[A-Za-z0-9]{40}$/.test(chave);
/** O banco guarda só o SHA-256 da chave (id do documento em cronoobra-chaves-api), nunca a chave. */
export const hashChaveCronoObra = (chave: string) => createHash('sha256').update(chave).digest('hex');

/** Quem a chave representa: chave não revogada de um funcionário ativo que vê a área Engenharia (ou adm2). */
export function pessoaDaChaveCronoObra(registro: AnyRecord | undefined, funcionario: AnyRecord | undefined): { uid: string; nome: string; adm2: boolean } | null {
  if (!registro || registro.revogada_em || typeof registro.uid !== 'string' || !registro.uid) return null;
  if (!veArea(funcionario, 'engenharia')) return null;
  return { uid: registro.uid, nome: String(funcionario.nome ?? registro.nome ?? ''), adm2: (funcionario.perfis as AnyRecord | undefined)?.adm2 === true };
}

/** Pedido que não pode ser atendido como veio (vira 400 com a mensagem). */
export class EntradaInvalida extends Error {}

// ---------------------------------------------------------------- datas civis (cópia de domain/temporal.ts)
const parse = (value: string) => new Date(`${value}T00:00:00.000Z`);
const format = (date: Date) => date.toISOString().slice(0, 10);
export function isValidCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parse(value);
  return Number.isFinite(date.getTime()) && format(date) === value;
}
export function addDays(inicio: string, days: number): string { const date = parse(inicio); date.setUTCDate(date.getUTCDate() + days); return format(date); }
/** Dias corridos inclusivos: duração 1 ocupa só a data inicial. */
export const calculatedEnd = (inicio: string, tempoPlanejado: number) => addDays(inicio, Math.max(tempoPlanejado, 1) - 1);
const eachDay = (inicio: string, dias: number) => Array.from({ length: Math.max(0, dias) }, (_, i) => addDays(inicio, i));

// ---------------------------------------------------------------- dias NT (cópia de domain/naoTrabalhados.ts)
// Não edite só aqui: o original é src/features/cronograma-obras/domain/naoTrabalhados.ts.
export type NaoTrabalhado = { inicio: string; dias: number };

/** Lê o campo do Firestore; entradas fora do formato são ignoradas. */
export function lerNaoTrabalhados(value: unknown): NaoTrabalhado[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const lista = value.filter((item): item is NaoTrabalhado =>
    Boolean(item) && typeof item.inicio === 'string' && isValidCivilDate(item.inicio) && Number.isInteger(item.dias) && item.dias > 0);
  return lista.length ? lista.map(({ inicio, dias }) => ({ inicio, dias })) : undefined;
}

/** Dias NT que caem dentro do período (o NT fica preso às datas: o que sai do período some). */
export function diasNT(periodo: { inicio: string; tempoPlanejado: number; naoTrabalhados?: readonly NaoTrabalhado[] }): Set<string> {
  const fim = calculatedEnd(periodo.inicio, periodo.tempoPlanejado);
  return new Set((periodo.naoTrabalhados ?? []).flatMap((item) => eachDay(item.inicio, item.dias)).filter((dia) => dia >= periodo.inicio && dia <= fim));
}

// ---------------------------------------------------------------- filtros
export type FiltrosCronograma = { de: string | null; ate: string | null; contrato: string | null; mestre: string | null; status: string[] };

export const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** "AAAA-MM-DD" ou "DD/MM/AAAA" → "AAAA-MM-DD"; vazio → null; outra coisa → erro. */
export function lerData(valor: unknown, nome: string): string | null {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : texto;
  if (!isValidCivilDate(iso)) throw new EntradaInvalida(`"${nome}" deve ser uma data AAAA-MM-DD ou DD/MM/AAAA.`);
  return iso;
}

const primeiro = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const texto = (v: unknown) => { const t = String(primeiro(v) ?? '').trim(); return t || null; };
const lista = (v: unknown) => (Array.isArray(v) ? v : v == null ? [] : [v]).flatMap((x) => String(x).split(',')).map((x) => x.trim()).filter(Boolean);

/** Filtros da consulta (query string da rota ou argumentos da ferramenta do MCP). */
export function lerFiltrosCronograma(entrada: AnyRecord | undefined): FiltrosCronograma {
  const e = entrada ?? {};
  const filtros = {
    de: lerData(primeiro(e.de), 'de'), ate: lerData(primeiro(e.ate), 'ate'),
    contrato: texto(e.contrato), mestre: texto(e.mestre), status: lista(e.status),
  };
  if (filtros.de && filtros.ate && filtros.de > filtros.ate) throw new EntradaInvalida('"de" é depois de "ate".');
  return filtros;
}

// ---------------------------------------------------------------- cronograma
type Lote = { loteId: string; nome: string; status: string | null; prioridade: number | null };
type Contrato = {
  contratoId: string; obra: string; sigla: string | null; numeroContrato: string | null; empresa: string; tipoObra: string | null;
  status: string; inicio: string | null; fim: string | null; lotes: Lote[];
};
const opcional = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const dataValida = (v: unknown) => (typeof v === 'string' && isValidCivilDate(v) ? v : null);
const ordemDo = (l: AnyRecord) => (typeof l.ordem === 'number' && Number.isFinite(l.ordem) ? l.ordem : Number.MAX_SAFE_INTEGER);

/** Contrato de obras-v2 como a tela o lê: só com `friday.ok`; LOTEs sem `situacao`, na ordem de `ordem`. */
export function contratoDe(doc: Doc): Contrato | null {
  const d = doc.data;
  if (!d || d.friday?.ok !== true) return null;
  const mapa = d.lotes && typeof d.lotes === 'object' && !Array.isArray(d.lotes) ? (d.lotes as Record<string, AnyRecord>) : {};
  const lotes = Object.entries(mapa).filter(([, l]) => l && typeof l === 'object' && l.situacao == null)
    .sort(([a, x], [b, y]) => ordemDo(x) - ordemDo(y) || a.localeCompare(b))
    .map(([loteId, l]) => ({
      loteId, nome: opcional(l.nome) ?? 'Analisar Contrato', status: opcional(l.status),
      prioridade: typeof l.prioridade === 'number' && Number.isFinite(l.prioridade) ? l.prioridade : null,
    }));
  return {
    contratoId: doc.id, obra: typeof d.nomeObra === 'string' ? d.nomeObra : doc.id, sigla: opcional(d.siglaObra),
    numeroContrato: opcional(d.numeroContrato), empresa: typeof d.empresa === 'string' ? d.empresa : 'Não informado',
    tipoObra: opcional(d.tipoObra), status: typeof d.situacao === 'string' ? d.situacao : 'Sem status',
    inicio: dataValida(d.dataInicial), fim: dataValida(d.dataFinal), lotes,
  };
}

/** Mestres de monday-mestres como a tela os lê: nome e cor hexadecimal válidos; cor repetida fica fora. */
export function mestresDe(docs: Doc[]): { id: string; nome: string; cor: string }[] {
  const usadas = new Set<string>();
  const mestres: { id: string; nome: string; cor: string }[] = [];
  for (const { id, data } of docs) {
    if (!data || typeof data.nome !== 'string' || !data.nome.trim() || typeof data.cor !== 'string' || !/^[0-9a-f]{6}$/i.test(data.cor)) continue;
    const cor = data.cor.toLowerCase();
    if (usadas.has(cor)) continue;
    usadas.add(cor);
    mestres.push({ id, nome: data.nome, cor: `#${cor}` });
  }
  return mestres;
}

/** Apoio ("ajuda por fora"): o período de origem do mestre. Cópia de `lerApoio` (src/features/cronograma-obras/domain/apoio.ts). */
type Apoio = { alocacaoId: string; contratoId: string; obraId?: string };
export function lerApoio(value: unknown): Apoio | undefined {
  const v = value as Partial<Apoio> | null | undefined;
  if (!v || typeof v !== 'object' || typeof v.alocacaoId !== 'string' || !v.alocacaoId || typeof v.contratoId !== 'string' || !v.contratoId) return undefined;
  if (v.obraId !== undefined && (typeof v.obraId !== 'string' || !v.obraId)) return undefined;
  return { alocacaoId: v.alocacaoId, contratoId: v.contratoId, ...(v.obraId ? { obraId: v.obraId } : {}) };
}

type Alocacao = { id: string; obraId?: string; contratoId: string; mestreId: string; inicio: string; tempoPlanejado: number; naoTrabalhados?: NaoTrabalhado[]; apoio?: Apoio };

/** Alocação de monday-cronograma com os campos que a tela exige; fora do formato, null. */
export function alocacaoDe({ id, data }: Doc): Alocacao | null {
  const v = data;
  if (!v || (v.obraId !== undefined && typeof v.obraId !== 'string') || typeof v.contratoId !== 'string' || typeof v.mestreId !== 'string'
    || typeof v.inicio !== 'string' || !isValidCivilDate(v.inicio) || !Number.isInteger(v.tempoPlanejado) || v.tempoPlanejado < 1
    || typeof v.criadoPorFuncionarioId !== 'string' || !v.criadoPorFuncionarioId) return null;
  const naoTrabalhados = lerNaoTrabalhados(v.naoTrabalhados);
  const apoio = lerApoio(v.apoio);
  return { id, ...(typeof v.obraId === 'string' ? { obraId: v.obraId } : {}), contratoId: v.contratoId, mestreId: v.mestreId, inicio: v.inicio, tempoPlanejado: v.tempoPlanejado, ...(naoTrabalhados ? { naoTrabalhados } : {}), ...(apoio ? { apoio } : {}) };
}

const casaContrato = (c: Contrato, filtro: string | null) => {
  if (!filtro) return true;
  const f = semAcento(filtro);
  return c.contratoId === filtro || semAcento(c.numeroContrato) === f || semAcento(c.obra).includes(f) || (c.sigla != null && semAcento(c.sigla) === f);
};

/**
 * Cronograma de Obras como a tela mostra: uma linha por período de mestre, só das alocações que a tela reconhece
 * (contrato ligado ao Friday, LOTE visível ou alocação do contrato, mestre válido). Filtros: período que toca [de, ate],
 * contrato (ID, número, sigla ou parte do nome), mestre (nome sem acento ou ID) e status do LOTE (qualquer um da lista).
 */
export function montarCronograma(fontes: { obras: Doc[]; mestres: Doc[]; alocacoes: Doc[] }, filtros: FiltrosCronograma) {
  const contratos = fontes.obras.map(contratoDe).filter((c): c is Contrato => !!c).sort((a, b) => a.obra.localeCompare(b.obra, 'pt-BR'));
  const porContrato = new Map(contratos.map((c) => [c.contratoId, c]));
  const lotePorId = new Map(contratos.flatMap((c) => c.lotes.map((l) => [l.loteId, { contrato: c, lote: l }] as const)));
  const mestres = mestresDe(fontes.mestres);
  const mestrePorId = new Map(mestres.map((m) => [m.id, m]));
  const filtroMestre = filtros.mestre ? semAcento(filtros.mestre) : null;
  const statusPedidos = new Set(filtros.status.map(semAcento));

  const alocacoes = fontes.alocacoes.map(alocacaoDe).flatMap((a) => {
    if (!a || !porContrato.has(a.contratoId)) return [];
    const mestre = mestrePorId.get(a.mestreId);
    if (!mestre) return [];
    // Com obraId, a tela a mostra no LOTE de mesmo id; sem obraId, na linha do contrato.
    const alvo = a.obraId ? lotePorId.get(a.obraId) : { contrato: porContrato.get(a.contratoId)!, lote: null };
    if (!alvo) return [];
    const { contrato, lote } = alvo;
    const fim = calculatedEnd(a.inicio, a.tempoPlanejado);
    const nt = a.apoio ? 0 : diasNT(a).size;
    // Apoio ("ajuda por fora"): only visual on the screen; its days belong to the origin obra, so none are worked here.
    const origem = a.apoio ? porContrato.get(a.apoio.contratoId) : undefined;
    const loteOrigem = a.apoio?.obraId ? lotePorId.get(a.apoio.obraId)?.lote : undefined;
    const apoio = a.apoio ? { alocacaoId: a.apoio.alocacaoId, contratoId: a.apoio.contratoId, obra: origem?.obra ?? null, loteId: a.apoio.obraId ?? null, lote: loteOrigem?.nome ?? null } : null;
    return [{
      alocacaoId: a.id, contratoId: contrato.contratoId, obra: contrato.obra, sigla: contrato.sigla, numeroContrato: contrato.numeroContrato,
      empresa: contrato.empresa, tipoObra: contrato.tipoObra, loteId: lote?.loteId ?? null, lote: lote?.nome ?? null,
      statusLote: lote ? lote.status : contrato.status, mestreId: mestre.id, mestre: mestre.nome, inicio: a.inicio, fim,
      dias: a.tempoPlanejado, diasNT: nt, diasTrabalhados: apoio ? 0 : a.tempoPlanejado - nt, naoTrabalhados: apoio ? [] : a.naoTrabalhados ?? [], apoio,
    }];
  }).filter((l) => (!filtros.de || l.fim >= filtros.de) && (!filtros.ate || l.inicio <= filtros.ate)
    && casaContrato(porContrato.get(l.contratoId)!, filtros.contrato)
    && (!filtroMestre || l.mestreId === filtros.mestre || semAcento(l.mestre) === filtroMestre)
    && (!statusPedidos.size || statusPedidos.has(semAcento(l.statusLote))))
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.obra.localeCompare(b.obra, 'pt-BR') || a.mestre.localeCompare(b.mestre, 'pt-BR'));

  return { alocacoes, obras: contratos.filter((c) => casaContrato(c, filtros.contrato)), mestres };
}
