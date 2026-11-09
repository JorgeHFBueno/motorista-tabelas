import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aplicarAlteracoesKm, analisarLeituras, chaveKm, comAlteracoes, ErroNormalizacaoKm, leiturasDeAtividade, leiturasDeCombustivel, lerNovoKm,
  MAX_ALTERACOES_POR_LOTE, montarLinhaDoTempo, referenciaPadrao, sugestaoKmUltimo, sugestaoPorDigitos,
  type AlteracaoKm, type ColecaoKm, type LeituraKm, type TransacaoKm,
} from '../src/utils/normalizacaoKm';

const dia = (i: number) => new Date(Date.UTC(2025, 0, 1 + i));
const leitura = (valor: unknown, i: number, data: Date | null = dia(i)): LeituraKm => ({
  key: chaveKm('atividades', `d${i}`, 'km'), collection: 'atividades', documentId: `d${i}`, field: 'km', data,
  valorBruto: valor, valor: typeof valor === 'number' ? valor : null, rotulo: 'Saída',
});
const rodar = (valores: unknown[], kmReferencia: number | null = null, mesmoHorario = false) =>
  analisarLeituras(valores.map((v, i) => leitura(v, i, mesmoHorario ? dia(0) : dia(i))), { kmReferencia });
const codigos = (l: { alertas: { codigo: string }[] }) => l.alertas.map((a) => a.codigo);

// ---- alertas (mesmos casos da ferramenta normalizacao-km-v2)

test('seis dígitos na referência não alerta leitura de seis dígitos', () => assert.deepEqual(codigos(rodar([184578], 201983)[0]), []));
test('sete dígitos recebem MAIS_DIGITOS_QUE_REFERENCIA', () => {
  const l = rodar([1845780], 201983)[0];
  assert.deepEqual(l.alertas, [{ codigo: 'MAIS_DIGITOS_QUE_REFERENCIA', digitosValor: 7, digitosReferencia: 6 }]);
  assert.equal(l.suspeito, true);
});
test('menos dígitos não é erro', () => assert.deepEqual(codigos(rodar([9999], 99999)[0]), []));
test('retrocesso local simples, inclusivo no limite da tolerância', () => assert.deepEqual(codigos(rodar([12, 11, 13], 20)[1]), ['RETROCESSO_LOCAL']));
test('região com dígitos a mais não gera retrocesso em cascata', () => {
  const r = rodar([1847740, 1840775, 184520], 201983);
  assert.deepEqual(codigos(r[0]), ['MAIS_DIGITOS_QUE_REFERENCIA']);
  assert.deepEqual(codigos(r[1]), ['MAIS_DIGITOS_QUE_REFERENCIA']);
  assert.deepEqual(codigos(r[2]), []);
});
test('retrocesso legítimo sugere a multiplicação que cabe entre os vizinhos', () => {
  const l = rodar([180430, 18127, 184473], 999999)[1];
  assert.deepEqual(l.alertas, [{ codigo: 'RETROCESSO_LOCAL' }, { codigo: 'SUGESTAO_MULTIPLICAR', multiplicador: 10, valor: 181270 }]);
  assert.equal(l.anterior, 180430);
  assert.equal(l.posterior, 184473);
});
test('leituras no mesmo horário não se comparam', () => assert.deepEqual(rodar([12, 11, 13], 20, true).flatMap(codigos), []));
test('valor inválido não quebra a análise', () => {
  const r = rodar([12, 'invalido', 13], 20);
  assert.equal(r.length, 3);
  assert.deepEqual(r[1].alertas, []);
});
test('bloco real de sete dígitos é marcado em todas as ocorrências', () => {
  const r = rodar([180710, 180711, 1807831, 1807831, 1808091, 1808091, 1812730], 201983);
  assert.deepEqual(r.map((l) => l.suspeito), [false, false, true, true, true, true, true]);
});

