import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FILTRO_INICIAL, camposDaEtapa, camposDoNegocio, duracaoDias, etapasDoSegmento, filtrarNegocios, hojeBrasilia, lerNumero,
  negocioFormVazio, resumoPainel, validarContato, validarNegocio, valorM2, contatoFormVazio, type Negocio,
} from '../src/features/comercial/comercialDominio';
import {
  cargoDe, categoriaContatoDe, etapaDoItem, instanteDe, motivoDe, numeroDe, origemDe, prioridadeDe, quadroDoNegocio, textoComMencoes,
} from '../tools/migrar-crm-friday/mapeamento';

// Comercial (2026-11-23; The Manuscript, 01_FIRESTORE/COLECOES/comercial.md).
const negocio = (extra: Partial<Negocio> = {}): Negocio => ({
  id: 'n', titulo: 'Pavilhão', cliente: 'Cliente', segmento: 'privado', tipo: 'negocio', etapa: 'lead', responsaveis: [],
  prioridade: null, origem: null, valor: null, metragem: null, dataCriacao: '2026-01-10', dataFechamento: null, motivoPerda: null,
  contatoIds: [], arquivos: [], origemFriday: null, criadoPor: null, atualizadoPor: null, atualizadoEm: null, excluidoEm: null,
  excluidoPor: null, ...extra,
});

test('comercial: Licitado only exists in the public funnel', () => {
  assert.equal(etapasDoSegmento('privado').some((e) => e.id === 'licitado'), false);
  assert.equal(etapasDoSegmento('publico').some((e) => e.id === 'licitado'), true);
  assert.equal(validarNegocio({ ...negocioFormVazio('2026-11-23'), titulo: 'X', etapa: 'licitado' }), '"Licitado" é só de negócio público.');
});

test('comercial: duration counts to today while open and to the closing date when closed', () => {
  assert.equal(duracaoDias(negocio(), '2026-01-20'), 10);
  assert.equal(duracaoDias(negocio({ etapa: 'ganho', dataFechamento: '2026-02-09' }), '2026-11-23'), 30);
  assert.equal(duracaoDias(negocio({ etapa: 'perdido' }), '2026-11-23'), null);
  assert.equal(valorM2({ valor: 100000, metragem: 400 }), 250);
  assert.equal(valorM2({ valor: 100000, metragem: null }), null);
});

test('comercial: Brasília date and pt-BR numbers', () => {
  assert.equal(hojeBrasilia(new Date('2026-11-24T02:30:00Z')), '2026-11-23');
  assert.equal(lerNumero('1.250.000,50'), 1250000.5);
  assert.equal(lerNumero('R$ 250000'), 250000);
  assert.equal(lerNumero(''), null);
  assert.ok(Number.isNaN(lerNumero('abc')));
});

test('comercial: closing sets today when empty, reopening clears the date and the loss reason', () => {
  const f = { ...negocioFormVazio('2026-11-23'), titulo: 'X', etapa: 'perdido' as const, motivoPerda: 'preco' as const };
  assert.deepEqual([camposDoNegocio(f, '2026-11-23').dataFechamento, camposDoNegocio(f, '2026-11-23').motivoPerda], ['2026-11-23', 'preco']);
  assert.equal(camposDoNegocio({ ...f, etapa: 'ganho' }, '2026-11-23').motivoPerda, null);
  const perdido = negocio({ etapa: 'perdido', dataFechamento: '2026-05-01', motivoPerda: 'preco' });
  assert.deepEqual(camposDaEtapa(perdido, 'proposta_enviada', '2026-11-23'), { etapa: 'proposta_enviada', dataFechamento: null, motivoPerda: null });
  assert.deepEqual(camposDaEtapa(negocio(), 'ganho', '2026-11-23'), { etapa: 'ganho', dataFechamento: '2026-11-23', motivoPerda: null });
});

test('comercial: filters by year, segment, responsible (including none), search and trash', () => {
  const lista = [
    negocio({ id: 'a', responsaveis: ['u1', 'u2'], cliente: 'Prefeitura de Ijuí', segmento: 'publico' }),
    negocio({ id: 'b', dataCriacao: '2025-03-01' }),
    negocio({ id: 'c', excluidoEm: new Date() }),
  ];
  const ids = (f: Partial<typeof FILTRO_INICIAL>) => filtrarNegocios(lista, { ...FILTRO_INICIAL, ...f }).map((n) => n.id);
  assert.deepEqual(ids({}), ['a', 'b']);
  assert.deepEqual(ids({ ano: 2025 }), ['b']);
  assert.deepEqual(ids({ segmento: 'publico' }), ['a']);
  assert.deepEqual(ids({ responsavelUid: 'u2' }), ['a']);
  assert.deepEqual(ids({ responsavelUid: '' }), ['b']);
  assert.deepEqual(ids({ busca: 'ijui' }), ['a']);
  assert.deepEqual(ids({ lixeira: true }), ['c']);
});

