// Bloco de dados (front-matter) dos documentos do The Manuscript.
// Contrato: 00_METADADOS.md no repositório ledur-the-manuscript.

// Links Markdown internos e título (usados pelo Reader, pelo grafo e pelo verificador).
/** Resolves a Markdown link without allowing it to leave the logical repository root. */
export function resolveManuscriptLink(sourcePath: string, href: string): { path: string; anchor?: string } | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[a-z][a-z\d+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) return null;
  const [rawPath, anchor] = trimmed.split('#', 2);
  if (!rawPath || rawPath.includes('\\') || rawPath.includes('?') || !rawPath.toLowerCase().endsWith('.md')) return null;
  const parts = sourcePath.split('/').slice(0, -1);
  for (const segment of rawPath.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(segment);
  }
  const path = parts.join('/');
  return path && path.toLowerCase().endsWith('.md') ? { path, ...(anchor ? { anchor } : {}) } : null;
}

export function extractMarkdownLinks(content: string): Array<{ href: string; offset: number }> {
  const links: Array<{ href: string; offset: number }> = [];
  const pattern = /!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g;
  for (let match = pattern.exec(content); match; match = pattern.exec(content)) links.push({ href: match[1], offset: match.index });
  return links;
}

export function manuscriptTitle(content: string, fallback: string) {
  return /^#\s+(.+)$/m.exec(splitFrontMatter(content).body)?.[1]?.trim() || fallback.replace(/\.md$/i, '');
}

/** Instruções para agentes na raiz do repositório: aparecem no Reader, mas não são documentos do corpus. */
export const MANUSCRIPT_NAO_CORPUS = ['AGENTS.md', 'CLAUDE.md'];

export const MANUSCRIPT_TIPOS = ['visao-geral', 'colecao', 'regras', 'function', 'integracao', 'processo', 'tela', 'app', 'auditoria'] as const;
export const MANUSCRIPT_STATUS = ['vigente', 'parcial', 'divergente', 'proposta', 'legado', 'historico'] as const;
export const MANUSCRIPT_DOMINIOS = ['autenticacao', 'funcionarios', 'frota', 'obras', 'atividades', 'checklists', 'combustivel', 'bombas', 'manutencao', 'fornecedores', 'engenharia', 'monday', 'erp', 'relatorios', 'friday', 'logistica', 'kiosk', 'manuscript', 'sistema'] as const;
export const MANUSCRIPT_RELACOES = ['le', 'escreve', 'chama', 'integra'] as const;
export const MANUSCRIPT_ENTIDADES = ['colecao', 'function', 'rota', 'externo'] as const;

export type ManuscriptTipo = typeof MANUSCRIPT_TIPOS[number];
export type ManuscriptStatus = typeof MANUSCRIPT_STATUS[number];
export type ManuscriptRelacao = typeof MANUSCRIPT_RELACOES[number];
export type ManuscriptEntidadeTipo = typeof MANUSCRIPT_ENTIDADES[number];

export interface ManuscriptMetadata {
  tipo: ManuscriptTipo;
  dominios: string[];
  status: ManuscriptStatus;
  resumo: string;
  define: string[];
  le: string[];
  escreve: string[];
  chama: string[];
  integra: string[];
}

export interface ParsedManuscriptDocument { metadata: ManuscriptMetadata | null; body: string; problems: string[] }

