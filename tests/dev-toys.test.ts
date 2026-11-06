import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CHAVE_BOOT_VISTO, deveMostrarBoot, linhasBoot } from '../src/features/dev-toys/boot';
import { forcaCrt, uniformsCrt } from '../src/features/dev-toys/crt/parametros';
import { normalizarPrefs } from '../src/features/dev-toys/prefs';
import { fimDeFrase, gerar, treinar } from '../src/features/dev-toys/toys/crawler/markov';
import { acrescentar, MAX_CORPUS, normalizarCorpus, normalizarOpcoes } from '../src/features/dev-toys/toys/crawler/memoria';
import { embaralhar, paraAscii, QUEBRA, separarTextos } from '../src/features/dev-toys/toys/crawler/textos';
import { PADRAO, criarCrawler, curvaDe, curvaDesenhada, distancia, fabrik, ik, noAr, normalDaPerna, passo, peIdeal, quadril, rngDe, vizinhas } from '../src/features/dev-toys/toys/crawler/sim';
import { SKILL, aprender, efeitos, nivelDe, normalizarSkills, pontosLivres, SEM_SKILLS } from '../src/features/dev-toys/toys/crawler/habilidades';
import { distanciaAte } from '../src/features/dev-toys/toys/crawler/render';
import { PLANOS, estagioDe, mutar, normalizarGenoma, paramsDe, proximoEstagio, sortearGenoma, visualDe } from '../src/features/dev-toys/toys/crawler/genoma';
import { SEM_APARENCIA, aparenciaDe, todasNoMaximo } from '../src/features/dev-toys/toys/crawler/aparencia';
import { avaliar } from '../src/features/dev-toys/toys/crawler/nota';
import {
  FAMINTO, MAX_CRIATURAS, MS_POR_PONTO_DE_FOME, alimentar, aprenderSkill, atualizar, chocar, fomeAgora, gostei, normalizarViveiro, novaCriatura, registrarXerox, soltar,
} from '../src/features/dev-toys/toys/crawler/criaturas';
import { embaralhar as embaralharCartas, nomeDaCarta, novoBaralho, rotuloDe, type Carta } from '../src/features/dev-toys/toys/cartas/baralho';
import {
  distribuir, dobrar, mesaNova, parar, pedir, podeDobrar, pontos, retorno,
  type Mesa,
} from '../src/features/dev-toys/toys/vinteum/regras';
import {
  CUSTO_SKILL, FICHAS_INICIAIS, MESADA, hojeEmBrasilia, mover, normalizarCarteira, pegarMesada, pilhas, podeMesada, podePagarSkill, semFichas,
} from '../src/features/dev-toys/toys/fichas/carteira';
import { PLACAR_NOVO, normalizarPlacar, registrarJogada, taxaDeVitorias } from '../src/features/dev-toys/toys/fichas/jogos';
import * as pk from '../src/features/dev-toys/toys/poker/maos';
import * as pm from '../src/features/dev-toys/toys/poker/mesa';
import { chance, decidir, novoBot } from '../src/features/dev-toys/toys/poker/bots';
import * as xz from '../src/features/dev-toys/toys/xadrez/regras';
import { NIVEIS, escolherLance } from '../src/features/dev-toys/toys/xadrez/bot';
import * as slot from '../src/features/dev-toys/toys/slot/regras';
import * as rg from '../src/features/dev-toys/toys/regras/exemplos';
import { ALEATORIA, retornoDe as retornoXadrez, sortearNivel } from '../src/features/dev-toys/toys/xadrez/bot';
import { MAX_HISTORICO, acrescentar as acrescentarLancamento, normalizarHistorico, resumo } from '../src/features/dev-toys/toys/fichas/historico';

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

test('Crawler: o joelho dobra para fora na aranha e no polvo, e para onde a perna abre na centopeia e no caranguejo', () => {
  for (const plano of PLANOS) {
    for (const seed of [3, 4, 7]) {
      const c = criarCrawler(paramsDe(normalizarGenoma({ plano }, rngDe(seed)), 'ancia'), 240, 150, seed);
      for (const p of c.pernas) {
        const cv = curvaDe(c, p); // virado para a direita: frente = +x, lado de fora = +y vezes o lado
        if (plano === 'aranha' || plano === 'polvo') assert.ok(cv.y * p.lado > 0, `${plano} ${seed}: para fora`);
        else assert.ok(cv.x * (p.abertura < 0 ? -1 : 1) > 0, `${plano} ${seed}: ordem ${p.ordem} para onde abre`);
      }
    }
  }
});

