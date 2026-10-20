import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path: string) => readFileSync(path, 'utf8');

test('menu Engenharia disponibiliza Obras e Cronograma apenas para adm2', () => {
  const menu = source('src/components/menuPrincipal.tsx');
  const home = source('src/pages/HomeDashboard.tsx');

  assert.match(menu, /label: 'Engenharia'/);
  assert.match(menu, /requiresAdm2: true/);
  assert.match(menu, /label: 'Obras', to: '\/engenharia\/obras'/);
  assert.match(menu, /label: 'Cronograma', to: '\/engenharia\/cronograma'/);
  assert.match(menu, /if \(action\.requiresAdm2\) return isAdm2/);
  assert.match(menu, /CalendarMonthIcon/);
  assert.match(menu, /ConstructionIcon/);
  assert.match(home, /<Collapse in=\{expandedGroup === action\.label\}/);
  assert.match(home, /gridTemplateColumns: \{ xs: '1fr', sm: '1fr 1fr' \}/);
  assert.match(home, /minHeight: 120/);
  assert.match(home, /fontSize: 18, fontWeight: 700/);
});

test('Home não tem menu lateral nem o card Portifólio, e a rota /portfolio continua existindo', () => {
  const menu = source('src/components/menuPrincipal.tsx');
  const home = source('src/pages/HomeDashboard.tsx');
  const app = source('src/App.tsx');

  assert.doesNotMatch(menu, /Portif/);
  assert.doesNotMatch(home, /<Drawer|home-sidebar-collapsed/);
  assert.match(app, /path="portfolio" element=\{<PortifolioPage \/>\}/);
});

test('menu lateral abre pelo cabeçalho fora da Home e preserva acessibilidade', () => {
  const header = source('src/components/Header.tsx');
  const lateral = source('src/components/MenuLateral.tsx');

  assert.match(header, /const SEM_MENU_LATERAL = \['\/', '\/login', '\/signup', '\/acesso-negado'\]/);
  assert.match(header, /aria-label="Abrir menu"/);
  assert.match(lateral, /<Drawer anchor="left" open=\{open\}/);
  assert.match(lateral, /aria-label="Menu principal"/);
  assert.match(lateral, /aria-expanded=\{hasChildren \? expanded : undefined\}/);
  assert.match(lateral, /destinoCombustivel\(isAdm2\)/);
  assert.match(lateral, /aria-current=\{isActiveRoute\(child\.to\) \? 'page' : undefined\}/);
});

test('header usa sino, ajuda e avatar no lugar dos links Usuário/Logout', () => {
  const header = source('src/components/Header.tsx');
  const topo = source('src/features/friday-gestao-interna/layout/Topo.tsx');

  assert.doesNotMatch(header, /<Nav\.Link onClick/);
  assert.match(header, /aria-label="Menu do usuário"/);
  assert.match(header, /id="ledur-header-avisos"/);
  assert.match(topo, /getElementById\('ledur-header-avisos'\)/);
  assert.doesNotMatch(topo, /LogoMarca|Avatar/);
  assert.doesNotMatch(header, /to="\/engenharia\/obras"/);
  assert.doesNotMatch(header, /to="\/registros"/);
});

test('rotas existentes de Engenharia continuam sendo reutilizadas', () => {
  const app = source('src/App.tsx');

  assert.match(app, /path="engenharia\/obras" element=\{<EngenhariaObrasPage \/>\}/);
  assert.match(app, /path="engenharia\/cronograma" element=\{<CronogramaObrasPage \/>\}/);
});
