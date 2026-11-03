import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CHAVE_BOOT_VISTO, deveMostrarBoot, linhasBoot } from '../src/features/dev-toys/boot';
import { forcaCrt, uniformsCrt } from '../src/features/dev-toys/crt/parametros';
import { normalizarPrefs } from '../src/features/dev-toys/prefs';
import { fimDeFrase, gerar, treinar } from '../src/features/dev-toys/toys/crawler/markov';
import { acrescentar, MAX_CORPUS, normalizarCorpus, normalizarOpcoes } from '../src/features/dev-toys/toys/crawler/memoria';
import { embaralhar, paraAscii, QUEBRA, separarTextos } from '../src/features/dev-toys/toys/crawler/textos';
import { PADRAO, criarCrawler, curvaDe, distancia, fabrik, ik, noAr, normalDaPerna, passo, peIdeal, quadril, rngDe, vizinhas } from '../src/features/dev-toys/toys/crawler/sim';
import { SKILL, aprender, efeitos, nivelDe, normalizarSkills, pontosLivres, SEM_SKILLS } from '../src/features/dev-toys/toys/crawler/habilidades';
import { distanciaAte } from '../src/features/dev-toys/toys/crawler/render';
import { PLANOS, estagioDe, mutar, normalizarGenoma, paramsDe, proximoEstagio, sortearGenoma, visualDe } from '../src/features/dev-toys/toys/crawler/genoma';
import { avaliar } from '../src/features/dev-toys/toys/crawler/nota';
import {
  FAMINTO, MAX_CRIATURAS, MS_POR_PONTO_DE_FOME, alimentar, aprenderSkill, atualizar, chocar, fomeAgora, gostei, normalizarViveiro, novaCriatura, registrarXerox, soltar,
} from '../src/features/dev-toys/toys/crawler/criaturas';

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

test('Crawler: pernas a cada 2 ou a cada 1 segmento, e a marcha vale nos dois', () => {
  assert.equal(criarCrawler(PADRAO, 100, 100, 1).pernas.length, 8, '8 segmentos: pares nos segmentos 1, 3, 5 e 7');
  const c = criarCrawler({ ...PADRAO, pernasACada: 1 }, 240, 150, 3);
  assert.equal(c.pernas.length, 14, '8 segmentos: um par em cada, menos a cabeça');
  for (let i = 0; i < 2000; i++) {
    passo(c, 1 / 60, { x: (i * 5) % 480, y: (i * 2) % 300 }, { largura: 480, altura: 300 });
    for (const p of c.pernas) if (noAr(p)) assert.ok(!vizinhas(c, p).some(noAr), `quadro ${i}`);
  }
});

test('Crawler: parado para ler, ele não anda, só vira para a palavra', () => {
  const c = criarCrawler(PADRAO, 100, 100, 1);
  const antes = { ...c.seg[0] };
  // parado, vira a 40% do giro: 90° em ~1,3 s
  for (let i = 0; i < 60; i++) passo(c, 1 / 60, { x: 100, y: 200 }, { largura: 480, altura: 300 }, true);
  assert.ok(c.ang > 1 && c.ang < Math.PI / 2 - 0.2, `ainda virando: ${c.ang}`);
  for (let i = 0; i < 60; i++) passo(c, 1 / 60, { x: 100, y: 200 }, { largura: 480, altura: 300 }, true);
  assert.deepEqual(c.seg[0], antes);
  assert.ok(Math.abs(c.ang - Math.PI / 2) < 0.05, `ângulo ${c.ang}`);
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
  assert.deepEqual(normalizarOpcoes(null), { aprendeDeSi: true });
  assert.deepEqual(normalizarOpcoes({ aprendeDeSi: false, guardar: false }), { aprendeDeSi: false });
});

