import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpsError } from 'firebase-functions/v2/https';
import { answerManuscriptQuestion, validateChatInput } from '../lib/manuscriptChat.js';

const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 7, cache_read_input_tokens: 3 };
const source = {
  catalog: async () => '01_FIRESTORE/COLECOES/bombas.md | colecao | vigente | bombas | Estado da bomba.',
  search: async () => [{ path: '01_FIRESTORE/COLECOES/bombas.md', title: 'bombas', snippet: 'estoqueAtual' }],
  read: async (path) => { if (path !== '01_FIRESTORE/COLECOES/bombas.md') throw new HttpsError('not-found', 'MANUSCRIPT_DOCUMENT_NOT_FOUND'); return '# bombas\n\nTexto.'; },
  relations: async (id) => `${id} --define--> colecao:bombas`,
};

function fakeClient(responses) {
  const calls = [];
  return { calls, create: async (params) => { calls.push(structuredClone(params)); return responses.shift(); } };
}

test('chat input accepts alternating text history and rejects anything else', () => {
  assert.deepEqual(validateChatInput([{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }], ' c '), { history: [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }], question: 'c' });
  assert.deepEqual(validateChatInput(undefined, 'pergunta').history, []);
  for (const [history, question] of [[[], ''], [[{ role: 'user', text: 'a' }], 'q'], [[{ role: 'assistant', text: 'a' }, { role: 'user', text: 'b' }], 'q'], [[{ role: 'user', text: 'a' }, { role: 'assistant', content: [] }], 'q'], ['x', 'q'], [[], 'x'.repeat(8001)]]) {
    assert.throws(() => validateChatInput(history, question), (error) => error instanceof HttpsError && error.code === 'invalid-argument');
  }
});

test('chat runs read-only tools, keeps the turn append-only and reports consulted documents', async () => {
  const client = fakeClient([
    { stop_reason: 'tool_use', usage, content: [
      { type: 'tool_use', id: 't1', name: 'ler_documento', input: { caminho: '01_FIRESTORE/COLECOES/bombas.md' } },
      { type: 'tool_use', id: 't2', name: 'ler_documento', input: { caminho: 'nao-existe.md' } },
      { type: 'tool_use', id: 't3', name: 'relacoes', input: { id: 'colecao:bombas' } },
    ] },
    { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Grava em [bombas](01_FIRESTORE/COLECOES/bombas.md).' }] },
  ]);
  const answer = await answerManuscriptQuestion(client, source, [{ role: 'user', text: 'oi' }, { role: 'assistant', text: 'olá' }], 'Quem grava em bombas?');
  assert.equal(answer.resposta, 'Grava em [bombas](01_FIRESTORE/COLECOES/bombas.md).');
  assert.deepEqual(answer.consultados, ['01_FIRESTORE/COLECOES/bombas.md']);
  assert.deepEqual(answer.uso, { entrada: 20, cacheGravado: 14, cacheLido: 6, saida: 10 });
  assert.equal(client.calls.length, 2);
  const [first, second] = client.calls;
  assert.equal(first.model, 'claude-opus-5-5');
  assert.equal(first.fallbacks, 'default');
  assert.deepEqual(first.messages, [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'olá' }, { role: 'user', content: 'Quem grava em bombas?' }]);
  // A segunda chamada só acrescenta: a resposta do modelo e os resultados das ferramentas.
  assert.deepEqual(second.messages.slice(0, 3), first.messages);
  assert.deepEqual(second.system, first.system);
  assert.deepEqual(second.tools, first.tools);
  const results = second.messages[4].content;
  assert.equal(results[0].content, '# bombas\n\nTexto.');
  assert.equal(results[1].is_error, true);
  assert.match(results[2].content, /colecao:bombas/);
  assert.ok(first.system[0].text.includes('Estado da bomba.'));
});

test('chat stops on refusal and on the round limit', async () => {
  const refused = await answerManuscriptQuestion(fakeClient([{ stop_reason: 'refusal', usage, content: [] }]), source, [], 'x');
  assert.match(refused.resposta, /recusada/);
  const looping = Array.from({ length: 12 }, () => ({ stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 't', name: 'buscar_documentos', input: { consulta: 'bombas' } }] }));
  const capped = await answerManuscriptQuestion(fakeClient(looping), source, [], 'x');
  assert.match(capped.resposta, /limite de etapas/);
});
