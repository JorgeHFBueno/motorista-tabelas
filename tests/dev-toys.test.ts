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
import * as dc from '../src/features/dev-toys/toys/neo/regras';
import * as pt from '../src/features/dev-toys/toys/protocolo/regras';
import * as ptBot from '../src/features/dev-toys/toys/protocolo/bot';

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

// NEO: mesa montada à mão (J0 na vez, sentido normal) e um monte de 3 de paus para as compras
const cd = (id: number, naipe: dc.CartaNeo['naipe'], simbolo: dc.Simbolo): dc.CartaNeo => ({ id, naipe, simbolo });
const mesaDc = (maos: dc.CartaNeo[][], mesa: dc.CartaNeo, monte: dc.CartaNeo[] = Array.from({ length: 10 }, (_, i) => cd(900 + i, 'paus', 3))): dc.Partida => ({
  jogadores: maos.map((mao, i) => ({ nome: `J${i}`, mao, ultima: null })), monte, descarte: [mesa], naipe: mesa.naipe!, vez: 0, sentido: 1, comprou: null, vencedor: null, aviso: '',
});
const totalDc = (p: dc.Partida) => p.monte.length + p.descarte.length + p.jogadores.reduce((n, j) => n + j.mao.length, 0);
const outras = () => [cd(50, 'ouros', 1), cd(51, 'ouros', 2), cd(52, 'ouros', 3)];

test('NEO: baralho de 108 e partida nova com 7 para cada e um número na mesa', () => {
  const b = dc.baralhoNeo();
  assert.equal(b.length, 108);
  assert.equal(new Set(b.map((c) => c.id)).size, 108);
  for (const n of ['espadas', 'copas', 'ouros', 'paus']) assert.equal(b.filter((c) => c.naipe === n).length, 25);
  assert.equal(b.filter((c) => c.naipe === null).length, 8);
  for (let s = 1; s <= 30; s++) {
    const p = dc.novaPartida(['VOCE', 'A', 'B', 'C'], rngDe(s));
    assert.ok(p.jogadores.every((j) => j.mao.length === dc.MAO_INICIAL));
    assert.equal(typeof dc.topo(p).simbolo, 'number');
    assert.equal(p.naipe, dc.topo(p).naipe);
    assert.equal(totalDc(p), 108);
    assert.equal(p.vez, 0);
  }
});

test('NEO: serve o mesmo naipe, o mesmo símbolo ou curinga; o resto não vale', () => {
  const mao = [cd(1, 'copas', 2), cd(2, 'paus', 7), cd(3, null, 'curinga'), cd(4, 'espadas', 5), cd(5, 'espadas', 'mais2')];
  const p = mesaDc([mao, outras(), outras(), outras()], cd(0, 'copas', 7));
  assert.deepEqual(dc.jogaveis(p).map((c) => c.id), [1, 2, 3]);
  assert.equal(dc.agir(p, { tipo: 'jogar', id: 4 }, rngDe(1)), p, 'não serve: nada muda');
  assert.equal(dc.agir(p, { tipo: 'jogar', id: 3 }, rngDe(1)), p, 'curinga sem naipe: nada muda');
  assert.equal(dc.agir(p, { tipo: 'passar' }, rngDe(1)), p, 'passar só depois de comprar');
  const q = dc.agir(p, { tipo: 'jogar', id: 3, naipe: 'espadas' }, rngDe(1));
  assert.equal(q.naipe, 'espadas');
  assert.equal(q.vez, 1);
  assert.deepEqual(dc.jogaveis(q).map((c) => c.id), [], 'J1 só tem ouros');
});

test('NEO: +2, +4, pula e inverte', () => {
  const p = (c: dc.CartaNeo) => mesaDc([[c, ...outras()], outras(), outras(), outras()], cd(0, 'copas', 7));
  const mais2 = dc.agir(p(cd(1, 'copas', 'mais2')), { tipo: 'jogar', id: 1 }, rngDe(1));
  assert.deepEqual([mais2.jogadores[1].mao.length, mais2.vez], [5, 2]);
  const mais4 = dc.agir(p(cd(1, null, 'mais4')), { tipo: 'jogar', id: 1, naipe: 'paus' }, rngDe(1));
  assert.deepEqual([mais4.jogadores[1].mao.length, mais4.vez, mais4.naipe], [7, 2, 'paus']);
  const pula = dc.agir(p(cd(1, 'copas', 'pula')), { tipo: 'jogar', id: 1 }, rngDe(1));
  assert.deepEqual([pula.jogadores[1].mao.length, pula.vez], [3, 2]);
  const inverte = dc.agir(p(cd(1, 'copas', 'inverte')), { tipo: 'jogar', id: 1 }, rngDe(1));
  assert.deepEqual([inverte.sentido, inverte.vez], [-1, 3]);
  // no sentido invertido, o +2 cai em quem vem antes
  const volta = dc.agir({ ...p(cd(1, 'copas', 'mais2')), sentido: -1 }, { tipo: 'jogar', id: 1 }, rngDe(1));
  assert.deepEqual([volta.jogadores[3].mao.length, volta.vez], [5, 2]);
});

