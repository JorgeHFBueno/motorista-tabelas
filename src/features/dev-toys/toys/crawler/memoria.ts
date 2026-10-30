// Memória do mini-LLM do Crawler: as palavras comidas, em ordem (o "corpus"), e duas opções. Só neste navegador
// (localStorage, padrão `ledur:*`); nada vai para o Firestore.

export type OpcoesCrawler = {
  /** O texto que o próprio LLM escreveu também ensina o LLM (xerox de um xerox). */
  aprendeDeSi: boolean;
  /** O aprendizado sobrevive a fechar a janela e recarregar a página. */
  guardar: boolean;
};

export const MAX_CORPUS = 5000;
const CHAVE_OPCOES = 'ledur:dev-crawler';
const CHAVE_CORPUS = 'ledur:dev-crawler-corpus';

export function normalizarOpcoes(valor: unknown): OpcoesCrawler {
  const o = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  return { aprendeDeSi: o.aprendeDeSi !== false, guardar: o.guardar !== false };
}

/** Acrescenta palavras ao corpus e guarda só as últimas `max`. */
export function acrescentar(corpus: string[], novas: string[], max = MAX_CORPUS): string[] {
  const junto = corpus.concat(novas);
  return junto.length > max ? junto.slice(junto.length - max) : junto;
}

export function normalizarCorpus(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((p): p is string => typeof p === 'string' && p.length > 0).slice(-MAX_CORPUS);
}

const ler = (chave: string): unknown => {
  try { return JSON.parse(localStorage.getItem(chave) ?? 'null'); } catch { return null; }
};
const gravar = (chave: string, valor: unknown) => {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
};

export const lerOpcoes = () => normalizarOpcoes(ler(CHAVE_OPCOES));
export const gravarOpcoes = (o: OpcoesCrawler) => gravar(CHAVE_OPCOES, o);
export const lerCorpus = () => normalizarCorpus(ler(CHAVE_CORPUS));
export const gravarCorpus = (c: string[]) => gravar(CHAVE_CORPUS, c);
export const apagarCorpus = () => { try { localStorage.removeItem(CHAVE_CORPUS); } catch { /* sem armazenamento */ } };
