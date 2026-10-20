import { SITUACOES_EXCLUIDAS, mondayItemUrl } from '../data/mondayPrazosSchema';

export type CivilDate = string; // YYYY-MM-DD
export type Lote = { id: string; nome: string; status: string };
export type ObraPrazo = {
  id: string; nome: string; empresa: string; inicio: CivilDate | null; fim: CivilDate | null;
  situacao: string | null; tipoObra: string | null; statusFluxo: string | null; ordemInicio: string | null;
  url: string; lotes: Lote[];
};
export type SituacaoPrazo = 'vencido' | 'critico' | 'atencao' | 'folgado' | 'sem-data';
export type Limites = { critico: number; atencao: number };
export type LinhaPrazo = {
  obra: ObraPrazo; posicao: number; duracao: number | null; diasRestantes: number | null; pctDecorrido: number | null;
  situacaoPrazo: SituacaoPrazo; observacao: string; alertas: string[];
};

export const LIMITES_PADRAO: Limites = { critico: 45, atencao: 150 };
export const SITUACOES_PRAZO: SituacaoPrazo[] = ['vencido', 'critico', 'atencao', 'folgado', 'sem-data'];
export const ROTULO_SITUACAO: Record<SituacaoPrazo, string> = { vencido: 'Vencido', critico: 'Crítico', atencao: 'Atenção', folgado: 'Folgado', 'sem-data': 'Sem data' };
/** Cores da especificação: forte = trecho decorrido, clara = a decorrer, etiqueta = fundo/texto. */
export const CORES_SITUACAO: Record<SituacaoPrazo, { forte: string; clara: string; fundo: string; texto: string }> = {
  vencido: { forte: '#C00000', clara: '#C00000', fundo: '#C00000', texto: '#FFFFFF' },
  critico: { forte: '#E26B0A', clara: '#F8CBAD', fundo: '#F8CBAD', texto: '#833C0B' },
  atencao: { forte: '#BF8F00', clara: '#FFE699', fundo: '#FFE699', texto: '#7F6000' },
  folgado: { forte: '#548235', clara: '#C6E0B4', fundo: '#C6E0B4', texto: '#375623' },
  'sem-data': { forte: '#EDEDED', clara: '#EDEDED', fundo: '#EDEDED', texto: '#595959' },
};

// ---------- datas civis (sem hora) ----------
const DAY = 86_400_000;
const toUtc = (date: CivilDate) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
const fromUtc = (ms: number): CivilDate => new Date(ms).toISOString().slice(0, 10);
export const isCivilDate = (value: unknown): value is CivilDate => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value;
export const diffDays = (fim: CivilDate, inicio: CivilDate) => Math.round((toUtc(fim) - toUtc(inicio)) / DAY);
export const addDays = (date: CivilDate, days: number) => fromUtc(toUtc(date) + days * DAY);
export const mondayOf = (date: CivilDate) => addDays(date, -((new Date(toUtc(date)).getUTCDay() + 6) % 7));
export const formatDate = (date: CivilDate | null, longYear = false) => (date ? `${date.slice(8)}/${date.slice(5, 7)}/${longYear ? date.slice(0, 4) : date.slice(2, 4)}` : '');

/** Hoje no fuso de Brasília, independente do fuso da máquina. */
export function hojeBrasilia(now = new Date()): CivilDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// ---------- adaptação do documento `monday-obras` ----------
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const normalizar = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * `monday-obras` não projeta a coluna Situação; o Status (fórmula) é o equivalente disponível.
 * Nos dados reais, as obras Entregues da especificação (ACIEPP, Sobradinho 01/2025) estão em "Solicitar termo Definitivo".
 */
export function situacaoPeloStatus(status: string | null): string | null {
  const value = status ? normalizar(status) : '';
  if (value === 'obra finalizada') return 'Finalizada';
  if (value === 'solicitar termo definitivo') return 'Entregue';
  if (value === 'obra parada') return 'Parada';
  return null;
}

