import { getAuth, updateEmail as fbUpdateEmail, updatePassword as fbUpdatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, getDoc, getFirestore, updateDoc } from 'firebase/firestore';
import { app } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function usePerfil() {
  const { currentUser } = useAuth();
  const auth = getAuth(app);
  const db = getFirestore(app);

  async function getPerfil() {
    if (!currentUser) throw new Error('Usuário não autenticado');
    const ref = doc(db, 'users', currentUser.uid);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  }

  async function updateEmail(newEmail: string) {
    if (!currentUser) throw new Error('Usuário não autenticado');
    await fbUpdateEmail(currentUser, newEmail);
    const ref = doc(db, 'users', currentUser.uid);
    await updateDoc(ref, { displayName: newEmail });
  }

  async function updatePassword(newPassword: string) {
    if (!currentUser) throw new Error('Usuário não autenticado');
    await fbUpdatePassword(currentUser, newPassword);
  }

  async function reauthenticate(password: string) {
    if (!currentUser?.email) throw new Error('Usuário não autenticado');
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);
  }

  return { getPerfil, updateEmail, updatePassword, reauthenticate };
}