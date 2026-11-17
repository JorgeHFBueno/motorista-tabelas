// "Última atualização" do veículo (veiculos-v2.operacional.dataUltimaAtualizacao) também por viagens e abastecimentos
// (Manuscript 01_FIRESTORE/COLECOES/veiculos-v2.md). O app grava essa data só no checklist e na manutenção; aqui, cada
// atividade ou saída de combustível nova com leitura do medidor leva a data do registro para o veículo, se for mais nova.
// O KM continua com quem já grava (app e WEB); esta Function só mexe na data.
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';

const REGIAO = 'southamerica-east1';
/** Registro com data mais de um dia no futuro (relógio do aparelho errado) não mexe na data do veículo. */
const FUTURO_MAXIMO_MS = 24 * 3600e3;

type Registro = Record<string, unknown>;

const dataDe = (value: unknown): Date | null => {
  const data = value && typeof (value as { toDate?: () => Date }).toDate === 'function' ? (value as { toDate: () => Date }).toDate() : null;
  return data && !Number.isNaN(data.getTime()) ? data : null;
};
const temLeitura = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

/** Veículo e data da leitura de uma atividade ou de uma saída de combustível; null quando não há leitura do medidor. */
export function leituraDoRegistro(colecao: 'atividades' | '03-combustivel', registro: Registro, agora = new Date()): { veiculoId: string; data: Date } | null {
  const veiculoId = typeof registro.item_frota_id === 'string' ? registro.item_frota_id.trim() : '';
  const data = dataDe(registro.data);
  if (!veiculoId || !data || data.getTime() > agora.getTime() + FUTURO_MAXIMO_MS) return null;
  const leitura = colecao === 'atividades'
    ? temLeitura(registro.km)
    : registro.schemaVersion === 2 && registro.tipo === 'saida' && (temLeitura(registro.quilometragem) || temLeitura(registro.horimetro));
  return leitura ? { veiculoId, data } : null;
}

/** Leva a data para o veículo só se ela for mais nova que a gravada (transação: o app grava o mesmo documento). */
export async function aplicarLeitura(veiculoId: string, data: Date) {
  const ref = db.collection('veiculos-v2').doc(veiculoId);
  return db.runTransaction(async (tx) => {
    const veiculo = await tx.get(ref);
    if (!veiculo.exists) return 'sem-veiculo';
    const atual = dataDe(veiculo.get('operacional.dataUltimaAtualizacao'));
    if (atual && atual.getTime() >= data.getTime()) return 'mais-antiga';
    tx.update(ref, { 'operacional.dataUltimaAtualizacao': Timestamp.fromDate(data) });
    return 'gravada';
  });
}

async function aoCriar(colecao: 'atividades' | '03-combustivel', id: string, registro: Registro | undefined) {
  const leitura = registro ? leituraDoRegistro(colecao, registro) : null;
  if (!leitura) return;
  const resultado = await aplicarLeitura(leitura.veiculoId, leitura.data);
  if (resultado === 'sem-veiculo') logger.warn('frota: veículo da leitura não existe', { colecao, id, veiculoId: leitura.veiculoId });
}

export const frotaUltimaAtualizacaoAtividade = onDocumentCreated({ document: 'atividades/{id}', region: REGIAO }, async (event) => {
  await aoCriar('atividades', event.params.id, event.data?.data());
});

export const frotaUltimaAtualizacaoCombustivel = onDocumentCreated({ document: '03-combustivel/{id}', region: REGIAO }, async (event) => {
  await aoCriar('03-combustivel', event.params.id, event.data?.data());
});