test('NEO: ULTIMA esquecida compra 2; zerar a mão ganha e paga 4x', () => {
  const duas = () => mesaDc([[cd(1, 'copas', 2), cd(2, 'espadas', 9)], outras(), outras(), outras()], cd(0, 'copas', 7));
  const gritou = dc.agir(duas(), { tipo: 'jogar', id: 1, ultima: true }, rngDe(1));
  assert.equal(gritou.jogadores[0].mao.length, 1);
  assert.equal(gritou.aviso, 'J0 JOGOU 2 DE COPAS. J0: ULTIMA!');
  const gritouComAcao = mesaDc([[cd(1, 'copas', 'mais2'), cd(2, 'espadas', 9)], outras(), outras(), outras()], cd(0, 'copas', 7));
  assert.equal(dc.agir(gritouComAcao, { tipo: 'jogar', id: 1, ultima: true }, rngDe(1)).aviso, 'J0 JOGOU +2 DE COPAS. J0: ULTIMA! J1 COMPRA 2 E PERDE A VEZ');
  const esqueceu = dc.agir(duas(), { tipo: 'jogar', id: 1 }, rngDe(1));
  assert.equal(esqueceu.jogadores[0].mao.length, 1 + dc.MULTA);
  assert.match(esqueceu.aviso, /NAO GRITOU ULTIMA/);
  const ultima = mesaDc([[cd(1, 'copas', 'mais2')], outras(), outras(), outras()], cd(0, 'copas', 7));
  const fim = dc.agir(ultima, { tipo: 'jogar', id: 1 }, rngDe(1));
  assert.equal(fim.vencedor, 0);
  assert.equal(fim.jogadores[1].mao.length, 3, 'quem zera a mão encerra: o +2 não é cobrado');
  assert.equal(dc.agir(fim, { tipo: 'comprar' }, rngDe(1)), fim, 'acabou: nada mais vale');
  assert.deepEqual([dc.retornoNeo(0, 10), dc.retornoNeo(2, 10), dc.retornoNeo(null, 10)], [40, 0, 0]);
});

test('NEO: comprar; a comprada que serve pode ser jogada ou passada; sem monte, o descarte vira monte', () => {
  const nao = dc.agir(mesaDc([outras(), outras(), outras(), outras()], cd(0, 'copas', 7)), { tipo: 'comprar' }, rngDe(1));
  assert.deepEqual([nao.jogadores[0].mao.length, nao.vez, nao.comprou], [4, 1, null], '3 de paus não serve: a vez passa');
  const serve = dc.agir(mesaDc([[cd(1, 'copas', 9), ...outras()], outras(), outras(), outras()], cd(0, 'paus', 7)), { tipo: 'comprar' }, rngDe(1));
  assert.deepEqual([serve.vez, serve.comprou], [0, 909]);
  assert.deepEqual(dc.jogaveis(serve).map((c) => c.id), [909], 'só a comprada');
  assert.equal(dc.agir(serve, { tipo: 'comprar' }, rngDe(1)), serve, 'uma compra por vez');
  assert.equal(dc.agir(serve, { tipo: 'passar' }, rngDe(1)).vez, 1);
  assert.equal(dc.agir(serve, { tipo: 'jogar', id: 909 }, rngDe(1)).vez, 1);
  // monte vazio: o descarte (menos a carta de cima) é embaralhado e vira monte
  const vazio: dc.Partida = { ...mesaDc([outras(), outras(), outras(), outras()], cd(0, 'copas', 7), []), descarte: [cd(60, 'paus', 1), cd(61, 'paus', 2), cd(0, 'copas', 7)] };
  const r = dc.agir(vazio, { tipo: 'comprar' }, rngDe(1));
  assert.deepEqual(r.descarte.map((c) => c.id), [0]);
  assert.equal(r.monte.length, 1);
  assert.equal(totalDc(r), totalDc(vazio));
});

test('NEO: o bot guarda o curinga, ataca quem está perto de ganhar e escolhe o naipe que mais tem', () => {
  const mao = [cd(1, null, 'curinga'), cd(2, 'copas', 4), cd(3, 'copas', 'pula'), cd(4, 'espadas', 1)];
  const calmo = dc.decidirBot(mesaDc([mao, outras(), outras(), outras()], cd(0, 'copas', 7)), rngDe(1));
  assert.ok(calmo.tipo === 'jogar' && calmo.id !== 1);
  const perto = dc.decidirBot(mesaDc([mao, [cd(50, 'ouros', 1), cd(51, 'ouros', 2)], outras(), outras()], cd(0, 'copas', 7)), rngDe(1));
  assert.ok(perto.tipo === 'jogar' && perto.id === 3, 'pula quem tem 2 cartas');
  const so = dc.decidirBot(mesaDc([[cd(1, null, 'curinga'), cd(2, 'paus', 4), cd(3, 'paus', 5), cd(4, 'espadas', 1)], outras(), outras(), outras()], cd(0, 'copas', 7)), rngDe(1));
  assert.deepEqual(so.tipo === 'jogar' && [so.id, so.naipe], [1, 'paus']);
  assert.deepEqual(dc.decidirBot(mesaDc([outras(), outras(), outras(), outras()], cd(0, 'copas', 7)), rngDe(1)), { tipo: 'comprar' });
});