test('Crawler: o genoma sai da seed, cresce com o estágio e muta um gene por vez', () => {
  assert.deepEqual(sortearGenoma(rngDe(5)), sortearGenoma(rngDe(5)));
  assert.notDeepEqual(sortearGenoma(rngDe(6)), sortearGenoma(rngDe(5)));
  const g = normalizarGenoma({ plano: 'centopeia' }, rngDe(5));
  assert.ok(g.segmentos >= 6 && g.segmentos <= 11 && g.alcance >= 12 && g.alcance <= 28);
  const tamanhos = (['larva', 'jovem', 'adulta', 'ancia'] as const).map((e) => paramsDe(g, e).segmentos);
  assert.deepEqual(tamanhos, [g.segmentos - 3, g.segmentos - 2, g.segmentos - 1, g.segmentos]);
  assert.ok(visualDe(g, 'larva').alcance < visualDe(g, 'ancia').alcance);
  assert.equal(visualDe(g, 'larva').cabeca, null);
  assert.equal(visualDe(g, 'jovem').cabeca, g.cabeca);
  assert.equal(visualDe({ ...g, cauda: 'leque' }, 'jovem').cauda, null);
  assert.equal(visualDe({ ...g, cauda: 'leque' }, 'adulta').cauda, 'leque');
  assert.equal(visualDe({ ...g, enfeite: 'pontos' }, 'adulta').enfeite, null);
  assert.equal(visualDe({ ...g, enfeite: 'pontos' }, 'ancia').enfeite, 'pontos');
  for (let s = 1; s <= 20; s++) {
    const { genoma, gene } = mutar(g, rngDe(s));
    const diferentes = (Object.keys(g) as (keyof typeof g)[]).filter((k) => genoma[k] !== g[k]);
    assert.ok(diferentes.length <= 1 && (diferentes.length === 0 || diferentes[0] === gene));
    assert.notEqual(gene, 'plano', 'o plano não muta');
  }
  assert.deepEqual(normalizarGenoma(g, rngDe(9)), g, 'genoma salvo volta igual');
  assert.ok(['circulo', 'losango', 'quadrado', 'anel'].includes(normalizarGenoma({ forma: 'triangulo' }, rngDe(9)).forma));
});

test('Crawler: estágios por experiência (ovo até a primeira palavra)', () => {
  assert.equal(estagioDe(500, false), 'ovo');
  assert.deepEqual([0, 149, 150, 399, 400, 899, 900].map((xp) => estagioDe(xp, true)), ['larva', 'larva', 'jovem', 'jovem', 'adulta', 'adulta', 'ancia']);
  assert.deepEqual(proximoEstagio(10), { estagio: 'jovem', xp: 150 });
  assert.equal(proximoEstagio(900), null);
});

test('Crawler: a nota do xerox premia coesão e mistura, e copiar trecho longo vale menos', () => {
  const corpus = separarTextos(readFileSync('src/features/dev-toys/toys/crawler/xerox.txt', 'utf8')).flat().filter((w) => w !== QUEBRA);
  const copia = avaliar(corpus.slice(0, 60), corpus, { tri: 59, bi: 0, recomeco: 0 });
  assert.equal(copia.mistura, 0, 'cópia literal não mistura nada');
  const m = treinar(corpus);
  let melhor = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const stats = { tri: 0, bi: 0, recomeco: 0 };
    const t = gerar(m, { alvo: 60, maximo: 110 }, rngDe(seed), stats);
    assert.ok(stats.tri + stats.bi + stats.recomeco >= t.length - 1, 'cada ligação escrita é contada');
    const n = avaliar(t, corpus, stats);
    assert.ok(n.nota >= 0 && n.nota <= 100);
    melhor = Math.max(melhor, n.nota);
  }
  assert.ok(melhor > copia.nota, `um xerox misturado (${melhor}) vale mais que a cópia (${copia.nota})`);
  assert.equal(avaliar([], corpus, { tri: 0, bi: 0, recomeco: 0 }).nota, 0);
});

test('Crawler: fome sobe com o tempo e cai comendo; faminto não ganha experiência; nunca morre', () => {
  const t0 = 1_000_000;
  const c = novaCriatura(1, 7, t0);
  assert.equal(c.nasceu, false);
  assert.equal(Math.round(fomeAgora(c, t0 + 10 * MS_POR_PONTO_DE_FOME)), 40);
  assert.equal(fomeAgora(c, t0 + 1000 * MS_POR_PONTO_DE_FOME), 100, 'teto em 100');
  const comeu = alimentar(c, 10, t0);
  assert.equal(comeu.nasceu, true, 'a primeira palavra choca o ovo');
  assert.equal(comeu.fome, 10);

  const r = registrarXerox(comeu, 'Um texto.', 80, t0, () => 0.99);
  assert.equal(r.xp, 80);
  assert.equal(r.criatura.xeroxes, 1);
  assert.equal(r.criatura.melhorNota, 80);
  const faminto = registrarXerox({ ...comeu, fome: FAMINTO }, 'Um texto.', 80, t0, () => 0.99);
  assert.equal(faminto.xp, 0);
  const evolui = registrarXerox({ ...comeu, xp: 100 }, 'Um texto.', 60, t0, () => 0.99);
  assert.equal(evolui.evoluiu, 'jovem');
  const muta = registrarXerox(comeu, 'Um texto.', 90, t0, () => 0);
  assert.ok(muta.mutou, 'nota alta pode mutar');
  assert.equal(registrarXerox(comeu, 'Um texto.', 84, t0, () => 0).mutou, null, 'nota baixa não muta');

  const g1 = gostei(r.criatura);
  assert.equal(g1.xp, 25);
  assert.equal(gostei(g1.criatura).xp, 0, 'gostei só uma vez por xerox');
});

