// Catálogo do checklist do mecânico (contrato: Manuscrito 01_FIRESTORE/COLECOES/checklists-v2.md). A lista vem do app
// Flutter, gerada em catalogo.gerado.ts (tools/checklist-catalogo/README.md); os ids são gravados e lembrados entre
// checklists, por isso nunca são digitados aqui.
import { CATALOGOS_GERADOS, PARTES_GERADAS } from './catalogo.gerado';

export type CatalogoId = keyof typeof CATALOGOS_GERADOS;
export type ParteId = (typeof PARTES_GERADAS)[number]['id'];

export type ChecklistItemDef = {
  id: string;
  parte: ParteId;
  titulo: string;
  /** O que o mecânico informa na observação (ex.: "Nº do pneu"); com ele, a observação é obrigatória em OK e Avaria. */
  campo: string | null;
};

export type ChecklistCatalogo = { id: CatalogoId; titulo: string; versao: string; itens: readonly ChecklistItemDef[] };

/** Partes na ordem de exibição; `guincho` só aparece com "Com guincho". */
export const PARTES: readonly { id: ParteId; titulo: string }[] = PARTES_GERADAS;

export const CATALOGOS: Record<CatalogoId, ChecklistCatalogo> = CATALOGOS_GERADOS;

/** Catálogo pela categoria do cadastro em `veiculos-v2`: `EXTRA` → máquinas, o resto → veículos. */
export function catalogoParaCategoria(categoria: string): CatalogoId {
  return categoria.trim().toUpperCase() === 'EXTRA' ? 'maquinas' : 'veiculos';
}

/** Horímetro para Máquinas, KM para Veículos. */
export const usaHorimetro = (catalogo: CatalogoId) => catalogo === 'maquinas';

export const exigeGuincho = (item: ChecklistItemDef) => item.parte === 'guincho';

export const observacaoObrigatoria = (item: ChecklistItemDef) => item.campo != null;

/** Itens do catálogo na ordem de exibição; os de guincho só entram com `guincho`. */
export function itensDoCatalogo(catalogo: CatalogoId, guincho: boolean): ChecklistItemDef[] {
  return CATALOGOS[catalogo].itens.filter((item) => guincho || !exigeGuincho(item));
}

/** Todos os itens do catálogo, com os de guincho. */
export const todosOsItens = (catalogo: CatalogoId) => itensDoCatalogo(catalogo, true);
