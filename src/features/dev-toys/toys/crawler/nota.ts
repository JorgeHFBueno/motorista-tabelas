import { fimDeFrase, type Estatisticas } from './markov';

// Nota de um xerox (0 a 100), calculada no navegador. Vale experiência para o Crawler que o escreveu.
//   coesão     (35%): quantas palavras vieram do par anterior (trigrama), e não de remendo ou recomeço
//   mistura    (35%): quanto ele costurou fontes em vez de copiar trechos longos (sequências de 5 palavras novas)
//   variedade  (20%): palavras diferentes sobre o total
//   fechamento (10%): termina numa frase completa

export type Nota = { nota: number; coesao: number; mistura: number; variedade: number; fechamento: number };

const N_COPIA = 5;
const MISTURA_CHEIA = 0.35; // a partir de 35% de sequências novas, a mistura vale nota cheia
const limitar = (x: number) => Math.min(1, Math.max(0, x));

export function avaliar(texto: string[], corpus: string[], stats: Estatisticas): Nota {
  if (!texto.length) return { nota: 0, coesao: 0, mistura: 0, variedade: 0, fechamento: 0 };

  const ligacoes = stats.tri + stats.bi + stats.recomeco;
  const coesao = ligacoes ? (stats.tri + 0.4 * stats.bi) / ligacoes : 0;

  const conhecidas = new Set<string>();
  for (let i = 0; i + N_COPIA <= corpus.length; i++) conhecidas.add(corpus.slice(i, i + N_COPIA).join(' '));
  let total = 0;
  let copiadas = 0;
  for (let i = 0; i + N_COPIA <= texto.length; i++) {
    total++;
    if (conhecidas.has(texto.slice(i, i + N_COPIA).join(' '))) copiadas++;
  }
  const mistura = total ? limitar((1 - copiadas / total) / MISTURA_CHEIA) : 0;

  const variedade = limitar((new Set(texto.map((w) => w.toLowerCase())).size / texto.length - 0.4) / 0.4);
  const fechamento = fimDeFrase(texto[texto.length - 1]) ? 1 : 0;

  const nota = Math.round(100 * (0.35 * coesao + 0.35 * mistura + 0.2 * variedade + 0.1 * fechamento));
  return { nota, coesao, mistura, variedade, fechamento };
}
