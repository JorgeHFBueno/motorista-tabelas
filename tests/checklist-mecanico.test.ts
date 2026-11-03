import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CATALOGOS, PARTES, catalogoParaCategoria, itensDoCatalogo, todosOsItens, type CatalogoId,
} from '../src/features/checklist-mecanico/domain/catalogo';
import {
  comResposta, gerarIdChecklist, novoRascunho, resolverMotorista, type ChecklistFoto, type ChecklistPendente, type ChecklistRascunho,
  type ChecklistVeiculo,
} from '../src/features/checklist-mecanico/domain/rascunho';
import {
  aplicarNaoSeAplicaLembrados, comMedidor, itensAtivos, itensNaoSeAplica, naoSeAplicaDoUltimo, paginaDaPrimeiraPendencia,
  partesDoRascunho, pendencias, podeConcluir, progresso, reativarItem, totais, validarMedidor,
} from '../src/features/checklist-mecanico/domain/regras';
import {
  arquivosParaEnvio, caminhoAssinatura, deveAtualizarMedidor, fotosParaEnvio, montarDocumento,
} from '../src/features/checklist-mecanico/domain/documento';
import {
  COMPRIMENTO_MINIMO_ASSINATURA, comprimentoDosTracos, dataOriginalDaFoto, limitarLado, medidasAssinatura,
  proximaCompressao, tamanhoFonteCarimbo, textoCarimbo,
} from '../src/features/checklist-mecanico/domain/foto';

const caminhao: ChecklistVeiculo = { id: 'vv1', categoria: 'PLACA', identificador: 'ABC1D23', nome: 'Caminhão 1', medidorUltimo: 125000 };
const carregadeira: ChecklistVeiculo = { id: 'vm1', categoria: 'EXTRA', identificador: 'CARREGADEIRA', nome: 'Carregadeira', medidorUltimo: 8700 };

const foto = (arquivo: string, extra: Partial<ChecklistFoto> = {}): ChecklistFoto => ({
  arquivo, miniatura: `${arquivo}-mini`, origem: 'camera', capturadaEm: new Date('2026-11-02T10:00:00Z'),
  bytes: 900000, largura: 2048, altura: 1536, ...extra,
});

/** Todos os itens que valem marcados como OK, com o necessário para concluir. */
function completo(r: ChecklistRascunho): ChecklistRascunho {
  let atual: ChecklistRascunho = { ...r, medidor: r.veiculo.medidorUltimo, motorista: { uid: 'uid-user', nome: 'User' } };
  for (const item of itensDoCatalogo(catalogoParaCategoria(r.veiculo.categoria), r.guincho)) {
    atual = comResposta(atual, item.id, { status: 'ok', observacao: item.campo ? 'informado' : '', fotos: [] });
  }
  return atual;
}

// ------------------------------------------------------------------ catálogo (gerado do Dart)
test('catálogo: 74 itens em Veículos e 75 em Máquinas, 4 de guincho em cada', () => {
  const conta = (c: CatalogoId) => ({
    total: todosOsItens(c).length,
    guincho: todosOsItens(c).filter((i) => i.parte === 'guincho').length,
    campo: todosOsItens(c).filter((i) => i.campo != null).length,
    semGuincho: itensDoCatalogo(c, false).length,
  });
  assert.deepEqual(conta('veiculos'), { total: 74, guincho: 4, campo: 0, semGuincho: 70 });
  assert.deepEqual(conta('maquinas'), { total: 75, guincho: 4, campo: 6, semGuincho: 71 });
  assert.equal(CATALOGOS.veiculos.versao, '1');
  assert.equal(CATALOGOS.maquinas.versao, '1');
});

