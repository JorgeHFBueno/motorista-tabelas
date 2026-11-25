import assert from 'node:assert/strict';
import test from 'node:test';
import { enfeitar, festaDoDia } from '../src/components/corvo/festas';
import { CENAS, MARGEM_ENFEITE, PASSOS_DA_CABECA, PASSOS_DA_PLACA, PASSOS_DO_GRITO, PASSOS_DO_TECLANDO, TECLA_ENTER, caminhos, quadro, type Animacao } from '../src/components/corvo/quadros';

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
      assert.match(linhas.join(''), /^[.#wWAfcobsMpFEXCKPDGmnqh]+$/, `${a} ${i}`);
    }
  }
  assert.equal(PASSOS_DA_PLACA.length, CENAS.placa.quadros);
  assert.equal(PASSOS_DO_GRITO.length, CENAS.grito.quadros);
  assert.equal(PASSOS_DA_CABECA.length, CENAS.cabeca.quadros);
  assert.equal(PASSOS_DO_TECLANDO.length, CENAS.teclando.quadros);
});

test('Corvo cabeça: procura sem tirar os pés do lugar; "?" no pescoço esticado e ao olhar para trás; poeira na bicada e na ciscada', () => {
  assert.equal(pixels('cabeca', 1, 'o').length, 0);
  PASSOS_DA_CABECA.forEach((p, i) => {
    assert.equal(pixels('cabeca', i, 's').length > 0, p.duvida !== undefined, `cabeca ${i}: "?"`);
    assert.equal(pixels('cabeca', i, 'p').length > 0, !!p.poeira, `cabeca ${i}: poeira`);
    // os pés ficam: a linha mais baixa do corvo é sempre a mesma
    const fundo = Math.max(...pixels('cabeca', i, 'b').map((x) => Number(x.split(',')[1])));
    assert.equal(fundo, 18 + MARGEM_ENFEITE, `cabeca ${i}: os pés saíram do chão`);
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

test('Corvo teclando: pula nas teclas com "tac", pula alto no Enter, a barra enche, olha a tela e recomeça', () => {
  const CHAO = 19 + MARGEM_ENFEITE;
  const BARRA = 15 + MARGEM_ENFEITE; // Y + 13
  const alturaDosPes = (i: number) => Math.max(...pixels('teclando', i, 'b').map((p) => Number(p.split(',')[1])));
  const letras = (i: number) => pixels('teclando', i, 'X').length;
  const barra = (i: number) => pixels('teclando', i, 'C').filter((p) => Number(p.split(',')[1]) === BARRA).length;
  // pulo 0: agacha (0), no ar (1 a 3), pousa apertando a tecla com "tac" (4), de pé apertando (5), espera (6)
  assert.equal(PASSOS_DO_TECLANDO[0].pose, 'agachado');
  assert.equal(alturaDosPes(0), CHAO);
  for (const i of [1, 2, 3]) assert.ok(alturaDosPes(i) < CHAO, `teclando ${i}: no ar`);
  assert.equal(pixels('teclando', 0, 'P').length, 0);
  assert.equal(pixels('teclando', 4, 'P').length, 2);
  assert.ok(pixels('teclando', 4, 's').length > 0);
  assert.equal(pixels('teclando', 6, 's').length, 0);
  assert.equal(letras(0), 0);
  assert.ok(letras(4) > letras(3));
  // o Enter: 4 pixels acesos, "tac" mais forte, pulo mais alto, uma linha nova e a barra enche
  const enter = PASSOS_DO_TECLANDO.findIndex((p) => p.tecla === TECLA_ENTER);
  assert.ok(enter > 0);
  assert.equal(pixels('teclando', enter, 'P').length, 4);
  assert.ok(pixels('teclando', enter, 's').length > pixels('teclando', 4, 's').length);
  assert.ok(Math.min(...PASSOS_DO_TECLANDO.slice(enter - 4, enter).map((p) => p.dy ?? 0)) < -3);
  assert.equal(barra(enter - 1), 0);
  assert.equal(barra(enter), 3);
  assert.equal(PASSOS_DO_TECLANDO[enter].linhas.length, 2);
  // depois do Enter ele olha a tela, piscando uma vez
  const olhando = PASSOS_DO_TECLANDO.map((p, i) => (p.pose === 'olha' ? i : -1)).filter((i) => i >= 0 && i < enter + 10);
  assert.equal(olhando.length, 4);
  assert.ok(olhando.some((i) => pixels('teclando', i, 'o').length === 0));
  // a barra só enche, até o fim; o laço recomeça vazio
  const ultimo = CENAS.teclando.quadros - 1;
  for (let i = 1; i <= ultimo; i++) assert.ok(PASSOS_DO_TECLANDO[i].progresso >= PASSOS_DO_TECLANDO[i - 1].progresso);
  assert.equal(barra(ultimo), 12);
  assert.equal(PASSOS_DO_TECLANDO[CENAS.teclando.parado].pose, 'olha');
});

test('Corvo placa: confuso — tira a placa em branco, vira e aparece o "?", guarda e coça a cabeça com "?" no ar', () => {
  const comPlaca = (i: number) => pixels('placa', i, 'm').length > 0;
  assert.ok(!comPlaca(0));
  assert.ok(comPlaca(CENAS.placa.parado));
  assert.ok(!comPlaca(CENAS.placa.quadros - 1));
  // a placa sai em branco; vira (fica estreita) e só então aparece o "?"
  const primeira = PASSOS_DA_PLACA.findIndex((p) => p.placa);
  assert.ok(PASSOS_DA_PLACA[primeira].semInterrogacao);
  assert.equal(pixels('placa', primeira, 'q').length, 0);
  const deLado = PASSOS_DA_PLACA.findIndex((p) => p.largura === 1);
  assert.ok(deLado > primeira);
  assert.equal(pixels('placa', deLado, 'n').length, 0);
  assert.ok(PASSOS_DA_PLACA.slice(primeira, deLado).every((p) => p.semInterrogacao));
  assert.ok(pixels('placa', CENAS.placa.parado, 'q').length > 0);
  // a asa-braço só aparece quando ele mexe a asa
  assert.equal(pixels('placa', 0, 'A').length, 0);
  assert.ok(pixels('placa', CENAS.placa.parado, 'A').length > 0);
  const d = caminhos(quadro('placa', CENAS.placa.parado));
  assert.match(d.o, /^M\d+ \d+h1v1h-1zM\d+ \d+h1v1h-1z$/);
  // o corpo não muda de altura: os pés ficam sempre na mesma linha
  const pes = (i: number) => Math.max(...pixels('placa', i, 'b').map((p) => Number(p.split(',')[1])));
  PASSOS_DA_PLACA.forEach((_, i) => assert.equal(pes(i), pes(0), `placa ${i}: mudou de altura`));
  // coçando a cabeça: a asa de capa daquele lado some (vira braço) e os "?" sobem
  const cocando = PASSOS_DA_PLACA.map((p, i) => (p.coca !== undefined ? i : -1)).filter((i) => i >= 0);
  assert.ok(cocando.length >= 4);
  const capaEsquerda = (i: number) => pixels('placa', i, 'W').filter((p) => Number(p.split(',')[0]) < 13).length;
  assert.ok(capaEsquerda(0) > 0);
  cocando.forEach((i) => assert.equal(capaEsquerda(i), 0, `placa ${i}: sobra da asa`));
  assert.ok(cocando.some((i) => pixels('placa', i, 's').length > 2));
});

test('Festas: Natal de 24/11 a 06/01, em Brasília', () => {
  const em = (iso: string) => festaDoDia(new Date(iso));
  assert.equal(em('2026-11-24T02:59:00Z'), null); // 23/11, 23:59 em Brasília
  assert.equal(em('2026-11-24T03:00:00Z'), 'natal'); // 24/11, 00:00
  assert.equal(em('2026-12-25T12:00:00Z'), 'natal');
  assert.equal(em('2027-01-01T12:00:00Z'), 'natal');
  assert.equal(em('2027-01-07T02:59:00Z'), 'natal'); // 06/01, 23:59
  assert.equal(em('2027-01-07T03:00:00Z'), null); // 07/01
  assert.equal(em('2027-07-15T12:00:00Z'), null);
  assert.equal(em('2027-11-30T12:00:00Z'), 'natal'); // todo ano
});

test('Festas: o gorro cabe inteiro em todo quadro de toda animação e vira para o lado em que o corvo olha', () => {
  const conta = (l: string[], c: string) => l.join('').split(c).length - 1;
  for (const a of ANIMACOES) {
    for (let i = 0; i < CENAS[a].quadros; i++) {
      const sem = quadro(a, i);
      const com = enfeitar(sem, 'natal');
      assert.deepEqual(com.map((l) => l.length), sem.map((l) => l.length));
      // de perfil 16 pixels vermelhos, de frente 9: se faltar algum, o gorro saiu da cena
      const vermelho = conta(com, 'r') + conta(com, 'R');
      assert.ok(vermelho === 16 || vermelho === 9, `${a} ${i}: gorro cortado (${vermelho})`);
      assert.deepEqual(enfeitar(sem, null), sem);
    }
  }
  // o pompom fica atrás da cabeça: à esquerda olhando para a direita, à direita olhando para trás
  const pompomX = (l: string[]) => Math.min(...l.flatMap((x, y) => [...x].map((c, k) => (c === 'g' && y < 6 + MARGEM_ENFEITE ? k : 99))));
  const olhoX = (l: string[]) => l.map((x) => x.indexOf('o')).find((k) => k >= 0)!;
  const parado = enfeitar(quadro('cabeca', 0), 'natal');
  assert.ok(pompomX(parado) < olhoX(parado));
  const virado = PASSOS_DA_CABECA.findIndex((p) => p.pose === 'virado' && !p.olho);
  const deCostas = enfeitar(quadro('cabeca', virado), 'natal');
  const pompomMaisADireita = Math.max(...deCostas.flatMap((x) => [...x].map((c, k) => (c === 'g' ? k : -1))));
  assert.ok(pompomMaisADireita > olhoX(deCostas));
});

