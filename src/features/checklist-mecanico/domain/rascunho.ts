// Checklist em preenchimento e concluído aguardando envio, no mesmo formato do app Flutter
// (lib/features/checklist/models/checklist_rascunho.dart e checklist_pendente.dart).
import { catalogoParaCategoria, itensDoCatalogo, type CatalogoId, type ChecklistItemDef } from './catalogo';

export type ChecklistStatus = 'ok' | 'avaria' | 'nao_se_aplica';
export type ChecklistTipo = 'saida' | 'chegada';
export type OrigemFoto = 'camera' | 'galeria';

/** Foto de um item, guardada no aparelho até o envio. */
export type ChecklistFoto = {
  /** Chave local da foto processada (≤ 1 MB). */
  arquivo: string;
  /** Chave local da miniatura. */
  miniatura: string;
  origem: OrigemFoto;
  /** Hora da foto: da câmera, ou a original da galeria quando existir. */
  capturadaEm: Date | null;
  bytes: number;
  largura: number;
  altura: number;
};

export type ChecklistResposta = { status: ChecklistStatus | null; observacao: string; fotos: ChecklistFoto[] };

/** Veículo/máquina do checklist (de `veiculos-v2`). */
export type ChecklistVeiculo = {
  id: string;
  /** `PLACA` ou `EXTRA`. */
  categoria: string;
  identificador: string;
  nome: string;
  /** `operacional.quilometragemUltima` no início do checklist. */
  medidorUltimo: number | null;
};

/** Para quem o checklist foi feito; `uid` nulo quando o nome foi digitado. */
export type ChecklistMotorista = { uid: string | null; nome: string };

/** Assinatura do motorista, ou o registro de que ele não estava presente. */
export type ChecklistAssinatura =
  | { ausente: false; arquivo: string; em: Date; bytes: number; largura: number; altura: number }
  | { ausente: true; motivo: string; em: Date };

export type ChecklistRascunho = {
  id: string;
  tipo: ChecklistTipo;
  veiculo: ChecklistVeiculo;
  iniciadoEm: Date;
  guincho: boolean;
  medidor: number | null;
  /** O mecânico confirmou um medidor menor que o último ("Esse é o KM correto"): o envio corrige o cadastro. */
  medidorCorrigido: boolean;
  motorista: ChecklistMotorista | null;
  /** Preenchida na conclusão. */
  assinatura: ChecklistAssinatura | null;
  respostas: Record<string, ChecklistResposta>;
};

export type ChecklistAutor = { uid: string; nome: string };

/** Checklist concluído aguardando envio. */
export type ChecklistPendente = {
  rascunho: ChecklistRascunho;
  autor: ChecklistAutor;
  concluidoEm: Date;
  /** Caminhos do Storage já enviados. */
  enviados: string[];
  tentativas: number;
  proximaTentativa: Date | null;
};

const RESPOSTA_VAZIA: ChecklistResposta = { status: null, observacao: '', fotos: [] };
const ALFABETO_ID = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Id de 20 caracteres no formato dos ids automáticos do Firestore (vira o id do documento; reenviar não duplica). */
export function gerarIdChecklist(bytesAleatorios: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  let id = '';
  while (id.length < 20) {
    for (const b of bytesAleatorios(32)) {
      // 248 = 4 × 62: descarta o resto para não favorecer letras.
      if (b < 248 && id.length < 20) id += ALFABETO_ID[b % 62];
    }
  }
  return id;
}

export function novoRascunho(dados: {
  tipo: ChecklistTipo;
  veiculo: ChecklistVeiculo;
  agora?: Date;
  id?: string;
}): ChecklistRascunho {
  return {
    id: dados.id ?? gerarIdChecklist(),
    tipo: dados.tipo,
    veiculo: dados.veiculo,
    iniciadoEm: dados.agora ?? new Date(),
    guincho: false,
    medidor: null,
    medidorCorrigido: false,
    motorista: null,
    assinatura: null,
    respostas: {},
  };
}

const paraBusca = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('pt-BR');

/** O motorista da lista com esse nome (sem acento nem caixa), ou só o nome digitado (sem cadastro); vazio → null. */
export function resolverMotorista(texto: string, motoristas: readonly ChecklistMotorista[]): ChecklistMotorista | null {
  const nome = texto.trim();
  if (nome === '') return null;
  const busca = paraBusca(nome);
  return motoristas.find((m) => paraBusca(m.nome) === busca) ?? { uid: null, nome };
}

export const catalogoDoRascunho =(r: ChecklistRascunho): CatalogoId => catalogoParaCategoria(r.veiculo.categoria);

/** Itens que valem neste checklist (catálogo + guincho). */
export const itensDoRascunho = (r: ChecklistRascunho): ChecklistItemDef[] => itensDoCatalogo(catalogoDoRascunho(r), r.guincho);

export const respostaDe = (r: ChecklistRascunho, itemId: string): ChecklistResposta => r.respostas[itemId] ?? RESPOSTA_VAZIA;

export const comResposta = (r: ChecklistRascunho, itemId: string, resposta: ChecklistResposta): ChecklistRascunho => ({
  ...r,
  respostas: { ...r.respostas, [itemId]: resposta },
});
