import assert from 'node:assert/strict';
import test from 'node:test';
import { CENAS, PASSOS_DA_CABECA, PASSOS_DA_PLACA, PASSOS_DO_GRITO, caminhos, quadro, type Animacao } from '../src/components/corvo/quadros';

const ANIMACOES = Object.keys(CENAS) as Animacao[];
/** Posições "x,y" dos pixels de uma cor no quadro. */
function pixels(a: Animacao, i: number, cor: string) {
  const lista: string[] = [];
  quadro(a, i).forEach((l, y) => [...l].forEach((c, x) => { if (c === cor) lista.push(`${x},${y}`); }));
  return lista;
}

test('Corvo: todo quadro tem o tamanho da cena e só cores conhecidas', () => {
  for (const a of ANIMACOES) {
    const { largura, altura, quadros, parado } = CENAS[a];
    assert.ok(parado < quadros);
    for (let i = 0; i < quadros; i++) {
      const linhas = quadro(a, i);
      assert.equal(linhas.length, altura, `${a} ${i}`);
      linhas.forEach((l) => assert.equal(l.length, largura, `${a} ${i}`));
      assert.match(linhas.join(''), /^[.#wWAfcobsMpFEXCKPDmnqh]+$/, `${a} ${i}`);
    }
  }
  assert.equal(PASSOS_DA_PLACA.length, CENAS.placa.quadros);
  assert.equal(PASSOS_DO_GRITO.length, CENAS.grito.quadros);
  assert.equal(PASSOS_DA_CABECA.length, CENAS.cabeca.quadros);
});

test('Corvo cabeça: procura sem tirar os pés do lugar; "?" no pescoço esticado e ao olhar para trás; poeira na bicada e na ciscada', () => {
  assert.equal(pixels('cabeca', 1, 'o').length, 0);
  PASSOS_DA_CABECA.forEach((p, i) => {
    assert.equal(pixels('cabeca', i, 's').length > 0, p.duvida !== undefined, `cabeca ${i}: "?"`);
    assert.equal(pixels('cabeca', i, 'p').length > 0, !!p.poeira, `cabeca ${i}: poeira`);
    // os pés ficam: a linha mais baixa do corvo é sempre a mesma
    const fundo = Math.max(...pixels('cabeca', i, 'b').map((x) => Number(x.split(',')[1])));
    assert.equal(fundo, 18, `cabeca ${i}: os pés saíram do chão`);
  });
  // olhando para trás, o olho fica à esquerda do corpo; parado, à direita
  const olhoX = (i: number) => Number(pixels('cabeca', i, 'o')[0].split(',')[0]);
  const virado = PASSOS_DA_CABECA.findIndex((p) => p.pose === 'virado' && !p.olho);
  assert.ok(olhoX(virado) < olhoX(0));
  // bicando, a cabeça desce
  const bicando = PASSOS_DA_CABECA.findIndex((p) => p.pose === 'bicando');
  const olhoY = (i: number) => Number(pixels('cabeca', i, 'o')[0].split(',')[1]);
  assert.ok(olhoY(bicando) > olhoY(0));
  assert.equal(PASSOS_DA_CABECA[CENAS.cabeca.parado].duvida, 0);
});

test('Corvo grito: pisca, enche o peito, grita com o bico aberto e as ondas, e perde uma pena', () => {
  assert.equal(pixels('grito', 1, 'o').length, 0);
  PASSOS_DO_GRITO.forEach((p, i) => {
    const gritando = p.pose === 'gritando';
    assert.equal(pixels('grito', i, 'M').length > 0, gritando, `grito ${i}: boca`);
    assert.equal(pixels('grito', i, 's').length > 0, gritando, `grito ${i}: ondas`);
  });
  // as ondas se afastam: a mais distante (2) só aparece depois da mais perto (0)
  const maisLonge = (i: number) => Math.max(...pixels('grito', i, 's').map((p) => Number(p.split(',')[0])));
  assert.ok(maisLonge(7) > maisLonge(5));
  // a pena cai: aparece depois do segundo grito e desce
  const comPena = PASSOS_DO_GRITO.map((p, i) => (p.pena ? i : -1)).filter((i) => i >= 0);
  assert.ok(comPena.length >= 3);
  assert.ok(PASSOS_DO_GRITO[comPena[comPena.length - 1]].pena![1] > PASSOS_DO_GRITO[comPena[0]].pena![1]);
  assert.equal(PASSOS_DO_GRITO[CENAS.grito.parado].pose, 'gritando');
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
