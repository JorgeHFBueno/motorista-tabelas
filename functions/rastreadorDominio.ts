// Regras puras das viagens do rastreador (Fulltrack/Soluzion), sem Firebase; teste em test/rastreador.test.mjs.
// Uma viagem é a saída do raio da Fábrica até a volta. O motorista e a obra vêm do Cronograma Logístico.
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/atividades-rastreador.md.

type AnyRecord = Record<string, any>;

/** Ponto "Fábrica" cadastrado na Fulltrack. */
export const FABRICA = { lat: -27.89404950766663, lng: -53.26996386051178 };
export const RAIO_FABRICA_M = 1000;
export const RAIO_OBRA_M = 600;
/** Viagem que não passou disto da Fábrica é volta no quarteirão ou ruído do GPS: não é gravada. */
export const DISTANCIA_MINIMA_M = 3000;
/** Parada: pontos a até 300 m do primeiro por 10 min ou mais, fora da Fábrica. */
export const RAIO_PARADA_M = 300;
export const PARADA_MINIMA_MIN = 10;
export const MAX_PARADAS = 60;
/** Antes disso, a saída é o primeiro ponto fora (o último dentro estava parado há muito tempo). */
const FOLGA_SAIDA_MIN = 10;
export const OBRA_FABRICA_ID = 'O4hkkxZX3LbeZyluMsrt';

export type Ponto = { t: number; lat: number; lng: number; km: number | null };
export type Parada = { inicio: number; fim: number; lat: number; lng: number };
export type ViagemAberta = {
  saida: Ponto;
  maisLongeM: number;
  paradas: Parada[];
  /** Parada em formação: âncora e último ponto perto dela. */
  atual: { inicio: number; fim: number; lat: number; lng: number } | null;
};
export type EstadoVeiculo = { ultimoT: number | null; ultimoDentro: Ponto | null; dentro: boolean | null; aberta: ViagemAberta | null };
export type ViagemFechada = ViagemAberta & { chegada: Ponto };

const rad = (x: number) => (x * Math.PI) / 180;
export function distancia(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** "22/11/2026 03:19:38" da Fulltrack está em UTC → milissegundos. */
export function dataFulltrack(texto: unknown): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(texto ?? '').trim());
  if (!m) return null;
  const t = Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]);
  return Number.isFinite(t) ? t : null;
}

/** Ponto de events/interval ou events/all; sem data ou coordenada, null. Hodômetro em metros → km; 0 → sem km. */
export function pontoFulltrack(e: AnyRecord): Ponto | null {
  const t = dataFulltrack(e.ras_eve_data_gps);
  const lat = Number(e.ras_eve_latitude), lng = Number(e.ras_eve_longitude);
  if (t == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) < 1 || Math.abs(lng) < 1 || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const metros = Number(e.ras_eve_hodometro);
  return { t, lat, lng, km: Number.isFinite(metros) && metros > 0 ? metros / 1000 : null };
}

/** Pontos em ordem de data, sem repetir a mesma data. */
export function ordenarPontos(pontos: Ponto[]) {
  const porT = new Map<number, Ponto>();
  for (const p of pontos) porT.set(p.t, p);
  return [...porT.values()].sort((a, b) => a.t - b.t);
}

const compacta = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Placa comparável: 7 primeiros caracteres, no padrão antigo (Mercosul IRO2B46 → IRO2146). Sem placa, null. */
export function chavePlaca(texto: unknown): string | null {
  const p = compacta(texto).slice(0, 7);
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p)) return null;
  return /[A-J]/.test(p[4]) ? p.slice(0, 4) + 'ABCDEFGHIJ'.indexOf(p[4]) + p.slice(5) : p;
}

const ehLocalizador = (r: AnyRecord) => /LOCALIZADOR/i.test(String(r.ras_vei_veiculo ?? '')) || /\s-\s*\S{0,3}$|\s-$/.test(String(r.ras_vei_placa ?? ''));

/**
 * Rastreador de cada veículo com placa: liga pela placa (os textos da Fulltrack variam: "IRO 2B46 - ", "ITU1I21 ") e,
 * quando há mais de um (o principal e o "LOCALIZADOR"), prefere o que comunicou nos últimos 3 dias, depois o que não é
 * localizador (manda muito menos dados), depois o que tem hodômetro, depois o que comunicou por último.
 */