const LIST_KEYS = ['dominios', 'define', ...MANUSCRIPT_RELACOES] as const;
const SCALAR_KEYS = ['tipo', 'status', 'resumo'] as const;
const KNOWN_KEYS = new Set<string>([...LIST_KEYS, ...SCALAR_KEYS]);
const ENTITY_PATTERN = /^(colecao|function|rota|externo):[^\s,[\]"]+$/;
const MAX_RESUMO = 240;

function unquote(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
}

/** Separa o bloco de dados do corpo. Sem bloco, devolve o conteúdo inteiro como corpo. */
export function splitFrontMatter(content: string): { raw: string | null; body: string } {
  const normalized = content.replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(normalized);
  if (!match) return { raw: null, body: normalized };
  return { raw: match[1], body: normalized.slice(match[0].length).replace(/^\r?\n/, '') };
}

/** Lê o bloco no formato restrito de 00_METADADOS.md e confere o vocabulário. */
export function parseManuscriptDocument(content: string): ParsedManuscriptDocument {
  const { raw, body } = splitFrontMatter(content);
  if (raw === null) return { metadata: null, body, problems: ['bloco de dados ausente'] };
  const problems: string[] = [];
  const values = new Map<string, string | string[]>();
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([a-z]+):(?:[ \t]+(.*))?$/.exec(line);
    if (!match) { problems.push(`linha ${index + 2} fora do formato "chave: valor"`); continue; }
    const [, key, rawValue = ''] = match;
    if (!KNOWN_KEYS.has(key)) { problems.push(`campo desconhecido "${key}"`); continue; }
    if (values.has(key)) { problems.push(`campo "${key}" repetido`); continue; }
    if ((LIST_KEYS as readonly string[]).includes(key)) {
      const list = /^\[(.*)\]$/.exec(rawValue.trim());
      if (!list) { problems.push(`campo "${key}" precisa ser lista entre colchetes`); continue; }
      values.set(key, list[1].split(',').map(unquote).filter(Boolean));
    } else {
      values.set(key, unquote(rawValue));
    }
  }
  const text = (key: string) => (typeof values.get(key) === 'string' ? values.get(key) as string : '');
  const list = (key: string) => (Array.isArray(values.get(key)) ? values.get(key) as string[] : []);
  const tipo = text('tipo');
  const status = text('status');
  const resumo = text('resumo');
  const dominios = list('dominios');
  if (!(MANUSCRIPT_TIPOS as readonly string[]).includes(tipo)) problems.push(tipo ? `tipo "${tipo}" fora do vocabulário` : 'tipo ausente');
  if (!(MANUSCRIPT_STATUS as readonly string[]).includes(status)) problems.push(status ? `status "${status}" fora do vocabulário` : 'status ausente');
  if (!resumo) problems.push('resumo ausente');
  else if (resumo.length > MAX_RESUMO) problems.push(`resumo com mais de ${MAX_RESUMO} caracteres`);
  if (!dominios.length) problems.push('dominios vazio');
  for (const dominio of dominios) if (!(MANUSCRIPT_DOMINIOS as readonly string[]).includes(dominio)) problems.push(`domínio "${dominio}" fora do vocabulário`);
  for (const key of ['define', ...MANUSCRIPT_RELACOES]) {
    for (const entity of list(key)) if (!ENTITY_PATTERN.test(entity)) problems.push(`entidade "${entity}" em "${key}" fora do formato tipo:nome`);
  }
  for (const entity of list('chama')) if (!entity.startsWith('function:')) problems.push(`"chama" aceita só function: ("${entity}")`);
  for (const entity of list('integra')) if (!entity.startsWith('externo:')) problems.push(`"integra" aceita só externo: ("${entity}")`);
  const metadata: ManuscriptMetadata = {
    tipo: tipo as ManuscriptTipo, dominios, status: status as ManuscriptStatus, resumo,
    define: list('define'), le: list('le'), escreve: list('escreve'), chama: list('chama'), integra: list('integra'),
  };
  return { metadata, body, problems };
}

export interface ManuscriptSystemNode {
  id: string;
  kind: 'DOCUMENTO' | 'ENTIDADE';
  label: string;
  /** Documento: tipo do bloco. Entidade: prefixo (colecao, function, rota, externo). */
  tipo: string;
  dominios: string[];
  status?: string;
  resumo?: string;
  /** Entidade: documento que a define, se houver. */
  definidoEm?: string;
}
export interface ManuscriptSystemEdge { source: string; target: string; relacao: 'define' | ManuscriptRelacao | 'link' }
export interface ManuscriptCheckProblem { path: string; problem: string }
export interface ManuscriptSystemGraph { nodes: ManuscriptSystemNode[]; edges: ManuscriptSystemEdge[]; problems: ManuscriptCheckProblem[] }