test('Crawler: o tentáculo de trás do polvo nunca curva para dentro (larva de 2 pares e adulto)', () => {
  for (const estagio of ['larva', 'ancia'] as const) {
    for (const seed of [3, 4, 7, 11]) {
      const c = criarCrawler(paramsDe(normalizarGenoma({ plano: 'polvo' }, rngDe(seed)), estagio), 240, 150, seed);
      const ultima = c.params.pares - 1;
      for (const p of c.pernas.filter((q) => q.ordem === 0 || q.ordem === ultima)) {
        const fora = curvaDesenhada(c, p, true); // virado para a direita: lado de fora = +y vezes o lado
        assert.ok(fora.y * p.lado > 0, `polvo ${estagio} ${seed}: ordem ${p.ordem} de ${c.params.pares} para fora`);
      }
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

const cartas = (...valores: number[]): Carta[] => valores.map((valor) => ({ valor, naipe: 'espadas' }));
const mesa21 = (jogador: number[], banca: number[], baralho: number[], aposta = 10, fichas = 190): Mesa => ({
  jogador: cartas(...jogador), banca: cartas(...banca), baralho: cartas(...baralho), aposta, fichas, fase: 'jogando', resultado: null,
});

test('Cartas: 52 cartas diferentes, embaralhadas pela semente, com rótulo e nome sem acento', () => {
  const b = novoBaralho();
  assert.equal(b.length, 52);
  assert.equal(new Set(b.map((c) => `${c.valor}${c.naipe}`)).size, 52);
  assert.deepEqual(embaralharCartas(b, rngDe(3)), embaralharCartas(b, rngDe(3)));
  assert.notDeepEqual(embaralharCartas(b, rngDe(3)), b);
  assert.deepEqual(b[0], { valor: 1, naipe: 'espadas' }, 'embaralhar não mexe no original');
  assert.deepEqual([1, 7, 10, 11, 12, 13].map((valor) => rotuloDe({ valor, naipe: 'copas' })), ['A', '7', '10', 'J', 'Q', 'K']);
  assert.equal(nomeDaCarta({ valor: 1, naipe: 'ouros' }), 'As de ouros');
});

test('21: ás vale 11 enquanto não estoura, figuras valem 10', () => {
  assert.deepEqual(pontos(cartas(1, 13)), { total: 21, macia: true });
  assert.deepEqual(pontos(cartas(1, 1, 9)), { total: 21, macia: true });
  assert.deepEqual(pontos(cartas(1, 5, 10)), { total: 16, macia: false });
  assert.equal(pontos(cartas(12, 13, 2)).total, 22);
});

test('21: a banca pede até 17 e para em qualquer 17; estourar, 21, dobrar e pagamentos', () => {
  const ganhou = parar(mesa21([10, 8], [10, 6], [1, 5]));
  assert.equal(pontos(ganhou.banca).total, 17, 'a banca comprou o ás e parou');
  assert.equal(ganhou.resultado, 'ganhou');
  assert.equal(ganhou.fichas, 210);
  const empate = parar(mesa21([10, 7], [1, 6], [5]));
  assert.equal(empate.banca.length, 2, 'para no 17 macio');
  assert.equal(empate.resultado, 'empate');
  assert.equal(empate.fichas, 200);
  const estourou = pedir(mesa21([10, 6], [10, 7], [9]));
  assert.equal(estourou.resultado, 'estourou');
  assert.equal(estourou.fichas, 190);
  const vinteUm = pedir(mesa21([10, 5], [10, 7], [6, 2]));
  assert.equal(vinteUm.fase, 'fim', 'com 21 para sozinho');
  assert.equal(vinteUm.resultado, 'ganhou');
  const dobrou = dobrar(mesa21([5, 6], [10, 6], [10, 10]));
  assert.equal(dobrou.aposta, 20);
  assert.equal(dobrou.jogador.length, 3, 'dobrar compra só uma');
  assert.equal(dobrou.resultado, 'banca-estourou');
  assert.equal(dobrou.fichas, 220);
  assert.equal(podeDobrar(mesa21([2, 3, 4], [10, 7], [])), false, 'só com 2 cartas');
  assert.equal(podeDobrar(mesa21([5, 6], [10, 7], [], 10, 5)), false, 'sem fichas para dobrar');
  assert.equal(retorno('blackjack', 10), 25, 'blackjack paga 3:2');
  assert.equal(retorno('banca-blackjack', 10), 0);
  assert.equal(pedir(estourou), estourou, 'mão encerrada não muda');
});

test('21: distribuir desconta a aposta, recusa aposta sem fichas e o blackjack paga na hora', () => {
  const pobre = mesaNova(5);
  assert.equal(distribuir(pobre, 10, rngDe(1)), pobre);
  let blackjacks = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const m = distribuir(mesaNova(200), 10, rngDe(seed));
    assert.equal(m.jogador.length + m.banca.length + m.baralho.length, 52);
    if (m.fase === 'jogando') assert.equal(m.fichas, 190);
    if (m.resultado === 'blackjack') { blackjacks++; assert.equal(m.fichas, 215); }
  }
  assert.ok(blackjacks > 5, `${blackjacks} blackjacks em 400 mãos`);
});

test('Fichas: a carteira começa com 200 (ou com as fichas do 21 antigo), guarda o recorde e dá a mesada uma vez por dia', () => {
  const nova = normalizarCarteira(null);
  assert.deepEqual(nova, { fichas: 200, recorde: 200, mesadas: 0, ultimaMesada: null });
  assert.equal(FICHAS_INICIAIS, 200);
  const doLegado = normalizarCarteira(null, { fichas: 340, recorde: 410, emprestimos: 3, maos: 9 });
  assert.deepEqual(doLegado, { fichas: 340, recorde: 410, mesadas: 0, ultimaMesada: null }, 'fichas e recorde vêm do 21 antigo');
  assert.deepEqual(normalizarCarteira({ fichas: -5, ultimaMesada: 'ontem' }), nova, 'salvo estragado volta ao padrão');

  assert.deepEqual(mover(nova, 50), { ...nova, fichas: 250, recorde: 250 });
  assert.equal(mover(nova, -500).fichas, 0, 'não fica negativa');

  const quebrada = { ...nova, fichas: 5 };
  assert.equal(semFichas(quebrada), true);
  assert.equal(podeMesada(nova, '2026-11-03'), false, 'com fichas, sem mesada');
  const comMesada = pegarMesada(quebrada, '2026-11-03');
  assert.deepEqual(comMesada, { fichas: 205, recorde: 205, mesadas: 1, ultimaMesada: '2026-11-03' });
  const deNovoQuebrada = { ...comMesada, fichas: 0 };
  assert.equal(pegarMesada(deNovoQuebrada, '2026-11-03'), deNovoQuebrada, 'uma por dia');
  assert.equal(pegarMesada(deNovoQuebrada, '2026-11-04').fichas, MESADA, 'no dia seguinte, outra');
  assert.equal(hojeEmBrasilia(new Date('2026-11-04T02:30:00Z')), '2026-11-03', 'o dia vira à meia-noite de Brasília');

  assert.equal(CUSTO_SKILL, 50);
  assert.equal(podePagarSkill({ ...nova, fichas: 49 }), false);
  assert.equal(podePagarSkill({ ...nova, fichas: 50 }), true);
});

test('Fichas: o placar de cada jogo conta jogadas, vitórias e o maior prêmio; o do 21 antigo vira jogadas', () => {
  let p = registrarJogada(PLACAR_NOVO, 20, 50);
  p = registrarJogada(p, 20, 20); // empate: devolveu a aposta, não é vitória
  p = registrarJogada(p, 10, 0);
  assert.deepEqual(p, { ...PLACAR_NOVO, jogadas: 3, vitorias: 1, maiorPremio: 30 });
  assert.equal(taxaDeVitorias(p), 33);
  assert.deepEqual(normalizarPlacar({ aposta: 20, maos: 12, vitorias: 5, fichas: 300, recorde: 400 }), { aposta: 20, jogadas: 12, vitorias: 5, maiorPremio: 0 });
  assert.deepEqual(normalizarPlacar({ aposta: 7, jogadas: 'x' }), PLACAR_NOVO);
});

test('21: as fichas do desenho somam o total, das maiores para as menores', () => {
  assert.deepEqual(pilhas(0), []);
  assert.deepEqual(pilhas(285), [{ valor: 100, qtd: 2 }, { valor: 50, qtd: 1 }, { valor: 10, qtd: 3 }, { valor: 5, qtd: 1 }]);
  assert.deepEqual(pilhas(20), [{ valor: 10, qtd: 2 }]);
  for (const total of [5, 15, 75, 200, 1235]) assert.equal(pilhas(total).reduce((s, p) => s + p.valor * p.qtd, 0), total);
});

test('Anomalias: as skills mudam a aparência pelo plano; o eco de xerox só com todas no máximo', () => {
  for (const plano of PLANOS) assert.deepEqual(aparenciaDe(plano, SEM_SKILLS), SEM_APARENCIA);
  const clarividencia = { ...SEM_SKILLS, leitura: 10 };
  assert.equal(aparenciaDe('aranha', clarividencia).olhos, 4, 'aranha: até 8 olhos');
  assert.equal(aparenciaDe('centopeia', clarividencia).olhos, 3);
  assert.equal(aparenciaDe('polvo', clarividencia).olhos, 2);
  assert.equal(aparenciaDe('caranguejo', clarividencia).olhos, 1);
  assert.equal(aparenciaDe('aranha', { ...SEM_SKILLS, leitura: 1 }).olhos, 1, 'o primeiro nível já dá olhos');

  const maximo = Object.fromEntries(Object.entries(SKILL).map(([k, d]) => [k, d.max])) as typeof SEM_SKILLS;
  assert.equal(todasNoMaximo(maximo), true);
  assert.equal(aparenciaDe('polvo', maximo).eco, true);
  assert.equal(aparenciaDe('polvo', maximo).cabecas, 2, 'Perfeccionismo: opção A, cabeças a mais');
  assert.equal(aparenciaDe('polvo', { ...maximo, raio: 4 }).eco, false, 'falta um nível: sem eco');
  assert.equal(aparenciaDe('polvo', { ...SEM_SKILLS, revisor: 2 }).eco, false);
});

test('Anomalias: Deslocamento, Adaptação e Absorção mudam o corpo da física', () => {
  const centopeia = normalizarGenoma({ plano: 'centopeia', pernasACada: 2 }, rngDe(5));
  const base = paramsDe(centopeia, 'ancia');
  const anda = paramsDe(centopeia, 'ancia', { ...SEM_SKILLS, movimento: 5 });
  assert.equal(base.pernasACada, 2);
  assert.equal(anda.pernasACada, 1, 'uma perna por segmento');
  assert.ok(anda.coxa > base.coxa, 'pernas mais longas');
  assert.equal(paramsDe(centopeia, 'ancia', { ...SEM_SKILLS, estomago: 5 }).segmentos, base.segmentos + 2);

  const polvo = normalizarGenoma({ plano: 'polvo' }, rngDe(5));
  const p0 = paramsDe(polvo, 'ancia');
  assert.equal(paramsDe(polvo, 'ancia', { ...SEM_SKILLS, movimento: 4 }).pares, p0.pares);
  assert.equal(paramsDe(polvo, 'ancia', { ...SEM_SKILLS, movimento: 5 }).pares, p0.pares + 1, '+1 par de tentáculos');
  assert.ok(paramsDe(polvo, 'ancia', { ...SEM_SKILLS, gula: 4 }).quadril > p0.quadril, 'manto maior: tentáculos saem mais para fora');
  assert.equal(paramsDe(normalizarGenoma({ plano: 'aranha' }, rngDe(5)), 'ancia', { ...SEM_SKILLS, movimento: 10 }).pares, paramsDe(normalizarGenoma({ plano: 'aranha' }, rngDe(5)), 'ancia').pares, 'aranha não ganha par');
});

const mao5 = (...cs: string[]): Carta[] => cs.map((c) => ({
  valor: ({ A: 1, J: 11, Q: 12, K: 13 } as Record<string, number>)[c.slice(0, -1)] ?? Number(c.slice(0, -1)),
  naipe: ({ e: 'espadas', c: 'copas', o: 'ouros', p: 'paus' } as const)[c.slice(-1) as 'e' | 'c' | 'o' | 'p'],
}));

test('Poker: a melhor mão de 5 entre 7 cartas, com desempate', () => {
  const nome = (...cs: string[]) => pk.nomeDaMao(mao5(...cs));
  const forca = (...cs: string[]) => pk.melhorMao(mao5(...cs));
  assert.equal(nome('10e', 'Je', 'Qe', 'Ke', 'Ae', '2c', '3o'), 'ROYAL FLUSH');
  assert.equal(nome('5c', '6c', '7c', '8c', '9c', 'Ae', 'Ao'), 'STRAIGHT FLUSH');
  assert.equal(nome('9e', '9c', '9o', '9p', '2e', '3e', '4c'), 'QUADRA');
  assert.equal(nome('3e', '3c', '3o', 'Kp', 'Ke', '2c', '7o'), 'FULL HOUSE');
  assert.equal(nome('2o', '7o', '9o', 'Jo', 'Ko', 'Ae', 'Ac'), 'FLUSH');
  assert.equal(nome('Ae', '2c', '3o', '4p', '5e', 'Kc', 'Ko'), 'SEQUENCIA', 'ás baixo');
  assert.equal(nome('7e', '7c', '7o', 'Kp', '2e', '4c', '9o'), 'TRINCA');
  assert.equal(nome('4e', '4c', '8o', '8p', 'Ae', '2c', 'Jo'), 'DOIS PARES');
  assert.equal(nome('Je', 'Jc', '3o', '8p', '9e', '2c', '5o'), 'PAR');
  assert.equal(nome('Je', '7c', '3o', '8p', '9e', '2c', '5o'), 'CARTA ALTA');
  assert.equal(nome('Ke', 'Kc'), 'PAR', 'antes da mesa: só o par');
  assert.ok(pk.comparar(forca('Ae', 'Ac', '3o', '8p', '9e', '2c', '5o'), forca('Ke', 'Kc', '3o', '8p', '9e', '2c', 'Jo')) > 0, 'par maior ganha');
  assert.ok(pk.comparar(forca('Ae', 'Ac', 'Ko', '8p', '9e', '2c', '5o'), forca('Ae', 'Ac', 'Qo', '8p', '9e', '2c', '5o')) > 0, 'kicker desempata');
  assert.ok(pk.comparar(forca('Ae', '2c', '3o', '4p', '5e', 'Kc', 'Jo'), forca('2e', '3c', '4o', '5p', '6e', 'Kc', 'Jo')) < 0, 'A-5 perde de 2-6');
  assert.equal(pk.comparar(forca('2e', '3c', 'Ao', 'Ap', 'Ke', 'Kc', 'Qo'), forca('4e', '5c', 'Ao', 'Ap', 'Ke', 'Kc', 'Qo')), 0, 'mesma mão da mesa: empate');
});

test('Poker: blinds, ordem de fala, aumento que reabre a rodada e as ruas', () => {
  const mesa0 = pm.mesaNova([0, 1, 2, 3].map((k) => pm.novoJogador(`J${k}`, k ? 'normal' : null)));
  let m = pm.novaMao(mesa0, rngDe(4));
  assert.equal(m.botao, 0, 'o botão anda para o lugar 0');
  assert.deepEqual(m.jogadores.map((j) => j.investido), [0, 5, 10, 0], 'blind pequeno à esquerda do botão, grande depois');
  assert.equal(m.vez, 3, 'quem fala primeiro é o da esquerda do blind grande');
  assert.ok(m.jogadores.every((j) => j.cartas.length === 2));
  assert.equal(pm.agir(m, { tipo: 'passar' }), m, 'não dá para passar devendo');
  m = pm.agir(m, { tipo: 'pagar' }); // 3 paga 10
  m = pm.agir(m, { tipo: 'aumentar', total: 30 }); // 0 aumenta a 30
  assert.deepEqual([m.maior, m.minimo, m.vez], [30, 20, 1]);
  assert.deepEqual(m.faltam, [1, 2, 3], 'o aumento reabre a rodada para todos');
  m = pm.agir(m, { tipo: 'desistir' }); // 1
  m = pm.agir(m, { tipo: 'pagar' }); // 2
  m = pm.agir(m, { tipo: 'pagar' }); // 3
  assert.equal(m.rua, 'flop');
  assert.equal(m.abertas, 3);
  assert.equal(pm.pote(m), 5 + 30 + 30 + 30);
  assert.equal(m.vez, 2, 'depois do flop fala o primeiro vivo à esquerda do botão');
  while (m.rua !== 'fim') m = pm.agir(m, { tipo: 'passar' });
  assert.equal(m.mostrou, true);
  assert.equal(m.abertas, 5);
  assert.equal(m.jogadores.reduce((t, j) => t + j.fichas, 0), 800, 'as fichas não somem nem aparecem');
});

test('Poker: todos desistem e um leva sem mostrar; potes paralelos com all-in de quem tem menos', () => {
  let m = pm.novaMao(pm.mesaNova([0, 1, 2, 3].map((k) => pm.novoJogador(`J${k}`, null))), rngDe(5));
  m = pm.agir(m, { tipo: 'aumentar', total: 40 });
  while (m.rua !== 'fim') m = pm.agir(m, { tipo: 'desistir' });
  assert.equal(m.mostrou, false);
  assert.deepEqual(m.potes.map((p) => [p.valor, p.ganhadores]), [[55, [3]]]);
  assert.equal(m.jogadores[3].fichas, 200 - 40 + 55);

  // investimentos 50 (all-in), 200, 200 e um que desistiu com 10: pote de 50x3+10 para todos, 150x2 só para os dois
  const base = pm.mesaNova([50, 200, 200, 200].map((f, k) => pm.novoJogador(`J${k}`, null, f)));
  const jogadores = base.jogadores.map((j, k) => ({ ...j, investido: [50, 200, 200, 10][k], fichas: 0, desistiu: k === 3, allIn: k < 3 }));
  assert.deepEqual(pm.potesDe({ ...base, jogadores }), [{ valor: 160, elegiveis: [0, 1, 2] }, { valor: 300, elegiveis: [1, 2] }]);
});

test('Poker: os bots estimam a chance e jogam dentro das regras', () => {
  assert.ok(chance(mao5('Ae', 'Ac'), [], 1, rngDe(1), 400) > 0.75, 'par de ases contra uma mão qualquer');
  assert.ok(chance(mao5('7e', '2c'), [], 1, rngDe(1), 400) < 0.4, '7-2 contra uma mão qualquer');
  const rng = rngDe(7);
  let m = pm.mesaNova([0, 1, 2, 3].map(() => novoBot(rng)));
  assert.equal(new Set(m.jogadores.map((j) => j.nome)).size, 4, 'nomes sem repetir');
  for (let mao = 0; mao < 12; mao++) {
    m = { ...m, jogadores: m.jogadores.map((j) => (j.fichas > 0 ? j : novoBot(rng, m.jogadores.map((x) => x.nome)))) };
    const antes = m.jogadores.reduce((t, j) => t + j.fichas, 0);
    m = pm.novaMao(m, rng);
    for (let passos = 0; m.rua !== 'fim' && passos < 100; passos++) {
      const n = pm.agir(m, decidir(m, rng, 40));
      assert.notEqual(n, m, 'o bot só escolhe jogadas válidas');
      m = n;
    }
    assert.equal(m.rua, 'fim');
    assert.equal(m.jogadores.reduce((t, j) => t + j.fichas, 0), antes);
  }
});

test('Poker: a mão por extenso, as 5 cartas dela e o que desempatou', () => {
  const desc = (...cs: string[]) => pk.descreverMao(pk.melhorCombinacao(mao5(...cs)));
  assert.equal(desc('Je', '7c', '3o', '8p', '9e', '2c', '5o'), 'CARTA ALTA: VALETE');
  assert.equal(desc('10e', '10c', '3o', '8p', '9e', '2c', '5o'), 'PAR DE DEZ');
  assert.equal(desc('Ke', 'Kc', '7o', '7p', '9e', '2c', '5o'), 'DOIS PARES: REIS E SETES');
  assert.equal(desc('5e', '5c', '5o', 'Kp', '9e', '2c', 'Jo'), 'TRINCA DE CINCOS');
  assert.equal(desc('Ae', '2c', '3o', '4p', '5e', 'Kc', 'Ko'), 'SEQUENCIA ATE CINCO', 'ás baixo');
  assert.equal(desc('2c', '7c', '9c', 'Jc', 'Ac', 'Ae', 'Ko'), 'FLUSH DE COPAS ATE AS');
  assert.equal(desc('Qe', 'Qc', 'Qo', '7p', '7e', '2c', '3o'), 'FULL HOUSE: DAMAS COM SETES');
  assert.equal(desc('8e', '8c', '8o', '8p', '2e', '3e', '4c'), 'QUADRA DE OITOS');
  assert.equal(desc('5c', '6c', '7c', '8c', '9c', 'Ae', 'Ao'), 'STRAIGHT FLUSH ATE NOVE');
  assert.equal(desc('10e', 'Je', 'Qe', 'Ke', 'Ae', '2c', '3o'), 'ROYAL FLUSH');

  const c = pk.melhorCombinacao(mao5('Ae', 'Ac', '3o', '8p', '9e', 'Kc', '5o'));
  assert.equal(c.cartas.length, 5);
  assert.deepEqual(c.cartas.map((x) => x.valor), [1, 1, 13, 9, 8], 'o par primeiro, depois as três maiores');
  assert.deepEqual(pk.melhorCombinacao(mao5('5e', '9c', '5o', 'Kp', '9e', '5c', '2o')).cartas.map((x) => x.valor), [5, 5, 5, 9, 9], 'full house: a trinca, depois o par');
  assert.deepEqual(pk.melhorCombinacao(mao5('Ae', '2c', '3o', '4p', '5e', 'Kc', 'Ko')).cartas.map((x) => x.valor), [5, 4, 3, 2, 1], 'na sequência baixa, o ás vem por último');
  const perdeu = pk.melhorMao(mao5('Ae', 'Ac', 'Qo', '8p', '9e', '2c', '5o'));
  const ganhou = pk.melhorCombinacao(mao5('Ae', 'Ac', 'Ko', '8p', '9e', '2c', '5o'));
  assert.equal(pk.descreverMao(ganhou, perdeu), 'PAR DE ASES, DESEMPATE: REI');
  assert.equal(pk.descreverMao(ganhou, pk.melhorMao(mao5('Ke', 'Kc', 'Qo', '8p', '9e', '2c', '5o'))), 'PAR DE ASES', 'par maior não precisa de desempate');
});

test('Poker: quem quebra sai da mesa; com dois, o botão põe o blind pequeno; sobrando um, não há mão', () => {
  const base = pm.mesaNova([100, 0, 200, 0].map((f, k) => pm.novoJogador(`J${k}`, k ? 'normal' : null, f)));
  assert.deepEqual(pm.sentados(base), [0, 2]);
  const m = pm.novaMao(base, rngDe(3));
  assert.equal(m.botao, 0, 'o botão pula os lugares vazios');
  assert.deepEqual([m.pequeno, m.grande], [0, 2], 'com dois, o botão é o blind pequeno');
  assert.deepEqual(m.jogadores.map((j) => j.cartas.length), [2, 0, 2, 0], 'lugar vazio não recebe cartas');
  assert.deepEqual(m.jogadores.map((j) => j.investido), [5, 0, 10, 0]);
  assert.equal(m.vez, 0, 'antes do flop, com dois, o botão fala primeiro');
  let n = pm.agir(m, { tipo: 'pagar' });
  n = pm.agir(n, { tipo: 'passar' });
  assert.equal(n.rua, 'flop');
  assert.equal(n.vez, 2, 'depois do flop, o blind grande fala primeiro');

  const proxima = pm.novaMao({ ...base, botao: 0 }, rngDe(3));
  assert.equal(proxima.botao, 2, 'o botão anda para o próximo com fichas');

  const sozinho = pm.mesaNova([300, 0, 0, 0].map((f, k) => pm.novoJogador(`J${k}`, null, f)));
  assert.equal(pm.novaMao(sozinho, rngDe(1)), sozinho, 'sobrando um, a mesa acabou');
});

test('Poker: sem repor bots, a mesa termina com um só e as fichas conservadas', () => {
  const rng = rngDe(11);
  let m = pm.mesaNova([0, 1, 2, 3].map(() => ({ ...novoBot(rng), estilo: 'agressivo' as const })));
  let maos = 0;
  while (pm.sentados(m).length > 1 && maos < 400) {
    m = pm.novaMao(m, rng);
    for (let passos = 0; m.rua !== 'fim' && passos < 100; passos++) m = pm.agir(m, decidir(m, rng, 30));
    assert.equal(m.rua, 'fim');
    assert.equal(m.jogadores.reduce((t, j) => t + j.fichas, 0), 800);
    for (const p of m.potes.filter(() => m.mostrou)) assert.equal(p.cartas.length, 5);
    maos++;
  }
  assert.equal(pm.sentados(m).length, 1, `a mesa acabou em ${maos} mãos`);
});

test('Xadrez: perft das posições de referência (roque, en passant, promoção e cravadas)', () => {
  assert.deepEqual([1, 2, 3].map((n) => xz.perft(xz.deFen(xz.INICIAL), n)), [20, 400, 8902]);
  const kiwipete = xz.deFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.deepEqual([1, 2].map((n) => xz.perft(kiwipete, n)), [48, 2039]);
  assert.equal(xz.perft(xz.deFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), 3), 2812);
  assert.equal(xz.perft(xz.deFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'), 2), 264);
  assert.equal(xz.perft(xz.deFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8'), 2), 1486);
});

test('Xadrez: mate, afogamento, material insuficiente, 50 lances e tripla repetição', () => {
  assert.equal(xz.fimDe(xz.deFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')), 'mate', 'mate do louco');
  assert.equal(xz.fimDe(xz.deFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')), 'afogamento');
  assert.equal(xz.fimDe(xz.deFen('7k/8/6K1/8/8/8/8/2B5 b - - 0 1')), 'material');
  assert.equal(xz.fimDe(xz.deFen('7k/8/6K1/8/8/8/8/2R5 b - - 100 80')), 'cinquenta');
  const p = xz.deFen(xz.INICIAL);
  assert.equal(xz.fimDe(p, [xz.chave(p), xz.chave(p), xz.chave(p)]), 'repeticao');
  assert.equal(xz.fimDe(p, [xz.chave(p), xz.chave(p)]), null);
  // o roque some depois que o rei anda; en passant logo depois do avanço duplo
  const roque = xz.deFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.ok(xz.legais(roque).some((m) => m.roque === 'curto') && xz.legais(roque).some((m) => m.roque === 'longo'));
  const rei = xz.legais(roque).find((m) => m.peca === 'K' && !m.roque);
  assert.ok(rei);
  assert.equal(xz.aplicar(roque, rei).roques, 'kq');
  assert.ok(xz.legais(xz.deFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1')).some((m) => m.enPassant), 'en passant');
});

test('Xadrez: o bot de cada nível acha o mate em um e as apostas são 10, 50 e 100', () => {
  assert.deepEqual(NIVEIS.map((n) => n.aposta), [10, 50, 100]);
  const pastor = xz.deFen('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
  for (const n of NIVEIS) {
    const m = escolherLance(pastor, n, rngDe(3));
    assert.equal(m && `${xz.nomeCasa(m.de)}${xz.nomeCasa(m.para)}`, 'h5f7', n.nome);
  }
  // no difícil, a dama não vai para uma casa onde a torre a captura de graça
  const dama = xz.deFen('4k3/8/8/3q4/8/8/3R4/4K3 b - - 0 1');
  const m = escolherLance(dama, NIVEIS[2], rngDe(1));
  assert.ok(m);
  const depois = xz.aplicar(dama, m);
  assert.ok(!xz.legais(depois).some((r) => r.captura === 'q'), 'deixou a dama sem defesa');
});

test('Slot: a fita tem 21 símbolos espalhados, a tabela paga a linha do meio e o retorno é o ajustado (~100%)', () => {
  assert.equal(slot.FITA.length, 21);
  for (const s of slot.SIMBOLOS) assert.equal(slot.FITA.filter((x) => x === s).length, slot.PESOS[s]);
  for (let i = 0; i < 21; i++) assert.notEqual(slot.FITA[i], slot.FITA[(i + 1) % 21], `posições ${i} e ${(i + 1) % 21} iguais`);
  const em = (s: slot.Simbolo) => slot.FITA.indexOf(s);
  assert.equal(slot.retornoDe([em('olho'), em('olho'), em('olho')], 10), 5000);
  assert.equal(slot.retornoDe([em('cereja'), em('cereja'), em('sino')], 20), 40, 'duas cerejas no começo');
  assert.equal(slot.retornoDe([em('sino'), em('cereja'), em('cereja')], 20), 0, 'cerejas fora do começo não pagam');
  assert.equal(slot.premioDe(['sete', 'sete', 'sete'])?.paga, 100);
  assert.equal(slot.simboloEm(20, 1), slot.FITA[0], 'a fita dá a volta');
  const r = slot.retornoTeorico();
  assert.ok(r > 0.97 && r < 1.03, `retorno ${(100 * r).toFixed(1)}%`);
  for (const p of slot.sortearParadas(rngDe(9))) assert.ok(p >= 0 && p < 21);
});

test('Regras: os exemplos batem com os motores dos jogos', () => {
  assert.deepEqual(rg.EXEMPLOS_21.map((e) => rg.valorNo21(e.mao)), ['17', '17 OU 7', '21 . BLACKJACK', '25 . ESTOUROU']);
  assert.deepEqual(rg.MAOS_POKER.map((m) => m.nome), ['ROYAL FLUSH', ...[...pk.NOMES_MAO].reverse().slice(0, 9)], 'uma de cada, da maior para a menor');
  for (let i = 1; i < rg.MAOS_POKER.length; i++) {
    assert.ok(pk.comparar(pk.melhorMao(rg.MAOS_POKER[i - 1].mao), pk.melhorMao(rg.MAOS_POKER[i].mao)) > 0, `${rg.MAOS_POKER[i - 1].nome} ganha de ${rg.MAOS_POKER[i].nome}`);
  }
  assert.equal(rg.DESEMPATE_POKER.descricao, 'PAR DE ASES, DESEMPATE: REI');

  const casas = (titulo: string) => rg.destinosDe(rg.EXEMPLOS_XADREZ.find((e) => e.titulo === titulo)!).map(xz.nomeCasa).sort();
  assert.equal(casas('REI').length, 8);
  assert.equal(casas('DAMA').length, 27);
  assert.equal(casas('TORRE').length, 14);
  assert.equal(casas('BISPO').length, 13);
  assert.equal(casas('CAVALO').length, 8);
  assert.deepEqual(casas('PEAO'), ['c5', 'd5'], 'anda uma ou captura na diagonal');
  assert.ok(casas('ROQUE').includes('g1') && casas('ROQUE').includes('c1'), 'roque curto e longo');
  assert.deepEqual(casas('EN PASSANT'), ['d6', 'e6']);
  assert.deepEqual(casas('PROMOCAO'), ['a8']);
  const fim = (titulo: string) => rg.situacaoDe(rg.EXEMPLOS_XADREZ.find((e) => e.titulo === titulo)!);
  assert.equal(fim('XEQUE-MATE').fim, 'mate');
  assert.ok(fim('XEQUE-MATE').xeque >= 0, 'o rei em xeque fica marcado');
  assert.deepEqual(fim('AFOGAMENTO'), { xeque: -1, fim: 'afogamento' });
});

test('Poker: o destaque é só o que faz a mão (o par, não os kickers), mais a carta que desempatou', () => {
  const valores = (cs: Carta[]) => cs.map((c) => c.valor);
  // o caso da tela: par de seis com A, 10 e 8 de kickers
  const par = pk.melhorCombinacao(mao5('6p', '10o', '7c', '8p', '4o', '6c', 'Ac'));
  assert.deepEqual(valores(pk.cartasQueFazem(par)), [6, 6]);
  assert.deepEqual(valores(pk.cartasQueFazem(pk.melhorCombinacao(mao5('Ke', 'Kc', '7o', '7p', '9e', '2c', '5o')))), [13, 13, 7, 7]);
  assert.deepEqual(valores(pk.cartasQueFazem(pk.melhorCombinacao(mao5('5e', '5c', '5o', 'Kp', '9e', '2c', 'Jo')))), [5, 5, 5]);
  assert.equal(pk.cartasQueFazem(pk.melhorCombinacao(mao5('2c', '7c', '9c', 'Jc', 'Ac', 'Ae', 'Ko'))).length, 5, 'flush: as 5');
  assert.deepEqual(valores(pk.cartasQueFazem(pk.melhorCombinacao(mao5('Je', '7c', '3o', '8p', '9e', '2c', '5o')))), [11], 'carta alta: só ela');
  // mesmo par de ases: o rei desempatou e acende junto
  const ganhou = pk.melhorCombinacao(mao5('Ae', 'Ac', 'Ko', '8p', '9e', '2c', '5o'));
  assert.deepEqual(valores(pk.cartasQueFazem(ganhou, pk.melhorMao(mao5('Ae', 'Ac', 'Qo', '8p', '9e', '2c', '5o')))), [1, 1, 13]);

  // na mesa, o pote guarda o destaque
  const base = pm.mesaNova([0, 1, 2, 3].map((k) => pm.novoJogador(`J${k}`, null)));
  let m = pm.novaMao(base, rngDe(9));
  while (m.rua !== 'fim') m = pm.agir(m, m.vez === m.grande || pm.opcoes(m).podePassar ? { tipo: 'passar' } : { tipo: 'pagar' });
  for (const p of m.potes) {
    assert.ok(p.destaque.length >= 1 && p.destaque.length <= 5 * p.ganhadores.length);
    assert.ok(p.destaque.every((c) => p.ganhadores.some((g) => [...m.jogadores[g].cartas, ...m.comunitarias].includes(c))));
  }
});

test('Xadrez: a ALEATORIA sorteia um dos três níveis, entra de graça e a vitória paga 30', () => {
  assert.deepEqual([ALEATORIA.aposta, ALEATORIA.premio], [0, 30]);
  const sorteados = new Set(Array.from({ length: 60 }, (_, i) => sortearNivel(rngDe(i + 1))));
  assert.deepEqual([...sorteados].sort(), [0, 1, 2]);
  assert.deepEqual(['ganhou', 'empate', 'perdeu'].map((r) => retornoXadrez(r as 'ganhou', 0, true)), [30, 0, 0]);
  assert.deepEqual(['ganhou', 'empate', 'perdeu'].map((r) => retornoXadrez(r as 'ganhou', 50)), [100, 50, 0], 'os pagos seguem iguais');
});

test('Carteira: histórico com o mais novo no topo, limite e totais sem as transferências', () => {
  assert.deepEqual(normalizarHistorico('lixo'), []);
  assert.deepEqual(normalizarHistorico([{ em: 1, origem: 'XYZ', valor: 5 }, { em: 2, origem: 'SLOT', valor: 9.6, detalhe: 'APOSTA 10' }]), [{ em: 2, origem: 'SLOT', valor: 10, detalhe: 'APOSTA 10' }]);
  let h = normalizarHistorico([]);
  for (let i = 0; i < MAX_HISTORICO + 5; i++) h = acrescentarLancamento(h, { em: i, origem: '21', valor: 1, detalhe: '' });
  assert.equal(h.length, MAX_HISTORICO);
  assert.equal(h[0].em, MAX_HISTORICO + 4, 'o mais novo primeiro');
  const lista = [
    { em: 1, origem: '21' as const, valor: 20, detalhe: '' },
    { em: 2, origem: 'SLOT' as const, valor: -10, detalhe: '' },
    { em: 3, origem: 'POKER' as const, valor: -200, detalhe: 'SENTOU', transferencia: true },
    { em: 4, origem: 'SKILL' as const, valor: -50, detalhe: '' },
    { em: 5, origem: 'MESADA' as const, valor: 200, detalhe: '' },
    { em: 6, origem: 'XADREZ' as const, valor: 30, detalhe: '' },
  ];
  assert.deepEqual(resumo(lista), { ganhos: 50, perdas: -10, skills: -50, mesadas: 200 });
});