test('NEO: 300 partidas só de bots terminam, sem perder carta', () => {
  for (let s = 1; s <= 300; s++) {
    const rng = rngDe(s);
    let p = dc.novaPartida(['A', 'B', 'C', 'D'], rng);
    let passos = 0;
    while (p.vencedor === null && passos < 5000) {
      const q = dc.agir(p, dc.decidirBot(p, rng), rng);
      assert.notEqual(q, p, `semente ${s}: o bot fez uma jogada que não vale`);
      p = q;
      passos++;
    }
    assert.notEqual(p.vencedor, null, `semente ${s} não terminou`);
    assert.equal(p.jogadores[p.vencedor!].mao.length, 0);
    assert.equal(totalDc(p), 108);
  }
});

test('NEO: o selo de cada um guarda a última coisa que ele fez; o histórico antigo do Descarte vira NEO', () => {
  const p = mesaDc([[cd(1, 'copas', 'mais2'), ...outras()], outras(), outras(), outras()], cd(0, 'copas', 7));
  const q = dc.agir(p, { tipo: 'jogar', id: 1 }, rngDe(1));
  assert.deepEqual(q.jogadores.map((j) => j.ultima), ['JOGOU +2 DE COPAS', 'COMPROU 2, PERDEU A VEZ', null, null]);
  const pula = dc.agir(mesaDc([[cd(1, 'copas', 'pula'), ...outras()], outras(), outras(), outras()], cd(0, 'copas', 7)), { tipo: 'jogar', id: 1 }, rngDe(1));
  assert.equal(pula.jogadores[1].ultima, 'PERDEU A VEZ');
  const esqueceu = dc.agir(mesaDc([[cd(1, 'copas', 2), cd(2, 'espadas', 9)], outras(), outras(), outras()], cd(0, 'copas', 7)), { tipo: 'jogar', id: 1 }, rngDe(1));
  assert.equal(esqueceu.jogadores[0].ultima, `ESQUECEU A ULTIMA: +${dc.MULTA}`);
  assert.equal(dc.agir(mesaDc([outras(), outras(), outras(), outras()], cd(0, 'copas', 7)), { tipo: 'comprar' }, rngDe(1)).jogadores[0].ultima, 'COMPROU 1 E PASSOU');
  assert.equal(normalizarHistorico([{ em: 1, origem: 'DESCARTE', valor: -10, detalhe: 'APOSTA 10' }])[0].origem, 'NEO');
});

// PROTOCOLO: cartas de verdade (a coleção inteira de cada facção), numa mesa montada à mão (você na vez, rodada 1)
const ptTudo = (f: pt.Faccao): pt.Baralho => ({ faccao: f, lider: pt.lideresDe(f)[0].id, cartas: Object.fromEntries(pt.colecaoDe(f).map((m) => [m.nome, m.max])) });
const ptDeck = Object.fromEntries(pt.FACCOES.map((f, i) => [f, pt.montar(ptTudo(f), i * 100)])) as Record<pt.Faccao, pt.Carta[]>;
const ptCartas = (f: pt.Faccao, nome: string) => ptDeck[f].filter((c) => c.nome === nome);
const ptC = (f: pt.Faccao, nome: string, k = 0) => ptCartas(f, nome)[k];
const ptLado = (nome: string, faccao: pt.Faccao, mao: pt.Carta[], baralho: pt.Carta[] = [], lider = 1): pt.Lado => ({
  nome, faccao, lider: pt.liderPorId(`${faccao}-${lider}`), mao, baralho, descarte: [], campo: { cpu: [], rede: [], disco: [] }, trompa: { cpu: null, rede: null, disco: null },
  vidas: 2, passou: false, liderUsado: false, liderAnulado: false, revelado: [], ultima: null,
});
const ptMesa = (a: pt.Lado, b: pt.Lado): pt.Partida => ({
  lados: [a, b], vez: 0, primeiro: 0, rodada: 1, clima: { cpu: null, rede: null, disco: null }, fase: 'jogo', trocas: 0, escolheInicio: false,
  pendente: null, escolha: null, espioesX2: false, rodadas: [], vencedor: null, aviso: '',
});
const ptMF = (mao: pt.Carta[], baralho: pt.Carta[] = []) => ptLado('VOCE', 'MAINFRAME', mao, baralho);
const ptEN = (mao: pt.Carta[], baralho: pt.Carta[] = []) => ptLado('BOT', 'ENXAME', mao, baralho);
const ptJoga = (p: pt.Partida, j: pt.Jogada) => { const q = pt.agir(p, j, rngDe(1)); assert.notEqual(q, p, `jogada não valeu: ${JSON.stringify(j)}`); return q; };

