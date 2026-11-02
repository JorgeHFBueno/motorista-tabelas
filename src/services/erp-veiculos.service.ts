// ERP guardado por veículo (erp-veiculos/{veiculoId}): linhas da Query 47 desde 01/01/2025, gravadas pela Function
// todo dia às 03:00 (Brasília) e pelo "Atualizar agora". The Manuscript: 01_FIRESTORE/COLECOES/erp-veiculos.md.
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

export const ERP_VEICULOS = 'erp-veiculos';

export type ErpGuardado = {
  veiculoId: string;
  status: 'ok' | 'erro';
  /** Linhas da última consulta que deu certo (numa falha, ficam as anteriores); null = nunca consultado com sucesso. */
  linhas: Record<string, unknown>[] | null;
  atualizadoEm: Date | null;
  erro: { codigo: string; mensagem: string } | null;
  erroEm: Date | null;
};

const data = (value: unknown) => (value && typeof (value as { toDate?: () => Date }).toDate === 'function' ? (value as { toDate: () => Date }).toDate() : null);

export function erpGuardadoDe(veiculoId: string, raw: Record<string, unknown>): ErpGuardado {
  const erro = raw.erro && typeof raw.erro === 'object' ? raw.erro as Record<string, unknown> : null;
  return {
    veiculoId,
    status: raw.status === 'erro' ? 'erro' : 'ok',
    linhas: Array.isArray(raw.linhas) ? raw.linhas as Record<string, unknown>[] : null,
    atualizadoEm: data(raw.atualizadoEm),
    erro: erro ? { codigo: String(erro.codigo ?? ''), mensagem: String(erro.mensagem ?? '') } : null,
    erroEm: data(raw.erroEm),
  };
}

export async function lerErpVeiculos(): Promise<Map<string, ErpGuardado>> {
  const snapshot = await getDocs(collection(db, ERP_VEICULOS));
  return new Map(snapshot.docs.map((d) => [d.id, erpGuardadoDe(d.id, d.data())]));
}

export async function lerErpVeiculo(veiculoId: string): Promise<ErpGuardado | null> {
  const snapshot = await getDoc(doc(db, ERP_VEICULOS, veiculoId));
  return snapshot.exists() ? erpGuardadoDe(snapshot.id, snapshot.data()) : null;
}

export type ResumoAtualizacao = { veiculos: number; ok: number; erro: number; falhas: { veiculoId: string; placa: string; codigo: string }[] };
/** "Atualizar agora": consulta o ERP dos veículos pedidos (ou de toda a frota com placa) e grava erp-veiculos. */
export async function atualizarErpVeiculos(veiculoIds?: string[]): Promise<ResumoAtualizacao> {
  const chamada = httpsCallable<{ veiculoIds?: string[] }, ResumoAtualizacao>(functions, 'atualizarErpVeiculos', { timeout: 310_000 });
  return (await chamada(veiculoIds?.length ? { veiculoIds } : {})).data;
}
