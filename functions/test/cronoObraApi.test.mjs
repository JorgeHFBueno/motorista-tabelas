import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  EntradaInvalida, diasNT, lerApoio, formatoChaveCronoObra, hashChaveCronoObra, lerFiltrosCronograma, lerNaoTrabalhados, montarCronograma, pessoaDaChaveCronoObra,
} from '../lib/cronoObraApiDominio.js';
import { responderMcp } from '../lib/fridayMcp.js';

const CHAVE = `encr_${'A1b2C3d4E5'.repeat(4)}`;

test('CronoObra key: format encr_ + 40 and SHA-256 equal to the browser hash', () => {
  assert.equal(formatoChaveCronoObra(CHAVE), true);
  assert.equal(formatoChaveCronoObra(`fri_${'a'.repeat(40)}`), false);
  assert.equal(formatoChaveCronoObra(`sis_${'a'.repeat(40)}`), false);
  assert.equal(formatoChaveCronoObra(`encr_${'a'.repeat(39)}`), false);
  assert.equal(formatoChaveCronoObra(undefined), false);
  assert.equal(hashChaveCronoObra(CHAVE), createHash('sha256').update(CHAVE).digest('hex'));
});

test('CronoObra key person: not revoked, active employee who sees the Engenharia area (or adm2)', () => {
  const registro = { uid: 'u1', nome: 'Robô', revogada_em: null };
  const engenharia = { ativo: true, nome: 'Samuel', areas: { engenharia: 'ver' } };
  assert.deepEqual(pessoaDaChaveCronoObra(registro, engenharia), { uid: 'u1', nome: 'Samuel', adm2: false });
  assert.deepEqual(pessoaDaChaveCronoObra(registro, { ativo: true, nome: 'Jorge', perfis: { adm2: true } }), { uid: 'u1', nome: 'Jorge', adm2: true });
  assert.equal(pessoaDaChaveCronoObra(registro, { ativo: true, nome: 'Outro', areas: { friday: 'editar' } }), null, 'sem a área Engenharia');
  assert.equal(pessoaDaChaveCronoObra({ ...registro, revogada_em: '2026-11-19 10:00:00' }, engenharia), null);
  assert.equal(pessoaDaChaveCronoObra(registro, { ...engenharia, ativo: false }), null);
  assert.equal(pessoaDaChaveCronoObra(registro, undefined), null);
  assert.equal(pessoaDaChaveCronoObra(undefined, engenharia), null);
});

test('filters: dates in both formats, de after ate refused, status list', () => {
  assert.deepEqual(lerFiltrosCronograma({ de: '01/11/2026', ate: '2026-11-30', status: ['Em andamento', 'Parada'] }),
    { de: '2026-11-01', ate: '2026-11-30', contrato: null, mestre: null, status: ['Em andamento', 'Parada'] });
  assert.deepEqual(lerFiltrosCronograma({ status: 'A,B' }).status, ['A', 'B']);
  assert.deepEqual(lerFiltrosCronograma(undefined), { de: null, ate: null, contrato: null, mestre: null, status: [] });
  assert.throws(() => lerFiltrosCronograma({ de: '31/02/2026' }), EntradaInvalida);
  assert.throws(() => lerFiltrosCronograma({ de: 'ontem' }), EntradaInvalida);
  assert.throws(() => lerFiltrosCronograma({ de: '2026-12-01', ate: '2026-11-01' }), EntradaInvalida);
});

test('NT copy: entries out of format ignored; only days inside the period count', () => {
  assert.deepEqual(lerNaoTrabalhados([{ inicio: '2026-11-03', dias: 2 }, { inicio: '2026-02-30', dias: 1 }, { inicio: '2026-11-10', dias: 0 }, null]),
    [{ inicio: '2026-11-03', dias: 2 }]);
  assert.equal(lerNaoTrabalhados([]), undefined);
  assert.equal(lerNaoTrabalhados('x'), undefined);
  assert.equal(diasNT({ inicio: '2026-11-01', tempoPlanejado: 5, naoTrabalhados: [{ inicio: '2026-11-04', dias: 4 }] }).size, 2);
});

