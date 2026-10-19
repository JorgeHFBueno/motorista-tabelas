import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export interface ManuscriptDocument { path: string; name: string; directory: string; sha: string }
export interface ManuscriptSearchResult { path: string; title: string; snippet: string; matches: number }
export interface ManuscriptBacklink { sourcePath: string; sourceTitle: string; anchor?: string; context?: string }
export interface ManuscriptBacklinksResponse { path: string; headSha: string; backlinks: ManuscriptBacklink[] }
export const manuscriptListTree = async () => (await httpsCallable<undefined, { headSha: string; documents: ManuscriptDocument[] }>(functions, 'manuscriptListTree')()).data;
export const manuscriptGetDocument = async (path: string) => (await httpsCallable<{ path: string }, { path: string; sha: string; content: string; headSha: string }>(functions, 'manuscriptGetDocument')({ path })).data;
export const manuscriptSearch = async (query: string, limit = 12) => (await httpsCallable<{ query: string; limit: number }, { query: string; headSha: string; results: ManuscriptSearchResult[] }>(functions, 'manuscriptSearch')({ query, limit })).data;
export const manuscriptGetBacklinks = async (path: string) => (await httpsCallable<{ path: string }, ManuscriptBacklinksResponse>(functions, 'manuscriptGetBacklinks')({ path })).data;