test('com as alterações preparadas, o corrigido sai dos sinalizados e o retrocesso escondido aparece', () => {
  const linha = [184000, 1845000, 18460, 184700].map((v, i) => leitura(v, i));
  const antes = analisarLeituras(linha, { kmReferencia: 403022 });
  assert.deepEqual(antes.map(codigos), [[], ['MAIS_DIGITOS_QUE_REFERENCIA'], [], []]);
  const preparadas = new Map<string, AlteracaoKm>([[linha[1].key, { key: linha[1].key, collection: 'atividades', documentId: 'd1', field: 'km', valorOriginal: 1845000, valorNovo: 184500 }]]);
  const depois = analisarLeituras(comAlteracoes(linha, preparadas), { kmReferencia: 403022 });
  assert.deepEqual(depois.map((l) => l.suspeito), [false, false, true, false]);
  assert.deepEqual(depois[2].alertas, [{ codigo: 'RETROCESSO_LOCAL' }, { codigo: 'SUGESTAO_MULTIPLICAR', multiplicador: 10, valor: 184600 }]);
  assert.equal(depois[1].valorBruto, 1845000);
});

// ---- sugestões

const comDigitos = (valor: number, digitosValor: number, digitosReferencia: number) =>
  sugestaoPorDigitos({ valor, alertas: [{ codigo: 'MAIS_DIGITOS_QUE_REFERENCIA', digitosValor, digitosReferencia }] });
test('sugestão tira os dígitos excedentes da direita, sem arredondar', () => {
  assert.equal(comDigitos(1807831, 7, 6), 180783);
  assert.equal(comDigitos(1807839, 7, 6), 180783);
  assert.equal(comDigitos(20130300000000, 14, 6), 201303);
  assert.equal(comDigitos(1234567, 7, 5), 12345);
});
test('sem excesso ou valor não inteiro, não sugere', () => {
  assert.equal(sugestaoPorDigitos({ valor: 184578, alertas: [] }), null);
  assert.equal(comDigitos(123456, 6, 6), null);
  assert.equal(comDigitos(1.5, 2, 1), null);
});
test('KM último maior que a última leitura (com as alterações preparadas) sugere a última leitura', () => {
  const linha = [leitura(180000, 0), leitura(1807831, 1)];
  const preparadas = new Map<string, AlteracaoKm>([[linha[1].key, { key: linha[1].key, collection: 'atividades', documentId: 'd1', field: 'km', valorOriginal: 1807831, valorNovo: 180783 }]]);
  assert.equal(sugestaoKmUltimo(1807831, linha, new Map()), null);
  assert.equal(sugestaoKmUltimo(1807831, linha, preparadas), 180783);
  assert.equal(sugestaoKmUltimo(180783, linha, preparadas), null);
  assert.equal(sugestaoKmUltimo(null, linha, preparadas), null);
});
test('referência padrão é a mediana das leituras inteiras: poucos valores inflados não a movem', () => {
  assert.equal(referenciaPadrao([180430, 18127, 184473, 1847831, 184710].map((v, i) => leitura(v, i))), 184473);
  assert.equal(referenciaPadrao([leitura('x', 0), leitura(1.5, 1)]), null);
  assert.equal(referenciaPadrao([]), null);
});
test('novo valor aceita só inteiro sem sinal', () => {
  assert.deepEqual(lerNovoKm(' 180783 '), { ok: true, valor: 180783 });
  for (const raw of ['', '-1', '1.5', '1,5', 'abc', '99999999999999999999']) assert.equal(lerNovoKm(raw).ok, false);
});

// ---- leitura dos documentos

