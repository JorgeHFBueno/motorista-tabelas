import { addDays, calculatedEnd, eachDay, inclusiveCivilDays, isValidCivilDate } from "./temporal";

/**
 * Dias "NT" (não trabalhados) dentro de uma alocação de `monday-cronograma`: o mestre segue na obra, mas não trabalha.
 * Campo opcional `naoTrabalhados: [{ inicio: "AAAA-MM-DD", dias }]`. NT não ocupa o mestre: não conta como conflito.
 */
export type NaoTrabalhado = { inicio: string; dias: number };
type Periodo = { inicio: string; tempoPlanejado: number; naoTrabalhados?: readonly NaoTrabalhado[] };

/** Lê o campo do Firestore; entradas fora do formato são ignoradas. */
export function lerNaoTrabalhados(value: unknown): NaoTrabalhado[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const lista = value.filter((item): item is NaoTrabalhado =>
    Boolean(item) && typeof item.inicio === "string" && isValidCivilDate(item.inicio) && Number.isInteger(item.dias) && item.dias > 0);
  return lista.length ? lista.map(({ inicio, dias }) => ({ inicio, dias })) : undefined;
}

/** Junta dias em trechos contínuos, em ordem. */
function trechos(dias: Iterable<string>): NaoTrabalhado[] {
  const result: NaoTrabalhado[] = [];
  [...new Set(dias)].sort().forEach((dia) => {
    const ultimo = result.at(-1);
    if (ultimo && addDays(ultimo.inicio, ultimo.dias) === dia) ultimo.dias += 1;
    else result.push({ inicio: dia, dias: 1 });
  });
  return result;
}

/** Dias NT que caem dentro do período (o NT fica preso às datas: o que sai do período some). */
export function diasNT(periodo: Periodo): Set<string> {
  const fim = calculatedEnd(periodo.inicio, periodo.tempoPlanejado);
  return new Set((periodo.naoTrabalhados ?? []).flatMap((item) => eachDay(item.inicio, item.dias)).filter((dia) => dia >= periodo.inicio && dia <= fim));
}

/** NT recortado ao período, em trechos contínuos e sem repetição; `undefined` quando não sobra nenhum. */
export function normalizarNaoTrabalhados(periodo: Periodo): NaoTrabalhado[] | undefined {
  const lista = trechos(diasNT(periodo));
  return lista.length ? lista : undefined;
}

export const ehNaoTrabalhado = (periodo: Periodo, dia: string) => diasNT(periodo).has(dia);

/** "21 dias" ou "21 dias (3 NT)" ("1 dia" no singular). */
export function rotuloDias(periodo: Periodo): string {
  const nt = diasNT(periodo).size;
  return `${periodo.tempoPlanejado} ${periodo.tempoPlanejado === 1 ? "dia" : "dias"}${nt ? ` (${nt} NT)` : ""}`;
}

/** Acrescenta dias NT ao período (só os que caem nele). */
export function marcarNaoTrabalhado(periodo: Periodo, inicio: string, dias: number): NaoTrabalhado[] | undefined {
  return normalizarNaoTrabalhados({ ...periodo, naoTrabalhados: [...(periodo.naoTrabalhados ?? []), { inicio, dias }] });
}

/** Tira um trecho NT inteiro. */
export function desmarcarNaoTrabalhado(periodo: Periodo, trecho: NaoTrabalhado): NaoTrabalhado[] | undefined {
  const tirar = new Set(eachDay(trecho.inicio, trecho.dias));
  const lista = trechos([...diasNT(periodo)].filter((dia) => !tirar.has(dia)));
  return lista.length ? lista : undefined;
}

/** Trechos NT dentro de uma janela do calendário (para desenhar na barra). */
export function segmentosNT(periodo: Periodo, inicioJanela: string, diasJanela: number): Array<{ offset: number; days: number }> {
  const janela = eachDay(inicioJanela, diasJanela);
  const nt = diasNT(periodo);
  const result: Array<{ offset: number; days: number }> = [];
  janela.forEach((dia, offset) => {
    if (!nt.has(dia)) return;
    const ultimo = result.at(-1);
    if (ultimo && ultimo.offset + ultimo.days === offset) ultimo.days += 1;
    else result.push({ offset, days: 1 });
  });
  return result;
}

/** Valor de `draggingMaster` enquanto o "NT" da paleta é arrastado (escala Dias). */
export const NT_ARRASTE = "__NT__";

/**
 * Estica ou encolhe um trecho NT pela ponta `edge`, como a barra do mestre: a ponta vai até `dataAlvo`,
 * sem passar da outra ponta do trecho nem sair do período. Devolve a lista nova, já normalizada.
 */
export function redimensionarNaoTrabalhado(periodo: Periodo, trecho: NaoTrabalhado, edge: "start" | "end", dataAlvo: string): NaoTrabalhado[] | undefined {
  const fimPeriodo = calculatedEnd(periodo.inicio, periodo.tempoPlanejado);
  const fimTrecho = calculatedEnd(trecho.inicio, trecho.dias);
  const limitar = (dia: string) => (dia < periodo.inicio ? periodo.inicio : dia > fimPeriodo ? fimPeriodo : dia);
  const inicio = edge === "start" ? limitar(dataAlvo > fimTrecho ? fimTrecho : dataAlvo) : trecho.inicio;
  const fim = edge === "end" ? limitar(dataAlvo < trecho.inicio ? trecho.inicio : dataAlvo) : fimTrecho;
  const outros = desmarcarNaoTrabalhado(periodo, trecho) ?? [];
  return normalizarNaoTrabalhados({ ...periodo, naoTrabalhados: [...outros, { inicio, dias: inclusiveCivilDays(inicio, fim)! }] });
}

