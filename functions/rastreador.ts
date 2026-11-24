// Viagens pelo rastreador (Fulltrack/Soluzion), de volta em 2026-11-24 com o desenho barato: duas rodadas por dia (05:00 e
// 12:00, Brasília) e o botão "Buscar no rastreador" por placa. Lê o histórico de posições de cada veículo desde a última
// leitura, detecta as viagens (saída e volta ao raio da Fábrica) e grava atividades-rastreador; o estado de leitura de
// todos os veículos fica num documento só (atividades-rastreador-veiculos/frota). Calibra o KM uma vez por dia e grava em
// `atividades` só a Saída/Chegada pronta; o resto fica "a completar" na aba Geral de /mecanica/registros. Lê do Firestore
// só o necessário (programações recentes, obras e motoristas por id, viagens dos últimos 2 dias): a primeira versão
// relia coleções inteiras a cada 30 min (~31 mil leituras por dia) e foi aposentada por isso. Regras:
// rastreadorDominio.ts. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/atividades-rastreador.md.
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { editaArea } from './credenciais.js';
import {
  BORDAS_DIAS, CALIBRACAO_DIAS, OBRA_FABRICA_ID, PROGRAMACAO_ANTES_DIAS, REAVALIAR_DIAS, bordaDaViagem, calibrar,
  diaBrasilia, documentoViagem, estadoInicial, idViagem, juntarBordas, ligarRastreadores, ordenarPontos, pontoFulltrack,
  processarPontos, registrosDaViagem, somaDias,
  type AtividadeLida, type EstadoVeiculo, type LeituraPainel, type Ponto, type ViagemAberta, type ViagemKm,
} from './rastreadorDominio.js';
import { cidadeEstado } from './logisticaLocal.js';

const fulltrackApiKey = defineSecret('FULLTRACK_API_KEY');
const fulltrackSecretKey = defineSecret('FULLTRACK_SECRET_KEY');

const REGIAO = 'southamerica-east1';
const BASE = 'https://ws.fulltrack2.com';
export const VIAGENS = 'atividades-rastreador';
export const VEICULOS = 'atividades-rastreador-veiculos';
/** O estado de todos os veículos, num documento só (uma leitura por rodada em vez de uma por veículo). */
export const FROTA = 'frota';
/** Primeira leitura: 09/11/2026 00:00 (Brasília), as duas semanas conferidas com o responsável em 2026-11-23. */
const INICIO = Date.UTC(2026, 10, 9, 3, 0, 0);
/** A Fulltrack devolveu 7 dias numa consulta só; janelas maiores não foram testadas. */
const JANELA = 7 * 864e5;
/** A calibração é refeita quando tem mais que isso (uma vez por dia, na prática). */
const CALIBRACAO_VALIDADE = 20 * 3600e3;
/** Cidades sugeridas (Nominatim, 1 pedido por segundo) por execução. */
const SUGESTOES_POR_EXECUCAO = 15;
const SIMULTANEAS = 3;
const ID_VALIDO = /^[\w-]{1,128}$/;

type AnyRecord = Record<string, any>;
type Chaves = { apiKey: string; secretKey: string };

async function fulltrack(caminho: string, chaves: Chaves): Promise<AnyRecord[]> {
  const resposta = await fetch(`${BASE}/${caminho}`, { headers: { apiKey: chaves.apiKey, secretKey: chaves.secretKey }, signal: AbortSignal.timeout(120_000) });
  if (!resposta.ok) throw new Error(`Fulltrack ${caminho.split('/').slice(0, 2).join('/')}: HTTP ${resposta.status}`);
  const corpo = await resposta.json() as AnyRecord;
  if (corpo.status === true && Array.isArray(corpo.data)) return corpo.data;
  if (/no data/i.test(String(corpo.message ?? ''))) return [];
  throw new Error(`Fulltrack ${caminho.split('/').slice(0, 2).join('/')}: ${String(corpo.message ?? 'resposta inválida')}`);
}