test('atividade lê km; combustível lê quilometragem (PLACA) ou horímetro (EXTRA); sem medidor, nada', () => {
  const data = { toDate: () => dia(3) };
  assert.deepEqual(leiturasDeAtividade('a1', { tipo: 'saida', km: 100, data, motorista: { nome: 'Ana' } }).map((l) => [l.key, l.valor, l.rotulo, l.data?.getTime()]), [['atividades/a1#km', 100, 'Saída — Ana', dia(3).getTime()]]);
  assert.deepEqual(leiturasDeCombustivel('c1', { quilometragem: 200, horimetro: 7, data }, 'km').map((l) => l.key), ['03-combustivel/c1#quilometragem']);
  assert.deepEqual(leiturasDeCombustivel('c1', { quilometragem: 200, horimetro: 7, data }, 'h').map((l) => l.key), ['03-combustivel/c1#horimetro']);
  assert.deepEqual(leiturasDeCombustivel('c2', { semKm: 'Sem Odometro', quilometragem: null }, 'km'), []);
});
test('linha do tempo ordena por data e separa as sem data', () => {
  const { linha, semData } = montarLinhaDoTempo([leitura(3, 2), leitura(1, 0), leitura(9, 5, null)]);
  assert.deepEqual(linha.map((l) => l.valor), [1, 3]);
  assert.deepEqual(semData.map((l) => l.valor), [9]);
});

// ---- aplicação (Firestore falso em memória)

function falso(inicial: Record<string, Record<string, unknown>>, { mudarDepois }: { mudarDepois?: () => void } = {}) {
  const store = new Map(Object.entries(inicial).map(([k, v]) => [k, structuredClone(v)]));
  const stats = { transacoes: 0, updates: 0 };
  const ler = (c: ColecaoKm, id: string) => { const d = store.get(`${c}/${id}`); return d ? structuredClone(d) : null; };
  const executarTransacao = async <T,>(trabalho: (t: TransacaoKm) => Promise<T>): Promise<T> => {
    stats.transacoes += 1;
    const pendentes: [string, Record<string, number>][] = [];
    const resultado = await trabalho({
      get: async (c, id) => ler(c, id),
      update: (c, id, campos) => { pendentes.push([`${c}/${id}`, campos]); },
    });
    for (const [chave, campos] of pendentes) {
      stats.updates += 1;
      const d = store.get(chave)!;
      for (const [campo, valor] of Object.entries(campos)) {
        const partes = campo.split('.');
        let alvo = d as Record<string, unknown>;
        for (const p of partes.slice(0, -1)) alvo = alvo[p] as Record<string, unknown>;
        alvo[partes[partes.length - 1]] = valor;
      }
    }
    mudarDepois?.();
    return resultado;
  };
  return { store, stats, executarTransacao, lerDocumento: async (c: ColecaoKm, id: string) => ler(c, id) };
}
const alt = (collection: ColecaoKm, documentId: string, field: AlteracaoKm['field'], valorOriginal: number, valorNovo: number): AlteracaoKm =>
  ({ key: chaveKm(collection, documentId, field), collection, documentId, field, valorOriginal, valorNovo });
const aplicar = (f: ReturnType<typeof falso>, alteracoes: AlteracaoKm[]) =>
  aplicarAlteracoesKm({ veiculoId: 'v1', alteracoes, executarTransacao: f.executarTransacao, lerDocumento: f.lerDocumento });
const rejeita = (promessa: Promise<unknown>, codigo: string) => assert.rejects(promessa, (e: unknown) => e instanceof ErroNormalizacaoKm && e.codigo === codigo);

