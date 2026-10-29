import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const r = await import('../lib/fridayAutomacoesRegras.js');
const { colunas } = JSON.parse(readFileSync(new URL('./fixtures/gestao-obras-colunas.json', import.meta.url), 'utf8'));

// Colunas do quadro real GESTÃO DE OBRAS (fixture), pelo título.
const col = (titulo) => { const c = colunas.find(x => x.titulo === titulo); assert.ok(c, titulo); return c; };
const rotulo = (titulo, texto) => { const x = col(titulo).config.rotulos.find(o => o.texto === texto); assert.ok(x, `${titulo}: ${texto}`); return x.id; };
const item = (valores, extra = {}) => ({ id: 1, nome: 'FONTOURA XAVIER 122/2024', grupo_id: 10, criado_por: 'uid-criador', valores, ...extra });
const ARQUIVO = col('Arquivo').id, TIPO = col('Tipo de Obra').id;
const hoje = '2026-10-29';

test('"Quando Arquivo mudar para Conferir Documentação": só dispara na mudança dessa coluna para esse rótulo', () => {
  const g = { tipo: 'coluna_muda', coluna_id: ARQUIVO, para: [rotulo('Arquivo', 'Conferir Documentação')] };
  const conferir = item({ [ARQUIVO]: rotulo('Arquivo', 'Conferir Documentação') });
  assert.equal(r.gatilhoDispara(g, { acao: 'alterou', coluna_id: ARQUIVO }, conferir, colunas), true);
  assert.equal(r.gatilhoDispara(g, { acao: 'alterou', coluna_id: ARQUIVO }, item({ [ARQUIVO]: rotulo('Arquivo', 'Arquivar') }), colunas), false);
  assert.equal(r.gatilhoDispara(g, { acao: 'alterou', coluna_id: TIPO }, conferir, colunas), false, 'outra coluna');
  assert.equal(r.gatilhoDispara(g, { acao: 'moveu' }, conferir, colunas), false, 'outro evento');
});

test('"Quando Tipo de Obra mudar, e só se Tipo de Obra é Pública": condição de status', () => {
  const a = { modo: 'todas', gatilho: { tipo: 'coluna_muda', coluna_id: TIPO, para: [] }, condicoes: [{ alvo: TIPO, op: 'e', valor: [rotulo('Tipo de Obra', 'Pública')] }] };
  const publica = item({ [TIPO]: rotulo('Tipo de Obra', 'Pública') }), privada = item({ [TIPO]: rotulo('Tipo de Obra', 'Privada') });
  assert.equal(r.gatilhoDispara(a.gatilho, { acao: 'alterou', coluna_id: TIPO }, publica, colunas), true, 'qualquer mudança');
  assert.equal(r.condicoesValem(a, publica, colunas, hoje), true);
  assert.equal(r.condicoesValem(a, privada, colunas, hoje), false);
  assert.equal(r.condicoesValem(a, item({}), colunas, hoje), false, 'sem tipo');
  assert.equal(r.condicaoVale({ alvo: TIPO, op: 'vazio' }, item({}), colunas, hoje), true);
});

test('item criado e movido respeitam o grupo escolhido', () => {
  assert.equal(r.gatilhoDispara({ tipo: 'item_criado' }, { acao: 'criou' }, item({}), colunas), true);
  assert.equal(r.gatilhoDispara({ tipo: 'item_criado', grupo_id: 11 }, { acao: 'criou' }, item({}), colunas), false);
  assert.equal(r.gatilhoDispara({ tipo: 'item_movido', grupo_id: 10 }, { acao: 'moveu' }, item({}), colunas), true);
  assert.equal(r.gatilhoDispara({ tipo: 'item_movido' }, { acao: 'criou' }, item({}), colunas), false);
});

