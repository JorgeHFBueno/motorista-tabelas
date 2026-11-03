import { createSign } from 'node:crypto';
import { temCredencial } from './credenciais.js';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { db } from './firebaseAdmin.js';
import Anthropic from '@anthropic-ai/sdk';
import { answerManuscriptQuestion, type ManuscriptChatSource, validateChatInput } from './manuscriptChat.js';
import { MANUSCRIPT_NAO_CORPUS, type ManuscriptSystemGraph, buildManuscriptSystemGraph, extractMarkdownLinks, manuscriptTitle, parseManuscriptDocument, resolveManuscriptLink } from './manuscriptMetadata.js';

export { extractMarkdownLinks, manuscriptTitle, resolveManuscriptLink };

const manuscriptGithubAppId = defineSecret('MANUSCRIPT_GITHUB_APP_ID');
const manuscriptGithubInstallationId = defineSecret('MANUSCRIPT_GITHUB_INSTALLATION_ID');
const manuscriptGithubPrivateKey = defineSecret('MANUSCRIPT_GITHUB_PRIVATE_KEY');
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const OWNER = 'JorgeHFBueno';
const REPO = 'ledur-the-manuscript';
const BRANCH = 'main';
const TREE_TTL_MS = 3 * 60_000;
const MAX_SEARCH_LIMIT = 30;
const MAX_GRAPH_NODES = 30;
const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 20;

export interface ManuscriptDocument { path: string; name: string; directory: string; sha: string }
interface GitTreeEntry { path: string; type: string; sha: string }
interface Snapshot { headSha: string; documents: ManuscriptDocument[]; expiresAt: number }
interface CachedDocument { content: string; headSha: string }
interface InstallationToken { value: string; expiresAt: number }
export interface ManuscriptBacklink { sourcePath: string; sourceTitle: string; anchor?: string; context?: string }
export interface ManuscriptBacklinksResponse { path: string; headSha: string; backlinks: ManuscriptBacklink[] }
export interface ManuscriptGraphNode { path: string; title: string; kind: 'CURRENT' | 'REFERENCE' | 'AUDIT'; direction?: 'INCOMING' | 'OUTGOING' | 'BIDIRECTIONAL' }
export interface ManuscriptGraphEdge { source: string; target: string; anchor?: string }
export interface ManuscriptDocumentGraphResponse { path: string; headSha: string; nodes: ManuscriptGraphNode[]; edges: ManuscriptGraphEdge[]; totalNodes: number; visibleNodes: number; truncated: boolean }
export interface ManuscriptCommit { sha: string; shortSha: string; message: string; authorName: string; authoredAt: string; htmlUrl?: string }
export interface ManuscriptDocumentHistoryResponse { path: string; headSha: string; commits: ManuscriptCommit[] }
interface LinkGraph { headSha: string; backlinks: Map<string, ManuscriptBacklink[]>; outgoing: Map<string, ManuscriptGraphEdge[]>; titles: Map<string, string>; brokenInternalLinks: string[] }

function base64Url(value: string | Buffer) { return Buffer.from(value).toString('base64url'); }
function cleanError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  return new HttpsError('unavailable', 'MANUSCRIPT_SOURCE_UNAVAILABLE');
}

export function validateManuscriptPath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 500 || value.includes('\\') || value.includes('\0')
    || value.startsWith('/') || value.includes('://') || value.split('/').some((part) => !part || part === '.' || part === '..')
    || !value.toLowerCase().endsWith('.md')) throw new HttpsError('invalid-argument', 'MANUSCRIPT_PATH_INVALID');
  return value;
}

export function filterManuscriptTree(entries: GitTreeEntry[]): ManuscriptDocument[] {
  return entries
    .filter((entry) => entry.type === 'blob' && entry.path.toLowerCase().endsWith('.md'))
    .filter((entry) => entry.path.split('/').every((part) => !part.startsWith('.') || part === '_AUDITORIA'))
    .map((entry) => ({ path: entry.path, name: entry.path.split('/').at(-1) ?? entry.path, directory: entry.path.split('/').slice(0, -1).join('/'), sha: entry.sha }))
    .sort((a, b) => a.path.localeCompare(b.path, 'pt-BR', { numeric: true }));
}

