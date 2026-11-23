// Regras puras do aviso da divergência do montante da bomba (sem Firebase; teste em test/combustivelDivergencia.test.mjs).
// O app abre um chamado "Conflito no Montante" em 00-chamados quando o montante informado difere do sistema; o aviso vai
// para todo adm2 ativo (decisão do responsável de 2026-11-23), no lugar da coleção notificacoes, que vai ser aposentada.
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/avisos.md.
import { createHash } from 'node:crypto';
import { temCredencial } from './credenciais.js';

type AnyRecord = Record<string, any>;

export const TIPO_CHAMADO = 'Conflito no Montante';
export const ROTA_DIVERGENCIA = '/logistica/combustivel/registros';

/** O chamado é a divergência do montante (os outros tipos de 00-chamados não avisam). */
export const ehDivergencia = (chamado: AnyRecord | undefined) => chamado?.tipo === TIPO_CHAMADO;

/** Litros guardados ×10 (inteiro) → "54.698,9". */
export function litros(valor: unknown): string | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null;
  return (valor / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Aviso no sino do sistema (avisos/{uid}/itens), sem o criadoEm (hora do servidor, posta na gravação). */
export function avisoDivergencia(chamadoId: string, chamado: AnyRecord, nomeMotorista: string | null) {
  const informado = litros(chamado.mntntInfrmd);
  const sistema = litros(chamado.montanteInicial);
  const diferenca = typeof chamado.dfrncl === 'number' ? litros(Math.abs(chamado.dfrncl)) : null;
  const quem = nomeMotorista || (typeof chamado.motorista === 'string' ? chamado.motorista.trim() : '');
  return {
    area: 'logistica', tipo: 'combustivel_divergencia',
    titulo: 'Divergência no montante da bomba',
    mensagem: [
      informado && `Informado ${informado}`, sistema && `sistema ${sistema}`, diferenca && `diferença ${diferenca} L`, quem,
    ].filter(Boolean).join(' · ').slice(0, 300),
    rota: ROTA_DIVERGENCIA, local: 'Combustível',
    origem: { colecao: '00-chamados', id: chamadoId },
    lida: false,
  };
}

/** Quem recebe: todo funcionário ativo com a credencial adm2. */
export function destinatariosDivergencia(funcionarios: { id: string; data: AnyRecord | undefined }[]): string[] {
  return funcionarios.filter(f => temCredencial(f.data, 'adm2')).map(f => f.id);
}

/** Id estável por chamado e pessoa: a nova tentativa da Function não repete o aviso. */
export const idAvisoDivergencia = (chamadoId: string, uid: string) =>
  `cdv_${createHash('sha256').update(`${chamadoId}|${uid}`).digest('hex').slice(0, 28)}`;