test('Crawler: viveiro com até 6, um ativo, solto não volta, salvo estragado é ignorado', () => {
  let v = normalizarViveiro('lixo', 0);
  assert.deepEqual(v, { criaturas: [], ativa: null, proximoNumero: 1 });
  for (let i = 0; i < 8; i++) v = chocar(v, 100 + i, 0);
  assert.equal(v.criaturas.length, MAX_CRIATURAS);
  assert.deepEqual(v.criaturas.map((c) => c.numero), [1, 2, 3, 4, 5, 6]);
  assert.equal(v.ativa, v.criaturas[0].id);
  const primeira = v.criaturas[0];
  v = soltar(v, primeira.id);
  assert.equal(v.ativa, v.criaturas[0].id, 'soltou a ativa: a próxima assume');
  assert.equal(atualizar(v, { ...primeira, xp: 999 }), v, 'quem foi solto não volta ao salvar');
  assert.equal(chocar(v, 999, 0).criaturas.at(-1)?.numero, 7, 'a numeração não se repete');
  const salvo = normalizarViveiro(JSON.parse(JSON.stringify({ ...v, ativa: 'nao-existe' })), 0);
  assert.equal(salvo.ativa, salvo.criaturas[0].id);
  assert.deepEqual(salvo.criaturas[0].genoma, v.criaturas[0].genoma);
});

test('Crawler: quatro planos corporais bem diferentes, todos aparecem e cada um com o seu jeito', () => {
  const vistos = new Set<string>();
  for (let seed = 1; seed <= 60; seed++) {
    const g = sortearGenoma(rngDe(seed));
    vistos.add(g.plano);
    const p = paramsDe(g, 'ancia');
    if (g.plano === 'centopeia') { assert.equal(p.pares, 0); assert.ok(p.segmentos >= 6); }
    if (g.plano === 'aranha') { assert.equal(p.segmentos, 2); assert.ok(p.pares >= 3 && p.ossos >= 3 && g.perna >= 1.5); }
    if (g.plano === 'polvo') { assert.equal(p.segmentos, 1); assert.ok(p.ossos >= 6, 'tentáculos de muitos gomos'); }
    if (g.plano === 'caranguejo') { assert.equal(p.segmentos, 2); assert.ok(['caixa', 'quadrado'].includes(g.forma)); }
  }
  assert.deepEqual([...vistos].sort(), [...PLANOS].sort());
  const aranha = normalizarGenoma({ plano: 'aranha', pares: 4 }, rngDe(1));
  assert.ok(paramsDe(aranha, 'larva').pares < paramsDe(aranha, 'ancia').pares, 'ganha pernas ao crescer');
  const antigo = normalizarGenoma({ forma: 'anel', alcance: 81, segmentos: 8 }, rngDe(1));
  assert.equal(antigo.plano, 'centopeia', 'criatura de antes dos planos continua centopeia');
  assert.equal(antigo.forma, 'anel');
  assert.ok(antigo.alcance <= 28, 'o alcance antigo (até 110 px) é sorteado de novo');
});

test('Crawler: pernas em leque e de muitas juntas andam sem levantar vizinhas juntas', () => {
  for (const plano of ['aranha', 'polvo', 'caranguejo'] as const) {
    const params = paramsDe(normalizarGenoma({ plano }, rngDe(4)), 'ancia');
    const c = criarCrawler(params, 240, 150, 4);
    assert.equal(c.pernas.length, params.pares * 2);
    for (let i = 0; i < 1500; i++) {
      passo(c, 1 / 60, { x: (i * 7) % 480, y: (i * 3) % 300 }, { largura: 480, altura: 300 });
      for (const p of c.pernas) if (noAr(p)) assert.ok(!vizinhas(c, p).some(noAr), `${plano}, quadro ${i}`);
    }
  }
});

