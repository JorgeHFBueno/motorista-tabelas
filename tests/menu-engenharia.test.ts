import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path: string) => readFileSync(path, 'utf8');

test('menu Engenharia disponibiliza Obras e Cronograma apenas para adm2', () => {
  const home = source('src/pages/HomeDashboard.tsx');

  assert.match(home, /label: 'Engenharia'/);
  assert.match(home, /requiresAdm2: true/);
  assert.match(home, /label: 'Obras', to: '\/engenharia\/obras'/);
  assert.match(home, /label: 'Cronograma', to: '\/engenharia\/cronograma'/);
  assert.match(home, /if \(action\.requiresAdm2\) return isAdm2/);
  assert.match(home, /<Collapse in=\{expandedGroup === action\.label\}/);
  assert.match(home, /gridTemplateColumns: \{ xs: '1fr', sm: '1fr 1fr' \}/);
  assert.match(home, /minHeight: 120/);
  assert.match(home, /fontSize: 18, fontWeight: 700/);
  assert.match(home, /CalendarMonthIcon/);
  assert.match(home, /ConstructionIcon/);
});

test('sidebar rápida preserva estado, acessibilidade e comportamento móvel', () => {
  const home = source('src/pages/HomeDashboard.tsx');

  assert.match(home, /localStorage\.getItem\('home-sidebar-collapsed'\)/);
  assert.match(home, /localStorage\.setItem\('home-sidebar-collapsed'/);
  assert.match(home, /width: collapsed \? 68 : 252/);
  assert.match(home, /position: temporary \? 'static' : 'sticky'/);
  assert.match(home, /<Drawer anchor="left" open=\{mobileSidebarOpen\}/);
  assert.match(home, /aria-label="Menu rápido"/);
  assert.match(home, /aria-expanded=\{hasChildren \? expanded : undefined\}/);
  assert.match(home, /actionDestination = action\.label === 'Combustível'/);
  assert.match(home, /aria-current=\{isActiveRoute\(child\.to\) \? 'page' : undefined\}/);
});

test('header não mantém links horizontais duplicados do menu rápido', () => {
  const header = source('src/components/Header.tsx');

  assert.doesNotMatch(header, /to="\/engenharia\/obras"/);
  assert.doesNotMatch(header, /to="\/engenharia\/cronograma"/);
  assert.doesNotMatch(header, /to="\/registros"/);
});

test('rotas existentes de Engenharia continuam sendo reutilizadas', () => {
  const app = source('src/App.tsx');

  assert.match(app, /path="engenharia\/obras" element=\{<EngenhariaObrasPage \/>\}/);
  assert.match(app, /path="engenharia\/cronograma" element=\{<CronogramaObrasPage \/>\}/);
});
