import assert from 'node:assert/strict';
import test from 'node:test';
import { calcularWidget, geralDiferente, intervaloAnterior, itensDoWidget, resolverJanela, type DadosQuadro, type Widget } from '../src/features/friday-gestao-interna/painel/calculo.ts';
import { etapasDoFunil, modeloObras, modeloVendas } from '../src/features/friday-gestao-interna/painel/modelos.ts';
import type { Coluna, Grupo, Item } from '../src/features/friday-gestao-interna/quadro/tipos.ts';

// Painel do Friday (cópia de web/src/painel do protótipo ledur-app-monday). Só dados fictícios. Hoje fixo: 15/11/2026.
const ctx = { nomeUsuario: (id: unknown) => `Pessoa ${String(id)}`, nomeItem: (id: unknown) => (id === 900 ? 'Obra Modelo' : undefined), hoje: '2026-11-15' };
const COL = { etapa: 1, valor: 2, fecha: 3, resp: 4, per: 5, liga: 6, doc: 7 };
const colunas = [
  { id: COL.etapa, quadro_id: 1, titulo: 'Etapa', tipo: 'status', config: { rotulos: [
    { id: 'g', texto: 'Ganho', cor: '#00c875', concluido: true }, { id: 'pp', texto: 'Proposta', cor: '#579bfc' }, { id: 'l', texto: 'Lead', cor: '#fdab3d' }, { id: 'x', texto: 'Perdido', cor: '#e2445c' },
  ] } },
  { id: COL.valor, quadro_id: 1, titulo: 'Valor', tipo: 'numero', config: { unidade: 'R$' } },
  { id: COL.fecha, quadro_id: 1, titulo: 'Data de fechamento', tipo: 'data', config: {} },
  { id: COL.resp, quadro_id: 1, titulo: 'Responsável', tipo: 'pessoa', config: {} },
  { id: COL.per, quadro_id: 1, titulo: 'Período', tipo: 'periodo', config: {} },
  { id: COL.liga, quadro_id: 1, titulo: 'Obra', tipo: 'ligacao', config: { quadro_id: 99 } },
  { id: COL.doc, quadro_id: 1, titulo: 'ART', tipo: 'status', config: { rotulos: [{ id: 'ok', texto: 'OK', cor: '#00c875' }] } },
].map(c => ({ ...c, largura: 140, posicao: c.id, oculta: 0 })) as unknown as Coluna[];
const grupos = [{ id: 10, quadro_id: 1, nome: 'Negócios', cor: '#579bfc', posicao: 1, recolhido: 0 }] as Grupo[];
const item = (id: number, nome: string, v: Record<number, unknown>) => ({ id, quadro_id: 1, grupo_id: 10, item_pai_id: null, nome, posicao: id, valores: v }) as unknown as Item;
const dados: DadosQuadro[] = [{
  quadro: { id: 1, nome: 'Vendas' }, grupos, colunas,
  itens: [
    item(1, 'A', { [COL.etapa]: 'g', [COL.valor]: 100, [COL.fecha]: '2026-11-03', [COL.resp]: [7], [COL.per]: { inicio: '2026-11-02', fim: '2026-11-20' }, [COL.liga]: [900], [COL.doc]: 'ok' }),
    item(2, 'B', { [COL.etapa]: 'g', [COL.valor]: 300, [COL.fecha]: '2026-10-10', [COL.resp]: [8], [COL.per]: { inicio: '2026-11-09', fim: '2026-11-10' } }),
    item(3, 'C', { [COL.etapa]: 'pp', [COL.valor]: 50, [COL.fecha]: '2026-11-20', [COL.resp]: [7] }),
    item(4, 'D', { [COL.etapa]: 'l', [COL.valor]: 10, [COL.resp]: [7, 8], [COL.per]: { inicio: '2026-11-09', fim: '2026-11-09' } }),
    item(5, 'E', { [COL.etapa]: 'x', [COL.valor]: 40, [COL.fecha]: '2025-11-05' }),
    item(6, 'F', { [COL.valor]: 5 }),
  ],
}];
const w = (o: Partial<Widget>): Widget => ({ id: 'x', titulo: 'T', tipo: 'numero', calculo: 'contagem', ...o });

