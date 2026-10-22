import { getAuth, updatePassword as fbUpdatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { app } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

// Senha e reautenticação ficam no cliente; nome e login passam pela Function atualizarMeuPerfil (services/meuPerfil.ts).
export default function usePerfil() {
  const { currentUser } = useAuth();
  const auth = getAuth(app);

  async function updatePassword(newPassword: string) {
    if (!currentUser) throw new Error('Usuário não autenticado');
    await fbUpdatePassword(currentUser, newPassword);
  }

  async function reauthenticate(password: string) {
    const email = auth.currentUser?.email;
    if (!auth.currentUser || !email) throw new Error('Usuário não autenticado');
    const credential = EmailAuthProvider.credential(email, password);
    await reauthenticateWithCredential(auth.currentUser, credential);
  }

  return { updatePassword, reauthenticate };
}