test('PROTOCOLO: 4 facções com 4 heróis e 5 líderes; baralho padrão válido; partida nova com 10 cartas e até 2 trocas', () => {
  for (const f of pt.FACCOES) {
    assert.equal(pt.UNIDADES[f].filter((m) => m.heroi).length, 4);
    assert.equal(pt.lideresDe(f).length, 5);
    const b = pt.baralhoPadrao(f);
    assert.deepEqual(pt.problemasDo(b), []);
    const d = pt.montar(b);
    assert.ok(d.filter((c) => c.tipo === 'unidade').length >= pt.MIN_UNIDADES);
    assert.ok(d.filter((c) => c.tipo !== 'unidade').length <= pt.MAX_ESPECIAIS);
    assert.equal(new Set(d.map((c) => c.id)).size, d.length);
  }
  const tamanho = pt.montar(pt.baralhoPadrao('MAINFRAME')).length;
  let p = pt.novaPartida(pt.baralhoPadrao('MAINFRAME'), pt.baralhoPadrao('ENXAME'), 'BOT', rngDe(3));
  assert.equal(p.fase, 'troca');
  assert.deepEqual([p.lados[0].mao.length, p.lados[0].baralho.length, p.lados[1].mao.length, p.lados[0].vidas], [10, tamanho - 10, 10, 2]);
  p = ptJoga(p, { tipo: 'trocar', id: p.lados[0].mao[0].id });
  p = ptJoga(p, { tipo: 'trocar', id: p.lados[0].mao[0].id });
  assert.equal(pt.agir(p, { tipo: 'trocar', id: p.lados[0].mao[0].id }, rngDe(1)), p, 'só 2 trocas');
  assert.deepEqual([p.lados[0].mao.length, p.lados[0].baralho.length], [10, tamanho - 10]);
  p = ptJoga(p, { tipo: 'pronto' });
  assert.equal(p.fase, 'jogo');
});

test('PROTOCOLO: força com clima, CLUSTER, CACHE, OVERCLOCK e herói', () => {
  const servidores = ptCartas('MAINFRAME', 'SERVIDOR');
  let p = ptMesa(ptMF([...servidores, ptC('MAINFRAME', 'ADMIN'), ptC('MAINFRAME', 'RAID'), ptC('MAINFRAME', 'NOBREAK'), ptC('MAINFRAME', 'OVERCLOCK')]), ptEN(ptCartas('ENXAME', 'SPAM'), [ptC('ENXAME', 'SUPERAQUECIMENTO')]));
  // o bot só passa: você joga tudo
  p = ptJoga(p, { tipo: 'jogar', id: servidores[0].id });
  p = ptJoga(p, { tipo: 'passar' });
  for (const c of [servidores[1], servidores[2], ptC('MAINFRAME', 'ADMIN'), ptC('MAINFRAME', 'RAID'), ptC('MAINFRAME', 'NOBREAK')]) p = ptJoga(p, { tipo: 'jogar', id: c.id });
  assert.equal(pt.totalFileira(p, 0, 'cpu'), 3 * 12 + 10, 'três SERVIDOR de 4 valem 12 cada; ADMIN 10');
  assert.equal(pt.totalFileira(p, 0, 'disco'), 7 + 4, 'RAID 6 +1 do CACHE; o NOBREAK não se soma');
  p = ptJoga(p, { tipo: 'jogar', id: ptC('MAINFRAME', 'OVERCLOCK').id, fileira: 'disco' });
  assert.equal(pt.totalFileira(p, 0, 'disco'), 22);
  assert.deepEqual(pt.fileirasPara(ptC('MAINFRAME', 'OVERCLOCK'), p.lados[0]), ['cpu', 'rede']);
  // clima na CPU: a unidade vira 1 (e o CLUSTER multiplica o 1); o herói não muda
  p = { ...p, clima: { ...p.clima, cpu: { carta: ptC('ENXAME', 'SUPERAQUECIMENTO'), dono: 1 } } };
  assert.equal(pt.totalFileira(p, 0, 'cpu'), 3 * 3 + 10);
});

