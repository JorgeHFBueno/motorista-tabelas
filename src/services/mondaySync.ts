import { getAuth } from 'firebase/auth';

export type MondaySyncResult = { mode: 'dry-run' | 'apply'; itemsMonday: number; itemsFirebase: number; itemsCriar: number; itemsAtualizar: number; itemsSemAlteracao: number; itemsAusentesMonday: number; subitemsAdicionar: number; subitemsAtualizar: number; subitemsAusentesMonday: number; fimAtualizar: number; statusAtualizar: number; formulaStatusVazia: number; ordemInicioAtualizar: number; confirmacaoRecursoAtualizar: number; obrasFinalizadasMonday: number; obrasComObraV2Id: number; obrasJaFinalizadas: number; obrasFinalizar: number; erros: string[]; details: Array<{ itemId: string; nome?: string | null; changes?: Array<{ type: string; subitemId?: string }> }> };

export async function synchronizeMonday(mode: 'dry-run' | 'apply'): Promise<MondaySyncResult> {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Faça login para sincronizar o Monday.');
  const token = await user.getIdToken();
  const response = await fetch('/api/monday-sync', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error === 'forbidden' ? 'Você não possui permissão administrativa para sincronizar.' : 'Não foi possível sincronizar o Monday.');
  return result as MondaySyncResult;
}
