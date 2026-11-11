// MCP (Model Context Protocol) da API do Friday: o Claude Code e outros assistentes usam a mesma chave (X-Friday-Chave) e
// as mesmas rotas da fridayApi como ferramentas. Transporte "Streamable HTTP" sem sessão: cada POST em /mcp traz uma
// mensagem JSON-RPC e recebe a resposta em JSON (sem SSE). Aqui fica só o protocolo, sem Firestore: quem executa cada
// ferramenta, com as permissões e os registros de sempre, é a fridayApi.
// Contrato: The Manuscript, 02_APIS_FUNCTIONS/09_ROBOS_EXTERNOS_DE_OBRAS.md ("MCP do Friday").

type AnyRecord = Record<string, any>;

/** Versões do protocolo aceitas; a primeira é a usada quando o cliente pede outra. */
export const VERSOES_MCP = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/** Acima disso, baixar_arquivo não manda o conteúdo (pesaria demais na conversa): indica a rota /arquivos/{id}. */
export const LIMITE_BAIXAR_MCP = 5 * 1024 * 1024;

const INSTRUCOES = 'Friday: os quadros internos da Ledur (obras, demandas, cadastros). Tudo é lido e gravado em nome da pessoa da '
  + 'chave, que vê só os quadros que ela vê na tela. Para achar algo, use buscar_itens (pelo nome; com quadro, também pelos '
  + 'valores das colunas) ou listar_quadros e ler_quadro. Na escrita, colunas vão pelo título; status e listas pelo texto; '
  + 'pessoas pelo nome completo; datas DD/MM/AAAA. Use simular: true para conferir antes de gravar. O que a chave grava aparece '
  + 'na atividade do item com a marca "API".';

export type FerramentaMcp = {
  name: string; title: string; description: string; inputSchema: AnyRecord; escrita: boolean;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint: false };
};

const inteiro = (description: string) => ({ type: 'integer', minimum: 1, description });
const SIMULAR = { type: 'boolean', description: 'true: confere e mostra o que gravaria, sem gravar nada.' };
const VALORES = {
  type: 'object', additionalProperties: true,
  description: '{ "Título da coluna": valor }. Status e lista pelo texto; pessoa pelo nome completo; data DD/MM/AAAA; número com vírgula ou ponto; caixa "sim"/"não"; vazio limpa.',
};
const leitura = { readOnlyHint: true, openWorldHint: false } as const;
const objeto = (properties: AnyRecord, required: string[] = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });

export const FERRAMENTAS: FerramentaMcp[] = [
  {
    name: 'quem_sou_eu', title: 'De quem é a chave', escrita: false, annotations: leitura, inputSchema: objeto({}),
    description: 'Nome e uid da pessoa da chave, se ela é adm2 e se a chave grava.',
  },
  {
    name: 'listar_quadros', title: 'Listar quadros', escrita: false, annotations: leitura, inputSchema: objeto({}),
    description: 'Quadros que a pessoa vê, com id, área, pasta e se é restrito ou oficial (cadastro ligado).',
  },
  {
    name: 'ler_quadro', title: 'Ler quadro', escrita: false, annotations: leitura,
    inputSchema: objeto({ quadro: inteiro('Id do quadro (de listar_quadros ou buscar_itens).') }, ['quadro']),
    description: 'Colunas, grupos, itens e subitens de um quadro, com os valores em texto. Quadros grandes rendem respostas longas: para um item, prefira buscar_itens.',
  },
  {
    name: 'buscar_itens', title: 'Buscar itens', escrita: false, annotations: leitura,
    inputSchema: objeto({
      texto: { type: 'string', description: 'Palavras do nome do item (todas precisam estar no nome).' },
      quadro: inteiro('Opcional: procura só neste quadro, também nos valores das colunas (ex.: o número do subcentro).'),
      limite: { type: 'integer', minimum: 1, maximum: 200, description: 'Máximo de itens (padrão 50).' },
    }, ['texto']),
    description: 'Itens e subitens pelo nome, em todos os quadros que a pessoa vê, com o quadro, o grupo e os valores em texto.',
  },
  {
    name: 'listar_arquivos', title: 'Listar arquivos do item', escrita: false, annotations: leitura,
    inputSchema: objeto({ item: inteiro('Id do item.') }, ['item']),
    description: 'Arquivos do item (colunas de arquivos, atualizações e aba Arquivos), com id, nome, tipo e tamanho.',
  },
  {
    name: 'baixar_arquivo', title: 'Ler arquivo', escrita: false, annotations: leitura,
    inputSchema: objeto({ arquivo: inteiro('Id do arquivo (de listar_arquivos).') }, ['arquivo']),
    description: 'Conteúdo de um arquivo de até 5 MB: imagem, texto ou documento (ex.: PDF).',
  },
  {
    name: 'gravar_valor', title: 'Gravar valor', escrita: true,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: objeto({
      item: inteiro('Id do item (ou subitem).'),
      coluna: { type: 'string', description: 'Título (ou id) da coluna.' },
      valor: { description: 'O novo valor, como uma pessoa escreveria (ex.: "Parado", "15/11/2026", "Ana Souza"). Vazio limpa a célula.' },
      simular: SIMULAR,
    }, ['item', 'coluna', 'valor']),
    description: 'Muda uma célula do item, pelo mesmo caminho da tela (campos oficiais validados, automações disparadas, atividade registrada).',
  },
  {
    name: 'criar_item', title: 'Criar item', escrita: true, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: objeto({
      quadro: inteiro('Id do quadro.'),
      nome: { type: 'string', description: 'Nome do item.' },
      grupo: { type: 'string', description: 'Nome (ou id) do grupo; sem ele, vai para o primeiro grupo.' },
      valores: VALORES, simular: SIMULAR,
    }, ['quadro', 'nome']),
    description: 'Cria um item no quadro (em quadro oficial, vira registro do cadastro, como na tela).',
  },
  {
    name: 'criar_subitem', title: 'Criar subitem', escrita: true, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: objeto({
      item: inteiro('Id do item principal.'),
      nome: { type: 'string', description: 'Nome do subitem.' },
      valores: { ...VALORES, description: `Pelas colunas do quadro de subitens. ${VALORES.description}` }, simular: SIMULAR,
    }, ['item', 'nome']),
    description: 'Cria um subitem no item (na primeira vez, cria o quadro de subitens com Responsável, Status e Data).',
  },
  {
    name: 'publicar_atualizacao', title: 'Publicar atualização', escrita: true, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: objeto({
      item: inteiro('Id do item.'),
      texto: { type: 'string', description: 'Texto da atualização (até 5000 caracteres). Menção: @{uid}.' },
    }, ['item', 'texto']),
    description: 'Publica uma atualização no item, em nome da pessoa da chave.',
  },
];

/** Resposta pronta de ferramenta (lista de conteúdos do MCP), em vez do JSON da rota. */
export class ConteudoMcp {
  constructor(readonly itens: AnyRecord[]) {}
}

const mb = (n: number) => `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

/** Arquivo baixado → conteúdo do MCP: imagem como imagem, texto como texto, o resto (PDF etc.) como recurso embutido. */
export function conteudoDoArquivo(id: number, a: { dados: Buffer; mime: string; nome: string }): ConteudoMcp {
  const mime = a.mime.toLowerCase();
  const tamanho = a.dados.length < 1024 * 1024 ? `${Math.max(1, Math.round(a.dados.length / 1024))} KB` : mb(a.dados.length);
  const info = { type: 'text', text: `${a.nome} (${a.mime}, ${tamanho})` };
  if (a.dados.length > LIMITE_BAIXAR_MCP) {
    return new ConteudoMcp([{ type: 'text', text: `${a.nome} tem ${mb(a.dados.length)}, acima do limite de ${mb(LIMITE_BAIXAR_MCP)} para a conversa. Baixe pela API: GET /arquivos/${id} com a chave.` }]);
  }
  if (/^image\/(png|jpeg|gif|webp)$/.test(mime)) return new ConteudoMcp([info, { type: 'image', data: a.dados.toString('base64'), mimeType: mime }]);
  if (/^text\/|^application\/(json|xml|csv)/.test(mime)) return new ConteudoMcp([info, { type: 'text', text: a.dados.toString('utf8') }]);
  return new ConteudoMcp([info, { type: 'resource', resource: { uri: `friday://arquivos/${id}`, mimeType: mime, blob: a.dados.toString('base64') } }]);
}