test('catálogo: ids únicos, partes conhecidas e laterais montadas como no Dart', () => {
  const partes = new Set(PARTES.map((p) => p.id));
  for (const c of ['veiculos', 'maquinas'] as const) {
    const ids = todosOsItens(c).map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, c);
    for (const item of todosOsItens(c)) {
      assert.ok(partes.has(item.parte), item.id);
      assert.ok(item.id.startsWith(`${item.parte}_`), item.id);
    }
  }
  const veiculos = todosOsItens('veiculos').map((i) => i.id);
  assert.equal(veiculos[0], 'frente_farol_esquerdo');
  assert.ok(veiculos.includes('lateral_esquerda_pneu_truck'));
  assert.ok(veiculos.includes('lateral_direita_cabine_suplementar'));
  assert.deepEqual(veiculos.slice(-4), ['guincho_sirene', 'guincho_oleo', 'guincho_vazamentos', 'guincho_horimetro']);
  const campos = todosOsItens('maquinas').filter((i) => i.campo).map((i) => `${i.id}:${i.campo}`);
  assert.deepEqual(campos, [
    'lateral_esquerda_pneu_frente:Nº do pneu', 'lateral_esquerda_pneu_tras:Nº do pneu',
    'lateral_direita_pneu_frente:Nº do pneu', 'lateral_direita_pneu_tras:Nº do pneu',
    'parte_mecanica_pneu_suplente:Nº do pneu', 'parte_mecanica_extintor_validade:Validade do extintor',
  ]);
  assert.deepEqual(PARTES.map((p) => p.id), ['frente', 'lateral_esquerda', 'lateral_direita', 'traseira', 'parte_mecanica', 'guincho']);
});

test('catálogo pela categoria: EXTRA → máquinas, o resto → veículos', () => {
  assert.equal(catalogoParaCategoria('EXTRA'), 'maquinas');
  assert.equal(catalogoParaCategoria(' extra '), 'maquinas');
  assert.equal(catalogoParaCategoria('PLACA'), 'veiculos');
  assert.equal(catalogoParaCategoria(''), 'veiculos');
});

// ------------------------------------------------------------------ id
test('id: 20 caracteres de A–Z a–z 0–9', () => {
  for (let i = 0; i < 50; i++) assert.match(gerarIdChecklist(), /^[A-Za-z0-9]{20}$/);
  // Bytes ≥ 248 são descartados (sem viés); 0 → 'A', 61 → '9', 62 → 'A'.
  const bytes = () => new Uint8Array([255, 0, 61, 62, 248, ...Array(27).fill(1)]);
  assert.equal(gerarIdChecklist(bytes), `A9A${'B'.repeat(17)}`);
});

// ------------------------------------------------------------------ pendências e medidor
test('medidor: obrigatório, não negativo, igual aceito, menor só com a confirmação', () => {
  assert.equal(validarMedidor(null, { ultimo: 100, horimetro: false }), 'Informe o KM.');
  assert.equal(validarMedidor(null, { ultimo: 100, horimetro: true }), 'Informe o horímetro.');
  assert.equal(validarMedidor(-1, { ultimo: null, horimetro: false }), 'O KM não pode ser negativo.');
  assert.equal(validarMedidor(100, { ultimo: 100, horimetro: false }), null);
  assert.equal(validarMedidor(101, { ultimo: 100, horimetro: false }), null);
  assert.equal(validarMedidor(0, { ultimo: null, horimetro: false }), null);
  assert.match(validarMedidor(99, { ultimo: 100, horimetro: false }) ?? '', /menor que o último registrado \(100\)/);
  assert.equal(validarMedidor(99, { ultimo: 100, horimetro: false, corrigido: true }), null);
});

test('medidor: mudar o valor desfaz a confirmação', () => {
  const r = { ...novoRascunho({ tipo: 'saida', veiculo: caminhao, id: 'X' }), medidor: 1000, medidorCorrigido: true };
  assert.equal(comMedidor(r, 1000).medidorCorrigido, true);
  assert.equal(comMedidor(r, 1001).medidorCorrigido, false);
  assert.equal(comMedidor(r, null).medidorCorrigido, false);
});

