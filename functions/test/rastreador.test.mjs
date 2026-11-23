import { test } from 'node:test';
import assert from 'node:assert/strict';

const d = await import('../lib/rastreadorDominio.js');

// Viagens pelo rastreador (Fulltrack). Só dados fictícios; coordenadas reais só da Fábrica (ponto da Fulltrack).
const F = d.FABRICA;
// ~0,009° de latitude ≈ 1 km.
const longe = (km) => ({ lat: F.lat - km * 0.009, lng: F.lng });
const T0 = Date.UTC(2026, 10, 10, 10, 0, 0); // 10/11/2026 07:00 (Brasília)
const min = (m) => T0 + m * 60e3;
const p = (m, pos, km) => ({ t: min(m), lat: pos.lat, lng: pos.lng, km });

test('data da Fulltrack é UTC', () => {
  assert.equal(d.dataFulltrack('22/11/2026 03:19:38'), Date.UTC(2026, 10, 22, 3, 19, 38));
  assert.equal(d.dataFulltrack('2026-11-22'), null);
  assert.equal(d.diaBrasilia(Date.UTC(2026, 10, 22, 2, 0, 0)), '2026-11-21');
});

test('ponto: hodômetro em metros vira km; 0 é sem km; coordenada inválida descarta', () => {
  const base = { ras_eve_data_gps: '10/11/2026 10:00:00', ras_eve_latitude: '-27.9', ras_eve_longitude: '-53.3' };
  assert.equal(d.pontoFulltrack({ ...base, ras_eve_hodometro: '91195489' }).km, 91195.489);
  assert.equal(d.pontoFulltrack({ ...base, ras_eve_hodometro: '0' }).km, null);
  assert.equal(d.pontoFulltrack({ ...base, ras_eve_latitude: '0' }), null);
  assert.equal(d.pontoFulltrack({ ...base, ras_eve_data_gps: '' }), null);
});

test('placa: textos da Fulltrack e Mercosul comparam com o identificador', () => {
  assert.equal(d.chavePlaca('IRO 2B46 - '), d.chavePlaca('IRO-2146'));
  assert.equal(d.chavePlaca('ITU1I21 '), d.chavePlaca('ITU-1I21'));
  assert.equal(d.chavePlaca('ILW-2A23 - MICRO'), 'ILW2023');
  assert.equal(d.chavePlaca('CARREGADEI'), null);
});

test('ligar: prefere o principal que comunicou ao localizador', () => {
  const agora = Date.UTC(2026, 10, 23, 12);
  const ultimos = [
    { ras_vei_id: '1', ras_vei_placa: 'AAA 1B11 - ', ras_vei_veiculo: 'AAA 1B11 - LOCALIZADOR', ras_eve_hodometro: '5000', ras_ras_data_ult_comunicacao: '23/11/2026 11:00:00' },
    { ras_vei_id: '2', ras_vei_placa: 'AAA1B11', ras_vei_veiculo: 'CAMINHAO', ras_eve_hodometro: '9000', ras_ras_data_ult_comunicacao: '23/11/2026 10:00:00' },
    { ras_vei_id: '3', ras_vei_placa: 'BBB2C22', ras_vei_veiculo: 'CARRO', ras_eve_hodometro: '1', ras_ras_data_ult_comunicacao: '01/01/2026 10:00:00' },
  ];
  const l = d.ligarRastreadores(ultimos, [{ id: 'v1', identificador: 'AAA-1B11' }, { id: 'v2', identificador: 'BBB-2C22' }, { id: 'v3', identificador: 'CCC-3D33' }], agora);
  assert.equal(l.get('v1').veiculoId, '2');
  assert.deepEqual(l.get('v1').outros, ['1']);
  assert.equal(l.get('v2').veiculoId, '3');
  assert.equal(l.has('v3'), false);
});

const viagem = [
  p(0, F, 1000), p(5, F, 1000),
  p(10, longe(2), 1002), p(30, longe(20), 1020), p(60, longe(50), 1050),
  p(70, longe(50), 1050), p(100, longe(50), 1050), // parada de 40 min a 50 km
  p(130, longe(20), 1080), p(160, F, 1100),
];

test('viagem: sai do raio, para, volta; saída é o último ponto dentro', () => {
  const r = d.processarPontos(d.estadoInicial(), viagem);
  assert.equal(r.fechadas.length, 1);
  assert.equal(r.aberta, null);
  const v = r.fechadas[0];
  assert.equal(v.saida.t, min(5));
  assert.equal(v.chegada.t, min(160));
  assert.equal(v.paradas.length, 1);
  assert.equal(v.paradas[0].inicio, min(60));
  assert.equal(v.paradas[0].fim, min(100));
  assert.ok(v.maisLongeM > 49000);
});