test('janelas e período anterior', () => {
  assert.deepEqual(resolverJanela({ coluna: 'x', atalho: 'mes_atual' }, '2026-11-15'), { de: '2026-11-01', ate: '2026-11-30' });
  assert.deepEqual(resolverJanela({ coluna: 'x', atalho: 'mes_anterior' }, '2026-01-31'), { de: '2025-12-01', ate: '2025-12-31' });
  assert.deepEqual(resolverJanela({ coluna: 'x', atalho: 'trimestre_atual' }, '2026-11-15'), { de: '2026-10-01', ate: '2026-12-31' });
  assert.deepEqual(resolverJanela({ coluna: 'x', atalho: 'ultimos_30' }, '2026-11-15'), { de: '2026-10-17', ate: '2026-11-15' });
  assert.deepEqual(intervaloAnterior({ de: '2026-03-01', ate: '2026-03-31' }, 'periodo_anterior'), { de: '2026-02-01', ate: '2026-02-28' });
  assert.deepEqual(intervaloAnterior({ de: '2026-01-01', ate: '2026-12-31' }, 'periodo_anterior'), { de: '2025-01-01', ate: '2025-12-31' });
  assert.deepEqual(intervaloAnterior({ de: '2026-11-11', ate: '2026-11-15' }, 'periodo_anterior'), { de: '2026-11-06', ate: '2026-11-10' });
  assert.deepEqual(intervaloAnterior({ de: '2024-02-01', ate: '2024-02-29' }, 'ano_anterior'), { de: '2023-02-01', ate: '2023-02-28' });
});

test('janela do widget e filtro geral', () => {
  const soma = { calculo: 'soma' as const, valor: 'Valor' };
  assert.equal(calcularWidget(w(soma), dados, ctx).valor, 505);
  const mes = { coluna: 'Data de fechamento', atalho: 'mes_atual' as const };
  assert.equal(calcularWidget(w({ ...soma, janela: mes }), dados, ctx).valor, 150);
  assert.equal(calcularWidget(w(soma), dados, ctx, { janela: mes }).valor, 150);
  assert.equal(calcularWidget(w({ ...soma, ignorarGeral: true }), dados, ctx, { janela: mes }).valor, 505);
  // A janela do widget ganha da geral; a condição geral soma com a do widget.
  assert.equal(calcularWidget(w({ ...soma, janela: { coluna: 'Data de fechamento', atalho: 'mes_anterior' } }), dados, ctx, { janela: mes }).valor, 300);
  assert.equal(calcularWidget(w(soma), dados, ctx, { filtros: [{ coluna: 'Etapa', valores: ['Ganho'] }], janela: mes }).valor, 100);
});

