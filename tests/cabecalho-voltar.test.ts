import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { rotaAnterior } from '../src/components/cabecalhoPagina';

test('Voltar do cabeçalho sobe pela URL até a página mais próxima, até a Home (2026-11-10)', () => {
  assert.equal(rotaAnterior('/'), null);
  assert.equal(rotaAnterior('/cadastros/usuarios/novo'), '/cadastros');
  assert.equal(rotaAnterior('/cadastros/usuarios/kiosk'), '/cadastros');
  assert.equal(rotaAnterior('/cadastros/editar/usuarios'), '/cadastros');
  assert.equal(rotaAnterior('/cadastros'), '/');
  assert.equal(rotaAnterior('/combustivel/novo'), '/combustivel');
  assert.equal(rotaAnterior('/perfil'), '/');
  assert.equal(rotaAnterior('/engenharia/obras/abc'), '/engenharia/obras');
  assert.equal(rotaAnterior('/portal-cliente/contratos/abc'), '/portal-cliente/contratos');
  assert.equal(rotaAnterior('/checklist/historico/abc'), '/checklist/historico');
  assert.equal(rotaAnterior('/checklist/historico'), '/checklist');
  assert.equal(rotaAnterior('/friday/quadros/q1/automacoes'), '/friday/quadros/q1');
  assert.equal(rotaAnterior('/friday/quadros/q1'), '/friday');
});

test('grupo sem página própria é pulado: /frota não existe, então Frota volta para a Home', () => {
  assert.equal(rotaAnterior('/frota/veiculos/abc'), '/frota/veiculos');
  assert.equal(rotaAnterior('/frota/checklists/abc'), '/frota/checklists');
  assert.equal(rotaAnterior('/frota/veiculos'), '/');
  assert.equal(rotaAnterior('/frota/analytics'), '/');
});

test('documentos do The Manuscript voltam à raiz do Reader', () => {
  assert.equal(rotaAnterior('/the-manuscript/03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md'), '/the-manuscript');
  assert.equal(rotaAnterior('/the-manuscript/mapa'), '/the-manuscript');
  assert.equal(rotaAnterior('/the-manuscript'), '/');
});

test('o Voltar fica só no cabeçalho: as páginas não têm mais o seu', () => {
  const header = readFileSync('src/components/Header.tsx', 'utf8');
  assert.match(header, /aria-label="Voltar"/);
  for (const arquivo of [
    'src/pages/CadastroUsuarioNovoPage.tsx',
    'src/pages/CadastroUsuariosEditarPage.tsx',
    'src/pages/KioskCredentialsPage.tsx',
    'src/pages/CombustivelNovoPage.tsx',
    'src/pages/FrotaAnalyticsPage.tsx',
    'src/pages/FrotaVeiculoDetalhesPage.tsx',
    'src/pages/ChecklistDetalhePage.tsx',
    'src/features/obras/ObraDetalhesPage.tsx',
    'src/features/portal-cliente/ContratoPortalPage.tsx',
    'src/features/checklist-mecanico/ChecklistHistoricoPage.tsx',
  ]) {
    assert.doesNotMatch(readFileSync(arquivo, 'utf8'), />\s*Voltar|ArrowBack/, arquivo);
  }
});
