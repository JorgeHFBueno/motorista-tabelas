import { telaDaRota } from '../uso-web/usoWebCore';

// Aprovar página (2026-11-26, pedido do responsável): no cabeçalho das telas do /erp, o financeiro aprova ou não cada
// página, uma a uma; página aprovada é a que pode ganhar a gravação dos dados. Sem aprovar, a descrição diz o que falta.
// Uma decisão por página em erp-aprovacoes (aprovacoes.ts). The Manuscript, 01_FIRESTORE/COLECOES/erp-aprovacoes.md.

export type SituacaoAprovacao = 'aprovada' | 'reprovada';
/** Imagem da decisão (o rabisco do Canvas ou um print), em erp/aprovacoes/{id da página}/ no Storage. */
export type ImagemAprovacao = { path: string; url: string; bytes: number };
export type AprovacaoPagina = {
  pagina: string;
  titulo: string;
  situacao: SituacaoAprovacao;
  descricao: string | null;
  decididoPor: { uid: string; nome: string } | null;
  decididoEm: Date | null;
  imagens: ImagemAprovacao[];
};

export const LIMITE_DESCRICAO = 2000;
export const LIMITE_IMAGENS = 20;
export const LIMITE_IMAGEM = 10 * 1024 * 1024;

/**
 * A página do ERP de um caminho, no padrão da rota do Uso do sistema ('/erp/pessoas/1021' e '/erp/pessoas/novo' →
 * 'erp/pessoas/:codigo'); cada relatório é uma página ('erp/estoques/relatorios/giro'). null fora do /erp.
 */
export function paginaErp(pathname: string): string | null {
  const rota = telaDaRota(pathname);
  if (!rota || (rota !== 'erp' && !rota.startsWith('erp/'))) return null;
  const partes = pathname.split('/').filter(Boolean);
  const pagina = rota.split('/').map((p, i) => (p === ':relatorio' ? partes[i] : p));
  return pagina.every((p) => /^:?[a-z0-9-]+$/.test(p)) ? pagina.join('/') : null;
}

/** Id do documento: a página com pontos no lugar das barras ('erp.pessoas.:codigo'). */
export const idDaPagina = (pagina: string) => pagina.replace(/\//g, '.');

/** Confere a decisão antes de gravar: sem aprovar, a descrição é obrigatória. Devolve o problema ou null. */
export function problemaDaDecisao(situacao: SituacaoAprovacao | '', descricao: string, imagens: Array<{ bytes: number }> = []): string | null {
  if (!situacao) return 'Escolha se aprova ou não a página.';
  if (situacao === 'reprovada' && !descricao.trim()) return 'Descreva o que falta ou está errado na página.';
  if (descricao.trim().length > LIMITE_DESCRICAO) return `A descrição passa de ${LIMITE_DESCRICAO} caracteres.`;
  if (imagens.length > LIMITE_IMAGENS) return `São no máximo ${LIMITE_IMAGENS} imagens por página.`;
  if (imagens.some((i) => i.bytes > LIMITE_IMAGEM)) return 'Cada imagem pode ter até 10 MB.';
  return null;
}
