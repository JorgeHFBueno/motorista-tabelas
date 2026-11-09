import test from 'node:test';
import assert from 'node:assert/strict';
import {
  caminhoAnexo, comCopias, manterCopias, mimeDoNome, pendentesDoMonday,
  configDe, converterFormulaMonday, dataLocal, decidirItem, mesclarOpcoesLista, mesclarRotulosStatus, mesclarValores,
  permissoesDoQuadro, pessoasDosValores, pessoasQueFaltam, prefixosBusca, quadroLiberado, quadrosDeSubitens, resolverLigacoes, tipoFriday, valorDe, valoresDoItem,
} from '../lib/fridayMondayConverter.js';

const statusCol = {
  id: 'status', title: 'Status', type: 'status',
  settings_str: JSON.stringify({ labels: { 0: 'Em andamento', 1: 'Feito', 2: 'Parado', 5: '' }, labels_colors: { 1: { color: '#00c875' } }, done_colors: [1] }),
};

test('status: índices do monday viram ids do Friday, com rótulo concluído e vazio', () => {
  const cfg = configDe(statusCol);
  assert.deepEqual(cfg.rotulos.map(r => [r.id, r.texto, !!r.concluido]), [['1', 'Em andamento', false], ['2', 'Feito', true], ['3', 'Parado', false], ['0', '', false]]);
  assert.deepEqual(cfg.origem_rotulos, { 0: '1', 1: '2', 2: '3', 5: null });
  const col = { id: 10, tipoMonday: 'status', config: cfg };
  assert.equal(valorDe(col, { id: 'status', type: 'status', text: 'Feito', value: '{"index":1}' }, {}), '2');
  assert.equal(valorDe(col, { id: 'status', type: 'status', text: '', value: '{"index":5}' }, {}), null);
});

test('status: reimportação acrescenta rótulos novos sem mexer nos existentes', () => {
  const cfg = configDe(statusCol);
  cfg.rotulos[0].texto = 'Fazendo (renomeado no Friday)';
  const novo = mesclarRotulosStatus(cfg, { labels: { 0: 'Em andamento', 1: 'Feito', 2: 'Parado', 3: 'Aguardando' } });
  assert.equal(novo.rotulos[0].texto, 'Fazendo (renomeado no Friday)');
  assert.equal(novo.origem_rotulos['3'], '4');
  assert.equal(novo.rotulos.at(-1).id, '0');
  assert.equal(novo.rotulos.filter(r => r.id === '4').length, 1);
});

test('lista suspensa: opções novas entram pelo id do monday', () => {
  const cfg = configDe({ id: 'd', title: 'Setor', type: 'dropdown', settings_str: JSON.stringify({ labels: [{ id: 1, name: 'Fábrica' }] }) });
  const novo = mesclarOpcoesLista(cfg, { labels: [{ id: 1, name: 'Fábrica' }, { id: 7, name: 'Montagem' }] });
  assert.deepEqual(novo.opcoes.map(o => o.id), ['1', '7']);
});

test('tipos: colunas calculadas pelo monday são ignoradas e desconhecidas viram texto', () => {
  assert.equal(tipoFriday('last_updated'), null);
  assert.equal(tipoFriday('subtasks'), null);
  assert.equal(tipoFriday('tipo_que_nao_existe'), 'texto');
  assert.equal(tipoFriday('timeline'), 'periodo');
});

test('valores: pessoas, período, número, link, caixa e ligações', () => {
  const cols = new Map([
    ['pessoas', { id: 1, tipoMonday: 'people', config: {} }],
    ['crono', { id: 2, tipoMonday: 'timeline', config: {} }],
    ['valor', { id: 3, tipoMonday: 'numbers', config: {} }],
    ['site', { id: 4, tipoMonday: 'link', config: {} }],
    ['ok', { id: 5, tipoMonday: 'checkbox', config: {} }],
    ['obra', { id: 6, tipoMonday: 'board_relation', config: {} }],
  ]);
  const item = {
    id: '900', name: 'Viagem', created_at: '', updated_at: '', group: null, parent_item: null, column_values: [
      { id: 'pessoas', type: 'people', text: 'Ana', value: JSON.stringify({ personsAndTeams: [{ id: 11, kind: 'person' }, { id: 99, kind: 'team' }, { id: 12, kind: 'person' }] }) },
      { id: 'crono', type: 'timeline', text: '', value: JSON.stringify({ from: '2026-10-01', to: '2026-10-09' }) },
      { id: 'valor', type: 'numbers', text: '1500.5', value: '"1500.5"' },
      { id: 'site', type: 'link', text: '', value: JSON.stringify({ url: 'https://ledur.com.br', text: 'Site' }) },
      { id: 'ok', type: 'checkbox', text: '', value: JSON.stringify({ checked: 'true' }) },
      { id: 'obra', type: 'board_relation', text: '', value: null, linked_item_ids: ['501', '502'] },
      { id: 'ignorada', type: 'text', text: 'x', value: null },
    ],
  };
  // Sem pessoas ligadas (funcionarios.mondayId), a coluna de pessoa chega vazia.
  const r = valoresDoItem(item, cols, {});
  assert.deepEqual(r.valores, { 2: { inicio: '2026-10-01', fim: '2026-10-09' }, 3: 1500.5, 4: { url: 'https://ledur.com.br', texto: 'Site' }, 5: true });
  // Com ligação: entra o UID de quem está ligado; equipes e pessoas sem ligação ficam de fora.
  const ligadas = new Map([['11', 'uid-ana'], ['99', 'uid-equipe']]);
  assert.deepEqual(valoresDoItem(item, cols, { pessoa: id => ligadas.get(id) }).valores[1], ['uid-ana']);
  const pessoaCol = { id: 1, tipoMonday: 'person', config: {} };
  assert.deepEqual(valorDe(pessoaCol, { id: 'p', type: 'person', text: 'Ana', value: JSON.stringify({ id: 11 }) }, { pessoa: id => ligadas.get(id) }), ['uid-ana']);
  assert.equal(valorDe(pessoaCol, { id: 'p', type: 'person', text: 'Zé', value: JSON.stringify({ id: 12 }) }, { pessoa: id => ligadas.get(id) }), null);
  assert.deepEqual(r.ligacoes, { 6: ['501', '502'] });
  const lig = resolverLigacoes(r.ligacoes, id => (id === '501' ? 77 : undefined));
  assert.deepEqual(lig.valores, { 6: [77] });
  assert.deepEqual(lig.pendentes, { 6: ['502'] });
});