export class ManuscriptGitHubClient {
  private token: InstallationToken | null = null;
  constructor(private readonly credentials: () => { appId: string; installationId: string; privateKey: string }) {}

  private async installationToken() {
    if (this.token && this.token.expiresAt > Date.now() + 120_000) return this.token.value;
    const { appId, installationId, privateKey } = this.credentials();
    if (!appId || !installationId || !privateKey) throw new HttpsError('failed-precondition', 'MANUSCRIPT_GITHUB_APP_NOT_CONFIGURED');
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64Url(JSON.stringify({ iat: now - 30, exp: now + 540, iss: appId }));
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    const jwt = `${header}.${payload}.${signer.sign(privateKey).toString('base64url')}`;
    const response = await fetch(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
      method: 'POST', headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Ledur-Manuscript-Reader' },
    });
    if (!response.ok) throw new HttpsError('unavailable', 'MANUSCRIPT_GITHUB_AUTH_FAILED');
    const body = await response.json() as { token?: string; expires_at?: string };
    if (!body.token || !body.expires_at) throw new HttpsError('unavailable', 'MANUSCRIPT_GITHUB_AUTH_FAILED');
    this.token = { value: body.token, expiresAt: Date.parse(body.expires_at) };
    return body.token;
  }

  private async request(path: string) {
    const token = await this.installationToken();
    const response = await fetch(`https://api.github.com${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Ledur-Manuscript-Reader' } });
    if (response.status === 404) throw new HttpsError('not-found', 'MANUSCRIPT_DOCUMENT_NOT_FOUND');
    if (!response.ok) throw new HttpsError('unavailable', 'MANUSCRIPT_SOURCE_UNAVAILABLE');
    return response.json() as Promise<unknown>;
  }

  async headAndTree(): Promise<{ headSha: string; entries: GitTreeEntry[] }> {
    const ref = await this.request(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`) as { object?: { sha?: string } };
    const headSha = ref.object?.sha;
    if (!headSha) throw new HttpsError('unavailable', 'MANUSCRIPT_SOURCE_UNAVAILABLE');
    const commit = await this.request(`/repos/${OWNER}/${REPO}/git/commits/${headSha}`) as { tree?: { sha?: string } };
    if (!commit.tree?.sha) throw new HttpsError('unavailable', 'MANUSCRIPT_SOURCE_UNAVAILABLE');
    const tree = await this.request(`/repos/${OWNER}/${REPO}/git/trees/${commit.tree.sha}?recursive=1`) as { tree?: GitTreeEntry[]; truncated?: boolean };
    if (!Array.isArray(tree.tree) || tree.truncated) throw new HttpsError('unavailable', 'MANUSCRIPT_SOURCE_UNAVAILABLE');
    return { headSha, entries: tree.tree };
  }
  async blob(sha: string): Promise<string> {
    const blob = await this.request(`/repos/${OWNER}/${REPO}/git/blobs/${encodeURIComponent(sha)}`) as { content?: string; encoding?: string };
    if (blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new HttpsError('unavailable', 'MANUSCRIPT_SOURCE_UNAVAILABLE');
    return Buffer.from(blob.content.replace(/\n/g, ''), 'base64').toString('utf8');
  }
  async commits(path: string, limit: number): Promise<unknown> {
    return this.request(`/repos/${OWNER}/${REPO}/commits?sha=${encodeURIComponent(BRANCH)}&path=${encodeURIComponent(path)}&per_page=${limit}`);
  }
}

