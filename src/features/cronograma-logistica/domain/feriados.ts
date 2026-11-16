import type { CivilDate } from './models';
import { somarDias } from './semanas';

/**
 * Feriados do Cronograma Logístico, calculados aqui (sem cadastro nem internet): os nacionais fixos, os que dependem
 * da Páscoa (Carnaval e Corpus Christi, pontos facultativos tratados como feriado, e a Sexta-feira Santa) e o 20 de
 * setembro do RS (vale para Palmeira das Missões). Os municipais ainda não entram.
 */
export interface Feriado { data: CivilDate; nome: string }

const FIXOS: readonly (readonly [string, string])[] = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'],
  ['09-20', 'Revolução Farroupilha (RS)'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Consciência Negra'],
  ['12-25', 'Natal'],
];

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): CivilDate {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Os feriados do ano, por data. */
export function feriadosDoAno(ano: number): Feriado[] {
  const p = pascoa(ano);
  return [
    ...FIXOS.map(([mmdd, nome]) => ({ data: `${ano}-${mmdd}`, nome })),
    { data: somarDias(p, -48), nome: 'Carnaval' },
    { data: somarDias(p, -47), nome: 'Carnaval' },
    { data: somarDias(p, -2), nome: 'Sexta-feira Santa' },
    { data: somarDias(p, 60), nome: 'Corpus Christi' },
  ].sort((x, y) => x.data.localeCompare(y.data));
}

const porAno = new Map<number, Map<CivilDate, string>>();

/** Nome do feriado na data, ou null. */
export function feriadoEm(data: CivilDate): string | null {
  const ano = Number(data.slice(0, 4));
  let mapa = porAno.get(ano);
  if (!mapa) {
    mapa = new Map(feriadosDoAno(ano).map((feriado) => [feriado.data, feriado.nome]));
    porAno.set(ano, mapa);
  }
  return mapa.get(data) ?? null;
}

/** Sábado ou domingo. */
export function fimDeSemana(data: CivilDate): boolean {
  const dia = new Date(`${data}T00:00:00Z`).getUTCDay();
  return dia === 0 || dia === 6;
}
