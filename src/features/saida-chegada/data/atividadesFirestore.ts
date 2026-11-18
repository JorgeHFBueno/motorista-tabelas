// Leituras e a gravação da Saída/Chegada, iguais às do app (AtividadesRepository, ObrasRepository). Sem conexão, as
// leituras vêm do cache do Firestore (src/firebase.ts liga a persistência): num aparelho que nunca abriu a tela com
// internet, as listas ficam vazias.
import { Timestamp, collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { listObrasAtivas } from '../../../services/obras.service';
import { listVeiculosAtivos } from '../../../services/veiculos.service';
import { obraFromV2, type ItemFrotaV2, type ObraV2 } from '../../../utils/cadastrosV2';
import { FABRICA_ID, deveAtualizarKm, documentoAtividade, veiculoDaAtividade, type AtividadePendente, type Pessoa } from '../domain/atividade';
import type { DestinoAtividades } from '../domain/enviador';

/** Placas ativas, por identificador. */
export async function listarVeiculosAtividade(): Promise<ItemFrotaV2[]> {
  return (await listVeiculosAtivos()).filter(veiculoDaAtividade);
}

/** Obras de `obras-v2` sem as finalizadas, para a Saída. */
export const listarObrasAtividade = listObrasAtivas;

/** A obra Fábrica, gravada em toda Chegada. */
export async function lerFabrica(): Promise<ObraV2 | null> {
  const snapshot = await getDoc(doc(db, 'obras-v2', FABRICA_ID));
  return snapshot.exists() ? obraFromV2(snapshot.id, snapshot.data()) : null;
}

/** Quem tem a credencial `motorista` (o adm2 registra por um deles), por nome. */
export async function listarMotoristas(): Promise<Pessoa[]> {
  const snapshot = await getDocs(query(collection(db, 'funcionarios'), where('ativo', '==', true), where('perfis.motorista', '==', true)));
  return snapshot.docs
    .map((d) => ({ uid: d.id, nome: typeof d.data().nome === 'string' ? (d.data().nome as string).trim() : '' }))
    .filter((m) => m.nome !== '')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export type AtividadeHistorico = {
  id: string;
  tipo: 'saida' | 'chegada';
  data: Date | null;
  identificador: string;
  km: number | null;
  obra: string;
  local: string;
  motivo: string;
  /** Só nos enviados agora por este aparelho (o adm2 pode registrar por outro motorista). */
  motorista?: Pessoa;
};

const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');
const registro = (valor: unknown): Record<string, unknown> =>
  valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Record<string, unknown> : {};

/** Histórico do motorista: as Saídas e Chegadas dele, da mais nova à mais antiga (ordenado no cliente: sem índice composto). */
export async function listarHistoricoDoMotorista(uid: string): Promise<AtividadeHistorico[]> {
  const snapshot = await getDocs(query(collection(db, 'atividades'), where('motorista.uid', '==', uid)));
  return snapshot.docs
    .map((d): AtividadeHistorico => {
      const dados = d.data();
      const obra = registro(dados.id_obra_snap);
      const data = dados.data instanceof Timestamp ? dados.data.toDate() : null;
      return {
        id: d.id,
        tipo: dados.tipo === 'chegada' ? 'chegada' : 'saida',
        data,
        identificador: texto(registro(dados.item_frota_snapshot).identificador),
        km: typeof dados.km === 'number' ? dados.km : null,
        obra: texto(obra.nomeObra),
        local: texto(dados.local) || texto(dados.destino),
        motivo: texto(dados.motivo),
      };
    })
    .sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0));
}

/** Gravação numa transação, como no app: reenvio não duplica e o KM do veículo só sobe. */
export const destinoFirebase: DestinoAtividades = {
  async gravar(pendente: AtividadePendente) {
    const atividade = doc(db, 'atividades', pendente.id);
    const veiculo = doc(db, 'veiculos-v2', pendente.itemFrotaId);
    await runTransaction(db, async (tx) => {
      if ((await tx.get(atividade)).exists()) return;
      const dadosVeiculo = await tx.get(veiculo);
      if (!dadosVeiculo.exists()) throw new Error(`O veículo ${pendente.itemFrotaSnapshot.identificador} não está mais no cadastro.`);
      tx.set(atividade, documentoAtividade(pendente, Timestamp.fromDate(pendente.lancadoEm), serverTimestamp()));
      const atual = registro(dadosVeiculo.data().operacional).quilometragemUltima;
      if (deveAtualizarKm(typeof atual === 'number' ? Math.trunc(atual) : null, pendente.km)) {
        tx.update(veiculo, { 'operacional.quilometragemUltima': pendente.km, 'operacional.dataUltimaAtualizacao': serverTimestamp() });
      }
    });
  },
};
