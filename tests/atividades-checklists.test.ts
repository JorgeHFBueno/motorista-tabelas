import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizarAtividade } from '../src/services/atividade-normalizer.ts';
import { normalizarChecklist } from '../src/services/checklist-normalizer.ts';

const atividadeV2 = {
  schemaVersion: 2, tipo: 'saida', data: new Date(2026, 9, 20, 8), destino: 'Arroio do Tigre - RS', local: 'Arroio do Tigre - RS', km: 123456, motivo: 'Deslocamento para obra',
  motorista: { uid: 'WELINTON_F.R', nome: 'WELINTON FERNANDO RODRIGUES' }, criadoPor: { uid: 'WELINTON_F.R', nome: 'WELINTON FERNANDO RODRIGUES' },
  item_frota_id: 'v1', item_frota_snapshot: { categoria: 'PLACA', identificador: 'IRO-2146', nome: 'Mercedez Axor' },
  id_obra: 'o1', id_obra_snap: { codObra: 12, siglaObra: 'AT', nomeObra: 'ARROIO DO TIGRE 214/2024', local: 'Arroio do Tigre - RS' },
};

test('atividade V2: lê motorista, veículo e obra do contrato', () => {
  const a = normalizarAtividade(atividadeV2, 'saida - 2026-10-20 08-00-00 - IRO-2146');
  assert.equal(a.tipo, 'saida'); assert.equal(a.foraDoContrato, undefined);
  assert.equal(a.motorista, 'WELINTON FERNANDO RODRIGUES'); assert.equal(a.motoristaUid, 'WELINTON_F.R');
  assert.equal(a.placa, 'IRO-2146'); assert.equal(a.veiculoId, 'v1'); assert.equal(a.veiculoNome, 'Mercedez Axor');
  assert.equal(a.obra, 'ARROIO DO TIGRE 214/2024'); assert.equal(a.obraId, 'o1');
  assert.equal(a.destino, 'Arroio do Tigre - RS'); assert.equal(a.km, 123456);
});

test('atividade migrada com motorista sem UID e obra fora do cadastro', () => {
  const a = normalizarAtividade({ ...atividadeV2, migradoDoLegado: true, motorista: { uid: null, nome: 'Fulano' }, id_obra: null, id_obra_snap: { codObra: null, siglaObra: null, nomeObra: 'Ainda não havia sido implementado', local: 'Fábrica' } }, 'x');
  assert.equal(a.motoristaUid, null); assert.equal(a.motorista, 'Fulano'); assert.equal(a.obraId, null); assert.equal(a.obra, 'Ainda não havia sido implementado');
});

test('atividade fora do contrato fica marcada, sem interpretar campos antigos', () => {
  const a = normalizarAtividade({ data: new Date(), tipo: 'saida', motorista: 'WELINTON_F.R', placa: 'IRO-2B46', km: 10, obraId: 'fabrica' }, 'antigo');
  assert.equal(a.foraDoContrato, true); assert.equal(a.motivo, 'Fora do contrato V2');
  for (const campo of ['motorista', 'placa', 'km', 'obraId', 'veiculoId', 'tipo']) assert.equal((a as Record<string, unknown>)[campo], undefined, campo);
});

