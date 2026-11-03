// Chat do The Manuscript: responde perguntas lendo a documentação canônica com ferramentas só de leitura.
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageParam, BetaTool, BetaToolResultBlockParam, BetaToolUseBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { HttpsError } from 'firebase-functions/v2/https';

export const MANUSCRIPT_CHAT_MODEL = 'claude-opus-5-5';
const MAX_HISTORY = 20;
const MAX_TEXT = 8000;
const MAX_ROUNDS = 12;

export interface ManuscriptChatTurn { role: 'user' | 'assistant'; text: string }
export interface ManuscriptChatAnswer { resposta: string; consultados: string[]; uso: { entrada: number; cacheGravado: number; cacheLido: number; saida: number } }

/** O que o chat consegue ler do Manuscript (implementado pelo ManuscriptService). */
export interface ManuscriptChatSource {
  catalog(): Promise<string>;
  search(query: string): Promise<Array<{ path: string; title: string; snippet: string }>>;
  read(path: string): Promise<string>;
  relations(id: string): Promise<string>;
}

type ChatClient = Pick<Anthropic['beta']['messages'], 'create'>;

const TOOLS: BetaTool[] = [
  {
    name: 'buscar_documentos', strict: true,
    description: 'Busca texto exato em todos os documentos do The Manuscript (caminho, título e conteúdo). Devolve até 12 documentos com um trecho. Use palavras-chave curtas: nome de coleção, Function, rota ou termo de negócio.',
    input_schema: { type: 'object', properties: { consulta: { type: 'string', description: 'Texto a buscar, de 2 a 100 caracteres.' } }, required: ['consulta'], additionalProperties: false },
  },
  {
    name: 'ler_documento', strict: true,
    description: 'Lê um documento inteiro do The Manuscript, incluindo o bloco de dados do topo. Use o caminho exato do catálogo, por exemplo "01_FIRESTORE/COLECOES/bombas.md".',
    input_schema: { type: 'object', properties: { caminho: { type: 'string', description: 'Caminho do documento, terminando em .md.' } }, required: ['caminho'], additionalProperties: false },
  },
  {
    name: 'relacoes', strict: true,
    description: 'Mostra as relações de um documento ou entidade no mapa do sistema: quem define, quem lê, quem escreve, quem chama, integrações e links entre documentos. Aceita um caminho de documento ou uma entidade como "colecao:bombas", "function:fridayCadastroGravar", "rota:/friday" ou "externo:monday".',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'Caminho de documento ou entidade tipo:nome.' } }, required: ['id'], additionalProperties: false },
  },
];

function systemPrompt(catalog: string) {
  return `Você é o assistente do The Manuscript, a documentação canônica do ecossistema Motorista da Ledur (aplicação WEB, Cloud Functions, Firestore e App Flutter). Quem pergunta é da equipe técnica.

Como responder:
- Responda só com o que os documentos dizem. Antes de afirmar algo, leia o documento com as ferramentas; o resumo do catálogo não basta para detalhes.
- Cite a fonte de cada afirmação com um link Markdown para o documento, no formato [Título](caminho.md) ou [Título](caminho.md#ancora).
- Se a resposta não estiver na documentação, diga isso claramente. Não complete com suposições sobre o código.
- Os contratos ficam em 01_FIRESTORE, 02_APIS_FUNCTIONS, 03_APLICACAO_WEB e 04_APP_FLUTTER. _AUDITORIA registra divergências e pendências sem redefinir contratos. Documento com status "historico" não define o comportamento atual; avise quando a resposta depender de um.
- Quando contrato e implementação divergirem segundo a documentação, mostre a divergência em vez de escolher um lado.
- Escreva em português do Brasil, de forma direta e curta. Use listas ou tabelas só quando ajudarem.

O bloco de dados de cada documento segue 00_METADADOS.md: tipo, dominios, status, resumo, e as entidades que ele define, lê, escreve, chama e integra.

Catálogo (caminho | tipo | status | domínios | resumo):
${catalog}`;
}

