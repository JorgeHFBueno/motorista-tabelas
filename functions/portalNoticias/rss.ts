// RSS 2.0 and Atom reading. `itensDoFeed` and `imagemDoItem` are pure; `baixarFeed` does the network (Node fetch,
// injectable for tests): the feed, then og:image of the article page for items without an image in the feed.
import { XMLParser } from 'fast-xml-parser';
import { CURADORIA, USER_AGENT } from './config.js';
import { decodificarEntidades, imagemValida, normalizarEspacos, normalizarUrl, primeiraImagemDoHtml, removerHtml } from './normalizar.js';

/** One feed entry, already cleaned; not yet tied to a category. */
export type ItemFeed = {
  titulo: string;
  resumo: string;
  url: string | null;
  imagemUrl: string | null;
  publicadoEmBruto: string | null;
  canal: string;
};

export type Buscar = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

type No = Record<string, unknown>;

// The parser counts every &lt;/&amp; it decodes against maxTotalExpansions (default 1000), and a feed with escaped
// HTML passes that (Agência Brasil did on 2026-11-04). The limit is lifted; DOCTYPE entities keep the default
// limits on count, size and expanded length.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: { enabled: true, maxTotalExpansions: Number.MAX_SAFE_INTEGER },
});

const lista = (valor: unknown): unknown[] => (valor == null ? [] : Array.isArray(valor) ? valor : [valor]);

/** Text of a node: a plain value, or the #text of an element that has attributes (Atom `<title type="html">`). */
function texto(valor: unknown): string {
  if (valor == null) return '';
  if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (Array.isArray(valor)) return texto(valor[0]);
  if (typeof valor === 'object') return texto((valor as No)['#text']);
  return '';
}

function urlHttp(valor: string): string | null {
  try {
    return /^https?:$/.test(new URL(valor).protocol) ? valor : null;
  } catch {
    return null;
  }
}

/** Article link: RSS `<link>` text, Atom `<link rel="alternate" href>` (or the first with href), else Atom `<id>`. */
function linkDoItem(item: No): string {
  const links = lista(item.link);
  const alternativo = links.find((l): l is No => !!l && typeof l === 'object' && !!(l as No).href && (!(l as No).rel || (l as No).rel === 'alternate'));
  if (alternativo) return String(alternativo.href);
  for (const link of links) {
    if (link && typeof link === 'object' && (link as No).href) return String((link as No).href);
    const valor = texto(link).trim();
    if (valor) return valor;
  }
  return texto(item.id).trim();
}

function urlDeImagem(valor: unknown, base: string): string {
  if (!valor) return '';
  if (typeof valor === 'string') return normalizarUrl(valor, base);
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const achada = urlDeImagem(item, base);
      if (achada) return achada;
    }
    return '';
  }
  if (typeof valor === 'object') {
    const no = valor as No;
    const direta = no.url ?? no.href ?? no.src;
    if (typeof direta === 'string') return normalizarUrl(direta, base);
    const conteudo = no['#text'] ?? no.content;
    if (typeof conteudo === 'string') return normalizarUrl(conteudo, base);
  }
  return '';
}

/** First valid image of the item: enclosure, media:*, thumbnail/image, then the first <img> of its HTML. */
export function imagemDoItem(item: No, urlArtigo: string): string {
  const candidatas = [
    () => urlDeImagem(item.enclosure, urlArtigo),
    () => urlDeImagem(item['media:content'], urlArtigo),
    () => urlDeImagem(item['media:thumbnail'], urlArtigo),
    () => urlDeImagem(item.thumbnail, urlArtigo),
    () => urlDeImagem(item.image, urlArtigo),
    () => primeiraImagemDoHtml(texto(item.description), urlArtigo),
    () => primeiraImagemDoHtml(texto(item.summary), urlArtigo),
    () => primeiraImagemDoHtml(texto(item['content:encoded']), urlArtigo),
    () => primeiraImagemDoHtml(texto(item.content), urlArtigo),
  ];
  for (const candidata of candidatas) {
    const url = candidata();
    if (imagemValida(url)) return url;
  }
  return '';
}

/** Entries of an RSS 2.0 or Atom document (at most `maxItensPorFonte`). Throws when it is neither. */
export function itensDoFeed(xml: string, urlFonte: string): ItemFeed[] {
  const documento = parser.parse(xml) as No;
  if (documento.rss === undefined && documento.feed === undefined) throw new Error('O conteúdo não é um feed RSS ou Atom.');
  const rss = documento.rss;
  const raiz = rss === undefined ? documento.feed : rss && typeof rss === 'object' ? (rss as No).channel : undefined;
  const canal: No = raiz && typeof raiz === 'object' ? (raiz as No) : {}; // an empty <channel/> or <feed/> has no items
  const itens = lista(canal.item ?? canal.entry).slice(0, CURADORIA.maxItensPorFonte) as No[];

  return itens.filter((item) => item && typeof item === 'object').map((item) => {
    const urlArtigo = normalizarUrl(decodificarEntidades(linkDoItem(item)), urlFonte);
    const resumoHtml = texto(item.description) || texto(item.summary) || texto(item['content:encoded']) || texto(item.content);
    return {
      titulo: normalizarEspacos(decodificarEntidades(texto(item.title))),
      // Tags out first, then entities: an escaped "&lt;p&gt;" inside an attribute must not become a tag.
      resumo: normalizarEspacos(decodificarEntidades(removerHtml(resumoHtml))),
      url: urlHttp(urlArtigo),
      imagemUrl: imagemDoItem(item, urlArtigo) || null,
      publicadoEmBruto: texto(item.pubDate) || texto(item.published) || texto(item.updated) || texto(item.isoDate) || texto(item['dc:date']) || null,
      canal: normalizarEspacos(decodificarEntidades(texto(canal.title))),
    };
  });
}

const cabecalhos = { 'user-agent': USER_AGENT };

/** og:image (or twitter:image / first <img>) of the article page; '' on any failure. */
export async function imagemDaPagina(urlArtigo: string, buscar: Buscar): Promise<string> {
  try {
    const resposta = await buscar(urlArtigo, { headers: cabecalhos, signal: AbortSignal.timeout(CURADORIA.tempoLimiteMs) });
    if (!resposta.ok) return '';
    const url = primeiraImagemDoHtml(await resposta.text(), urlArtigo);
    return imagemValida(url) ? url : '';
  } catch {
    return '';
  }
}

/** Downloads and reads a feed; items without an image in the feed get the og:image of their page, in parallel. */
export async function baixarFeed(urlFonte: string, buscar: Buscar = fetch as unknown as Buscar): Promise<ItemFeed[]> {
  const resposta = await buscar(urlFonte, { headers: cabecalhos, signal: AbortSignal.timeout(CURADORIA.tempoLimiteMs) });
  if (!resposta.ok) throw new Error(`O feed respondeu ${resposta.status}.`);
  const itens = itensDoFeed(await resposta.text(), urlFonte);
  return Promise.all(itens.map(async (item) => (
    item.imagemUrl || !item.url ? item : { ...item, imagemUrl: (await imagemDaPagina(item.url, buscar)) || null }
  )));
}
