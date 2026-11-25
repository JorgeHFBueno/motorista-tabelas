// Avisos do sistema: avisos/{uid}/itens/{id}, um documento por aviso de cada pessoa. Quem grava é cada área
// (Friday, portal, ...), com a rota da tela que o aviso abre; aqui só se lê e marca como lido.
// As Rules deixam cada pessoa ler e marcar como lidos só os próprios avisos.
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { lerAviso, type Aviso } from './avisosCore';

const meus = (uid: string) => collection(db, 'avisos', uid, 'itens');

/** Os 50 avisos mais recentes da pessoa, em tempo real. */
export function observarAvisos(uid: string, aoMudar: (lista: Aviso[]) => void): () => void {
  return onSnapshot(
    query(meus(uid), orderBy('criadoEm', 'desc'), limit(50)),
    snap => aoMudar(snap.docs.map(d => lerAviso(d.id, d.data()))),
    e => console.warn('[avisos] indisponíveis', e),
  );
}

export const marcarAvisoComoLido = (uid: string, id: string) => updateDoc(doc(meus(uid), id), { lida: true });
export const marcarAvisoComoNaoLido = (uid: string, id: string) => updateDoc(doc(meus(uid), id), { lida: false });

const chamarReagir = httpsCallable<{ avisoId: string; emoji: string | null }, { ok: boolean }>(functions, 'avisosReagir');
/** Reage ao aviso (emoji null tira a reação). A Function grava em todas as cópias e, na primeira vez, avisa os envolvidos. */
export const reagirAoAviso = (avisoId: string, emoji: string | null) => chamarReagir({ avisoId, emoji });

export async function marcarTodosComoLidos(uid: string) {
  const snap = await getDocs(query(meus(uid), where('lida', '==', false)));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const lote = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach(d => lote.update(d.ref, { lida: true }));
    await lote.commit();
  }
}
