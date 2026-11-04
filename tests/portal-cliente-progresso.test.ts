import assert from 'node:assert/strict';
import test from 'node:test';
import {
  limitarProgresso,
  MODELO_ETAPAS,
  progressoPadrao,
  progressoParaGravar,
  recalcularProgresso,
  renumerarProgresso,
  statusDoProgresso,
} from '../src/features/portal-cliente/progressoObra';
import {
  confirmacaoDe,
  contratoPortalDe,
  dataHoraParaInput,
  ehColunaCnpjCliente,
  filtrarContratos,
  inputParaDataHora,
  type LinhaContrato,
} from '../src/features/portal-cliente/contratosPortalDominio';
import type { ObraDetalhe } from '../src/features/obras/obrasDomain';

// portal-obras.progresso (Manuscript portal.md, "Progresso"): computed as the portal does (portal/src/lib/obraStatus.ts).
test('status pelo progresso: pendente 0, em andamento 1–90, finalizando 91–99, completo 100', () => {
  assert.equal(statusDoProgresso(0), 'pendente');
  assert.equal(statusDoProgresso(1), 'em_andamento');
  assert.equal(statusDoProgresso(90), 'em_andamento');
  assert.equal(statusDoProgresso(91), 'finalizando');
  assert.equal(statusDoProgresso(99), 'finalizando');
  assert.equal(statusDoProgresso(100), 'completo');
});

test('progresso limitado a inteiro de 0 a 100', () => {
  assert.equal(limitarProgresso(150), 100);
  assert.equal(limitarProgresso(-5), 0);
  assert.equal(limitarProgresso('42.6'), 43);
  assert.equal(limitarProgresso('abc'), 0);
  assert.equal(limitarProgresso(undefined), 0);
});

test('modelo padrão: as 4 etapas do portal antigo, tudo pendente', () => {
  const padrao = progressoPadrao();
  assert.deepEqual(padrao.etapas.map((e) => [e.id, e.nome, e.ordem, e.modoControle, e.itens.length]), [
    ['projeto', 'Projeto', 1, 'checklist', 3],
    ['producao', 'Produção', 2, 'percentual', 5],
    ['fundacao', 'Fundação', 3, 'checklist', 3],
    ['montagem', 'Montagem', 4, 'percentual', 5],
  ]);
  assert.equal(MODELO_ETAPAS.length, 4);
  assert.equal(padrao.progressoGeral, 0);
  assert.ok(padrao.etapas.every((e) => e.status === 'pendente' && e.itens.every((i) => i.progresso === 0 && i.status === 'pendente')));
  assert.equal(padrao.etapas[0].itens[0].id, 'projeto_item_1');
});

test('etapa = média simples dos itens; geral = média simples das etapas', () => {
  const progresso = recalcularProgresso({
    etapas: [
      { id: 'a', nome: 'A', ordem: 1, modoControle: 'percentual', itens: [{ id: 'a1', nome: 'x', ordem: 1, progresso: 50 }, { id: 'a2', nome: 'y', ordem: 2, progresso: 100 }] },
      { id: 'b', nome: 'B', ordem: 2, modoControle: 'checklist', itens: [{ id: 'b1', nome: 'x', ordem: 1, progresso: 100 }, { id: 'b2', nome: 'y', ordem: 2, progresso: 60 }, { id: 'b3', nome: 'z', ordem: 3, progresso: 0 }] },
      { id: 'c', nome: 'C', ordem: 3, modoControle: 'percentual', itens: [] },
    ],
  });
  assert.equal(progresso.etapas[0].progresso, 75);
  assert.equal(progresso.etapas[0].status, 'em_andamento');
  // checklist: 60 is not done, so it counts as 0
  assert.deepEqual(progresso.etapas[1].itens.map((i) => i.progresso), [100, 0, 0]);
  assert.equal(progresso.etapas[1].progresso, 33);
  assert.equal(progresso.etapas[2].progresso, 0);
  assert.equal(progresso.progressoGeral, Math.round((75 + 33 + 0) / 3));
});

test('tudo completo: 100 e completo', () => {
  const progresso = recalcularProgresso({
    etapas: [{ id: 'a', nome: 'A', ordem: 1, modoControle: 'checklist', itens: [{ id: 'a1', nome: 'x', ordem: 1, progresso: 100 }] }],
  });
  assert.equal(progresso.progressoGeral, 100);
  assert.equal(progresso.etapas[0].status, 'completo');
});

test('leitura tolerante: ordena por ordem, preenche ids e nomes e ignora o que não é etapa', () => {
  const progresso = recalcularProgresso({
    etapas: [
      { nome: 'Segunda', ordem: 2, modoControle: 'percentual', itens: [{ progresso: 30 }] },
      { id: 'p', nome: 'Primeira', ordem: 1, modoControle: 'outro', itens: 'x' },
    ],
  });
  assert.deepEqual(progresso.etapas.map((e) => e.nome), ['Primeira', 'Segunda']);
  assert.equal(progresso.etapas[0].modoControle, 'checklist');
  assert.equal(progresso.etapas[1].id, 'etapa_1');
  assert.equal(progresso.etapas[1].itens[0].id, 'etapa_1_item_1');
  assert.equal(progresso.etapas[1].itens[0].nome, 'Item 1');
  assert.deepEqual(recalcularProgresso(null), { etapas: [], progressoGeral: 0 });
  assert.deepEqual(recalcularProgresso({ etapas: 'x' }), { etapas: [], progressoGeral: 0 });
});