const doc = (id, data) => ({ id, data });
const alocacao = (extra) => ({ contratoId: 'c1', mestreId: 'dine', inicio: '2026-11-02', tempoPlanejado: 10, criadoPorFuncionarioId: 'u1', ...extra });
function fontes() {
  return {
    obras: [
      doc('c1', {
        friday: { ok: true }, nomeObra: 'Ponte Arroio', siglaObra: 'PA', numeroContrato: '45/2025', empresa: 'Prefeitura', tipoObra: 'Pública', situacao: 'Em andamento',
        lotes: {
          l2: { nome: 'LOTE 2', status: 'Próxima a iniciar', ordem: 2, prioridade: 1 },
          l1: { nome: 'LOTE 1', status: 'Em andamento', ordem: 1 },
          l3: { nome: 'LOTE 3', status: 'Em andamento', ordem: 3, situacao: 'arquivado' },
        },
      }),
      doc('c2', { friday: { ok: true }, nomeObra: 'Escola Nova', numeroContrato: '10/2026', situacao: 'Não iniciada' }),
      doc('c3', { friday: { ok: false }, nomeObra: 'Fora do Friday', lotes: { l9: { nome: 'LOTE 9' } } }),
    ],
    mestres: [doc('dine', { nome: 'DINE', cor: '376f55' }), doc('antonio', { nome: 'ANTÔNIO', cor: '6a5136' }), doc('dup', { nome: 'DUP', cor: '376F55' }), doc('ruim', { nome: '', cor: '111111' })],
    alocacoes: [
      doc('a1', alocacao({ obraId: 'l1', naoTrabalhados: [{ inicio: '2026-11-05', dias: 2 }] })),
      doc('a2', alocacao({ obraId: 'l2', mestreId: 'antonio', inicio: '2026-12-01', tempoPlanejado: 3 })),
      doc('a3', alocacao({ contratoId: 'c2', mestreId: 'antonio', inicio: '2026-11-20', tempoPlanejado: 1 })),
      doc('fora-lote-arquivado', alocacao({ obraId: 'l3' })),
      doc('fora-lote-inexistente', alocacao({ obraId: 'nao-existe' })),
      doc('fora-contrato-sem-friday', alocacao({ contratoId: 'c3', obraId: 'l9' })),
      doc('fora-mestre-cor-repetida', alocacao({ obraId: 'l1', mestreId: 'dup' })),
      doc('fora-mestre-inexistente', alocacao({ obraId: 'l1', mestreId: 'ninguem' })),
      doc('fora-sem-autor', alocacao({ obraId: 'l1', criadoPorFuncionarioId: '' })),
      doc('fora-tempo-invalido', alocacao({ obraId: 'l1', tempoPlanejado: 0 })),
    ],
  };
}
const semFiltro = { de: null, ate: null, contrato: null, mestre: null, status: [] };

test('cronograma: only allocations the screen shows, with end, NT and worked days', () => {
  const r = montarCronograma(fontes(), semFiltro);
  assert.deepEqual(r.alocacoes.map((a) => a.alocacaoId), ['a1', 'a3', 'a2']);
  const a1 = r.alocacoes[0];
  assert.deepEqual(
    { contratoId: a1.contratoId, obra: a1.obra, sigla: a1.sigla, numeroContrato: a1.numeroContrato, loteId: a1.loteId, lote: a1.lote, statusLote: a1.statusLote, mestre: a1.mestre, inicio: a1.inicio, fim: a1.fim, dias: a1.dias, diasNT: a1.diasNT, diasTrabalhados: a1.diasTrabalhados },
    { contratoId: 'c1', obra: 'Ponte Arroio', sigla: 'PA', numeroContrato: '45/2025', loteId: 'l1', lote: 'LOTE 1', statusLote: 'Em andamento', mestre: 'DINE', inicio: '2026-11-02', fim: '2026-11-11', dias: 10, diasNT: 2, diasTrabalhados: 8 },
  );
  // Sem obraId: linha do contrato (sem LOTE), com o status do contrato.
  assert.deepEqual([r.alocacoes[1].loteId, r.alocacoes[1].lote, r.alocacoes[1].statusLote, r.alocacoes[1].fim], [null, null, 'Não iniciada', '2026-11-20']);
  assert.deepEqual(r.obras.map((o) => o.contratoId), ['c2', 'c1']);
  assert.deepEqual(r.obras[1].lotes.map((l) => [l.loteId, l.prioridade]), [['l1', null], ['l2', 1]]);
  assert.deepEqual(r.mestres.map((m) => m.id), ['dine', 'antonio']);
});

