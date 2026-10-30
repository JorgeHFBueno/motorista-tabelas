import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CHAVE_BOOT_VISTO, deveMostrarBoot, linhasBoot } from '../src/features/dev-toys/boot';
import { forcaCrt, uniformsCrt } from '../src/features/dev-toys/crt/parametros';
import { normalizarPrefs } from '../src/features/dev-toys/prefs';
import { fimDeFrase, gerar, treinar } from '../src/features/dev-toys/toys/crawler/markov';
import { acrescentar, MAX_CORPUS, normalizarCorpus, normalizarOpcoes } from '../src/features/dev-toys/toys/crawler/memoria';
import { embaralhar, paraAscii, QUEBRA, separarTextos } from '../src/features/dev-toys/toys/crawler/textos';
import { PADRAO, crescer, criarCrawler, distancia, ik, noAr, paramsDaSeed, passo, rngDe, vizinhas } from '../src/features/dev-toys/toys/crawler/sim';

const sessao = (valores: Record<string, string>) => ({ getItem: (k: string) => valores[k] ?? null });

test('boot do /dev: uma vez por sessão, ou sempre pela preferência', () => {
  assert.equal(deveMostrarBoot(false, sessao({})), true);
  assert.equal(deveMostrarBoot(false, sessao({ [CHAVE_BOOT_VISTO]: '1' })), false);
  assert.equal(deveMostrarBoot(true, sessao({ [CHAVE_BOOT_VISTO]: '1' })), true);
  assert.equal(deveMostrarBoot(false, null), true, 'sem sessionStorage, mostra');
  assert.equal(deveMostrarBoot(false, { getItem: () => { throw new Error('bloqueado'); } }), true);
});

test('boot do /dev: texto sem acento, com build, rede e PWA, e nada além disso', () => {
  const linhas = linhasBoot({ modo: 'production', online: false, serviceWorker: true });
  assert.ok(linhas.includes('BUILD .............. PRODUCTION'));
  assert.ok(linhas.includes('NETWORK ............ OFFLINE'));
  assert.ok(linhas.includes('PWA ................ SERVICE WORKER OK'));
  assert.ok(linhasBoot({ modo: 'dev', online: true, serviceWorker: false }).includes('PWA ................ SEM SERVICE WORKER'));
  // A Monaco não tem acentos nem reticências.
  for (const linha of linhas) assert.match(linha, /^[\x20-\x7E]*$/, linha);
  assert.doesNotMatch(linhas.join('\n'), /@|uid/i);
});

test('preferências do /dev: valor salvo inválido volta ao padrão (CRT ligado, média)', () => {
  assert.deepEqual(normalizarPrefs(null), { bootSempre: false, crt: true, crtIntensidade: 'media' });
  assert.deepEqual(normalizarPrefs({ bootSempre: true }), { bootSempre: true, crt: true, crtIntensidade: 'media' }, 'prefs da fase 2 continuam valendo');
  assert.deepEqual(normalizarPrefs({ crt: false, crtIntensidade: 'alta' }), { bootSempre: false, crt: false, crtIntensidade: 'alta' });
  assert.equal(normalizarPrefs({ crtIntensidade: 'maxima', crt: 'nao' }).crtIntensidade, 'media');
  assert.equal(normalizarPrefs({ crt: 'nao' }).crt, true);
});

test('CRT: força por intensidade, valores do plano na média, desligado zera e movimento reduzido tira ruído e flicker', () => {
  assert.equal(forcaCrt(false, 'alta'), 0);
  assert.ok(forcaCrt(true, 'baixa') < forcaCrt(true, 'media') && forcaCrt(true, 'media') < forcaCrt(true, 'alta'));
  assert.equal(forcaCrt(true, 'alta'), 1);

  const media = uniformsCrt(forcaCrt(true, 'media'), false);
  assert.deepEqual(media, { curva: 0.08, scan: 0.25, vinheta: 0.25, aberracao: 1, ruido: 0.03, flicker: 1 });
  assert.deepEqual(uniformsCrt(0, false), { curva: 0, scan: 0, vinheta: 0, aberracao: 0, ruido: 0, flicker: 0 });
  const reduzido = uniformsCrt(forcaCrt(true, 'media'), true);
  assert.equal(reduzido.ruido, 0);
  assert.equal(reduzido.flicker, 0);
  assert.equal(reduzido.curva, 0.08);
});

