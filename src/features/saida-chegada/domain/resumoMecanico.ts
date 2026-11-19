// Checklists e revisões no Meu histórico, em versão resumida, como as fontes extras do Histórico geral do app
// (checklist_historico_extra.dart e manutencao_historico_extra.dart): o mecânico (e o adm2) vê os de todos os
// mecânicos. Só o resumo: os detalhes completos ficam na WEB.
import type { Checklist } from '../../../services/checklist-normalizer';
import type { ChecklistPendente } from '../../checklist-mecanico/domain/rascunho';
import { totais } from '../../checklist-mecanico/domain/regras';
import { dataDoCartao, type RevisaoLida } from '../../revisao/domain/documento';
import { TIPOS, tituloDe } from '../../revisao/domain/listas';
import { exibirDia, naoEnviada, tituloStatus, type RevisaoPendente, type RevisaoRegistro } from '../../revisao/domain/registro';

export type ResumoMecanico = {
  chave: string;
  tipo: 'checklist' | 'revisao';
  data: Date | null;
  /** "CKL1A23" */
  veiculo: string;
  /** Pares rótulo/valor do cartão; os sem valor não aparecem. */
  linhas: { rotulo: string; valor: string }[];
  /** Deste aparelho, ainda não no servidor (ou alteração de um já enviado aguardando). */
  envio: string | null;
};

const linhas = (pares: [string, string | null | undefined][]) =>
  pares.filter((p): p is [string, string] => typeof p[1] === 'string' && p[1].trim() !== '').map(([rotulo, valor]) => ({ rotulo, valor }));

const tipoChecklist = (tipo: string) => (tipo === 'chegada' ? 'Chegada' : 'Saída');

export function resumoDeChecklist(c: Checklist): ResumoMecanico {
  return {
    chave: `checklist:${c.id}`,
    tipo: 'checklist',
    data: c.concluidoEm,
    veiculo: c.placa || '—',
    linhas: linhas([['Tipo', tipoChecklist(c.tipo)], ['Motorista', c.motorista], ['Por', c.mecanico], ['Avarias', String(c.totais.avaria)]]),
    envio: null,
  };
}

export function resumoDeChecklistPendente(p: ChecklistPendente): ResumoMecanico {
  const r = p.rascunho;
  return {
    chave: `checklist:${r.id}`,
    tipo: 'checklist',
    data: p.concluidoEm,
    veiculo: r.veiculo.identificador,
    linhas: linhas([['Tipo', tipoChecklist(r.tipo)], ['Motorista', r.motorista?.nome], ['Por', p.autor.nome], ['Avarias', String(totais(r).avaria)]]),
    envio: 'aguardando',
  };
}

/** Tipo, situação, "No mecânico" (entrada → retorno, ou "desde") e quantos itens. */
function resumoRevisao(r: RevisaoRegistro): [string, string | null][] {
  const entrada = r.dataEntrada ? exibirDia(r.dataEntrada) : null;
  const noMecanico = entrada == null ? null : r.dataRetorno ? `${entrada} → ${exibirDia(r.dataRetorno)}` : `desde ${entrada}`;
  return [['Tipo', tituloDe(TIPOS, r.tipo)], ['Situação', tituloStatus(r)], ['No mecânico', noMecanico], ['Itens', r.itens.length ? String(r.itens.length) : null]];
}

export function resumoDeRevisao(l: RevisaoLida, alteracaoAguardando = false): ResumoMecanico {
  return {
    chave: `revisao:${l.registro.id}`,
    tipo: 'revisao',
    data: dataDoCartao(l),
    veiculo: l.registro.veiculo.identificador,
    linhas: linhas([...resumoRevisao(l.registro), ['Por', l.criadoPorNome]]),
    envio: alteracaoAguardando ? 'alteração aguardando' : null,
  };
}

export function resumoDeRevisaoPendente(p: RevisaoPendente): ResumoMecanico {
  return {
    chave: `revisao:${p.registro.id}`,
    tipo: 'revisao',
    data: p.salvoEm,
    veiculo: p.registro.veiculo.identificador,
    linhas: linhas([...resumoRevisao(p.registro), ['Por', p.autor.nome]]),
    envio: naoEnviada(p) ? 'não enviada' : 'aguardando',
  };
}

/**
 * Os resumos do mecânico: os deste aparelho ainda não no servidor e os do servidor (de qualquer mecânico), marcando
 * as revisões com alteração aguardando envio. Do mais novo ao mais antigo.
 */
export function juntarResumos(dados: {
  checklists: readonly Checklist[];
  checklistsPendentes: readonly ChecklistPendente[];
  revisoes: readonly RevisaoLida[];
  revisoesPendentes: readonly RevisaoPendente[];
}): ResumoMecanico[] {
  const checklistsNoServidor = new Set(dados.checklists.map((c) => c.id));
  const revisoesNoServidor = new Set(dados.revisoes.map((l) => l.registro.id));
  const aguardando = new Set(dados.revisoesPendentes.filter((p) => p.recusa == null).map((p) => p.registro.id));
  return [
    ...dados.checklistsPendentes.filter((p) => !checklistsNoServidor.has(p.rascunho.id)).map(resumoDeChecklistPendente),
    ...dados.checklists.map(resumoDeChecklist),
    ...dados.revisoesPendentes.filter((p) => !revisoesNoServidor.has(p.registro.id)).map(resumoDeRevisaoPendente),
    ...dados.revisoes.map((l) => resumoDeRevisao(l, aguardando.has(l.registro.id))),
  ].sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0));
}