test('checklist V2 e convertido do legado', () => {
  const novo = normalizarChecklist({
    schemaVersion: 1, tipo: 'chegada', catalogo: 'veiculos', item_frota_id: 'v1', item_frota_snapshot: { categoria: 'PLACA', identificador: 'IRO-2146', nome: 'Axor' },
    medidor: { tipo: 'km', valor: 1000 }, guincho: true, motoristaOperador: { uid: 'm', nome: 'Motorista' }, criadoPor: { uid: 'c', nome: 'Mecânico' },
    assinatura: { status: 'assinada', path: 'checklists-v2/x/assinatura_1.jpg' }, concluidoEm: new Date(2026, 9, 22), totais: { ok: 1, avaria: 1, naoSeAplica: 0 },
    itens: [
      { itemId: 'farol', parte: 'frente', titulo: 'Farol', status: 'avaria', observacao: 'quebrado', fotos: [{ path: 'checklists-v2/x/farol_1.jpg', miniatura: 'checklists-v2/x/miniaturas/farol_1.jpg' }] },
      { itemId: 'pneu', parte: 'lateral', titulo: 'Pneu', status: 'ok', observacao: null, fotos: [] },
    ],
  }, 'x');
  assert.equal(novo.tipo, 'chegada'); assert.equal(novo.placa, 'IRO-2146'); assert.equal(novo.motorista, 'Motorista'); assert.equal(novo.mecanico, 'Mecânico');
  assert.equal(novo.assinatura, 'Assinada'); assert.equal(novo.migradoDoLegado, false); assert.equal(novo.totais.avaria, 1);
  assert.equal(novo.itens[0].fotos[0].miniatura, 'checklists-v2/x/miniaturas/farol_1.jpg');

  const antigo = normalizarChecklist({
    schemaVersion: 1, migradoDoLegado: true, atividadeOrigemId: 'saida - 2026-06-16 04-02-48 - IQM-6971', tipo: 'saida',
    assinatura: { status: 'ausente', motivo: 'Checklist anterior ao checklist V2' },
    itens: [{ itemId: 'a', parte: 'frente', titulo: 'A', status: 'nao_informado', observacao: null, fotos: [{ path: 'checklists/saidas/x/a.jpg', miniatura: null }] }],
  }, 'y');
  assert.equal(antigo.migradoDoLegado, true); assert.equal(antigo.atividadeOrigemId, 'saida - 2026-06-16 04-02-48 - IQM-6971');
  assert.equal(antigo.assinatura, 'Ausente — Checklist anterior ao checklist V2');
  assert.equal(antigo.itens[0].status, 'nao_se_aplica'); assert.equal(antigo.itens[0].fotos[0].miniatura, null);
});

test('filtro de registros: data, tipo, veículo, motorista, local e obra', async () => {
  const { filtrarAtividades, FILTROS_VAZIOS, rotuloVeiculo, opcoesDistintas } = await import('../src/services/atividade-filtros.ts');
  const comData = (raw: Record<string, unknown>, id: string) => {
    const a = normalizarAtividade(raw, id);
    return { ...a, dataJS: raw.data as Date | null };
  };
  const rows = [
    comData(atividadeV2, 'a'),
    comData({ ...atividadeV2, tipo: 'chegada', data: new Date(2026, 9, 22, 18), destino: 'Palmeira das Missões - RS', motorista: { uid: 'x', nome: 'OUTRO' } }, 'b'),
    comData({ schemaVersion: 1, data: new Date(2026, 9, 21) }, 'c'),
  ];
  const ids = (f: Partial<typeof FILTROS_VAZIOS>) => filtrarAtividades(rows, { ...FILTROS_VAZIOS, ...f }).map((r) => r.id);

  assert.deepEqual(ids({}), ['a', 'b', 'c']);
  assert.deepEqual(ids({ dataInicial: '2026-10-21', dataFinal: '2026-10-22' }), ['b', 'c']);
  assert.deepEqual(ids({ dataFinal: '2026-10-20' }), ['a']);
  assert.deepEqual(ids({ tipo: 'chegada' }), ['b']);
  assert.equal(rotuloVeiculo(rows[0]), 'IRO-2146 — Mercedez Axor');
  assert.deepEqual(ids({ veiculos: ['IRO-2146 — Mercedez Axor'] }), ['a', 'b']);
  assert.deepEqual(ids({ motoristas: ['OUTRO'] }), ['b']);
  assert.deepEqual(ids({ locais: ['Arroio do Tigre - RS'] }), ['a']);
  assert.deepEqual(ids({ obras: ['ARROIO DO TIGRE 214/2024'], motoristas: ['OUTRO', 'WELINTON FERNANDO RODRIGUES'] }), ['a', 'b']);
  assert.deepEqual(opcoesDistintas(['b', undefined, 'a', '', 'b']), ['a', 'b']);
});
