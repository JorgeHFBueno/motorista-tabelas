import test from 'node:test';
import assert from 'node:assert/strict';
import { leituraDoRegistro } from '../lib/frotaUltimaAtualizacao.js';

const ts = (iso) => ({ toDate: () => new Date(iso) });
const agora = new Date('2026-11-17T12:00:00Z');

test('atividade com km leva a data; sem km, sem veículo ou sem data, não', () => {
  assert.deepEqual(leituraDoRegistro('atividades', { item_frota_id: 'v1', km: 116395, data: ts('2026-11-17T10:00:00Z') }, agora), { veiculoId: 'v1', data: new Date('2026-11-17T10:00:00Z') });
  assert.equal(leituraDoRegistro('atividades', { item_frota_id: 'v1', data: ts('2026-11-17T10:00:00Z') }, agora), null);
  assert.equal(leituraDoRegistro('atividades', { item_frota_id: '', km: 10, data: ts('2026-11-17T10:00:00Z') }, agora), null);
  assert.equal(leituraDoRegistro('atividades', { item_frota_id: 'v1', km: 10 }, agora), null);
});

test('combustível: só saída V2 com quilometragem ou horímetro', () => {
  const base = { item_frota_id: 'v1', schemaVersion: 2, tipo: 'saida', data: ts('2026-11-16T09:00:00Z') };
  assert.ok(leituraDoRegistro('03-combustivel', { ...base, quilometragem: 50000 }, agora));
  assert.ok(leituraDoRegistro('03-combustivel', { ...base, horimetro: 1200 }, agora));
  assert.equal(leituraDoRegistro('03-combustivel', { ...base, semKm: 'Sem Odometro' }, agora), null);
  assert.equal(leituraDoRegistro('03-combustivel', { ...base, tipo: 'entrada', quilometragem: 1 }, agora), null);
  assert.equal(leituraDoRegistro('03-combustivel', { ...base, schemaVersion: 1, quilometragem: 1 }, agora), null);
});

test('data mais de um dia no futuro (relógio errado) não conta', () => {
  assert.equal(leituraDoRegistro('atividades', { item_frota_id: 'v1', km: 1, data: ts('2026-11-19T12:00:00Z') }, agora), null);
  assert.ok(leituraDoRegistro('atividades', { item_frota_id: 'v1', km: 1, data: ts('2026-11-18T06:00:00Z') }, agora));
});
