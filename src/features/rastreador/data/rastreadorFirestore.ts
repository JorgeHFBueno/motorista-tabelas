// Leitura das viagens do rastreador e do estado dos veículos (só a Function grava) e a atribuição manual do motorista.
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { calibracaoDoDocumento, toDate, viagemDoDocumento, type PessoaRef, type VeiculoRastreador, type ViagemRastreador } from '../domain/viagem';

export const VIAGENS = 'atividades-rastreador';
export const VEICULOS = 'atividades-rastreador-veiculos';

export function observarViagens(onData: (viagens: ViagemRastreador[]) => void, onError: (error: Error) => void) {
  return onSnapshot(collection(db, VIAGENS), (snapshot) => {
    onData(snapshot.docs.map((d) => viagemDoDocumento(d.id, d.data())).filter((v): v is ViagemRastreador => v !== null)
      .sort((a, b) => b.saida.data.getTime() - a.saida.data.getTime()));
  }, onError);
}

export function observarVeiculos(onData: (veiculos: VeiculoRastreador[]) => void, onError: (error: Error) => void) {
  return onSnapshot(collection(db, VEICULOS), (snapshot) => {
    onData(snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        identificador: typeof data.identificador === 'string' ? data.identificador : d.id,
        temRastreador: Boolean(data.rastreador),
        ultimaComunicacao: toDate(data.ultimaComunicacao),
        erro: typeof data.erro?.mensagem === 'string' ? data.erro.mensagem : null,
        calibracao: calibracaoDoDocumento(data.calibracao),
      };
    }));
  }, onError);
}

/** Motorista atribuído à mão (Mecânica editar), assinado por quem atribuiu. */
export function atribuirMotorista(viagemId: string, motorista: { uid: string; nome: string }, eu: PessoaRef & { uid: string }) {
  return updateDoc(doc(db, VIAGENS, viagemId), {
    motorista: { uid: motorista.uid, nome: motorista.nome },
    motoristaOrigem: 'manual',
    motoristaAtribuidoPor: { uid: eu.uid, nome: eu.nome },
    motoristaAtribuidoEm: serverTimestamp(),
  });
}