test('edição: renumera a ordem, recalcula e mantém o nome digitado; ao gravar, nomes aparados e obrigatórios', () => {
  const base = progressoPadrao();
  const semPrimeira = renumerarProgresso({ ...base, etapas: base.etapas.slice(1).map((e, i) => (i === 0 ? { ...e, nome: 'Produção ', itens: e.itens.map((item) => ({ ...item, progresso: 100 })) } : e)) });
  assert.deepEqual(semPrimeira.etapas.map((e) => e.ordem), [1, 2, 3]);
  assert.equal(semPrimeira.etapas[0].nome, 'Produção ');
  assert.equal(semPrimeira.etapas[0].progresso, 100);
  assert.equal(semPrimeira.progressoGeral, 33);
  assert.equal(progressoParaGravar(semPrimeira)?.etapas[0].nome, 'Produção');
  assert.equal(progressoParaGravar({ ...semPrimeira, etapas: [{ ...semPrimeira.etapas[0], nome: '  ' }] }), null);
});

// Friday column of the client's CNPJ/CPF (Manuscript portal.md, "Vínculo do cliente").
test('coluna "CNPJ/CPF Cliente" reconhecida sem diferença de maiúsculas, acentos e espaços', () => {
  assert.ok(ehColunaCnpjCliente('CNPJ/CPF Cliente'));
  assert.ok(ehColunaCnpjCliente(' cnpj / cpf  cliente '));
  assert.ok(ehColunaCnpjCliente('CNPJ/CPF Clíente'));
  assert.ok(!ehColunaCnpjCliente('CNPJ Cliente'));
  assert.ok(!ehColunaCnpjCliente(undefined));
});

test('portal-obras lido com valores seguros', () => {
  const contrato = contratoPortalDe('ob1', {
    clienteDocumento: '12345678000195',
    nome: ' Ponte ',
    local: '',
    numeroContrato: '12/2026',
    previsao: { inicio: '2026-01-10', fim: '10/12/2026' },
    valorContrato: 12.5,
  });
  assert.equal(contrato.nome, 'Ponte');
  assert.equal(contrato.local, null);
  assert.deepEqual(contrato.previsao, { inicio: '2026-01-10', fim: null });
  assert.equal(contrato.valorContrato, null);
  assert.equal(contrato.equipe, null);
});

test('busca e filtro da lista de contratos', () => {
  const obra = (id: string, nomeObra: string) => ({ id, nomeObra, numeroContrato: '', local: '' }) as unknown as ObraDetalhe;
  const linhas: LinhaContrato[] = [
    { obra: obra('b', 'Ponte Beta'), portal: contratoPortalDe('b', { clienteDocumento: '12345678000195', nome: 'Ponte Beta' }) },
    { obra: obra('a', 'Ponte Alfa'), portal: null },
  ];
  assert.deepEqual(filtrarContratos(linhas, '', 'TODOS').map((l) => l.obra.id), ['a', 'b']);
  assert.deepEqual(filtrarContratos(linhas, '', 'PUBLICADOS').map((l) => l.obra.id), ['b']);
  assert.deepEqual(filtrarContratos(linhas, '', 'NAO_PUBLICADOS').map((l) => l.obra.id), ['a']);
  assert.deepEqual(filtrarContratos(linhas, '12.345.678', 'TODOS').map((l) => l.obra.id), ['b']);
  assert.deepEqual(filtrarContratos(linhas, 'alfa', 'TODOS').map((l) => l.obra.id), ['a']);
});

// equipe.saida / equipe.chegada (Manuscript portal.md, "Saída e chegada da equipe"), typed in Brasília time.
test('data e hora digitadas no horário de Brasília', () => {
  const data = inputParaDataHora('2026-11-04T08:30');
  assert.equal(data?.toISOString(), '2026-11-04T11:30:00.000Z');
  assert.equal(dataHoraParaInput(new Date('2026-11-04T02:15:00Z')), '2026-11-03T23:15');
  assert.equal(inputParaDataHora('2026-02-30T08:00'), null);
  assert.equal(inputParaDataHora(''), null);
});

test('confirmação da equipe lida do Timestamp', () => {
  const ts = (iso: string) => ({ toDate: () => new Date(iso) });
  const lida = confirmacaoDe({ dataHora: ts('2026-11-04T11:30:00Z'), confirmadoPor: { uid: 'u1', nome: 'Ana' }, confirmadoEm: ts('2026-11-04T12:00:00Z') });
  assert.equal(lida?.dataHora.toISOString(), '2026-11-04T11:30:00.000Z');
  assert.deepEqual(lida?.confirmadoPor, { uid: 'u1', nome: 'Ana' });
  assert.equal(confirmacaoDe(null), null);
  assert.equal(confirmacaoDe({ dataHora: null }), null);
});
