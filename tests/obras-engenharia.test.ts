import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizarAtividade } from '../src/services/atividade-normalizer';
import { normalizarMovimentoCombustivel } from '../src/services/combustivel-normalizer';
import {
  contratoTexto,
  filtrarObras,
  localPendente,
  obraDetalheFromV2,
  periodosDosMestres,
  resumirCombustivel,
  veiculosNaObra,
  type ObraDetalhe,
} from '../src/features/obras/obrasDomain';
import { createObraRelatorioPdf, nomeArquivoRelatorioObra } from '../src/features/obras/obraRelatorioPdf';

const contrato = {
  nomeObra: 'LAGOA BONITA DO SUL 16/2026', siglaObra: '', codObra: 0, local: 'CORRIGIR', status: 'CONTRATADA',
  situacao: 'Obra em andamento', numeroContrato: '16', ano: 2026, empresa: 'LEDUR', tipoObra: 'Pública',
  subcentroErp: ' 0102 ', dataInicial: '2026-03-01', dataFinal: '2026-12-31T00:00:00', friday: { ok: true },
  lotes: {
    b: { nome: 'LOTE 2', status: 'Não iniciada', ordem: 1 },
    a: { nome: 'LOTE 1', status: 'Em andamento', ordem: 0 },
    z: { nome: 'LOTE VELHO', status: 'Finalizado', ordem: 2, situacao: 'arquivado' },
  },
};

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

test('obra de obras-v2: LOTEs ativos na ordem, arquivados só no mapa de nomes, datas só AAAA-MM-DD', () => {
  const obra = obraDetalheFromV2('c1', contrato)!;
  assert.deepEqual(obra.lotes.map((lote) => lote.nome), ['LOTE 1', 'LOTE 2']);
  assert.equal(obra.nomesLotes.z, 'LOTE VELHO');
  assert.equal(obra.subcentroErp, ' 0102 ', 'subcentro guardado exatamente como veio');
  assert.equal(obra.dataInicial, '2026-03-01');
  assert.equal(obra.dataFinal, null);
  assert.equal(contratoTexto(obra), '16/2026');
  assert.equal(obraDetalheFromV2('x', { nomeObra: '  ' }), null);
});

test('local pendente: vazio ou CORRIGIR', () => {
  assert.equal(localPendente('CORRIGIR'), true);
  assert.equal(localPendente(' corrigir '), true);
  assert.equal(localPendente(''), true);
  assert.equal(localPendente('Lagoa Bonita do Sul - RS'), false);
});

test('lista: filtros Ativas, Sem local, Finalizadas e busca sem acento', () => {
  const obras = [
    obraDetalheFromV2('c1', contrato)!,
    obraDetalheFromV2('c2', { ...contrato, nomeObra: 'SÃO JOSÉ 1/2025', local: 'São José', status: 'FINALIZADA' })!,
    obraDetalheFromV2('c3', { ...contrato, nomeObra: 'ARROIO 2/2026', local: 'Arroio do Meio' })!,
  ] as ObraDetalhe[];
  assert.deepEqual(filtrarObras(obras, '', 'ATIVAS').map((obra) => obra.id), ['c3', 'c1']);
  assert.deepEqual(filtrarObras(obras, '', 'SEM_LOCAL').map((obra) => obra.id), ['c1']);
  assert.deepEqual(filtrarObras(obras, '', 'FINALIZADAS').map((obra) => obra.id), ['c2']);
  assert.deepEqual(filtrarObras(obras, 'sao jose', 'TODAS').map((obra) => obra.id), ['c2']);
});

test('mestres: um período por alocação, fim = início + dias − 1, LOTE pelo nome (arquivado também)', () => {
  const periodos = periodosDosMestres([
    { id: '2', mestreId: 'dine', obraId: 'z', inicio: '2026-05-10', tempoPlanejado: 3 },
    { id: '1', mestreId: 'jefe', obraId: 'a', inicio: '2026-04-01', tempoPlanejado: 30 },
    { id: '3', mestreId: 'novo', inicio: '2026-06-01', tempoPlanejado: 1 },
    { id: '4', mestreId: 'dine', obraId: 'a', inicio: 'inválido', tempoPlanejado: 3 },
  ], { dine: 'DINE', jefe: 'JEFE' }, obraDetalheFromV2('c1', contrato)!.nomesLotes);
  assert.deepEqual(periodos.map((p) => [p.mestre, p.lote, p.inicio, p.fim, p.dias]), [
    ['JEFE', 'LOTE 1', '2026-04-01', '2026-04-30', 30],
    ['DINE', 'LOTE VELHO', '2026-05-10', '2026-05-12', 3],
    ['novo', 'Contrato', '2026-06-01', '2026-06-01', 1],
  ]);
});

