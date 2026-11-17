import { useSyncExternalStore } from "react";

/**
 * CronoObra: colunas da grade de Obra iniciada que o usuário escondeu em "Colunas" (no cartão de filtros). Fica
 * em memória: recarregar a página mostra todas de novo.
 */
export type ColunaQuadro = "obra" | "empresa" | "status" | "mestres" | "inicio" | "dias";
export const COLUNAS_QUADRO: ReadonlyArray<{ id: ColunaQuadro; rotulo: string }> = [
  { id: "obra", rotulo: "Obra" },
  { id: "empresa", rotulo: "Emp." },
  { id: "status", rotulo: "Status" },
  { id: "mestres", rotulo: "Mestres" },
  { id: "inicio", rotulo: "Início" },
  { id: "dias", rotulo: "Dias" },
];

let ocultas: ReadonlySet<ColunaQuadro> = new Set();
const ouvintes = new Set<() => void>();

export function useColunasOcultas(): ReadonlySet<ColunaQuadro> {
  return useSyncExternalStore((ouvir) => { ouvintes.add(ouvir); return () => ouvintes.delete(ouvir); }, () => ocultas);
}

/** Shows or hides a column; the last visible column cannot be hidden. */
export function alternarColuna(id: ColunaQuadro) {
  const proximo = new Set(ocultas);
  if (proximo.has(id)) proximo.delete(id);
  else if (COLUNAS_QUADRO.length - proximo.size > 1) proximo.add(id);
  else return;
  ocultas = proximo;
  ouvintes.forEach((ouvir) => ouvir());
}
