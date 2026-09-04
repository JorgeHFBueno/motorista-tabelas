import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const AUTHORIZED_COLLECTION = '00-autorizados';

export interface AuthorizationProfile {
  exists: boolean;
  adm1: boolean;
  adm2: boolean;
  id: string | null;
  nome: string | null;
}

function normalizeEmailForLookup(email: string) {
  return email.trim().toLowerCase();
}

export async function getAuthorizationProfile(userEmail: string): Promise<AuthorizationProfile> {
  const normalizedEmail = normalizeEmailForLookup(userEmail);

  if (!normalizedEmail) {
    return { exists: false, adm1: false, adm2: false, id: null, nome: null };
  }

  const authorizedRef = doc(db, AUTHORIZED_COLLECTION, normalizedEmail);
  const authorizedDoc = await getDoc(authorizedRef);

  if (!authorizedDoc.exists()) {
    return { exists: false, adm1: false, adm2: false, id: null, nome: null };
  }

  const data = authorizedDoc.data();

  return {
    exists: true,
    adm1: data.adm1 === true,
    adm2: data.adm2 === true,
    id: authorizedDoc.id,
    nome: typeof data.nome === 'string' && data.nome.trim() ? data.nome.trim() : null,
  };
}