/** Novos valores de um período (alocação de `monday-cronograma`) depois de uma edição de NT. */
export type ValoresPeriodo = { inicio: string; tempoPlanejado: number; naoTrabalhados?: NaoTrabalhado[] };
/**
 * Plano de uma edição de NT (2026-11-23, para as equipes dos mestres): `periodo` são os novos valores do período
 * editado; `sucessor`, os do período seguinte do mesmo mestre no mesmo LOTE, quando a divisa entre os dois muda;
 * `novo`, um período a criar logo depois do editado, quando ele é dividido.
 */
export type PlanoNT = { periodo: ValoresPeriodo; sucessor?: ValoresPeriodo; novo?: ValoresPeriodo };

const recorte = (periodo: Periodo, inicio: string, fim: string): ValoresPeriodo => {
  const tempoPlanejado = inclusiveCivilDays(inicio, fim)!;
  const naoTrabalhados = normalizarNaoTrabalhados({ inicio, tempoPlanejado, naoTrabalhados: periodo.naoTrabalhados });
  return { inicio, tempoPlanejado, ...(naoTrabalhados ? { naoTrabalhados } : {}) };
};

/**
 * NT no meio de um período divide o período: o primeiro vai até o último dia do NT (o NT fica no fim dele) e o
 * segundo começa no dia seguinte, com os NT que caírem nele. NT numa ponta do período não divide (devolve `null`).
 */
export function dividirNoNT(periodo: Periodo, trecho: NaoTrabalhado): { primeiro: ValoresPeriodo; segundo: ValoresPeriodo } | null {
  const fimPeriodo = calculatedEnd(periodo.inicio, periodo.tempoPlanejado);
  const fimTrecho = calculatedEnd(trecho.inicio, trecho.dias);
  if (trecho.inicio <= periodo.inicio || fimTrecho >= fimPeriodo) return null;
  return { primeiro: recorte(periodo, periodo.inicio, fimTrecho), segundo: recorte(periodo, addDays(fimTrecho, 1), fimPeriodo) };
}

/** O trecho NT (já normalizado) que contém o dia. */
const trechoDoDia = (lista: readonly NaoTrabalhado[] | undefined, dia: string) =>
  (lista ?? []).find((item) => dia >= item.inicio && dia <= calculatedEnd(item.inicio, item.dias));

/** Plano de uma lista NT nova para o período, dividindo-o se o trecho editado (que contém `dia`) ficou no meio. */
function planoComDivisao(periodo: Periodo, naoTrabalhados: NaoTrabalhado[] | undefined, dia: string): PlanoNT {
  const editado = { ...periodo, naoTrabalhados };
  const trecho = trechoDoDia(naoTrabalhados, dia);
  const divisao = trecho ? dividirNoNT(editado, trecho) : null;
  if (divisao) return { periodo: divisao.primeiro, novo: divisao.segundo };
  return { periodo: { inicio: periodo.inicio, tempoPlanejado: periodo.tempoPlanejado, ...(naoTrabalhados ? { naoTrabalhados } : {}) } };
}

/** Soltar o "NT" num dia do período: marca o dia e, se o NT ficou no meio, divide o período. */
export function planoMarcarNT(periodo: Periodo, dia: string): PlanoNT {
  return planoComDivisao(periodo, marcarNaoTrabalhado(periodo, dia, 1), dia);
}

/**
 * Esticar ou encolher um trecho NT pela ponta `edge` até `dataAlvo`.
 * - NT no fim do período e `sucessor` logo em seguida (mesmo mestre e LOTE, começando no dia seguinte): a ponta final
 *   move a divisa entre os dois. Esticar avança sobre o começo do sucessor, que encolhe; encolher devolve dias a ele.
 *   O sucessor fica com pelo menos 1 dia, e o NT com pelo menos 1.
 * - Nos outros casos, o NT muda dentro do período (como antes) e, se ficou no meio, o período é dividido.
 */
export function planoRedimensionarNT(periodo: Periodo, trecho: NaoTrabalhado, edge: "start" | "end", dataAlvo: string, sucessor?: Periodo): PlanoNT {
  const fimPeriodo = calculatedEnd(periodo.inicio, periodo.tempoPlanejado);
  const fimTrecho = calculatedEnd(trecho.inicio, trecho.dias);
  if (edge === "end" && fimTrecho === fimPeriodo && sucessor && sucessor.inicio === addDays(fimPeriodo, 1)) {
    const fimSucessor = calculatedEnd(sucessor.inicio, sucessor.tempoPlanejado);
    const ultimoPossivel = addDays(fimSucessor, -1);
    const novoFim = dataAlvo < trecho.inicio ? trecho.inicio : dataAlvo > ultimoPossivel ? ultimoPossivel : dataAlvo;
    const outros = desmarcarNaoTrabalhado(periodo, trecho) ?? [];
    const comTrecho = { ...periodo, naoTrabalhados: [...outros, { inicio: trecho.inicio, dias: inclusiveCivilDays(trecho.inicio, novoFim)! }] };
    return { periodo: recorte(comTrecho, periodo.inicio, novoFim), sucessor: recorte(sucessor, addDays(novoFim, 1), fimSucessor) };
  }
  const lista = redimensionarNaoTrabalhado(periodo, trecho, edge, dataAlvo);
  // The edge that did not move still belongs to the edited stretch.
  return planoComDivisao(periodo, lista, edge === "start" ? fimTrecho : trecho.inicio);
}
