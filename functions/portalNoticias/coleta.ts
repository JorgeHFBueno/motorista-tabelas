// One ingestion run: reads every feed (in parallel, each URL once), curates and saves category by category.
// No Firebase here: the store and the fetch are injected (funcoes.ts gives the real ones).
import { CATEGORIAS_EXTERNAS, FONTES, type CategoriaExterna } from './config.js';
import { curarCategoria, type ItemBruto } from './curadoria.js';
import { baixarFeed, type Buscar, type ItemFeed } from './rss.js';
import { salvarCategoria, type NoticiasStore, type ResultadoGravacao } from './salvar.js';

export type ResumoColeta = {
  /** Feeds read successfully (distinct URLs). */
  fontes: number;
  /** Entries read from the feeds, per category source. */
  lidas: number;
  /** Entries accepted by the curation (at most 5 per category). */
  aceitas: number;
  criadas: number;
  atualizadas: number;
  /** Accepted but not written: unchanged, or the document is in the trash. */
  ignoradas: number;
  /** External news moved to 'rascunho' by the limit of 5 published per category. */
  rebaixadas: number;
};

export type DetalheCategoria = ResultadoGravacao & {
  lidas: number;
  aceitas: number;
  descartes: Record<string, number>;
  falhas: { fonte: string; erro: string }[];
};

export async function executarColeta(
  store: NoticiasStore,
  { buscar, agora = new Date() }: { buscar?: Buscar; agora?: Date } = {},
): Promise<{ resumo: ResumoColeta; categorias: Record<CategoriaExterna, DetalheCategoria> }> {
  const feeds = new Map<string, Promise<ItemFeed[]>>();
  for (const fonte of CATEGORIAS_EXTERNAS.flatMap((c) => FONTES[c])) {
    if (!feeds.has(fonte.url)) {
      const leitura = baixarFeed(fonte.url, buscar);
      leitura.catch(() => undefined); // awaited below; avoids an unhandled rejection while other feeds are read
      feeds.set(fonte.url, leitura);
    }
  }

  const resumo: ResumoColeta = { fontes: 0, lidas: 0, aceitas: 0, criadas: 0, atualizadas: 0, ignoradas: 0, rebaixadas: 0 };
  const lidasComSucesso = new Set<string>();
  const categorias = {} as Record<CategoriaExterna, DetalheCategoria>;

  for (const categoria of CATEGORIAS_EXTERNAS) {
    const itens: ItemBruto[] = [];
    const falhas: DetalheCategoria['falhas'] = [];
    for (const fonte of FONTES[categoria]) {
      try {
        const lidos = await feeds.get(fonte.url)!;
        lidasComSucesso.add(fonte.url);
        itens.push(...lidos.map((item) => ({
          titulo: item.titulo,
          resumo: item.resumo,
          url: item.url,
          imagemUrl: item.imagemUrl,
          publicadoEmBruto: item.publicadoEmBruto,
          fonte: fonte.rotulo || item.canal || 'Fonte RSS',
          dicas: fonte.dicas,
          urlFonte: fonte.url,
        })));
      } catch (erro) {
        falhas.push({ fonte: fonte.rotulo, erro: erro instanceof Error ? erro.message : String(erro) });
      }
    }

    const { noticias, descartes } = curarCategoria(categoria, itens, agora);
    const gravacao = await salvarCategoria(store, categoria, noticias);
    categorias[categoria] = {
      lidas: itens.length,
      aceitas: noticias.length,
      descartes: descartes.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.motivo]: (acc[d.motivo] ?? 0) + 1 }), {}),
      falhas,
      ...gravacao,
    };
    resumo.lidas += itens.length;
    resumo.aceitas += noticias.length;
    resumo.criadas += gravacao.criadas;
    resumo.atualizadas += gravacao.atualizadas;
    resumo.ignoradas += gravacao.ignoradas;
    resumo.rebaixadas += gravacao.rebaixadas;
  }

  resumo.fontes = lidasComSucesso.size;
  return { resumo, categorias };
}
