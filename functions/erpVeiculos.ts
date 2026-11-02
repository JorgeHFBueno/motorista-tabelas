// ERP guardado por veículo (Manuscript 01_FIRESTORE/COLECOES/erp-veiculos.md): as linhas da Query 47 de cada veículo com
// placa, de 01/01/2025 até hoje, em erp-veiculos/{veiculoId}. Atualizado todo dia às 03:00 (Brasília) e por "Atualizar
// agora" (adm2). O KPI e o detalhe do veículo leem daqui, sem consultar o ERP a cada visita. Só a Function grava.
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { assertFrotaAuthorization, erpToken, queryErp } from './vehicleReport.js';

const REGIAO = 'southamerica-east1';
export const ERP_VEICULOS = 'erp-veiculos';
export const ERP_INICIO = '2025-01-01';
const SIMULTANEAS = 3;
/** Documento do Firestore tem limite de 1 MiB; acima disto as linhas não são guardadas (fica o erro). */
const TAMANHO_MAXIMO = 900_000;

type Linha = Record<string, unknown>;

/** Placa para o ERP a partir do identificador ("ILW-2A23 - MICRO" → "ILW2A23"); sem placa (EXTRA), null. */
export function placaDoIdentificador(identificador: unknown): string | null {
  const compacta = String(identificador ?? '').toUpperCase().replace(/[-\s]/g, '');
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}/.test(compacta) ? compacta.slice(0, 7) : null;
}

export function hojeEmBrasilia(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
}

const numero = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(String(value ?? '').replace(',', '.')) || 0);
/** Soma das linhas DESPESA (a regra do relatório e do KPI). */
export function despesaDasLinhas(linhas: Linha[]) {
  return Math.round(linhas.filter((l) => String(l.tipo_movimento ?? '').trim().toUpperCase() === 'DESPESA').reduce((t, l) => t + numero(l.valor_rateio), 0) * 100) / 100;
}

/** O que vai para o documento: sucesso grava as linhas; falha guarda o erro e mantém as linhas da última vez. */
export function documentoDoResultado(placa: string, dataFinal: string, resultado: { linhas: Linha[] } | { erro: { codigo: string; mensagem: string; detalhe?: unknown } }) {
  if ('erro' in resultado) {
    return { schemaVersion: 1, placa, status: 'erro', erro: { ...resultado.erro, detalhe: resultado.erro.detalhe === undefined ? null : JSON.parse(JSON.stringify(resultado.erro.detalhe)) }, erroEm: FieldValue.serverTimestamp() };
  }
  if (JSON.stringify(resultado.linhas).length > TAMANHO_MAXIMO) {
    return { schemaVersion: 1, placa, status: 'erro', erro: { codigo: 'GRANDE_DEMAIS', mensagem: `${resultado.linhas.length} linhas passam do limite do documento`, detalhe: null }, erroEm: FieldValue.serverTimestamp() };
  }
  return {
    schemaVersion: 1, placa, status: 'ok', dataInicial: ERP_INICIO, dataFinal,
    linhas: resultado.linhas, quantidade: resultado.linhas.length, despesa: despesaDasLinhas(resultado.linhas),
    atualizadoEm: FieldValue.serverTimestamp(), erro: null,
  };
}

/** Consulta o ERP de cada veículo com placa (todos, ou só os `ids`) e grava erp-veiculos. */
export async function sincronizarErpVeiculos(token: string, ids?: string[]) {
  const snapshot = ids?.length
    ? await Promise.all(ids.map((id) => db.collection('veiculos-v2').doc(id).get())).then((docs) => docs.filter((d) => d.exists))
    : (await db.collection('veiculos-v2').get()).docs;
  const fila = snapshot
    .map((d) => ({ id: d.id, placa: d.get('identificacao.categoria') === 'PLACA' ? placaDoIdentificador(d.get('identificacao.identificador')) : null }))
    .filter((v): v is { id: string; placa: string } => Boolean(v.placa));
  const dataFinal = hojeEmBrasilia();
  const resumo = { veiculos: fila.length, ok: 0, erro: 0, falhas: [] as { veiculoId: string; placa: string; codigo: string }[] };
  const trabalhar = async () => {
    for (let item = fila.shift(); item; item = fila.shift()) {
      const atual = item;
      let resultado: Parameters<typeof documentoDoResultado>[2];
      try {
        resultado = { linhas: await queryErp(47, { DataInicial: ERP_INICIO, DataFinal: dataFinal, Placa: atual.placa }, token) as Linha[] };
      } catch (error) {
        const e = error as HttpsError;
        resultado = { erro: { codigo: e.message || 'ERRO', mensagem: String(e.message ?? error), detalhe: e.details } };
        logger.error('erp-veiculos: ERP falhou', { veiculoId: atual.id, placa: atual.placa, erro: e.message, detalhe: e.details });
      }
      await db.collection(ERP_VEICULOS).doc(atual.id).set(documentoDoResultado(atual.placa, dataFinal, resultado), { merge: true });
      if ('erro' in resultado) { resumo.erro += 1; resumo.falhas.push({ veiculoId: atual.id, placa: atual.placa, codigo: resultado.erro.codigo }); } else resumo.ok += 1;
    }
  };
  await Promise.all(Array.from({ length: SIMULTANEAS }, trabalhar));
  return resumo;
}

/** Todo dia às 03:00 (Brasília), toda a frota com placa. */
export const erpVeiculosDiario = onSchedule({ schedule: 'every day 03:00', timeZone: 'America/Sao_Paulo', region: REGIAO, secrets: [erpToken], timeoutSeconds: 540 }, async () => {
  const resumo = await sincronizarErpVeiculos(erpToken.value());
  logger.info('erp-veiculos:diario', resumo);
});

/** "Atualizar agora" (adm2): os veículos pedidos ou, sem `veiculoIds`, toda a frota com placa. */
export const atualizarErpVeiculos = onCall({ region: REGIAO, secrets: [erpToken], timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
  await assertFrotaAuthorization(request.auth.uid);
  const ids = Array.isArray(request.data?.veiculoIds) ? (request.data.veiculoIds as unknown[]).filter((id): id is string => typeof id === 'string' && /^[\w-]{1,128}$/.test(id)) : undefined;
  if (ids && ids.length > 200) throw new HttpsError('invalid-argument', 'Veículos demais.');
  const token = erpToken.value();
  if (!token?.trim()) throw new HttpsError('failed-precondition', 'ERP_API_TOKEN_MISSING');
  return sincronizarErpVeiculos(token, ids);
});
