// Saída e Chegada lançadas no aparelho, iguais às do app (lib/features/classico: AtividadePendente, AtividadesRepository e
// Validators): o documento de `atividades/{id}` é montado na hora, com os snapshots do veículo e da obra, e vai para a fila
// de envio. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/atividades.md.
import { obraLabel, obraSnapshot, type ItemFrotaV2, type ObraV2 } from '../../../utils/cadastrosV2';

export type TipoAtividade = 'saida' | 'chegada';

/** Obra da Fábrica em `obras-v2`, gravada fixa em toda Chegada. */
export const FABRICA_ID = 'O4hkkxZX3LbeZyluMsrt';
export const LOCAL_PADRAO_CHEGADA = 'Palmeira das Missões - RS';
export const MOTIVO_CHEGADA = 'Volta a Fábrica';

/** Sugestões do campo Motivo da Saída (as mesmas do app, `motivosCombustivel`); o texto livre continua aceito. */
export const MOTIVOS_SAIDA = [
  'Buscar Motorista',
  'Deslocamento para a fabrica',
  'Deslocamento para obra',
  'Manutenção do Veículo',
  'Missão Cidade',
  'Prestação de Socorro',
  'Transporte de Funcionarios',
  'Transporte de Material',
  'Transporte de Peças',
  'Uso Fábrica',
];

export type Pessoa = { uid: string; nome: string };

export interface AtividadePendente {
  /** Id do documento, gerado no aparelho: reenviar não duplica. */
  id: string;
  tipo: TipoAtividade;
  itemFrotaId: string;
  itemFrotaSnapshot: { categoria: string; identificador: string; nome: string };
  km: number;
  destino: string;
  motivo: string;
  motorista: Pessoa;
  criadoPor: Pessoa;
  obraId: string;
  obraSnapshot: ReturnType<typeof obraSnapshot>;
  /** Hora do aparelho no lançamento; vira o `data` do documento. */
  lancadoEm: Date;
  tentativas: number;
  proximaTentativa: Date | null;
  /** Motivo da última falha de envio, para o Histórico. */
  ultimoErro: string | null;
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** `<tipo> - yyyy-MM-dd HH-mm-ss - <identificador>`, com a hora do aparelho, como no app. */
export function idAtividade(tipo: TipoAtividade, identificador: string, data: Date): string {
  const dia = `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
  const hora = `${doisDigitos(data.getHours())}-${doisDigitos(data.getMinutes())}-${doisDigitos(data.getSeconds())}`;
  return `${tipo} - ${dia} ${hora} - ${identificador}`;
}

/** Veículo que pode ter Saída/Chegada: placa (`PLACA`) ativa, com identificador e nome. */
export const veiculoDaAtividade = (item: ItemFrotaV2) =>
  item.categoria === 'PLACA' && item.ativo && item.identificador.trim() !== '' && item.nome.trim() !== '';

export function novaAtividade(dados: {
  tipo: TipoAtividade;
  veiculo: ItemFrotaV2;
  km: number;
  obra: ObraV2;
  /** Saída: o Local digitado; Chegada: o da obra Fábrica (vazio vira o padrão). */
  local: string;
  motivo?: string;
  motorista: Pessoa;
  criadoPor: Pessoa;
  agora: Date;
}): AtividadePendente {
  const chegada = dados.tipo === 'chegada';
  const local = dados.local.trim();
  return {
    id: idAtividade(dados.tipo, dados.veiculo.identificador, dados.agora),
    tipo: dados.tipo,
    itemFrotaId: dados.veiculo.id,
    itemFrotaSnapshot: { categoria: dados.veiculo.categoria, identificador: dados.veiculo.identificador, nome: dados.veiculo.nome },
    km: dados.km,
    destino: chegada && !local ? LOCAL_PADRAO_CHEGADA : local,
    motivo: chegada ? MOTIVO_CHEGADA : (dados.motivo ?? '').trim(),
    motorista: dados.motorista,
    criadoPor: dados.criadoPor,
    obraId: dados.obra.id,
    obraSnapshot: obraSnapshot(dados.obra),
    lancadoEm: dados.agora,
    tentativas: 0,
    proximaTentativa: null,
    ultimoErro: null,
  };
}

/** Documento de `atividades/{id}` (contrato V2). `data` e `registradoEm` vêm prontos do Firestore (Timestamp / hora do servidor). */
export function documentoAtividade<D, S>(p: AtividadePendente, data: D, registradoEm: S) {
  return {
    schemaVersion: 2,
    data,
    registradoEm,
    destino: p.destino,
    local: p.destino,
    km: p.km,
    motivo: p.motivo,
    motorista: { uid: p.motorista.uid, nome: p.motorista.nome },
    criadoPor: { uid: p.criadoPor.uid, nome: p.criadoPor.nome },
    item_frota_id: p.itemFrotaId,
    item_frota_snapshot: p.itemFrotaSnapshot,
    id_obra: p.obraId,
    id_obra_snap: p.obraSnapshot,
    tipo: p.tipo,
  };
}

/** KM digitado: só dígitos, inteiro. */
export function lerKm(texto: string): number | null {
  const t = texto.trim();
  return /^\d+$/.test(t) ? Number.parseInt(t, 10) : null;
}

/** Como o app (`Validators.kmSaida`/`kmChegada`): a Saída aceita KM igual ao último; a Chegada, só maior. */
export function validarKm(texto: string, ultimo: number | null, tipo: TipoAtividade): string | null {
  if (!texto.trim()) return 'Informe o KM.';
  const km = lerKm(texto);
  if (km == null) return 'Use só números, sem pontos nem vírgulas.';
  const base = ultimo ?? 0;
  if (tipo === 'saida' && km < base) return 'O KM deve ser maior ou igual à última quilometragem.';
  if (tipo === 'chegada' && km <= base) return 'O KM deve ser maior que a última quilometragem.';
  return null;
}

export function validarMotivo(texto: string): string | null {
  const t = texto.trim();
  if (!t) return 'Informe o motivo.';
  return t.length < 3 ? 'O motivo deve ter pelo menos 3 caracteres.' : null;
}

/** O KM do veículo só sobe: uma atividade enviada atrasada não baixa um valor que chegou antes. */
export const deveAtualizarKm = (atual: number | null, km: number) => atual == null || km > atual;

const semAcento = (valor: string) => valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Obras que batem com a busca por nome, sinônimo ou local (como no Combustível do Kiosk). */
export function filtrarObras(obras: readonly ObraV2[], busca: string): ObraV2[] {
  const termo = semAcento(busca);
  if (!termo) return [...obras];
  return obras.filter((o) => [o.nomeObra, o.siglaObra, o.local ?? '', obraLabel(o)].some((campo) => semAcento(campo).includes(termo)));
}