test('PROTOCOLO: MALWARE vai para o outro lado e compra 2; FORK puxa as iguais; ágil escolhe a fileira', () => {
  const baralho = [ptC('MAINFRAME', 'GERADOR'), ptC('MAINFRAME', 'TORRE')];
  let p = ptMesa(ptMF([ptC('MAINFRAME', 'AUDITOR'), ptC('MAINFRAME', 'PROXY')], baralho), ptEN([ptC('ENXAME', 'ZUMBI', 0), ptC('ENXAME', 'EXPLOIT')], [ptC('ENXAME', 'ZUMBI', 1), ptC('ENXAME', 'ZUMBI', 2), ptC('ENXAME', 'DDOS')]));
  p = ptJoga(p, { tipo: 'jogar', id: ptC('MAINFRAME', 'AUDITOR').id });
  assert.deepEqual(p.lados[1].campo.cpu.map((c) => c.nome), ['AUDITOR']);
  assert.equal(pt.total(p, 1), 5, 'os pontos do MALWARE são do outro lado');
  assert.deepEqual(p.lados[0].mao.map((c) => c.nome).sort(), ['GERADOR', 'PROXY', 'TORRE']);
  assert.equal(p.vez, 1);
  p = ptJoga(p, { tipo: 'jogar', id: ptC('ENXAME', 'ZUMBI', 0).id });
  assert.deepEqual(p.lados[1].campo.cpu.map((c) => c.nome), ['AUDITOR', 'ZUMBI', 'ZUMBI', 'ZUMBI']);
  assert.deepEqual(p.lados[1].baralho.map((c) => c.nome), ['DDOS']);
  assert.equal(pt.agir(p, { tipo: 'jogar', id: ptC('MAINFRAME', 'PROXY').id, fileira: 'disco' }, rngDe(1)), p, 'ágil não vai no DISCO');
  p = ptJoga(p, { tipo: 'jogar', id: ptC('MAINFRAME', 'PROXY').id, fileira: 'rede' });
  assert.equal(pt.totalFileira(p, 0, 'rede'), 4);
});

test('PROTOCOLO: BACKUP revive do descarte; CTRL+Z devolve à mão; KILL -9 destrói as mais fortes; REBOOT limpa', () => {
  const firewall = ptC('MAINFRAME', 'FIREWALL');
  const eu = ptMF([ptC('MAINFRAME', 'TECNICO'), ptC('MAINFRAME', 'CTRL+Z'), ptC('MAINFRAME', 'KILL -9'), ptC('MAINFRAME', 'REBOOT')]);
  eu.descarte = [firewall, ptC('MAINFRAME', 'ADMIN')];
  let p = ptMesa(eu, ptEN([ptC('ENXAME', 'DDOS')]));
  p = ptJoga(p, { tipo: 'jogar', id: ptC('MAINFRAME', 'TECNICO').id });
  assert.equal(p.pendente, 0);
  assert.deepEqual(pt.revivivel(p.lados[0]).map((c) => c.nome), ['FIREWALL'], 'herói não revive');
  assert.equal(pt.agir(p, { tipo: 'passar' }, rngDe(1)), p, 'primeiro escolhe o que reviver');
  p = ptJoga(p, { tipo: 'reviver', id: firewall.id });
  assert.deepEqual([p.lados[0].campo.cpu.map((c) => c.nome), p.vez, p.pendente], [['FIREWALL'], 1, null]);
  p = ptJoga(p, { tipo: 'jogar', id: ptC('ENXAME', 'DDOS').id });
  p = ptJoga(p, { tipo: 'jogar', id: ptC('MAINFRAME', 'CTRL+Z').id, alvo: firewall.id });
  assert.ok(p.lados[0].mao.includes(firewall));
  assert.deepEqual(p.lados[0].campo.cpu.map((c) => c.nome), ['CTRL+Z']);
  assert.equal(pt.total(p, 0), 5, 'o CTRL+Z vale 0');
  // sem cartas nem líder, o bot passou sozinho; KILL -9 leva o DDOS (8), a maior do campo
  assert.deepEqual([p.lados[1].passou, p.lados[1].ultima, p.vez], [true, 'PASSOU (SEM CARTAS)', 0]);
  p = ptJoga(p, { tipo: 'jogar', id: ptC('MAINFRAME', 'KILL -9').id });
  assert.deepEqual([p.lados[1].campo.disco.length, p.lados[1].descarte.map((c) => c.nome)], [0, ['DDOS']]);
  p = { ...p, clima: { cpu: null, rede: { carta: ptC('ENXAME', 'LAG'), dono: 1 }, disco: null } };
  p = ptJoga(p, { tipo: 'jogar', id: ptC('MAINFRAME', 'REBOOT').id });
  assert.equal(p.clima.rede, null);
  assert.ok(p.lados[1].descarte.some((c) => c.nome === 'LAG'), 'o clima volta para o descarte de quem jogou');
});

