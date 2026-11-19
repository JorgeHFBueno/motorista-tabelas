// Registro da Revisão no aparelho e a revisão salva aguardando envio, no mesmo formato da Manutenção do app Flutter
// (manutencao/models/manutencao_registro.dart e manutencao_pendente.dart). Um registro por visita ao mecânico: salvo
// várias vezes enquanto aberto (cada "Salvar" soma 1 em `revisao`), fechado ao informar a data que voltou.
import { catalogoParaCategoria, usaHorimetro } from '../../checklist-mecanico/domain/catalogo';
import {
  gerarIdChecklist, type ChecklistAutor, type ChecklistFoto, type ChecklistVeiculo,
} from '../../checklist-mecanico/domain/rascunho';
import type { AcaoId, CategoriaId, EixoId, LadoId, RevisaoTipo, UnidadeId } from './listas';

/** Data sem hora, `AAAA-MM-DD`, como é gravada (não muda com o fuso); a ordem do texto é a das datas. */
export type Dia = string;

const dois = (n: number) => String(n).padStart(2, '0');

/** O dia local de uma data. */
export const diaDe = (data: Date): Dia => `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`;

/** Lê `AAAA-MM-DD`; null quando não é uma data válida. */
export function lerDia(texto: unknown): Dia | null {
  if (typeof texto !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return null;
  const [ano, mes, dia] = m.slice(1).map(Number);
  const data = new Date(ano, mes - 1, dia);
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia ? texto : null;
}

/** `DD/MM/AAAA`, para a tela. */
export const exibirDia = (dia: Dia) => dia.split('-').reverse().join('/');

/** Item da revisão; `motivo` nulo usa o motivo geral do registro. */
export type RevisaoItem = {
  itemId: string;
  categoria: CategoriaId | null;
  acao: AcaoId | null;
  peca: string;
  motivo: string | null;
  eixo: EixoId | null;
  lado: LadoId | null;
  quantidade: number | null;
  unidade: UnidadeId | null;
  especificacao: string;
  numeroNota: string;
  /** Fotos no aparelho (chave local) ou já no Storage (caminho `manutencoes-v2/...`, ver `fotoRemota`). */
  fotos: ChecklistFoto[];
};

export type RevisaoRegistro = {
  /** Gerado no aparelho; vira o id do documento (reenviar não duplica). */
  id: string;
  veiculo: ChecklistVeiculo;
  abertaEm: Date;
  /** Soma 1 a cada "Salvar"; 0 enquanto nunca foi salvo (rascunho). */
  revisao: number;
  /** Só no aparelho: há mudanças depois do último "Salvar". */
  alterado: boolean;
  medidor: number | null;
  /** O mecânico confirmou um medidor menor que o último do cadastro. */
  medidorCorrigido: boolean;
  tipo: RevisaoTipo | null;
  motivo: string;
  numeroNota: string;
  dataParada: Dia | null;
  dataEntrada: Dia | null;
  /** Com ela, salvar fecha o registro. */
  dataRetorno: Dia | null;
  itens: RevisaoItem[];
};

/** Uma revisão salva aguardando envio (a fila guarda uma por "Salvar"; só a mais nova de cada registro é enviada). */
export type RevisaoPendente = {
  registro: RevisaoRegistro;
  /** Quem salvou: na criação vira `criadoPor`; ao fechar, `fechadoPor`. */
  autor: ChecklistAutor;
  /** Hora do aparelho no "Salvar". */
  salvoEm: Date;
  /** Caminhos do Storage já enviados. */
  enviados: string[];
  tentativas: number;
  proximaTentativa: Date | null;
  /** O servidor recusou (registro já fechado): não é tentado de novo. */
  recusa: string | null;
  /** Falha que pede atenção (permissão negada): continua sendo tentado. */
  aviso: string | null;
};

export const statusDe = (r: RevisaoRegistro): 'aberta' | 'fechada' => (r.dataRetorno == null ? 'aberta' : 'fechada');
export const estaAberta = (r: RevisaoRegistro) => r.dataRetorno == null;
export const ehRascunho = (r: RevisaoRegistro) => r.revisao === 0;
export const tituloStatus = (r: RevisaoRegistro) => (estaAberta(r) ? 'Em manutenção' : 'Fechada');
export const horimetroDe = (v: ChecklistVeiculo) => usaHorimetro(catalogoParaCategoria(v.categoria));

/** Registro novo: o medidor começa no último do cadastro, e a data que foi ao mecânico, hoje. */
export function novoRegistro(dados: { veiculo: ChecklistVeiculo; agora?: Date; id?: string }): RevisaoRegistro {
  const agora = dados.agora ?? new Date();
  return {
    id: dados.id ?? gerarIdChecklist(),
    veiculo: dados.veiculo,
    abertaEm: agora,
    revisao: 0,
    alterado: false,
    medidor: dados.veiculo.medidorUltimo,
    medidorCorrigido: false,
    tipo: null,
    motivo: '',
    numeroNota: '',
    dataParada: null,
    dataEntrada: diaDe(agora),
    dataRetorno: null,
    itens: [],
  };
}

export const novoItem = (itemId: string = gerarIdChecklist()): RevisaoItem => ({
  itemId,
  categoria: null,
  acao: null,
  peca: '',
  motivo: null,
  eixo: null,
  lado: null,
  quantidade: null,
  unidade: null,
  especificacao: '',
  numeroNota: '',
  fotos: [],
});

export const itemDe = (r: RevisaoRegistro, itemId: string) => r.itens.find((i) => i.itemId === itemId) ?? null;

/** Troca o item de mesmo id, ou acrescenta no fim. */
export function comItem(r: RevisaoRegistro, item: RevisaoItem): RevisaoRegistro {
  const existe = r.itens.some((i) => i.itemId === item.itemId);
  return { ...r, itens: existe ? r.itens.map((i) => (i.itemId === item.itemId ? item : i)) : [...r.itens, item] };
}

export const semItem = (r: RevisaoRegistro, itemId: string): RevisaoRegistro => ({ ...r, itens: r.itens.filter((i) => i.itemId !== itemId) });

/** Item sem nada preenchido (ex.: "Adicionar item" e voltar sem escrever). */
export const itemVazio = (i: RevisaoItem) =>
  i.categoria == null && i.acao == null && i.peca.trim() === '' && i.motivo == null && i.eixo == null && i.lado == null
  && i.quantidade == null && i.unidade == null && i.especificacao.trim() === '' && i.numeroNota.trim() === '' && i.fotos.length === 0;

export const novaPendente = (registro: RevisaoRegistro, autor: ChecklistAutor, salvoEm: Date): RevisaoPendente => ({
  registro, autor, salvoEm, enviados: [], tentativas: 0, proximaTentativa: null, recusa: null, aviso: null,
});

/** Para os avisos e o histórico: recusada, ou tentando com aviso. */
export const naoEnviada = (p: RevisaoPendente) => p.recusa != null || p.aviso != null;
