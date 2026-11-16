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

const diasTrabalhados = (periodo: Periodo) => {
  const nt = diasNT(periodo);
  return eachDay(periodo.inicio, periodo.tempoPlanejado).filter((dia) => !nt.has(dia));
};

/**
 * "Juntar": dois períodos do mesmo mestre na mesma obra viram um só, de X a Y.
 * Fica NT todo dia que não era trabalhado em nenhum dos dois (o intervalo entre eles e os NT que já tinham).
 */
export function juntarPeriodos(a: Periodo, b: Periodo): { inicio: string; tempoPlanejado: number; naoTrabalhados?: NaoTrabalhado[] } {
  const inicio = a.inicio < b.inicio ? a.inicio : b.inicio;
  const fimA = calculatedEnd(a.inicio, a.tempoPlanejado);
  const fimB = calculatedEnd(b.inicio, b.tempoPlanejado);
  const tempoPlanejado = inclusiveCivilDays(inicio, fimA > fimB ? fimA : fimB)!;
  const trabalhados = new Set([...diasTrabalhados(a), ...diasTrabalhados(b)]);
  const naoTrabalhados = trechos(eachDay(inicio, tempoPlanejado).filter((dia) => !trabalhados.has(dia)));
  return { inicio, tempoPlanejado, ...(naoTrabalhados.length ? { naoTrabalhados } : {}) };
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
