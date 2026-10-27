import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calcular as calcularTela } from '../src/features/friday-gestao-interna/quadro/formula.ts';
import type { Coluna, Item } from '../src/features/friday-gestao-interna/quadro/tipos.ts';
import { calcular as calcularServidor } from '../functions/fridayFormula.ts';
import fixture from '../functions/test/fixtures/gestao-obras-colunas.json';

// functions/fridayFormula.ts é cópia de quadro/formula.ts (a Function fridayObrasSituacao calcula a fórmula "Status" do
// GESTÃO DE OBRAS no servidor). Se a tela mudar o cálculo, a cópia precisa mudar junto.
// Caminhos a partir da raiz do projeto (os scripts npm rodam de lá).
const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

test('a cópia das Functions é igual ao cálculo da tela (abaixo do marcador)', () => {
  const tela = ler('src/features/friday-gestao-interna/quadro/formula.ts').split("import type { Coluna, Item, Rotulo } from './tipos.ts';\n")[1];
  const servidor = ler('functions/fridayFormula.ts').split('// ---- início da cópia ----\n')[1];
  assert.ok(tela && servidor);
  assert.equal(servidor, tela, 'functions/fridayFormula.ts divergiu de quadro/formula.ts: copie de novo o trecho abaixo do marcador');
});

test('tela e servidor dão o mesmo Status para itens variados do GESTÃO DE OBRAS', () => {
  const colunas = fixture.colunas as unknown as Coluna[];
  const col = (t: string) => colunas.find(c => c.titulo === t)!;
  const op = (t: string, texto: string) => [(col(t).config.opcoes ?? col(t).config.rotulos).find((o: { texto: string }) => o.texto === texto).id];
  const rot = (t: string, texto: string) => op(t, texto)[0];
  const status = col('Status');
  const casos: Record<string, unknown>[] = [
    {},
    { [col('Situação').id]: op('Situação', 'Parada') },
    { [col('Situação').id]: op('Situação', 'Entregue'), [col('Tipo de Obra').id]: rot('Tipo de Obra', 'Pública'), [col('Termo de Receb.').id]: op('Termo de Receb.', 'Provisório') },
    { [col('Tipo de Obra').id]: rot('Tipo de Obra', 'Pública'), [col('Seguro Condicional').id]: op('Seguro Condicional', 'Não'), [col('Nº Empenho').id]: '7916/2024' },
    { [col('Tipo de Obra').id]: rot('Tipo de Obra', 'Privada'), [col('Cont. Assinado').id]: op('Cont. Assinado', 'OK'), [col('Nº Contrato').id]: '12', [col('Ano').id]: 2026,
      [col('Empresa').id]: rot('Empresa', 'LEDUR'), [col('ART').id]: op('ART', 'OK'), [col('CNO').id]: op('CNO', 'OK'), [col('Início').id]: '2026-01-10', [col('Fim').id]: '2026-11-01' },
  ];
  for (const hoje of [new Date(2026, 9, 27), new Date(2026, 9, 26)]) {
    for (const valores of casos) {
      const item = { id: 1, nome: 'x', valores } as unknown as Item;
      const a = calcularTela(status, item, { colunas, nomeUsuario: () => '', hoje });
      const b = calcularServidor(status as never, item as never, { colunas: colunas as never, nomeUsuario: () => '', hoje });
      assert.deepEqual(b, a);
      assert.ok(!a.erro, a.erro);
    }
  }
});
