import { estagioDe, mutar, normalizarGenoma, sortearGenoma, type Estagio, type Genoma } from './genoma';
import { gravar, ler, normalizarCorpus, tirarCorpusAntigo } from './memoria';
import { rngDe } from './sim';

// Viveiro: até 6 Crawlers, cada um com genoma, estágio, fome e o seu próprio mini-LLM. Um alimenta por vez
// (o "ativo"). Só neste navegador (localStorage `ledur:dev-viveiro`); nada vai para o Firestore.

export const MAX_CRIATURAS = 6;
/** Fome: sobe 1 ponto a cada 10 minutos sem comer (cheia em ~17 h); cada palavra escaneada tira 2. */
export const MS_POR_PONTO_DE_FOME = 10 * 60 * 1000;
export const FOME_POR_PALAVRA = 2;
/** Faminto: anda devagar e o xerox não dá experiência. Não morre. */
export const FAMINTO = 70;
export const BONUS_GOSTEI = 25;
/** Xerox com nota a partir daqui pode trazer uma mutação. */
export const NOTA_MUTACAO = 85;
export const CHANCE_MUTACAO = 0.35;

export type Xerox = { texto: string; nota: number; gostei: boolean };

export type Criatura = {
  id: string;
  numero: number;
  seed: number;
  genoma: Genoma;
  xp: number;
  /** palavras aprendidas, em ordem de leitura (o mini-LLM dele) */
  corpus: string[];
  /** saiu do ovo (escaneou a primeira palavra) */
  nasceu: boolean;
  /** fome no momento da última refeição */
  fome: number;
  ultimaRefeicao: number;
  textosLidos: number;
  xeroxes: number;
  melhorNota: number;
  ultimo: Xerox | null;
};

export type Viveiro = { criaturas: Criatura[]; ativa: string | null; proximoNumero: number };

export const nomeDe = (c: Pick<Criatura, 'numero'>) => `CRAWLER ${String(c.numero).padStart(2, '0')}`;
export const estagio = (c: Criatura): Estagio => estagioDe(c.xp, c.nasceu);

export function fomeAgora(c: Pick<Criatura, 'fome' | 'ultimaRefeicao'>, agora: number): number {
  return Math.min(100, Math.max(0, c.fome + Math.max(0, agora - c.ultimaRefeicao) / MS_POR_PONTO_DE_FOME));
}

export function novaCriatura(numero: number, seed: number, agora: number): Criatura {
  return {
    id: `c${seed.toString(36)}${numero}`,
    numero,
    seed,
    genoma: sortearGenoma(rngDe(seed)),
    xp: 0,
    corpus: [],
    nasceu: false,
    fome: 30,
    ultimaRefeicao: agora,
    textosLidos: 0,
    xeroxes: 0,
    melhorNota: 0,
    ultimo: null,
  };
}

/** Comeu `palavras` palavras: a fome cai e o ovo choca. */
export function alimentar(c: Criatura, palavras: number, agora: number): Criatura {
  return { ...c, nasceu: c.nasceu || palavras > 0, fome: Math.max(0, fomeAgora(c, agora) - FOME_POR_PALAVRA * palavras), ultimaRefeicao: agora };
}

export type Resultado = { criatura: Criatura; xp: number; mutou: string | null; evoluiu: Estagio | null };

/** Escreveu um xerox com esta nota: ganha experiência (zero se faminto) e, se a nota for alta, pode mutar. */
export function registrarXerox(c: Criatura, texto: string, nota: number, agora: number, rng: () => number): Resultado {
  const antes = estagio(c);
  const xp = fomeAgora(c, agora) >= FAMINTO ? 0 : nota;
  let genoma = c.genoma;
  let mutou: string | null = null;
  if (nota >= NOTA_MUTACAO && rng() < CHANCE_MUTACAO) {
    const m = mutar(c.genoma, rng);
    genoma = m.genoma;
    mutou = m.gene;
  }
  const criatura: Criatura = {
    ...c,
    genoma,
    xp: c.xp + xp,
    xeroxes: c.xeroxes + 1,
    melhorNota: Math.max(c.melhorNota, nota),
    ultimo: { texto, nota, gostei: false },
  };
  const depois = estagio(criatura);
  return { criatura, xp, mutou, evoluiu: depois !== antes ? depois : null };
}