test('Crawler: os segmentos mantêm a distância fixa enquanto a cabeça corre atrás de alvos', () => {
  const c = criarCrawler(PADRAO, 200, 150, 7);
  const limites = { largura: 480, altura: 300 };
  const rng = rngDe(3);
  let alvo = { x: 400, y: 50 };
  for (let i = 0; i < 3000; i++) {
    if (i % 200 === 0) alvo = { x: rng() * 480, y: rng() * 300 };
    passo(c, 1 / 60, i % 600 < 300 ? alvo : null, limites);
    for (let s = 1; s < c.seg.length; s++) assert.ok(Math.abs(distancia(c.seg[s], c.seg[s - 1]) - PADRAO.dist) < 1e-6, `segmento ${s} no quadro ${i}`);
    assert.ok(c.seg[0].x >= 0 && c.seg[0].x <= 480 && c.seg[0].y >= 0 && c.seg[0].y <= 300, 'a cabeça fica dentro da janela');
  }
});

test('Crawler: a IK fecha dentro do alcance, estica fora dele e dobra o joelho para fora', () => {
  const q = { x: 0, y: 0 };
  const dentro = ik(q, { x: 20, y: 10 }, 14, 18, { x: 0, y: 1 });
  assert.ok(Math.abs(distancia(q, dentro.joelho) - 14) < 1e-6);
  assert.ok(Math.abs(distancia(dentro.joelho, { x: 20, y: 10 }) - 18) < 1e-4, 'o pé chega no alvo');
  assert.ok(dentro.joelho.y > 0, 'joelho do lado de fora');
  const outroLado = ik(q, { x: 20, y: 10 }, 14, 18, { x: 0, y: -1 });
  assert.ok(outroLado.joelho.y < dentro.joelho.y);
  const longe = ik(q, { x: 100, y: 0 }, 14, 18, { x: 0, y: 1 });
  assert.ok(Math.abs(distancia(q, longe.pe) - 32) < 1e-4, 'fora do alcance, a perna estica na direção do alvo');
  assert.ok(Math.abs(longe.pe.y) < 1e-6);
});

test('Crawler: pernas vizinhas nunca estão no ar juntas, e a marcha acontece', () => {
  const c = criarCrawler(PADRAO, 240, 150, 11);
  const limites = { largura: 480, altura: 300 };
  let passos = 0;
  const antes = new Map(c.pernas.map((p) => [p, noAr(p)]));
  for (let i = 0; i < 4000; i++) {
    passo(c, 1 / 60, i % 1000 < 500 ? { x: (i * 7) % 480, y: (i * 3) % 300 } : null, limites);
    for (const p of c.pernas) {
      if (noAr(p) && !antes.get(p)) passos++;
      antes.set(p, noAr(p));
      if (noAr(p)) assert.ok(!vizinhas(c, p).some(noAr), `quadro ${i}: perna ${p.segmento}/${p.lado} e uma vizinha no ar`);
    }
  }
  assert.ok(passos > 100, `poucos passos: ${passos}`);
  assert.equal(c.pernas.length, 8, '8 segmentos: pares nos segmentos 1, 3, 5 e 7');
});

test('Crawler: comer acrescenta um segmento e um par de pernas a cada dois; a seed fixa o bicho', () => {
  const c = criarCrawler(PADRAO, 100, 100, 1);
  crescer(c);
  assert.equal(c.seg.length, 9);
  assert.equal(c.pernas.length, 8, '9 segmentos: pernas ainda nos segmentos 1, 3, 5 e 7');
  crescer(c);
  assert.equal(c.seg.length, 10);
  assert.equal(c.pernas.length, 10, 'o segmento 9 ganha um par');
  assert.ok(Math.abs(distancia(c.seg[9], c.seg[8]) - PADRAO.dist) < 1e-6);
  const cheio = criarCrawler({ ...PADRAO, segmentosMax: 9 }, 100, 100, 1);
  crescer(cheio);
  crescer(cheio);
  assert.equal(cheio.seg.length, 9, 'para no máximo');

  assert.deepEqual(paramsDaSeed(42), paramsDaSeed(42));
  assert.notDeepEqual(paramsDaSeed(42), paramsDaSeed(43));
  const p = paramsDaSeed(42);
  assert.ok(p.segmentos >= 6 && p.segmentos <= 10);
});

test('Crawler: o mini-LLM aprende pares, trios e inícios de frase', () => {
  const m = treinar('Time moves forward. Nothing changes. Time moves on.'.split(' '));
  assert.deepEqual(m.inicios, ['Time', 'Nothing', 'Time']);
  assert.deepEqual(m.bi.get('Time'), ['moves', 'moves']);
  assert.deepEqual(m.tri.get('Time moves'), ['forward.', 'on.']);
  assert.ok(fimDeFrase('end.') && fimDeFrase('what?"') && fimDeFrase('ok!)') && !fimDeFrase('comma,'));
  assert.deepEqual(gerar(treinar([]), { alvo: 5, maximo: 10 }, rngDe(1)), []);
});

