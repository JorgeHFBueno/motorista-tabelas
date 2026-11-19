// Listas fixas da Revisão, iguais às da Manutenção do app Flutter (lib/features/checklist/manutencao/models/
// manutencao_listas.dart). Os ids são gravados em `manutencoes-v2` (The Manuscript, 01_FIRESTORE/COLECOES/
// manutencoes-v2.md): não mudar um id existente; o título pode ser corrigido.

export type Opcao<T extends string> = { id: T; titulo: string };

export type RevisaoTipo = 'preventiva' | 'corretiva';
export const TIPOS: readonly Opcao<RevisaoTipo>[] = [
  { id: 'preventiva', titulo: 'Preventiva' },
  { id: 'corretiva', titulo: 'Corretiva' },
];

export type CategoriaId =
  | 'motor' | 'oleo_filtros' | 'arrefecimento' | 'cambio_transmissao' | 'embreagem' | 'freios' | 'suspensao_direcao'
  | 'pneus' | 'eletrica' | 'hidraulico' | 'cabine_carroceria' | 'guincho_implemento' | 'outros';

/** Categoria do item, com as sugestões de peça/serviço tiradas do caderno do mecânico. */
export const CATEGORIAS: readonly (Opcao<CategoriaId> & { sugestoes: readonly string[] })[] = [
  { id: 'motor', titulo: 'Motor', sugestoes: ['correia', 'junta', 'turbina', 'bico injetor'] },
  { id: 'oleo_filtros', titulo: 'Óleo/Filtros', sugestoes: ['óleo do motor', 'filtro de óleo', 'filtro de ar', 'filtro de combustível', 'filtro secador'] },
  { id: 'arrefecimento', titulo: 'Arrefecimento', sugestoes: ["bomba d'água", 'aditivo', 'radiador', 'intercooler', 'mangueira'] },
  { id: 'cambio_transmissao', titulo: 'Câmbio/Transmissão', sugestoes: ['óleo do câmbio', 'válvula da caixa', 'válvula seletora de marcha', 'reparo de válvulas da caixa'] },
  { id: 'embreagem', titulo: 'Embreagem', sugestoes: ['servo de embreagem', 'atuador de embreagem', 'disco de embreagem'] },
  {
    id: 'freios',
    titulo: 'Freios',
    sugestoes: ['lona de freio', 'tambor de freio', 'catraca de freio', 'flexível de freio', 'válvula do pedal de freio', 'válvula de distribuição', 'disco de freio', 'pastilha'],
  },
  { id: 'suspensao_direcao', titulo: 'Suspensão/Direção', sugestoes: ['ponteira da barra curta', 'terminal de direção', 'geometria', 'mola', 'amortecedor'] },
  { id: 'pneus', titulo: 'Pneus', sugestoes: ['pneu', 'pneu recapado', 'rodízio'] },
  { id: 'eletrica', titulo: 'Elétrica', sugestoes: ['sensor ABS', 'bateria', 'lâmpada', 'alternador', 'motor de partida'] },
  { id: 'hidraulico', titulo: 'Hidráulico', sugestoes: ['bomba do hidráulico', 'óleo do reservatório hidráulico', 'mangueira do hidráulico', 'reparo do pistão hidráulico'] },
  { id: 'cabine_carroceria', titulo: 'Cabine/Carroceria', sugestoes: ['para-brisa', 'capa do banco', 'escada', 'limpeza da cabine'] },
  { id: 'guincho_implemento', titulo: 'Guincho/Implemento', sugestoes: ['cabo de aço', 'pistão da caçamba'] },
  { id: 'outros', titulo: 'Outros', sugestoes: [] },
];

export type AcaoId = 'trocado' | 'colocado' | 'retirado' | 'consertado' | 'regulado' | 'lubrificado' | 'limpo' | 'revisado';
export const ACOES: readonly Opcao<AcaoId>[] = [
  { id: 'trocado', titulo: 'Trocado' },
  { id: 'colocado', titulo: 'Colocado' },
  { id: 'retirado', titulo: 'Retirado' },
  { id: 'consertado', titulo: 'Consertado' },
  { id: 'regulado', titulo: 'Regulado' },
  { id: 'lubrificado', titulo: 'Engraxado/Lubrificado' },
  { id: 'limpo', titulo: 'Limpo' },
  { id: 'revisado', titulo: 'Revisado' },
];

export type UnidadeId = 'un' | 'L' | 'galao' | 'kg' | 'm';
export const UNIDADES: readonly Opcao<UnidadeId>[] = [
  { id: 'un', titulo: 'un' },
  { id: 'L', titulo: 'L' },
  { id: 'galao', titulo: 'galão' },
  { id: 'kg', titulo: 'kg' },
  { id: 'm', titulo: 'm' },
];

export type EixoId = 'dianteiro' | 'traseiro';
export const EIXOS: readonly Opcao<EixoId>[] = [
  { id: 'dianteiro', titulo: 'Dianteiro' },
  { id: 'traseiro', titulo: 'Traseiro' },
];

export type LadoId = 'ld' | 'le';
export const LADOS: readonly Opcao<LadoId>[] = [
  { id: 'ld', titulo: 'LD' },
  { id: 'le', titulo: 'LE' },
];

/** Título do id na lista; null para id desconhecido ou vazio. */
export const tituloDe = <T extends string>(lista: readonly Opcao<T>[], id: string | null | undefined): string | null =>
  lista.find((o) => o.id === id)?.titulo ?? null;

/** O id, se for um da lista (lido do Firestore ou do aparelho); senão null. */
export const idDe = <T extends string>(lista: readonly Opcao<T>[], id: unknown): T | null =>
  lista.find((o) => o.id === id)?.id ?? null;
