import type { ContratoCronograma, ObraCronograma } from "./models";
import type { ContractGroup } from "./contractGroups";

export type SortDirection = "asc" | "desc" | null;
export type ColumnId = "nomeContrato" | "obra" | "contrato" | "mestres" | "status" | "empresa" | "ordemInicio" | "confirmacaoRecurso" | "inicio" | "dias";
export type TableSort = { column: ColumnId | null; direction: SortDirection };
export const NO_TABLE_SORT: TableSort = { column: null, direction: null };

export function nextTableSort(current: TableSort, column: ColumnId): TableSort {
  if (current.column !== column || current.direction === null) return { column, direction: "asc" };
  if (current.direction === "asc") return { column, direction: "desc" };
  return NO_TABLE_SORT;
}

const absent = (value: unknown) => value === null || value === undefined || (typeof value === "string" && (!value.trim() || value.trim() === "-" || value.trim() === "—"));
const text = (value: unknown) => String(value ?? "").trim();
const masterText = (obra: ObraCronograma) => obra.mestresPlanejados.map((item) => item.nome).filter(Boolean).join(" | ");
const dateValue = (value: unknown) => {
  const source = text(value);
  if (!source) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(source) ? source : null;
  if (iso) return Date.parse(`${iso}T00:00:00`);
  const br = /^(\d{2})\/(\d{2})\/(\d{2,4})$/.exec(source);
  return br ? Date.parse(`${br[3].length === 2 ? `20${br[3]}` : br[3]}-${br[2]}-${br[1]}T00:00:00`) : null;
};

export function obraSortValue(obra: ObraCronograma, contrato: ContratoCronograma | undefined, column: ColumnId): unknown {
  switch (column) {
    case "nomeContrato": return contrato?.nome ?? obra.contratoNome;
    case "obra": return obra.nomeObra;
    case "contrato": return contrato?.numeroContrato;
    case "mestres": return masterText(obra);
    case "status": return obra.status;
    case "empresa": return obra.empresa || contrato?.empresa;
    case "ordemInicio": return contrato?.ordemInicio;
    case "confirmacaoRecurso": return contrato?.confirmacaoRecurso;
    case "inicio": return obra.inicioPlanejado ?? contrato?.inicio;
    case "dias": return obra.tempoPlanejado;
  }
}

export function compareSortValues(left: unknown, right: unknown, column: ColumnId, direction: Exclude<SortDirection, null>): number {
  const leftAbsent = absent(left); const rightAbsent = absent(right);
  if (leftAbsent || rightAbsent) return leftAbsent === rightAbsent ? 0 : leftAbsent ? 1 : -1;
  let result: number;
  if (column === "inicio") result = (dateValue(left) ?? Number.POSITIVE_INFINITY) - (dateValue(right) ?? Number.POSITIVE_INFINITY);
  else if (column === "dias") result = Number(left) - Number(right);
  else result = text(left).localeCompare(text(right), "pt-BR", { numeric: true, sensitivity: "base" });
  return direction === "desc" ? -result : result;
}

export function sortObras(obras: readonly ObraCronograma[], contratos: ReadonlyMap<string, ContratoCronograma>, sort: TableSort): ObraCronograma[] {
  if (!sort.column || !sort.direction) return [...obras];
  return [...obras].sort((left, right) => compareSortValues(obraSortValue(left, contratos.get(left.contratoId ?? ""), sort.column!), obraSortValue(right, contratos.get(right.contratoId ?? ""), sort.column!), sort.column!, sort.direction!));
}

export function sortContractGroups(groups: readonly ContractGroup[], contratos: ReadonlyMap<string, ContratoCronograma>, sort: TableSort): ContractGroup[] {
  if (!sort.column || !sort.direction) return [...groups];
  return [...groups].sort((left, right) => {
    const leftContract = contratos.get(left.id); const rightContract = contratos.get(right.id);
    const leftValue = obraSortValue(left.obras[0], leftContract, sort.column!);
    const rightValue = obraSortValue(right.obras[0], rightContract, sort.column!);
    return compareSortValues(leftValue, rightValue, sort.column!, sort.direction!);
  }).map((group) => ({ ...group, obras: sortObras(group.obras, contratos, sort) }));
}
