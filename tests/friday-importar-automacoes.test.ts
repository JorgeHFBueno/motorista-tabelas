import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from '../functions/test/fixtures/gestao-obras-colunas.json';
import { converterFrase, lerAutomacoesMonday, lerCsv } from '../src/features/friday-gestao-interna/quadro/importarAutomacoes.ts';

// Colunas do quadro real GESTÃO DE OBRAS (mesma fixture das Functions) e os grupos dele.
const colunas = fixture.colunas as { id: number; titulo: string; tipo: string; config: { rotulos?: { id: string; texto: string }[] } }[];
const grupos = [
  { id: 1, nome: 'OBRAS PÚBLICAS' }, { id: 2, nome: 'OBRAS PRIVADAS' }, { id: 3, nome: 'CONFERIR DOCUMENTAÇÃO' }, { id: 4, nome: 'OBRAS FINALIZADAS' },
];
const ctx = { colunas, grupos };
const col = (titulo: string) => colunas.find(c => c.titulo === titulo)!;
const rotulo = (titulo: string, texto: string) => col(titulo).config.rotulos!.find(r => r.texto === texto)!.id;

// Arquivo exportado do monday para GESTÃO DE OBRAS (2026-10-29), com a quebra de linha que o monday põe nas frases.
const CSV = `ID,Sentence,Description,App names,Owner,State,Updated at
646540228,"When any subitem column changes, send a webhook",,"Automato das Tabelas","Samuel Nogueira","active","3 Oct, 2026, 17:15"
400150744,"When Arquivo changes to Conferir Documentação
 move item to CONFERIR DOCUMENTAÇÃO",,"","Samuel Nogueira","active","15 Dec, 2025, 11:04"
398703406,"When Tipo de Obra changes and only if Tipo de Obra contains all these labels move item to OBRAS PÚBLICAS",,"","Diego Ramon Gonçalves","active","2 Sep, 2025, 08:34"
398703608,"When Tipo de Obra changes and only if Tipo de Obra contains all these labels move item to OBRAS PRIVADAS",,"","Diego Ramon Gonçalves","active","2 Sep, 2025, 08:33"
393171720,"When Arquivo changes to Arquivar
 move item to OBRAS FINALIZADAS",,"","Samuel Nogueira","active","20 Feb, 2025, 20:25"
`;

test('CSV: aspas, vírgulas e quebras de linha dentro do campo', () => {
  const l = lerCsv('\uFEFFa,b\r\n"x, y","linha 1\nlinha 2 ""q"""\n');
  assert.deepEqual(l, [['a', 'b'], ['x, y', 'linha 1\nlinha 2 "q"']]);
});

test('GESTÃO DE OBRAS: as 4 regras internas viram automações; o webhook fica de fora', () => {
  const r = lerAutomacoesMonday(CSV, ctx);
  assert.equal(r.length, 5);
  const [webhook, conferir, publicas, privadas, arquivar] = r;
  assert.match(webhook.erro ?? '', /interno/);
  assert.equal(conferir.origem_id, 'monday:400150744');
  assert.equal(conferir.dono, 'Samuel Nogueira');
  assert.deepEqual(conferir.regra, {
    modo: 'todas', gatilho: { tipo: 'coluna_muda', coluna_id: col('Arquivo').id, para: [rotulo('Arquivo', 'Conferir Documentação')] }, condicoes: [], acoes: [{ tipo: 'mover', grupo_id: 3 }],
  });
  assert.deepEqual(arquivar.regra?.gatilho, { tipo: 'coluna_muda', coluna_id: col('Arquivo').id, para: [rotulo('Arquivo', 'Arquivar')] });
  assert.deepEqual(arquivar.regra?.acoes, [{ tipo: 'mover', grupo_id: 4 }]);
  // "contains all these labels" sem os rótulos: deduzido do grupo de destino (Pública → OBRAS PÚBLICAS), com aviso.
  assert.deepEqual(publicas.regra?.gatilho, { tipo: 'coluna_muda', coluna_id: col('Tipo de Obra').id, para: [] });
  assert.deepEqual(publicas.regra?.condicoes, [{ alvo: col('Tipo de Obra').id, op: 'e', valor: [rotulo('Tipo de Obra', 'Pública')] }]);
  assert.deepEqual(privadas.regra?.condicoes, [{ alvo: col('Tipo de Obra').id, op: 'e', valor: [rotulo('Tipo de Obra', 'Privada')] }]);
  assert.equal(publicas.avisos.length, 1);
  for (const x of [conferir, publicas, privadas, arquivar]) { assert.equal(x.erro, undefined); assert.deepEqual(x.pendencias, []); assert.equal(x.ativa_no_monday, true); }
});

