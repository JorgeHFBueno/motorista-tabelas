import type { AtividadeV2 } from '../../services/atividade-normalizer';
import type { NormalizedCombustivel } from '../../services/combustivel-normalizer';
import { calculatedEnd, isValidCivilDate } from '../cronograma-obras/domain/temporal';

// Obra de obras-v2 (The Manuscript, 01_FIRESTORE/COLECOES/obras-v2.md): um contrato com os LOTEs em `lotes`.
// O cadastro é do Friday; em /engenharia/obras a WEB só grava o `local`.

export type LoteObra = { chave: string; nome: string; status: string };

export type ObraDetalhe = {
  id: string;
  nomeObra: string;
  siglaObra: string;
  codObra: number | string | null;
  local: string;
  status: string;
  situacao: string;
  numeroContrato: string;
  ano: number | null;
  empresa: string;
  tipoObra: string;
  subcentroErp: string | null;
  ordemInicio: string;
  confirmacaoRecurso: string;
  dataInicial: string | null;
  dataFinal: string | null;
  /** LOTEs ativos, na ordem do campo `ordem` (empate pela chave); sem os arquivados ou na lixeira do Friday. */
  lotes: LoteObra[];
  /** Nome de todos os LOTEs, inclusive arquivados: as alocações antigas continuam apontando para eles. */
  nomesLotes: Record<string, string>;
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const map = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const civil = (value: unknown) => (typeof value === 'string' && isValidCivilDate(value) ? value : null);

export function obraDetalheFromV2(id: string, data: Record<string, unknown>): ObraDetalhe | null {
  const nomeObra = text(data.nomeObra);
  if (!nomeObra) return null;
  const entradas = Object.entries(map(data.lotes)).map(([chave, raw]) => ({ chave, raw: map(raw) }));
  const ordem = (raw: Record<string, unknown>) =>
    typeof raw.ordem === 'number' && Number.isFinite(raw.ordem) ? raw.ordem : Number.MAX_SAFE_INTEGER;
  const lotes = entradas
    .filter(({ raw }) => !text(raw.situacao))
    .sort((a, b) => ordem(a.raw) - ordem(b.raw) || a.chave.localeCompare(b.chave))
    .map(({ chave, raw }) => ({ chave, nome: text(raw.nome) || chave, status: text(raw.status) }));
  const ano = typeof data.ano === 'number' && Number.isFinite(data.ano) ? data.ano : null;
  return {
    id,
    nomeObra,
    siglaObra: text(data.siglaObra),
    codObra: typeof data.codObra === 'number' || typeof data.codObra === 'string' ? data.codObra : null,
    local: text(data.local),
    status: text(data.status),
    situacao: text(data.situacao),
    numeroContrato: text(data.numeroContrato),
    ano,
    empresa: text(data.empresa),
    tipoObra: text(data.tipoObra),
    subcentroErp: typeof data.subcentroErp === 'string' && data.subcentroErp.trim() ? data.subcentroErp : null,
    ordemInicio: text(data.ordemInicio),
    confirmacaoRecurso: text(data.confirmacaoRecurso),
    dataInicial: civil(data.dataInicial),
    dataFinal: civil(data.dataFinal),
    lotes,
    nomesLotes: Object.fromEntries(entradas.map(({ chave, raw }) => [chave, text(raw.nome) || chave])),
  };
}

/** Sem local ou com o marcador "CORRIGIR" que contrato novo recebe. */
export function localPendente(local: string) {
  const limpo = local.trim();
  return !limpo || limpo.toUpperCase() === 'CORRIGIR';
}

export function obraFinalizada(obra: Pick<ObraDetalhe, 'status'>) {
  return obra.status.toUpperCase() === 'FINALIZADA';
}

export function contratoTexto(obra: Pick<ObraDetalhe, 'numeroContrato' | 'ano'>) {
  if (!obra.numeroContrato) return '';
  return obra.ano && !obra.numeroContrato.includes('/') ? `${obra.numeroContrato}/${obra.ano}` : obra.numeroContrato;
}

export type FiltroObras = 'ATIVAS' | 'SEM_LOCAL' | 'FINALIZADAS' | 'TODAS';

const normalizar = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

/** Campos que engenharia e adm2 gravam no detalhe (Rules); `siglaObra` aparece como "Sinônimo". */
export type CampoEditavelObra = 'local' | 'siglaObra';
export const ROTULOS_CAMPOS: Record<CampoEditavelObra, string> = { local: 'Local', siglaObra: 'Sinônimo' };
export const LIMITES_CAMPOS: Record<CampoEditavelObra, number> = { local: 200, siglaObra: 100 };

/** Sugestões de local que contêm o texto digitado, sem acento; só as 50 primeiras, para a lista ficar leve. */
export function filtrarLocais(opcoes: readonly string[], texto: string): string[] {
  const termo = normalizar(texto.trim());
  return (termo ? opcoes.filter((opcao) => normalizar(opcao).includes(termo)) : opcoes).slice(0, 50);
}

export function filtrarObras(obras: ObraDetalhe[], busca: string, filtro: FiltroObras): ObraDetalhe[] {
  const termo = normalizar(busca.trim());
  return obras
    .filter((obra) => {
      if (filtro === 'ATIVAS') return !obraFinalizada(obra);
      if (filtro === 'FINALIZADAS') return obraFinalizada(obra);
      if (filtro === 'SEM_LOCAL') return localPendente(obra.local);
      return true;
    })
    .filter((obra) => !termo || normalizar([obra.nomeObra, obra.siglaObra, obra.numeroContrato, obra.local, obra.empresa, String(obra.codObra ?? '')].join(' ')).includes(termo))
    .sort((a, b) => a.nomeObra.localeCompare(b.nomeObra, 'pt-BR'));
}

/** Alocação de monday-cronograma (01_FIRESTORE/COLECOES/engenharia-monday.md): `obraId` é a chave do LOTE. */
export type AlocacaoObra = { id: string; mestreId: string; obraId?: string; inicio: string; tempoPlanejado: number };
export type PeriodoMestre = { id: string; mestre: string; lote: string; inicio: string; fim: string; dias: number };

/** Um período por alocação, na ordem do início; o fim é o do CronoObra (início + dias − 1). */
export function periodosDosMestres(alocacoes: AlocacaoObra[], nomesMestres: Record<string, string>, nomesLotes: Record<string, string>): PeriodoMestre[] {
  return alocacoes
    .filter((item) => isValidCivilDate(item.inicio) && Number.isInteger(item.tempoPlanejado) && item.tempoPlanejado > 0)
    .map((item) => ({
      id: item.id,
      mestre: nomesMestres[item.mestreId] ?? item.mestreId,
      lote: item.obraId ? nomesLotes[item.obraId] ?? 'LOTE removido' : 'Contrato',
      inicio: item.inicio,
      fim: calculatedEnd(item.inicio, item.tempoPlanejado),
      dias: item.tempoPlanejado,
    }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.mestre.localeCompare(b.mestre, 'pt-BR'));
}

/** Timestamp do Firestore, Date ou `{ seconds }`. */
export function dataDe(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? raw : null;
  const value = raw as { toDate?: () => Date; seconds?: unknown } | null;
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (value && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

export type VeiculoNaObra = { chave: string; placa: string; nome: string; atividades: number; primeira: Date | null; ultima: Date | null; motoristas: string[] };

/** Veículos das atividades V2 que apontam para a obra (`id_obra`), do mais recente para o mais antigo. */
export function veiculosNaObra(atividades: AtividadeV2[]): VeiculoNaObra[] {
  const porVeiculo = new Map<string, VeiculoNaObra>();
  for (const atividade of atividades) {
    if (atividade.foraDoContrato) continue;
    const chave = atividade.veiculoId || atividade.placa || '';
    if (!chave) continue;
    const data = dataDe(atividade.data);
    const atual = porVeiculo.get(chave) ?? { chave, placa: atividade.placa ?? '', nome: atividade.veiculoNome ?? '', atividades: 0, primeira: null, ultima: null, motoristas: [] };
    atual.atividades += 1;
    if (data && (!atual.primeira || data < atual.primeira)) atual.primeira = data;
    if (data && (!atual.ultima || data > atual.ultima)) atual.ultima = data;
    if (atividade.motorista && !atual.motoristas.includes(atividade.motorista)) atual.motoristas.push(atividade.motorista);
    porVeiculo.set(chave, atual);
  }
  return [...porVeiculo.values()].sort((a, b) => (b.ultima?.getTime() ?? 0) - (a.ultima?.getTime() ?? 0) || a.placa.localeCompare(b.placa));
}

export type AbastecimentoObra = { id: string; data: Date | null; veiculo: string; litros: number; valor: number; paraQuem: string };
export type ResumoCombustivel = {
  abastecimentos: number;
  litros: number;
  valor: number;
  porVeiculo: Array<{ veiculo: string; abastecimentos: number; litros: number; valor: number }>;
  itens: AbastecimentoObra[];
};

/** Saídas V2 de combustível da obra. Litros ×10 e valor em centavos (02_PROCESSOS/combustivel-saida-v2.md). */
export function resumirCombustivel(movimentos: NormalizedCombustivel[]): ResumoCombustivel {
  const itens = movimentos
    .filter((item) => item.schema === 'saida-v2')
    .map((item) => ({
      id: item.id,
      data: dataDe(item.data),
      veiculo: item.identificadorSnapshot || 'Sem veículo',
      litros: (item.quantidadeAbastecida ?? 0) / 10,
      valor: (item.valorAbastecimento ?? 0) / 100,
      paraQuem: item.paraQuem ?? '',
    }))
    .sort((a, b) => (a.data?.getTime() ?? 0) - (b.data?.getTime() ?? 0));
  const porVeiculo = new Map<string, { veiculo: string; abastecimentos: number; litros: number; valor: number }>();
  for (const item of itens) {
    const atual = porVeiculo.get(item.veiculo) ?? { veiculo: item.veiculo, abastecimentos: 0, litros: 0, valor: 0 };
    atual.abastecimentos += 1;
    atual.litros += item.litros;
    atual.valor += item.valor;
    porVeiculo.set(item.veiculo, atual);
  }
  return {
    abastecimentos: itens.length,
    litros: itens.reduce((total, item) => total + item.litros, 0),
    valor: Math.round(itens.reduce((total, item) => total + item.valor, 0) * 100) / 100,
    porVeiculo: [...porVeiculo.values()].sort((a, b) => b.litros - a.litros || a.veiculo.localeCompare(b.veiculo)),
    itens,
  };
}

/** `AAAA-MM-DD` → `DD/MM/AAAA`; vazio vira "—". */
export function dataCivilTexto(value: string | null) {
  return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : '—';
}

/** Data no fuso de Brasília. */
export function dataTexto(value: Date | null) {
  return value ? value.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
}