export function adaptarDocumento(id: string, data: unknown): ObraPrazo | null {
  const raw = data && typeof data === 'object' ? (data as { raw?: Record<string, unknown> }).raw : undefined;
  if (!raw || typeof raw !== 'object') return null;
  const subitems = Array.isArray(raw.subitems) ? raw.subitems as Array<Record<string, unknown>> : [];
  const statusFluxo = text(raw.status);
  return {
    id, nome: text(raw.nome) ?? id, empresa: text(raw.empresa) ?? '—',
    inicio: isCivilDate(raw.inicio) ? raw.inicio : null, fim: isCivilDate(raw.fim) ? raw.fim : null,
    situacao: situacaoPeloStatus(statusFluxo), tipoObra: text(raw.tipoObra), statusFluxo, ordemInicio: text(raw.ordemInicio),
    url: mondayItemUrl(id),
    lotes: subitems.map((s, i) => ({ id: text(s?.id) ?? `${id}-${i}`, nome: text(s?.nome) ?? 'Lote', status: text(s?.status) ?? 'Sem status' })),
  };
}

// ---------- regras de inclusão ----------
/** O grupo do item não é projetado; Tipo de Obra separa públicas e privadas, como no Cronograma. */
export const isPublica = (obra: ObraPrazo) => obra.tipoObra?.toLowerCase() === 'pública';
export const isPrivada = (obra: ObraPrazo) => obra.tipoObra?.toLowerCase() === 'privada';
export const isEncerrada = (obra: ObraPrazo) => (SITUACOES_EXCLUIDAS as readonly string[]).includes(obra.situacao ?? '');

// ---------- observação dos lotes ----------
const ORDEM_STATUS = ['Finalizado', 'Em andamento', 'Próxima a Iniciar', 'Não iniciada', 'Parada', 'Revisar escopo'];
const FRASE_STATUS: Record<string, [singular: string, plural: string]> = {
  'Finalizado': ['finalizado', 'finalizados'],
  'Em andamento': ['em andamento', 'em andamento'],
  'Próxima a Iniciar': ['próximo a iniciar', 'próximos a iniciar'],
  'Não iniciada': ['não iniciado', 'não iniciados'],
  'Parada': ['parado', 'parados'],
  'Revisar escopo': ['em Revisar escopo', 'em Revisar escopo'],
};

export function resumoLotes(lotes: Lote[]): string {
  if (!lotes.length) return 'Sem lotes cadastrados';
  const counts = new Map<string, number>();
  lotes.forEach((lote) => counts.set(lote.status, (counts.get(lote.status) ?? 0) + 1));
  const rank = (status: string) => { const index = ORDEM_STATUS.indexOf(status); return index < 0 ? ORDEM_STATUS.length : index; };
  return [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([status, n], index) => {
    const [singular, plural] = FRASE_STATUS[status] ?? [status.toLowerCase(), status.toLowerCase()];
    return `${n}${index === 0 ? (n === 1 ? ' lote' : ' lotes') : ''} ${n === 1 ? singular : plural}`;
  }).join('; ');
}

export function observacao(obra: ObraPrazo, semData: boolean): string {
  const partes: string[] = [];
  if (obra.situacao === 'Parada') partes.push('Obra PARADA');
  if (semData) {
    if (obra.statusFluxo) partes.push(obra.statusFluxo);
    if (obra.lotes.length) partes.push(resumoLotes(obra.lotes));
  } else partes.push(resumoLotes(obra.lotes));
  return partes.join('; ');
}

// ---------- cálculo e ordenação ----------
export function situacaoPorDias(diasRestantes: number, limites: Limites = LIMITES_PADRAO): Exclude<SituacaoPrazo, 'sem-data'> {
  if (diasRestantes < 0) return 'vencido';
  if (diasRestantes <= limites.critico) return 'critico';
  if (diasRestantes <= limites.atencao) return 'atencao';
  return 'folgado';
}

