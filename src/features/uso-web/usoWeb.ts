import { collection, doc, getDocs, increment, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { diaBrasilia, idDoUso, registroDeUso, type RegistroDeUso } from './usoWebCore';

const COLECAO = 'uso-web';

/** +1 abertura da tela no dia (Brasília) da pessoa: um documento por pessoa e dia, com um contador por tela. */
export function registrarAbertura(uid: string, tela: string) {
  const dia = diaBrasilia(new Date());
  return setDoc(
    doc(db, COLECAO, idDoUso(uid, dia)),
    { uid, dia, telas: { [tela]: increment(1) }, atualizadoEm: serverTimestamp() },
    { merge: true },
  );
}

/** Registros a partir do dia (AAAA-MM-DD), de todas as pessoas (Rules: só o adm2 lê). */
export async function listarUso(desde: string): Promise<RegistroDeUso[]> {
  const snapshot = await getDocs(query(collection(db, COLECAO), where('dia', '>=', desde)));
  return snapshot.docs.map((d) => registroDeUso(d.data())).filter((r): r is RegistroDeUso => r !== null);
}