test('viagem em partes (uma leitura por execução) dá o mesmo resultado', () => {
  const a = d.processarPontos(d.estadoInicial(), viagem.slice(0, 5));
  assert.equal(a.fechadas.length, 0);
  assert.equal(a.aberta.saida.t, min(5));
  const b = d.processarPontos(a.estado, viagem);
  assert.equal(b.fechadas.length, 1);
  assert.equal(b.fechadas[0].saida.t, min(5));
  assert.equal(b.fechadas[0].paradas.length, 1);
});

test('volta no quarteirão (até 3 km) não é viagem', () => {
  const r = d.processarPontos(d.estadoInicial(), [p(0, F, 1), p(10, longe(2), 2), p(20, longe(2.5), 3), p(30, F, 4)]);
  assert.equal(r.fechadas.length, 0);
  assert.equal(r.aberta, null);
});

test('parado muito tempo na Fábrica: saída é o primeiro ponto fora, com o KM do último dentro', () => {
  const r = d.processarPontos(d.estadoInicial(), [p(0, F, 500), p(120, longe(5), 503), p(200, F, 510)]);
  assert.equal(r.fechadas[0].saida.t, min(120));
  assert.equal(r.fechadas[0].saida.km, 500);
});

const PROG = {
  id: 'pr1', item: 'Transporte', inicio: '2026-11-10', fim: '2026-11-11', veiculos: [{ id: 'v1', nome: 'AAA-1B11' }],
  obra: { id: 'ob1', nome: 'OBRA TESTE 1/2026' }, motorista: { id: '777', nome: 'Fulano' }, local: null,
};
const OBRAS = new Map([['ob1', { lotes: { a: { nome: 'LOTE 1 - PONTE', coordenada: { lat: longe(50).lat + 0.003, lng: F.lng } } } }]]);
const FUNC = [{ uid: 'FULANO_U', nome: 'FULANO DA SILVA', fridayItemId: '777' }];

test('programação: veículo e período; motorista pelo item do Friday; obra pelo LOTE a 600 m', () => {
  const v = d.processarPontos(d.estadoInicial(), viagem).fechadas[0];
  const doc = d.documentoViagem({ itemFrotaId: 'v1', veiculo: { identificacao: { categoria: 'PLACA', identificador: 'AAA-1B11', nome: 'CAMINHAO' } }, rastreador: { veiculoId: '2', placa: 'AAA1B11' }, viagem: v, programacoes: [PROG, { ...PROG, id: 'pr2', inicio: '2026-11-12', fim: '2026-11-13' }], obras: OBRAS, funcionarios: FUNC, agora: min(200) });
  assert.equal(doc.situacao, 'concluida');
  assert.equal(doc.kmRodado, 100);
  assert.deepEqual(doc.programacoes.map((x) => x.id), ['pr1']);
  assert.deepEqual(doc.motoristaProgramacao, { uid: 'FULANO_U', nome: 'FULANO DA SILVA' });
  assert.equal(doc.visitaObra.origem, 'lote');
  assert.equal(doc.visitaObra.chegou.getTime(), min(60));
  assert.equal(doc.paradaMaisLonga.minutos, 40);
});

test('programação com Local usa o Local; Fábrica não é obra; dois motoristas ficam para a atribuição', () => {
  const v = d.processarPontos(d.estadoInicial(), viagem).fechadas[0];
  const comLocal = { ...PROG, local: { lat: 10, lng: 10, cidade: 'Longe', uf: 'RS' } };
  const outro = { ...PROG, id: 'pr3', motorista: { id: '888', nome: 'Beltrano' } };
  const doc = d.documentoViagem({ itemFrotaId: 'v1', veiculo: {}, rastreador: { veiculoId: '2', placa: 'X' }, viagem: v, programacoes: [comLocal, outro], obras: OBRAS, funcionarios: FUNC, agora: min(200) });
  assert.equal(doc.motoristaProgramacao, null);
  assert.equal(doc.visitaObra.origem, 'lote'); // pr3 ainda acha pelo LOTE; pr1 (Local longe) não
  assert.deepEqual(d.alvosDaProgramacao({ ...PROG, obra: { id: d.OBRA_FABRICA_ID } }, OBRAS), []);
});

test('id estável da viagem', () => {
  assert.equal(d.idViagem('v1', Date.UTC(2026, 10, 10, 10, 5, 0, 700)), `v1_${Date.UTC(2026, 10, 10, 10, 5, 0) / 1000}`);
});
