import assert from 'node:assert/strict';
import test from 'node:test';
import { buildManuscriptSystemGraph, manuscriptTitle, parseManuscriptDocument, splitFrontMatter } from '../lib/manuscriptMetadata.js';

const doc = (block, body = '# Título\n\nTexto.') => `---\n${block}\n---\n\n${body}`;

test('front-matter is split from the body; documents without it keep the whole content', () => {
  assert.deepEqual(splitFrontMatter(doc('tipo: tela')), { raw: 'tipo: tela', body: '# Título\n\nTexto.' });
  assert.deepEqual(splitFrontMatter('# Só corpo\n---\n'), { raw: null, body: '# Só corpo\n---\n' });
  assert.equal(splitFrontMatter('﻿---\r\ntipo: tela\r\n---\r\n# A').body, '# A');
});

test('a valid block is parsed with lists, quotes and comments', () => {
  const parsed = parseManuscriptDocument(doc([
    '# comentário',
    'tipo: tela',
    'dominios: [bombas, combustivel]',
    'status: vigente',
    'resumo: "Tela /bombas: estado da bomba."',
    'define: [rota:/bombas]',
    'le: [colecao:bombas, colecao:03-combustivel]',
    'escreve: [colecao:bombas]',
    'chama: []',
  ].join('\n')));
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(parsed.metadata, {
    tipo: 'tela', dominios: ['bombas', 'combustivel'], status: 'vigente', resumo: 'Tela /bombas: estado da bomba.',
    define: ['rota:/bombas'], le: ['colecao:bombas', 'colecao:03-combustivel'], escreve: ['colecao:bombas'], chama: [], integra: [],
  });
  assert.equal(manuscriptTitle(doc('# comentário\ntipo: tela'), 'x.md'), 'Título');
});

test('vocabulary, format and relation kinds are enforced', () => {
  assert.deepEqual(parseManuscriptDocument('# Sem bloco').problems, ['bloco de dados ausente']);
  const { problems } = parseManuscriptDocument(doc([
    'tipo: pagina', 'dominios: [frota, inexistente]', 'status: ok', 'resumo: "x"', 'autor: eu',
    'define: rota:/x', 'le: [colecao bombas]', 'chama: [colecao:bombas]', 'integra: [function:api]', 'tipo: tela',
  ].join('\n')));
  assert.deepEqual(problems.sort(), [
    '"chama" aceita só function: ("colecao:bombas")',
    '"integra" aceita só externo: ("function:api")',
    'campo "define" precisa ser lista entre colchetes',
    'campo "tipo" repetido',
    'campo desconhecido "autor"',
    'domínio "inexistente" fora do vocabulário',
    'entidade "colecao bombas" em "le" fora do formato tipo:nome',
    'status "ok" fora do vocabulário',
    'tipo "pagina" fora do vocabulário',
  ].sort());
  assert.match(parseManuscriptDocument(doc(`tipo: tela\ndominios: [frota]\nstatus: vigente\nresumo: "${'a'.repeat(241)}"`)).problems[0], /240/);
});

test('system graph links documents to entities and reports corpus problems', () => {
  const graph = buildManuscriptSystemGraph([
    { path: '01_FIRESTORE/COLECOES/bombas.md', title: 'bombas', content: doc('tipo: colecao\ndominios: [bombas]\nstatus: vigente\nresumo: "Estado da bomba."\ndefine: [colecao:bombas]') },
    { path: '03_APLICACAO_WEB/08_BOMBAS.md', title: 'Bombas', links: ['01_FIRESTORE/COLECOES/bombas.md', 'nao-existe.md'], content: doc('tipo: tela\ndominios: [bombas]\nstatus: vigente\nresumo: "Tela."\ndefine: [rota:/bombas, colecao:bombas]\nle: [colecao:bombas, colecao:fantasma]\nchama: [function:x]') },
    { path: '_AUDITORIA/A.md', title: 'A', content: doc('tipo: tela\ndominios: [sistema]\nstatus: vigente\nresumo: "a"') },
    { path: 'SEM.md', title: 'Sem', content: '# Sem' },
  ]);
  const node = (id) => graph.nodes.find((item) => item.id === id);
  assert.equal(node('colecao:bombas').kind, 'ENTIDADE');
  assert.equal(node('colecao:bombas').definidoEm, '01_FIRESTORE/COLECOES/bombas.md');
  assert.deepEqual(node('colecao:bombas').dominios, ['bombas']);
  assert.equal(node('SEM.md').tipo, 'sem-bloco');
  assert.ok(graph.edges.some((edge) => edge.source === '03_APLICACAO_WEB/08_BOMBAS.md' && edge.target === 'colecao:bombas' && edge.relacao === 'le'));
  assert.ok(graph.edges.some((edge) => edge.relacao === 'link' && edge.target === '01_FIRESTORE/COLECOES/bombas.md'));
  assert.ok(!graph.edges.some((edge) => edge.target === 'nao-existe.md'));
  const problems = graph.problems.map((item) => `${item.path}: ${item.problem}`).sort();
  assert.deepEqual(problems, [
    '01_FIRESTORE/COLECOES/bombas.md: "colecao:bombas" definida também em 03_APLICACAO_WEB/08_BOMBAS.md',
    '03_APLICACAO_WEB/08_BOMBAS.md: "colecao:bombas" definida também em 01_FIRESTORE/COLECOES/bombas.md',
    '03_APLICACAO_WEB/08_BOMBAS.md: "colecao:fantasma" não é definida em nenhum documento',
    '03_APLICACAO_WEB/08_BOMBAS.md: "function:x" não é definida em nenhum documento',
    'SEM.md: bloco de dados ausente',
    '_AUDITORIA/A.md: documento de _AUDITORIA precisa de tipo auditoria',
  ]);
});
