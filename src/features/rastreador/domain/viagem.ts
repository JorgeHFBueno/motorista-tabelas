// Viagens do rastreador (atividades-rastreador), lidas pelas abas Rastreador e Geral de /mecanica/registros. Puro e
// testado em tests/rastreador.test.ts. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/atividades-rastreador.md.
import { rotuloVeiculo, type AtividadeComData, type FiltrosAtividade } from '../../../services/atividade-filtros';

export type PontoViagem = { data: Date; km: number | null };
export type PessoaRef = { uid: string | null; nome: string };
export type Falta = 'motorista' | 'obra' | 'destino' | 'motivo' | 'km' | 'saida';
/** Saída ou Chegada da viagem em `atividades`, decidida pela Function (fase A.1). */
export type RegistroViagem = {
  estado: 'app' | 'rastreador' | 'aguardando' | 'pendente';
  atividadeId: string | null;
  faltam: Falta[];
  /** KM do painel: hodômetro do rastreador + ajuste do veículo; null sem calibração. */
  km: number | null;
  motorista: PessoaRef | null;
  obra: string | null;
  destino: string | null;
  motivo: string | null;
};
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
  registros: { saida: RegistroViagem | null; chegada: RegistroViagem | null };
  /** Cidade da parada mais longa, sugestão para o destino da Saída a completar. */
  destinoSugerido: string | null;
};
export type AmostraCalibracao = { fonte: 'atividade' | 'combustivel'; data: Date; km: number; kmRastreador: number; diferenca: number; concorda: boolean };
export type Calibracao = { ajusteKm: number | null; motivo: string | null; amostras: AmostraCalibracao[] };
export type VeiculoRastreador = {
  id: string; identificador: string; temRastreador: boolean; ultimaComunicacao: Date | null; erro: string | null;
  calibracao: Calibracao | null;
};

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
const ESTADOS = ['app', 'rastreador', 'aguardando', 'pendente'] as const;
const FALTAS: Falta[] = ['motorista', 'obra', 'destino', 'motivo', 'km', 'saida'];
const registro = (v: unknown): RegistroViagem | null => {
  const r = map(v);
  const estado = ESTADOS.find((e) => e === r.estado);
  if (!estado) return null;
  return {
    estado,
    atividadeId: text(r.atividadeId) || null,
    faltam: (Array.isArray(r.faltam) ? r.faltam : []).filter((f): f is Falta => FALTAS.includes(f as Falta)),
    km: num(r.km),
    motorista: pessoa(r.motorista),
    obra: text(map(r.obra).nome) || null,
    destino: text(r.destino) || null,
    motivo: text(r.motivo) || null,
  };
};

/** Calibração do KM guardada em atividades-rastreador-veiculos (`calibracao`). */
export function calibracaoDoDocumento(v: unknown): Calibracao | null {
  const c = map(v);
  if (!('ajusteKm' in c)) return null;
  const amostras = (Array.isArray(c.amostras) ? c.amostras : []).flatMap((a) => {
    const m = map(a); const data = toDate(m.data);
    const kmPainel = num(m.km), kmRastreador = num(m.kmRastreador), diferenca = num(m.diferenca);
    return data && kmPainel != null && kmRastreador != null && diferenca != null
      ? [{ fonte: m.fonte === 'atividade' ? 'atividade' as const : 'combustivel' as const, data, km: kmPainel, kmRastreador, diferenca, concorda: m.concorda === true }] : [];
  });
  return { ajusteKm: num(c.ajusteKm), motivo: text(c.motivo) || null, amostras };
}

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
    registros: { saida: registro(map(raw.registros).saida), chegada: registro(map(raw.registros).chegada) },
    destinoSugerido: [text(map(raw.destinoSugerido).cidade), text(map(raw.destinoSugerido).uf)].filter(Boolean).join(' - ') || null,
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

/** Linha da aba Geral: registro de `atividades` (App/WEB ou rastreador) ou Saída/Chegada do rastreador a completar. */
export type LinhaGeral = AtividadeComData & {
  aCompletar?: { viagemId: string; faltam: Falta[]; destinoSugerido: string | null };
  possivelDuplicado?: boolean;
};

/** Saídas/Chegadas das viagens que a Function deixou a completar, no formato das linhas da aba Geral. */
export function linhasACompletar(viagens: ViagemRastreador[]): LinhaGeral[] {
  return viagens.flatMap((v) => (['saida', 'chegada'] as const).flatMap((tipo) => {
    const r = v.registros[tipo];
    const momento = tipo === 'saida' ? v.saida.data : v.chegada?.data ?? null;
    if (r?.estado !== 'pendente' || !momento) return [];
    return [{
      id: `${v.id}:${tipo}`, data: momento, dataJS: momento, tipo, origem: 'rastreador' as const,
      motorista: r.motorista?.nome ?? '', motoristaUid: r.motorista?.uid ?? null,
      placa: v.placa, veiculoNome: v.veiculoNome, veiculoId: v.veiculoId,
      destino: r.destino ?? '', obra: r.obra ?? '', motivo: r.motivo ?? '', km: r.km,
      aCompletar: { viagemId: v.id, faltam: r.faltam, destinoSugerido: tipo === 'saida' ? v.destinoSugerido : null },
    }];
  }));
}

/** Gravado pelo rastreador com um registro do App/WEB do mesmo veículo e tipo a até 60 min (o do App chegou depois). */
export function marcarDuplicados(linhas: LinhaGeral[]): LinhaGeral[] {
  const doApp = linhas.filter((l) => l.origem !== 'rastreador' && !l.aCompletar && l.dataJS && l.veiculoId);
  return linhas.map((l) => (l.origem === 'rastreador' && !l.aCompletar && l.dataJS && doApp.some((a) =>
    a.veiculoId === l.veiculoId && a.tipo === l.tipo && Math.abs(a.dataJS!.getTime() - l.dataJS!.getTime()) <= 3600e3)
    ? { ...l, possivelDuplicado: true } : l));
}