/** Confere o histórico enviado pela tela: só texto, alternando pessoa e assistente, começando pela pessoa. */
export function validateChatInput(historyInput: unknown, questionInput: unknown): { history: ManuscriptChatTurn[]; question: string } {
  const question = typeof questionInput === 'string' ? questionInput.trim() : '';
  if (!question || question.length > MAX_TEXT) throw new HttpsError('invalid-argument', 'MANUSCRIPT_CHAT_QUESTION_INVALID');
  if (historyInput !== undefined && !Array.isArray(historyInput)) throw new HttpsError('invalid-argument', 'MANUSCRIPT_CHAT_HISTORY_INVALID');
  const raw = (historyInput ?? []) as unknown[];
  if (raw.length > MAX_HISTORY || raw.length % 2 !== 0) throw new HttpsError('invalid-argument', 'MANUSCRIPT_CHAT_HISTORY_INVALID');
  const history = raw.map((item, index): ManuscriptChatTurn => {
    const turn = item as { role?: unknown; text?: unknown } | null;
    const role = index % 2 === 0 ? 'user' : 'assistant';
    if (!turn || turn.role !== role || typeof turn.text !== 'string' || !turn.text.trim() || turn.text.length > MAX_TEXT * 4) throw new HttpsError('invalid-argument', 'MANUSCRIPT_CHAT_HISTORY_INVALID');
    return { role, text: turn.text };
  });
  return { history, question };
}

async function runTool(source: ManuscriptChatSource, block: BetaToolUseBlock, consulted: Set<string>): Promise<BetaToolResultBlockParam> {
  const input = (block.input ?? {}) as Record<string, unknown>;
  const fail = (content: string): BetaToolResultBlockParam => ({ type: 'tool_result', tool_use_id: block.id, is_error: true, content });
  try {
    if (block.name === 'buscar_documentos' && typeof input.consulta === 'string') {
      const results = await source.search(input.consulta);
      return { type: 'tool_result', tool_use_id: block.id, content: results.length ? results.map((r) => `${r.path} | ${r.title}\n  ${r.snippet}`).join('\n') : 'Nenhum documento contém esse texto.' };
    }
    if (block.name === 'ler_documento' && typeof input.caminho === 'string') {
      const content = await source.read(input.caminho);
      consulted.add(input.caminho);
      return { type: 'tool_result', tool_use_id: block.id, content };
    }
    if (block.name === 'relacoes' && typeof input.id === 'string') return { type: 'tool_result', tool_use_id: block.id, content: await source.relations(input.id) };
    return fail('Ferramenta ou entrada inválida.');
  } catch (error) {
    if (error instanceof HttpsError && error.code === 'not-found') return fail('Documento não encontrado. Confira o caminho no catálogo.');
    if (error instanceof HttpsError && error.code === 'invalid-argument') return fail('Entrada inválida para a ferramenta.');
    throw error;
  }
}

/** Uma pergunta: o histórico entra só como texto; dentro da pergunta, as mensagens só crescem. */
export async function answerManuscriptQuestion(client: ChatClient, source: ManuscriptChatSource, history: ManuscriptChatTurn[], question: string): Promise<ManuscriptChatAnswer> {
  const system = systemPrompt(await source.catalog());
  const messages: BetaMessageParam[] = [...history.map((turn) => ({ role: turn.role, content: turn.text })), { role: 'user', content: question }];
  const consulted = new Set<string>();
  // Tokens de entrada em três partes, como a API cobra: sem cache, gravados no cache e lidos do cache.
  const uso = { entrada: 0, cacheGravado: 0, cacheLido: 0, saida: 0 };
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const response = await client.create({
      model: MANUSCRIPT_CHAT_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
    });
    uso.entrada += response.usage.input_tokens;
    uso.saida += response.usage.output_tokens;
    uso.cacheGravado += response.usage.cache_creation_input_tokens ?? 0;
    uso.cacheLido += response.usage.cache_read_input_tokens ?? 0;
    const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n').trim();
    if (response.stop_reason === 'refusal') return { resposta: 'A pergunta foi recusada pelo modelo. Tente reformular.', consultados: [...consulted], uso };
    if (response.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: response.content }); continue; }
    const toolUses = response.content.filter((block): block is BetaToolUseBlock => block.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) {
      const cut = response.stop_reason === 'max_tokens' ? '\n\n_(Resposta cortada por tamanho.)_' : '';
      return { resposta: (text || 'Não consegui montar uma resposta.') + cut, consultados: [...consulted], uso };
    }
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: await Promise.all(toolUses.map((block) => runTool(source, block, consulted))) });
  }
  return { resposta: 'A pesquisa passou do limite de etapas sem chegar a uma resposta. Tente uma pergunta mais específica.', consultados: [...consulted], uso };
}
