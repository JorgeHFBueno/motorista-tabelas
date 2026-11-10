import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { rotaAnterior } from '../src/components/cabecalhoPagina';
import { filtrarMenuPrincipal } from '../src/components/menuPrincipal';
import { emptyAuthorizationProfile, type AuthorizationProfile } from '../src/services/authorizationProfileCore';

test('Voltar do cabeçalho sobe pela URL até a página mais próxima, até a Home (2026-11-10)', () => {
  assert.equal(rotaAnterior('/'), null);
  assert.equal(rotaAnterior('/combustivel/registros/novo'), '/combustivel/registros');
  assert.equal(rotaAnterior('/perfil'), '/');
  assert.equal(rotaAnterior('/engenharia/obras/abc'), '/engenharia/obras');
  assert.equal(rotaAnterior('/portal-cliente/contratos/abc'), '/portal-cliente/contratos');
  assert.equal(rotaAnterior('/friday/quadros/q1/automacoes'), '/friday/quadros/q1');
  assert.equal(rotaAnterior('/friday/quadros/q1'), '/friday');
});

test('grupo sem página própria é pulado: /frota, /cadastros e /combustivel não existem, então voltam para a Home', () => {
  assert.equal(rotaAnterior('/cadastros/usuarios/novo'), '/');
  assert.equal(rotaAnterior('/cadastros/usuarios/kiosk'), '/');
  assert.equal(rotaAnterior('/cadastros/editar/usuarios'), '/');
  assert.equal(rotaAnterior('/combustivel/registros'), '/');
  assert.equal(rotaAnterior('/combustivel/bombas'), '/');
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
  ]) {
    assert.doesNotMatch(readFileSync(arquivo, 'utf8'), />\s*Voltar|ArrowBack/, arquivo);
  }
});

test('menu e rotas de 2026-11-10: Cadastros e Combustível são grupos, Checklist do mecânico pausado, legenda só na Home', () => {
  const menu = readFileSync('src/components/menuPrincipal.tsx', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  const titulos = readFileSync('src/components/cabecalhoPagina.tsx', 'utf8');
  assert.match(menu, /label: 'Usuários', to: '\/cadastros\/editar\/usuarios'/);
  assert.match(menu, /label: 'Novo usuário', to: '\/cadastros\/usuarios\/novo'/);
  assert.match(menu, /label: 'Credenciais Kiosk', to: '\/cadastros\/usuarios\/kiosk'/);
  assert.match(menu, /label: 'Registros', to: '\/combustivel\/registros'/);
  assert.match(menu, /label: 'Bombas', to: '\/combustivel\/bombas'/);
  assert.doesNotMatch(menu, /to: '\/(cadastros|combustivel|checklist)'/);
  assert.doesNotMatch(app, /path="(cadastros|combustivel|combustivel\/novo|bombas|checklist[^"]*)"/);
  assert.doesNotMatch(app, /CadastrosPage|checklist-mecanico\//);
  assert.equal(titulos.match(/subtitulo: '/g)?.length, 1);
});

const perfil = (credenciais: Partial<AuthorizationProfile>): AuthorizationProfile => ({ ...emptyAuthorizationProfile(), exists: true, ativo: true, ...credenciais });
const grupo = (p: AuthorizationProfile, label: string) => filtrarMenuPrincipal(p).find((item) => item.label === label)?.children?.map((c) => c.label);

test('Meu perfil fica dentro de Cadastros e continua aberto a qualquer credencial (2026-11-10)', () => {
  assert.deepEqual(grupo(perfil({ escritorio: true }), 'Cadastros'), ['Usuários', 'Novo usuário', 'Credenciais Kiosk', 'Meu perfil']);
  assert.deepEqual(grupo(perfil({ motorista: true }), 'Cadastros'), ['Meu perfil']);
  assert.deepEqual(filtrarMenuPrincipal(perfil({ motorista: true })).map((i) => i.label), ['Cadastros']);
  assert.equal(filtrarMenuPrincipal(perfil({ adm2: true })).some((i) => i.label === 'Meu perfil'), false);
  assert.deepEqual(filtrarMenuPrincipal(perfil({})), []);
});

test('subitens da Home mostram uma descrição, não o caminho', () => {
  const home = readFileSync('src/pages/HomeDashboard.tsx', 'utf8');
  assert.match(home, /\{child\.descricao\}/);
  assert.doesNotMatch(home, /\{child\.to\}/);
  for (const item of filtrarMenuPrincipal(perfil({ adm2: true }))) {
    for (const child of item.children ?? []) assert.ok(child.descricao.length > 0 && !child.descricao.startsWith('/'), child.label);
  }
});

test('Home ocupa o resto da tela sem chutar a altura do cabeçalho (sem rolagem à toa)', () => {
  const home = readFileSync('src/pages/HomeDashboard.tsx', 'utf8');
  const css = readFileSync('src/App.css', 'utf8');
  assert.doesNotMatch(home, /100vh/);
  assert.match(home, /flex: 1/);
  assert.match(css, /#root \{[^}]*display: flex;[^}]*flex-direction: column;/);
});

test('Registros e Bombas de combustível mostram a logo Abastecedora Ledur no lugar do título (2026-11-10)', () => {
  const cabecalho = readFileSync('src/components/cabecalhoPagina.tsx', 'utf8');
  for (const rota of ['/combustivel/registros', '/combustivel/bombas']) {
    assert.match(cabecalho, new RegExp(`padrao: '${rota}', titulo: '[^']+', \\.\\.\\.ABASTECEDORA`), rota);
  }
  assert.match(cabecalho, /logo: '\/logo-abastecedora-ledur\.svg'/);
  assert.match(readFileSync('public/logo-abastecedora-ledur.svg', 'utf8'), /^<svg /);
  // O título continua como texto alternativo da imagem.
  assert.match(readFileSync('src/components/Header.tsx', 'utf8'), /src=\{pagina\.logo\} alt=\{pagina\.titulo\}/);
});

test('Nova entrada de diesel fica no card da bomba, abaixo do seletor', () => {
  const bombas = readFileSync('src/pages/BombasPage.tsx', 'utf8');
  const seletor = bombas.indexOf("'aria-label': 'Selecionar bomba'");
  const botao = bombas.search(/Nova entrada de diesel\r?\n/);
  const fimDoCard = bombas.indexOf('{cards.map(');
  assert.ok(seletor > 0 && seletor < botao && botao < fimDoCard);
});
