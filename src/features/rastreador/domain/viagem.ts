// Viagens do rastreador (atividades-rastreador), lidas pela aba Rastreador de /mecanica/registros. Puro e testado em
// tests/rastreador.test.ts. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/atividades-rastreador.md.
import { rotuloVeiculo, type AtividadeComData, type FiltrosAtividade } from '../../../services/atividade-filtros';

export type PontoViagem = { data: Date; km: number | null };
export type PessoaRef = { uid: string | null; nome: string };
export type ViagemRastreador = {
  id: string;
  veiculoId: string;
  placa: string;
  veiculoNome: string;
  emAndamento: boolean;
  saida: PontoViagem;
  chegada: PontoViagem | null;
  kmRodado: number | null;
  maisLongeKm: number | null;
  obras: string[];
  programacoes: { id: string; item: string; obra: string; motorista: string | null }[];
  visitaObra: { chegou: Date; saiu: Date; nome: string } | null;
  paradaMaisLonga: { inicio: Date; minutos: number; lat: number; lng: number } | null;
  motorista: PessoaRef | null;
  motoristaOrigem: 'programacao' | 'manual' | null;
  atribuidoPor: string | null;
};
export type VeiculoRastreador = { id: string; identificador: string; temRastreador: boolean; ultimaComunicacao: Date | null; erro: string | null };

type AnyRecord = Record<string, unknown>;
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const map = (v: unknown): AnyRecord => (v && typeof v === 'object' && !Array.isArray(v) ? (v as AnyRecord) : {});
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const t = v as { toDate?: () => Date } | null;
  if (t && typeof t.toDate === 'function') return t.toDate();
  return null;
}
const ponto = (v: unknown): PontoViagem | null => {
  const p = map(v); const data = toDate(p.data);
  return data ? { data, km: num(p.km) } : null;
};
const pessoa = (v: unknown): PessoaRef | null => {
  const p = map(v); const nome = text(p.nome);
  return nome ? { uid: text(p.uid) || null, nome } : null;
};

export function viagemDoDocumento(id: string, raw: AnyRecord): ViagemRastreador | null {
  const saida = ponto(raw.saida);
  if (!saida) return null;
  const item = map(raw.item_frota_snapshot);
  const programacoes = (Array.isArray(raw.programacoes) ? raw.programacoes : []).map((p) => {
    const m = map(p);
    return { id: text(m.id), item: text(m.item), obra: text(map(m.obra).nome), motorista: text(m.motorista) || null };
  });
  const visita = map(raw.visitaObra), parada = map(raw.paradaMaisLonga);
  const chegou = toDate(visita.chegou), saiu = toDate(visita.saiu), inicioParada = toDate(parada.inicio);
  const origem = raw.motoristaOrigem === 'manual' || raw.motoristaOrigem === 'programacao' ? raw.motoristaOrigem : null;
  return {
    id,
    veiculoId: text(raw.item_frota_id),
    placa: text(item.identificador),
    veiculoNome: text(item.nome),
    emAndamento: raw.situacao !== 'concluida',
    saida,
    chegada: ponto(raw.chegada),
    kmRodado: num(raw.kmRodado),
    maisLongeKm: num(raw.maisLongeKm),
    obras: [...new Set(programacoes.map((p) => p.obra).filter(Boolean))],
    programacoes,
    visitaObra: chegou && saiu ? { chegou, saiu, nome: text(visita.nome) } : null,
    paradaMaisLonga: inicioParada && num(parada.lat) != null && num(parada.lng) != null
      ? { inicio: inicioParada, minutos: num(parada.minutos) ?? 0, lat: num(parada.lat)!, lng: num(parada.lng)! } : null,
    motorista: pessoa(raw.motorista),
    motoristaOrigem: origem,
    atribuidoPor: origem === 'manual' ? text(map(raw.motoristaAtribuidoPor).nome) || null : null,
  };
}

/** Sem rastreador ligado, ou sem comunicar há mais de 3 dias: esses veículos continuam com o registro manual. */
export function veiculosSemSinal(veiculos: VeiculoRastreador[], agora: Date) {
  const limite = agora.getTime() - 3 * 864e5;
  return veiculos
    .filter((v) => !v.temRastreador || !v.ultimaComunicacao || v.ultimaComunicacao.getTime() < limite)
    .sort((a, b) => a.identificador.localeCompare(b.identificador, 'pt-BR'));
}

/** Registro do motorista (Saída/Chegada de atividades) do mesmo veículo a até 4 h do momento do rastreador. */
export function registroProximo(atividades: AtividadeComData[], veiculoId: string, tipo: 'saida' | 'chegada', momento: Date | null) {
  if (!momento) return null;
  let melhor: AtividadeComData | null = null, menor = 4 * 3600e3;
  for (const a of atividades) {
    if (a.tipo !== tipo || a.veiculoId !== veiculoId || !a.dataJS) continue;
    const dt = Math.abs(a.dataJS.getTime() - momento.getTime());
    if (dt <= menor) { melhor = a; menor = dt; }
  }
  return melhor;
}

/** Rótulo do veículo igual ao da aba Geral (o filtro Veículo serve às duas). */
export const rotuloVeiculoViagem = (v: ViagemRastreador) => rotuloVeiculo({ placa: v.placa, veiculoNome: v.veiculoNome });

export type FiltroLista = 'veiculos' | 'motoristas' | 'locais' | 'obras';

/** Valores da viagem para cada filtro de lista da página (Local não se aplica: nenhum valor). */
export function valoresDaViagem(v: ViagemRastreador, filtro: FiltroLista): string[] {
  if (filtro === 'veiculos') return [rotuloVeiculoViagem(v)];
  if (filtro === 'motoristas') return v.motorista ? [v.motorista.nome] : [];
  if (filtro === 'obras') return v.obras;
  return [];
}

const naLista = (lista: string[], valores: string[]) => lista.length === 0 || valores.some((v) => lista.includes(v));

/** Filtros da página: período pela saída, veículo, motorista e obra; Local e Tipo não se aplicam às viagens. */
export function filtrarViagens(viagens: ViagemRastreador[], f: FiltrosAtividade) {
  const inicio = f.dataInicial ? new Date(`${f.dataInicial}T00:00:00`) : null;
  const fim = f.dataFinal ? new Date(`${f.dataFinal}T23:59:59.999`) : null;
  return viagens.filter((v) => {
    if (inicio && v.saida.data < inicio) return false;
    if (fim && v.saida.data > fim) return false;
    return (['veiculos', 'motoristas', 'obras'] as const).every((k) => naLista(f[k], valoresDaViagem(v, k)));
  });
}
