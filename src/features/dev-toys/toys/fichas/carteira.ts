import { gravar, ler } from '../crawler/memoria';

// Fichas da área DEV: uma carteira só, guardada neste navegador como as Anomalias (`ledur:dev-fichas`), usada pelos
// jogos (a principal forma de ganhar fichas) e pelas skills (cada ponto custa também CUSTO_SKILL fichas). Começa
// com 200. Sem fichas para a menor aposta, a casa dá uma mesada, uma vez por dia (horário de Brasília).

export const CHAVE_FICHAS = 'ledur:dev-fichas';
/** Antes da carteira, as fichas ficavam no placar do 21: na primeira leitura, elas vêm de lá. */
const CHAVE_LEGADO_21 = 'ledur:dev-21';

export const FICHAS_INICIAIS = 200;
export const MESADA = 200;
export const APOSTAS = [10, 20, 50] as const;
export const APOSTA_MINIMA = APOSTAS[0];
export const CUSTO_SKILL = 50;

export type Carteira = {
  fichas: number;
  recorde: number;
  mesadas: number;
  /** dia da última mesada (AAAA-MM-DD, Brasília) */
  ultimaMesada: string | null;
};

const inteiro = (x: unknown, padrao: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : padrao);
const objeto = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

/** Carteira válida a partir do salvo; sem carteira, as fichas e o recorde do placar antigo do 21, se houver. */
export function normalizarCarteira(valor: unknown, legado21?: unknown): Carteira {
  const v = objeto(valor) ?? objeto(legado21) ?? {};
  const fichas = inteiro(v.fichas, FICHAS_INICIAIS);
  const dia = objeto(valor) && typeof v.ultimaMesada === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.ultimaMesada) ? v.ultimaMesada : null;
  return {
    fichas,
    recorde: Math.max(fichas, inteiro(v.recorde, FICHAS_INICIAIS)),
    mesadas: objeto(valor) ? inteiro(v.mesadas, 0) : 0,
    ultimaMesada: dia,
  };
}

export const hojeEmBrasilia = (agora = new Date()) => agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export const semFichas = (c: Carteira) => c.fichas < APOSTA_MINIMA;
export const podeMesada = (c: Carteira, hoje: string) => semFichas(c) && c.ultimaMesada !== hoje;

export function pegarMesada(c: Carteira, hoje: string): Carteira {
  if (!podeMesada(c, hoje)) return c;
  return { ...mover(c, MESADA), mesadas: c.mesadas + 1, ultimaMesada: hoje };
}

/** Soma (ou tira) fichas, sem passar de zero, e guarda o recorde. */
export function mover(c: Carteira, delta: number): Carteira {
  const fichas = Math.max(0, c.fichas + Math.round(delta));
  return { ...c, fichas, recorde: Math.max(c.recorde, fichas) };
}

export const podePagarSkill = (c: Carteira) => c.fichas >= CUSTO_SKILL;

// ---- guardada no navegador ----------------------------------------------------------------------------------------

export function lerCarteira(): Carteira {
  const salva = ler(CHAVE_FICHAS);
  if (salva) return normalizarCarteira(salva);
  const nova = normalizarCarteira(null, ler(CHAVE_LEGADO_21));
  gravar(CHAVE_FICHAS, nova);
  return nova;
}

/**
 * Muda a carteira a partir do que está gravado agora (outra janela pode ter mexido nela) e avisa as outras janelas
 * pelo evento com o nome da chave.
 */
export function alterarCarteira(mudar: (c: Carteira) => Carteira): Carteira {
  const c = mudar(lerCarteira());
  gravar(CHAVE_FICHAS, c);
  try { window.dispatchEvent(new CustomEvent(CHAVE_FICHAS)); } catch { /* fora do navegador */ }
  return c;
}

// ---- fichas no desenho --------------------------------------------------------------------------------------------

/** Valores das fichas desenhadas, da maior para a menor (os pagamentos dão sempre múltiplos de 5). */
export const VALORES_FICHA = [100, 50, 10, 5] as const;

/** Quantas fichas de cada valor somam o total, das maiores para as menores; só os valores que aparecem. */
export function pilhas(total: number): Array<{ valor: number; qtd: number }> {
  let resto = Math.max(0, Math.floor(total));
  const saida: Array<{ valor: number; qtd: number }> = [];
  for (const valor of VALORES_FICHA) {
    const qtd = Math.floor(resto / valor);
    resto -= qtd * valor;
    if (qtd) saida.push({ valor, qtd });
  }
  return saida;
}
