import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChecklistFoto, ChecklistPendente, ChecklistVeiculo } from '../src/features/checklist-mecanico/domain/rascunho';
import { ACOES, CATEGORIAS, TIPOS, UNIDADES } from '../src/features/revisao/domain/listas';
import {
  comItem, diaDe, exibirDia, itemVazio, lerDia, novaPendente, novoItem, novoRegistro, semItem, statusDe,
  type RevisaoItem, type RevisaoPendente, type RevisaoRegistro,
} from '../src/features/revisao/domain/registro';
import {
  abertosDoVeiculo, comMotivo, descricaoRegistro, juntarComServidor, motivoDoItem, ordenarHistorico, pendenciasAoSalvar,
  pendenciasDoItem, pendenciasParaFechar, resumoDoItem, sugestoesDePeca, validarDatas, versaoParaEditar,
} from '../src/features/revisao/domain/regras';
import {
  arquivosParaEnvio, CAMPOS_DE_CRIACAO, dataDoCartao, deveAtualizarMedidor, fotosParaEnvio, lerRevisao, montarDocumento,
} from '../src/features/revisao/domain/documento';
import {
  EnviadorRevisao, MENSAGEM_JA_FECHADA, MENSAGEM_SEM_PERMISSAO, RevisaoJaFechada,
} from '../src/features/revisao/domain/enviador';
import { juntarResumos, resumoDeRevisao } from '../src/features/saida-chegada/domain/resumoMecanico';
import { normalizarChecklist } from '../src/services/checklist-normalizer';

const caminhao: ChecklistVeiculo = { id: 'vv1', categoria: 'PLACA', identificador: 'ABC1D23', nome: 'Caminhão 1', medidorUltimo: 125000 };
const carregadeira: ChecklistVeiculo = { id: 'vm1', categoria: 'EXTRA', identificador: 'CARREG', nome: 'Carregadeira', medidorUltimo: 8700 };
const HOJE = '2026-11-19';
const autor = { uid: 'mec1', nome: 'Mecânico 1' };

const foto = (arquivo: string): ChecklistFoto => ({
  arquivo, miniatura: arquivo.replace('.jpg', '_min.jpg'), origem: 'camera', capturadaEm: new Date('2026-11-19T10:00:00Z'), bytes: 800000, largura: 2048, altura: 1536,
});

const itemCompleto = (itemId: string, extra: Partial<RevisaoItem> = {}): RevisaoItem => ({
  ...novoItem(itemId), categoria: 'freios', acao: 'trocado', peca: 'lona de freio', ...extra,
});

/** Registro pronto para salvar (sem itens). */
const pronto = (extra: Partial<RevisaoRegistro> = {}): RevisaoRegistro => ({
  ...novoRegistro({ veiculo: caminhao, agora: new Date(2026, 10, 18, 9), id: 'REG00000000000000001' }),
  tipo: 'corretiva',
  motivo: 'Barulho no freio',
  ...extra,
});

// ------------------------------------------------------------------ listas e datas
test('listas: os ids gravados são os do app', () => {
  assert.deepEqual(TIPOS.map((t) => t.id), ['preventiva', 'corretiva']);
  assert.equal(CATEGORIAS.length, 13);
  assert.equal(CATEGORIAS[1].id, 'oleo_filtros');
  assert.deepEqual(ACOES.map((a) => a.id), ['trocado', 'colocado', 'retirado', 'consertado', 'regulado', 'lubrificado', 'limpo', 'revisado']);
  assert.deepEqual(UNIDADES.map((u) => u.id), ['un', 'L', 'galao', 'kg', 'm']);
});

