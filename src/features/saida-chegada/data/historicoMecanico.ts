// Leituras dos resumos do mecânico no Meu histórico: os checklists e as revisões mais recentes de todos os mecânicos e,
// deste aparelho, os ainda não enviados.
import { listarChecklistsRecentes } from '../../checklist-mecanico/data/checklistFirestore';
import { enviador as enviadorChecklist } from '../../checklist-mecanico/data/filaEnvio';
import { enviador as enviadorRevisao } from '../../revisao/data/filaEnvio';
import { listarRevisoes } from '../../revisao/data/revisaoFirestore';
import { juntarResumos, type ResumoMecanico } from '../domain/resumoMecanico';

/** Quantos checklists o Meu histórico mostra (como o adm2 no app); as revisões são as 100 abertas por último. */
export const LIMITE_CHECKLISTS = 50;

export async function carregarResumosDoMecanico(): Promise<ResumoMecanico[]> {
  const [checklists, checklistsPendentes, revisoes, revisoesPendentes] = await Promise.all([
    listarChecklistsRecentes(LIMITE_CHECKLISTS),
    enviadorChecklist.pendentesDoUsuario(),
    listarRevisoes(),
    enviadorRevisao.pendentesDoUsuario(),
  ]);
  return juntarResumos({ checklists, checklistsPendentes, revisoes, revisoesPendentes });
}
