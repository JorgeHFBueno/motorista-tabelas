// Text and URL helpers of the external news ingestion. Pure (no network, no Firebase).
import { createHash } from 'node:crypto';

export function normalizarEspacos(valor: unknown): string {
  return String(valor ?? '').replace(/\s+/g, ' ').trim();
}

export function removerHtml(valor: unknown): string {
  return normalizarEspacos(String(valor ?? '').replace(/<[^>]*>/g, ' '));
}

const ENTIDADES: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
};

/** Decodes the HTML entities feeds leave in titles and summaries (named common ones and numeric), in one pass. */
export function decodificarEntidades(valor: unknown): string {
  return String(valor ?? '').replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (inteiro, corpo: string) => {
    if (corpo[0] === '#') {
      const codigo = corpo[1] === 'x' || corpo[1] === 'X' ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10);
      if (!Number.isFinite(codigo) || codigo <= 0 || codigo > 0x10ffff) return inteiro;
      return codigo === 160 ? ' ' : String.fromCodePoint(codigo);
    }
    return ENTIDADES[corpo.toLowerCase()] ?? inteiro;
  });
}

export function semAcentos(valor: unknown): string {
  return String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Absolute URL without query string, fragment and trailing slash; text that is not a URL comes back trimmed. */
export function normalizarUrl(bruta: unknown, base?: string): string {
  if (!bruta || typeof bruta !== 'string') return '';
  try {
    const url = base ? new URL(bruta, base) : new URL(bruta);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return normalizarEspacos(bruta);
  }
}

/** Lower case, without accents and extra spaces: the form compared by the curation. */
export function normalizarTitulo(valor: unknown): string {
  return semAcentos(normalizarEspacos(valor)).toLowerCase();
}

export function palavras(valor: unknown): string[] {
  return normalizarTitulo(valor).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export function similaridadeJaccard(a: unknown, b: unknown): number {
  const conjuntoA = new Set(palavras(a));
  const conjuntoB = new Set(palavras(b));
  if (!conjuntoA.size && !conjuntoB.size) return 1;
  let comuns = 0;
  for (const palavra of conjuntoA) if (conjuntoB.has(palavra)) comuns += 1;
  const uniao = new Set([...conjuntoA, ...conjuntoB]).size;
  return uniao === 0 ? 0 : comuns / uniao;
}

/** sha256 of "{categoria}::{normalized URL}", or of "{categoria}::{normalized title}" without URL. */
export function hashDedupe(categoria: string, url: string | null | undefined, titulo: string): string {
  const urlNormalizada = normalizarUrl(url ?? '');
  const base = urlNormalizada ? `${categoria}::${urlNormalizada}` : `${categoria}::${normalizarTitulo(titulo)}`;
  return createHash('sha256').update(base).digest('hex');
}

/** og:image, twitter:image or the first <img> of an HTML fragment or page. */
export function primeiraImagemDoHtml(valor: unknown, base?: string): string {
  const html = String(valor ?? '');
  const padroes = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<img[^>]+src=["']([^"']+)["']/i,
  ];
  for (const padrao of padroes) {
    const achado = html.match(padrao);
    if (achado?.[1]) return normalizarUrl(decodificarEntidades(achado[1]), base);
  }
  return '';
}

/** http(s) image that is not SVG: a known extension or a path with /image or /media. */
export function imagemValida(url: unknown): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    const caminho = parsed.pathname.toLowerCase();
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (caminho.endsWith('.svg')) return false;
    return /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(caminho) || caminho.includes('/image') || caminho.includes('/media');
  } catch {
    return false;
  }
}