test('pendências: medidor, motorista e status de cada item que vale', () => {
  const r = novoRascunho({ tipo: 'saida', veiculo: caminhao, id: 'X' });
  const p = pendencias(r);
  assert.deepEqual(p.slice(0, 2), [
    { mensagem: 'Informe o KM.', itemId: null },
    { mensagem: 'Informe o motorista/operador.', itemId: null },
  ]);
  assert.equal(p.length, 2 + 70);
  assert.ok(p.slice(2).every((x) => x.mensagem === 'Escolha OK, Avaria ou Não se aplica.'));
  assert.equal(pendencias({ ...r, guincho: true }).length, 2 + 74);
  assert.equal(pendencias({ ...r, motorista: { uid: null, nome: '   ' } }).length, 2 + 70);
  assert.ok(podeConcluir(completo(r)));
});

test('pendências: avaria pede descrição e foto; item com campo pede a observação em OK', () => {
  const base = completo(novoRascunho({ tipo: 'chegada', veiculo: carregadeira, id: 'X' }));
  const avaria = comResposta(base, 'frente_farolete', { status: 'avaria', observacao: ' ', fotos: [] });
  assert.deepEqual(pendencias(avaria), [
    { mensagem: 'Descreva a avaria.', itemId: 'frente_farolete' },
    { mensagem: 'Inclua ao menos uma foto da avaria.', itemId: 'frente_farolete' },
  ]);
  const avariaOk = comResposta(base, 'frente_farolete', { status: 'avaria', observacao: 'Quebrado', fotos: [foto('f1')] });
  assert.deepEqual(pendencias(avariaOk), []);
  const pneu = comResposta(base, 'lateral_direita_pneu_tras', { status: 'ok', observacao: '', fotos: [] });
  assert.deepEqual(pendencias(pneu), [{ mensagem: 'Informe na observação: Nº do pneu.', itemId: 'lateral_direita_pneu_tras' }]);
  // Avaria em item com campo: as mensagens da avaria bastam (como no app).
  const pneuAvaria = comResposta(base, 'lateral_direita_pneu_tras', { status: 'avaria', observacao: '', fotos: [foto('f2')] });
  assert.deepEqual(pendencias(pneuAvaria), [{ mensagem: 'Descreva a avaria.', itemId: 'lateral_direita_pneu_tras' }]);
  const naoSeAplica = comResposta(base, 'lateral_direita_pneu_tras', { status: 'nao_se_aplica', observacao: '', fotos: [] });
  assert.deepEqual(pendencias(naoSeAplica), []);
});

test('progresso e totais contam só os itens que valem (guincho só ligado)', () => {
  let r = completo(novoRascunho({ tipo: 'saida', veiculo: caminhao, id: 'X' }));
  r = comResposta(r, 'guincho_oleo', { status: 'avaria', observacao: 'x', fotos: [] });
  r = comResposta(r, 'frente_farolete', { status: 'nao_se_aplica', observacao: '', fotos: [] });
  assert.deepEqual(progresso(r), { respondidos: 70, total: 70 });
  assert.deepEqual(totais(r), { ok: 69, avaria: 0, nao_se_aplica: 1 });
  const comGuincho = { ...r, guincho: true };
  assert.deepEqual(progresso(comGuincho), { respondidos: 71, total: 74 });
  assert.deepEqual(totais(comGuincho), { ok: 69, avaria: 1, nao_se_aplica: 1 });
});