test('cronograma: apoio ("ajuda por fora") is marked with its origin and counts no worked days', () => {
  assert.deepEqual(lerApoio({ alocacaoId: 'a1', contratoId: 'c1', obraId: 'l1' }), { alocacaoId: 'a1', contratoId: 'c1', obraId: 'l1' });
  for (const ruim of [null, {}, { alocacaoId: 'a1' }, { alocacaoId: 'a1', contratoId: '' }, { alocacaoId: 'a1', contratoId: 'c1', obraId: 3 }]) assert.equal(lerApoio(ruim), undefined);
  const f = fontes();
  f.alocacoes.push(doc('ap1', alocacao({ contratoId: 'c2', mestreId: 'dine', inicio: '2026-11-06', tempoPlanejado: 2, apoio: { alocacaoId: 'a1', contratoId: 'c1', obraId: 'l1' } })));
  const r = montarCronograma(f, semFiltro);
  const ap = r.alocacoes.find((a) => a.alocacaoId === 'ap1');
  assert.deepEqual(ap.apoio, { alocacaoId: 'a1', contratoId: 'c1', obra: 'Ponte Arroio', loteId: 'l1', lote: 'LOTE 1' });
  assert.deepEqual([ap.contratoId, ap.dias, ap.diasNT, ap.diasTrabalhados, ap.naoTrabalhados], ['c2', 2, 0, 0, []]);
  assert.equal(r.alocacoes.find((a) => a.alocacaoId === 'a1').apoio, null);
});

test('cronograma filters: period touching the interval, contract, master without accents, LOTE status', () => {
  const ids = (f) => montarCronograma(fontes(), { ...semFiltro, ...f }).alocacoes.map((a) => a.alocacaoId);
  assert.deepEqual(ids({ de: '2026-11-11', ate: '2026-11-11' }), ['a1']);
  assert.deepEqual(ids({ de: '2026-11-12', ate: '2026-11-30' }), ['a3']);
  assert.deepEqual(ids({ ate: '2026-11-01' }), []);
  assert.deepEqual(ids({ contrato: '45/2025' }), ['a1', 'a2']);
  assert.deepEqual(ids({ contrato: 'escola' }), ['a3']);
  assert.deepEqual(ids({ mestre: 'antonio' }), ['a3', 'a2']);
  assert.deepEqual(ids({ mestre: 'dine' }), ['a1']);
  assert.deepEqual(ids({ status: ['próxima a iniciar', 'Não iniciada'] }), ['a3', 'a2']);
  assert.deepEqual(montarCronograma(fontes(), { ...semFiltro, contrato: 'c2' }).obras.map((o) => o.contratoId), ['c2']);
});

test('MCP with another server: its own tools, name and instructions', async () => {
  const ferramentas = [{ name: 'quem_sou_eu', title: 'Quem', description: 'x', inputSchema: { type: 'object', properties: {} }, escrita: false, annotations: { readOnlyHint: true, openWorldHint: false } }];
  const ctx = { escrita: false, ferramentas, servidor: { name: 'ledur-cronoobra', title: 'CronoObra Ledur' }, instrucoes: 'oi', executar: async (nome) => ({ nome }), mensagemDeErro: () => 'erro' };
  const init = await responderMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, ctx);
  assert.equal(init.result.serverInfo.name, 'ledur-cronoobra');
  assert.equal(init.result.instructions, 'oi');
  const lista = await responderMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx);
  assert.deepEqual(lista.result.tools.map((t) => t.name), ['quem_sou_eu']);
  const chamada = await responderMcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'quem_sou_eu' } }, ctx);
  assert.match(chamada.result.content[0].text, /quem_sou_eu/);
  const desconhecida = await responderMcp({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'buscar_itens' } }, ctx);
  assert.equal(desconhecida.error.code, -32602);
});
