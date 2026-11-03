// Regras do checklist, iguais às do app Flutter (lib/features/checklist/checklist_regras.dart).
import { observacaoObrigatoria, todosOsItens, usaHorimetro, type ChecklistItemDef } from './catalogo';
import {
  catalogoDoRascunho, comResposta, itensDoRascunho, respostaDe, type ChecklistRascunho, type ChecklistStatus,
} from './rascunho';

/** Motivo que impede concluir; `itemId` nulo para o cabeçalho (medidor, motorista). */
export type ChecklistPendencia = { mensagem: string; itemId: string | null };

/** Medidor menor que o último do cadastro (pede a confirmação do mecânico). */
export const medidorAbaixoDoUltimo = (valor: number | null, ultimo: number | null) =>
  valor != null && ultimo != null && valor < ultimo;

/** Erro do medidor, ou null quando válido. Igual ao último é aceito; menor só com a confirmação (`corrigido`). */
export function validarMedidor(
  valor: number | null,
  opcoes: { ultimo: number | null; horimetro: boolean; corrigido?: boolean },
): string | null {
  const nome = opcoes.horimetro ? 'horímetro' : 'KM';
  if (valor == null) return `Informe o ${nome}.`;
  if (valor < 0) return `O ${nome} não pode ser negativo.`;
  if (medidorAbaixoDoUltimo(valor, opcoes.ultimo) && !opcoes.corrigido) {
    return `O ${nome} está menor que o último registrado (${opcoes.ultimo}). Confira o valor ou marque que ele é o correto.`;
  }
  return null;
}

/** Novo valor do medidor: mudar o valor desfaz a confirmação de correção. */
export const comMedidor = (r: ChecklistRascunho, medidor: number | null): ChecklistRascunho =>
  medidor === r.medidor ? r : { ...r, medidor, medidorCorrigido: false };

/** O que falta para concluir; vazio quando pode concluir. */
export function pendencias(r: ChecklistRascunho): ChecklistPendencia[] {
  const resultado: ChecklistPendencia[] = [];
  const erroMedidor = validarMedidor(r.medidor, {
    ultimo: r.veiculo.medidorUltimo,
    horimetro: usaHorimetro(catalogoDoRascunho(r)),
    corrigido: r.medidorCorrigido,
  });
  if (erroMedidor != null) resultado.push({ mensagem: erroMedidor, itemId: null });
  if ((r.motorista?.nome.trim() ?? '') === '') resultado.push({ mensagem: 'Informe o motorista/operador.', itemId: null });
  for (const item of itensDoRascunho(r)) {
    const resposta = respostaDe(r, item.id);
    switch (resposta.status) {
      case null:
        resultado.push({ mensagem: 'Escolha OK, Avaria ou Não se aplica.', itemId: item.id });
        break;
      case 'avaria':
        if (resposta.observacao.trim() === '') resultado.push({ mensagem: 'Descreva a avaria.', itemId: item.id });
        if (resposta.fotos.length === 0) resultado.push({ mensagem: 'Inclua ao menos uma foto da avaria.', itemId: item.id });
        break;
      case 'ok':
        if (observacaoObrigatoria(item) && resposta.observacao.trim() === '') {
          resultado.push({ mensagem: `Informe na observação: ${item.campo}.`, itemId: item.id });
        }
        break;
      case 'nao_se_aplica':
        break;
    }
  }
  return resultado;
}

export const podeConcluir = (r: ChecklistRascunho) => pendencias(r).length === 0;

/** Itens da lista principal (fora da área "Não se aplica"), na ordem. */
export const itensAtivos = (r: ChecklistRascunho): ChecklistItemDef[] =>
  itensDoRascunho(r).filter((item) => respostaDe(r, item.id).status !== 'nao_se_aplica');

/** Itens da área "Não se aplica", na ordem do catálogo. */
export const itensNaoSeAplica = (r: ChecklistRascunho): ChecklistItemDef[] =>
  itensDoRascunho(r).filter((item) => respostaDe(r, item.id).status === 'nao_se_aplica');

/** Respondidos e total dos itens que valem. */
export function progresso(r: ChecklistRascunho): { respondidos: number; total: number } {
  const itens = itensDoRascunho(r);
  return { respondidos: itens.filter((i) => respostaDe(r, i.id).status != null).length, total: itens.length };
}

/** Totais por status, só dos itens que valem (os de guincho entram só com guincho ligado). */
export function totais(r: ChecklistRascunho): Record<ChecklistStatus, number> {
  const contagem: Record<ChecklistStatus, number> = { ok: 0, avaria: 0, nao_se_aplica: 0 };
  for (const item of itensDoRascunho(r)) {
    const status = respostaDe(r, item.id).status;
    if (status != null) contagem[status] += 1;
  }
  return contagem;
}

/**
 * Começa o rascunho com os itens que estavam em "Não se aplica" no último checklist do veículo. Itens fora do
 * catálogo são ignorados, e respostas já dadas não mudam.
 */
export function aplicarNaoSeAplicaLembrados(r: ChecklistRascunho, itensNaoSeAplicaLembrados: Iterable<string>): ChecklistRascunho {
  const validos = new Set(todosOsItens(catalogoDoRascunho(r)).map((i) => i.id));
  const respostas = { ...r.respostas };
  for (const itemId of itensNaoSeAplicaLembrados) {
    if (!validos.has(itemId) || respostas[itemId]?.status != null) continue;
    respostas[itemId] = { status: 'nao_se_aplica', observacao: '', fotos: [] };
  }
  return { ...r, respostas };
}

/** Reativa um item da área "Não se aplica": volta sem status, mantendo observação e fotos. */
export function reativarItem(r: ChecklistRascunho, itemId: string): ChecklistRascunho {
  const atual = respostaDe(r, itemId);
  return comResposta(r, itemId, { status: null, observacao: atual.observacao, fotos: atual.fotos });
}

const dataDe = (valor: unknown): Date | null => {
  if (valor instanceof Date) return valor;
  if (typeof valor === 'string') {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const t = valor as { toDate?: () => Date } | null;
  return t && typeof t.toDate === 'function' ? t.toDate() : null;
};

/**
 * Itens em "Não se aplica" no último checklist do veículo, dado o resultado da consulta por `item_frota_id`. O último é
 * o de maior `concluidoEm`, escolhido no cliente porque não há índice composto.
 */
export function naoSeAplicaDoUltimo(documentos: Iterable<Record<string, unknown>>): Set<string> {
  let ultimo: Record<string, unknown> | null = null;
  let ultimoEm: Date | null = null;
  for (const data of documentos) {
    const em = dataDe(data.concluidoEm);
    if (em != null && (ultimoEm == null || em > ultimoEm)) {
      ultimo = data;
      ultimoEm = em;
    }
  }
  const itens = ultimo?.itens;
  if (!Array.isArray(itens)) return new Set();
  const resultado = new Set<string>();
  for (const item of itens) {
    if (item && typeof item === 'object' && item.status === 'nao_se_aplica' && typeof item.itemId === 'string') {
      resultado.add(item.itemId);
    }
  }
  return resultado;
}