// ------------------------------------------------------------------ "Não se aplica"
test('"Não se aplica" lembrado: último por concluidoEm, só ids do catálogo, sem sobrescrever respostas', () => {
  const ts = (iso: string) => ({ toDate: () => new Date(iso) });
  const docs = [
    { concluidoEm: ts('2026-10-30T10:00:00Z'), itens: [{ itemId: 'frente_farolete', status: 'nao_se_aplica' }] },
    {
      concluidoEm: ts('2026-11-01T10:00:00Z'),
      itens: [
        { itemId: 'traseira_sirene_re', status: 'nao_se_aplica' },
        { itemId: 'frente_farol_direito', status: 'nao_se_aplica' },
        { itemId: 'item_que_saiu_do_catalogo', status: 'nao_se_aplica' },
        { itemId: 'frente_farol_esquerdo', status: 'ok' },
      ],
    },
    { concluidoEm: null, itens: [{ itemId: 'frente_para_choque', status: 'nao_se_aplica' }] },
    { concluidoEm: new Date('2026-10-31T10:00:00Z'), itens: [{ itemId: 'frente_pisca_direito', status: 'nao_se_aplica' }] },
  ];
  const lembrados = naoSeAplicaDoUltimo(docs);
  assert.deepEqual([...lembrados].sort(), ['frente_farol_direito', 'item_que_saiu_do_catalogo', 'traseira_sirene_re']);
  assert.deepEqual([...naoSeAplicaDoUltimo([])], []);
  assert.deepEqual([...naoSeAplicaDoUltimo([{ concluidoEm: '2026-11-01T00:00:00Z', itens: 'x' }])], []);

  let r = novoRascunho({ tipo: 'saida', veiculo: caminhao, id: 'X' });
  r = comResposta(r, 'frente_farol_direito', { status: 'ok', observacao: '', fotos: [] });
  r = aplicarNaoSeAplicaLembrados(r, lembrados);
  assert.equal(r.respostas.traseira_sirene_re.status, 'nao_se_aplica');
  assert.equal(r.respostas.frente_farol_direito.status, 'ok');
  assert.equal(r.respostas.item_que_saiu_do_catalogo, undefined);
  assert.deepEqual(itensNaoSeAplica(r).map((i) => i.id), ['traseira_sirene_re']);
  assert.equal(itensAtivos(r).length, 69);
});

test('reativar tira o status e mantém observação e fotos', () => {
  let r = novoRascunho({ tipo: 'saida', veiculo: caminhao, id: 'X' });
  r = comResposta(r, 'frente_farolete', { status: 'nao_se_aplica', observacao: 'sem farolete', fotos: [foto('f1')] });
  const reativado = reativarItem(r, 'frente_farolete').respostas.frente_farolete;
  assert.deepEqual(reativado, { status: null, observacao: 'sem farolete', fotos: [foto('f1')] });
});

// ------------------------------------------------------------------ documento
function pendente(): ChecklistPendente {
  let r = completo(novoRascunho({ tipo: 'chegada', veiculo: carregadeira, id: 'AbCdEfGhIjKlMnOpQrSt', agora: new Date('2026-11-02T09:00:00Z') }));
  r = { ...r, guincho: true, medidor: 8600, medidorCorrigido: true };
  for (const item of ['guincho_sirene', 'guincho_oleo', 'guincho_vazamentos', 'guincho_horimetro']) {
    r = comResposta(r, item, { status: 'ok', observacao: '', fotos: [] });
  }
  r = comResposta(r, 'frente_farolete', { status: 'avaria', observacao: '  Lente quebrada ', fotos: [foto('a'), foto('b', { origem: 'galeria', capturadaEm: null })] });
  r = comResposta(r, 'traseira_sirene_re', { status: 'nao_se_aplica', observacao: '   ', fotos: [] });
  r = comResposta(r, 'lateral_esquerda_pneu_frente', { status: 'ok', observacao: 'Pneu 123', fotos: [foto('c')] });
  r = { ...r, assinatura: { ausente: false, arquivo: 'assinatura-local', em: new Date('2026-11-02T09:30:00Z'), bytes: 31000, largura: 1200, altura: 560 } };
  return { rascunho: r, autor: { uid: 'uid-mecanico', nome: 'Mecânico' }, concluidoEm: new Date('2026-11-02T09:31:00Z'), enviados: [], tentativas: 0, proximaTentativa: null };
}

