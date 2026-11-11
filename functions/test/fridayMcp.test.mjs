import { test } from 'node:test';
import assert from 'node:assert/strict';

const m = await import('../lib/fridayMcp.js');

// MCP da API do Friday: só o protocolo, com um executor falso. Só dados fictícios.
const chamadas = [];
const contexto = (escrita, executar = async (nome, args) => { chamadas.push({ nome, args }); return { ok: true, nome }; }) => ({
  escrita, executar, mensagemDeErro: e => (e instanceof Error ? e.message : String(e)),
});
const pedido = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });

test('initialize: devolve a versão pedida quando aceita; senão, a mais nova', async () => {
  const r = await m.responderMcp(pedido(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } }), contexto(false));
  assert.equal(r.id, 1);
  assert.equal(r.result.protocolVersion, '2025-06-18');
  assert.deepEqual(r.result.capabilities, { tools: { listChanged: false } });
  assert.equal(r.result.serverInfo.name, 'friday');
  assert.match(r.result.instructions, /pessoa da chave/);
  const outra = await m.responderMcp(pedido(2, 'initialize', { protocolVersion: '1999-01-01' }), contexto(false));
  assert.equal(outra.result.protocolVersion, m.VERSOES_MCP[0]);
});

test('notificação e resposta do cliente não têm resposta (o HTTP devolve 202)', async () => {
  assert.equal(await m.responderMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, contexto(false)), null);
  assert.equal(await m.responderMcp({ jsonrpc: '2.0', id: 7, result: {} }, contexto(false)), null);
});

test('pedido inválido, método desconhecido e ping', async () => {
  assert.equal((await m.responderMcp('texto', contexto(false))).error.code, -32600);
  assert.equal((await m.responderMcp({ id: 1, method: 'ping' }, contexto(false))).error.code, -32600);
  assert.equal((await m.responderMcp(pedido(3, 'resources/list'), contexto(false))).error.code, -32601);
  assert.deepEqual((await m.responderMcp(pedido(4, 'ping'), contexto(false))).result, {});
  assert.equal((await m.responderMcp([], contexto(false))).error.code, -32600);
});

test('tools/list: chave só de consulta não vê as ferramentas de escrita', async () => {
  const leitura = (await m.responderMcp(pedido(1, 'tools/list'), contexto(false))).result.tools.map(t => t.name);
  const escrita = (await m.responderMcp(pedido(1, 'tools/list'), contexto(true))).result.tools.map(t => t.name);
  assert.deepEqual(leitura, ['quem_sou_eu', 'listar_quadros', 'ler_quadro', 'buscar_itens', 'listar_arquivos', 'baixar_arquivo']);
  assert.deepEqual(escrita, [...leitura, 'gravar_valor', 'criar_item', 'criar_subitem', 'publicar_atualizacao']);
  const tools = (await m.responderMcp(pedido(1, 'tools/list'), contexto(true))).result.tools;
  for (const t of tools) {
    assert.equal(t.inputSchema.type, 'object', t.name);
    assert.equal('escrita' in t, false, t.name);
    assert.equal(t.annotations.readOnlyHint, leitura.includes(t.name), t.name);
  }
});

test('tools/call: executa com os argumentos e devolve o resultado em texto JSON', async () => {
  chamadas.length = 0;
  const r = await m.responderMcp(pedido(5, 'tools/call', { name: 'buscar_itens', arguments: { texto: 'coqueiros', quadro: 12 } }), contexto(false));
  assert.deepEqual(chamadas, [{ nome: 'buscar_itens', args: { texto: 'coqueiros', quadro: 12 } }]);
  assert.equal(r.result.isError, undefined);
  assert.deepEqual(JSON.parse(r.result.content[0].text), { ok: true, nome: 'buscar_itens' });
});

test('tools/call: escrita com chave só de consulta é recusada sem executar', async () => {
  chamadas.length = 0;
  const r = await m.responderMcp(pedido(6, 'tools/call', { name: 'gravar_valor', arguments: { item: 1, coluna: 'Status', valor: 'Feito' } }), contexto(false));
  assert.equal(chamadas.length, 0);
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /só de consulta/);
});

test('tools/call: erro da execução vira erro da ferramenta (isError), não do protocolo', async () => {
  const r = await m.responderMcp(pedido(7, 'tools/call', { name: 'ler_quadro', arguments: { quadro: 9 } }),
    contexto(false, async () => { throw new Error('Quadro não encontrado.'); }));
  assert.equal(r.result.isError, true);
  assert.deepEqual(JSON.parse(r.result.content[0].text), { erro: 'Quadro não encontrado.' });
  const desconhecida = await m.responderMcp(pedido(8, 'tools/call', { name: 'apagar_tudo' }), contexto(true));
  assert.equal(desconhecida.error.code, -32602);
});

test('lote: responde em ordem e deixa de fora as notificações', async () => {
  const r = await m.responderMcp([pedido(1, 'ping'), { jsonrpc: '2.0', method: 'notifications/initialized' }, pedido(2, 'ping')], contexto(false));
  assert.deepEqual(r.map(x => x.id), [1, 2]);
  assert.equal(await m.responderMcp([{ jsonrpc: '2.0', method: 'notifications/initialized' }], contexto(false)), null);
});

test('arquivo: imagem como imagem, texto como texto, PDF como recurso; acima de 5 MB, só o aviso', () => {
  const png = m.conteudoDoArquivo(3, { dados: Buffer.from('png'), mime: 'image/png', nome: 'foto.png' });
  assert.equal(png.itens[1].type, 'image');
  assert.equal(Buffer.from(png.itens[1].data, 'base64').toString(), 'png');
  const txt = m.conteudoDoArquivo(4, { dados: Buffer.from('olá'), mime: 'text/csv', nome: 'a.csv' });
  assert.deepEqual(txt.itens[1], { type: 'text', text: 'olá' });
  const pdf = m.conteudoDoArquivo(5, { dados: Buffer.from('%PDF'), mime: 'application/pdf', nome: 'Edital.pdf' });
  assert.equal(pdf.itens[1].type, 'resource');
  assert.equal(pdf.itens[1].resource.uri, 'friday://arquivos/5');
  assert.equal(pdf.itens[1].resource.mimeType, 'application/pdf');
  assert.match(pdf.itens[0].text, /^Edital\.pdf \(application\/pdf, 1 KB\)$/);
  const grande = m.conteudoDoArquivo(6, { dados: Buffer.alloc(m.LIMITE_BAIXAR_MCP + 1), mime: 'application/pdf', nome: 'Grande.pdf' });
  assert.equal(grande.itens.length, 1);
  assert.match(grande.itens[0].text, /GET \/arquivos\/6/);
});

test('o resultado de arquivo sai como a lista de conteúdos, não como JSON', async () => {
  const conteudo = m.conteudoDoArquivo(5, { dados: Buffer.from('%PDF'), mime: 'application/pdf', nome: 'Edital.pdf' });
  const r = await m.responderMcp(pedido(9, 'tools/call', { name: 'baixar_arquivo', arguments: { arquivo: 5 } }), contexto(false, async () => conteudo));
  assert.deepEqual(r.result.content, conteudo.itens);
});