test('número com comparação e tendência', () => {
  const r = calcularWidget(w({ calculo: 'soma', valor: 'Valor', comparar: 'periodo_anterior', tendencia: true, janela: { coluna: 'Data de fechamento', atalho: 'mes_atual' } }), dados, ctx);
  assert.equal(r.valor, 150);
  assert.equal(r.comparacao?.anterior, 300);
  assert.equal(r.comparacao?.variacao, -50);
  assert.deepEqual(r.serie?.map(s => s.chave), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual(r.serie?.slice(-2).map(s => s.valor), [300, 150]);
  assert.equal(calcularWidget(w({ comparar: 'periodo_anterior' }), dados, ctx).comparacao, undefined);
});

test('data agrupada por período e fora de quem não tem data', () => {
  const dia = calcularWidget(w({ tipo: 'colunas', eixo: 'Data de fechamento', periodo: 'dia' }), dados, ctx);
  assert.deepEqual(dia.fatias.map(f => f.chave), ['2025-11-05', '2026-10-10', '2026-11-03', '2026-11-20']);
  assert.equal(dia.semEixo, 2);
  const tri = calcularWidget(w({ tipo: 'colunas', eixo: 'Data de fechamento', periodo: 'trimestre' }), dados, ctx);
  assert.deepEqual(tri.fatias.map(f => f.rotulo), ['4º tri/25', '4º tri/26']);
  const sem = calcularWidget(w({ tipo: 'colunas', eixo: 'Data de fechamento', periodo: 'semana' }), dados, ctx);
  assert.ok(sem.fatias.some(f => f.chave === '2026-11-02'));
  assert.deepEqual(calcularWidget(w({ tipo: 'colunas', eixo: 'Data de fechamento', periodo: 'ano' }), dados, ctx).fatias.map(f => f.chave), ['2025', '2026']);
});

test('colunas e linha divididas, com a mesma ordem de pilha', () => {
  const r = calcularWidget(w({ tipo: 'colunas', calculo: 'soma', valor: 'Valor', eixo: 'Responsável', pilha: 'Etapa' }), dados, ctx);
  const p7 = r.fatias.find(f => f.chave === 'Pessoa 7')!;
  assert.deepEqual(p7.pilhas.map(p => [p.chave, p.valor]), [['Ganho', 100], ['Proposta', 50], ['Lead', 10]]);
  assert.deepEqual(r.pilhasColunas?.map(c => c.chave), ['Ganho', 'Proposta', 'Lead']);
  assert.equal(calcularWidget(w({ tipo: 'pizza', eixo: 'Etapa', pilha: 'Responsável' }), dados, ctx).pilhasColunas, undefined);
});

test('tabela dinâmica com média certa nas células e nos totais', () => {
  const r = calcularWidget(w({ tipo: 'pivo', calculo: 'media', valor: 'Valor', eixo: 'Responsável', pilha: 'Etapa' }), dados, ctx);
  const p7 = r.fatias.find(f => f.chave === 'Pessoa 7')!;
  assert.equal(p7.valor, (100 + 50 + 10) / 3);
  assert.equal(p7.pilhas.find(p => p.chave === 'Ganho')!.valor, 100);
  assert.equal(r.pilhasColunas?.find(c => c.chave === 'Ganho')?.valor, 200);
});

test('bateria: feito pelos rótulos concluídos ou pela escolha; sem status conta como não feito', () => {
  const r = calcularWidget(w({ tipo: 'bateria', eixo: 'Etapa' }), dados, ctx);
  assert.deepEqual(r.feito, { valor: 2, total: 6, pct: (2 / 6) * 100 });
  assert.equal(r.semEixo, 0);
  assert.equal(calcularWidget(w({ tipo: 'bateria', eixo: 'Etapa', feito: ['Ganho', 'Proposta'] }), dados, ctx).feito?.valor, 3);
});

test('funil acumula, calcula a passagem e separa o que está fora', () => {
  const r = calcularWidget(w({ tipo: 'funil', eixo: 'Etapa', etapas: ['Lead', 'Proposta', 'Ganho'] }), dados, ctx);
  assert.deepEqual(r.funil?.map(e => [e.chave, e.proprio, e.acumulado]), [['Lead', 1, 4], ['Proposta', 1, 3], ['Ganho', 2, 2]]);
  assert.deepEqual(r.funil?.map(e => e.conversao), [null, 75, (2 / 3) * 100]);
  assert.deepEqual(r.foraFunil?.map(f => f.chave), ['Perdido']);
  const s = calcularWidget(w({ tipo: 'funil', eixo: 'Etapa', etapas: ['Lead', 'Ganho'], acumular: false }), dados, ctx);
  assert.deepEqual(s.funil?.map(e => e.acumulado), [1, 2]);
  assert.deepEqual(etapasDoFunil(['Orçamentação', 'Ganho', 'Perdido', 'Proposta Enviada', 'Lead']), ['Lead', 'Orçamentação', 'Proposta Enviada', 'Ganho']);
});

test('coluna de ligação agrupa pelo nome do item', () => {
  const r = calcularWidget(w({ tipo: 'barras', eixo: 'Obra' }), dados, ctx);
  assert.deepEqual(r.fatias.map(f => f.chave), ['Obra Modelo']);
  assert.equal(r.semEixo, 5);
});

test('matriz mostra pendências e colunas', () => {
  const r = calcularWidget(w({ tipo: 'matriz', colunas: ['ART', 'Etapa'], soPendentes: true }), dados, ctx);
  assert.deepEqual(r.tabela?.linhas.map(l => l.nome), ['B', 'C', 'D', 'E', 'F']);
  assert.equal(r.tabela?.linhas[0].celulas.Etapa.texto, 'Ganho');
  assert.equal(r.tabela?.linhas[0].celulas.ART.vazia, true);
  const t = calcularWidget(w({ tipo: 'matriz', colunas: ['ART'] }), dados, ctx);
  assert.equal(t.tabela?.linhas.length, 6);
  assert.equal(t.tabela?.linhas[0].celulas.ART.cor, '#00c875');
});

test('lista de vencimentos: atraso, ordem, limite e concluídos', () => {
  const r = calcularWidget(w({ tipo: 'lista', dataAlerta: 'Data de fechamento', colunas: ['Etapa'], ocultarConcluidos: true }), dados, ctx);
  assert.deepEqual(r.tabela?.linhas.map(l => [l.nome, l.dias]), [['E', -375], ['C', 5], ['D', null], ['F', null]]);
  const lim = calcularWidget(w({ tipo: 'lista', dataAlerta: 'Data de fechamento', colunas: [], limite: 2 }), dados, ctx);
  assert.equal(lim.tabela?.linhas.length, 2);
  assert.equal(lim.tabela?.cortadas, 4);
  const desc = calcularWidget(w({ tipo: 'lista', colunas: ['Valor'], ordenarPor: 'Valor', direcao: -1 }), dados, ctx);
  assert.deepEqual(desc.tabela?.linhas.slice(0, 2).map(l => l.nome), ['B', 'A']);
});

test('carga de trabalho por pessoa e semana, com clique até os itens', () => {
  const wc = w({ tipo: 'carga', eixo: 'Responsável', data: 'Período', ocultarConcluidos: false, janela: undefined });
  const r = calcularWidget(wc, dados, ctx);
  assert.equal(r.carga?.buckets[0].de, '2026-11-09');
  const p8 = r.carga!.linhas.find(l => l.chave === 'Pessoa 8')!;
  assert.deepEqual(p8.celulas.slice(0, 2), [2, 0]);
  const p7 = r.carga!.linhas.find(l => l.chave === 'Pessoa 7')!;
  assert.deepEqual(p7.celulas.slice(0, 2), [2, 1]);
  const semConcluidos = calcularWidget({ ...wc, ocultarConcluidos: undefined }, dados, ctx);
  assert.equal(semConcluidos.carga?.linhas.find(l => l.chave === 'Pessoa 7')?.celulas[1], 0);
  const b = r.carga!.buckets[0];
  assert.deepEqual(itensDoWidget(wc, dados, ctx, undefined, { chave: 'Pessoa 8', bucket: { de: b.de, ate: b.ate } }).map(i => i.nome), ['B', 'D']);
});

test('clique: itens de uma fatia e de uma parte da pilha', () => {
  const wb = w({ tipo: 'barras', calculo: 'soma', valor: 'Valor', eixo: 'Responsável', pilha: 'Etapa' });
  assert.deepEqual(itensDoWidget(wb, dados, ctx, undefined, { chave: 'Pessoa 7' }).map(i => i.nome), ['A', 'C', 'D']);
  assert.deepEqual(itensDoWidget(wb, dados, ctx, undefined, { chave: 'Pessoa 7', pilha: 'Ganho' }).map(i => [i.nome, i.valor]), [['A', 'R$\u00a0100']]);
  assert.deepEqual(itensDoWidget(wb, dados, ctx, { janela: { coluna: 'Data de fechamento', atalho: 'mes_anterior' } }, {}).map(i => i.nome), ['B']);
});

test('widget sem coluna no quadro avisa; texto não calcula', () => {
  assert.deepEqual(calcularWidget(w({ tipo: 'lista', colunas: ['Não existe'] }), dados, ctx).faltando, [{ quadro: 'Vendas', coluna: 'Não existe' }]);
  assert.equal(calcularWidget(w({ tipo: 'texto', texto: 'oi' }), dados, ctx).n, 0);
});

test('modelos usam as colunas que existem', () => {
  const v = modeloVendas(dados);
  assert.ok(v.some(x => x.tipo === 'funil' && x.etapas?.join() === 'Lead,Proposta,Ganho'));
  assert.equal(modeloObras(dados).find(x => x.tipo === 'matriz')?.colunas?.join(), 'ART');
  assert.ok(modeloObras(dados).every(x => x.tipo !== 'lista') || modeloObras(dados).some(x => x.dataAlerta));
});

// Testes anteriores do Friday: soma por mês, filtro por etapa e avisos.
// Painel do Friday (cópia de web/src/painel do protótipo ledur-app-monday): soma por mês, filtro por etapa e avisos.
const ctxAntigo = { nomeUsuario: (id: unknown) => `Pessoa ${String(id)}` };

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
  const r = calcularWidget(w, [privados, publicos], ctxAntigo);
  assert.deepEqual(r.fatias.map(f => [f.chave, f.valor, f.n]), [['2025-01', 1500, 2], ['2025-03', 2000, 2]]);
  assert.equal(r.unidade, 'R$');
  assert.equal(r.semEixo, 1, 'D ganho sem data fica de fora e é avisado');
  assert.equal(r.semValor, 1, 'E ganho sem valor conta como zero e é avisado');
  assert.deepEqual(r.faltando, []);
});