export function calcularLinha(obra: ObraPrazo, hoje: CivilDate, limites: Limites = LIMITES_PADRAO): Omit<LinhaPrazo, 'posicao'> {
  const alertas: string[] = [];
  if (!obra.inicio || !obra.fim) {
    if (obra.ordemInicio?.toLowerCase() === 'ok') alertas.push('Ordem de início "Ok", mas sem Início/Fim no Monday: provável erro de cadastro.');
    return { obra, duracao: null, diasRestantes: null, pctDecorrido: null, situacaoPrazo: 'sem-data', observacao: observacao(obra, true), alertas };
  }
  const duracao = diffDays(obra.fim, obra.inicio);
  if (duracao < 0) alertas.push('Fim anterior ao Início: conferir datas no Monday.');
  const diasRestantes = diffDays(obra.fim, hoje);
  const pctDecorrido = duracao <= 0 ? 100 : Math.min(100, Math.max(0, (diffDays(hoje, obra.inicio) / duracao) * 100));
  return { obra, duracao, diasRestantes, pctDecorrido, situacaoPrazo: situacaoPorDias(diasRestantes, limites), observacao: observacao(obra, false), alertas };
}

export function ordenarLinhas(linhas: Array<Omit<LinhaPrazo, 'posicao'>>): LinhaPrazo[] {
  const byName = (a: { obra: ObraPrazo }, b: { obra: ObraPrazo }) => a.obra.nome.localeCompare(b.obra.nome, 'pt-BR');
  const comData = linhas.filter((l) => l.diasRestantes !== null).sort((a, b) => (a.diasRestantes! - b.diasRestantes!) || byName(a, b));
  const semData = linhas.filter((l) => l.diasRestantes === null).sort(byName);
  return [...comData, ...semData].map((linha, index) => ({ ...linha, posicao: index + 1 }));
}

export type Filtros = { empresas: string[]; situacoes: SituacaoPrazo[]; incluirPrivadas: boolean };
export type ResultadoPrazos = { linhas: LinhaPrazo[]; contagem: Record<SituacaoPrazo, number>; conferir: Array<{ obra: ObraPrazo; motivo: string }> };

/** Aplica as regras da especificação sobre todos os itens do quadro. */
export function montarPrazos(obras: ObraPrazo[], hoje: CivilDate, filtros: Filtros, limites: Limites = LIMITES_PADRAO): ResultadoPrazos {
  const conferir = obras.filter((obra) => isEncerrada(obra) && obra.lotes.some((lote) => lote.status === 'Revisar escopo'))
    .map((obra) => ({ obra, motivo: `${obra.situacao}, mas com ${obra.lotes.filter((l) => l.status === 'Revisar escopo').length} lote(s) em "Revisar escopo"` }));
  const visiveis = obras.filter((obra) => !isEncerrada(obra) && (isPublica(obra) || (filtros.incluirPrivadas && isPrivada(obra))));
  const porEmpresa = visiveis.filter((obra) => !filtros.empresas.length || filtros.empresas.includes(obra.empresa));
  const calculadas = porEmpresa.map((obra) => calcularLinha(obra, hoje, limites));
  const contagem = Object.fromEntries(SITUACOES_PRAZO.map((s) => [s, calculadas.filter((l) => l.situacaoPrazo === s).length])) as Record<SituacaoPrazo, number>;
  const filtradas = calculadas.filter((l) => !filtros.situacoes.length || filtros.situacoes.includes(l.situacaoPrazo));
  return { linhas: ordenarLinhas(filtradas), contagem, conferir };
}

// ---------- linha do tempo ----------
export type Escala = 'semana' | 'mes';
export type ColunaTempo = { inicio: CivilDate; fim: CivilDate; rotulo: string; grupo: string };
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const primeiroDoMes = (date: CivilDate) => `${date.slice(0, 7)}-01`;
const proximoMes = (date: CivilDate) => { const y = Number(date.slice(0, 4)); const m = Number(date.slice(5, 7)); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; };

