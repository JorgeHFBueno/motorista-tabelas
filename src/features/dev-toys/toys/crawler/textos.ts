// Textos do Crawler ("Xerox de um Xerox", do responsável): cada entrada começa com "- " no início da linha.
// Viram listas de palavras; QUEBRA marca uma quebra de linha (poemas e parágrafos).

export const QUEBRA = '\n';

/** A Monaco só tem ASCII: aspas curvas, travessões e reticências viram ASCII; acentos caem; o resto some. */
export function paraAscii(texto: string): string {
  return texto
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '');
}

/** Arquivo inteiro → textos, cada um como palavras e QUEBRAs (no máximo duas seguidas: fim de estrofe). */
export function separarTextos(bruto: string): string[][] {
  const linhas = paraAscii(bruto.replace(/\r\n?/g, '\n')).split('\n');
  const textos: string[][] = [];
  let atual: string[] | null = null;
  for (const linha of linhas) {
    const inicio = /^- /.test(linha);
    if (inicio) {
      atual = [];
      textos.push(atual);
    }
    if (!atual) continue;
    const palavras = (inicio ? linha.slice(2) : linha).trim().split(/\s+/).filter(Boolean);
    if (!palavras.length) {
      // linha em branco: fim da linha anterior e mais uma quebra (fim de estrofe), nunca mais que duas seguidas
      if (!atual.length) continue;
      if (atual.at(-1) !== QUEBRA) atual.push(QUEBRA);
      if (atual.at(-2) !== QUEBRA) atual.push(QUEBRA);
      continue;
    }
    if (atual.length && atual.at(-1) !== QUEBRA) atual.push(QUEBRA);
    atual.push(...palavras);
  }
  for (const t of textos) while (t.at(-1) === QUEBRA) t.pop();
  return textos.filter((t) => t.length > 0);
}

/** Ordem dos textos: embaralhada pela seed (Fisher-Yates), cada um uma vez antes de repetir. */
export function embaralhar(n: number, rng: () => number): number[] {
  const ordem = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  }
  return ordem;
}
