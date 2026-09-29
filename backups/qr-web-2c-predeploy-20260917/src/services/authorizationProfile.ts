import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const AUTHORIZED_COLLECTION = '00-autorizados';
const EMPLOYEES_COLLECTION = 'funcionarios';

export interface AuthorizationProfile {
  exists: boolean;
  source: 'funcionarios' | '00-autorizados' | null;
  ativo: boolean;
  adm1: boolean;
  adm2: boolean;
  user: boolean;
  motorista: boolean;
  id: string | null;
  nome: string | null;
}

function normalizeEmailForLookup(email: string) {
  return email.trim().toLowerCase();
}

function emptyProfile(): AuthorizationProfile {
  return { exists: false, source: null, ativo: false, adm1: false, adm2: false, user: false, motorista: false, id: null, nome: null };
}

export async function getAuthorizationProfile(userUid: string, userEmail?: string | null, options: { allowLegacyFallback?: boolean } = {}): Promise<AuthorizationProfile> {
  if (!userUid.trim()) return emptyProfile();

  const employeeDoc = await getDoc(doc(db, EMPLOYEES_COLLECTION, userUid.trim()));
  if (employeeDoc.exists()) {
    const data = employeeDoc.data();
    const profiles = data.perfis && typeof data.perfis === 'object' ? data.perfis : {};
    return {
      exists: true,
      source: 'funcionarios',
      ativo: data.ativo === true,
      adm1: profiles.adm1 === true,
      adm2: profiles.adm2 === true,
      user: profiles.user === true,
      motorista: profiles.motorista === true,
      id: employeeDoc.id,
      nome: typeof data.nome === 'string' && data.nome.trim() ? data.nome.trim() : null,
    };
  }

  if (options.allowLegacyFallback === false) {
    return emptyProfile();
  }

  const normalizedEmail = normalizeEmailForLookup(userEmail ?? '');

  if (!normalizedEmail) {
    return emptyProfile();
  }

  const authorizedRef = doc(db, AUTHORIZED_COLLECTION, normalizedEmail);
  const authorizedDoc = await getDoc(authorizedRef);

  if (!authorizedDoc.exists()) {
    return emptyProfile();
  }

  const data = authorizedDoc.data();

  return {
    exists: true,
    source: '00-autorizados',
    ativo: data.ativo !== false && data.active !== false,
    adm1: data.adm1 === true,
    adm2: data.adm2 === true,
    user: false,
    motorista: false,
    id: authorizedDoc.id,
    nome: typeof data.nome === 'string' && data.nome.trim() ? data.nome.trim() : null,
  };
}
