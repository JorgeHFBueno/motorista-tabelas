// Chaves da API de leitura do Friday (Function fridayApi), só adm2 (Rules de friday-chaves-api). A chave é gerada aqui,
// mostrada uma vez e guardada só como SHA-256 (id do documento); cada chave vale pela pessoa escolhida (uid).
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export type ChaveApi = { hash: string; uid: string; nome: string; sufixo: string; criado_por: string; criado_em: string; revogada_em: string | null; revogada_por?: string; ultimo_uso?: string };

export const ENDERECO_API = 'https://southamerica-east1-app-motor-api.cloudfunctions.net/fridayApi';
const COLECAO = 'friday-chaves-api';
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
// Data local como o resto do Friday ("AAAA-MM-DD HH:MM:SS").
const agora = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, 19); };

/** "fri_" + 40 letras e números, sorteados pelo navegador (crypto). */
function gerarChave() {
  const bytes = crypto.getRandomValues(new Uint8Array(40));
  return `fri_${Array.from(bytes, b => LETRAS[b % LETRAS.length]).join('')}`;
}
async function sha256(texto: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('');
}

export async function listarChavesApi(): Promise<ChaveApi[]> {
  const s = await getDocs(collection(db, COLECAO));
  return s.docs.map(d => ({ hash: d.id, ...(d.data() as Omit<ChaveApi, 'hash'>) })).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

/** Cria a chave da pessoa e devolve o texto dela (a única vez em que ele existe fora de quem copiou). */
export async function criarChaveApi(uid: string, nome: string, criadoPor: string): Promise<string> {
  const chave = gerarChave();
  await setDoc(doc(db, COLECAO, await sha256(chave)), { uid, nome: nome.trim().slice(0, 80), sufixo: chave.slice(-4), criado_por: criadoPor, criado_em: agora(), revogada_em: null });
  return chave;
}

export async function revogarChaveApi(hash: string, revogadaPor: string) {
  await updateDoc(doc(db, COLECAO, hash), { revogada_em: agora(), revogada_por: revogadaPor });
}
