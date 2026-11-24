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

// ---- Fase A.1: calibração do KM e Saída/Chegada prontas ----
const H = 3600e3;
const viagensKm = [
  { saida: { t: T0, km: 1000 }, chegada: { t: T0 + 5 * H, km: 1100 } },
  { saida: { t: T0 + 24 * H, km: 1100 }, chegada: { t: T0 + 30 * H, km: 1250 } },
];

test('KM do rastreador na hora: perto da saída/volta ou parado na Fábrica; no meio da viagem, não', () => {
  assert.equal(d.kmRastreadorNaHora(T0 - 30 * 60e3, viagensKm), 1000);
  assert.equal(d.kmRastreadorNaHora(T0 + 2.5 * H, viagensKm), null);
  assert.equal(d.kmRastreadorNaHora(T0 + 12 * H, viagensKm), 1100);
  assert.equal(d.kmRastreadorNaHora(T0 + 40 * H, viagensKm), null);
});

test('calibração: mediana das diferenças que concordam; sem 3, KM a completar', () => {
  const leituras = [
    { id: 'a', fonte: 'combustivel', t: T0 - 10 * 60e3, km: 403000 },
    { id: 'b', fonte: 'atividade', t: T0 + 5 * H + 5 * 60e3, km: 403102 },
    { id: 'c', fonte: 'combustivel', t: T0 + 12 * H, km: 403099 },
    { id: 'd', fonte: 'atividade', t: T0 + 24 * H, km: 4031000 },
    { id: 'e', fonte: 'combustivel', t: T0 + 2.5 * H, km: 403050 },
  ];
  const c = d.calibrar(leituras, viagensKm);
  assert.equal(c.ajusteKm, 402000);
  assert.equal(c.amostras.length, 4);
  assert.deepEqual(c.amostras.map((a) => a.concorda), [false, true, true, true]);
  const poucas = d.calibrar(leituras.slice(0, 2), viagensKm);
  assert.equal(poucas.ajusteKm, null);
  assert.match(poucas.motivo, /2 leitura/);
  const discordam = d.calibrar([leituras[0], { ...leituras[1], km: 403300 }, { ...leituras[2], km: 402500 }], viagensKm);
  assert.equal(discordam.ajusteKm, null);
});

test('id da atividade do rastreador: hora de Brasília, como o app', () => {
  assert.equal(d.idAtividadeRastreador('saida', 'ICV-8E43', Date.UTC(2026, 9, 20, 11, 0, 5)), 'saida - 2026-10-20 08-00-05 - ICV-8E43');
});

const obrasA1 = new Map([
  [d.OBRA_FABRICA_ID, { codObra: 1, siglaObra: 'FAB', nomeObra: 'FABRICA', local: 'Palmeira das Missões - RS' }],
  ['o1', { codObra: 7, siglaObra: 'X1', nomeObra: 'Obra X', local: 'Ijuí - RS' }],
]);
const prog = { id: 'p1', item: 'Transporte de Material', obra: { id: 'o1', nome: 'X1 - Obra X' }, local: { cidade: 'Cruz Alta', uf: 'RS', lat: 1, lng: 1 } };
const baseRegistros = {
  viagemId: 'v1_1', itemFrotaId: 'v1', veiculoSnapshot: { categoria: 'PLACA', identificador: 'AAA-1B11', nome: 'CAMINHAO' },
  saida: { t: T0, km: 1000 }, chegada: { t: T0 + 5 * H, km: 1100 },
  motorista: { uid: 'u1', nome: 'Fulano' }, programacaoDaVisita: prog, ajusteKm: 402000, obras: obrasA1, atividades: [], agora: T0 + 6 * H,
};