export class ManuscriptService {
  private snapshot: Snapshot | null = null;
  private readonly documents = new Map<string, CachedDocument>();
  private indexedHead: string | null = null;
  private index: Array<{ path: string; title: string; content: string }> = [];
  private graph: LinkGraph | null = null;
  private readonly histories = new Map<string, ManuscriptDocumentHistoryResponse>();
  private systemGraph: (ManuscriptSystemGraph & { headSha: string }) | null = null;
  constructor(private readonly github: ManuscriptGitHubClient) {}
  async listTree() {
    if (this.snapshot && this.snapshot.expiresAt > Date.now()) return { headSha: this.snapshot.headSha, documents: this.snapshot.documents };
    const { headSha, entries } = await this.github.headAndTree();
    const documents = filterManuscriptTree(entries);
    if (this.snapshot?.headSha !== headSha) { this.indexedHead = null; this.index = []; this.graph = null; this.documents.clear(); this.histories.clear(); this.systemGraph = null; }
    this.snapshot = { headSha, documents, expiresAt: Date.now() + TREE_TTL_MS };
    return { headSha, documents };
  }
  async getDocument(pathInput: unknown) {
    const path = validateManuscriptPath(pathInput);
    const tree = await this.listTree();
    const document = tree.documents.find((item) => item.path === path);
    if (!document) throw new HttpsError('not-found', 'MANUSCRIPT_DOCUMENT_NOT_FOUND');
    const cached = this.documents.get(document.sha);
    const content = cached?.content ?? await this.github.blob(document.sha);
    this.documents.set(document.sha, { content, headSha: tree.headSha });
    return { path: document.path, sha: document.sha, content, headSha: tree.headSha };
  }
  async search(queryInput: unknown, limitInput: unknown) {
    const query = typeof queryInput === 'string' ? queryInput.trim() : '';
    if (query.length < 2 || query.length > 100) throw new HttpsError('invalid-argument', 'MANUSCRIPT_QUERY_INVALID');
    const limit = typeof limitInput === 'number' && Number.isInteger(limitInput) ? Math.min(Math.max(limitInput, 1), MAX_SEARCH_LIMIT) : 12;
    const tree = await this.listTree();
    if (this.indexedHead !== tree.headSha) {
      this.index = await Promise.all(tree.documents.map(async (document) => {
        const loaded = await this.getDocument(document.path);
        const title = manuscriptTitle(loaded.content, document.name);
        return { path: document.path, title, content: loaded.content };
      }));
      this.indexedHead = tree.headSha;
    }
    const needle = query.toLocaleLowerCase();
    const results = this.index.map((item) => {
      const haystack = `${item.path}\n${item.title}\n${item.content}`.toLocaleLowerCase();
      const first = haystack.indexOf(needle);
      if (first < 0) return null;
      const matches = haystack.split(needle).length - 1;
      const sourceAt = item.content.toLocaleLowerCase().indexOf(needle);
      const start = Math.max(0, sourceAt < 0 ? 0 : sourceAt - 80);
      return { path: item.path, title: item.title, snippet: item.content.slice(start, start + 220).replace(/\s+/g, ' ').trim(), matches };
    }).filter((result): result is { path: string; title: string; snippet: string; matches: number } => result !== null).slice(0, limit);
    return { query, headSha: tree.headSha, results };
  }
  private async linkGraph(tree: { headSha: string; documents: ManuscriptDocument[] }): Promise<LinkGraph> {
    if (this.graph?.headSha === tree.headSha) return this.graph;
    const knownPaths = new Set(tree.documents.map((document) => document.path));
    const loadedDocuments = await Promise.all(tree.documents.map(async (document) => ({ document, loaded: await this.getDocument(document.path) })));
    const backlinks = new Map<string, ManuscriptBacklink[]>();
    const outgoing = new Map<string, ManuscriptGraphEdge[]>();
    const titles = new Map<string, string>();
    const brokenInternalLinks: string[] = [];
    for (const { document, loaded } of loadedDocuments) {
      const title = manuscriptTitle(loaded.content, document.name);
      titles.set(document.path, title);
      for (const link of extractMarkdownLinks(loaded.content)) {
        const target = resolveManuscriptLink(document.path, link.href);
        if (!target) continue;
        if (!knownPaths.has(target.path)) { brokenInternalLinks.push(`${document.path} -> ${target.path}`); continue; }
        const start = Math.max(0, link.offset - 90);
        const context = loaded.content.slice(start, link.offset + link.href.length + 120).replace(/\s+/g, ' ').trim().slice(0, 220);
        const item: ManuscriptBacklink = { sourcePath: document.path, sourceTitle: title, ...(target.anchor ? { anchor: target.anchor } : {}), ...(context ? { context } : {}) };
        const list = backlinks.get(target.path) ?? [];
        list.push(item); backlinks.set(target.path, list);
        const edges = outgoing.get(document.path) ?? [];
        edges.push({ source: document.path, target: target.path, ...(target.anchor ? { anchor: target.anchor } : {}) });
        outgoing.set(document.path, edges);
      }
    }
    this.graph = { headSha: tree.headSha, backlinks, outgoing, titles, brokenInternalLinks };
    return this.graph;
  }
  async getBacklinks(pathInput: unknown): Promise<ManuscriptBacklinksResponse> {
    const path = validateManuscriptPath(pathInput);
    const tree = await this.listTree();
    if (!tree.documents.some((document) => document.path === path)) throw new HttpsError('not-found', 'MANUSCRIPT_DOCUMENT_NOT_FOUND');
    const graph = await this.linkGraph(tree);
    return { path, headSha: tree.headSha, backlinks: graph.backlinks.get(path) ?? [] };
  }
  async getDocumentGraph(pathInput: unknown): Promise<ManuscriptDocumentGraphResponse> {
    const path = validateManuscriptPath(pathInput);
    const tree = await this.listTree();
    if (!tree.documents.some((document) => document.path === path)) throw new HttpsError('not-found', 'MANUSCRIPT_DOCUMENT_NOT_FOUND');
    const graph = await this.linkGraph(tree);
    const incoming = graph.backlinks.get(path) ?? [];
    const outgoing = graph.outgoing.get(path) ?? [];
    const incomingPaths = new Set(incoming.map((item) => item.sourcePath));
    const outgoingPaths = new Set(outgoing.map((item) => item.target));
    const relations = [...new Set([...incomingPaths, ...outgoingPaths])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const visibleRelations = relations.slice(0, MAX_GRAPH_NODES - 1);
    const visible = new Set([path, ...visibleRelations]);
    const nodes: ManuscriptGraphNode[] = [
      { path, title: graph.titles.get(path) ?? path.replace(/\.md$/i, ''), kind: 'CURRENT' },
      ...visibleRelations.map((item): ManuscriptGraphNode => ({
        path: item, title: graph.titles.get(item) ?? item.replace(/\.md$/i, ''),
        kind: item.startsWith('_AUDITORIA/') ? 'AUDIT' : 'REFERENCE',
        direction: incomingPaths.has(item) && outgoingPaths.has(item) ? 'BIDIRECTIONAL' : incomingPaths.has(item) ? 'INCOMING' : 'OUTGOING',
      })),
    ];
    const edges = [...incoming.map((item) => ({ source: item.sourcePath, target: path, ...(item.anchor ? { anchor: item.anchor } : {}) })), ...outgoing]
      .filter((edge) => visible.has(edge.source) && visible.has(edge.target));
    return { path, headSha: tree.headSha, nodes, edges, totalNodes: relations.length + 1, visibleNodes: nodes.length, truncated: relations.length > visibleRelations.length };
  }
  /** Mapa do sistema: documentos e entidades do bloco de dados (00_METADADOS.md), mais os links entre documentos. */
  async getSystemGraph(): Promise<ManuscriptSystemGraph & { headSha: string }> {
    const tree = await this.listTree();
    if (this.systemGraph?.headSha === tree.headSha) return this.systemGraph;
    const links = await this.linkGraph(tree);
    const corpus = tree.documents.filter((document) => !MANUSCRIPT_NAO_CORPUS.includes(document.path));
    const documents = await Promise.all(corpus.map(async (document) => {
      const { content } = await this.getDocument(document.path);
      return { path: document.path, title: links.titles.get(document.path) ?? manuscriptTitle(content, document.name), content, links: [...new Set((links.outgoing.get(document.path) ?? []).map((edge) => edge.target))] };
    }));
    this.systemGraph = { headSha: tree.headSha, ...buildManuscriptSystemGraph(documents) };
    return this.systemGraph;
  }
  /** Leitura do Manuscript usada pelo chat. */
  chatSource(): ManuscriptChatSource {
    return {
      catalog: async () => {
        const tree = await this.listTree();
        const lines = await Promise.all(tree.documents.filter((document) => !MANUSCRIPT_NAO_CORPUS.includes(document.path)).map(async (document) => {
          const { metadata } = parseManuscriptDocument((await this.getDocument(document.path)).content);
          return metadata ? `${document.path} | ${metadata.tipo} | ${metadata.status} | ${metadata.dominios.join(', ')} | ${metadata.resumo}` : `${document.path} | sem bloco de dados`;
        }));
        return lines.join('\n');
      },
      search: async (query) => (await this.search(query, 12)).results,
      read: async (path) => (await this.getDocument(path)).content,
      relations: async (id) => {
        const graph = await this.getSystemGraph();
        const node = graph.nodes.find((item) => item.id === id);
        if (!node) return `"${id}" não existe no mapa. Entidades são escritas como colecao:nome, function:nome, rota:/caminho ou externo:nome; documentos pelo caminho .md.`;
        const label = (target: string) => { const other = graph.nodes.find((item) => item.id === target); return other?.kind === 'DOCUMENTO' ? `${target} (${other.label})` : target; };
        const out = graph.edges.filter((edge) => edge.source === id).map((edge) => `${id} --${edge.relacao}--> ${label(edge.target)}`);
        const incoming = graph.edges.filter((edge) => edge.target === id).map((edge) => `${label(edge.source)} --${edge.relacao}--> ${id}`);
        const header = node.kind === 'DOCUMENTO' ? `${id}: ${node.label} (${node.tipo}, ${node.status ?? 'sem status'})${node.resumo ? ` — ${node.resumo}` : ''}` : `${id}${node.definidoEm ? `, definida em ${node.definidoEm}` : ', sem documento que a defina'}`;
        return [header, ...out, ...incoming].join('\n') || header;
      },
      neighbors: async (id) => {
        const graph = await this.getSystemGraph();
        return [...new Set(graph.edges.flatMap((edge) => (edge.relacao === 'link' ? [] : edge.source === id ? [edge.target] : edge.target === id ? [edge.source] : [])))];
      },
    };
  }
  async getDocumentHistory(pathInput: unknown, limitInput: unknown): Promise<ManuscriptDocumentHistoryResponse> {
    const path = validateManuscriptPath(pathInput);
    const limit = typeof limitInput === 'number' && Number.isInteger(limitInput) ? Math.min(Math.max(limitInput, 1), MAX_HISTORY_LIMIT) : DEFAULT_HISTORY_LIMIT;
    const tree = await this.listTree();
    if (!tree.documents.some((document) => document.path === path)) throw new HttpsError('not-found', 'MANUSCRIPT_DOCUMENT_NOT_FOUND');
    const key = `${tree.headSha}:${path}:${limit}`;
    const cached = this.histories.get(key);
    if (cached) return cached;
    const raw = await this.github.commits(path, limit);
    if (!Array.isArray(raw)) throw new HttpsError('unavailable', 'MANUSCRIPT_SOURCE_UNAVAILABLE');
    const commits = raw.map((item): ManuscriptCommit | null => {
      if (!item || typeof item !== 'object') return null;
      const value = item as { sha?: unknown; html_url?: unknown; commit?: { message?: unknown; author?: { name?: unknown; date?: unknown } }; author?: { login?: unknown } };
      if (typeof value.sha !== 'string' || typeof value.commit?.message !== 'string') return null;
      const authoredAt = value.commit.author?.date;
      if (typeof authoredAt !== 'string') return null;
      return { sha: value.sha, shortSha: value.sha.slice(0, 7), message: value.commit.message.split('\n')[0], authorName: typeof value.commit.author?.name === 'string' ? value.commit.author.name : typeof value.author?.login === 'string' ? value.author.login : 'Desconhecido', authoredAt, ...(typeof value.html_url === 'string' ? { htmlUrl: value.html_url } : {}) };
    }).filter((item): item is ManuscriptCommit => item !== null);
    const response = { path, headSha: tree.headSha, commits };
    this.histories.set(key, response);
    return response;
  }
}

const service = new ManuscriptService(new ManuscriptGitHubClient(() => ({ appId: manuscriptGithubAppId.value(), installationId: manuscriptGithubInstallationId.value(), privateKey: manuscriptGithubPrivateKey.value() })));
async function assertReader(uid: string | undefined) {
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
  const employee = await db.collection('funcionarios').doc(uid).get();
  if (!temCredencial(employee.data())) throw new HttpsError('permission-denied', 'Acesso não autorizado.'); // adm2 only
}
const callableOptions = { region: 'southamerica-east1', secrets: [manuscriptGithubAppId, manuscriptGithubInstallationId, manuscriptGithubPrivateKey], timeoutSeconds: 60 };
export const manuscriptListTree = onCall(callableOptions, async (request) => { try { await assertReader(request.auth?.uid); return await service.listTree(); } catch (error) { throw cleanError(error); } });
export const manuscriptGetDocument = onCall(callableOptions, async (request) => { try { await assertReader(request.auth?.uid); return await service.getDocument(request.data?.path); } catch (error) { throw cleanError(error); } });
export const manuscriptSearch = onCall(callableOptions, async (request) => { try { await assertReader(request.auth?.uid); return await service.search(request.data?.query, request.data?.limit); } catch (error) { throw cleanError(error); } });
export const manuscriptGetBacklinks = onCall(callableOptions, async (request) => { try { await assertReader(request.auth?.uid); return await service.getBacklinks(request.data?.path); } catch (error) { throw cleanError(error); } });
export const manuscriptGetDocumentGraph = onCall(callableOptions, async (request) => { try { await assertReader(request.auth?.uid); return await service.getDocumentGraph(request.data?.path); } catch (error) { throw cleanError(error); } });
export const manuscriptGetDocumentHistory = onCall(callableOptions, async (request) => { try { await assertReader(request.auth?.uid); return await service.getDocumentHistory(request.data?.path, request.data?.limit); } catch (error) { throw cleanError(error); } });
export const manuscriptGetSystemGraph = onCall(callableOptions, async (request) => { try { await assertReader(request.auth?.uid); return await service.getSystemGraph(); } catch (error) { throw cleanError(error); } });
/** Chat do Manuscript: só a credencial retr0 (decisão do responsável de 2026-11-02), paga com os créditos de API. */
export const manuscriptChat = onCall({ ...callableOptions, secrets: [...callableOptions.secrets, anthropicApiKey], timeoutSeconds: 300, memory: '512MiB' }, async (request, response) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    const employee = await db.collection('funcionarios').doc(uid).get();
    if (!temCredencial(employee.data(), 'retr0')) throw new HttpsError('permission-denied', 'Acesso não autorizado.');
    const { history, question } = validateChatInput(request.data?.historico, request.data?.pergunta);
    const apiKey = anthropicApiKey.value();
    if (!apiKey) throw new HttpsError('failed-precondition', 'MANUSCRIPT_CHAT_NOT_CONFIGURED');
    const client = new Anthropic({ apiKey, maxRetries: 2 });
    // Progresso por streaming: a tela acende no mapa o que a IA busca e lê. Sem streaming, sendChunk não faz nada.
    const answer = await answerManuscriptQuestion(client.beta.messages, service.chatSource(), history, question, (evento) => { void response?.sendChunk(evento); });
    console.info('manuscriptChat', { uid, ...answer.uso, consultados: answer.consultados.length });
    return answer;
  } catch (error) {
    if (error instanceof Anthropic.APIError) { console.error('manuscriptChat: Anthropic API', error.status, error.message); throw new HttpsError('unavailable', 'MANUSCRIPT_CHAT_MODEL_UNAVAILABLE'); }
    throw cleanError(error);
  }
});