test('número com média ignora itens sem valor; "não é" inverte o filtro', () => {
  const media = calcularWidget({ id: 'm', titulo: 'Média', tipo: 'numero', calculo: 'media', valor: 'Valor', filtros: [{ coluna: 'Etapa', valores: ['Ganho'] }] }, [privados], ctxAntigo);
  assert.equal(media.valor, 600); // (1000 + 500 + 300) / 3
  const naoPerdidos = calcularWidget({ id: 'n', titulo: 'Qtd', tipo: 'numero', calculo: 'contagem', filtros: [{ coluna: 'Etapa', valores: ['Perdido'], negar: true }] }, [privados], ctxAntigo);
  assert.equal(naoPerdidos.valor, 4);
});

test('avisa a coluna que falta num quadro do painel', () => {
  const r = calcularWidget({ id: 'x', titulo: 'X', tipo: 'pizza', calculo: 'contagem', eixo: 'Responsável' }, [privados], ctxAntigo);
  assert.deepEqual(r.faltando, [{ quadro: 'Negócios privados 2025', coluna: 'Responsável' }]);
});

test('modelo de vendas usa Etapa = Ganho e a data de fechamento', () => {
  const ws = modeloVendas([privados, publicos]);
  const receita = ws.find(w => w.titulo === 'Receita ganha por mês de fechamento');
  assert.ok(receita);
  assert.equal(receita.eixo, 'Data de fechamento');
  assert.deepEqual(receita.filtros, [{ coluna: 'Etapa', valores: ['Ganho'] }]);
  assert.equal(calcularWidget(ws.find(w => w.titulo === 'Receita ganha')!, [privados, publicos], ctxAntigo).valor, 3800);
});

test('filtro geral: só oferece salvar quando difere do que está salvo', () => {
  const filtro = { coluna: '1', valores: ['a'] } as never;
  assert.equal(geralDiferente({}, undefined), false);
  assert.equal(geralDiferente({ filtros: [], janela: undefined }, {}), false);
  assert.equal(geralDiferente({ filtros: [{ coluna: '1', valores: [] } as never] }, {}), false);
  assert.equal(geralDiferente({ filtros: [filtro] }, { filtros: [filtro] }), false);
  assert.equal(geralDiferente({ janela: { coluna: '2', atalho: 'este_ano' } as never }, { janela: { atalho: 'este_ano', coluna: '2' } as never }), false);
  assert.equal(geralDiferente({ filtros: [filtro] }, {}), true);
  assert.equal(geralDiferente({}, { janela: { coluna: '2', atalho: 'este_ano' } as never }), true);
});