test('PROTOCOLO: rodadas, vidas, passivas e o fim da partida', () => {
  const geradores = [ptC('MAINFRAME', 'GERADOR'), ptC('MAINFRAME', 'TORRE')];
  let p = ptMesa(ptMF([...geradores, ptC('MAINFRAME', 'RAID')], [ptC('MAINFRAME', 'SWITCH')]), ptEN([ptC('ENXAME', 'DDOS'), ptC('ENXAME', 'SPOOFER'), ptC('ENXAME', 'EXPLOIT')]));
  p = ptJoga(p, { tipo: 'jogar', id: geradores[0].id });
  p = ptJoga(p, { tipo: 'jogar', id: ptC('ENXAME', 'SPOOFER').id });
  p = ptJoga(p, { tipo: 'passar' });
  // você passou: o bot segue sozinho
  p = ptJoga(p, { tipo: 'jogar', id: ptC('ENXAME', 'EXPLOIT').id });
  assert.equal(p.vez, 1);
  p = ptJoga(p, { tipo: 'passar' });
  assert.equal(p.fase, 'placar');
  assert.deepEqual(p.rodadas, [{ pontos: [8, 9], vencedor: 1 }]);
  assert.deepEqual(p.lados.map((l) => l.vidas), [1, 2]);
  p = ptJoga(p, { tipo: 'seguir' });
  assert.deepEqual([p.fase, p.rodada, p.vez], ['jogo', 2, 1], 'quem venceu começa');
  // ENXAME: uma unidade sua fica no campo
  assert.equal(pt.total(p, 1) > 0, true);
  assert.equal(p.lados[0].mao.length, 2, 'o MAINFRAME perdeu: não compra');
  // a partida acaba quando alguém fica sem vida
  const fim = { ...p, lados: [{ ...p.lados[0], vidas: 0 }, p.lados[1]] as pt.Partida['lados'], fase: 'placar' as const, rodadas: [...p.rodadas, { pontos: [0, 9], vencedor: 1 } as pt.Rodada] };
  const acabou = ptJoga(fim, { tipo: 'seguir' });
  assert.deepEqual([acabou.fase, acabou.vencedor], ['fim', 1]);
  assert.deepEqual([pt.retornoProtocolo(0, 50), pt.retornoProtocolo(null, 50), pt.retornoProtocolo(1, 50)], [100, 50, 0]);
  // os níveis custam 20, 50 e 100; a PRATICA entra de graça e só a vitória paga o prêmio (empate não devolve nada)
  assert.deepEqual(ptBot.NIVEIS.map((n) => n.aposta), [20, 50, 100]);
  assert.equal(ptBot.PRATICA.aposta, 0);
  const premio = ptBot.PRATICA.premio;
  assert.deepEqual([pt.retornoProtocolo(0, 0, premio), pt.retornoProtocolo(null, 0, premio), pt.retornoProtocolo(1, 0, premio)], [30, 0, 0]);
  for (let k = 0; k < 20; k++) assert.ok(ptBot.NIVEIS[ptBot.sortearNivel(rngDe(k))]);
  // empate na rodada: os dois perdem uma vida; MAINFRAME que vence compra 1
  let e = ptMesa(ptMF([ptC('MAINFRAME', 'FIREWALL')], [ptC('MAINFRAME', 'SWITCH')]), ptEN([ptC('ENXAME', 'EXPLOIT')]));
  e = ptJoga(ptJoga(e, { tipo: 'passar' }), { tipo: 'passar' });
  assert.deepEqual([e.rodadas[0].vencedor, e.lados.map((l) => l.vidas)], [null, [1, 1]]);
  let v = ptMesa(ptMF([ptC('MAINFRAME', 'FIREWALL')], [ptC('MAINFRAME', 'SWITCH')]), ptEN([ptC('ENXAME', 'SPAM')]));
  v = ptJoga(v, { tipo: 'jogar', id: ptC('MAINFRAME', 'FIREWALL').id });
  v = ptJoga(ptJoga(v, { tipo: 'passar' }), { tipo: 'passar' });
  v = ptJoga(v, { tipo: 'seguir' });
  assert.deepEqual(v.lados[0].mao.map((c) => c.nome), ['SWITCH']);
});

test('PROTOCOLO: líderes de uso único', () => {
  let p = ptMesa(ptMF([ptC('MAINFRAME', 'RAID')]), ptEN([ptC('ENXAME', 'SPAM')], [ptC('ENXAME', 'LAG')]));
  p = ptJoga(p, { tipo: 'jogar', id: ptC('MAINFRAME', 'RAID').id });
  assert.ok(pt.liderPode(p, 1));
  p = ptJoga(p, { tipo: 'lider' });
  assert.equal(p.clima.rede?.carta.nome, 'LAG');
  assert.equal(pt.liderPode(p, 1), false);
  p = ptJoga(p, { tipo: 'lider' });
  assert.equal(pt.totalFileira(p, 0, 'disco'), 12, 'OVERCLOCK do líder no DISCO');
  assert.equal(pt.liderPode(p, 0), false);
});

test('PROTOCOLO: partidas entre bots terminam sem jogada inválida; o DIFICIL ganha mais do FACIL', () => {
  let dificil = 0;
  let facil = 0;
  for (let s = 1; s <= 12; s++) {
    for (const [f0, f1] of [['MAINFRAME', 'ENXAME'], ['ENXAME', 'MAINFRAME']] as Array<[pt.Faccao, pt.Faccao]>) {
      const rng = rngDe(s);
      let p = pt.novaPartida(pt.baralhoPadrao(f0), pt.baralhoPadrao(f1), 'BOT', rng);
      let passos = 0;
      while (p.fase !== 'fim' && passos++ < 400) {
        const quem = p.fase === 'jogo' ? (p.pendente ?? p.vez) : 0;
        const q = pt.agir(p, ptBot.decidirBot(p, rng, ptBot.NIVEIS[quem === 0 ? 2 : 0]), rng);
        assert.notEqual(q, p, `semente ${s}: jogada que não vale`);
        p = q;
      }
      assert.equal(p.fase, 'fim');
      assert.ok(p.rodadas.length >= 2 && p.rodadas.length <= 3);
      const cartas = p.lados.reduce((n, l) => n + l.mao.length + l.baralho.length + l.descarte.length + pt.FILEIRAS.reduce((m, f) => m + l.campo[f].length, 0), 0);
      assert.equal(cartas, pt.montar(pt.baralhoPadrao(f0)).length + pt.montar(pt.baralhoPadrao(f1)).length, 'nenhuma carta some');
      if (p.vencedor === 0) dificil++;
      else if (p.vencedor === 1) facil++;
    }
  }
  assert.ok(dificil > facil, `DIFICIL ${dificil} x FACIL ${facil}`);
});

