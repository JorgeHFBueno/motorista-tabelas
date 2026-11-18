// Chaves de API do sistema (fora do Friday), só adm2: cada chave vale por uma pessoa e abre, em cada rota da Function
// sistemaApi, o que as áreas da WEB dessa pessoa abrem (hoje, a consulta do Cronograma de Obras, área engenharia). O
// modelo é o das chaves do Friday (friday-chaves-api): gerada aqui, mostrada uma vez, guardada só como SHA-256 (id do
// documento), revogada e nunca apagada. Só consulta. "ultimo_uso" é gravado pela Function.
// Pendentes do responsável: a Function sistemaApi e as Rules de chaves-api (pedido no pull request).
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { dataLocal, gerarChave, sha256Hex } from './chaveApi';

export type ChaveSistema = { hash: string; uid: string; nome: string; sufixo: string; criado_por: string; criado_em: string; revogada_em: string | null; revogada_por?: string; ultimo_uso?: string };

export const ENDERECO_SISTEMA_API = 'https://southamerica-east1-app-motor-api.cloudfunctions.net/sistemaApi';
export const CABECALHO_CHAVE_SISTEMA = 'X-Sistema-Chave';
export const PREFIXO_CHAVE_SISTEMA = 'sis_';
const COLECAO = 'chaves-api';

export async function listarChavesSistema(): Promise<ChaveSistema[]> {
  const s = await getDocs(collection(db, COLECAO));
  return s.docs.map((d) => ({ hash: d.id, ...(d.data() as Omit<ChaveSistema, 'hash'>) })).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

/** Cria a chave da pessoa e devolve o texto dela (a única vez em que ele existe fora de quem copiou). */
export async function criarChaveSistema(uid: string, nome: string, criadoPor: string): Promise<string> {
  const chave = gerarChave(PREFIXO_CHAVE_SISTEMA);
  await setDoc(doc(db, COLECAO, await sha256Hex(chave)), { uid, nome: nome.trim().slice(0, 80), sufixo: chave.slice(-4), criado_por: criadoPor, criado_em: dataLocal(), revogada_em: null });
  return chave;
}

export async function revogarChaveSistema(hash: string, revogadaPor: string) {
  await updateDoc(doc(db, COLECAO, hash), { revogada_em: dataLocal(), revogada_por: revogadaPor });
}