const atividade = (id: string, placa: string, motorista: string, iso: string) => normalizarAtividade({
  schemaVersion: 2, tipo: 'saida', data: ts(iso), id_obra: 'c1', item_frota_id: `v-${placa}`,
  item_frota_snapshot: { identificador: placa, nome: `Caminhão ${placa}` }, motorista: { uid: motorista, nome: motorista },
}, id);

test('veículos: agrupados pelo veículo, com primeira e última data e motoristas; fora do contrato fica de fora', () => {
  const veiculos = veiculosNaObra([
    atividade('1', 'ABC1D23', 'ANA', '2026-04-01T12:00:00Z'),
    atividade('2', 'ABC1D23', 'BETO', '2026-04-20T12:00:00Z'),
    atividade('3', 'XYZ9K88', 'ANA', '2026-05-02T12:00:00Z'),
    normalizarAtividade({ tipo: 'saida', id_obra: 'c1' }, '4'),
  ]);
  assert.deepEqual(veiculos.map((v) => [v.placa, v.atividades, v.motoristas]), [['XYZ9K88', 1, ['ANA']], ['ABC1D23', 2, ['ANA', 'BETO']]]);
  assert.equal(veiculos[1].primeira?.toISOString(), '2026-04-01T12:00:00.000Z');
  assert.equal(veiculos[1].ultima?.toISOString(), '2026-04-20T12:00:00.000Z');
});

const saida = (id: string, placa: string, quantidade: number, valor: number, iso: string) => normalizarMovimentoCombustivel({
  schemaVersion: 2, tipo: 'saida', data: ts(iso), id_obra: 'c1', item_frota_id: `v-${placa}`,
  item_frota_snapshot: { identificador: placa, categoria: 'PLACA' }, quantidadeAbastecida: quantidade, valorAbastecimento: valor,
  motoristaOperador: { nome: 'ANA' }, frentista: { nome: 'FRENTISTA' },
}, id);

test('combustível: litros ×10 e valor em centavos, total e por veículo; entradas ficam de fora', () => {
  const resumo = resumirCombustivel([
    saida('1', 'ABC1D23', 1005, 59295, '2026-04-02T12:00:00Z'),
    saida('2', 'ABC1D23', 500, 29500, '2026-04-01T12:00:00Z'),
    saida('3', 'XYZ9K88', 2000, 118000, '2026-04-03T12:00:00Z'),
    normalizarMovimentoCombustivel({ schemaVersion: 2, tipo: 'entrada', litrosComprados: 50000 }, '4'),
  ]);
  assert.equal(resumo.abastecimentos, 3);
  assert.equal(resumo.litros, 350.5);
  assert.equal(resumo.valor, 2067.95);
  assert.deepEqual(resumo.porVeiculo.map((v) => [v.veiculo, v.abastecimentos, v.litros]), [['XYZ9K88', 1, 200], ['ABC1D23', 2, 150.5]]);
  assert.deepEqual(resumo.itens.map((item) => item.id), ['2', '1', '3']);
  assert.equal(resumo.itens[0].paraQuem, 'ANA');
});

test('relatório da obra: PDF com todas as seções; fonte que falhou aparece como indisponível', async () => {
  const obra = obraDetalheFromV2('c1', contrato)!;
  const pdf = createObraRelatorioPdf({
    obra,
    geradoEm: new Date('2026-10-30T15:00:00Z'),
    medicoes: { status: 'ok', data: { snapshot: { idObra: 'c1', subcentroErp: '0102', qtd_notas: 3, valor_bruto_servico: 123456.78 }, atualizadoAgora: true } },
    mestres: { status: 'ok', data: periodosDosMestres([{ id: '1', mestreId: 'jefe', obraId: 'a', inicio: '2026-04-01', tempoPlanejado: 30 }], { jefe: 'JEFE' }, obra.nomesLotes) },
    veiculos: { status: 'erro' },
    combustivel: { status: 'ok', data: resumirCombustivel([saida('1', 'ABC1D23', 1005, 59295, '2026-04-02T12:00:00Z')]) },
  });
  assert.equal(pdf.type, 'application/pdf');
  const conteudo = Buffer.from(await pdf.arrayBuffer()).toString('latin1');
  for (const trecho of ['RELAT\xd3RIO DA OBRA', 'DADOS DA OBRA', 'SALDO DO CONTRATO / MEDI\xc7\xd5ES', 'MESTRES ALOCADOS', 'VE\xcdCULOS QUE FORAM PARA A OBRA', 'COMBUST\xcdVEL', 'JEFE', 'R$ 123.456,78', 'R$ 592,95', '100,5 L', 'N\xe3o foi poss\xedvel carregar as atividades.', 'Ledur Motorista \x97 relat\xf3rio da obra']) {
    assert.ok(conteudo.includes(trecho), trecho);
  }
  assert.equal(nomeArquivoRelatorioObra(obra, new Date('2026-10-30T15:00:00Z')), 'Relatorio-Obra-LAGOA-BONITA-DO-SUL-16-2026-2026-10-30.pdf');
});