test('PROTOCOLO: montar baralho: mínimo de unidades, máximo de especiais e de cópias; o salvo é normalizado', () => {
  const b = pt.baralhoPadrao('NUVEM');
  assert.deepEqual(pt.problemasDo({ ...b, cartas: { ...b.cartas, API: 0 } }), ['FALTAM 2 UNIDADES (MINIMO 22)']);
  assert.deepEqual(pt.problemasDo({ ...b, cartas: { ...b.cartas, LAG: 3, REBOOT: 3 } }), ['SOBRAM 2 ESPECIAIS (MAXIMO 10)']);
  assert.deepEqual(pt.problemasDo({ ...b, lider: 'MAINFRAME-1' }), ['ESCOLHA UM LIDER DA FACCAO']);
  const n = pt.normalizarBaralho('NUVEM', { lider: 'NUVEM-3', cartas: { CEO: 5, ADMIN: 1, SUPERUSUARIO: 1, LAG: 2 } });
  assert.deepEqual(n, { faccao: 'NUVEM', lider: 'NUVEM-3', cartas: { CEO: 1, SUPERUSUARIO: 1, LAG: 2 } }, 'ADMIN é do MAINFRAME; CEO tem 1 só');
  assert.deepEqual(pt.normalizarBaralho('ENXAME', 'lixo'), pt.baralhoPadrao('ENXAME'));
  assert.equal(pt.contagem(pt.baralhoPadrao('MAINFRAME')).herois, 4);
});

test('PROTOCOLO: TURBO dobra as outras da fileira; NUVEM vence o empate; CODIGO LIVRE escolhe quem começa', () => {
  const amp = ptC('ENXAME', 'AMPLIFICADOR');
  let p = ptMesa(ptMF([ptC('MAINFRAME', 'FIREWALL'), amp, ptC('MAINFRAME', 'ADMIN')]), ptLado('BOT', 'NUVEM', [ptC('NUVEM', 'GATEWAY')]));
  p = ptJoga(p, { tipo: 'jogar', id: ptC('MAINFRAME', 'FIREWALL').id });
  p = ptJoga(p, { tipo: 'passar' });
  p = ptJoga(p, { tipo: 'jogar', id: amp.id });
  p = ptJoga(p, { tipo: 'jogar', id: ptC('MAINFRAME', 'ADMIN').id });
  assert.equal(pt.totalFileira(p, 0, 'cpu'), 10 + 2 + 10, 'FIREWALL 5 dobra; o AMPLIFICADOR não se dobra; herói não muda');
  // empate 0 a 0 contra a NUVEM: a NUVEM vence
  let e = ptMesa(ptMF([ptC('MAINFRAME', 'FIREWALL')]), ptLado('BOT', 'NUVEM', [ptC('NUVEM', 'API')]));
  e = ptJoga(ptJoga(e, { tipo: 'passar' }), { tipo: 'passar' });
  assert.deepEqual([e.rodadas[0].vencedor, e.lados.map((l) => l.vidas)], [1, [1, 2]]);
  assert.match(e.aviso, /NUVEM VENCE O EMPATE/);
  // CODIGO LIVRE (você) escolhe; contra ele, o bot escolhe você começar
  const livre = pt.novaPartida(pt.baralhoPadrao('CODIGO LIVRE'), pt.baralhoPadrao('NUVEM'), 'BOT', rngDe(5));
  assert.ok(livre.escolheInicio);
  assert.equal(ptJoga(livre, { tipo: 'inicio', quem: 1 }).vez, 1);
  assert.equal(ptJoga(livre, { tipo: 'inicio', quem: 0 }).vez, 0);
  for (let s = 1; s <= 8; s++) {
    const contra = pt.novaPartida(pt.baralhoPadrao('NUVEM'), pt.baralhoPadrao('CODIGO LIVRE'), 'BOT', rngDe(s));
    assert.deepEqual([contra.escolheInicio, contra.vez], [false, 0]);
    assert.equal(pt.agir(contra, { tipo: 'inicio', quem: 1 }, rngDe(1)), contra);
  }
});