/** "Gostei" do último xerox: bônus de experiência, uma vez por xerox. */
export function gostei(c: Criatura): Resultado {
  if (!c.ultimo || c.ultimo.gostei) return { criatura: c, xp: 0, mutou: null, evoluiu: null };
  const antes = estagio(c);
  const criatura = { ...c, xp: c.xp + BONUS_GOSTEI, ultimo: { ...c.ultimo, gostei: true } };
  const depois = estagio(criatura);
  return { criatura, xp: BONUS_GOSTEI, mutou: null, evoluiu: depois !== antes ? depois : null };
}

const numero = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);

export function normalizarCriatura(valor: unknown, agora: number): Criatura | null {
  if (!valor || typeof valor !== 'object') return null;
  const v = valor as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id) return null;
  const seed = numero(v.seed, 1) >>> 0;
  const u = v.ultimo && typeof v.ultimo === 'object' ? (v.ultimo as Record<string, unknown>) : null;
  return {
    id: v.id,
    numero: Math.max(1, Math.floor(numero(v.numero, 1))),
    seed,
    genoma: normalizarGenoma(v.genoma, rngDe(seed)),
    xp: Math.max(0, numero(v.xp, 0)),
    corpus: normalizarCorpus(v.corpus),
    nasceu: v.nasceu === true,
    fome: Math.min(100, Math.max(0, numero(v.fome, 30))),
    ultimaRefeicao: numero(v.ultimaRefeicao, agora),
    textosLidos: Math.max(0, Math.floor(numero(v.textosLidos, 0))),
    xeroxes: Math.max(0, Math.floor(numero(v.xeroxes, 0))),
    melhorNota: Math.max(0, numero(v.melhorNota, 0)),
    ultimo: u && typeof u.texto === 'string' ? { texto: u.texto, nota: numero(u.nota, 0), gostei: u.gostei === true } : null,
  };
}

export function normalizarViveiro(valor: unknown, agora: number): Viveiro {
  const v = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const criaturas = (Array.isArray(v.criaturas) ? v.criaturas : [])
    .map((c) => normalizarCriatura(c, agora))
    .filter((c): c is Criatura => c !== null)
    .slice(0, MAX_CRIATURAS);
  const ativa = typeof v.ativa === 'string' && criaturas.some((c) => c.id === v.ativa) ? v.ativa : (criaturas[0]?.id ?? null);
  const proximoNumero = Math.max(numero(v.proximoNumero, 1), ...criaturas.map((c) => c.numero + 1), 1);
  return { criaturas, ativa, proximoNumero };
}

/** Choca um ovo novo no viveiro (se houver vaga). */
export function chocar(v: Viveiro, seed: number, agora: number): Viveiro {
  if (v.criaturas.length >= MAX_CRIATURAS) return v;
  const c = novaCriatura(v.proximoNumero, seed, agora);
  return { criaturas: [...v.criaturas, c], ativa: v.ativa ?? c.id, proximoNumero: v.proximoNumero + 1 };
}

export function soltar(v: Viveiro, id: string): Viveiro {
  const criaturas = v.criaturas.filter((c) => c.id !== id);
  return { ...v, criaturas, ativa: v.ativa === id ? (criaturas[0]?.id ?? null) : v.ativa };
}

/** Troca uma criatura salva (se ela ainda estiver no viveiro: solta não volta). */
export function atualizar(v: Viveiro, c: Criatura): Viveiro {
  return v.criaturas.some((x) => x.id === c.id) ? { ...v, criaturas: v.criaturas.map((x) => (x.id === c.id ? c : x)) } : v;
}

const CHAVE = 'ledur:dev-viveiro';
/** Evento disparado a cada gravação: a janela do Crawler e a do Viveiro se acompanham por ele. */
export const EVENTO_VIVEIRO = 'ledur:dev-viveiro';

const semente = () => Math.floor(Math.random() * 2 ** 31);

/** Lê o viveiro; vazio, choca o primeiro ovo (com o aprendizado de antes das criaturas, se houver). */
export function lerViveiro(agora = Date.now()): Viveiro {
  const v = normalizarViveiro(ler(CHAVE), agora);
  if (v.criaturas.length) return v;
  const novo = chocar(v, semente(), agora);
  const antigo = tirarCorpusAntigo();
  if (antigo.length) novo.criaturas[0] = { ...novo.criaturas[0], corpus: antigo, nasceu: true };
  gravarViveiro(novo);
  return novo;
}

export function gravarViveiro(v: Viveiro) {
  gravar(CHAVE, v);
  try { window.dispatchEvent(new CustomEvent(EVENTO_VIVEIRO)); } catch { /* fora do navegador */ }
}

export const novaSemente = semente;
