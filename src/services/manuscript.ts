import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export interface ManuscriptDocument { path: string; name: string; directory: string; sha: string }
export interface ManuscriptSearchResult { path: string; title: string; snippet: string; matches: number }
export const manuscriptListTree = async () => (await httpsCallable<undefined, { headSha: string; documents: ManuscriptDocument[] }>(functions, 'manuscriptListTree')()).data;
export const manuscriptGetDocument = async (path: string) => (await httpsCallable<{ path: string }, { path: string; sha: string; content: string; headSha: string }>(functions, 'manuscriptGetDocument')({ path })).data;
export const manuscriptSearch = async (query: string, limit = 12) => (await httpsCallable<{ query: string; limit: number }, { query: string; headSha: string; results: ManuscriptSearchResult[] }>(functions, 'manuscriptSearch')({ query, limit })).data;
