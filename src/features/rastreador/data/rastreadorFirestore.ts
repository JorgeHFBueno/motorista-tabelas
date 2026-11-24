// Leitura das viagens do rastreador (pelo período) e do estado dos veículos (um documento só; só a Function grava), a
// atribuição manual do motorista e o "Buscar no rastreador" de uma placa.
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../firebase';
import { calibracaoDoDocumento, toDate, viagemDoDocumento, type PessoaRef, type VeiculoRastreador, type ViagemRastreador } from '../domain/viagem';

export const VIAGENS = 'atividades-rastreador';
export const VEICULOS = 'atividades-rastreador-veiculos';
/** O estado de todos os veículos fica em `atividades-rastreador-veiculos/frota` (uma leitura, não uma por veículo). */
export const FROTA = 'frota';

/** Viagens com saída desde `desde`: a tela não lê a coleção inteira, que cresce todo dia. */
export function observarViagens(desde: Date, onData: (viagens: ViagemRastreador[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(collection(db, VIAGENS), where('saida.data', '>=', desde)), (snapshot) => {
    onData(snapshot.docs.map((d) => viagemDoDocumento(d.id, d.data())).filter((v): v is ViagemRastreador => v !== null)
      .sort((a, b) => b.saida.data.getTime() - a.saida.data.getTime()));
  }, onError);
}

export function observarVeiculos(onData: (veiculos: VeiculoRastreador[]) => void, onError: (error: Error) => void) {
  return onSnapshot(doc(db, VEICULOS, FROTA), (snapshot) => {
    type Estado = { identificador?: unknown; rastreador?: unknown; ultimaComunicacao?: unknown; erro?: { mensagem?: unknown } | null; calibracao?: unknown };
    const veiculos = (snapshot.get('veiculos') ?? {}) as Record<string, Estado>;
    onData(Object.entries(veiculos).map(([id, data]) => {
      return {
        id,
        identificador: typeof data.identificador === 'string' && data.identificador ? data.identificador : id,
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

export type ResumoBusca = { viagensGravadas: number; atividadesGravadas: number; aCompletar: number; erros: string[] };

/** Lê agora o histórico de um veículo no rastreador (Function rastreadorBuscarPlaca; quem edita a Mecânica). */
export async function buscarNoRastreador(itemFrotaId: string) {
  const resultado = await httpsCallable<{ itemFrotaId: string }, ResumoBusca>(functions, 'rastreadorBuscarPlaca', { timeout: 300_000 })({ itemFrotaId });
  return resultado.data;
}
