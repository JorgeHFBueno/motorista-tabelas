// Migração da pasta CRM LEDUR do Friday para o Comercial (2026-11-23): tradução pura dos rótulos e valores do Friday
// para os campos de comercial-negocios e comercial-contatos (The Manuscript, 01_FIRESTORE/COLECOES/comercial.md).
import type { CategoriaContato, Etapa, MotivoPerda, Origem, Prioridade, Segmento, TipoContato, TipoNegocio } from '../../src/features/comercial/comercialDominio';

const chave = (t: string | null | undefined) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Segmento e tipo pelo nome do quadro; null = quadro fora da migração (Contatos e painéis são tratados à parte). */
export function quadroDoNegocio(nome: string): { segmento: Segmento; tipo: TipoNegocio } | null {
  const n = chave(nome);
  const segmento: Segmento | null = n.includes('publico') ? 'publico' : n.includes('privado') ? 'privado' : null;
  if (!segmento) return null;
  if (n.startsWith('negocios')) return { segmento, tipo: 'negocio' };
  if (n.startsWith('projetos')) return { segmento, tipo: 'projeto' };
  return null;
}

const ETAPAS: Record<string, Etapa> = {
  lead: 'lead',
  'qualificacao da oportunidade': 'qualificacao',
  'contato feito': 'contato_feito',
  'projeto basico': 'projeto_basico',
  'projeto basico pontes': 'projeto_basico',
  orcamentacao: 'orcamentacao',
  apresentacao: 'apresentacao',
  'proposta enviada': 'proposta_enviada',
  licitado: 'licitado',
  ganho: 'ganho',
  'encerrado - conquistado': 'ganho',
  perdido: 'perdido',
  'pos-venda': 'pos_venda',
};

/** Etapa pela coluna "Etapa"; sem ela, pelo grupo do item (os dois batem em todos os itens com Etapa); senão, Lead. */
export function etapaDoItem(rotuloEtapa: string | null, nomeGrupo: string | null, segmento: Segmento): { etapa: Etapa; fonte: 'etapa' | 'grupo' | 'padrao' } {
  const porEtapa = ETAPAS[chave(rotuloEtapa)];
  const porGrupo = ETAPAS[chave(nomeGrupo)];
  const corrigir = (e: Etapa) => (segmento === 'privado' && e === 'licitado' ? 'proposta_enviada' : e);
  if (porEtapa) return { etapa: corrigir(porEtapa), fonte: 'etapa' };
  if (porGrupo) return { etapa: corrigir(porGrupo), fonte: 'grupo' };
  return { etapa: 'lead', fonte: 'padrao' };
}

const PRIORIDADES: Record<string, Prioridade> = { critico: 'critico', 'muito alta': 'muito_alta', alta: 'alta', media: 'media', baixa: 'baixa' };
export const prioridadeDe = (rotulo: string | null) => PRIORIDADES[chave(rotulo)] ?? null;

// "Em andamento", "Feito" e "Parado" são os rótulos padrão de uma coluna de status nova: não dizem a origem.
const ORIGENS: Record<string, Origem> = {
  instagram: 'instagram',
  google: 'google',
  indicacao: 'indicacao',
  'indicacao/pessoa': 'indicacao',
  cliente: 'cliente',
  feiras: 'feiras',
  'feiras/evento': 'feiras',
  outros: 'outros',
  'obra ja executada': 'obra_executada',
  'proj. terceiros': 'projeto_terceiros',
  'internet/site': 'site',
  'redes sociais': 'redes_sociais',
  'visita presencial': 'visita',
  'malas direta': 'mala_direta',
  'mala direta': 'mala_direta',
};
export const origemDe = (rotulo: string | null) => ORIGENS[chave(rotulo)] ?? null;

const MOTIVOS: Record<string, MotivoPerda> = {
  'demora no follow': 'demora_follow',
  'optou por nao executar os servicos': 'nao_executou',
  'fechou com outra empresa': 'outra_empresa',
  'nao gostou do produto': 'produto',
  preco: 'preco',
  outros: 'outros',
};
export const motivoDe = (rotulo: string | null) => MOTIVOS[chave(rotulo)] ?? null;

const TIPOS_CONTATO: Record<string, TipoContato> = { 'lead qualificado': 'lead_qualificado', cliente: 'cliente', parceiro: 'parceiro', fornecedor: 'fornecedor' };
export const tipoContatoDe = (rotulo: string | null) => TIPOS_CONTATO[chave(rotulo)] ?? null;

export function categoriaContatoDe(nomeGrupo: string | null): CategoriaContato | null {
  const g = chave(nomeGrupo);
  if (g.includes('montador') || g.includes('monntador')) return 'montador';
  if (g.includes('particular')) return 'particular';
  return null;
}

/** Cargo: a lista "Titulo" (FUNCIONARIO, CIO, CEO, Engenheiro) e o texto "Título", sem repetir. */
export function cargoDe(lista: string[], texto: string | null): string | null {
  const partes = [...lista, texto ?? ''].map((t) => t.trim()).filter(Boolean)
    .map((t) => (t === t.toUpperCase() && t.length > 3 ? t.charAt(0) + t.slice(1).toLowerCase() : t));
  return [...new Set(partes)].join(', ') || null;
}

/** Número de uma coluna do Friday (com config.x10, inteiro ×10); vazio, negativo ou inválido = null. */
export function numeroDe(valor: unknown, x10 = false): number | null {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() ? Number(valor.replace(',', '.')) : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return x10 ? n / 10 : n;
}

export const dataDe = (valor: unknown) => (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null);

/** "AAAA-MM-DD hh:mm:ss" (hora local de Brasília, como o Friday grava) → instante UTC; outro formato = null. */
export function instanteDe(local: unknown): Date | null {
  if (typeof local !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(local);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 3, +m[5], +(m[6] ?? 0)));
}

/** @{uid} das menções do Friday vira @Nome (ou @alguém, se o UID não for de um funcionário). */
export const textoComMencoes = (texto: string, nomes: Record<string, string>) =>
  texto.replace(/@\{([^}]+)\}/g, (_m, uid: string) => `@${nomes[uid] ?? 'alguém'}`);

/** Ids estáveis: rodar de novo encontra os mesmos documentos (e a gravação recusa duplicar). */
export const idNegocio = (itemId: number | string) => `fd-${itemId}`;
export const idContato = (itemId: number | string) => `fd-${itemId}`;
export const idAtualizacao = (atualizacaoId: number | string) => `fd-${atualizacaoId}`;