test('Crawler: a IK de muitas juntas mantém os ossos, alcança o alvo e curva para fora', () => {
  const ossos = [10, 9, 8, 7, 6];
  const raiz = { x: 0, y: 0 };
  const j = fabrik(raiz, { x: 25, y: 5 }, ossos, { x: 0, y: 1 });
  assert.equal(j.length, 6);
  ossos.forEach((o, i) => assert.ok(Math.abs(distancia(j[i], j[i + 1]) - o) < 1e-6, `osso ${i}`));
  assert.ok(distancia(j[5], { x: 25, y: 5 }) < 0.5, 'o pé chega no alvo');
  assert.ok(j.slice(1, 5).some((p) => p.y > 5), 'a curva vai para fora');
  const longe = fabrik(raiz, { x: 100, y: 0 }, ossos, { x: 0, y: 1 });
  assert.ok(Math.abs(longe[5].x - 40) < 1e-6 && Math.abs(longe[5].y) < 1e-6, 'fora do alcance, estica');
});

test('Crawler: o raio só alcança palavras perto da boca (medido até a borda da palavra)', () => {
  const palavra = { x: 100, y: 50, w: 40, h: 20 };
  assert.equal(distanciaAte({ x: 120, y: 60 }, palavra), 0, 'dentro');
  assert.equal(distanciaAte({ x: 90, y: 60 }, palavra), 10);
  assert.equal(Math.round(distanciaAte({ x: 150, y: 80 }, palavra)), 14);
  for (let seed = 1; seed <= 40; seed++) {
    const g = sortearGenoma(rngDe(seed));
    assert.ok(visualDe(g, 'larva').alcance <= 22 && visualDe(g, 'ancia').alcance <= 28);
  }
});

test('Crawler: andando e virando, o joelho não troca de lado e a perna não fica torta nem esticada', () => {
  for (const plano of PLANOS) {
    for (const seed of [3, 4, 7]) {
      const params = paramsDe(normalizarGenoma({ plano }, rngDe(seed)), 'ancia');
      const c = criarCrawler(params, 240, 150, seed);
      const lados = c.pernas.map((p) => p.dobra);
      let trocas = 0;
      let tortas = 0;
      let esticadas = 0;
      let quadros = 0;
      for (let i = 0; i < 3000; i++) {
        // palavras espalhadas: vai até uma, para e lê (virando devagar), vai até a próxima
        const j = Math.floor(i / 300);
        passo(c, 1 / 60, { x: 40 + ((j * 137) % 400), y: 30 + ((j * 71) % 240) }, { largura: 480, altura: 300 }, i % 300 > 180);
        c.pernas.forEach((p, k) => {
          if (lados[k] !== p.dobra) trocas++;
          lados[k] = p.dobra;
          const q = quadril(c, p);
          const ideal = peIdeal(c, p);
          const a = { x: p.pe.x - q.x, y: p.pe.y - q.y };
          const b = { x: ideal.x - q.x, y: ideal.y - q.y };
          if ((a.x * b.x + a.y * b.y) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)) < 0.5) tortas++;
          if (!noAr(p) && Math.hypot(a.x, a.y) > 0.97 * (params.coxa + params.canela)) esticadas++;
          quadros++;
          const n = normalDaPerna(c, p);
          const cv = curvaDe(c, p);
          assert.ok((n.x * cv.x + n.y * cv.y) * p.dobra > -0.36, `${plano} ${seed}: dobra para dentro além da folga`);
        });
      }
      assert.ok(trocas <= 2, `${plano} ${seed}: o joelho trocou de lado ${trocas} vezes`);
      assert.ok(tortas / quadros < 0.01, `${plano} ${seed}: perna torta em ${((100 * tortas) / quadros).toFixed(1)}% dos quadros`);
      assert.ok(esticadas / quadros < 0.08, `${plano} ${seed}: pé no chão esticado em ${((100 * esticadas) / quadros).toFixed(1)}% dos quadros`);
    }
  }
});

