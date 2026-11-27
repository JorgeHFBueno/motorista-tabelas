// APIs por área e as chaves delas (tela Cadastros → APIs, só adm2). Cada API é de uma área: tem a própria Function, o
// próprio prefixo de chave, o próprio cabeçalho e a própria coleção <area>-chaves-api (The Manuscript,
// 02_APIS_FUNCTIONS/10_APIS_POR_AREA.md). A chave é gerada aqui, mostrada uma vez e guardada só como SHA-256 (id do
// documento); vale por uma pessoa da área; é revogada e nunca apagada. "ultimo_uso" e "ultima_escrita" são gravados
// pelas Functions.
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Area } from './areasWeb';
import { dataLocal, gerarChave, sha256Hex } from './chaveApi';

export type ChaveApi = {
  hash: string; uid: string; nome: string; sufixo: string; escrita?: boolean; criado_por: string; criado_em: string;
  revogada_em: string | null; revogada_por?: string; ultimo_uso?: string; ultima_escrita?: string;
};

export type ApiDeArea = {
  id: 'friday' | 'cronoobra' | 'prefabricados' | 'cronolog';
  titulo: string;
  /** Área da WEB que a pessoa da chave precisa ver (adm2 vê todas). */
  area: Area;
  colecao: string;
  prefixo: string;
  cabecalho: string;
  endereco: string;
  /** Nome do servidor no `claude mcp add`; sem MCP (API só para robôs), ausente. */
  mcp?: string;
  /** A API aceita chave de escrita (definida na criação, não muda depois). */
  escrita: boolean;
};

const BASE = 'https://southamerica-east1-app-motor-api.cloudfunctions.net';

export const API_FRIDAY: ApiDeArea = {
  id: 'friday', titulo: 'Friday', area: 'friday', colecao: 'friday-chaves-api', prefixo: 'fri_', cabecalho: 'X-Friday-Chave',
  endereco: `${BASE}/fridayApi`, mcp: 'friday', escrita: true,
};

export const API_CRONOOBRA: ApiDeArea = {
  id: 'cronoobra', titulo: 'CronoObra (Cronograma de Obras)', area: 'engenharia', colecao: 'cronoobra-chaves-api', prefixo: 'encr_',
  cabecalho: 'X-CronoObra-Chave', endereco: `${BASE}/cronoObraApi`, mcp: 'cronoobra', escrita: false,
};

export const API_PREFABRICADOS: ApiDeArea = {
  id: 'prefabricados', titulo: 'Pré-Fabricados (PDFs)', area: 'engenharia', colecao: 'prefabricados-chaves-api', prefixo: 'enpf_',
  cabecalho: 'X-PreFabricados-Chave', endereco: `${BASE}/preFabricadosApi`, escrita: false,
};

export const API_CRONOLOG: ApiDeArea = {
  id: 'cronolog', titulo: 'CronoLog (Cronograma Logístico)', area: 'logistica', colecao: 'cronolog-chaves-api', prefixo: 'lgcr_',
  cabecalho: 'X-CronoLog-Chave', endereco: `${BASE}/cronoLogApi`, escrita: false,
};

export const APIS: readonly ApiDeArea[] = [API_FRIDAY, API_CRONOOBRA, API_PREFABRICADOS, API_CRONOLOG];

export async function listarChaves(api: ApiDeArea): Promise<ChaveApi[]> {
  const s = await getDocs(collection(db, api.colecao));
  return s.docs.map((d) => ({ hash: d.id, ...(d.data() as Omit<ChaveApi, 'hash'>) })).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

/** Cria a chave da pessoa e devolve o texto dela (a única vez em que ele existe fora de quem copiou). */
export async function criarChave(api: ApiDeArea, uid: string, nome: string, criadoPor: string, escrita = false): Promise<string> {
  const chave = gerarChave(api.prefixo);
  await setDoc(doc(db, api.colecao, await sha256Hex(chave)), {
    uid, nome: nome.trim().slice(0, 80), sufixo: chave.slice(-4), ...(api.escrita && escrita ? { escrita: true } : {}),
    criado_por: criadoPor, criado_em: dataLocal(), revogada_em: null,
  });
  return chave;
}

export async function revogarChave(api: ApiDeArea, hash: string, revogadaPor: string) {
  await updateDoc(doc(db, api.colecao, hash), { revogada_em: dataLocal(), revogada_por: revogadaPor });
}