test('Crawler: o mini-LLM escreve frases inteiras com o que viu, sem inventar ligações', () => {
  const corpus = separarTextos(readFileSync('src/features/dev-toys/toys/crawler/xerox.txt', 'utf8')).flat().filter((w) => w !== QUEBRA);
  const m = treinar(corpus);
  const pares = new Set(corpus.slice(1).map((w, i) => `${corpus[i]} ${w}`));
  for (let seed = 1; seed <= 30; seed++) {
    const t = gerar(m, { alvo: 60, maximo: 110 }, rngDe(seed));
    assert.ok(m.inicios.includes(t[0]), `seed ${seed}: começa onde uma frase começava`);
    assert.ok(fimDeFrase(t[t.length - 1]), `seed ${seed}: termina em ponto final (${t.slice(-3).join(' ')})`);
    assert.ok(t.length >= 30 && t.length <= 110, `seed ${seed}: ${t.length} palavras`);
    const frases = t.join(' ').split(/(?<=[.!?]["')\]]*) /);
    assert.equal(new Set(frases).size, frases.length, `seed ${seed}: frase repetida`);
    for (let i = 1; i < t.length; i++) {
      const ligacao = pares.has(`${t[i - 1]} ${t[i]}`);
      const recomeco = m.inicios.includes(t[i]); // frase nova ou beco sem saída
      assert.ok(ligacao || recomeco, `seed ${seed}: "${t[i - 1]} ${t[i]}"`);
    }
  }
});

test('Crawler: textos separados por "- " no início da linha, com quebras de verso e estrofe, em ASCII', () => {
  const bruto = '- Um texto\n\n- Antigonish\nYesterday, upon the stair,\n\n\nI met a man\n- Prosa \u201Ccom\u201D o\u2019 \u2014 fim\u2026 caf\u00e9\n';
  const t = separarTextos(bruto);
  assert.equal(t.length, 3);
  assert.deepEqual(t[0], ['Um', 'texto']);
  assert.deepEqual(t[1], ['Antigonish', QUEBRA, 'Yesterday,', 'upon', 'the', 'stair,', QUEBRA, QUEBRA, 'I', 'met', 'a', 'man'], 'linha em branco vira fim de estrofe, no máximo duas quebras');
  assert.deepEqual(t[2], ['Prosa', '"com"', "o'", '-', 'fim...', 'cafe']);
  assert.equal(paraAscii('\u00e1 \u00e7 \u00f1 \u2014 \u2026'), 'a c n - ...');
  assert.equal(separarTextos('sem marcador').length, 0);
});

test('Crawler: o arquivo Xerox de um Xerox tem 18 textos, todos em ASCII, e os poemas guardam os versos', () => {
  const textos = separarTextos(readFileSync('src/features/dev-toys/toys/crawler/xerox.txt', 'utf8'));
  assert.equal(textos.length, 18);
  for (const t of textos) {
    assert.ok(t.length > 0);
    for (const w of t) assert.match(w, /^([\x21-\x7E]+|\n)$/, w);
  }
  const antigonish = textos.find((t) => t[0] === 'Antigonish');
  assert.ok(antigonish && antigonish.filter((w) => w === QUEBRA).length >= 8);
});

test('Crawler: a ordem dos textos usa cada um uma vez por volta', () => {
  const ordem = embaralhar(16, rngDe(42));
  assert.deepEqual([...ordem].sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i));
  assert.deepEqual(embaralhar(16, rngDe(42)), ordem);
});

test('Crawler: o aprendizado só cresce até o teto e as opções vêm ligadas', () => {
  assert.deepEqual(acrescentar(['a', 'b'], ['c'], 3), ['a', 'b', 'c']);
  assert.deepEqual(acrescentar(['a', 'b', 'c'], ['d', 'e'], 3), ['c', 'd', 'e'], 'guarda as últimas');
  assert.equal(acrescentar([], Array(MAX_CORPUS + 10).fill('x')).length, MAX_CORPUS);
  assert.deepEqual(normalizarCorpus(['a', 1, '', 'b', null]), ['a', 'b']);
  assert.deepEqual(normalizarCorpus('lixo'), []);
  assert.deepEqual(normalizarOpcoes(null), { aprendeDeSi: true, guardar: true });
  assert.deepEqual(normalizarOpcoes({ aprendeDeSi: false }), { aprendeDeSi: false, guardar: true });
});
