// Situação calculada por uma fórmula do quadro do Friday num cadastro existente (hoje: obras-v2).
// O quadro GESTÃO DE OBRAS tem a coluna fórmula "Status"; o resultado vai para `obras-v2.situacao` e define o `status`
// (FINALIZADA quando "Obra Finalizada" ou quando o item está arquivado ou na lixeira, senão CONTRATADA), que o app e o
// CronoObra usam para esconder as obras.
// A fórmula continua sendo editada no Friday: aqui ela é lida da coluna (friday-cadastros/{chave}.formula_situacao.coluna_id)
// e calculada com a mesma rotina da tela (fridayFormula.ts). Roda quando um item do quadro muda e uma vez por dia,
// porque a fórmula usa a data de hoje ("Solicitar Aditivo de Prazo" 7 dias antes do Fim).
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/obras-v2.md.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { FieldPath } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { situacaoDoItem, valorDoOficial, type CampoOficial } from './fridayCadastroConverter.js';
import { cadastroExistente, camposDaFormula, lerCaminho, type CadastroExistente } from './fridayCadastrosExistentes.js';
import { calcular, type Coluna } from './fridayFormula.js';

type AnyRecord = Record<string, any>;
const REGIAO = 'southamerica-east1';

/** "Hoje" no fuso de Brasília (UTC−3, sem horário de verão), como a tela do Friday calcula no navegador. */
export const hojeEmBrasilia = (agora = Date.now()) => { const d = new Date(agora - 3 * 3600e3); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()); };

/**
 * Calcula a fórmula para um item vinculado: os valores dos campos oficiais (que vivem no documento) são encaixados nas
 * colunas, como a tela faz, antes do cálculo. Devolve só os campos que mudaram. null quando o cadastro não tem fórmula.
 */
export function calcularSituacao(cadastro: CadastroExistente | undefined, registro: AnyRecord, colunas: AnyRecord[], item: AnyRecord,
  doc: AnyRecord, hoje: Date): { gravar: [string, unknown][]; resultado: string; erro?: string } | null {
  if (!cadastro?.situacao_por_formula) return null;
  const colunaId = Number(registro.formula_situacao?.coluna_id);
  const formula = colunas.find(c => Number(c.id) === colunaId && c.tipo === 'formula');
  if (!formula) return null;
  const valores = { ...(item.valores ?? {}) };
  for (const c of (registro.campos ?? []) as (CampoOficial & { secundario?: boolean })[]) {
    if (c.situacao !== 'ativo' || c.secundario) continue;
    const v = valorDoOficial(c, lerCaminho(doc, c.chave));
    if (v === undefined) delete valores[String(c.coluna_id)]; else valores[String(c.coluna_id)] = v;
  }
  const r = calcular(formula as Coluna, { ...item, valores }, { colunas: colunas as Coluna[], nomeUsuario: () => '', hoje });
  if (r.erro) return { gravar: [], resultado: '', erro: r.erro };
  // Contrato arquivado ou na lixeira no Friday sai do app e do CronoObra (decisão de 2026-10-27).
  const campos = camposDaFormula(cadastro, r.valor, situacaoDoItem(item) === 'ativo');
  return { gravar: campos.filter(([k, v]) => (lerCaminho(doc, k) ?? null) !== v), resultado: String(r.valor) };
}

const registroComFormula = (r: AnyRecord | undefined) =>
  r && r.modo === 'existente' && r.situacao === 'ativo' && r.formula_situacao?.coluna_id != null && cadastroExistente(r.colecao)?.situacao_por_formula ? r : undefined;
const colunasDo = async (quadroId: number) => (await db.collection('friday-colunas').where('quadro_id', '==', quadroId).get()).docs.map(d => d.data());
const atualizacao = (gravar: [string, unknown][]) => gravar.flatMap(([k, v]) => [new FieldPath(...k.split('.')), v]) as [FieldPath, unknown];

/** Item do quadro mudou (valor, nome, arquivado…): recalcula a situação do registro dele. Subitens e itens livres saem logo. */
export const fridayObrasSituacaoItem = onDocumentWritten({ document: 'friday-itens/{itemId}', region: REGIAO }, async event => {
  const item = event.data?.after?.data();
  if (!item?.vinculo?.cadastro || item.vinculo.sub != null) return;
  const registro = registroComFormula((await db.collection('friday-cadastros').doc(String(item.vinculo.cadastro)).get()).data());
  if (!registro || Number(item.quadro_id) !== Number(registro.quadro_id)) return;
  const ref = db.collection(String(registro.colecao)).doc(String(item.vinculo.id));
  const doc = (await ref.get()).data();
  if (!doc) return;
  const r = calcularSituacao(cadastroExistente(registro.colecao), registro, await colunasDo(Number(registro.quadro_id)), item, doc, hojeEmBrasilia());
  if (!r) return;
  if (r.erro) { logger.warn('friday-obras-situacao:erro-formula', { itemId: item.id, erro: r.erro }); return; }
  if (!r.gravar.length) return;
  await ref.update(...atualizacao(r.gravar));
  logger.info('friday-obras-situacao:item', { itemId: item.id, registroId: ref.id, resultado: r.resultado });
});

/** Recalcula todos os itens vinculados de um cadastro com fórmula. Usado pela rodada diária. */
export async function recalcularCadastro(registro: AnyRecord, hoje: Date) {
  const cadastro = cadastroExistente(registro.colecao);
  const colunas = await colunasDo(Number(registro.quadro_id));
  const itens = (await db.collection('friday-itens').where('quadro_id', '==', Number(registro.quadro_id)).get()).docs
    .map(d => d.data()).filter(i => i.vinculo?.cadastro === registro.chave && i.vinculo.sub == null);
  const refs = itens.map(i => db.collection(String(registro.colecao)).doc(String(i.vinculo.id)));
  const docs = new Map<string, AnyRecord | undefined>();
  for (let k = 0; k < refs.length; k += 100) for (const s of await db.getAll(...refs.slice(k, k + 100))) docs.set(s.id, s.data());
  let atualizados = 0, erros = 0;
  let lote = db.batch(), noLote = 0;
  for (const item of itens) {
    const doc = docs.get(String(item.vinculo.id));
    if (!doc) continue;
    const r = calcularSituacao(cadastro, registro, colunas, item, doc, hoje);
    if (!r) continue;
    if (r.erro) { erros++; continue; }
    if (!r.gravar.length) continue;
    lote.update(db.collection(String(registro.colecao)).doc(String(item.vinculo.id)), ...atualizacao(r.gravar));
    atualizados++;
    if (++noLote === 400) { await lote.commit(); lote = db.batch(); noLote = 0; }
  }
  if (noLote) await lote.commit();
  return { itens: itens.length, atualizados, erros };
}

/** Uma vez por dia, logo depois da meia-noite de Brasília: resultados que dependem da data de hoje. */
export const fridayObrasSituacaoDiaria = onSchedule({ schedule: 'every day 00:05', timeZone: 'America/Sao_Paulo', region: REGIAO }, async () => {
  const registros = (await db.collection('friday-cadastros').where('modo', '==', 'existente').get()).docs.map(d => d.data()).filter(r => registroComFormula(r));
  for (const registro of registros) {
    const r = await recalcularCadastro(registro, hojeEmBrasilia());
    logger.info('friday-obras-situacao:diaria', { chave: registro.chave, ...r });
  }
});
