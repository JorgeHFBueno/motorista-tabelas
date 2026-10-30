import type { ItemFrotaV2 } from './cadastrosV2';

// Regras da lista de /frota/veiculos: busca, medidor e idade da última atualização.

export type FiltroCategoria = 'TODOS' | ItemFrotaV2['categoria'];
export type Frescor = 'recente' | 'atencao' | 'antiga' | 'sem-dado';

const DIA_MS = 24 * 60 * 60 * 1000;

function semAcento(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
}

// "ixr7d23" acha "IXR-7D23": compara só letras e números.
function chave(value: string) {
  return semAcento(value).replace(/[^a-z0-9]/g, '');
}

export function filtrarVeiculos(itens: ItemFrotaV2[], busca: string, categoria: FiltroCategoria) {
  const termo = chave(busca);
  return itens.filter((item) => (categoria === 'TODOS' || item.categoria === categoria)
    && (!termo || chave(item.identificador).includes(termo) || chave(item.nome).includes(termo)));
}

export function toDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof (raw as { toDate?: () => Date }).toDate === 'function') return toDate((raw as { toDate: () => Date }).toDate());
  if (typeof raw === 'object' && 'seconds' in raw) {
    const { seconds = 0, nanoseconds = 0 } = raw as { seconds?: number; nanoseconds?: number };
    return toDate(new Date(seconds * 1000 + nanoseconds / 1e6));
  }
  if (typeof raw === 'number' || typeof raw === 'string') return toDate(new Date(raw));
  return null;
}

// PLACA mede KM; EXTRA mede horímetro (veiculos-v2, operacional.quilometragemUltima).
export function medidorTexto(item: Pick<ItemFrotaV2, 'categoria' | 'quilometragemUltima'>) {
  if (item.quilometragemUltima === null) return '—';
  return `${new Intl.NumberFormat('pt-BR').format(item.quilometragemUltima)} ${item.categoria === 'PLACA' ? 'km' : 'h'}`;
}

function inicioDoDia(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Até 7 dias: recente; de 8 a 30: atenção; acima de 30: antiga.
export function atualizacaoInfo(raw: unknown, agora = new Date()): { texto: string; frescor: Frescor } {
  const data = toDate(raw);
  if (!data) return { texto: 'sem atualização', frescor: 'sem-dado' };
  const dias = Math.max(0, Math.round((inicioDoDia(agora) - inicioDoDia(data)) / DIA_MS));
  const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(data);
  const texto = dias === 0 ? `hoje, ${hora}`
    : dias === 1 ? `ontem, ${hora}`
      : dias <= 60 ? `há ${dias} dias`
        : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(data);
  return { texto, frescor: dias <= 7 ? 'recente' : dias <= 30 ? 'atencao' : 'antiga' };
}

/** Custo total do detalhe do veículo: soma os `valor` numéricos dos registros listados; sem valor não entra. */
export function somarValores(itens: { valor?: number | null }[]): number {
  return itens.reduce((total, item) => (typeof item.valor === 'number' && Number.isFinite(item.valor) ? total + item.valor : total), 0);
}

/** Origem do KM inicial em texto: "atividades/<id>" → atividade, "03-combustivel/<id>" → abastecimento, o resto como está. */
export function origemKmTexto(origem: string | null | undefined): string | null {
  const texto = origem?.trim();
  if (!texto) return null;
  if (texto.startsWith('atividades/')) return 'atividade';
  if (texto.startsWith('03-combustivel/')) return 'abastecimento';
  return texto;
}

export type KmInicialEntrada = { km: string; data: string; origem: string };
export type KmInicialGravar = { km: number | null; data: Date | null; origem: string | null };

/** Valida a edição do KM inicial: KM inteiro >= 0 ou vazio; com KM, a origem é obrigatória; data "AAAA-MM-DDTHH:mm" ou vazia. */
export function lerKmInicial(entrada: KmInicialEntrada): { ok: true; valor: KmInicialGravar } | { ok: false; erro: string } {
  const kmTexto = entrada.km.trim().replace(/\./g, '');
  const origem = entrada.origem.trim() || null;
  let km: number | null = null;
  if (kmTexto) {
    if (!/^\d+$/.test(kmTexto)) return { ok: false, erro: 'O KM inicial deve ser um número inteiro.' };
    km = Number(kmTexto);
  }
  let data: Date | null = null;
  if (entrada.data.trim()) {
    data = new Date(entrada.data);
    if (Number.isNaN(data.getTime())) return { ok: false, erro: 'Data inválida.' };
  }
  if (km !== null && !origem) return { ok: false, erro: 'Informe de onde veio o KM inicial.' };
  return { ok: true, valor: { km, data, origem } };
}
