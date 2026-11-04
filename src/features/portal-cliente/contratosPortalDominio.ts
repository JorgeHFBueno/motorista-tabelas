import type { ObraDetalhe } from '../obras/obrasDomain';
import { dataIsoValida, formatarDocumento, type ContratoPortal, type PessoaRef } from './portalDominio';

// Contracts in the client portal (portal-obras, The Manuscript 01_FIRESTORE/COLECOES/portal.md), team side.
// Pure: no Firebase here, so it can be tested in Node.

const semAcento = (valor: string) => valor.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Title of the Friday column that holds the client's CNPJ/CPF ("CNPJ/CPF Cliente"), ignoring case, accents and spaces. */
export function ehColunaCnpjCliente(titulo: unknown): boolean {
  return typeof titulo === 'string' && semAcento(titulo).replace(/\s+/g, '').toLowerCase() === 'cnpj/cpfcliente';
}

const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');
const textoOuNulo = (valor: unknown) => texto(valor) || null;
const dataOuNula = (valor: unknown) => (typeof valor === 'string' && dataIsoValida(valor) ? valor : null);
const registro = (valor: unknown): Record<string, unknown> =>
  valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};

/** portal-obras/{id} as read by the team screens. */
export function contratoPortalDe(id: string, dados: Record<string, unknown>): ContratoPortal {
  const previsao = registro(dados.previsao);
  const equipe = dados.equipe && typeof dados.equipe === 'object' ? registro(dados.equipe) : null;
  return {
    id,
    clienteDocumento: texto(dados.clienteDocumento),
    nome: texto(dados.nome),
    local: textoOuNulo(dados.local),
    numeroContrato: textoOuNulo(dados.numeroContrato),
    previsao: { inicio: dataOuNula(previsao.inicio), fim: dataOuNula(previsao.fim) },
    valorContrato: typeof dados.valorContrato === 'number' && Number.isInteger(dados.valorContrato) ? dados.valorContrato : null,
    progresso: dados.progresso ?? null,
    equipe: equipe ? { saida: equipe.saida ?? null, chegada: equipe.chegada ?? null } : null,
  };
}

// ---------------------------------------------------------------- list

export type FiltroContratos = 'PUBLICADOS' | 'NAO_PUBLICADOS' | 'TODOS';

/** A contract of obras-v2 and its portal-obras document (null when not published). */
export type LinhaContrato = { obra: ObraDetalhe; portal: ContratoPortal | null };

export function filtrarContratos(linhas: LinhaContrato[], busca: string, filtro: FiltroContratos): LinhaContrato[] {
  const termo = semAcento(busca.trim()).toLowerCase();
  const digitos = busca.replace(/\D/g, '');
  return linhas
    .filter((linha) => (filtro === 'PUBLICADOS' ? linha.portal : filtro === 'NAO_PUBLICADOS' ? !linha.portal : true))
    .filter((linha) => {
      if (!termo) return true;
      const campos = [linha.obra.nomeObra, linha.obra.numeroContrato, linha.obra.local, linha.portal?.nome ?? '', linha.portal ? formatarDocumento(linha.portal.clienteDocumento) : ''];
      return semAcento(campos.join(' ')).toLowerCase().includes(termo)
        || (digitos.length >= 3 && !!linha.portal?.clienteDocumento.includes(digitos));
    })
    .sort((a, b) => a.obra.nomeObra.localeCompare(b.obra.nomeObra, 'pt-BR'));
}

// ---------------------------------------------------------------- team departure and arrival

export type Confirmacao = { dataHora: Date; confirmadoPor: PessoaRef | null; confirmadoEm: Date | null };

const dataDe = (valor: unknown): Date | null => {
  const conversor = registro(valor).toDate;
  if (typeof conversor !== 'function') return null;
  const data = conversor.call(valor) as unknown;
  return data instanceof Date && Number.isFinite(data.getTime()) ? data : null;
};

/** equipe.saida / equipe.chegada: {dataHora: Timestamp, confirmadoPor, confirmadoEm}; null when not confirmed. */
export function confirmacaoDe(valor: unknown): Confirmacao | null {
  const dados = registro(valor);
  const dataHora = dataDe(dados.dataHora);
  if (!dataHora) return null;
  const pessoa = registro(dados.confirmadoPor);
  return {
    dataHora,
    confirmadoPor: typeof pessoa.uid === 'string' ? { uid: pessoa.uid, nome: texto(pessoa.nome) } : null,
    confirmadoEm: dataDe(dados.confirmadoEm),
  };
}

// Brasília has no daylight saving time since 2019: UTC-3 all year.
const BRASILIA_MS = -3 * 60 * 60 * 1000;

/** Date -> 'AAAA-MM-DDTHH:mm' in Brasília time, for a datetime-local input. */
export function dataHoraParaInput(data: Date): string {
  return new Date(data.getTime() + BRASILIA_MS).toISOString().slice(0, 16);
}

/** 'AAAA-MM-DDTHH:mm' typed in Brasília time -> Date; null when not a valid date and time. */
export function inputParaDataHora(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const data = new Date(`${valor}:00-03:00`);
  return Number.isFinite(data.getTime()) && dataHoraParaInput(data) === valor ? data : null;
}

export const formatarDataHora = (data: Date | null) =>
  data ? data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—';