export function ligarRastreadores(ultimos: AnyRecord[], veiculos: { id: string; identificador: string }[], agora: number) {
  const porPlaca = new Map<string, AnyRecord[]>();
  for (const r of ultimos) {
    const k = chavePlaca(r.ras_vei_placa) ?? chavePlaca(r.ras_vei_veiculo);
    if (!k) continue;
    if (!porPlaca.has(k)) porPlaca.set(k, []);
    porPlaca.get(k)!.push(r);
  }
  const ligados = new Map<string, { veiculoId: string; placa: string; nome: string; ultimaComunicacao: number | null; outros: string[] }>();
  for (const v of veiculos) {
    const k = chavePlaca(v.identificador);
    const candidatos = k ? porPlaca.get(k) : undefined;
    if (!candidatos?.length) continue;
    const nota = (r: AnyRecord) => {
      const ult = dataFulltrack(r.ras_ras_data_ult_comunicacao) ?? 0;
      return [ult >= agora - 3 * 864e5 ? 1 : 0, ehLocalizador(r) ? 0 : 1, Number(r.ras_eve_hodometro) > 0 ? 1 : 0, ult];
    };
    const ordenados = [...candidatos].sort((a, b) => {
      const na = nota(a), nb = nota(b);
      for (let i = 0; i < na.length; i++) if (na[i] !== nb[i]) return nb[i] - na[i];
      return 0;
    });
    const r = ordenados[0];
    ligados.set(v.id, {
      veiculoId: String(r.ras_vei_id), placa: String(r.ras_vei_placa ?? '').trim(), nome: String(r.ras_vei_veiculo ?? '').trim(),
      ultimaComunicacao: dataFulltrack(r.ras_ras_data_ult_comunicacao), outros: ordenados.slice(1).map((x) => String(x.ras_vei_id)),
    });
  }
  return ligados;
}

export const estadoInicial = (): EstadoVeiculo => ({ ultimoT: null, ultimoDentro: null, dentro: null, aberta: null });

function fecharParada(v: ViagemAberta) {
  const a = v.atual;
  if (a && a.fim - a.inicio >= PARADA_MINIMA_MIN * 60e3) {
    v.paradas.push({ inicio: a.inicio, fim: a.fim, lat: a.lat, lng: a.lng });
    if (v.paradas.length > MAX_PARADAS) {
      // Fica a mais longa de todas e as mais recentes.
      const longa = v.paradas.reduce((m, p) => (p.fim - p.inicio > m.fim - m.inicio ? p : m));
      v.paradas = [longa, ...v.paradas.filter((p) => p !== longa).slice(-(MAX_PARADAS - 1))].sort((x, y) => x.inicio - y.inicio);
    }
  }
  v.atual = null;
}

/** Paradas da viagem, contando a que está em formação (aberta) quando já tem o tempo mínimo. */
export function paradasDaViagem(v: ViagemAberta): Parada[] {
  const a = v.atual;
  return a && a.fim - a.inicio >= PARADA_MINIMA_MIN * 60e3 ? [...v.paradas, { inicio: a.inicio, fim: a.fim, lat: a.lat, lng: a.lng }] : v.paradas;
}

/**
 * Passa os pontos novos (já ordenados, depois de `ultimoT`) pelo estado do veículo. Devolve o estado novo, as viagens
 * fechadas (voltou ao raio da Fábrica) e a aberta, se houver. Viagens que não passaram de DISTANCIA_MINIMA_M somem.
 */
