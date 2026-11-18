import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCAL_PADRAO_CHEGADA, MOTIVO_CHEGADA, deveAtualizarKm, documentoAtividade, filtrarObras, idAtividade, lerKm, novaAtividade,
  validarKm, validarMotivo, veiculoDaAtividade, type AtividadePendente,
} from '../src/features/saida-chegada/domain/atividade';
import { EnviadorAtividades, esperaApos, mensagemDeErro } from '../src/features/saida-chegada/domain/enviador';
import type { ItemFrotaV2, ObraV2 } from '../src/utils/cadastrosV2';

const veiculo = (extra: Partial<ItemFrotaV2> = {}): ItemFrotaV2 => ({
  id: 'vv1', categoria: 'PLACA', identificador: 'ICV-8E43', nome: 'Caminhão 1', ativo: true, situacao: null,
  quilometragemInicial: null, dataQuilometragemInicial: null, origemQuilometragemInicial: null, quilometragemUltima: 1000,
  dataUltimaAtualizacao: null, raw: {}, ...extra,
});
const obra = (extra: Partial<ObraV2> = {}): ObraV2 => ({
  id: 'ob1', codObra: 123, siglaObra: 'CRUZ', nomeObra: 'Pavimentação Cruz Alta', local: 'Cruz Alta - RS', status: '', lotes: [], ...extra,
});
const fabrica = obra({ id: 'O4hkkxZX3LbeZyluMsrt', codObra: 1, siglaObra: 'FAB', nomeObra: 'FABRICA', local: '' });
const ana = { uid: 'u-ana', nome: 'Ana' };
const agora = new Date(2026, 10, 18, 8, 5, 9);

test('id da atividade: tipo, hora do aparelho e identificador, como no app', () => {
  assert.equal(idAtividade('saida', 'ICV-8E43', agora), 'saida - 2026-11-18 08-05-09 - ICV-8E43');
});

test('Saída: documento V2 com snapshots do veículo e da obra, local = destino', () => {
  const p = novaAtividade({ tipo: 'saida', veiculo: veiculo(), km: 1010, obra: obra(), local: ' Cruz Alta - RS ', motivo: ' Deslocamento para obra ', motorista: ana, criadoPor: ana, agora });
  assert.equal(p.id, 'saida - 2026-11-18 08-05-09 - ICV-8E43');
  const d = documentoAtividade(p, 'DATA', 'SERVIDOR');
  assert.deepEqual(d, {
    schemaVersion: 2, data: 'DATA', registradoEm: 'SERVIDOR', destino: 'Cruz Alta - RS', local: 'Cruz Alta - RS', km: 1010,
    motivo: 'Deslocamento para obra', motorista: ana, criadoPor: ana, item_frota_id: 'vv1',
    item_frota_snapshot: { categoria: 'PLACA', identificador: 'ICV-8E43', nome: 'Caminhão 1' },
    id_obra: 'ob1', id_obra_snap: { codObra: 123, siglaObra: 'CRUZ', nomeObra: 'Pavimentação Cruz Alta', local: 'Cruz Alta - RS' },
    tipo: 'saida',
  });
});

test('Chegada: obra Fábrica, motivo fixo e local padrão quando a Fábrica não tem local', () => {
  const p = novaAtividade({ tipo: 'chegada', veiculo: veiculo(), km: 1020, obra: fabrica, local: '', motorista: ana, criadoPor: { uid: 'u-adm', nome: 'Adm' }, agora });
  assert.equal(p.destino, LOCAL_PADRAO_CHEGADA);
  assert.equal(p.motivo, MOTIVO_CHEGADA);
  assert.equal(p.obraId, 'O4hkkxZX3LbeZyluMsrt');
  assert.deepEqual(p.criadoPor, { uid: 'u-adm', nome: 'Adm' });
});

test('KM: só dígitos; Saída aceita igual ao último, Chegada só maior', () => {
  assert.equal(lerKm('1.000'), null);
  assert.equal(lerKm(' 1000 '), 1000);
  assert.match(validarKm('', 1000, 'saida') ?? '', /Informe/);
  assert.match(validarKm('10,5', 1000, 'saida') ?? '', /só números/);
  assert.equal(validarKm('1000', 1000, 'saida'), null);
  assert.match(validarKm('999', 1000, 'saida') ?? '', /maior ou igual/);
  assert.match(validarKm('1000', 1000, 'chegada') ?? '', /maior que/);
  assert.equal(validarKm('1001', 1000, 'chegada'), null);
  assert.equal(validarKm('0', null, 'saida'), null);
});

test('motivo com pelo menos 3 letras', () => {
  assert.match(validarMotivo('  ') ?? '', /Informe/);
  assert.match(validarMotivo('ab') ?? '', /3 caracteres/);
  assert.equal(validarMotivo('Obra'), null);
});

test('KM do veículo só sobe', () => {
  assert.equal(deveAtualizarKm(null, 10), true);
  assert.equal(deveAtualizarKm(10, 11), true);
  assert.equal(deveAtualizarKm(10, 10), false);
  assert.equal(deveAtualizarKm(10, 9), false);
});