test('sem como deduzir o rótulo, a regra entra com pendência (desligada)', () => {
  const r = converterFrase('When Tipo de Obra changes and only if Tipo de Obra contains all these labels move item to CONFERIR DOCUMENTAÇÃO', ctx);
  assert.ok(r.regra);
  assert.equal(r.pendencias.length, 1);
});

test('outras frases: arquivar, mudar status, data, quem criou; nomes inexistentes dão erro', () => {
  assert.deepEqual(converterFrase('When Arquivo changes to Arquivar, archive item', ctx).regra?.acoes, [{ tipo: 'arquivar' }]);
  assert.deepEqual(converterFrase('When an item is created, change Arquivo to Em Aberto', ctx).regra,
    { modo: 'todas', gatilho: { tipo: 'item_criado', grupo_id: null }, condicoes: [], acoes: [{ tipo: 'definir', coluna_id: col('Arquivo').id, valor: rotulo('Arquivo', 'Em Aberto') }] });
  assert.deepEqual(converterFrase('When Fim arrives, set Início to today', ctx).regra?.gatilho, { tipo: 'data_chega', coluna_id: col('Fim').id, dias: 0 });
  assert.match(converterFrase('When Coluna Que Não Existe changes, archive item', ctx).erro ?? '', /não existe/);
  assert.match(converterFrase('When Arquivo changes to Arquivar move item to GRUPO X', ctx).erro ?? '', /grupo/);
  assert.match(converterFrase('When Arquivo changes, notify someone', ctx).erro ?? '', /interno/);
});

// Arquivo do quadro TAREFAS (2026-11-13): cronômetro por status; as do monday AI não têm equivalente no Friday.
test('TAREFAS: start/stop do controle de tempo viram iniciar/parar; monday AI e "nome do item muda" explicam a recusa', () => {
  const tarefas = {
    colunas: [
      { id: 1, titulo: 'Pessoa', tipo: 'pessoa', config: {} },
      { id: 2, titulo: 'Status', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'Feito' }, { id: '2', texto: 'Parado' }, { id: '3', texto: 'Em progresso' }] } },
      { id: 3, titulo: 'Controle de tempo', tipo: 'tempo', config: {} },
      { id: 4, titulo: 'Data', tipo: 'data', config: {} },
    ],
    grupos: [{ id: 10, nome: 'TAREFAS' }, { id: 11, nome: 'TAREFAS FINALIZADAS' }],
  };
  const regra = (frase: string) => converterFrase(frase, tarefas);
  assert.deepEqual(regra('When Status changes to Em progresso start Controle de tempo').regra, {
    modo: 'todas', gatilho: { tipo: 'coluna_muda', coluna_id: 2, para: ['3'] }, condicoes: [], acoes: [{ tipo: 'definir', coluna_id: 3, valor: 'iniciar' }],
  });
  assert.deepEqual(regra('When Status changes to Feito stop Controle de tempo').regra?.acoes, [{ tipo: 'definir', coluna_id: 3, valor: 'parar' }]);
  assert.deepEqual(regra('When Status changes to Parado stop Controle de tempo').regra?.gatilho, { tipo: 'coluna_muda', coluna_id: 2, para: ['2'] });
  assert.match(regra('When Status changes to Feito stop Data').erro ?? '', /controle de tempo/);
  assert.match(regra('When item name changes assign a person in Pessoa based on the task name').erro ?? '', /monday AI/);
  assert.match(regra('When an item is created assign a person in Pessoa based on the task name').erro ?? '', /monday AI/);
  assert.match(regra('When item name changes, archive item').erro ?? '', /nome do item muda/);
  assert.deepEqual(regra('When Status changes to Feito move item to TAREFAS FINALIZADAS').regra?.acoes, [{ tipo: 'mover', grupo_id: 11 }]);
});
