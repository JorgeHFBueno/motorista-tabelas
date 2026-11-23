import assert from 'node:assert/strict';
import test from 'node:test';
import { FILTROS_VAZIOS, type AtividadeComData } from '../src/services/atividade-filtros';
import { filtrarViagens, registroProximo, valoresDaViagem, veiculosSemSinal, viagemDoDocumento } from '../src/features/rastreador/domain/viagem';

// Aba Rastreador de /mecanica/registros. Só dados fictícios.
const ts = (iso: string) => ({ toDate: () => new Date(iso) });
const DOC = {
  schemaVersion: 1, item_frota_id: 'v1', item_frota_snapshot: { categoria: 'PLACA', identificador: 'AAA-1B11', nome: 'CAMINHAO' },
  situacao: 'concluida', saida: { data: ts('2026-11-10T10:05:00Z'), km: 1000, lat: -27.9, lng: -53.3 },
  chegada: { data: ts('2026-11-10T20:00:00Z'), km: 1100, lat: -27.9, lng: -53.3 }, kmRodado: 100, maisLongeKm: 50.2,
  programacoes: [{ id: 'pr1', item: 'Transporte', obra: { id: 'ob1', nome: 'OBRA 1/2026' }, motorista: 'Fulano', inicio: '2026-11-10', fim: '2026-11-11' }],
  visitaObra: { chegou: ts('2026-11-10T13:00:00Z'), saiu: ts('2026-11-10T15:00:00Z'), nome: 'LOTE 1', origem: 'lote' },
  paradaMaisLonga: { inicio: ts('2026-11-10T13:00:00Z'), fim: ts('2026-11-10T15:00:00Z'), minutos: 120, lat: -29, lng: -53 },
  motorista: { uid: 'FULANO_U', nome: 'FULANO DA SILVA' }, motoristaOrigem: 'programacao',
};

test('documento → viagem; sem saída é descartado', () => {
  const v = viagemDoDocumento('v1_1', DOC)!;
  assert.equal(v.placa, 'AAA-1B11');
  assert.equal(v.emAndamento, false);
  assert.deepEqual(v.obras, ['OBRA 1/2026']);
  assert.equal(v.visitaObra?.nome, 'LOTE 1');
  assert.equal(v.motoristaOrigem, 'programacao');
  assert.equal(v.atribuidoPor, null);
  assert.equal(viagemDoDocumento('x', { ...DOC, saida: null }), null);
  const manual = viagemDoDocumento('v1_1', { ...DOC, motoristaOrigem: 'manual', motoristaAtribuidoPor: { uid: 'u', nome: 'Mecânico' } })!;
  assert.equal(manual.atribuidoPor, 'Mecânico');
  assert.equal(viagemDoDocumento('v1_1', { ...DOC, situacao: 'em_andamento', chegada: null })!.emAndamento, true);
});

test('filtros da página: período pela saída, veículo com o mesmo rótulo da Geral, motorista e obra', () => {
  const v = [viagemDoDocumento('v1_1', DOC)!];
  assert.equal(filtrarViagens(v, FILTROS_VAZIOS).length, 1);
  assert.equal(filtrarViagens(v, { ...FILTROS_VAZIOS, dataInicial: '2026-11-11' }).length, 0);
  assert.equal(filtrarViagens(v, { ...FILTROS_VAZIOS, veiculos: ['AAA-1B11 — CAMINHAO'] }).length, 1);
  assert.equal(filtrarViagens(v, { ...FILTROS_VAZIOS, motoristas: ['OUTRO'] }).length, 0);
  assert.equal(filtrarViagens(v, { ...FILTROS_VAZIOS, obras: ['OBRA 1/2026'] }).length, 1);
  assert.equal(filtrarViagens(v, { ...FILTROS_VAZIOS, locais: ['Qualquer'], tipo: 'chegada' }).length, 1);
  // Opções dos filtros na aba Rastreador.
  assert.deepEqual(valoresDaViagem(v[0], 'veiculos'), ['AAA-1B11 — CAMINHAO']);
  assert.deepEqual(valoresDaViagem(v[0], 'motoristas'), ['FULANO DA SILVA']);
  assert.deepEqual(valoresDaViagem(v[0], 'locais'), []);
});

test('registro do motorista: mesmo veículo e tipo, o mais perto até 4 h', () => {
  const a = (id: string, tipo: 'saida' | 'chegada', iso: string, veiculoId = 'v1'): AtividadeComData => ({ id, tipo, veiculoId, dataJS: new Date(iso), km: 5 });
  const lista = [a('1', 'saida', '2026-11-10T10:00:00Z'), a('2', 'saida', '2026-11-10T13:00:00Z'), a('3', 'saida', '2026-11-10T10:04:00Z', 'v2'), a('4', 'chegada', '2026-11-10T10:05:00Z')];
  assert.equal(registroProximo(lista, 'v1', 'saida', new Date('2026-11-10T10:05:00Z'))?.id, '1');
  assert.equal(registroProximo(lista, 'v1', 'saida', new Date('2026-11-10T18:00:00Z')), null);
  assert.equal(registroProximo(lista, 'v1', 'saida', null), null);
});

test('sem rastreador ou sem sinal há mais de 3 dias', () => {
  const agora = new Date('2026-11-23T12:00:00Z');
  const lista = veiculosSemSinal([
    { id: 'a', identificador: 'BBB-2C22', temRastreador: true, ultimaComunicacao: new Date('2026-11-23T10:00:00Z'), erro: null },
    { id: 'b', identificador: 'CCC-3D33', temRastreador: true, ultimaComunicacao: new Date('2026-08-01T10:00:00Z'), erro: null },
    { id: 'c', identificador: 'AAA-1B11', temRastreador: false, ultimaComunicacao: null, erro: null },
  ], agora);
  assert.deepEqual(lista.map((v) => v.identificador), ['AAA-1B11', 'CCC-3D33']);
});
