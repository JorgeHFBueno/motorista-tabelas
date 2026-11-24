import assert from 'node:assert/strict';
import test from 'node:test';
import { CENAS, PASSOS_DA_PLACA, caminhos, quadro, type Animacao } from '../src/components/corvo/quadros';

const ANIMACOES = Object.keys(CENAS) as Animacao[];
/** Posições "x,y" dos pixels de uma cor no quadro. */
function pixels(a: Animacao, i: number, cor: string) {
  const lista: string[] = [];
  quadro(a, i).forEach((l, y) => [...l].forEach((c, x) => { if (c === cor) lista.push(`${x},${y}`); }));
  return lista;
}
const pes = (a: Animacao, i: number) => pixels(a, i, 'b').filter((p) => Number(p.split(',')[1]) >= CENAS[a].altura - 3);

test('Corvo: todo quadro tem o tamanho da cena e só cores conhecidas', () => {
  for (const a of ANIMACOES) {
    const { largura, altura, quadros, parado } = CENAS[a];
    assert.ok(parado < quadros);
    for (let i = 0; i < quadros; i++) {
      const linhas = quadro(a, i);
      assert.equal(linhas.length, altura, `${a} ${i}`);
      linhas.forEach((l) => assert.equal(l.length, largura, `${a} ${i}`));
      assert.match(linhas.join(''), /^[.#wWAfcobsFEXCKPDmnqh]+$/, `${a} ${i}`);
    }
  }
  assert.equal(PASSOS_DA_PLACA.length, CENAS.placa.quadros);
});

test('Corvo: cabeça e grito piscam no quadro 3 e não tiram os pés do chão; o som só no grito', () => {
  for (const a of ['cabeca', 'grito'] as Animacao[]) {
    assert.equal(pixels(a, 3, 'o').length, 0, `${a} não pisca`);
    for (let i = 0; i < CENAS[a].quadros; i++) assert.deepEqual(pes(a, i), pes(a, 0), `${a} ${i}: os pés mudaram`);
  }
  assert.ok(pixels('grito', 6, 's').length > 0);
  assert.equal(pixels('grito', 7, 's').length, 0);
  for (let i = 0; i < CENAS.cabeca.quadros; i++) assert.equal(pixels('cabeca', i, 's').length, 0);
});

test('Corvo teclando: a tecla acende no pouso, o texto cresce a cada pouso e o corpo sai do chão no pulo', () => {
  // pulo 0: agacha (0), no ar (1, 2), pousa e aperta (3, 4), espera (5)
  assert.equal(pixels('teclando', 0, 'P').length, 0);
  assert.equal(pixels('teclando', 1, 'P').length, 0);
  assert.equal(pixels('teclando', 3, 'P').length, 2);
  assert.equal(pixels('teclando', 4, 'P').length, 2);
  assert.equal(pixels('teclando', 5, 'P').length, 0);
  const letras = (i: number) => pixels('teclando', i, 'X').length;
  assert.equal(letras(0), 0);
  assert.ok(letras(3) > letras(2));
  assert.ok(letras(9) > letras(5));
  // no ar, os pés estão acima da linha do teclado
  const alturaDosPes = (i: number) => Math.max(...pixels('teclando', i, 'b').map((p) => Number(p.split(',')[1])));
  assert.equal(alturaDosPes(0), 17);
  assert.ok(alturaDosPes(1) < 17);
});

test('Corvo placa: sem placa no começo e no fim, com a placa no meio; a interrogação some num quadro', () => {
  const comPlaca = (i: number) => pixels('placa', i, 'm').length > 0;
  assert.ok(!comPlaca(0));
  assert.ok(comPlaca(CENAS.placa.parado));
  assert.ok(!comPlaca(CENAS.placa.quadros - 1));
  const semQ = PASSOS_DA_PLACA.findIndex((p) => p.semInterrogacao);
  assert.ok(semQ > 0);
  assert.equal(pixels('placa', semQ, 'q').length, 0);
  assert.ok(pixels('placa', semQ - 1, 'q').length > 0);
  // a asa-braço só aparece quando ele mexe a asa
  assert.equal(pixels('placa', 0, 'A').length, 0);
  assert.ok(pixels('placa', CENAS.placa.parado, 'A').length > 0);
  const d = caminhos(quadro('placa', CENAS.placa.parado));
  assert.match(d.o, /^M\d+ \d+h1v1h-1zM\d+ \d+h1v1h-1z$/);
});
