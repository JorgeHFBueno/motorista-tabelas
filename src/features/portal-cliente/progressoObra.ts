// Progress of a contract shown in the client portal: portal-obras/{id}.progresso (The Manuscript,
// 01_FIRESTORE/COLECOES/portal.md, "Progresso"). Written by adm2 by hand; the portal recomputes it the same way
// (portal/src/lib/obraStatus.ts). Pure: no Firebase here, so it can be tested in Node.

export type StatusProgresso = 'pendente' | 'em_andamento' | 'finalizando' | 'completo';
export type ModoControle = 'percentual' | 'checklist';

export type ItemProgresso = { id: string; nome: string; ordem: number; progresso: number; status: StatusProgresso };

export type EtapaProgresso = {
  id: string;
  nome: string;
  ordem: number;
  modoControle: ModoControle;
  progresso: number;
  status: StatusProgresso;
  itens: ItemProgresso[];
};

/** etapas and progressoGeral; atualizadoEm/atualizadoPor are written next to them when saving. */
export type ProgressoObra = { etapas: EtapaProgresso[]; progressoGeral: number };

// Default stages of the old portal (portal/src/constants/obraStatusTemplate.ts before WEB 45ac78e).
export const MODELO_ETAPAS: ReadonlyArray<{ id: string; nome: string; modoControle: ModoControle; itens: readonly string[] }> = [
  { id: 'projeto', nome: 'Projeto', modoControle: 'checklist', itens: ['Projeto Executivo - Assinatura', 'Projeto Estrutural', 'Detalhamento'] },
  { id: 'producao', nome: 'Produção', modoControle: 'percentual', itens: ['Pilares', 'Placas', 'Vigas', 'Laje', 'Cobertura'] },
  { id: 'fundacao', nome: 'Fundação', modoControle: 'checklist', itens: ['Sondagem', 'Cálculo', 'Execução'] },
  { id: 'montagem', nome: 'Montagem', modoControle: 'percentual', itens: ['Pilares', 'Placas', 'Vigas', 'Laje', 'Cobertura'] },
];

export const ROTULOS_STATUS: Record<StatusProgresso, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  finalizando: 'Finalizando',
  completo: 'Completo',
};

/** Integer 0–100; anything that is not a number is 0. */
export function limitarProgresso(valor: unknown): number {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return Math.min(100, Math.max(0, Math.round(numero)));
}

/** pendente 0, em_andamento 1–90, finalizando 91–99, completo 100. */
export function statusDoProgresso(progresso: number): StatusProgresso {
  if (progresso <= 0) return 'pendente';
  if (progresso >= 100) return 'completo';
  if (progresso >= 91) return 'finalizando';
  return 'em_andamento';
}

const media = (valores: number[]) =>
  valores.length ? Math.round(valores.reduce((soma, valor) => soma + limitarProgresso(valor), 0) / valores.length) : 0;

const registro = (valor: unknown): Record<string, unknown> =>
  valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};

const textoOu = (valor: unknown, padrao: string) => (typeof valor === 'string' && valor.trim() ? valor.trim() : padrao);
const ordemOu = (valor: unknown, padrao: number) => (typeof valor === 'number' && Number.isFinite(valor) ? valor : padrao);

/** Item and stage progress and status from the items; a checklist item is 0 or 100. Names and ids are kept as they are. */
function etapaComProgresso(etapa: EtapaProgresso): EtapaProgresso {
  const itens = etapa.itens.map((item) => {
    const lido = limitarProgresso(item.progresso);
    const progresso = etapa.modoControle === 'checklist' ? (lido >= 100 ? 100 : 0) : lido;
    return { ...item, progresso, status: statusDoProgresso(progresso) };
  });
  const progresso = media(itens.map((item) => item.progresso));
  return { ...etapa, itens, progresso, status: statusDoProgresso(progresso) };
}

const comProgressoGeral = (etapas: EtapaProgresso[]): ProgressoObra => ({ etapas, progressoGeral: media(etapas.map((etapa) => etapa.progresso)) });

function etapaLida(bruta: unknown, indice: number): EtapaProgresso {
  const etapa = registro(bruta);
  const id = textoOu(etapa.id, `etapa_${indice + 1}`);
  const itens = (Array.isArray(etapa.itens) ? etapa.itens : [])
    .map((brutoItem, i) => {
      const item = registro(brutoItem);
      return {
        id: textoOu(item.id, `${id}_item_${i + 1}`),
        nome: textoOu(item.nome, `Item ${i + 1}`),
        ordem: ordemOu(item.ordem, i + 1),
        progresso: limitarProgresso(item.progresso),
        status: 'pendente' as StatusProgresso,
      };
    })
    .sort((a, b) => a.ordem - b.ordem);
  return {
    id,
    nome: textoOu(etapa.nome, `Etapa ${indice + 1}`),
    ordem: ordemOu(etapa.ordem, indice + 1),
    modoControle: etapa.modoControle === 'percentual' ? 'percentual' : 'checklist',
    progresso: 0,
    status: 'pendente',
    itens,
  };
}

/**
 * progresso as stored (or anything else) read and recomputed from the items, as the portal does: a checklist item is
 * 0 or 100; a stage is the simple average of its items (0 without items); progressoGeral is the simple average of the
 * stages; every status comes from its progress. Missing ids and names get defaults.
 */
export function recalcularProgresso(bruto: unknown): ProgressoObra {
  const dados = registro(bruto);
  const etapas = (Array.isArray(dados.etapas) ? dados.etapas : [])
    .map((etapa, indice) => etapaComProgresso(etapaLida(etapa, indice)))
    .sort((a, b) => a.ordem - b.ordem);
  return comProgressoGeral(etapas);
}

/**
 * After an edit: ordem renumbered 1..n in the current order and progress recomputed. Names are kept as typed (the editor
 * trims them when saving).
 */
export function renumerarProgresso(progresso: ProgressoObra): ProgressoObra {
  return comProgressoGeral(progresso.etapas.map((etapa, indice) => etapaComProgresso({
    ...etapa,
    ordem: indice + 1,
    itens: etapa.itens.map((item, i) => ({ ...item, ordem: i + 1 })),
  })));
}

/** Names trimmed, for saving; null when a stage or item has no name. */
export function progressoParaGravar(progresso: ProgressoObra): ProgressoObra | null {
  const etapas = progresso.etapas.map((etapa) => ({ ...etapa, nome: etapa.nome.trim(), itens: etapa.itens.map((item) => ({ ...item, nome: item.nome.trim() })) }));
  if (etapas.some((etapa) => !etapa.nome || etapa.itens.some((item) => !item.nome))) return null;
  return renumerarProgresso({ ...progresso, etapas });
}

/** Progress of a newly published contract: the default stages, everything pending. */
export function progressoPadrao(): ProgressoObra {
  return recalcularProgresso({
    etapas: MODELO_ETAPAS.map((etapa, indice) => ({
      id: etapa.id,
      nome: etapa.nome,
      ordem: indice + 1,
      modoControle: etapa.modoControle,
      itens: etapa.itens.map((nome, i) => ({ id: `${etapa.id}_item_${i + 1}`, nome, ordem: i + 1, progresso: 0 })),
    })),
  });
}

export const novoIdProgresso = (prefixo: 'etapa' | 'item') => `${prefixo}_${crypto.randomUUID()}`;