test('dia: AAAA-MM-DD local, lido só quando é uma data válida, exibido DD/MM/AAAA', () => {
  assert.equal(diaDe(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(lerDia('2026-02-29'), null);
  assert.equal(lerDia('2028-02-29'), '2028-02-29');
  assert.equal(lerDia('19/11/2026'), null);
  assert.equal(exibirDia('2026-11-19'), '19/11/2026');
});

test('registro novo: medidor do cadastro, foi ao mecânico hoje, rascunho aberto', () => {
  const r = novoRegistro({ veiculo: caminhao, agora: new Date(2026, 10, 19, 8), id: 'X' });
  assert.equal(r.medidor, 125000);
  assert.equal(r.dataEntrada, HOJE);
  assert.equal(r.revisao, 0);
  assert.equal(statusDe(r), 'aberta');
  assert.equal(statusDe({ ...r, dataRetorno: HOJE }), 'fechada');
});

// ------------------------------------------------------------------ regras
test('datas: futuro, parou depois de ir ao mecânico, voltou antes', () => {
  assert.deepEqual(validarDatas(pronto(), HOJE), []);
  assert.deepEqual(validarDatas(pronto({ dataEntrada: null }), HOJE), ['Informe a data que foi ao mecânico.']);
  assert.deepEqual(validarDatas(pronto({ dataEntrada: '2026-11-20' }), HOJE), ['A data que foi ao mecânico não pode ser no futuro.']);
  assert.deepEqual(validarDatas(pronto({ dataParada: '2026-11-19' }), HOJE), ['A data que parou não pode ser depois da data que foi ao mecânico.']);
  assert.deepEqual(validarDatas(pronto({ dataRetorno: '2026-11-17' }), HOJE), ['A data que voltou não pode ser antes da data que foi ao mecânico.']);
  assert.deepEqual(validarDatas(pronto({ dataRetorno: '2026-11-20' }), HOJE), ['A data que voltou não pode ser no futuro.']);
});

test('item: categoria, ação e peça obrigatórias; quantidade só com unidade e maior que zero', () => {
  assert.deepEqual(pendenciasDoItem(itemCompleto('I1')), []);
  assert.deepEqual(pendenciasDoItem(novoItem('I1')), ['Escolha a categoria.', 'Escolha a ação.', 'Informe a peça ou o serviço.']);
  assert.deepEqual(pendenciasDoItem(itemCompleto('I1', { quantidade: 2 })), ['Escolha a unidade da quantidade.']);
  assert.deepEqual(pendenciasDoItem(itemCompleto('I1', { unidade: 'L' })), ['Informe a quantidade ou tire a unidade.']);
  assert.deepEqual(pendenciasDoItem(itemCompleto('I1', { quantidade: 0, unidade: 'L' })), ['A quantidade precisa ser maior que zero.']);
});

test('salvar: sem itens pode; fechar exige ao menos um item e todos completos', () => {
  assert.deepEqual(pendenciasAoSalvar(pronto(), HOJE), []);
  const semTipo = pendenciasAoSalvar(pronto({ tipo: null, motivo: ' ' }), HOJE).map((p) => p.mensagem);
  assert.deepEqual(semTipo, ['Escolha Preventiva ou Corretiva.', 'Informe o motivo.']);
  assert.deepEqual(pendenciasParaFechar(pronto(), HOJE).map((p) => p.mensagem), ['Inclua ao menos um item para fechar a revisão.']);
  const comIncompleto = comItem(pronto(), novoItem('I1'));
  assert.ok(pendenciasParaFechar(comIncompleto, HOJE).every((p) => p.itemId === 'I1'));
  assert.deepEqual(pendenciasParaFechar(comItem(pronto(), itemCompleto('I1')), HOJE), []);
  // KM menor que o do cadastro só com a confirmação.
  assert.equal(pendenciasAoSalvar(pronto({ medidor: 124000 }), HOJE).length, 1);
  assert.deepEqual(pendenciasAoSalvar(pronto({ medidor: 124000, medidorCorrigido: true }), HOJE), []);
});

test('motivo do item: o geral até ter um próprio; igual ao geral ou vazio volta ao geral', () => {
  const r = pronto();
  const item = itemCompleto('I1');
  assert.equal(motivoDoItem(r, item), 'Barulho no freio');
  assert.equal(comMotivo(item, 'Lona gasta', r).motivo, 'Lona gasta');
  assert.equal(comMotivo(item, '  barulho no FREIO ', r).motivo, null);
  assert.equal(comMotivo(item, '', r).motivo, null);
});

test('sugestões de peça: da categoria e as anteriores, sem repetir nem o que já está escrito', () => {
  assert.deepEqual(sugestoesDePeca('freios', 'freio').slice(0, 3), ['lona de freio', 'tambor de freio', 'catraca de freio']);
  assert.deepEqual(sugestoesDePeca('pneus', '', ['Pneu', 'pneu 295']), ['pneu', 'pneu recapado', 'rodízio', 'pneu 295']);
  assert.deepEqual(sugestoesDePeca('pneus', 'Pneu recapado'), []);
  assert.deepEqual(sugestoesDePeca(null, 'x'), []);
});

test('resumo do item, descrição do registro e item vazio', () => {
  const item = itemCompleto('I1', { eixo: 'dianteiro', lado: 'ld', quantidade: 1.5, unidade: 'L' });
  assert.equal(resumoDoItem(item), 'Freios · Trocado · lona de freio · Dianteiro LD · 1,5 L');
  assert.equal(descricaoRegistro(comItem(pronto(), item)), 'Desde 18/11/2026 · 1 item · Barulho no freio');
  assert.equal(itemVazio(novoItem('I2')), true);
  assert.equal(itemVazio({ ...novoItem('I2'), peca: 'x' }), false);
  assert.deepEqual(semItem(comItem(pronto(), item), 'I1').itens, []);
});

test('abertos do veículo, versão a editar e junção com o servidor', () => {
  const a = pronto({ id: 'A', revisao: 1, dataEntrada: '2026-11-10' });
  const b = pronto({ id: 'B', revisao: 1, dataEntrada: '2026-11-05' });
  const fechado = pronto({ id: 'C', revisao: 2, dataRetorno: HOJE });
  assert.deepEqual(abertosDoVeiculo([a, b, fechado], 'vv1').map((r) => r.id), ['B', 'A']);
  const servidorMaisNovo = { ...a, revisao: 3, motivo: 'do servidor' };
  assert.equal(versaoParaEditar(a, servidorMaisNovo).motivo, 'do servidor');
  assert.equal(versaoParaEditar({ ...a, revisao: 3, motivo: 'local' }, servidorMaisNovo).motivo, 'local');
  assert.deepEqual(juntarComServidor([a], [servidorMaisNovo, b]).map((r) => [r.id, r.revisao]), [['A', 3], ['B', 1]]);
});

// ------------------------------------------------------------------ documento
const pendenteFechada = (): RevisaoPendente => {
  const r = comItem(pronto({ revisao: 2, dataRetorno: HOJE, numeroNota: ' ', medidor: 125300 }), itemCompleto('ITEMaaaaaaaaaaaaaaa1', {
    quantidade: 2, unidade: 'un', fotos: [foto('REG00000000000000001/ITEMaaaaaaaaaaaaaaa1_1763550000000.jpg'), foto('manutencoes-v2/REG00000000000000001/ITEMaaaaaaaaaaaaaaa1_1763540000000.jpg')],
  }));
  return novaPendente(r, autor, new Date('2026-11-19T15:00:00Z'));
};

test('documento: campo a campo como o app, fechado por quem salvou', () => {
  const servidor = { marca: 'servidor' };
  const d = montarDocumento(pendenteFechada(), servidor);
  assert.equal(d.status, 'fechada');
  assert.equal(d.revisao, 2);
  assert.deepEqual(d.medidor, { tipo: 'km', valor: 125300, anterior: 125000, corrigido: false });
  assert.equal(d.numeroNota, null);
  assert.deepEqual(d.datas, { parada: null, entrada: '2026-11-18', retorno: HOJE });
  assert.deepEqual(d.fechadoPor, autor);
  assert.deepEqual(d.criadoPor, autor);
  assert.equal(d.criadoPorUid, 'mec1');
  assert.equal(d.registradoEm, servidor);
  assert.equal(d.atualizadoServidorEm, servidor);
  assert.deepEqual(d.fechadaEm, new Date('2026-11-19T15:00:00Z'));
  const [item] = d.itens as Record<string, unknown>[];
  assert.deepEqual(item.quantidade, { valor: 2, unidade: 'un' });
  assert.deepEqual(item.posicao, { eixo: null, lado: null });
  assert.equal(item.motivo, null);
  assert.deepEqual((item.fotos as { path: string; miniatura: string }[]).map((f) => [f.path, f.miniatura]), [
    ['manutencoes-v2/REG00000000000000001/ITEMaaaaaaaaaaaaaaa1_1763550000000.jpg', 'manutencoes-v2/REG00000000000000001/miniaturas/ITEMaaaaaaaaaaaaaaa1_1763550000000.jpg'],
    ['manutencoes-v2/REG00000000000000001/ITEMaaaaaaaaaaaaaaa1_1763540000000.jpg', 'manutencoes-v2/REG00000000000000001/miniaturas/ITEMaaaaaaaaaaaaaaa1_1763540000000.jpg'],
  ]);
  assert.deepEqual([...CAMPOS_DE_CRIACAO], ['criadoPor', 'criadoPorUid', 'abertaEm', 'registradoEm']);
  // Aberta: sem fechadoPor nem fechadaEm; máquina usa horímetro.
  const aberta = montarDocumento(novaPendente({ ...pronto({ revisao: 1 }), veiculo: carregadeira, medidor: 8700 }, autor, new Date()), null);
  assert.equal(aberta.status, 'aberta');
  assert.equal(aberta.fechadoPor, null);
  assert.equal(aberta.fechadaEm, null);
  assert.equal((aberta.medidor as { tipo: string }).tipo, 'horimetro');
});

test('arquivos: as fotos do aparelho e as miniaturas; as já no Storage ficam de fora; nomes aceitos pelas Rules', () => {
  const p = pendenteFechada();
  assert.equal(fotosParaEnvio(p).length, 2);
  assert.deepEqual(arquivosParaEnvio(p), [
    { caminho: 'manutencoes-v2/REG00000000000000001/ITEMaaaaaaaaaaaaaaa1_1763550000000.jpg', local: 'REG00000000000000001/ITEMaaaaaaaaaaaaaaa1_1763550000000.jpg' },
    { caminho: 'manutencoes-v2/REG00000000000000001/miniaturas/ITEMaaaaaaaaaaaaaaa1_1763550000000.jpg', local: 'REG00000000000000001/ITEMaaaaaaaaaaaaaaa1_1763550000000_min.jpg' },
  ]);
  for (const { caminho } of arquivosParaEnvio(p)) assert.match(caminho.split('/').pop()!, /^[A-Za-z0-9]+_[0-9]+\.jpg$/);
});

test('medidor do veículo: só quando o deste registro mudou, sobe, ou baixa com a confirmação', () => {
  const base = { veiculoExiste: true, atual: 125000, valor: 125300, corrigido: false };
  assert.equal(deveAtualizarMedidor({ ...base, medidorNoServidor: undefined }), true);
  assert.equal(deveAtualizarMedidor({ ...base, medidorNoServidor: { valor: 125300, corrigido: false } }), false);
  assert.equal(deveAtualizarMedidor({ ...base, medidorNoServidor: { valor: 125100, corrigido: false } }), true);
  assert.equal(deveAtualizarMedidor({ ...base, valor: 124000, medidorNoServidor: undefined }), false);
  assert.equal(deveAtualizarMedidor({ ...base, valor: 124000, corrigido: true, medidorNoServidor: undefined }), true);
  assert.equal(deveAtualizarMedidor({ ...base, veiculoExiste: false, medidorNoServidor: undefined }), false);
  assert.equal(deveAtualizarMedidor({ ...base, valor: 125000, medidorNoServidor: undefined }), false);
});

test('leitura: o documento gravado volta ao formato do aparelho, com as fotos remotas', () => {
  const p = pendenteFechada();
  const ts = (d: unknown) => (d instanceof Date ? { toDate: () => d } : d);
  const d = montarDocumento(p, null);
  const gravado = { ...d, abertaEm: ts(d.abertaEm), atualizadaEm: ts(d.atualizadaEm), fechadaEm: ts(d.fechadaEm) };
  const l = lerRevisao('REG00000000000000001', gravado);
  assert.equal(l.registro.veiculo.identificador, 'ABC1D23');
  assert.equal(l.registro.veiculo.medidorUltimo, 125000);
  assert.equal(l.registro.dataRetorno, HOJE);
  assert.equal(l.registro.revisao, 2);
  assert.equal(l.criadoPorNome, 'Mecânico 1');
  assert.equal(l.fechadoPorNome, 'Mecânico 1');
  assert.deepEqual(l.registro.itens[0].fotos.map((f) => f.arquivo.startsWith('manutencoes-v2/')), [true, true]);
  assert.equal(resumoDoItem(l.registro.itens[0]), 'Freios · Trocado · lona de freio · 2 un');
  // Reenviar uma versão lida (continuada em outro aparelho) não sobe fotos de novo.
  assert.deepEqual(arquivosParaEnvio(novaPendente({ ...l.registro, revisao: 3 }, autor, new Date())), []);
  assert.deepEqual(dataDoCartao(l), new Date('2026-11-19T15:00:00Z'));
  assert.deepEqual(ordenarHistorico([{ registro: { ...l.registro } }, { registro: pronto({ id: 'aberta' }) }]).map((x) => x.registro.id), ['aberta', 'REG00000000000000001']);
});

// ------------------------------------------------------------------ fila de envio
function montarFila(opcoes: { gravar?: (p: RevisaoPendente) => Promise<void>; uid?: string | null } = {}) {
  const pendentes = new Map<string, RevisaoPendente>();
  const registros = new Map<string, RevisaoRegistro>();
  const arquivos = new Map<string, Blob>();
  const subidos: string[] = [];
  const gravados: RevisaoPendente[] = [];
  const e = new EnviadorRevisao({
    armazenamento: {
      listarPendentes: async () => [...pendentes.values()],
      salvarPendente: async (p) => { pendentes.set(`${p.registro.id}_${p.registro.revisao}`, structuredClone(p)); },
      removerPendentesAte: async (id, revisao) => {
        for (const [k, p] of pendentes) if (p.registro.id === id && p.registro.revisao <= revisao) pendentes.delete(k);
      },
      lerArquivo: async (chave) => arquivos.get(chave) ?? null,
      carregarRegistro: async (id) => registros.get(id) ?? null,
      removerRegistro: async (id) => { registros.delete(id); },
    },
    destino: {
      arquivoExiste: async () => false,
      enviarArquivo: async (caminho) => { subidos.push(caminho); },
      gravar: opcoes.gravar ?? (async (p) => { gravados.push(p); }),
    },
    uidAtual: () => (opcoes.uid === undefined ? 'mec1' : opcoes.uid),
    relogio: { agendar: () => 0, cancelar: () => undefined },
  });
  const poe = (p: RevisaoPendente) => { pendentes.set(`${p.registro.id}_${p.registro.revisao}`, p); };
  return { e, pendentes, poe, registros, arquivos, subidos, gravados };
}

test('fila: de cada registro só a revisão mais nova vai; fechada e enviada apaga a cópia do aparelho', async () => {
  const f = montarFila();
  const r1 = pronto({ revisao: 1 });
  const r2 = { ...comItem(pronto({ revisao: 2 }), itemCompleto('I1')), dataRetorno: HOJE };
  f.registros.set(r2.id, r2);
  f.poe(novaPendente(r1, autor, new Date(1)));
  f.poe(novaPendente(r2, autor, new Date(2)));
  await f.e.enviarPendentes();
  assert.deepEqual(f.gravados.map((p) => p.registro.revisao), [2]);
  assert.equal(f.pendentes.size, 0);
  assert.equal(f.registros.size, 0);
  assert.deepEqual(f.e.obterEstado(), { pendentes: 0, naoEnviadas: 0, enviando: false });
});

test('fila: só as revisões de quem está logado; sem login, nada', async () => {
  const f = montarFila({ uid: 'outro' });
  f.poe(novaPendente(pronto({ revisao: 1 }), autor, new Date()));
  await f.e.enviarPendentes();
  assert.equal(f.gravados.length, 0);
  assert.equal(f.pendentes.size, 1);
});

test('fila: já fechada no servidor vira recusa e não é tentada de novo; permissão negada continua com aviso', async () => {
  const fechada = montarFila({ gravar: async () => { throw new RevisaoJaFechada(); } });
  fechada.poe(novaPendente(pronto({ revisao: 1 }), autor, new Date()));
  await fechada.e.enviarPendentes();
  assert.equal([...fechada.pendentes.values()][0].recusa, MENSAGEM_JA_FECHADA);
  assert.deepEqual(fechada.e.obterEstado(), { pendentes: 0, naoEnviadas: 1, enviando: false });

  const negada = montarFila({ gravar: async () => { throw Object.assign(new Error('negado'), { code: 'permission-denied' }); } });
  negada.poe(novaPendente(pronto({ revisao: 1 }), autor, new Date()));
  await negada.e.enviarPendentes();
  const p = [...negada.pendentes.values()][0];
  assert.equal(p.aviso, MENSAGEM_SEM_PERMISSAO);
  assert.equal(p.tentativas, 1);
  assert.deepEqual(negada.e.obterEstado(), { pendentes: 1, naoEnviadas: 1, enviando: false });
});

test('fila: envia as fotos do aparelho antes do documento; foto que sumiu do aparelho falha sem gravar', async () => {
  const f = montarFila();
  const p = pendenteFechada();
  for (const a of arquivosParaEnvio(p)) f.arquivos.set(a.local, new Blob(['x']));
  f.poe(p);
  await f.e.enviarPendentes();
  assert.equal(f.subidos.length, 2);
  assert.equal(f.gravados.length, 1);

  const sem = montarFila();
  sem.poe(pendenteFechada());
  await sem.e.enviarPendentes();
  assert.equal(sem.gravados.length, 0);
  assert.equal([...sem.pendentes.values()][0].tentativas, 1);
});

// ------------------------------------------------------------------ Meu histórico do mecânico
test('Meu histórico: checklists e revisões de todos, resumidos, com os deste aparelho ainda não enviados', () => {
  const checklist = normalizarChecklist({
    tipo: 'chegada', item_frota_snapshot: { identificador: 'ABC1D23' }, motoristaOperador: { nome: 'João' }, criadoPor: { nome: 'Mecânico 2' },
    concluidoEm: new Date('2026-11-19T12:00:00Z'), totais: { ok: 70, avaria: 2, naoSeAplica: 2 },
  }, 'ck1');
  const lida = lerRevisao('rv1', montarDocumento(novaPendente(pronto({ id: 'rv1', revisao: 1 }), { uid: 'mec2', nome: 'Mecânico 2' }, new Date('2026-11-19T13:00:00Z')), null));
  const checklistPendente = {
    rascunho: { id: 'ck2', tipo: 'saida', veiculo: caminhao, respostas: {}, guincho: false, motorista: { uid: null, nome: 'Pedro' } },
    autor, concluidoEm: new Date('2026-11-19T14:00:00Z'),
  } as unknown as ChecklistPendente;
  const revisaoPendente = { ...novaPendente(pronto({ id: 'rv1', revisao: 2 }), autor, new Date('2026-11-19T15:00:00Z')) };
  const resumos = juntarResumos({ checklists: [checklist], checklistsPendentes: [checklistPendente], revisoes: [lida], revisoesPendentes: [revisaoPendente] });
  assert.deepEqual(resumos.map((r) => [r.chave, r.envio]), [
    ['checklist:ck2', 'aguardando'],
    ['revisao:rv1', 'alteração aguardando'],
    ['checklist:ck1', null],
  ]);
  assert.deepEqual(resumos[2].linhas, [
    { rotulo: 'Tipo', valor: 'Chegada' }, { rotulo: 'Motorista', valor: 'João' }, { rotulo: 'Por', valor: 'Mecânico 2' }, { rotulo: 'Avarias', valor: '2' },
  ]);
  assert.deepEqual(resumoDeRevisao(lida).linhas, [
    { rotulo: 'Tipo', valor: 'Corretiva' }, { rotulo: 'Situação', valor: 'Em manutenção' }, { rotulo: 'No mecânico', valor: 'desde 18/11/2026' }, { rotulo: 'Por', valor: 'Mecânico 2' },
  ]);
});