async function historico(veiculoId: string, desde: number, ate: number, chaves: Chaves) {
  const pontos: Ponto[] = [];
  for (let de = desde; de < ate; de += JANELA) {
    const fim = Math.min(de + JANELA, ate);
    const linhas = await fulltrack(`events/interval/id/${encodeURIComponent(veiculoId)}/begin/${Math.floor(de / 1000)}/end/${Math.floor(fim / 1000)}`, chaves);
    for (const l of linhas) { const p = pontoFulltrack(l); if (p) pontos.push(p); }
  }
  return ordenarPontos(pontos);
}

const comparavel = (v: unknown): unknown => (v instanceof Timestamp ? v.toMillis() : v instanceof Date ? v.getTime()
  : Array.isArray(v) ? v.map(comparavel) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as AnyRecord).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, comparavel(x)])) : v);
const mudou = (antes: AnyRecord | undefined, campos: AnyRecord) => !antes || Object.entries(campos).some(([k, v]) => JSON.stringify(comparavel(antes[k])) !== JSON.stringify(comparavel(v)));

/** O que a gravação deixa na viagem: o motorista atribuído à mão (motoristaOrigem 'manual') fica. */
function viagemComMotorista(antes: AnyRecord | undefined, campos: ReturnType<typeof documentoViagem>) {
  const manual = antes?.motoristaOrigem === 'manual';
  const motorista = manual ? {} : { motorista: campos.motoristaProgramacao, motoristaOrigem: campos.motoristaProgramacao ? 'programacao' : null };
  return { novo: { ...campos, ...motorista }, ficou: (manual ? antes?.motorista : campos.motoristaProgramacao) ?? null };
}