test('documento: campos do contrato checklists-v2, campo a campo', () => {
  const p = pendente();
  const SERVIDOR = Symbol('serverTimestamp');
  const doc = montarDocumento(p, SERVIDOR);
  const { itens, ...cabecalho } = doc as { itens: Record<string, unknown>[] } & Record<string, unknown>;
  assert.deepEqual(cabecalho, {
    schemaVersion: 1,
    tipo: 'chegada',
    catalogo: 'maquinas',
    catalogoVersao: '1',
    item_frota_id: 'vm1',
    item_frota_snapshot: { categoria: 'EXTRA', identificador: 'CARREGADEIRA', nome: 'Carregadeira' },
    medidor: { tipo: 'horimetro', valor: 8600, anterior: 8700, corrigido: true },
    guincho: true,
    motoristaOperador: { uid: 'uid-user', nome: 'User' },
    assinatura: {
      status: 'assinada', path: 'checklists-v2/AbCdEfGhIjKlMnOpQrSt/assinatura_1.jpg', em: new Date('2026-11-02T09:30:00Z'),
      bytes: 31000, largura: 1200, altura: 560,
    },
    criadoPor: { uid: 'uid-mecanico', nome: 'Mecânico' },
    criadoPorUid: 'uid-mecanico',
    iniciadoEm: new Date('2026-11-02T09:00:00Z'),
    concluidoEm: new Date('2026-11-02T09:31:00Z'),
    registradoEm: SERVIDOR,
    totais: { ok: 73, avaria: 1, naoSeAplica: 1 },
  });
  assert.equal(itens.length, 75);
  assert.deepEqual(itens.map((i) => i.itemId), todosOsItens('maquinas').map((i) => i.id));
  const porId = Object.fromEntries(itens.map((i) => [i.itemId, i]));
  assert.deepEqual(porId.frente_farolete, {
    itemId: 'frente_farolete', parte: 'frente', titulo: 'Farolete', status: 'avaria', observacao: 'Lente quebrada',
    fotos: [
      {
        path: 'checklists-v2/AbCdEfGhIjKlMnOpQrSt/frente_farolete_1.jpg', miniatura: 'checklists-v2/AbCdEfGhIjKlMnOpQrSt/miniaturas/frente_farolete_1.jpg',
        origem: 'camera', capturadaEm: new Date('2026-11-02T10:00:00Z'), bytes: 900000, largura: 2048, altura: 1536,
      },
      {
        path: 'checklists-v2/AbCdEfGhIjKlMnOpQrSt/frente_farolete_2.jpg', miniatura: 'checklists-v2/AbCdEfGhIjKlMnOpQrSt/miniaturas/frente_farolete_2.jpg',
        origem: 'galeria', capturadaEm: null, bytes: 900000, largura: 2048, altura: 1536,
      },
    ],
  });
  assert.equal(porId.traseira_sirene_re.observacao, null);
  assert.equal(porId.lateral_esquerda_pneu_frente.observacao, 'Pneu 123');
  assert.equal(porId.guincho_oleo.parte, 'guincho');
});

test('documento: motorista digitado e motorista ausente', () => {
  const p = pendente();
  const em = new Date('2026-11-02T09:30:00Z');
  const r = { ...p.rascunho, motorista: { uid: null, nome: 'Terceiro' }, assinatura: { ausente: true as const, motivo: 'Em viagem', em } };
  const doc = montarDocumento({ ...p, rascunho: r }, null);
  assert.deepEqual(doc.motoristaOperador, { uid: null, nome: 'Terceiro' });
  assert.deepEqual(doc.assinatura, { status: 'ausente', motivo: 'Em viagem', em });
  assert.equal((doc.medidor as { tipo: string }).tipo, 'horimetro');
  const veiculo = montarDocumento({ ...p, rascunho: { ...r, veiculo: caminhao, guincho: false } }, null);
  assert.equal((veiculo.medidor as { tipo: string }).tipo, 'km');
  assert.equal(veiculo.catalogo, 'veiculos');
});

