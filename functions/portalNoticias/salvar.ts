// Saving the curated external news of one category into portal-noticias. Pure: Firestore is behind `NoticiasStore`.
// Rules (Manuscript portal.md, portal-noticias): only origem 'externa' is read and written; a document in the trash
// (excluidoEm != null) is never updated nor brought back; an update never changes status, categoria, destaque or the
// trash; the visibility limit only moves to 'rascunho' external 'publicada' documents that are not in the trash.
import { CURADORIA, type CategoriaExterna } from './config.js';
import type { NoticiaCurada } from './curadoria.js';
import { similaridadeJaccard } from './normalizar.js';

/** An external document already in portal-noticias (timestamps converted to Date by the store). */
export type NoticiaExistente = {
  id: string;
  titulo: string;
  resumo: string;
  url: string | null;
  imagemUrl: string | null;
  fonte: string;
  tags: string[];
  hashDedupe: string | null;
  relevanciaScore: number | null;
  publicadoEm: Date | null;
  status: unknown;
  excluidoEm: unknown;
  /** Fields the client queries depend on that are missing from the document. */
  semExcluidoEm: boolean;
  semStatus: boolean;
};

export type CamposAtualizados = Pick<NoticiaCurada, 'titulo' | 'resumo' | 'url' | 'imagemUrl' | 'fonte' | 'tags' | 'hashDedupe' | 'relevanciaScore' | 'publicadoEm'>
  & { excluidoEm?: null; excluidoPor?: null; status?: 'publicada' };

/** New document, without criadoEm/atualizadoEm (the store writes the server time). */
export type NoticiaNova = NoticiaCurada & {
  conteudo: null;
  imagem: null;
  origem: 'externa';
  status: 'publicada';
  destaque: false;
  criadoPor: null;
  excluidoEm: null;
  excluidoPor: null;
};

export interface NoticiasStore {
  /** Every document of the category with origem 'externa', in the trash or not. */
  externasDaCategoria(categoria: CategoriaExterna): Promise<NoticiaExistente[]>;
  /** Creates the document and returns its id. */
  criar(dados: NoticiaNova): Promise<string>;
  atualizar(id: string, dados: CamposAtualizados): Promise<void>;
  /** status 'rascunho'. */
  rebaixar(ids: string[]): Promise<void>;
}

export type ResultadoGravacao = { criadas: number; atualizadas: number; ignoradas: number; rebaixadas: number };

const naLixeira = (n: Pick<NoticiaExistente, 'excluidoEm'>) => n.excluidoEm != null;
const tempo = (data: Date | null) => data?.getTime() ?? 0;
const mesmasTags = (a: string[], b: string[]) => a.length === b.length && a.every((tag, i) => tag === b[i]);

/** Existing document of the same news: by hash, then by URL, then by a title at least 90% similar (newest first). */
export function encontrarExistente(existentes: NoticiaExistente[], noticia: NoticiaCurada): NoticiaExistente | null {
  return existentes.find((e) => e.hashDedupe === noticia.hashDedupe)
    ?? (noticia.url ? existentes.find((e) => e.url === noticia.url) : undefined)
    ?? [...existentes].sort((a, b) => tempo(b.publicadoEm) - tempo(a.publicadoEm))
      .find((e) => similaridadeJaccard(e.titulo, noticia.titulo) >= CURADORIA.similaridadeTitulo)
    ?? null;
}

export function mudouAlgo(existente: NoticiaExistente, noticia: NoticiaCurada): boolean {
  return existente.titulo !== noticia.titulo
    || existente.resumo !== noticia.resumo
    || (existente.url ?? null) !== noticia.url
    || (existente.imagemUrl ?? null) !== noticia.imagemUrl
    || existente.fonte !== noticia.fonte
    || existente.hashDedupe !== noticia.hashDedupe
    || existente.relevanciaScore !== noticia.relevanciaScore
    || tempo(existente.publicadoEm) !== noticia.publicadoEm.getTime()
    || !mesmasTags(existente.tags, noticia.tags)
    || existente.semExcluidoEm
    || existente.semStatus;
}

/** External 'publicada' documents outside the trash beyond the newest `max` (by publicadoEm). */
export function alemDoLimite(existentes: NoticiaExistente[], max: number = CURADORIA.maxPorCategoria): NoticiaExistente[] {
  return existentes
    .filter((e) => e.status === 'publicada' && !naLixeira(e))
    .sort((a, b) => tempo(b.publicadoEm) - tempo(a.publicadoEm))
    .slice(max);
}

export function novaNoticia(noticia: NoticiaCurada): NoticiaNova {
  return {
    ...noticia,
    conteudo: null,
    imagem: null,
    origem: 'externa',
    status: 'publicada',
    destaque: false,
    criadoPor: null,
    excluidoEm: null,
    excluidoPor: null,
  };
}

export async function salvarCategoria(store: NoticiasStore, categoria: CategoriaExterna, noticias: NoticiaCurada[]): Promise<ResultadoGravacao> {
  const resultado: ResultadoGravacao = { criadas: 0, atualizadas: 0, ignoradas: 0, rebaixadas: 0 };
  if (!noticias.length) return resultado;
  const existentes = await store.externasDaCategoria(categoria);

  for (const noticia of noticias) {
    const existente = encontrarExistente(existentes, noticia);
    if (!existente) {
      const nova = novaNoticia(noticia);
      const id = await store.criar(nova);
      existentes.push({ ...nova, id, semExcluidoEm: false, semStatus: false });
      resultado.criadas += 1;
      continue;
    }
    if (naLixeira(existente) || !mudouAlgo(existente, noticia)) {
      resultado.ignoradas += 1;
      continue;
    }
    const campos: CamposAtualizados = {
      titulo: noticia.titulo,
      resumo: noticia.resumo,
      url: noticia.url,
      imagemUrl: noticia.imagemUrl,
      fonte: noticia.fonte,
      tags: noticia.tags,
      hashDedupe: noticia.hashDedupe,
      relevanciaScore: noticia.relevanciaScore,
      publicadoEm: noticia.publicadoEm,
      // Client queries filter on excluidoEm and status: fill them only when missing, never change them.
      ...(existente.semExcluidoEm ? { excluidoEm: null, excluidoPor: null } : {}),
      ...(existente.semStatus ? { status: 'publicada' as const } : {}),
    };
    await store.atualizar(existente.id, campos);
    Object.assign(existente, campos, { semExcluidoEm: false, semStatus: false });
    resultado.atualizadas += 1;
  }

  const excedentes = alemDoLimite(existentes);
  if (excedentes.length) {
    await store.rebaixar(excedentes.map((e) => e.id));
    for (const e of excedentes) e.status = 'rascunho';
    resultado.rebaixadas = excedentes.length;
  }
  return resultado;
}
