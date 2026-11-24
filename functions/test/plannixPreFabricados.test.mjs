import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codigosValidos, createPlannixService, etapaPelasDatas, itensDasPecas, itensDoLancamento } from '../lib/plannixPreFabricados.js';

// Formato das rotas do Plannix (mesmos campos na API antiga /api/bi e na nova /public/v1/bi), com dados inventados.
const OBRAS = [
  { codObra: 113, siglaObra: 'PM IBARAMA', nomeObra: 'PONTE 5,00X30,00M (CABRITOS)' },
  { codObra: 117, siglaObra: 'PM IBARAMA', nomeObra: 'PONTE 5,00X25,00M (LAJ. GRINGA)' },
  { codObra: 200, siglaObra: 'PM NOVA', nomeObra: 'GALERIA 2,00X2,00M ' },
];
const peca = (codigoControle, nomeObra, produto, nomePeca, secao = '25X40') => ({ codigoControle, nomeObra, produto, nomePeca, secao, sigla: 'PM IBARAMA' });
const PECAS = [
  { ...peca('1003', 'PONTE 5,00X25,00M (LAJ. GRINGA)', 'PILAR', 'P01'), data_Projeto: '13/07/2026 00:00:00', data_CorteDobra: '28/07/2026 16:35:00', data_Acabamento: '11/09/2026 14:52:00', status_Logistica: 'EXPEDIDA', data_Expedicao: '14/09/2026 16:30:00' },
  peca('1001', 'PONTE 5,00X25,00M (LAJ. GRINGA)', 'PILAR', 'P01'),
  peca('1002', 'PONTE 5,00X25,00M (LAJ. GRINGA)', 'PILAR', 'P01'),
  peca('1010', 'PONTE 5,00X25,00M (LAJ. GRINGA)', 'VIGA', 'VL - 25X70X1250', '25X70'),
  peca('2001', 'PONTE 5,00X30,00M (CABRITOS)', 'VIGA', 'VL - 25X70X1500', '25X70'),
];
const STATUS = [
  { codigoControle: '1001', processo: 'CORTE DOBRA', status: 'LIBERADA', data: '2026-11-24T09:36:00' },
  { codigoControle: '1002', processo: 'ACABADA', status: 'LIBERADA', data: '2026-11-20T10:00:00' },
  { codigoControle: '1010', processo: 'EXPEDIDA', status: 'EXPEDIDA', data: '2026-11-22T08:00:00' },
];
const LANCAMENTOS = [{ CodigoObra: 200, Sigla: 'PM NOVA', NomeObra: 'GALERIA 2,00X2,00M', Itens: [
  { Produto: 'GALERIA', SubgrupoProduto: 'GALERIA', Secao: '2,00X2,00', Comprimento: 1.0, QtdPecas: 8.0, Fase: 'Lançamento Final' },
  { Produto: 'GALERIA', SubgrupoProduto: 'GALERIA', Secao: '2,00X2,00', Comprimento: null, QtdPecas: 8.0, Fase: 'Lançamento Inicial' },
] }];

test('códigos: inteiros positivos, sem repetição e com limite', () => {
  assert.deepEqual(codigosValidos({ codigos: [117, '117', 113] }), [117, 113]);
  for (const dados of [null, {}, { codigos: [] }, { codigos: [0] }, { codigos: [1.5] }, { codigos: ['x'] }, { codigos: Array.from({ length: 31 }, (_, i) => i + 1) }]) {
    assert.throws(() => codigosValidos(dados), (e) => e.code === 'invalid-argument', JSON.stringify(dados));
  }
});

test('peças: só as da obra, agrupadas pelo nome da peça, com a etapa atual de cada código', () => {
  const itens = itensDasPecas(PECAS, STATUS, 'PONTE 5,00X25,00M (LAJ. GRINGA)');
  assert.deepEqual(itens.map((i) => [i.produto, i.nome, i.quantidade]), [['PILAR', 'P01', 3], ['VIGA', 'VL - 25X70X1250', 1]]);
  assert.deepEqual(itens[0].pecas, [
    { codigo: '1001', etapa: 'CORTE DOBRA', data: '2026-11-24T09:36:00' },
    { codigo: '1002', etapa: 'ACABADA', data: '2026-11-20T10:00:00' },
    // Fora de exportaStatusProducao: a etapa sai das datas da própria peça.
    { codigo: '1003', etapa: 'EXPEDIDA', data: '2026-09-14T16:30:00' },
  ]);
});