export interface ManuscriptSourceDocument { path: string; title: string; content: string; links?: string[] }

/** Monta o grafo de documentos e entidades e lista os problemas do corpus. */
export function buildManuscriptSystemGraph(documents: ManuscriptSourceDocument[]): ManuscriptSystemGraph {
  const problems: ManuscriptCheckProblem[] = [];
  const nodes = new Map<string, ManuscriptSystemNode>();
  const edges: ManuscriptSystemEdge[] = [];
  const definers = new Map<string, string[]>();
  const referenced = new Map<string, string[]>();
  const parsed = documents.map((document) => ({ document, ...parseManuscriptDocument(document.content) }));
  for (const { document, metadata, problems: own } of parsed) {
    for (const problem of own) problems.push({ path: document.path, problem });
    nodes.set(document.path, {
      id: document.path, kind: 'DOCUMENTO', label: document.title, tipo: metadata?.tipo ?? 'sem-bloco',
      dominios: metadata?.dominios ?? [], ...(metadata?.status ? { status: metadata.status } : {}), ...(metadata?.resumo ? { resumo: metadata.resumo } : {}),
    });
    if (!metadata) continue;
    if (document.path.startsWith('_AUDITORIA/') && metadata.tipo !== 'auditoria') problems.push({ path: document.path, problem: 'documento de _AUDITORIA precisa de tipo auditoria' });
    if (metadata.tipo === 'auditoria' && metadata.define.length) problems.push({ path: document.path, problem: 'auditoria não define entidades' });
    for (const entity of metadata.define) definers.set(entity, [...(definers.get(entity) ?? []), document.path]);
    for (const relacao of MANUSCRIPT_RELACOES) for (const entity of metadata[relacao]) referenced.set(entity, [...(referenced.get(entity) ?? []), document.path]);
  }
  for (const [entity, paths] of definers) if (paths.length > 1) for (const path of paths) problems.push({ path, problem: `"${entity}" definida também em ${paths.filter((p) => p !== path).join(', ')}` });
  for (const [entity, paths] of referenced) if (!definers.has(entity)) for (const path of [...new Set(paths)]) problems.push({ path, problem: `"${entity}" não é definida em nenhum documento` });

  const entityNode = (id: string) => {
    const existing = nodes.get(id);
    if (existing) return existing;
    const [tipo, ...rest] = id.split(':');
    const definidoEm = definers.get(id)?.[0];
    const owner = definidoEm ? nodes.get(definidoEm) : undefined;
    const node: ManuscriptSystemNode = { id, kind: 'ENTIDADE', label: rest.join(':'), tipo, dominios: owner?.dominios ?? [], ...(definidoEm ? { definidoEm } : {}) };
    nodes.set(id, node);
    return node;
  };
  const seen = new Set<string>();
  const addEdge = (edge: ManuscriptSystemEdge) => { const key = `${edge.source}|${edge.target}|${edge.relacao}`; if (!seen.has(key)) { seen.add(key); edges.push(edge); } };
  for (const { document, metadata } of parsed) {
    if (!metadata) continue;
    for (const entity of metadata.define) { if (ENTITY_PATTERN.test(entity)) { entityNode(entity); addEdge({ source: document.path, target: entity, relacao: 'define' }); } }
    for (const relacao of MANUSCRIPT_RELACOES) for (const entity of metadata[relacao]) if (ENTITY_PATTERN.test(entity)) { entityNode(entity); addEdge({ source: document.path, target: entity, relacao }); }
  }
  for (const document of documents) for (const target of document.links ?? []) if (target !== document.path && nodes.get(target)?.kind === 'DOCUMENTO') addEdge({ source: document.path, target, relacao: 'link' });
  return { nodes: [...nodes.values()], edges, problems };
}