test('Crawler: perna comprida vira mais devagar que a centopeia', () => {
  const centopeia = paramsDe(normalizarGenoma({ plano: 'centopeia', velocidade: 1, perna: 1 }, rngDe(2)), 'ancia');
  const aranha = paramsDe(normalizarGenoma({ plano: 'aranha', velocidade: 1, perna: 2 }, rngDe(2)), 'ancia');
  assert.equal(centopeia.giroMax, PADRAO.giroMax);
  assert.ok(aranha.giroMax < PADRAO.giroMax * 0.75, `aranha vira a ${aranha.giroMax}`);
});

test('Crawler: um nível a cada 100 XP, um ponto de skill por nível, cada skill com o seu máximo', () => {
  assert.equal(nivelDe(0), 1);
  assert.equal(nivelDe(99), 1);
  assert.equal(nivelDe(100), 2);
  assert.equal(nivelDe(1250), 13);
  assert.equal(pontosLivres(50, SEM_SKILLS), 0);
  assert.equal(aprender(50, SEM_SKILLS, 'leitura'), SEM_SKILLS, 'sem ponto, não aprende');
  let s = aprender(250, SEM_SKILLS, 'palavras');
  s = aprender(250, s, 'palavras');
  assert.deepEqual(s, { ...SEM_SKILLS, palavras: 2 });
  assert.equal(pontosLivres(250, s), 0);
  assert.equal(aprender(9000, s, 'palavras'), s, 'Mais palavras para em 2 (3 palavras)');
  for (let i = 0; i < 15; i++) s = aprender(9000, s, 'leitura');
  assert.equal(s.leitura, SKILL.leitura.max);
  assert.deepEqual(
    efeitos({ leitura: 10, palavras: 2, movimento: 10, faro: 3, raio: 5, estomago: 5, gula: 4, revisor: 2 }),
    { leitura: 1.5, palavras: 3, movimento: 1.2, faro: 36, raio: 10, fome: 0.5, fomePorPalavra: 4, rascunhos: 3 },
  );
  assert.deepEqual(efeitos(SEM_SKILLS), { leitura: 1, palavras: 1, movimento: 1, faro: 0, raio: 0, fome: 1, fomePorPalavra: 2, rascunhos: 1 });
  assert.deepEqual(normalizarSkills({ leitura: 99, palavras: -3, movimento: 'x', revisor: 7 }), { ...SEM_SKILLS, leitura: 10, revisor: 2 });
  assert.deepEqual(normalizarSkills(undefined), SEM_SKILLS);
});

test('Crawler: subir de nível avisa, o ponto vai para uma skill e criaturas de antes chegam com os pontos do XP', () => {
  const c = { ...novaCriatura(1, 9, 0), nasceu: true, fome: 0, xp: 90 };
  const r = registrarXerox(c, 'Time moves on.', 40, 0, () => 0.99);
  assert.equal(r.subiu, 2);
  assert.equal(registrarXerox(r.criatura, 'x.', 40, 0, () => 0.99).subiu, null);
  const aprendeu = aprenderSkill(r.criatura, 'movimento');
  assert.equal(aprendeu.skills.movimento, 1);
  assert.equal(aprenderSkill(aprendeu, 'movimento'), aprendeu, 'sem ponto sobrando, nada muda');
  const antiga = normalizarViveiro({ criaturas: [{ id: 'a', numero: 1, seed: 3, xp: 340 }] }, 0).criaturas[0];
  assert.deepEqual(antiga.skills, SEM_SKILLS);
  assert.equal(pontosLivres(antiga.xp, antiga.skills), 3);
});

test('Crawler: Estômago faz a fome subir mais devagar e Gula faz cada palavra tirar mais', () => {
  const base = { ...novaCriatura(1, 9, 0), fome: 20 };
  const horas10 = 10 * 6 * MS_POR_PONTO_DE_FOME; // 60 pontos sem skill
  assert.equal(fomeAgora(base, horas10), 80);
  assert.equal(fomeAgora({ ...base, skills: { ...base.skills, estomago: 5 } }, horas10), 50);
  assert.equal(alimentar(base, 10, 0).fome, 0);
  const comFome = { ...base, fome: 60 };
  assert.equal(alimentar(comFome, 10, 0).fome, 40);
  assert.equal(alimentar({ ...comFome, skills: { ...base.skills, gula: 4 } }, 10, 0).fome, 20);
});
