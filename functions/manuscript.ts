import { createSign } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { db } from './firebaseAdmin.js';

const manuscriptGithubAppId = defineSecret('MANUSCRIPT_GITHUB_APP_ID');
const manuscriptGithubInstallationId = defineSecret('MANUSCRIPT_GITHUB_INSTALLATION_ID');
const manuscriptGithubPrivateKey = defineSecret('MANUSCRIPT_GITHUB_PRIVATE_KEY');
const OWNER = 'JorgeHFBueno';
const REPO = 'ledur-the-manuscript';
const BRANCH = 'main';
const TREE_TTL_MS = 3 * 60_000;
const MAX_SEARCH_LIMIT = 30;

export interface ManuscriptDocument { path: string; name: string; directory: string; sha: string }
interface GitTreeEntry { path: string; type: string; sha: string }
interface Snapshot { headSha: string; documents: ManuscriptDocument[]; expiresAt: number }
interface CachedDocument { content: string; headSha: string }
interface InstallationToken { value: string; expiresAt: number }
export interface ManuscriptBacklink { sourcePath: string; sourceTitle: string; anchor?: string; context?: string }
export interface ManuscriptBacklinksResponse { path: string; headSha: string; backlinks: ManuscriptBacklink[] }
interface LinkGraph { headSha: string; backlinks: Map<string, ManuscriptBacklink[]>; brokenInternalLinks: string[] }

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
  return /^#\s+(.+)$/m.exec(content)?.[1]?.trim() || fallback.replace(/\.md$/i, '');
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
}

export class ManuscriptService {
  private snapshot: Snapshot | null = null;
  private readonly documents = new Map<string, CachedDocument>();
  private indexedHead: string | null = null;
  private index: Array<{ path: string; title: string; content: string }> = [];
  private graph: LinkGraph | null = null;
  constructor(private readonly github: ManuscriptGitHubClient) {}
  async listTree() {
    if (this.snapshot && this.snapshot.expiresAt > Date.now()) return { headSha: this.snapshot.headSha, documents: this.snapshot.documents };
    const { headSha, entries } = await this.github.headAndTree();
    const documents = filterManuscriptTree(entries);
    if (this.snapshot?.headSha !== headSha) { this.indexedHead = null; this.index = []; this.graph = null; this.documents.clear(); }
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
    const brokenInternalLinks: string[] = [];
    for (const { document, loaded } of loadedDocuments) {
      const title = manuscriptTitle(loaded.content, document.name);
      for (const link of extractMarkdownLinks(loaded.content)) {
        const target = resolveManuscriptLink(document.path, link.href);
        if (!target) continue;
        if (!knownPaths.has(target.path)) { brokenInternalLinks.push(`${document.path} -> ${target.path}`); continue; }
        const start = Math.max(0, link.offset - 90);
        const context = loaded.content.slice(start, link.offset + link.href.length + 120).replace(/\s+/g, ' ').trim().slice(0, 220);
        const item: ManuscriptBacklink = { sourcePath: document.path, sourceTitle: title, ...(target.anchor ? { anchor: target.anchor } : {}), ...(context ? { context } : {}) };
        const list = backlinks.get(target.path) ?? [];
        list.push(item); backlinks.set(target.path, list);
      }
    }
    this.graph = { headSha: tree.headSha, backlinks, brokenInternalLinks };
    return this.graph;
  }
  async getBacklinks(pathInput: unknown): Promise<ManuscriptBacklinksResponse> {
    const path = validateManuscriptPath(pathInput);
    const tree = await this.listTree();
    if (!tree.documents.some((document) => document.path === path)) throw new HttpsError('not-found', 'MANUSCRIPT_DOCUMENT_NOT_FOUND');
    const graph = await this.linkGraph(tree);
    return { path, headSha: tree.headSha, backlinks: graph.backlinks.get(path) ?? [] };
  }
}

const service = new ManuscriptService(new ManuscriptGitHubClient(() => ({ appId: manuscriptGithubAppId.value(), installationId: manuscriptGithubInstallationId.value(), privateKey: manuscriptGithubPrivateKey.value() })));
async function assertReader(uid: string | undefined) {
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
  const employee = await db.collection('funcionarios').doc(uid).get();
  if (!employee.exists || employee.data()?.ativo !== true) throw new HttpsError('permission-denied', 'Acesso não autorizado.');
}
const callableOptions = { region: 'southamerica-east1', secrets: [manuscriptGithubAppId, manuscriptGithubInstallationId, manuscriptGithubPrivateKey], timeoutSeconds: 60 };
export const manuscriptListTree = onCall(callableOptions, async (request) => { try { await assertReader(request.auth?.uid); return await service.listTree(); } catch (error) { throw cleanError(error); } });
export const manuscriptGetDocument = onCall(callableOptions, async (request) => { try { await assertReader(request.auth?.uid); return await service.getDocument(request.data?.path); } catch (error) { throw cleanError(error); } });
export const manuscriptSearch = onCall(callableOptions, async (request) => { try { await assertReader(request.auth?.uid); return await service.search(request.data?.query, request.data?.limit); } catch (error) { throw cleanError(error); } });
export const manuscriptGetBacklinks = onCall(callableOptions, async (request) => { try { await assertReader(request.auth?.uid); return await service.getBacklinks(request.data?.path); } catch (error) { throw cleanError(error); } });
