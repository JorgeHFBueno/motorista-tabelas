// Chaves da API de leitura do Friday (Function fridayApi), só adm2 (Rules de friday-chaves-api). A chave é gerada aqui,
// mostrada uma vez e guardada só como SHA-256 (id do documento); cada chave vale pela pessoa escolhida (uid).
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { dataLocal as agora, gerarChave as gerarComPrefixo, sha256Hex as sha256 } from '../../services/chaveApi';

// escrita: a chave também grava (POST); definida na criação e não muda. ultima_escrita é gravada pela Function.
export type ChaveApi = { hash: string; uid: string; nome: string; sufixo: string; escrita?: boolean; criado_por: string; criado_em: string; revogada_em: string | null; revogada_por?: string; ultimo_uso?: string; ultima_escrita?: string };

export const ENDERECO_API = 'https://southamerica-east1-app-motor-api.cloudfunctions.net/fridayApi';
const COLECAO = 'friday-chaves-api';

/** "fri_" + 40 letras e números, sorteados pelo navegador (crypto). */
const gerarChave = () => gerarComPrefixo('fri_');

export async function listarChavesApi(): Promise<ChaveApi[]> {
  const s = await getDocs(collection(db, COLECAO));
  return s.docs.map(d => ({ hash: d.id, ...(d.data() as Omit<ChaveApi, 'hash'>) })).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

/** Cria a chave da pessoa e devolve o texto dela (a única vez em que ele existe fora de quem copiou). */
export async function criarChaveApi(uid: string, nome: string, criadoPor: string, escrita: boolean): Promise<string> {
  const chave = gerarChave();
  await setDoc(doc(db, COLECAO, await sha256(chave)), { uid, nome: nome.trim().slice(0, 80), sufixo: chave.slice(-4), ...(escrita ? { escrita: true } : {}), criado_por: criadoPor, criado_em: agora(), revogada_em: null });
  return chave;
}

export async function revogarChaveApi(hash: string, revogadaPor: string) {
  await updateDoc(doc(db, COLECAO, hash), { revogada_em: agora(), revogada_por: revogadaPor });
}
