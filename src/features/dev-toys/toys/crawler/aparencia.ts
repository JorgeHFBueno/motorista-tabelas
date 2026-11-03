import type { Plano } from './genoma';
import { SKILL, SKILLS, type Skills } from './habilidades';

// Aparência que as skills dão a uma Anomalia, pelo plano corporal (decisão do responsável, 2026-11-03). Cada skill
// muda uma parte do corpo, de um jeito por plano; a física (pernas, segmentos) fica em `paramsDe`. Sem DOM.
//
//                 centopeia               aranha                    polvo                    caranguejo
// Clarividência   +pares de olhos         olhos em fileira (até 8)  olhos maiores (até 4)    pedúnculos mais altos
// Multipresença   +pares de antenas       +pares de palpos          +braços curtos           +pares de antenas
// Deslocamento    (física) pernas mais longas; centopeia uma por segmento, polvo e caranguejo +1 par
// Premonição      nós nas antenas         cerdas nas pernas da frente  ventosas              nós nas antenas
// Expansão        antenas mais longas     par de chicotes longos    tentáculos de caça       antenas mais longas
// Adaptação       (física) +segmentos     ampulheta no abdômen      anéis no manto           placas e espinhos
// Absorção        corpo mais grosso       abdômen maior             manto maior              carapaça maior
// Perfeccionismo  cabeças a mais (na centopeia, a primeira vai para a cauda)
// Todas no máximo: o eco de xerox, cópias apagadas atrás do corpo.

export type Aparencia = {
  /** pares de olhos dados pela Clarividência (0: só os do genoma) */
  olhos: number;
  /** Clarividência de 0 a 1: tamanho dos olhos do polvo e altura dos pedúnculos do caranguejo */
  visao: number;
  /** Multipresença: pares de antenas (centopeia, caranguejo), de palpos (aranha) ou de braços curtos (polvo) */
  sensores: number;
  /** Premonição, 0 a 3: nós nas antenas, cerdas (aranha) ou ventosas (polvo) */
  nos: number;
  /** Expansão de 0 a 1: antenas mais longas, chicotes (aranha) ou tentáculos de caça (polvo) */
  expansao: number;
  /** Adaptação, 0 a 5: ampulheta, anéis ou placas e espinhos */
  marca: number;
  /** Absorção: multiplica o tamanho do corpo principal */
  barriga: number;
  /** Perfeccionismo: cabeças a mais (0 a 2) */
  cabecas: number;
  /** todas as skills no máximo */
  eco: boolean;
};

export const SEM_APARENCIA: Aparencia = { olhos: 0, visao: 0, sensores: 0, nos: 0, expansao: 0, marca: 0, barriga: 1, cabecas: 0, eco: false };

/** Pares de olhos da Clarividência por nível: aranha chega a 4 pares (8 olhos), polvo a 2, caranguejo fica em 1. */
function olhosDe(plano: Plano, n: number): number {
  if (!n) return 0;
  if (plano === 'aranha') return 1 + Math.floor(n / 3);
  if (plano === 'polvo') return 1 + Math.floor(n / 6);
  if (plano === 'caranguejo') return 1;
  return 1 + Math.floor(n / 4);
}

export const todasNoMaximo = (s: Skills) => SKILLS.every((k) => s[k] >= SKILL[k].max);

export function aparenciaDe(plano: Plano, s: Skills): Aparencia {
  return {
    olhos: olhosDe(plano, s.leitura),
    visao: s.leitura / SKILL.leitura.max,
    sensores: s.palavras,
    nos: s.faro,
    expansao: s.raio / SKILL.raio.max,
    marca: s.estomago,
    barriga: 1 + 0.1 * s.gula,
    cabecas: s.revisor,
    eco: todasNoMaximo(s),
  };
}