test('fórmulas: ids das colunas do monday viram ids do Friday', () => {
  const mapa = new Map([['status', { id: 10, tipoMonday: 'status' }], ['name', { id: null, tipoMonday: 'name' }], ['tempo', { id: 12, tipoMonday: 'time_tracking' }]]);
  assert.equal(converterFormulaMonday('IF({status#Labels}="Feito", {name}, {tempo} & {sumiu})', mapa), 'IF({@10#Labels}="Feito", {@nome}, ({@12}*3600) & {?sumiu})');
});

test('reimportação: criar, preservar editado no Friday, igual e atualizar', () => {
  assert.equal(decidirItem(undefined, 'a'), 'criar');
  assert.equal(decidirItem({ importado_em: 'x', atualizado_em: 'y', monday_atualizado_em: 'a' }, 'b'), 'preservar');
  assert.equal(decidirItem({ atualizado_em: 'y' }, 'b'), 'preservar');
  assert.equal(decidirItem({ importado_em: 'x', atualizado_em: 'x', monday_atualizado_em: 'a' }, 'a'), 'igual');
  assert.equal(decidirItem({ importado_em: 'x', atualizado_em: 'x', monday_atualizado_em: 'a' }, 'b'), 'atualizar');
});

test('reimportação: pessoas ligadas depois completam só as colunas de pessoa vazias', () => {
  const novos = { 5: ['uid-a'], 6: ['uid-b'], 7: ['uid-c'], 1: 'texto do monday' };
  // 5 vazia (array), 6 ausente: completadas; 7 já preenchida no Friday: fica; 1 não é de pessoa: ignorada.
  assert.deepEqual(pessoasQueFaltam({ 5: [], 7: ['uid-x'], 1: 'velho' }, novos, ['5', '6', '7']), { 5: ['uid-a'], 6: ['uid-b'] });
  assert.deepEqual(pessoasQueFaltam(undefined, { 5: ['uid-a'] }, ['5']), { 5: ['uid-a'] });
  // Ninguém ligado no monday: nada a fazer.
  assert.deepEqual(pessoasQueFaltam({}, {}, ['5']), {});
  // Valor que não é lista (coluna mexida no Friday): não sobrescreve.
  assert.deepEqual(pessoasQueFaltam({ 5: 'outro' }, { 5: ['uid-a'] }, ['5']), {});
});

test('reimportação: colunas criadas no Friday sobrevivem, as do monday são substituídas', () => {
  assert.deepEqual(mesclarValores({ 1: 'velho', 2: 'apagado no monday', 9: 'do Friday' }, { 1: 'novo' }, [1, 2]), { 1: 'novo', 9: 'do Friday' });
});

test('índices e datas seguem as mesmas regras da WEB', () => {
  assert.deepEqual(prefixosBusca('Pó Ç'), ['p', 'po', 'c']);
  assert.ok(prefixosBusca('Viagem Obra Ponte').includes('pon'));
  assert.deepEqual(pessoasDosValores({ 1: ['uidA', 'uidB', 5], 2: ['uidC'], 3: 'x' }, new Set(['1', '3'])), ['uidA', 'uidB']);
  assert.equal(dataLocal('2026-10-19T17:30:00Z'), '2026-10-19 14:30:00');
});

test('subitens: quadro apontado pela coluna subtasks', () => {
  assert.deepEqual(quadrosDeSubitens([{ id: 'subitems', title: 'Subitens', type: 'subtasks', settings_str: JSON.stringify({ boardIds: [123] }) }]), ['123']);
});

