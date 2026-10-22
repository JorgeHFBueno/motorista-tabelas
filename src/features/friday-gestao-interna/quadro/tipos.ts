import {
  AlignLeft, Calendar, CalendarRange, CheckSquare, CircleDot, Hash, Link2, List, Mail, Paperclip, Phone, Sigma, Star, Text, UserRound, Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { Row } from '../api.ts';
import { calcular, textoResultado } from './formula.ts';

// concluido: o rótulo conta como "feito" (Meu trabalho, atrasos, cronograma com ✓, filtro de concluídos).
export type Rotulo = { id: string; texto: string; cor: string; concluido?: boolean };
export type Coluna = Row & { quadro_id: number; titulo: string; tipo: TipoColuna; config: Record<string, any>; largura: number; posicao: number; oculta: number };
export type Grupo = Row & { quadro_id: number; nome: string; cor: string; posicao: number; recolhido: number };
export type Item = Row & { quadro_id: number; grupo_id: number; item_pai_id: number | null; nome: string; posicao: number; valores: Record<string, any>; n_atualizacoes?: number; n_subitens?: number; n_anexos?: number };
export type Ordenacao = { colunaId: number; dir: 1 | -1 } | null;
export type Agrupar = { coluna_id: number; ordem: 1 | -1; vazios: boolean };
// O que fica salvo em cada visão: filtros, pessoa, ordem, agrupamento e colunas ocultas.
export type EstadoVisao = { filtros: Record<string, string[]>; pessoa: string | null; ordenacao: Ordenacao; agrupar: Agrupar | null; ocultas: number[] };
export type Visao = Row & { quadro_id: number; nome: string; tipo: 'tabela' | 'kanban' | 'calendario' | 'cronograma'; config: { coluna_id?: number } & Partial<EstadoVisao> };
// nome_item: como chamar os subitens (ex.: "Escopo da obra"); editável no cabeçalho da tabela de subitens.
export type Sub = { quadro_id: number; grupo_id: number | null; nome_item?: string; colunas: Coluna[]; itens: Item[] };

export type TipoColuna = 'status' | 'texto' | 'texto_longo' | 'numero' | 'pessoa' | 'data' | 'periodo' | 'lista' | 'telefone' | 'email' | 'link' | 'caixa' | 'avaliacao' | 'ligacao' | 'formula' | 'arquivos';

// Catálogo de tipos de coluna. "grupo" organiza o menu de adicionar coluna.
export const TIPOS: { tipo: TipoColuna; rotulo: string; icone: LucideIcon; cor: string; descricao: string; grupo: 'essencial' | 'util'; busca?: string }[] = [
  { tipo: 'status', rotulo: 'Status', icone: CircleDot, cor: '#00a36c', descricao: 'Rótulos coloridos', grupo: 'essencial', busca: 'situação etapa andamento' },
  { tipo: 'lista', rotulo: 'Lista suspensa', icone: List, cor: '#0086c0', descricao: 'Uma ou mais opções', grupo: 'essencial', busca: 'dropdown opções tags etiquetas' },
  { tipo: 'texto', rotulo: 'Texto', icone: Text, cor: '#ffcb00', descricao: 'Texto curto', grupo: 'essencial' },
  { tipo: 'data', rotulo: 'Data', icone: Calendar, cor: '#a25ddc', descricao: 'Um dia', grupo: 'essencial', busca: 'prazo vencimento dia' },
  { tipo: 'pessoa', rotulo: 'Pessoa', icone: UserRound, cor: '#579bfc', descricao: 'Responsáveis', grupo: 'essencial', busca: 'responsável dono pessoas equipe' },
  { tipo: 'numero', rotulo: 'Números', icone: Hash, cor: '#fdab3d', descricao: 'Valores, quantidades, R$', grupo: 'essencial', busca: 'valor dinheiro quantidade horas km' },
  { tipo: 'arquivos', rotulo: 'Arquivos', icone: Paperclip, cor: '#ff642e', descricao: 'Documentos e fotos', grupo: 'util', busca: 'anexo documento pdf foto imagem contrato art' },
  { tipo: 'periodo', rotulo: 'Período', icone: CalendarRange, cor: '#784bd1', descricao: 'Início e fim (cronograma)', grupo: 'util', busca: 'timeline cronograma gantt início fim' },
  { tipo: 'caixa', rotulo: 'Caixa de seleção', icone: CheckSquare, cor: '#037f4c', descricao: 'Marcar / desmarcar', grupo: 'util', busca: 'checkbox feito check' },
  { tipo: 'ligacao', rotulo: 'Conectar quadros', icone: Workflow, cor: '#bb3354', descricao: 'Itens de outro quadro', grupo: 'util', busca: 'relação ligação vínculo' },
  { tipo: 'formula', rotulo: 'Fórmula', icone: Sigma, cor: '#2f9e8f', descricao: 'Cálculos como no Excel', grupo: 'util', busca: 'cálculo excel conta if soma' },
  { tipo: 'texto_longo', rotulo: 'Texto longo', icone: AlignLeft, cor: '#cab641', descricao: 'Anotações', grupo: 'util', busca: 'observação descrição notas' },
  { tipo: 'avaliacao', rotulo: 'Avaliação', icone: Star, cor: '#ff642e', descricao: 'Estrelas', grupo: 'util', busca: 'nota rating estrela' },
  { tipo: 'telefone', rotulo: 'Telefone', icone: Phone, cor: '#66ccff', descricao: 'Número de telefone', grupo: 'util', busca: 'celular whatsapp contato' },
  { tipo: 'email', rotulo: 'E-mail', icone: Mail, cor: '#ff158a', descricao: 'Endereço de e-mail', grupo: 'util' },
  { tipo: 'link', rotulo: 'Link', icone: Link2, cor: '#579bfc', descricao: 'Endereço web', grupo: 'util', busca: 'url site pasta servidor' },
];
export const infoTipo = (t: string) => TIPOS.find(x => x.tipo === t) ?? TIPOS[2];

export const rotuloDe = (c: Coluna, v: unknown): Rotulo | undefined =>
  (c.config.rotulos as Rotulo[] | undefined)?.find(r => r.id === String(v ?? '0')) ?? (c.config.rotulos as Rotulo[] | undefined)?.find(r => r.id === '0');

// Coluna de status "principal": a primeira que tem rótulo de concluído (evita Prioridade, Tipo etc.).
export function statusPrincipal(colunas: Coluna[]): Coluna | undefined {
  const sts = colunas.filter(c => c.tipo === 'status');
  return sts.find(c => ((c.config.rotulos ?? []) as Rotulo[]).some(r => r.concluido)) ?? sts[0];
}
export function itemConcluido(item: Item, colunas: Coluna[]): boolean {
  const c = statusPrincipal(colunas);
  return !!c && !!rotuloDe(c, item.valores[c.id])?.concluido;
}

// Coluna de data que é prazo: só ela mostra atraso. Sem configuração, colunas de início ("Início", "Data de início",
// "Abertura"…) não são prazo. config.prazo (true/false) define pelo menu da coluna. (Mesma regra no servidor.)
const TITULO_INICIO = /in[ií]cio|abertura|come[cç]o|\bstart|admiss|entrada/i;
export const ehPrazo = (c: Coluna) => (c.config.prazo ?? !TITULO_INICIO.test(c.titulo)) as boolean;

// Texto de um valor para busca e ordenação.
export function textoDoValor(c: Coluna, v: any, nomeUsuario: (id: unknown) => string): string {
  if (v == null) return '';
  switch (c.tipo) {
    case 'status': return rotuloDe(c, v)?.texto ?? '';
    case 'pessoa': return (v as unknown[]).map(nomeUsuario).join(', ');
    case 'lista': return (v as string[]).map(id => (c.config.opcoes as Rotulo[] | undefined)?.find(o => o.id === id)?.texto ?? '').join(', ');
    case 'periodo': return `${v.inicio ?? ''} ${v.fim ?? ''}`;
    case 'link': return typeof v === 'string' ? v : v.texto || v.url || '';
    case 'caixa': return v ? '1' : '';
    case 'arquivos': return (v as { nome: string }[]).map(a => a.nome).join(', ');
    default: return String(v);
  }
}

// Texto de uma célula (fórmulas são calculadas com as outras colunas do item).
export function textoCelula(c: Coluna, item: Item, colunas: Coluna[], nomeUsuario: (id: unknown) => string): string {
  if (c.tipo !== 'formula') return textoDoValor(c, item.valores[c.id], nomeUsuario);
  const r = calcular(c, item, { colunas, nomeUsuario });
  return r.erro ? '' : textoResultado(r.valor);
}

// Valor comparável para ordenação.
export function chaveCelula(c: Coluna, item: Item, colunas: Coluna[], nomeUsuario: (id: unknown) => string): string | number {
  if (c.tipo === 'formula') {
    const r = calcular(c, item, { colunas, nomeUsuario });
    if (r.erro || r.valor === '') return '';
    return typeof r.valor === 'number' ? r.valor : String(r.valor).toLowerCase();
  }
  const v = item.valores[c.id];
  if (v == null || v === '') return '';
  if (c.tipo === 'numero' || c.tipo === 'avaliacao') return Number(v);
  if (c.tipo === 'status') return (c.config.rotulos as Rotulo[]).findIndex(r => r.id === String(v));
  if (c.tipo === 'periodo') return v.inicio ?? '';
  return textoDoValor(c, v, nomeUsuario).toLowerCase();
}

export const vazio = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