test('condições: grupo, modo "qualquer", lista, número, data e texto', () => {
  const sit = col('Situação').id, ano = col('Ano').id, fim = col('Fim').id, contrato = col('Nº Contrato').id;
  const it = item({ [sit]: ['2'], [ano]: 2024, [fim]: '2026-10-29', [contrato]: 'Contrato 122' });
  assert.equal(r.condicaoVale({ alvo: 'grupo', op: 'e', valor: [10] }, it, colunas, hoje), true);
  assert.equal(r.condicaoVale({ alvo: 'grupo', op: 'nao_e', valor: [10] }, it, colunas, hoje), false);
  assert.equal(r.condicaoVale({ alvo: sit, op: 'e', valor: ['2', '3'] }, it, colunas, hoje), true);
  assert.equal(r.condicaoVale({ alvo: sit, op: 'nao_e', valor: ['1'] }, it, colunas, hoje), true);
  assert.equal(r.condicaoVale({ alvo: ano, op: 'maior', valor: '2023' }, it, colunas, hoje), true);
  assert.equal(r.condicaoVale({ alvo: fim, op: 'hoje' }, it, colunas, hoje), true);
  assert.equal(r.condicaoVale({ alvo: fim, op: 'antes_hoje' }, it, colunas, hoje), false);
  assert.equal(r.condicaoVale({ alvo: contrato, op: 'contem', valor: 'contrato' }, it, colunas, hoje), true);
  const duas = [{ alvo: 'grupo', op: 'e', valor: [99] }, { alvo: ano, op: 'igual', valor: 2024 }];
  assert.equal(r.condicoesValem({ modo: 'todas', condicoes: duas }, it, colunas, hoje), false);
  assert.equal(r.condicoesValem({ modo: 'qualquer', condicoes: duas }, it, colunas, hoje), true);
  assert.equal(r.condicoesValem({ condicoes: [] }, it, colunas, hoje), true);
});

test('"data chegar": dia = data ± dias (fim do período por padrão)', () => {
  const fim = col('Fim').id;
  assert.equal(r.diaDoGatilhoData({ tipo: 'data_chega', coluna_id: fim, dias: -7 }, item({ [fim]: '2026-11-05' })), '2026-10-29');
  assert.equal(r.diaDoGatilhoData({ tipo: 'data_chega', coluna_id: fim, dias: 0 }, item({ [fim]: '2026-10-29 08:00' })), '2026-10-29');
  assert.equal(r.diaDoGatilhoData({ tipo: 'data_chega', coluna_id: 5, ponta: 'inicio', dias: 1 }, item({ 5: { inicio: '2026-12-31', fim: '2027-01-10' } })), '2027-01-01');
  assert.equal(r.diaDoGatilhoData({ tipo: 'data_chega', coluna_id: fim }, item({})), null);
});

test('valor das ações "mudar o valor"', () => {
  const pessoa = { id: 7, tipo: 'pessoa' }, data = { id: 8, tipo: 'data' }, texto = { id: 9, tipo: 'texto' };
  const it = item({ 7: ['uid-a'] });
  assert.equal(r.valorDefinido({ tipo: 'definir', valor: rotulo('Arquivo', 'Arquivar') }, col('Arquivo'), it, hoje), rotulo('Arquivo', 'Arquivar'));
  assert.deepEqual(r.valorDefinido({ tipo: 'definir', valor: ['0'], modo: 'adicionar' }, pessoa, it, hoje), ['uid-a', 'uid-criador'], 'quem criou o item');
  assert.deepEqual(r.valorDefinido({ tipo: 'definir', valor: ['uid-b'] }, pessoa, it, hoje), ['uid-b']);
  assert.equal(r.valorDefinido({ tipo: 'definir', valor: { relativo: 7 } }, data, it, hoje), '2026-11-05');
  assert.equal(r.valorDefinido({ tipo: 'definir', valor: null }, data, it, hoje), undefined, 'limpar');
  assert.equal(r.valorDefinido({ tipo: 'definir', valor: 'Revisar {nome}' }, texto, it, hoje), 'Revisar FONTOURA XAVIER 122/2024');
  assert.equal(r.valorDefinido({ tipo: 'definir', valor: false }, { id: 3, tipo: 'caixa' }, it, hoje), undefined);
});

test('webhook e avisos não são ações do executor; textos legíveis e chaves', () => {
  assert.equal(r.ACOES_SUPORTADAS.has('webhook'), false);
  assert.equal(r.ACOES_SUPORTADAS.has('notificar'), false);
  assert.equal(r.ACOES_SUPORTADAS.has('mover'), true);
  assert.equal(r.textoDoValor(col('Arquivo'), rotulo('Arquivo', 'Arquivar')), 'Arquivar');
  assert.equal(r.textoDoValor({ id: 1, tipo: 'pessoa' }, ['u1', 'u2'], u => u.toUpperCase()), 'U1, U2');
  assert.equal(r.chaveDoEvento(3, 99), 'atividade:99:3');
  assert.equal(r.chaveDaData(3, 5, '2026-10-29'), 'data:3:5:2026-10-29');
});
