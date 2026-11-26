import assert from 'node:assert/strict';
import { test } from 'node:test';
import { idDaPagina, paginaErp, problemaDaDecisao } from '../src/features/erp/aprovacoesCore';

// Aprovar página do ERP (The Manuscript, 01_FIRESTORE/COLECOES/erp-aprovacoes.md).

test('paginaErp: the route pattern of the screen; each report is its own page; nothing outside /erp', () => {
  assert.equal(paginaErp('/erp'), 'erp');
  assert.equal(paginaErp('/erp/pessoas'), 'erp/pessoas');
  assert.equal(paginaErp('/erp/pessoas/1021'), 'erp/pessoas/:codigo');
  assert.equal(paginaErp('/erp/pessoas/novo'), 'erp/pessoas/:codigo');
  assert.equal(paginaErp('/erp/estoques/contagens/nova'), 'erp/estoques/contagens/:codigo');
  assert.equal(paginaErp('/erp/estoques/kardex'), 'erp/estoques/kardex');
  assert.equal(paginaErp('/erp/estoques/relatorios/giro'), 'erp/estoques/relatorios/giro');
  assert.equal(paginaErp('/erp/estoques/relatorios/curva-abc'), 'erp/estoques/relatorios/curva-abc');
  assert.equal(paginaErp('/erp/estoques/relatorios/Giro%20X'), null);
  assert.equal(paginaErp('/erp/nao-existe'), null);
  assert.equal(paginaErp('/erpx'), null);
  assert.equal(paginaErp('/logistica/kpi'), null);
  assert.equal(paginaErp('/'), null);
});

test('idDaPagina: dots instead of slashes', () => {
  assert.equal(idDaPagina('erp'), 'erp');
  assert.equal(idDaPagina('erp/pessoas/:codigo'), 'erp.pessoas.:codigo');
});

test('problemaDaDecisao: a choice is required; not approving requires a description', () => {
  assert.match(problemaDaDecisao('', '') ?? '', /Escolha/);
  assert.equal(problemaDaDecisao('aprovada', ''), null);
  assert.equal(problemaDaDecisao('aprovada', 'ok, mas ver o total'), null);
  assert.match(problemaDaDecisao('reprovada', '  ') ?? '', /Descreva/);
  assert.equal(problemaDaDecisao('reprovada', 'Falta o filtro por obra.'), null);
  assert.match(problemaDaDecisao('reprovada', 'x'.repeat(2001)) ?? '', /2000/);
  assert.equal(problemaDaDecisao('reprovada', 'Ver o rabisco.', [{ bytes: 1000 }]), null);
  assert.match(problemaDaDecisao('aprovada', '', Array.from({ length: 21 }, () => ({ bytes: 1 }))) ?? '', /20 imagens/);
  assert.match(problemaDaDecisao('aprovada', '', [{ bytes: 10 * 1024 * 1024 + 1 }]) ?? '', /10 MB/);
});