export type ContextoMcp = {
  /** A chave grava? Sem escrita, as ferramentas de escrita nem aparecem. */
  escrita: boolean;
  /** Executa a ferramenta (mesmas funções das rotas). Erro vira resposta de erro da ferramenta, com mensagemDeErro. */
  executar: (nome: string, args: AnyRecord) => Promise<unknown>;
  mensagemDeErro: (e: unknown) => string;
};

const resposta = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });
const erroRpc = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const textoDe = (r: unknown) => [{ type: 'text', text: JSON.stringify(r, null, 2) }];

async function responderUma(m: unknown, ctx: ContextoMcp): Promise<unknown | null> {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return erroRpc(null, -32600, 'Pedido JSON-RPC inválido.');
  const msg = m as AnyRecord;
  // Resposta do cliente (ex.: a um pedido do servidor): nada a responder.
  if (!('method' in msg) && ('result' in msg || 'error' in msg)) return null;
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return erroRpc(msg.id, -32600, 'Pedido JSON-RPC inválido.');
  // Notificação (sem id), como notifications/initialized: só recebe.
  if (!('id' in msg)) return null;
  const params: AnyRecord = msg.params && typeof msg.params === 'object' && !Array.isArray(msg.params) ? msg.params : {};
  switch (msg.method) {
    case 'initialize': {
      const pedida = String(params.protocolVersion ?? '');
      return resposta(msg.id, {
        protocolVersion: VERSOES_MCP.includes(pedida) ? pedida : VERSOES_MCP[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'friday', title: 'Friday (Ledur)', version: '1.0.0' },
        instructions: INSTRUCOES,
      });
    }
    case 'ping':
      return resposta(msg.id, {});
    case 'tools/list':
      return resposta(msg.id, { tools: FERRAMENTAS.filter(f => ctx.escrita || !f.escrita).map(({ escrita: _e, ...f }) => f) });
    case 'tools/call': {
      const f = FERRAMENTAS.find(x => x.name === params.name);
      if (!f) return erroRpc(msg.id, -32602, `Ferramenta desconhecida: ${String(params.name)}.`);
      if (f.escrita && !ctx.escrita) return resposta(msg.id, { content: textoDe({ erro: 'Esta chave é só de consulta.' }), isError: true });
      const args: AnyRecord = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? params.arguments : {};
      try {
        const r = await ctx.executar(f.name, args);
        return resposta(msg.id, { content: r instanceof ConteudoMcp ? r.itens : textoDe(r) });
      } catch (e) {
        return resposta(msg.id, { content: textoDe({ erro: ctx.mensagemDeErro(e) }), isError: true });
      }
    }
    default:
      return erroRpc(msg.id, -32601, `Método não suportado: ${msg.method}.`);
  }
}

/**
 * Responde ao corpo de um POST em /mcp (mensagem ou lote). null: nada a responder (notificação ou resposta do cliente),
 * e o HTTP devolve 202 sem corpo. Lote em ordem, uma mensagem de cada vez (a escrita respeita a sequência pedida).
 */
export async function responderMcp(corpo: unknown, ctx: ContextoMcp): Promise<unknown | null> {
  if (!Array.isArray(corpo)) return responderUma(corpo, ctx);
  if (!corpo.length) return erroRpc(null, -32600, 'Lote vazio.');
  const respostas: unknown[] = [];
  for (const m of corpo) {
    const r = await responderUma(m, ctx);
    if (r !== null) respostas.push(r);
  }
  return respostas.length ? respostas : null;
}