test('PROTOCOLO: líderes novos: KILL na fileira, ESPIAR, PILHAGEM, RESGATE e os passivos (ANULAR, MAO EXTRA, ESPIOES EM DOBRO)', () => {
  // KILL NO DISCO (MAINFRAME-4): só com o DISCO dele em 10 ou mais
  const ddos = ptC('ENXAME', 'DDOS');
  const minerador = ptC('ENXAME', 'MINERADOR');
  let k = ptMesa(ptLado('VOCE', 'MAINFRAME', [ptC('MAINFRAME', 'FIREWALL'), ptC('MAINFRAME', 'SWITCH')], [], 4), ptEN([ddos, minerador]));
  k = ptJoga(k, { tipo: 'jogar', id: ptC('MAINFRAME', 'FIREWALL').id });
  k = ptJoga(k, { tipo: 'jogar', id: ddos.id });
  assert.equal(pt.liderPode(k, 0), false, 'DISCO dele soma 8');
  let k2 = ptMesa(ptLado('VOCE', 'MAINFRAME', [ptC('MAINFRAME', 'FIREWALL')], [], 4), ptEN([]));
  k2 = { ...k2, lados: [k2.lados[0], { ...k2.lados[1], campo: { cpu: [], rede: [], disco: [ddos, minerador] } }] };
  assert.ok(pt.liderPode(k2, 0));
  k2 = ptJoga(k2, { tipo: 'lider' });
  assert.deepEqual(k2.lados[1].campo.disco.map((c) => c.nome), ['MINERADOR']);

  // ESPIAR (NUVEM-2): você vê 3 cartas da mão dele
  const maoDele = [ptC('ENXAME', 'DDOS'), ptC('ENXAME', 'EXPLOIT'), ptC('ENXAME', 'SPAM'), ptC('ENXAME', 'BACKDOOR')];
  const espiou = ptJoga(ptMesa(ptLado('VOCE', 'NUVEM', [ptC('NUVEM', 'API')], [], 2), ptEN(maoDele)), { tipo: 'lider' });
  assert.equal(espiou.lados[0].revelado.length, 3);
  assert.ok(espiou.lados[0].revelado.every((id) => maoDele.some((c) => c.id === id)));

  // PILHAGEM (NUVEM-4): uma carta do descarte dele vem para a sua mão
  const pil = ptMesa(ptLado('VOCE', 'NUVEM', [ptC('NUVEM', 'API')], [], 4), ptEN([ptC('ENXAME', 'SPAM')]));
  pil.lados[1].descarte = [ptC('ENXAME', 'ZERO DAY'), ptC('ENXAME', 'KILL -9')];
  let q = ptJoga(pil, { tipo: 'lider' });
  assert.deepEqual([q.pendente, q.escolha, pt.opcoesDeEscolha(q).length], [0, 'pilhar', 2]);
  q = ptJoga(q, { tipo: 'reviver', id: ptC('ENXAME', 'ZERO DAY').id });
  assert.ok(q.lados[0].mao.some((c) => c.nome === 'ZERO DAY'));
  assert.deepEqual([q.lados[1].descarte.map((c) => c.nome), q.vez], [['KILL -9'], 1]);

  // RESGATE (ENXAME-3): uma carta do seu descarte volta para a mão (herói também)
  const res = ptMesa(ptLado('VOCE', 'ENXAME', [ptC('ENXAME', 'SPAM')], [], 3), ptMF([ptC('MAINFRAME', 'FIREWALL')]));
  res.lados[0].descarte = [ptC('ENXAME', 'MESTRE DA BOTNET')];
  q = ptJoga(ptJoga(res, { tipo: 'lider' }), { tipo: 'reviver', id: ptC('ENXAME', 'MESTRE DA BOTNET').id });
  assert.deepEqual(q.lados[0].mao.map((c) => c.nome).sort(), ['MESTRE DA BOTNET', 'SPAM']);

  // passivos, na partida nova
  const b = (f: pt.Faccao, k2l: number) => ({ ...pt.baralhoPadrao(f), lider: `${f}-${k2l}` });
  const mao = pt.novaPartida(b('CODIGO LIVRE', 4), b('MAINFRAME', 1), 'BOT', rngDe(2));
  assert.deepEqual([mao.lados[0].mao.length, mao.lados[0].liderUsado], [11, true]);
  const anulou = pt.novaPartida(b('NUVEM', 3), b('CODIGO LIVRE', 4), 'BOT', rngDe(2));
  assert.deepEqual([anulou.lados[1].liderAnulado, anulou.lados[1].mao.length, pt.liderPode(anulou, 1)], [true, 10, false], 'ANULAR cancela até o passivo');
  const espioes = pt.novaPartida(b('ENXAME', 4), b('MAINFRAME', 1), 'BOT', rngDe(2));
  assert.ok(espioes.espioesX2);
  const auditor = ptC('MAINFRAME', 'AUDITOR');
  let sp = { ...ptMesa(ptMF([auditor], [ptC('MAINFRAME', 'TORRE'), ptC('MAINFRAME', 'RAID')]), ptEN([])), espioesX2: true };
  sp = ptJoga(sp, { tipo: 'jogar', id: auditor.id });
  assert.equal(pt.total(sp, 1), 10, 'MALWARE de 5 vale 10');
});