/** Da segunda-feira do Início mais antigo até uma semana (ou mês) depois do Fim mais distante. */
export function colunasTempo(linhas: LinhaPrazo[], escala: Escala, hoje: CivilDate): ColunaTempo[] {
  const inicios = linhas.flatMap((l) => (l.obra.inicio && l.obra.fim ? [l.obra.inicio] : []));
  const fins = linhas.flatMap((l) => (l.obra.inicio && l.obra.fim ? [l.obra.fim] : []));
  const min = inicios.length ? inicios.reduce((a, b) => (a < b ? a : b)) : addDays(hoje, -60);
  const max = fins.length ? fins.reduce((a, b) => (a > b ? a : b)) : addDays(hoje, 120);
  const colunas: ColunaTempo[] = [];
  if (escala === 'semana') {
    const ultimo = addDays(mondayOf(max), 7);
    for (let d = mondayOf(min); d <= ultimo; d = addDays(d, 7)) colunas.push({ inicio: d, fim: addDays(d, 6), rotulo: d.slice(8), grupo: `${MESES[Number(d.slice(5, 7)) - 1]}/${d.slice(2, 4)}` });
  } else {
    const ultimo = proximoMes(max);
    for (let d = primeiroDoMes(min); d <= ultimo; d = proximoMes(d)) colunas.push({ inicio: d, fim: addDays(proximoMes(d), -1), rotulo: MESES[Number(d.slice(5, 7)) - 1], grupo: d.slice(0, 4) });
  }
  return colunas;
}

/** Agrupa colunas consecutivas com o mesmo `grupo` (mês ou ano) para o cabeçalho mesclado. */
export function gruposCabecalho(colunas: ColunaTempo[]) {
  const grupos: Array<{ rotulo: string; span: number }> = [];
  colunas.forEach((c) => { const last = grupos[grupos.length - 1]; if (last?.rotulo === c.grupo) last.span += 1; else grupos.push({ rotulo: c.grupo, span: 1 }); });
  return grupos;
}

/** Semana/mês entra na barra quando se sobrepõe ao contrato: início_col ≤ Fim e fim_col ≥ Início. */
export function trechosBarra(linha: LinhaPrazo, colunas: ColunaTempo[], hoje: CivilDate): Array<{ de: number; ate: number; decorrido: boolean }> {
  const { inicio, fim } = linha.obra;
  if (!inicio || !fim || fim < inicio) return [];
  const idx = colunas.flatMap((c, i) => (c.inicio <= fim && c.fim >= inicio ? [i] : []));
  if (!idx.length) return [];
  const de = idx[0]; const ate = idx[idx.length - 1];
  if (linha.situacaoPrazo === 'vencido') return [{ de, ate, decorrido: true }];
  const corte = colunas.findIndex((c) => c.inicio > hoje); // primeira coluna inteiramente no futuro
  const limite = corte < 0 ? colunas.length : corte;
  const trechos: Array<{ de: number; ate: number; decorrido: boolean }> = [];
  if (de < limite) trechos.push({ de, ate: Math.min(ate, limite - 1), decorrido: true });
  if (ate >= limite) trechos.push({ de: Math.max(de, limite), ate, decorrido: false });
  return trechos;
}

/** Posição de hoje em "colunas" (fracionária), para a linha vertical exata do dia. */
export function posicaoHoje(colunas: ColunaTempo[], hoje: CivilDate): number | null {
  const i = colunas.findIndex((c) => c.inicio <= hoje && c.fim >= hoje);
  if (i < 0) return null;
  const c = colunas[i];
  return i + (diffDays(hoje, c.inicio) + 0.5) / (diffDays(c.fim, c.inicio) + 1);
}