test('arquivos: foto e miniatura de cada foto na ordem dos itens, depois a assinatura; sem assinatura quando ausente', () => {
  const p = pendente();
  assert.deepEqual(fotosParaEnvio(p).map((f) => f.caminhoFoto), [
    'checklists-v2/AbCdEfGhIjKlMnOpQrSt/frente_farolete_1.jpg',
    'checklists-v2/AbCdEfGhIjKlMnOpQrSt/frente_farolete_2.jpg',
    'checklists-v2/AbCdEfGhIjKlMnOpQrSt/lateral_esquerda_pneu_frente_1.jpg',
  ]);
  const arquivos = arquivosParaEnvio(p);
  assert.equal(arquivos.length, 7);
  assert.deepEqual(arquivos.slice(0, 2), [
    { caminho: 'checklists-v2/AbCdEfGhIjKlMnOpQrSt/frente_farolete_1.jpg', local: 'a' },
    { caminho: 'checklists-v2/AbCdEfGhIjKlMnOpQrSt/miniaturas/frente_farolete_1.jpg', local: 'a-mini' },
  ]);
  assert.deepEqual(arquivos.at(-1), { caminho: caminhoAssinatura('AbCdEfGhIjKlMnOpQrSt'), local: 'assinatura-local' });
  const ausente = { ...p, rascunho: { ...p.rascunho, assinatura: { ausente: true as const, motivo: 'x', em: new Date() } } };
  assert.equal(arquivosParaEnvio(ausente).length, 6);
  // Fotos de um item de guincho com o guincho desligado não vão.
  const semGuincho = { ...p, rascunho: { ...comResposta(p.rascunho, 'guincho_oleo', { status: 'ok', observacao: '', fotos: [foto('g')] }), guincho: false } };
  assert.equal(fotosParaEnvio(semGuincho).length, 3);
});

test('medidor na transação: sobe sempre, baixa só com a correção, nada sem veículo ou igual', () => {
  const caso = (atual: number | null, valor: number | null, corrigido = false, veiculoExiste = true) =>
    deveAtualizarMedidor({ veiculoExiste, atual, valor, corrigido });
  assert.equal(caso(100, 101), true);
  assert.equal(caso(null, 5), true);
  assert.equal(caso(100, 100), false);
  assert.equal(caso(100, 100, true), false);
  assert.equal(caso(100, 99), false);
  assert.equal(caso(100, 99, true), true);
  assert.equal(caso(100, 101, false, false), false);
  assert.equal(caso(100, null), false);
});

// ------------------------------------------------------------------ telas
test('motorista: nome da lista sem acento nem caixa vira o cadastrado; outro nome fica sem uid; vazio é null', () => {
  const lista = [{ uid: 'u1', nome: 'João Silva' }, { uid: 'u2', nome: 'Maria' }];
  assert.deepEqual(resolverMotorista('  joao silva ', lista), { uid: 'u1', nome: 'João Silva' });
  assert.deepEqual(resolverMotorista('Fulano', lista), { uid: null, nome: 'Fulano' });
  assert.equal(resolverMotorista('   ', lista), null);
});

test('páginas: Dados e uma por parte (Guincho só ligado); primeira pendência leva à página dela', () => {
  const r = novoRascunho({ tipo: 'saida', veiculo: caminhao, id: 'X' });
  assert.deepEqual(partesDoRascunho(r), ['frente', 'lateral_esquerda', 'lateral_direita', 'traseira', 'parte_mecanica']);
  assert.deepEqual(partesDoRascunho({ ...r, guincho: true }).at(-1), 'guincho');
  assert.equal(paginaDaPrimeiraPendencia(r), 0);
  const base = completo(r);
  assert.equal(paginaDaPrimeiraPendencia(base), null);
  assert.equal(paginaDaPrimeiraPendencia(comResposta(base, 'traseira_sirene_re', { status: null, observacao: '', fotos: [] })), 4);
  assert.equal(paginaDaPrimeiraPendencia({ ...base, guincho: true }), 6);
  assert.equal(paginaDaPrimeiraPendencia({ ...base, motorista: null }), 0);
});

// ------------------------------------------------------------------ fotos e assinatura
test('carimbo: data da câmera, "(galeria)" na galeria com data, "foto da galeria" sem data', () => {
  const d = new Date(2026, 10, 2, 9, 5, 30);
  assert.equal(textoCarimbo('camera', d), '02/11/2026 09:05');
  assert.equal(textoCarimbo('galeria', d), '02/11/2026 09:05 (galeria)');
  assert.equal(textoCarimbo('galeria', null), 'foto da galeria');
});