test('arquivos do monday: pendentes, troca pela cópia, reimportação mantém a cópia, caminho e tipo', () => {
  const copia = { id: 500, nome: 'edital.pdf', mime: 'application/pdf', tamanho: 10, url: 'https://x', monday_asset: 77 };
  const valores = { 15: [{ nome: 'edital.pdf', monday_asset: 77 }, { nome: 'link', url: 'https://y' }, copia], 16: [{ nome: ' ', monday_asset: 78 }], 17: 'texto' };
  assert.deepEqual(pendentesDoMonday(valores, ['15', '16', '17', '99']), [{ coluna_id: 15, asset: 77, nome: 'edital.pdf' }, { coluna_id: 16, asset: 78, nome: 'arquivo' }]);
  assert.deepEqual(comCopias(valores, new Map([[77, copia]])), { 15: [copia, { nome: 'link', url: 'https://y' }, copia] });
  assert.deepEqual(comCopias(valores, new Map()), {});
  assert.deepEqual(manterCopias([copia], [{ nome: 'edital.pdf', monday_asset: 77 }, { nome: 'novo.pdf', monday_asset: 79 }]), [copia, { nome: 'novo.pdf', monday_asset: 79 }]);
  assert.equal(manterCopias(null, 'x'), 'x');
  // Reimportação comum (item intocado): a coluna vem do monday, mas a cópia fica.
  assert.deepEqual(mesclarValores({ 15: [copia] }, { 15: [{ nome: 'edital.pdf', monday_asset: 77 }] }, [15]), { 15: [copia] });
  assert.equal(caminhoAnexo(1, 2, 3, 'a/b\\c.pdf'), 'friday/1/2/3-a_b_c.pdf');
  assert.equal(mimeDoNome('Edital.PDF'), 'application/pdf');
  assert.equal(mimeDoNome('sem-extensao'), null);
});

test('permissões do quadro: restrito só para a lista, adm2 vê todos, subitens herdam', () => {
  const aberto = { id: 1, restrito: 0, acesso: null };
  const rh = { id: 2, restrito: 1, acesso: ['uid-ana'] };
  assert.equal(quadroLiberado(aberto, 'uid-beto', false), true);
  assert.equal(quadroLiberado(rh, 'uid-ana', false), true);
  assert.equal(quadroLiberado(rh, 'uid-beto', false), false);
  assert.equal(quadroLiberado(rh, 'uid-beto', true), true);
  assert.equal(quadroLiberado({ id: 3, restrito: 1 }, 'uid-ana', false), false);
  assert.equal(quadroLiberado(undefined, 'uid-ana', true), false);
  assert.deepEqual(permissoesDoQuadro(rh), { restrito: 1, acesso: ['uid-ana'] });
  assert.deepEqual(permissoesDoQuadro(aberto), { restrito: 0, acesso: null });
  assert.deepEqual(permissoesDoQuadro({ restrito: 1, acesso: ['uid-ana', 7, null] }), { restrito: 1, acesso: ['uid-ana'] });
});

test('controle de tempo do monday: sessões do histórico; coluna já importada como número continua em horas', () => {
  assert.equal(tipoFriday('time_tracking'), 'tempo');
  const pessoa = id => (id === '11' ? 'uid-ana' : undefined);
  const cv = {
    id: 't', type: 'time_tracking', text: '02:00:00', value: JSON.stringify({ running: false, duration: 7200, changed_at: '2026-11-09T12:00:00Z' }),
    running: false, started_at: null,
    history: [
      { id: '1', status: 'active', started_at: '2026-11-09T08:00:00Z', ended_at: '2026-11-09T09:00:00Z', started_user_id: '11', ended_user_id: '11' },
      { id: '2', status: 'active', started_at: '2026-11-09T10:00:00Z', ended_at: '2026-11-09T11:00:00Z', started_user_id: '99', manually_entered_end_time: true },
      { id: '3', status: 'deleted', started_at: '2026-11-09T06:00:00Z', ended_at: '2026-11-09T07:00:00Z' },
    ],
  };
  const v = valorDe({ id: 5, tipoMonday: 'time_tracking', config: {}, tipo: 'tempo' }, cv, { pessoa });
  assert.deepEqual(v.sessoes.map(s => [s.id, s.por, !!s.manual]), [['m1', 'uid-ana', false], ['m2', null, true]]);
  assert.equal(valorDe({ id: 5, tipoMonday: 'time_tracking', config: {}, tipo: 'numero' }, cv, { pessoa }), 2, 'coluna antiga em horas');
  // Sem histórico (valor antigo): uma sessão com o total, terminando na última mudança.
  const semHist = valorDe({ id: 5, tipoMonday: 'time_tracking', config: {} }, { ...cv, history: undefined }, {});
  assert.deepEqual(semHist.sessoes.map(s => [s.inicio, s.fim]), [['2026-11-09T10:00:00.000Z', '2026-11-09T12:00:00.000Z']]);
  const rodando = valorDe({ id: 5, tipoMonday: 'time_tracking', config: {} }, { ...cv, running: true, started_at: '2026-11-09T11:30:00Z' }, {});
  assert.equal(rodando.sessoes.filter(s => !s.fim).length, 1);
});
