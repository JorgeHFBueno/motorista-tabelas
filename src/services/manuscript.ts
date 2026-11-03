import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { ManuscriptSystemGraph } from '../../functions/manuscriptMetadata';

export interface ManuscriptDocument { path: string; name: string; directory: string; sha: string }
export interface ManuscriptSearchResult { path: string; title: string; snippet: string; matches: number }
export interface ManuscriptBacklink { sourcePath: string; sourceTitle: string; anchor?: string; context?: string }
export interface ManuscriptBacklinksResponse { path: string; headSha: string; backlinks: ManuscriptBacklink[] }
export interface ManuscriptGraphNode { path: string; title: string; kind: 'CURRENT' | 'REFERENCE' | 'AUDIT'; direction?: 'INCOMING' | 'OUTGOING' | 'BIDIRECTIONAL' }
export interface ManuscriptGraphEdge { source: string; target: string; anchor?: string }
export interface ManuscriptDocumentGraphResponse { path: string; headSha: string; nodes: ManuscriptGraphNode[]; edges: ManuscriptGraphEdge[]; totalNodes: number; visibleNodes: number; truncated: boolean }
export interface ManuscriptCommit { sha: string; shortSha: string; message: string; authorName: string; authoredAt: string; htmlUrl?: string }
export interface ManuscriptDocumentHistoryResponse { path: string; headSha: string; commits: ManuscriptCommit[] }
export const manuscriptListTree = async () => (await httpsCallable<undefined, { headSha: string; documents: ManuscriptDocument[] }>(functions, 'manuscriptListTree')()).data;
export const manuscriptGetDocument = async (path: string) => (await httpsCallable<{ path: string }, { path: string; sha: string; content: string; headSha: string }>(functions, 'manuscriptGetDocument')({ path })).data;
export const manuscriptSearch = async (query: string, limit = 12) => (await httpsCallable<{ query: string; limit: number }, { query: string; headSha: string; results: ManuscriptSearchResult[] }>(functions, 'manuscriptSearch')({ query, limit })).data;
export const manuscriptGetBacklinks = async (path: string) => (await httpsCallable<{ path: string }, ManuscriptBacklinksResponse>(functions, 'manuscriptGetBacklinks')({ path })).data;
export const manuscriptGetDocumentGraph = async (path: string) => (await httpsCallable<{ path: string }, ManuscriptDocumentGraphResponse>(functions, 'manuscriptGetDocumentGraph')({ path })).data;
export const manuscriptGetDocumentHistory = async (path: string, limit = 10) => (await httpsCallable<{ path: string; limit: number }, ManuscriptDocumentHistoryResponse>(functions, 'manuscriptGetDocumentHistory')({ path, limit })).data;
export type { ManuscriptSystemEdge, ManuscriptSystemNode, ManuscriptCheckProblem } from '../../functions/manuscriptMetadata';
export type ManuscriptSystemGraphResponse = ManuscriptSystemGraph & { headSha: string };
export interface ManuscriptChatTurn { role: 'user' | 'assistant'; text: string }
export interface ManuscriptChatAnswer { resposta: string; consultados: string[]; uso: { entrada: number; cacheGravado: number; cacheLido: number; saida: number } }
export const manuscriptGetSystemGraph = async () => (await httpsCallable<undefined, ManuscriptSystemGraphResponse>(functions, 'manuscriptGetSystemGraph')()).data;
// O chat pode levar alguns minutos (a Function tem 300 s).
export const manuscriptChat = async (pergunta: string, historico: ManuscriptChatTurn[]) => (await httpsCallable<{ pergunta: string; historico: ManuscriptChatTurn[] }, ManuscriptChatAnswer>(functions, 'manuscriptChat', { timeout: 300_000 })({ pergunta, historico })).data;