test('comercial: dashboard totals, conversion, cycle and per-responsible counts', () => {
  const r = resumoPainel([
    negocio({ etapa: 'proposta_enviada', valor: 100, responsaveis: ['u1'] }),
    negocio({ etapa: 'ganho', valor: 300, dataFechamento: '2026-01-20', responsaveis: ['u1', 'u2'] }),
    negocio({ etapa: 'pos_venda', valor: 100, dataFechamento: '2026-01-30' }),
    negocio({ etapa: 'perdido', valor: 50, motivoPerda: 'preco' }),
  ], 'todos', { u1: 'Ana', u2: 'Bia' });
  assert.deepEqual(r.abertos, { quantidade: 1, valor: 100 });
  assert.deepEqual(r.ganhos, { quantidade: 2, valor: 400 });
  assert.equal(r.conversao, 2 / 3);
  assert.equal(r.ticketMedio, 200);
  assert.deepEqual(r.cicloMedio, { dias: 15, base: 2 });
  assert.equal(r.porResponsavel.find((l) => l.rotulo === 'Ana')?.quantidade, 2);
  assert.equal(r.porResponsavel.find((l) => l.rotulo === 'Bia')?.ganhos, 1);
  assert.equal(r.porMotivo[0].rotulo, 'Preço');
  assert.equal(r.porEtapa.find((e) => e.id === 'licitado')?.quantidade, 0);
});

test('comercial: contact validation', () => {
  assert.equal(validarContato(contatoFormVazio()), 'Informe o nome.');
  assert.equal(validarContato({ ...contatoFormVazio(), nome: 'A', email: 'x@' }), 'E-mail inválido.');
  assert.equal(validarContato({ ...contatoFormVazio(), nome: 'A', email: 'a@b.com' }), null);
});

test('migração do Friday: boards, stages (Etapa first, then the group), labels and values', () => {
  assert.deepEqual(quadroDoNegocio('Negócios públicos 2026'), { segmento: 'publico', tipo: 'negocio' });
  assert.deepEqual(quadroDoNegocio('Projetos Privados'), { segmento: 'privado', tipo: 'projeto' });
  assert.equal(quadroDoNegocio('Contatos'), null);
  assert.deepEqual(etapaDoItem('Proposta Enviada', 'Perdido', 'privado'), { etapa: 'proposta_enviada', fonte: 'etapa' });
  assert.deepEqual(etapaDoItem(null, 'Encerrado - Conquistado', 'publico'), { etapa: 'ganho', fonte: 'grupo' });
  assert.deepEqual(etapaDoItem(null, 'Negócios', 'publico'), { etapa: 'lead', fonte: 'padrao' });
  assert.deepEqual(etapaDoItem('Qualificação da oportunidade', null, 'privado'), { etapa: 'qualificacao', fonte: 'etapa' });
  assert.equal(etapaDoItem('Licitado', null, 'privado').etapa, 'proposta_enviada');
  assert.equal(prioridadeDe('Muito Alta'), 'muito_alta');
  assert.equal(origemDe('Indicação/Pessoa'), 'indicacao');
  assert.equal(origemDe('Malas Direta'), 'mala_direta');
  assert.equal(origemDe('Feito'), null);
  assert.equal(motivoDe('Optou por não executar os serviços'), 'nao_executou');
  assert.equal(categoriaContatoDe('Monntadores'), 'montador');
  assert.equal(cargoDe(['FUNCIONARIO', 'CEO'], 'CEO'), 'Funcionario, CEO');
  assert.equal(numeroDe(205, true), 20.5);
  assert.equal(numeroDe(-1), null);
  assert.equal(instanteDe('2025-02-11 15:25:34')?.toISOString(), '2025-02-11T18:25:34.000Z');
  assert.equal(textoComMencoes('@{u1} e @{x}', { u1: 'Ana' }), '@Ana e @alguém');
});
