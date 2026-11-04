// Curation of the external news: cleanup, intra-batch dedupe, keyword scoring per category, classification
// (ambiguity and better fit elsewhere are rejected) and the pick of at most 5 per category with source diversity.
// Pure. Ported from portal/functions/src/news/curation/curateNews.js.
import { CATEGORIAS_EXTERNAS, CURADORIA, type CategoriaExterna } from './config.js';
import { hashDedupe, normalizarEspacos, normalizarTitulo, normalizarUrl, similaridadeJaccard } from './normalizar.js';

/** A feed entry tied to the category of the source it was read for. */
export type ItemBruto = {
  titulo: string;
  resumo: string;
  url: string | null;
  imagemUrl: string | null;
  publicadoEmBruto: string | null;
  fonte: string;
  dicas: string[];
  urlFonte: string;
};

/** Accepted news, ready to be saved (fields of portal-noticias filled by the ingestion). */
export type NoticiaCurada = {
  titulo: string;
  resumo: string;
  url: string | null;
  imagemUrl: string | null;
  categoria: CategoriaExterna;
  fonte: string;
  publicadoEm: Date;
  tags: string[];
  hashDedupe: string;
  relevanciaScore: number;
};

export type Descarte = { motivo: string; titulo?: string; pontuacao?: number; melhorCategoria?: CategoriaExterna };

export type Pontuacao = {
  pontuacao: number;
  exigidaPresente: boolean;
  contextoPresente: boolean;
  exigidas: number;
  contextos: number;
  tags: string[];
};

export function dataDePublicacao(bruta: string | null, agora: Date): Date {
  if (!bruta) return agora;
  const data = new Date(bruta);
  return Number.isNaN(data.getTime()) ? agora : data;
}

function ocorrencias(textoNormalizado: string, palavraChave: string): number {
  if (!textoNormalizado || !palavraChave) return 0;
  const escapada = palavraChave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(textoNormalizado.matchAll(new RegExp(`(^|\\b)${escapada}(\\b|$)`, 'g'))).length;
}

const somar = (texto: string, palavras: string[], peso: number) =>
  palavras.reduce((total, palavra) => total + ocorrencias(texto, normalizarTitulo(palavra)) * peso, 0);

const distintas = (texto: string, palavras: string[] | undefined) =>
  !texto || !palavras?.length ? 0 : palavras.filter((palavra) => texto.includes(normalizarTitulo(palavra))).length;

export function pontuarCategoria(categoria: CategoriaExterna, item: Pick<ItemBruto, 'titulo' | 'resumo' | 'fonte' | 'dicas' | 'imagemUrl'>): Pontuacao {
  const regras = CURADORIA.pontuacao[categoria];
  const titulo = normalizarTitulo(item.titulo);
  const resumo = normalizarTitulo(item.resumo);
  const fonte = normalizarTitulo(item.fonte);
  const dicas = normalizarTitulo((item.dicas ?? []).join(' '));
  const editorial = [titulo, resumo, fonte].filter(Boolean).join(' ');
  const completo = [editorial, dicas].filter(Boolean).join(' ');

  const positiva = somar(titulo, regras.positivas, 4) + somar(resumo, regras.positivas, 2) + somar(fonte, regras.positivas, 1) + somar(dicas, regras.positivas, 2);
  const negativa = somar(titulo, regras.negativas, 5) + somar(resumo, regras.negativas, 3) + somar(completo, regras.negativas, 1);
  const exigidas = distintas(editorial, regras.exigeAlguma);
  const contextos = distintas(editorial, regras.contexto);
  const exigidaPresente = exigidas > 0;
  const contextoPresente = !regras.contexto || contextos > 0;

  return {
    pontuacao: positiva - negativa + (item.imagemUrl ? 1 : 0) + exigidas * 2 + Math.min(contextos, 3) - (exigidaPresente ? 0 : 6) - (contextoPresente ? 0 : 6),
    exigidaPresente,
    contextoPresente,
    exigidas,
    contextos,
    tags: [...new Set(regras.positivas.filter((palavra) => editorial.includes(normalizarTitulo(palavra))))].slice(0, CURADORIA.maxTags),
  };
}