export function processarPontos(estadoAntes: EstadoVeiculo, pontos: Ponto[]) {
  const e: EstadoVeiculo = JSON.parse(JSON.stringify(estadoAntes));
  const fechadas: ViagemFechada[] = [];
  for (const p of pontos) {
    if (e.ultimoT != null && p.t <= e.ultimoT) continue;
    const dentro = distancia(p, FABRICA) <= RAIO_FABRICA_M;
    if (dentro) {
      if (e.aberta) {
        fecharParada(e.aberta);
        if (e.aberta.maisLongeM > DISTANCIA_MINIMA_M) fechadas.push({ ...e.aberta, chegada: p });
        e.aberta = null;
      }
      e.ultimoDentro = p.km == null && e.ultimoDentro?.km != null ? { ...p, km: e.ultimoDentro.km } : p;
    } else {
      if (!e.aberta) {
        // Sem ponto dentro antes (primeira leitura já fora), a saída é este ponto; o último dentro parado há muito
        // tempo também dá lugar ao primeiro ponto fora, com o KM do último dentro.
        const ud = e.ultimoDentro;
        const saida = !ud ? p : p.t - ud.t <= FOLGA_SAIDA_MIN * 60e3 ? ud : { ...p, km: ud.km ?? p.km };
        e.aberta = { saida, maisLongeM: 0, paradas: [], atual: null };
      }
      const v = e.aberta;
      v.maisLongeM = Math.max(v.maisLongeM, distancia(p, FABRICA));
      if (v.atual && distancia(p, v.atual) <= RAIO_PARADA_M) v.atual.fim = p.t;
      else { fecharParada(v); v.atual = { inicio: p.t, fim: p.t, lat: p.lat, lng: p.lng }; }
    }
    e.dentro = dentro;
    e.ultimoT = p.t;
  }
  return { estado: e, fechadas, aberta: e.aberta && e.aberta.maisLongeM > DISTANCIA_MINIMA_M ? e.aberta : null };
}

/** Data civil de Brasília (UTC−3, sem horário de verão). */
export const diaBrasilia = (t: number) => new Date(t - 3 * 3600e3).toISOString().slice(0, 10);

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const veiculosDaProgramacao = (p: AnyRecord): AnyRecord[] => (Array.isArray(p.veiculos) ? p.veiculos : [p.veiculo]).filter((x) => x && typeof x === 'object');

/** Programações do Cronograma com o veículo cujo período (início a fim) cruza os dias da viagem. */
export function programacoesDaViagem(programacoes: AnyRecord[], itemFrotaId: string, saidaT: number, chegadaT: number | null, agora: number) {
  const de = diaBrasilia(saidaT), ate = diaBrasilia(chegadaT ?? agora);
  return programacoes.filter((p) => {
    const inicio = texto(p.inicio);
    if (!inicio) return false;
    const fim = texto(p.fim) || inicio;
    return inicio <= ate && fim >= de && veiculosDaProgramacao(p).some((x) => x.id === itemFrotaId);
  });
}

/** Onde a obra está: o Local da programação; sem ele, os LOTEs da obra com coordenada (obras-v2). A Fábrica não conta. */
export function alvosDaProgramacao(p: AnyRecord, obras: Map<string, AnyRecord>) {
  const obraId = texto(p.obra?.id);
  if (!obraId || obraId === OBRA_FABRICA_ID) return [];
  const local = p.local;
  if (local && Number.isFinite(local.lat) && Number.isFinite(local.lng)) {
    return [{ nome: [texto(local.cidade), texto(local.uf)].filter(Boolean).join(' - ') || 'Local da programação', lat: local.lat, lng: local.lng, origem: 'local' as const }];
  }
  const lotes = obras.get(obraId)?.lotes;
  return Object.values(lotes && typeof lotes === 'object' ? lotes : {})
    .filter((l: any) => Number.isFinite(l?.coordenada?.lat) && Number.isFinite(l?.coordenada?.lng))
    .map((l: any) => ({ nome: texto(l.nome) || 'LOTE', lat: l.coordenada.lat as number, lng: l.coordenada.lng as number, origem: 'lote' as const }));
}

/** Primeira e última parada a até RAIO_OBRA_M de algum ponto da obra. */
export function visitaObra(paradas: Parada[], alvos: ReturnType<typeof alvosDaProgramacao>) {
  const perto = paradas.map((p) => ({ p, alvo: alvos.find((a) => distancia(p, a) <= RAIO_OBRA_M) })).filter((x) => x.alvo);
  if (!perto.length) return null;
  const primeira = perto[0], ultima = perto[perto.length - 1];
  return { chegou: primeira.p.inicio, saiu: ultima.p.fim, nome: primeira.alvo!.nome, origem: primeira.alvo!.origem };
}

