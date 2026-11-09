import { gravar, ler } from '../crawler/memoria';

// Histórico de transações da carteira (neste navegador, `ledur:dev-historico`): o resultado de cada rodada dos
// jogos, os gastos em skills e as mesadas, do mais novo para o mais antigo, até MAX_HISTORICO. Fichas que só
// mudam de lugar (sentar e levantar no poker) entram como transferência: aparecem, mas não contam nos totais.

export const CHAVE_HISTORICO = 'ledur:dev-historico';
export const MAX_HISTORICO = 100;
export const ORIGENS = ['21', 'POKER', 'SLOT', 'XADREZ', 'NEO', 'PROTOCOLO', 'SKILL', 'MESADA'] as const;
export type Origem = (typeof ORIGENS)[number];

export type Lancamento = {
  /** quando (ms desde 1970) */
  em: number;
  origem: Origem;
  /** o que entrou (+) ou saiu (-) da carteira; no poker, o saldo da mão (as fichas estão na mesa) */
  valor: number;
  detalhe: string;
  /** fichas que só mudaram de lugar: não é ganho nem perda */
  transferencia?: boolean;
};

const lancamento = (v: unknown): Lancamento | null => {
  const x = v && typeof v === 'object' ? { ...(v as Record<string, unknown>) } : null;
  // o NEO se chamava Descarte
  if (x?.origem === 'DESCARTE') x.origem = 'NEO';
  if (!x || typeof x.em !== 'number' || !ORIGENS.includes(x.origem as Origem) || typeof x.valor !== 'number' || !Number.isFinite(x.valor)) return null;
  return {
    em: x.em, origem: x.origem as Origem, valor: Math.round(x.valor), detalhe: typeof x.detalhe === 'string' ? x.detalhe : '',
    ...(x.transferencia === true ? { transferencia: true } : {}),
  };
};

export function normalizarHistorico(valor: unknown): Lancamento[] {
  return Array.isArray(valor) ? valor.map(lancamento).filter((l): l is Lancamento => !!l).slice(0, MAX_HISTORICO) : [];
}

/** Põe o lançamento no topo e corta o que passar de MAX_HISTORICO. */
export const acrescentar = (lista: Lancamento[], l: Lancamento) => [l, ...lista].slice(0, MAX_HISTORICO);

/** Totais do que está no histórico: ganhos e perdas nos jogos, gastos em skills e mesadas (sem as transferências). */
export function resumo(lista: Lancamento[]) {
  const r = { ganhos: 0, perdas: 0, skills: 0, mesadas: 0 };
  for (const l of lista) {
    if (l.transferencia) continue;
    if (l.origem === 'SKILL') r.skills += l.valor;
    else if (l.origem === 'MESADA') r.mesadas += l.valor;
    else if (l.valor > 0) r.ganhos += l.valor;
    else r.perdas += l.valor;
  }
  return r;
}

export const lerHistorico = () => normalizarHistorico(ler(CHAVE_HISTORICO));

/** Grava um lançamento e avisa as janelas abertas (evento com o nome da chave). */
export function anotar(origem: Origem, valor: number, detalhe: string, transferencia = false) {
  gravar(CHAVE_HISTORICO, acrescentar(lerHistorico(), { em: Date.now(), origem, valor: Math.round(valor), detalhe, ...(transferencia ? { transferencia } : {}) }));
  try { window.dispatchEvent(new CustomEvent(CHAVE_HISTORICO)); } catch { /* fora do navegador */ }
}