test('etapa pelas datas: o último evento com data, da montagem para trás', () => {
  assert.deepEqual(etapaPelasDatas({ data_Projeto: '24/11/2026 00:00:00', data_CorteDobra: '24/11/2026 09:36:00' }), { etapa: 'CORTE DOBRA', data: '2026-11-24T09:36:00' });
  assert.deepEqual(etapaPelasDatas({ data_Projeto: '13/07/2026 00:00:00', data_Concretagem: '28/07/2026 16:35:00', data_Acabamento: '11/09/2026 14:52:00' }), { etapa: 'ACABADA', data: '2026-09-11T14:52:00' });
  assert.deepEqual(etapaPelasDatas({ data_Expedicao: '14/09/2026 16:30:00', montada: true, dataMontada: '20/09/2026 08:00:00' }), { etapa: 'MONTADA', data: '2026-09-20T08:00:00' });
  assert.deepEqual(etapaPelasDatas({ status_Logistica: 'EXPEDIDA' }), { etapa: 'EXPEDIDA', data: null });
  assert.deepEqual(etapaPelasDatas({ data_Projeto: null }), { etapa: '', data: null });
});

test('sem projeto: as linhas do Lançamento Final (só a fase Final) com a quantidade prevista', () => {
  assert.deepEqual(itensDoLancamento(LANCAMENTOS, 200), [{ produto: 'GALERIA', nome: 'GALERIA · 2,00X2,00 · 1 m', secao: '2,00X2,00', pecas: [], quantidade: 8, desenhos: [] }]);
  assert.deepEqual(itensDoLancamento(LANCAMENTOS, 999), []);
});

test('serviço: exige a área Engenharia; junta cadastro, peças, etapas, Lançamento Final e desenhos', async () => {
  const chamadas = [];
  const store = {
    async getEmployee(uid) { return uid === 'eng' ? { ativo: true, perfis: {}, areas: { engenharia: 'ver' } } : { ativo: true, perfis: {}, areas: { logistica: 'ver' } }; },
    async get(rota, p = {}) {
      chamadas.push(`${rota} ${JSON.stringify(p)}`);
      if (rota === 'obras') return OBRAS;
      if (rota === 'informacaoGlobalPeca') return p.siglaObra === 'PM IBARAMA' ? PECAS : [];
      if (rota === 'exportaStatusProducao') return p.sigla === 'PM IBARAMA' ? STATUS : null;
      if (rota === 'lancamentoInicialeFinal') return LANCAMENTOS;
      if (rota === 'ListaArquivosProjetos') return p.codigoControle === '1001' ? ['p01.pdf'] : [];
      throw new Error(rota);
    },
  };
  const servico = createPlannixService(store);
  await assert.rejects(servico(undefined, { codigos: [117] }), (e) => e.code === 'unauthenticated');
  await assert.rejects(servico('log', { codigos: [117] }), (e) => e.code === 'permission-denied');

  const { lotes } = await servico('eng', { codigos: [117, 200, 999] });
  assert.equal(lotes.length, 3);
  assert.deepEqual([lotes[0].sigla, lotes[0].nome, lotes[0].projeto, lotes[0].itens.length], ['PM IBARAMA', 'PONTE 5,00X25,00M (LAJ. GRINGA)', true, 2]);
  assert.deepEqual(lotes[0].itens[0].desenhos, ['p01.pdf']);
  assert.deepEqual([lotes[1].projeto, lotes[1].itens[0].quantidade], [false, 8]);
  assert.deepEqual(lotes[2], { codigo: 999, erro: 'nao-encontrada' });
  // Uma consulta de peças e de etapas por sigla, não por LOTE.
  assert.equal(chamadas.filter((c) => c.startsWith('informacaoGlobalPeca')).length, 2);
});