/** Best category of the item, or null when none reaches its minimum or the runner-up is too close (ambiguous). */
export function classificar(item: Parameters<typeof pontuarCategoria>[1]): { categoria: CategoriaExterna | null; melhor: Pontuacao & { categoria: CategoriaExterna } } {
  const ranking = CATEGORIAS_EXTERNAS
    .map((categoria) => ({ categoria, ...pontuarCategoria(categoria, item) }))
    .sort((a, b) => (b.pontuacao !== a.pontuacao ? b.pontuacao - a.pontuacao : b.exigidas - a.exigidas));
  const [melhor, segundo] = ranking;
  if (!melhor.exigidaPresente || !melhor.contextoPresente || melhor.pontuacao < CURADORIA.pontuacaoMinima[melhor.categoria]) {
    return { categoria: null, melhor };
  }
  if (segundo && melhor.pontuacao - segundo.pontuacao < CURADORIA.vantagemMinima && segundo.pontuacao >= CURADORIA.pontuacaoMinima[segundo.categoria]) {
    return { categoria: null, melhor };
  }
  return { categoria: melhor.categoria, melhor };
}

/** At most `maxPorCategoria`, by score; each item already picked from a source lowers that source's next ones. */
export function escolherComDiversidade(candidatas: NoticiaCurada[]): NoticiaCurada[] {
  const escolhidas: NoticiaCurada[] = [];
  const pendentes = [...candidatas];
  const porFonte = new Map<string, number>();
  while (pendentes.length > 0 && escolhidas.length < CURADORIA.maxPorCategoria) {
    const efetiva = (n: NoticiaCurada) => n.relevanciaScore - (porFonte.get(n.fonte) ?? 0) * CURADORIA.penalidadeMesmaFonte;
    pendentes.sort((a, b) => (efetiva(b) - efetiva(a)) || (b.relevanciaScore - a.relevanciaScore) || (b.publicadoEm.getTime() - a.publicadoEm.getTime()));
    const proxima = pendentes.shift()!;
    escolhidas.push(proxima);
    porFonte.set(proxima.fonte, (porFonte.get(proxima.fonte) ?? 0) + 1);
  }
  return escolhidas;
}

export function curarCategoria(categoria: CategoriaExterna, itens: ItemBruto[], agora: Date = new Date()): { noticias: NoticiaCurada[]; descartes: Descarte[] } {
  const urls = new Set<string>();
  const hashes = new Set<string>();
  const candidatas: NoticiaCurada[] = [];
  const descartes: Descarte[] = [];

  for (const item of itens) {
    const titulo = normalizarEspacos(item.titulo);
    const resumo = normalizarEspacos(item.resumo).slice(0, CURADORIA.maxResumo);
    if (!titulo) {
      descartes.push({ motivo: 'sem_titulo' });
      continue;
    }
    if (resumo.length < CURADORIA.minResumo) {
      descartes.push({ motivo: 'resumo_curto', titulo });
      continue;
    }

    const url = item.url ? normalizarUrl(item.url, item.urlFonte) : '';
    const hash = hashDedupe(categoria, url, titulo);
    if (url && urls.has(url)) {
      descartes.push({ motivo: 'url_repetida', titulo });
      continue;
    }
    if (hashes.has(hash)) {
      descartes.push({ motivo: 'hash_repetido', titulo });
      continue;
    }
    if (candidatas.some((outra) => similaridadeJaccard(outra.titulo, titulo) >= CURADORIA.similaridadeTitulo)) {
      descartes.push({ motivo: 'titulo_parecido', titulo });
      continue;
    }

    const pontos = pontuarCategoria(categoria, item);
    const classe = classificar(item);
    if (!classe.categoria) {
      descartes.push({ motivo: 'sem_categoria', titulo, pontuacao: pontos.pontuacao });
      continue;
    }
    if (classe.categoria !== categoria) {
      descartes.push({ motivo: 'melhor_em_outra_categoria', titulo, pontuacao: pontos.pontuacao, melhorCategoria: classe.categoria });
      continue;
    }
    if (pontos.pontuacao < CURADORIA.pontuacaoMinima[categoria]) {
      descartes.push({ motivo: 'pontuacao_baixa', titulo, pontuacao: pontos.pontuacao });
      continue;
    }

    candidatas.push({
      titulo,
      resumo,
      url: url || null,
      imagemUrl: item.imagemUrl || null,
      categoria,
      fonte: item.fonte || CURADORIA.fontePadrao,
      publicadoEm: dataDePublicacao(item.publicadoEmBruto, agora),
      tags: pontos.tags,
      hashDedupe: hash,
      relevanciaScore: pontos.pontuacao,
    });
    if (url) urls.add(url);
    hashes.add(hash);
  }

  return { noticias: escolherComDiversidade(candidatas), descartes };
}
