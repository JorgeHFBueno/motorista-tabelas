import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { createAuthorizationProfileReader } from './authorizationProfileCore';
export type { AuthorizationProfile, FuncionarioDocument } from './authorizationProfileCore';
export { createAuthorizationProfileReader, emptyAuthorizationProfile } from './authorizationProfileCore';

const EMPLOYEES_COLLECTION = 'funcionarios';

// currentUser.uid is used literally as the canonical Firestore document ID.
const readAuthorizationProfile = createAuthorizationProfileReader(async (uid) => (
  getDoc(doc(db, EMPLOYEES_COLLECTION, uid))
));

export function getAuthorizationProfile(uid: string) {
  return readAuthorizationProfile(uid);
}

// Último acesso ao sistema: gravado ao abrir a WEB (as Rules só deixam a pessoa mudar o próprio ultimoAcesso).
export function registrarUltimoAcesso(uid: string) {
  return updateDoc(doc(db, EMPLOYEES_COLLECTION, uid), { ultimoAcesso: serverTimestamp() });
}

// Documento completo do próprio funcionário, para a página Meu perfil (somente leitura; Rules não permitem escrita).
export async function getFuncionarioData(uid: string) {
  const snapshot = await getDoc(doc(db, EMPLOYEES_COLLECTION, uid));
  return snapshot.exists() ? snapshot.data() : null;
}
