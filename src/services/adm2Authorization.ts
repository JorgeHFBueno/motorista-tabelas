import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const AUTHORIZED_COLLECTION = '00-autorizados';

function normalizeEmailForLookup(email: string) {
  return email.trim().toLowerCase();
}

export async function hasAdm2Permission(userEmail: string) {
  const normalizedEmail = normalizeEmailForLookup(userEmail);

  if (!normalizedEmail) {
    return false;
  }

  const authorizedRef = doc(db, AUTHORIZED_COLLECTION, normalizedEmail);
  const authorizedDoc = await getDoc(authorizedRef);

  return authorizedDoc.exists() && authorizedDoc.data().adm2 === true;
}