/** Motorista da programação em funcionarios: `{uid}` (linhas antigas) ou `{id}` do item do Friday (`fridayItemId`). */
export function motoristaDaProgramacao(p: AnyRecord, funcionarios: { uid: string; nome: string; fridayItemId: string | null }[]) {
  const m = p.motorista;
  if (!m || typeof m !== 'object') return null;
  const nome = texto(m.nome);
  const f = texto(m.uid) ? funcionarios.find((x) => x.uid === m.uid) : texto(m.id) ? funcionarios.find((x) => x.fridayItemId === String(m.id)) : undefined;
  if (f) return { uid: f.uid, nome: f.nome || nome };
  return nome ? { uid: null, nome } : null;
}

/** Campos do documento da viagem (sem as datas do servidor nem o motorista manual, que a gravação preserva). */
export function documentoViagem(args: {
  itemFrotaId: string; veiculo: AnyRecord; rastreador: { veiculoId: string; placa: string };
  viagem: ViagemAberta & { chegada?: Ponto | null };
  programacoes: AnyRecord[]; obras: Map<string, AnyRecord>; funcionarios: { uid: string; nome: string; fridayItemId: string | null }[];
  agora: number;
}) {
  const { viagem: v } = args;
  const chegada = v.chegada ?? null;
  const progs = programacoesDaViagem(args.programacoes, args.itemFrotaId, v.saida.t, chegada?.t ?? null, args.agora);
  const paradas = paradasDaViagem(v);
  let visita: ReturnType<typeof visitaObra> = null;
  for (const p of progs) {
    const vis = visitaObra(paradas, alvosDaProgramacao(p, args.obras));
    if (vis && (!visita || vis.chegou < visita.chegou)) visita = vis;
  }
  const motoristas = progs.map((p) => motoristaDaProgramacao(p, args.funcionarios)).filter(Boolean) as { uid: string | null; nome: string }[];
  const unicos = [...new Map(motoristas.map((m) => [m.uid ?? `nome:${m.nome}`, m])).values()];
  const longa = paradas.length ? paradas.reduce((m, p) => (p.fim - p.inicio > m.fim - m.inicio ? p : m)) : null;
  const ponto = (p: Ponto) => ({ data: new Date(p.t), km: p.km == null ? null : Math.round(p.km), lat: p.lat, lng: p.lng });
  const ident = args.veiculo.identificacao ?? {};
  return {
    schemaVersion: 1,
    item_frota_id: args.itemFrotaId,
    item_frota_snapshot: { categoria: texto(ident.categoria) || 'PLACA', identificador: texto(ident.identificador), nome: texto(ident.nome) },
    rastreador: { fornecedor: 'fulltrack', veiculoId: args.rastreador.veiculoId, placa: args.rastreador.placa },
    situacao: chegada ? 'concluida' : 'em_andamento',
    saida: ponto(v.saida),
    chegada: chegada ? ponto(chegada) : null,
    kmRodado: chegada && v.saida.km != null && chegada.km != null ? Math.round(chegada.km - v.saida.km) : null,
    maisLongeKm: Math.round(v.maisLongeM / 100) / 10,
    paradas: paradas.map((p) => ({ inicio: new Date(p.inicio), fim: new Date(p.fim), lat: p.lat, lng: p.lng })),
    paradaMaisLonga: longa ? { inicio: new Date(longa.inicio), fim: new Date(longa.fim), minutos: Math.round((longa.fim - longa.inicio) / 60e3), lat: longa.lat, lng: longa.lng } : null,
    programacoes: progs.map((p) => ({ id: String(p.id), item: texto(p.item), obra: p.obra?.id ? { id: String(p.obra.id), nome: texto(p.obra.nome) } : null, motorista: texto(p.motorista?.nome) || null, inicio: texto(p.inicio), fim: texto(p.fim) || texto(p.inicio) })),
    visitaObra: visita ? { chegou: new Date(visita.chegou), saiu: new Date(visita.saiu), nome: visita.nome, origem: visita.origem } : null,
    /** Motorista pela programação: um só; com mais de um (ou nenhum), fica para a atribuição manual. */
    motoristaProgramacao: unicos.length === 1 ? unicos[0] : null,
  };
}

/** Id estável da viagem: o veículo e o segundo da saída (reprocessar não duplica). */
export const idViagem = (itemFrotaId: string, saidaT: number) => `${itemFrotaId}_${Math.floor(saidaT / 1000)}`;
