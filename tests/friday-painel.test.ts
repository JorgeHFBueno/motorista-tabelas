import assert from 'node:assert/strict';
import test from 'node:test';
import { calcularWidget, type DadosQuadro, type Widget } from '../src/features/friday-gestao-interna/painel/calculo.ts';
import { modeloVendas } from '../src/features/friday-gestao-interna/painel/modelos.ts';
import type { Coluna, Grupo, Item } from '../src/features/friday-gestao-interna/quadro/tipos.ts';

// Painel do Friday (cópia de web/src/painel do protótipo ledur-app-monday): soma por mês, filtro por etapa e avisos.
const ctx = { nomeUsuario: (id: unknown) => `Pessoa ${String(id)}` };

function quadro(id: number, nome: string, itens: [string, string | null, number | null, string | null][]): DadosQuadro {
  const colunas = [
    { id: id * 10 + 1, quadro_id: id, titulo: 'Etapa', tipo: 'status', config: { rotulos: [{ id: 'g', texto: 'Ganho', cor: '#00c875' }, { id: 'p', texto: 'Perdido', cor: '#e2445c' }] }, largura: 140, posicao: 1, oculta: 0 },
    { id: id * 10 + 2, quadro_id: id, titulo: 'Valor', tipo: 'numero', config: { unidade: 'R$' }, largura: 140, posicao: 2, oculta: 0 },
    { id: id * 10 + 3, quadro_id: id, titulo: 'Data de fechamento', tipo: 'data', config: {}, largura: 140, posicao: 3, oculta: 0 },
  ] as Coluna[];
  const grupos = [{ id: id * 10, quadro_id: id, nome: 'Negócios', cor: '#579bfc', posicao: 1, recolhido: 0 }] as Grupo[];
  const lista = itens.map(([nome, etapa, valor, data], i) => ({
    id: id * 100 + i, quadro_id: id, grupo_id: id * 10, item_pai_id: null, nome, posicao: i,
    valores: { ...(etapa ? { [id * 10 + 1]: etapa } : {}), ...(valor != null ? { [id * 10 + 2]: valor } : {}), ...(data ? { [id * 10 + 3]: data } : {}) },
  })) as Item[];
  return { quadro: { id, nome }, grupos, colunas, itens: lista };
}

const privados = quadro(1, 'Negócios privados 2025', [
  ['A', 'g', 1000, '2025-01-10'], ['B', 'g', 500, '2025-01-20'], ['C', 'p', 9000, '2025-01-05'], ['D', 'g', 300, null], ['E', 'g', null, '2025-03-01'],
]);
const publicos = quadro(2, 'Negócios públicos 2025', [['F', 'g', 2000, '2025-03-15']]);

test('soma por mês só dos ganhos, juntando quadros pelo título da coluna', () => {
  const w: Widget = { id: 'w', titulo: 'Receita', tipo: 'colunas', calculo: 'soma', valor: 'Valor', eixo: 'Data de fechamento', filtros: [{ coluna: 'Etapa', valores: ['Ganho'] }] };
  const r = calcularWidget(w, [privados, publicos], ctx);
  assert.deepEqual(r.fatias.map(f => [f.chave, f.valor, f.n]), [['2025-01', 1500, 2], ['2025-03', 2000, 2]]);
  assert.equal(r.unidade, 'R$');
  assert.equal(r.semEixo, 1, 'D ganho sem data fica de fora e é avisado');
  assert.equal(r.semValor, 1, 'E ganho sem valor conta como zero e é avisado');
  assert.deepEqual(r.faltando, []);
});

test('número com média ignora itens sem valor; "não é" inverte o filtro', () => {
  const media = calcularWidget({ id: 'm', titulo: 'Média', tipo: 'numero', calculo: 'media', valor: 'Valor', filtros: [{ coluna: 'Etapa', valores: ['Ganho'] }] }, [privados], ctx);
  assert.equal(media.valor, 600); // (1000 + 500 + 300) / 3
  const naoPerdidos = calcularWidget({ id: 'n', titulo: 'Qtd', tipo: 'numero', calculo: 'contagem', filtros: [{ coluna: 'Etapa', valores: ['Perdido'], negar: true }] }, [privados], ctx);
  assert.equal(naoPerdidos.valor, 4);
});

test('avisa a coluna que falta num quadro do painel', () => {
  const r = calcularWidget({ id: 'x', titulo: 'X', tipo: 'pizza', calculo: 'contagem', eixo: 'Responsável' }, [privados], ctx);
  assert.deepEqual(r.faltando, [{ quadro: 'Negócios privados 2025', coluna: 'Responsável' }]);
});

test('modelo de vendas usa Etapa = Ganho e a data de fechamento', () => {
  const ws = modeloVendas([privados, publicos]);
  const receita = ws.find(w => w.titulo === 'Receita ganha por mês de fechamento');
  assert.ok(receita);
  assert.equal(receita.eixo, 'Data de fechamento');
  assert.deepEqual(receita.filtros, [{ coluna: 'Etapa', valores: ['Ganho'] }]);
  assert.equal(calcularWidget(ws.find(w => w.titulo === 'Receita ganha')!, [privados, publicos], ctx).valor, 3800);
});
