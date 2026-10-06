import type { ContratoCronograma, ObraCronograma } from "./models";

export interface ContractGroup {
  id: string;
  name: string;
  obras: ObraCronograma[];
}
export type WorkTypeGroupKind = "publica" | "privada" | "sem-classificacao";
export interface WorkTypeGroup {
  kind: WorkTypeGroupKind;
  label: string;
  groups: ContractGroup[];
}
export interface FlatWorkTypeGroup {
  kind: WorkTypeGroupKind;
  label: string;
  obras: ObraCronograma[];
}

const WORK_TYPE_LABELS: Record<WorkTypeGroupKind, string> = {
  publica: "OBRAS PÚBLICAS",
  privada: "OBRAS PRIVADAS",
  "sem-classificacao": "SEM CLASSIFICAÇÃO",
};
function workTypeKind(
  contrato: ContratoCronograma | undefined,
): WorkTypeGroupKind {
  return contrato?.tipoObra === "Pública"
    ? "publica"
    : contrato?.tipoObra === "Privada"
      ? "privada"
      : "sem-classificacao";
}

/** Natural, stable ordering for the flat projection; missing numbers are last. */
export function compareContractNumbers(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const a = left?.trim();
  const b = right?.trim();
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

/** Presentation-only flat view. It retains each work exactly once and never manufactures LOTEs. */
export function buildFlatWorkGroupsByWorkType(
  obras: readonly ObraCronograma[],
  contratos: ReadonlyMap<string, ContratoCronograma>,
): FlatWorkTypeGroup[] {
  const indexed = obras.map((obra, index) => ({ obra, index }));
  const buckets: Record<WorkTypeGroupKind, typeof indexed> = {
    publica: [],
    privada: [],
    "sem-classificacao": [],
  };
  indexed.forEach((item) =>
    buckets[workTypeKind(contratos.get(item.obra.contratoId ?? ""))].push(item),
  );
  return (Object.keys(buckets) as WorkTypeGroupKind[])
    .map((kind) => ({
      kind,
      label: WORK_TYPE_LABELS[kind],
      obras: buckets[kind]
        .sort(
          (left, right) =>
            compareContractNumbers(
              contratos.get(left.obra.contratoId ?? "")?.numeroContrato,
              contratos.get(right.obra.contratoId ?? "")?.numeroContrato,
            ) || left.index - right.index,
        )
        .map((item) => item.obra),
    }))
    .filter((group) => group.obras.length);
}

/** Presentation-only grouping that retains every contract and its source order. */
export function groupContractGroupsByWorkType(
  groups: readonly ContractGroup[],
  contratos: ReadonlyMap<string, ContratoCronograma>,
): WorkTypeGroup[] {
  const buckets: Record<WorkTypeGroupKind, ContractGroup[]> = {
    publica: [],
    privada: [],
    "sem-classificacao": [],
  };
  groups.forEach((group) => {
    const tipoObra = contratos.get(group.id)?.tipoObra;
    const kind: WorkTypeGroupKind =
      tipoObra === "Pública"
        ? "publica"
        : tipoObra === "Privada"
          ? "privada"
          : "sem-classificacao";
    buckets[kind].push(group);
  });
  return [
    {
      kind: "publica",
      label: WORK_TYPE_LABELS.publica,
      groups: buckets.publica,
    },
    {
      kind: "privada",
      label: WORK_TYPE_LABELS.privada,
      groups: buckets.privada,
    },
    {
      kind: "sem-classificacao",
      label: WORK_TYPE_LABELS["sem-classificacao"],
      groups: buckets["sem-classificacao"],
    },
  ].filter((group) => group.groups.length);
}

/** Keeps the source order, including a stable group for works without a contract. */
export function groupObrasByContract(
  obras: readonly ObraCronograma[],
): ContractGroup[] {
  const groups = new Map<string, ContractGroup>();
  obras.forEach((obra) => {
    const id = obra.contratoId ?? "sem-contrato";
    const name = obra.contratoNome?.trim() || "Sem contrato";
    const current = groups.get(id);
    if (current) current.obras.push(obra);
    else groups.set(id, { id, name, obras: [obra] });
  });
  return [...groups.values()];
}

/**
 * Reuses an unchanged contract group (and, crucially, its obras array) after a
 * single allocation update.  This lets collapsed summaries and memoized rows
 * stay outside the reconciliation path for unrelated contracts.
 */
export function reconcileContractGroups(
  previous: readonly ContractGroup[],
  obras: readonly ObraCronograma[],
): ContractGroup[] {
  const previousById = new Map(previous.map((group) => [group.id, group]));
  return groupObrasByContract(obras).map((next) => {
    const prior = previousById.get(next.id);
    return prior &&
      prior.name === next.name &&
      prior.obras.length === next.obras.length &&
      prior.obras.every((obra, index) => obra === next.obras[index])
      ? prior
      : next;
  });
}

/**
 * The collapsed contract timeline is derived from every hydrated child obra,
 * never from the rows currently mounted by the UI.
 */
export function contractAllocationSummary(
  obras: readonly ObraCronograma[],
): ObraCronograma | null {
  const first = obras[0];
  if (!first) return null;
  return {
    ...first,
    id: `contract-summary-${obras.map((obra) => obra.id).join("-")}`,
    mestresPlanejados: obras.flatMap((obra) => obra.mestresPlanejados),
  };
}