test('registros: pronta grava Saída e Chegada; a Chegada espera 30 min', () => {
  const r = d.registrosDaViagem(baseRegistros);
  assert.equal(r.saida.estado, 'rastreador');
  assert.equal(r.chegada.estado, 'rastreador');
  assert.equal(r.gravar.length, 2);
  const [saida, chegada] = r.gravar.map((g) => g.campos);
  assert.equal(r.gravar[0].id, 'saida - 2026-11-10 07-00-00 - AAA-1B11');
  assert.deepEqual([saida.km, saida.destino, saida.local, saida.motivo, saida.id_obra, saida.origem, saida.rastreadorViagemId], [403000, 'Cruz Alta - RS', 'Cruz Alta - RS', 'Transporte de Material', 'o1', 'rastreador', 'v1_1']);
  assert.deepEqual(saida.id_obra_snap, { codObra: 7, siglaObra: 'X1', nomeObra: 'Obra X', local: 'Ijuí - RS' });
  assert.deepEqual(saida.criadoPor, { uid: null, nome: 'Rastreador' });
  assert.deepEqual([chegada.km, chegada.destino, chegada.motivo, chegada.id_obra], [403100, 'Palmeira das Missões - RS', 'Volta a Fábrica', d.OBRA_FABRICA_ID]);
  const cedo = d.registrosDaViagem({ ...baseRegistros, agora: T0 + 5 * H + 10 * 60e3 });
  assert.equal(cedo.chegada.estado, 'aguardando');
  assert.equal(cedo.gravar.length, 1);
});

test('registros: sem obra confirmada, motorista ou calibração fica a completar; a Chegada espera a Saída', () => {
  const r = d.registrosDaViagem({ ...baseRegistros, programacaoDaVisita: null, motorista: null, ajusteKm: null });
  assert.equal(r.saida.estado, 'pendente');
  assert.deepEqual(r.saida.faltam, ['motorista', 'obra', 'destino', 'motivo', 'km']);
  assert.deepEqual(r.chegada.faltam, ['saida', 'motorista', 'km']);
  assert.equal(r.gravar.length, 0);
});

test('registros: o do App a até 60 min vale e empresta o motorista à Chegada; o do rastreador não grava de novo', () => {
  const app = { id: 'saida - app', tipo: 'saida', t: T0 + 20 * 60e3, itemFrotaId: 'v1', motorista: { uid: 'u2', nome: 'Beltrano' }, rastreadorViagemId: null };
  const r = d.registrosDaViagem({ ...baseRegistros, motorista: null, programacaoDaVisita: null, atividades: [app] });
  assert.equal(r.saida.estado, 'app');
  assert.equal(r.saida.atividadeId, 'saida - app');
  assert.equal(r.chegada.estado, 'rastreador');
  assert.deepEqual(r.gravar.map((g) => g.campos.motorista), [{ uid: 'u2', nome: 'Beltrano' }]);
  const longe = d.registrosDaViagem({ ...baseRegistros, atividades: [{ ...app, t: T0 + 2 * H }] });
  assert.equal(longe.saida.estado, 'rastreador');
  const ja = d.registrosDaViagem({ ...baseRegistros, atividades: [{ ...app, id: 'x', rastreadorViagemId: 'v1_1' }, { ...app, id: 'y', tipo: 'chegada', t: T0 + 5 * H, rastreadorViagemId: 'v1_1' }] });
  assert.equal(ja.gravar.length, 0);
  assert.deepEqual([ja.saida.atividadeId, ja.chegada.atividadeId], ['x', 'y']);
});

// ---- Volta de 2026-11-24 (rodadas enxutas) ----
test('bordas: a mesma saída é substituída (viagem aberta que fechou) e as de mais de 16 dias saem', () => {
  const agora = T0 + 20 * 864e5;
  const velha = { saida: { t: T0, km: 1 }, chegada: { t: T0 + 3600e3, km: 2 } };
  const aberta = { saida: { t: agora - 864e5, km: 10 }, chegada: null };
  const fechada = { ...aberta, chegada: { t: agora - 864e5 + 7200e3, km: 50 } };
  assert.deepEqual(d.juntarBordas([velha, aberta], [fechada], agora), [fechada]);
  assert.deepEqual(d.bordaDaViagem({ saida: { t: 1, lat: 0, lng: 0, km: 10.6 }, chegada: null }), { saida: { t: 1, km: 11 }, chegada: null });
});

test('dias: soma e subtrai sem fuso', () => {
  assert.equal(d.somaDias('2026-11-24', -14), '2026-11-10');
  assert.equal(d.somaDias('2026-12-31', 1), '2027-01-01');
});