test('veículo da atividade: placa ativa com identificador e nome', () => {
  assert.equal(veiculoDaAtividade(veiculo()), true);
  assert.equal(veiculoDaAtividade(veiculo({ categoria: 'EXTRA' })), false);
  assert.equal(veiculoDaAtividade(veiculo({ ativo: false })), false);
});

test('busca de obra por nome, sinônimo ou local, sem acento', () => {
  const obras = [obra(), obra({ id: 'ob2', siglaObra: 'PAL', nomeObra: 'Rua São João', local: 'Palmeira das Missões - RS' })];
  assert.deepEqual(filtrarObras(obras, 'cruz').map((o) => o.id), ['ob1']);
  assert.deepEqual(filtrarObras(obras, 'sao joao').map((o) => o.id), ['ob2']);
  assert.deepEqual(filtrarObras(obras, 'pal').map((o) => o.id), ['ob2']);
  assert.deepEqual(filtrarObras(obras, 'missoes').map((o) => o.id), ['ob2']);
  assert.equal(filtrarObras(obras, '').length, 2);
});

// ------------------------------------------------------------------ fila de envio

function montarFila(opcoes: { falhar?: () => unknown; uid?: string } = {}) {
  const guardados = new Map<string, AtividadePendente>();
  const gravados: string[] = [];
  let relogio = new Date('2026-11-18T12:00:00Z');
  const agendados: number[] = [];
  const enviador = new EnviadorAtividades({
    armazenamento: {
      listarPendentes: async () => [...guardados.values()],
      salvarPendente: async (p) => { guardados.set(p.id, p); },
      removerPendente: async (id) => { guardados.delete(id); },
    },
    destino: {
      gravar: async (p) => {
        const erro = opcoes.falhar?.();
        if (erro) throw erro;
        gravados.push(p.id);
      },
    },
    uidAtual: () => opcoes.uid ?? 'u-ana',
    relogio: { agora: () => relogio, agendar: (_acao, ms) => agendados.push(ms), cancelar: () => undefined },
  });
  return { enviador, guardados, gravados, agendados, avancar: (ms: number) => { relogio = new Date(relogio.getTime() + ms); } };
}

const pendente = (id: string, criadoPor = ana): AtividadePendente => ({
  ...novaAtividade({ tipo: 'saida', veiculo: veiculo(), km: 1010, obra: obra(), local: 'X', motivo: 'Obra', motorista: ana, criadoPor, agora }),
  id,
});

test('fila: lançar grava e tira do aparelho', async () => {
  const f = montarFila();
  await f.enviador.lancar(pendente('a1'));
  await f.enviador.enviarPendentes();
  assert.deepEqual(f.gravados, ['a1']);
  assert.equal(f.guardados.size, 0);
  assert.deepEqual(f.enviador.obterEstado().pendentes, []);
  // O Histórico mostra como enviado mesmo antes de a lista do servidor trazê-lo.
  assert.deepEqual(f.enviador.obterEstado().enviados.map((p) => p.id), ['a1']);
});

test('fila: sem conexão fica no aparelho com a falha, espera e "Tentar novamente" força o envio', async () => {
  let offline = true;
  const f = montarFila({ falhar: () => (offline ? { code: 'unavailable' } : null) });
  await f.enviador.lancar(pendente('a1'));
  await f.enviador.enviarPendentes();
  const guardado = f.guardados.get('a1');
  assert.ok(guardado);
  assert.equal(guardado.tentativas, 1);
  assert.equal(guardado.ultimoErro, 'Sem conexão com o servidor.');
  assert.equal(f.enviador.obterEstado().pendentes.length, 1);
  assert.ok(f.agendados.length > 0);

  // Dentro da espera, uma rodada normal não tenta de novo.
  offline = false;
  await f.enviador.enviarPendentes();
  assert.deepEqual(f.gravados, []);

  // Tentar novamente ignora a espera.
  await f.enviador.enviarPendentes({ forcar: true });
  assert.deepEqual(f.gravados, ['a1']);
  assert.equal(f.guardados.size, 0);
});

test('fila: só envia os lançamentos de quem está logado', async () => {
  const f = montarFila({ uid: 'u-ana' });
  await f.enviador.lancar(pendente('a1'));
  await f.enviador.lancar(pendente('b1', { uid: 'u-beto', nome: 'Beto' }));
  await f.enviador.enviarPendentes({ forcar: true });
  assert.deepEqual(f.gravados, ['a1']);
  assert.ok(f.guardados.has('b1'));
  assert.deepEqual(f.enviador.obterEstado().pendentes, []);
});

test('espera entre tentativas: 30 s até 15 min', () => {
  assert.equal(esperaApos(1), 30_000);
  assert.equal(esperaApos(3), 120_000);
  assert.equal(esperaApos(20), 900_000);
});

test('mensagem de erro curta', () => {
  assert.equal(mensagemDeErro({ code: 'permission-denied' }), 'Sem permissão para gravar. Avise o responsável.');
  assert.equal(mensagemDeErro(new Error('O veículo X não está mais no cadastro.')), 'O veículo X não está mais no cadastro.');
});