/** Saída/Chegada pronta em `atividades`, como a do app: se o id já existe, nada; o KM do veículo só sobe. */
async function gravarAtividade(id: string, campos: Record<string, any>) {
  const ref = db.collection('atividades').doc(id);
  const veiculoRef = db.collection('veiculos-v2').doc(String(campos.item_frota_id));
  return db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    const veiculo = await tx.get(veiculoRef);
    tx.set(ref, { ...campos, registradoEm: FieldValue.serverTimestamp() });
    const atual = veiculo.get('operacional.quilometragemUltima');
    if (veiculo.exists && typeof campos.km === 'number' && (typeof atual !== 'number' || campos.km > Math.trunc(atual))) {
      tx.update(veiculoRef, { 'operacional.quilometragemUltima': campos.km, 'operacional.dataUltimaAtualizacao': FieldValue.serverTimestamp() });
    }
    return true;
  });
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';
/** Cidade da parada mais longa (OpenStreetMap), sugestão para o destino da linha a completar. */
async function cidadeDoPonto(lat: number, lng: number) {
  const resposta = await fetch(`${NOMINATIM}/reverse?${new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lng), zoom: '10', addressdetails: '1' })}`, {
    headers: { 'User-Agent': 'LedurMotoristaWeb/1.0 (rastreador)', 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(8000),
  });
  if (!resposta.ok) throw new Error(`Nominatim ${resposta.status}`);
  const corpo = await resposta.json() as Record<string, any>;
  return cidadeEstado(corpo?.address);
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Viagem guardada → forma do domínio, para recalcular programação, obra e motorista. */
function viagemDoDocumento(d: AnyRecord): (ViagemAberta & { chegada: Ponto | null }) | null {
  const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : null);
  const ponto = (p: AnyRecord | null | undefined): Ponto | null => (p && ms(p.data) != null ? { t: ms(p.data)!, lat: p.lat, lng: p.lng, km: typeof p.km === 'number' ? p.km : null } : null);
  const saida = ponto(d.saida);
  if (!saida) return null;
  return {
    saida, chegada: ponto(d.chegada), maisLongeM: (Number(d.maisLongeKm) || 0) * 1000, atual: null,
    paradas: (Array.isArray(d.paradas) ? d.paradas : []).map((p: AnyRecord) => ({ inicio: ms(p.inicio) ?? 0, fim: ms(p.fim) ?? 0, lat: p.lat, lng: p.lng })),
  };
}

/** Grava a viagem (só se mudou), numa transação que preserva o motorista atribuído à mão entre a leitura e a gravação. */
async function gravarViagem(id: string, campos: ReturnType<typeof documentoViagem> | null, extra: AnyRecord) {
  const ref = db.collection(VIAGENS).doc(id);
  return db.runTransaction(async (tx) => {
    const atual = await tx.get(ref);
    const antes = atual.exists ? atual.data() : undefined;
    const novo = { ...(campos ? viagemComMotorista(antes, campos).novo : {}), ...extra };
    if (!mudou(antes, novo)) return false;
    tx.set(ref, { ...novo, ...(antes ? {} : { criadoEm: FieldValue.serverTimestamp() }), atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}

/**
 * O documento da frota. Na primeira vez, monta-o dos documentos por veículo da primeira versão (até 2026-11-24) e das
 * saídas/voltas dos últimos 16 dias, para a leitura continuar de onde parou e a calibração ter com o que comparar.
 */
async function lerFrota(agora: number, contar: (n: number) => void) {
  const snap = await db.collection(VEICULOS).doc(FROTA).get();
  contar(1);
  if (snap.exists) return { veiculos: (snap.get('veiculos') ?? {}) as Record<string, AnyRecord>, existia: true };
  const [antigos, viagens] = await Promise.all([
    db.collection(VEICULOS).get(),
    db.collection(VIAGENS).where('saida.data', '>=', new Date(agora - BORDAS_DIAS * 864e5)).get(),
  ]);
  contar(antigos.size + viagens.size);
  const veiculos: Record<string, AnyRecord> = {};
  for (const d of antigos.docs) {
    const x = d.data();
    veiculos[d.id] = {
      item_frota_id: d.id, identificador: x.identificador ?? '', nome: '', categoria: 'PLACA', rastreador: x.rastreador ?? null,
      ultimaComunicacao: x.ultimaComunicacao ?? null, ultimoPonto: x.ultimoPonto ?? null, leitura: x.leitura ?? null,
      erro: x.erro ?? null, bordas: [], calibracao: x.calibracao ?? null,
    };
  }
  for (const d of viagens.docs) {
    const v = viagemDoDocumento(d.data()), id = d.get('item_frota_id');
    if (v && veiculos[id]) veiculos[id].bordas = juntarBordas(veiculos[id].bordas, [bordaDaViagem(v)], agora);
  }
  return { veiculos, existia: false };
}

type Opcoes = { agora?: number; itens?: string[] };

/**
 * Uma rodada: todos os veículos com placa (agendada) ou só os pedidos (botão por placa). Devolve o resumo, com as
 * leituras do Firestore que fez.
 */
export async function processarRastreador(chaves: Chaves, opcoes: Opcoes = {}) {
  const agora = opcoes.agora ?? Date.now();
  const itens = opcoes.itens;
  let leituras = 0;
  const contar = (n: number) => { leituras += n; };
  const frota = await lerFrota(agora, contar);
  const estados = frota.veiculos;

  // Veículos com placa: na rodada, todos (para pegar placas novas); no botão, só o pedido.
  let veiculos: Map<string, AnyRecord>;
  if (itens) {
    const snaps = await db.getAll(...itens.map((id) => db.collection('veiculos-v2').doc(id)));
    contar(snaps.length);
    veiculos = new Map(snaps.filter((s) => s.exists && s.get('identificacao.categoria') === 'PLACA').map((s) => [s.id, s.data()!]));
  } else {
    const snap = await db.collection('veiculos-v2').where('identificacao.categoria', '==', 'PLACA').get();
    contar(snap.size);
    veiculos = new Map(snap.docs.map((d) => [d.id, d.data()]));
  }
  const ultimos = await fulltrack('events/all', chaves);
  const ligados = ligarRastreadores(ultimos, [...veiculos].map(([id, v]) => ({ id, identificador: String(v.identificacao?.identificador ?? '') })), agora);
  const resumo = {
    veiculos: veiculos.size, comRastreador: ligados.size, viagensGravadas: 0, atividadesGravadas: 0, aCompletar: 0,
    calibrados: null as number | null, leituras: 0, erros: [] as string[],
  };

  // 1. Histórico de cada veículo desde onde parou.
  const novas: { id: string; itemId: string; viagem: ViagemAberta & { chegada?: Ponto | null }; rastreador: { veiculoId: string; placa: string } }[] = [];
  const alterados = new Map<string, AnyRecord>();
  const fila = [...veiculos.keys()];
  const trabalhar = async () => {
    for (let itemId = fila.shift(); itemId; itemId = fila.shift()) {
      const ident = veiculos.get(itemId)!.identificacao ?? {};
      const base = { item_frota_id: itemId, identificador: String(ident.identificador ?? ''), nome: String(ident.nome ?? ''), categoria: String(ident.categoria ?? 'PLACA') };
      const antes = estados[itemId];
      const r = ligados.get(itemId);
      let novo: AnyRecord;
      if (!r) {
        novo = { ...base, rastreador: null, ultimaComunicacao: null, ultimoPonto: null, leitura: null, erro: null, bordas: antes?.bordas ?? [], calibracao: antes?.calibracao ?? null };
      } else {
        try {
          const mesmo = antes?.rastreador?.veiculoId === r.veiculoId;
          const estado: EstadoVeiculo = mesmo && antes?.leitura ? antes.leitura as EstadoVeiculo : { ...estadoInicial(), ultimoT: antes?.leitura?.ultimoT ?? null };
          const desde = estado.ultimoT != null ? estado.ultimoT + 1000 : INICIO;
          const pontos = await historico(r.veiculoId, desde, agora, chaves);
          const { estado: lido, fechadas, aberta } = processarPontos(estado, pontos);
          const viagens = [...fechadas, ...(aberta ? [aberta] : [])];
          for (const v of viagens) novas.push({ id: idViagem(itemId, v.saida.t), itemId, viagem: v, rastreador: r });
          const ultimo = pontos[pontos.length - 1];
          novo = {
            ...base,
            rastreador: { fornecedor: 'fulltrack', veiculoId: r.veiculoId, placa: r.placa, nome: r.nome, outros: r.outros },
            ultimaComunicacao: r.ultimaComunicacao ? new Date(r.ultimaComunicacao) : null,
            ultimoPonto: ultimo ? { data: new Date(ultimo.t), lat: ultimo.lat, lng: ultimo.lng, km: ultimo.km == null ? null : Math.round(ultimo.km) } : antes?.ultimoPonto ?? null,
            leitura: lido, erro: null,
            bordas: juntarBordas(antes?.bordas ?? [], viagens.map(bordaDaViagem), agora),
            calibracao: antes?.calibracao ?? null,
          };
        } catch (error) {
          const mensagem = String((error as Error)?.message ?? error).slice(0, 500);
          resumo.erros.push(`${base.identificador}: ${mensagem}`);
          logger.error('rastreador: veículo falhou', { itemId, identificador: base.identificador, erro: mensagem });
          novo = { ...(antes ?? {}), ...base, erro: { mensagem, em: new Date(agora) } };
        }
      }
      estados[itemId] = novo;
      if (mudou(antes, novo)) alterados.set(itemId, novo);
    }
  };
  await Promise.all(Array.from({ length: SIMULTANEAS }, trabalhar));

  // 2. Viagens a avaliar: as novas e as já gravadas dos últimos 2 dias (no botão, só as do veículo, pelo id, que começa
  // com ele: sem índice e sem ler as dos outros).
  const desdeReavaliar = Math.floor((agora - REAVALIAR_DIAS * 864e5) / 1000);
  const consultas = itens
    ? itens.map((id) => db.collection(VIAGENS).orderBy(FieldPath.documentId()).startAt(`${id}_${desdeReavaliar}`).endAt(`${id}_`).get())
    : [db.collection(VIAGENS).where('saida.data', '>=', new Date(desdeReavaliar * 1000)).get()];
  const lidos = new Map<string, AnyRecord>();
  for (const snap of await Promise.all(consultas)) { contar(snap.size); for (const d of snap.docs) lidos.set(d.id, d.data()); }
  const semLer = [...new Set(novas.map((n) => n.id))].filter((id) => !lidos.has(id));
  if (semLer.length) {
    const snaps = await db.getAll(...semLer.map((id) => db.collection(VIAGENS).doc(id)));
    contar(snaps.length);
    for (const s of snaps) if (s.exists) lidos.set(s.id, s.data()!);
  }
  const porId = new Map(novas.map((n) => [n.id, n]));
  const avaliar = [...new Set([...porId.keys(), ...lidos.keys()])];

  // 3. Calibração (uma vez por dia, só na rodada agendada): leituras do painel dos últimos 15 dias.
  const calibrarAgora = !itens && [...ligados.keys()].some((id) => {
    const em = estados[id]?.calibracao?.calculadaEm;
    const ms = em instanceof Timestamp ? em.toMillis() : em instanceof Date ? em.getTime() : null;
    return ms == null || agora - ms > CALIBRACAO_VALIDADE;
  });
  const saidas = avaliar.map((id) => porId.get(id)?.viagem.saida.t ?? viagemDoDocumento(lidos.get(id)!)?.saida.t ?? agora);
  const maisAntiga = Math.min(agora, ...saidas);
  const desdeAtividades = Math.min(maisAntiga - 3600e3, calibrarAgora ? agora - CALIBRACAO_DIAS * 864e5 : Infinity);

  // 4. Contexto, só o necessário: programações que começam até 14 dias antes da viagem mais antiga, as obras e os
  // motoristas delas (por id) e as atividades do período.
  const [progsSnap, atividadesSnap] = avaliar.length || calibrarAgora ? await Promise.all([
    avaliar.length ? db.collection('logistica-programacoes').where('inicio', '>=', somaDias(diaBrasilia(maisAntiga), -PROGRAMACAO_ANTES_DIAS)).get() : null,
    db.collection('atividades').where('data', '>=', new Date(desdeAtividades)).get(),
  ]) : [null, null];
  contar((progsSnap?.size ?? 0) + (atividadesSnap?.size ?? 0));
  const programacoes = (progsSnap?.docs ?? []).map((d) => ({ id: d.id, ...d.data() })) as AnyRecord[];
  const obraIds = [...new Set([OBRA_FABRICA_ID, ...programacoes.map((p) => p.obra?.id).filter((x): x is string => typeof x === 'string' && ID_VALIDO.test(x))])];
  const uids = [...new Set(programacoes.map((p) => p.motorista?.uid).filter((x): x is string => typeof x === 'string' && ID_VALIDO.test(x)))];
  const fridayIds = [...new Set(programacoes.map((p) => (p.motorista?.id == null ? '' : String(p.motorista.id))).filter(Boolean))];
  const obras = new Map<string, AnyRecord>();
  const funcionarios: { uid: string; nome: string; fridayItemId: string | null }[] = [];
  const pessoa = (d: FirebaseFirestore.DocumentSnapshot) => ({ uid: d.id, nome: typeof d.get('nome') === 'string' ? (d.get('nome') as string).trim() : '', fridayItemId: d.get('fridayItemId') ? String(d.get('fridayItemId')) : null });
  if (avaliar.length) {
    const [obrasSnaps, uidSnaps, ...fridaySnaps] = await Promise.all([
      db.getAll(...obraIds.map((id) => db.collection('obras-v2').doc(id))),
      uids.length ? db.getAll(...uids.map((id) => db.collection('funcionarios').doc(id))) : Promise.resolve([]),
      ...Array.from({ length: Math.ceil(fridayIds.length / 30) }, (_, i) => db.collection('funcionarios').where('fridayItemId', 'in', fridayIds.slice(i * 30, i * 30 + 30)).get()),
    ]);
    contar(obrasSnaps.length + uidSnaps.length + fridaySnaps.reduce((n, s) => n + s.size, 0));
    for (const s of obrasSnaps) if (s.exists) obras.set(s.id, s.data()!);
    for (const s of uidSnaps) if (s.exists) funcionarios.push(pessoa(s));
    for (const q of fridaySnaps) for (const d of q.docs) funcionarios.push(pessoa(d));
  }
  const atividades: AtividadeLida[] = (atividadesSnap?.docs ?? []).flatMap((d) => {
    const a = d.data(), t = a.data instanceof Timestamp ? a.data.toMillis() : null;
    if (t == null || (a.tipo !== 'saida' && a.tipo !== 'chegada') || !a.item_frota_id) return [];
    const m = a.motorista && typeof a.motorista === 'object' ? { uid: typeof a.motorista.uid === 'string' ? a.motorista.uid : null, nome: String(a.motorista.nome ?? '') } : null;
    return [{ id: d.id, tipo: a.tipo, t, itemFrotaId: String(a.item_frota_id), motorista: m, rastreadorViagemId: typeof a.rastreadorViagemId === 'string' ? a.rastreadorViagemId : null }];
  });

  if (calibrarAgora) {
    const combustivel = await db.collection('03-combustivel').where('data', '>=', new Date(agora - CALIBRACAO_DIAS * 864e5)).get();
    contar(combustivel.size);
    const leiturasPainel = new Map<string, LeituraPainel[]>();
    const somar = (itemId: unknown, l: LeituraPainel) => { if (typeof itemId === 'string') leiturasPainel.set(itemId, [...(leiturasPainel.get(itemId) ?? []), l]); };
    for (const a of atividadesSnap?.docs ?? []) {
      const x = a.data();
      if (!x.rastreadorViagemId && x.data instanceof Timestamp && typeof x.km === 'number' && x.data.toMillis() >= agora - CALIBRACAO_DIAS * 864e5) somar(x.item_frota_id, { id: a.id, fonte: 'atividade', t: x.data.toMillis(), km: x.km });
    }
    for (const c of combustivel.docs) {
      const x = c.data();
      if (x.data instanceof Timestamp && typeof x.quilometragem === 'number') somar(x.item_frota_id, { id: c.id, fonte: 'combustivel', t: x.data.toMillis(), km: x.quilometragem });
    }
    for (const itemId of ligados.keys()) {
      const c = calibrar(leiturasPainel.get(itemId) ?? [], (estados[itemId]?.bordas ?? []) as ViagemKm[]);
      estados[itemId] = {
        ...estados[itemId],
        calibracao: {
          ajusteKm: c.ajusteKm, motivo: c.motivo, calculadaEm: new Date(agora),
          amostras: c.amostras.map((a) => ({ fonte: a.fonte, id: a.id, data: new Date(a.t), km: a.km, kmRastreador: a.kmRastreador, diferenca: a.diferenca, concorda: a.concorda })),
        },
      };
      alterados.set(itemId, estados[itemId]);
    }
    resumo.calibrados = [...ligados.keys()].filter((id) => estados[id]?.calibracao?.ajusteKm != null).length;
  }

  // 5. Cada viagem: programação, obra e motorista (as fechadas e as novas), a Saída/Chegada em `atividades` e a cidade
  // sugerida; grava só o que mudou.
  let sugestoes = 0;
  for (const id of avaliar) {
    const nova = porId.get(id), existente = lidos.get(id);
    const viagem = nova?.viagem ?? (existente ? viagemDoDocumento(existente) : null);
    const itemId = nova?.itemId ?? existente?.item_frota_id;
    const veiculo = veiculos.get(itemId);
    if (!viagem || !veiculo) continue;
    const recalcular = Boolean(nova) || existente?.situacao === 'concluida';
    const campos = recalcular
      ? documentoViagem({ itemFrotaId: itemId, veiculo, rastreador: nova?.rastreador ?? existente!.rastreador, viagem, programacoes, obras, funcionarios, agora })
      : null;
    const motorista = campos ? viagemComMotorista(existente, campos).ficou : existente?.motorista ?? null;
    const visita = campos ? campos.visitaObra : existente?.visitaObra ?? null;
    const registros = registrosDaViagem({
      viagemId: id, itemFrotaId: itemId, veiculoSnapshot: campos?.item_frota_snapshot ?? existente!.item_frota_snapshot,
      saida: { t: viagem.saida.t, km: viagem.saida.km }, chegada: viagem.chegada ? { t: viagem.chegada.t, km: viagem.chegada.km } : null, motorista,
      programacaoDaVisita: visita?.programacaoId ? programacoes.find((p) => p.id === visita.programacaoId) ?? null : null,
      ajusteKm: estados[itemId]?.calibracao?.ajusteKm ?? null, obras, atividades, agora,
    });
    for (const g of registros.gravar) {
      contar(2);
      if (await gravarAtividade(g.id, g.campos)) resumo.atividadesGravadas += 1;
    }
    for (const r of [registros.saida, registros.chegada]) if (r?.estado === 'pendente') resumo.aCompletar += 1;

    // Destino sugerido: a cidade da parada mais longa, só para a Saída a completar sem obra ou destino.
    const longa = campos?.paradaMaisLonga ?? existente?.paradaMaisLonga;
    const precisa = registros.saida.estado === 'pendente' && (registros.saida.faltam.includes('obra') || registros.saida.faltam.includes('destino')) && longa;
    let destinoSugerido = existente?.destinoSugerido ?? null;
    if (precisa && (destinoSugerido?.lat !== longa.lat || destinoSugerido?.lng !== longa.lng) && sugestoes < SUGESTOES_POR_EXECUCAO) {
      try {
        if (sugestoes) await esperar(1100);
        sugestoes += 1;
        const { cidade, uf } = await cidadeDoPonto(longa.lat, longa.lng);
        destinoSugerido = { cidade, uf, lat: longa.lat, lng: longa.lng };
      } catch (error) {
        logger.warn('rastreador: cidade da parada falhou', { viagemId: id, erro: String((error as Error)?.message ?? error) });
      }
    }
    const extra = { registros: { saida: registros.saida, chegada: registros.chegada }, destinoSugerido };
    const previsto = { ...(campos ? viagemComMotorista(existente, campos).novo : {}), ...extra };
    if (mudou(existente, previsto)) {
      contar(1);
      if (await gravarViagem(id, campos, extra)) resumo.viagensGravadas += 1;
    }
  }

  // 6. O estado dos veículos que mudaram, num documento só.
  const ref = db.collection(VEICULOS).doc(FROTA);
  if (!frota.existia) {
    await ref.set({ schemaVersion: 2, veiculos: estados, atualizadoEm: FieldValue.serverTimestamp() });
  } else if (alterados.size) {
    const pares = [...alterados].flatMap(([itemId, estado]) => [new FieldPath('veiculos', itemId), estado]);
    await ref.update(new FieldPath('atualizadoEm'), FieldValue.serverTimestamp(), ...pares);
  }
  resumo.leituras = leituras;
  return resumo;
}

function chavesDaFulltrack(): Chaves | null {
  const apiKey = fulltrackApiKey.value()?.trim(), secretKey = fulltrackSecretKey.value()?.trim();
  return apiKey && secretKey ? { apiKey, secretKey } : null;
}

/** Duas rodadas por dia: 05:00 (o fim do dia anterior e a noite) e 12:00 (a manhã), Brasília. */
export const rastreadorViagens = onSchedule({
  schedule: '0 5,12 * * *', timeZone: 'America/Sao_Paulo', region: REGIAO, secrets: [fulltrackApiKey, fulltrackSecretKey],
  timeoutSeconds: 540, memory: '512MiB',
}, async () => {
  const chaves = chavesDaFulltrack();
  if (!chaves) { logger.warn('rastreador: chaves da Fulltrack ausentes'); return; }
  logger.info('rastreador:execucao', await processarRastreador(chaves));
});

/** "Buscar no rastreador" (quem edita a Mecânica): lê agora o histórico de um veículo e avalia as viagens dele. */
export const rastreadorBuscarPlaca = onCall({ region: REGIAO, secrets: [fulltrackApiKey, fulltrackSecretKey], timeoutSeconds: 300, memory: '512MiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
  const eu = await db.collection('funcionarios').doc(request.auth.uid).get();
  if (!editaArea(eu.data(), 'mecanica')) throw new HttpsError('permission-denied', 'Só quem edita a Mecânica busca no rastreador.');
  const itemFrotaId = request.data?.itemFrotaId;
  if (typeof itemFrotaId !== 'string' || !ID_VALIDO.test(itemFrotaId)) throw new HttpsError('invalid-argument', 'Veículo inválido.');
  const chaves = chavesDaFulltrack();
  if (!chaves) throw new HttpsError('failed-precondition', 'As chaves da Fulltrack não estão configuradas.');
  const resumo = await processarRastreador(chaves, { itens: [itemFrotaId] });
  logger.info('rastreador:busca', { ...resumo, itemFrotaId, uid: request.auth.uid });
  if (!resumo.veiculos) throw new HttpsError('not-found', 'Veículo com placa não encontrado.');
  return resumo;
});