test('foto: lado maior até 2048 e miniatura 480, na proporção; compressão 85→75→65→55, depois reduz e volta a 75', () => {
  assert.deepEqual(limitarLado(4032, 3024, 2048), { largura: 2048, altura: 1536 });
  assert.deepEqual(limitarLado(3024, 4032, 2048), { largura: 1536, altura: 2048 });
  assert.deepEqual(limitarLado(1200, 900, 2048), { largura: 1200, altura: 900 });
  assert.deepEqual(limitarLado(2048, 1536, 480), { largura: 480, altura: 360 });
  const sequencia = [];
  let q = 85;
  for (let i = 0; i < 5; i++) {
    const p = proximaCompressao(q);
    sequencia.push(`${p.qualidade}${p.reduzir ? '↓' : ''}`);
    q = p.qualidade;
  }
  assert.deepEqual(sequencia, ['75', '65', '55', '75↓', '65']);
  assert.equal(tamanhoFonteCarimbo(2048), 48);
  assert.equal(tamanhoFonteCarimbo(1199), 24);
});

/** JPEG mínimo com EXIF: IFD0 com DateTime e o ponteiro do Exif IFD com DateTimeOriginal. */
function jpegComExif({ original, data, bigEndian = false }: { original?: string; data?: string; bigEndian?: boolean }): Uint8Array {
  const tiff: number[] = [];
  const u16 = (v: number) => (bigEndian ? [v >> 8, v & 255] : [v & 255, v >> 8]);
  const u32 = (v: number) => (bigEndian ? [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255] : [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24]);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);
  // Layout: header(8) | IFD0 (2 + 2*12 + 4 = 30) | Exif IFD (2 + 12 + 4 = 18) | strings
  const ifd0 = 8;
  const exifIfd = ifd0 + 30;
  const textoData = exifIfd + 18;
  const textoOriginal = textoData + 20;
  tiff.push(...(bigEndian ? [0x4d, 0x4d] : [0x49, 0x49]), ...u16(42), ...u32(ifd0));
  tiff.push(...u16(2));
  tiff.push(...u16(0x0132), ...u16(2), ...u32(20), ...u32(textoData));
  tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfd));
  tiff.push(...u32(0));
  tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(textoOriginal), ...u32(0));
  tiff.push(...ascii((data ?? '').padEnd(19, ' ')), ...ascii((original ?? '').padEnd(19, ' ')));
  const app1 = [...ascii('Exif'), 0, ...tiff];
  const tamanho = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, tamanho >> 8, tamanho & 255, ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
}

test('EXIF: DateTimeOriginal, depois DateTime; anos antes de 1990 e arquivos sem EXIF ficam sem data', () => {
  assert.deepEqual(dataOriginalDaFoto(jpegComExif({ original: '2026:10:30 14:22:05', data: '2026:11:01 08:00:00' })), new Date(2026, 9, 30, 14, 22, 5));
  assert.deepEqual(dataOriginalDaFoto(jpegComExif({ original: '2026:10:30 14:22:05', bigEndian: true })), new Date(2026, 9, 30, 14, 22, 5));
  assert.deepEqual(dataOriginalDaFoto(jpegComExif({ data: '2025:01:02 03:04:05' })), new Date(2025, 0, 2, 3, 4, 5));
  assert.equal(dataOriginalDaFoto(jpegComExif({ original: '1980:01:01 00:00:00' })), null);
  assert.equal(dataOriginalDaFoto(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])), null);
  assert.equal(dataOriginalDaFoto(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
  assert.equal(dataOriginalDaFoto(jpegComExif({ original: '2026:10:30 14:22:05' }).slice(0, 40)), null);
});

test('assinatura: comprimento dos traços (mínimo 60) e JPEG de 1200 px na proporção da área', () => {
  assert.equal(comprimentoDosTracos([[{ x: 0, y: 0 }, { x: 30, y: 40 }], [{ x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 10, y: 0 }]]), 60);
  assert.ok(comprimentoDosTracos([[{ x: 0, y: 0 }, { x: 59, y: 0 }]]) < COMPRIMENTO_MINIMO_ASSINATURA);
  assert.deepEqual(medidasAssinatura({ largura: 600, altura: 280 }), { largura: 1200, altura: 560, escala: 2, espessura: 6 });
  assert.equal(medidasAssinatura({ largura: 2400, altura: 100 }).espessura, 2);
  assert.equal(medidasAssinatura({ largura: 100, altura: 50 }).espessura, 12);
});