test('lote com atividade, combustível e KM último: uma transação, um update por documento, pós-validado', async () => {
  const f = falso({
    'atividades/a1': { item_frota_id: 'v1', km: 1807831 },
    '03-combustivel/c1': { item_frota_id: 'v1', quilometragem: 1808091 },
    'veiculos-v2/v1': { operacional: { quilometragemUltima: 1808091, dataUltimaAtualizacao: 1 } },
  });
  const r = await aplicar(f, [alt('atividades', 'a1', 'km', 1807831, 180783), alt('03-combustivel', 'c1', 'quilometragem', 1808091, 180809), alt('veiculos-v2', 'v1', 'operacional.quilometragemUltima', 1808091, 180809)]);
  assert.deepEqual(r, { alteracoes: 3, documentos: 3, reconciliado: false });
  assert.deepEqual(f.stats, { transacoes: 1, updates: 3 });
  assert.equal(f.store.get('atividades/a1')!.km, 180783);
  assert.deepEqual(f.store.get('veiculos-v2/v1')!.operacional, { quilometragemUltima: 180809, dataUltimaAtualizacao: 1 });
});
test('documento de outro veículo bloqueia o lote inteiro', async () => {
  const f = falso({ 'atividades/a1': { item_frota_id: 'v1', km: 10 }, 'atividades/a2': { item_frota_id: 'outro', km: 20 } });
  await rejeita(aplicar(f, [alt('atividades', 'a1', 'km', 10, 11), alt('atividades', 'a2', 'km', 20, 21)]), 'DOCUMENTO_DE_OUTRO_VEICULO');
  assert.equal(f.stats.updates, 0);
  await rejeita(aplicar(falso({ 'veiculos-v2/v2': { operacional: { quilometragemUltima: 5 } } }), [alt('veiculos-v2', 'v2', 'operacional.quilometragemUltima', 5, 4)]), 'DOCUMENTO_DE_OUTRO_VEICULO');
});
test('valor mudado desde a análise (um em cinquenta) não grava nada', async () => {
  const lote = Array.from({ length: 50 }, (_, i) => alt('atividades', `a${i}`, 'km', 100 + i, 1000 + i));
  const f = falso(Object.fromEntries(lote.map((a, i) => [`atividades/${a.documentId}`, { item_frota_id: 'v1', km: i === 36 ? 999 : a.valorOriginal }])));
  await rejeita(aplicar(f, lote), 'VALOR_ALTERADO_DESDE_ANALISE');
  assert.equal(f.stats.updates, 0);
});
test('resposta perdida: repetir o lote reconcilia sem gravar de novo; estado misto bloqueia', async () => {
  const f = falso({ 'atividades/a1': { item_frota_id: 'v1', km: 100 }, 'atividades/a2': { item_frota_id: 'v1', km: 200 } });
  await aplicar(f, [alt('atividades', 'a1', 'km', 100, 101)]);
  const r = await aplicar(f, [alt('atividades', 'a1', 'km', 100, 101)]);
  assert.equal(r.reconciliado, true);
  assert.equal(f.stats.updates, 1);
  await rejeita(aplicar(f, [alt('atividades', 'a1', 'km', 100, 101), alt('atividades', 'a2', 'km', 200, 201)]), 'ESTADO_MISTO');
  assert.equal(f.stats.updates, 1);
});
test('pós-validação divergente acusa erro', async () => {
  const f = falso({ 'atividades/a1': { item_frota_id: 'v1', km: 100 } }, { mudarDepois: () => { f.store.get('atividades/a1')!.km = 5; } });
  await rejeita(aplicar(f, [alt('atividades', 'a1', 'km', 100, 101)]), 'POS_VALIDACAO_FALHOU');
});
test('validação do lote: vazio, limite, repetido, campo fora da lista, key, valores', async () => {
  const f = falso({});
  await rejeita(aplicar(f, []), 'NENHUMA_ALTERACAO');
  await rejeita(aplicar(f, Array.from({ length: MAX_ALTERACOES_POR_LOTE + 1 }, (_, i) => alt('atividades', `a${i}`, 'km', 1, 2))), 'LIMITE_EXCEDIDO');
  await rejeita(aplicar(f, [alt('atividades', 'a1', 'km', 1, 2), alt('atividades', 'a1', 'km', 1, 2)]), 'ALTERACAO_DUPLICADA');
  await rejeita(aplicar(f, [alt('atividades', 'a1', 'quilometragem', 1, 2)]), 'CAMPO_NAO_PERMITIDO');
  await rejeita(aplicar(f, [{ ...alt('atividades', 'a1', 'km', 1, 2), key: 'atividades/outro#km' }]), 'KEY_DIVERGENTE');
  for (const novo of [1, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await rejeita(aplicar(f, [alt('atividades', 'a1', 'km', 1, novo)]), 'VALOR_INVALIDO');
  assert.equal(f.stats.transacoes, 0);
});
