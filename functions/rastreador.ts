// Viagens pelo rastreador (Fulltrack/Soluzion): a cada 30 minutos, lê o histórico de posições de cada veículo com placa
// desde a última leitura, detecta as viagens (saída e volta ao raio da Fábrica) e grava atividades-rastreador; o estado
// de leitura de cada veículo fica em atividades-rastreador-veiculos. Fase A.1: calibra o KM de cada veículo uma vez
// por dia e grava em `atividades` só a Saída/Chegada pronta (motorista, obra confirmada e KM calibrado); o resto fica
// "a completar" na aba Geral de /mecanica/registros. Regras: rastreadorDominio.ts. Contrato: The Manuscript,
// 01_FIRESTORE/COLECOES/atividades-rastreador.md.
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import {
  CALIBRACAO_DIAS, calibrar, documentoViagem, estadoInicial, idViagem, ligarRastreadores, ordenarPontos, pontoFulltrack,
  processarPontos, registrosDaViagem,
  type AtividadeLida, type EstadoVeiculo, type LeituraPainel, type Ponto, type ViagemAberta, type ViagemKm,
} from './rastreadorDominio.js';
import { cidadeEstado } from './logisticaLocal.js';

const fulltrackApiKey = defineSecret('FULLTRACK_API_KEY');
const fulltrackSecretKey = defineSecret('FULLTRACK_SECRET_KEY');

const REGIAO = 'southamerica-east1';
const BASE = 'https://ws.fulltrack2.com';
export const VIAGENS = 'atividades-rastreador';
export const VEICULOS = 'atividades-rastreador-veiculos';
/** Primeira leitura: 09/11/2026 00:00 (Brasília), as duas semanas conferidas com o responsável em 2026-11-23. */
const INICIO = Date.UTC(2026, 10, 9, 3, 0, 0);
/** A Fulltrack devolveu 7 dias numa consulta só; janelas maiores não foram testadas. */
const JANELA = 7 * 864e5;
/** A calibração é refeita quando tem mais que isso (uma vez por dia, na prática). */
const CALIBRACAO_VALIDADE = 20 * 3600e3;
/** Cidades sugeridas (Nominatim, 1 pedido por segundo) por execução. */
const SUGESTOES_POR_EXECUCAO = 15;
const SIMULTANEAS = 3;

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

/** Grava a viagem preservando o motorista atribuído à mão (motoristaOrigem 'manual'); devolve o motorista que ficou. */
async function gravarViagem(id: string, campos: ReturnType<typeof documentoViagem>) {
  const ref = db.collection(VIAGENS).doc(id);
  return db.runTransaction(async (tx) => {
    const atual = await tx.get(ref);
    const antes = atual.exists ? atual.data() : undefined;
    const manual = antes?.motoristaOrigem === 'manual';
    const motorista = manual ? {} : { motorista: campos.motoristaProgramacao, motoristaOrigem: campos.motoristaProgramacao ? 'programacao' : null };
    const novo = { ...campos, ...motorista };
    const ficou = (manual ? antes?.motorista : campos.motoristaProgramacao) ?? null;
    if (!mudou(antes, novo)) return { gravou: false, motorista: ficou };
    tx.set(ref, { ...novo, ...(antes ? {} : { criadoEm: FieldValue.serverTimestamp() }), atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
    return { gravou: true, motorista: ficou };
  });
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

export async function processarRastreador(chaves: Chaves, agora = Date.now()) {
  const [ultimos, veiculosSnap, obrasSnap, progsSnap, funcSnap, estadosSnap] = await Promise.all([
    fulltrack('events/all', chaves),
    db.collection('veiculos-v2').where('identificacao.categoria', '==', 'PLACA').get(),
    db.collection('obras-v2').get(),
    db.collection('logistica-programacoes').get(),
    db.collection('funcionarios').get(),
    db.collection(VEICULOS).get(),
  ]);
  const veiculos = new Map(veiculosSnap.docs.map((d) => [d.id, d.data()]));
  const obras = new Map(obrasSnap.docs.map((d) => [d.id, d.data()]));
  const programacoes = progsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const funcionarios = funcSnap.docs.map((d) => ({ uid: d.id, nome: typeof d.get('nome') === 'string' ? (d.get('nome') as string).trim() : '', fridayItemId: d.get('fridayItemId') ? String(d.get('fridayItemId')) : null }));
  const estados = new Map(estadosSnap.docs.map((d) => [d.id, d.data()]));
  const ligados = ligarRastreadores(ultimos, [...veiculos].map(([id, v]) => ({ id, identificador: String(v.identificacao?.identificador ?? '') })), agora);
  const contexto = { programacoes, obras, funcionarios, agora };
  const resumo = { veiculos: veiculos.size, comRastreador: ligados.size, viagensGravadas: 0, atividadesGravadas: 0, aCompletar: 0, calibrados: null as number | null, erros: [] as string[] };

  const fila = [...veiculos.keys()];
  const trabalhar = async () => {
    for (let itemId = fila.shift(); itemId; itemId = fila.shift()) {
      const veiculo = veiculos.get(itemId)!;
      const ident = String(veiculo.identificacao?.identificador ?? '');
      const ref = db.collection(VEICULOS).doc(itemId);
      const r = ligados.get(itemId);
      if (!r) {
        const antes = estados.get(itemId);
        if (antes && antes.rastreador === null && antes.identificador === ident) continue;
        await ref.set({ schemaVersion: 1, item_frota_id: itemId, identificador: ident, rastreador: null, ultimaComunicacao: null, ultimoPonto: null, leitura: null, erro: null, atualizadoEm: FieldValue.serverTimestamp() });
        continue;
      }
      try {
        const antes = estados.get(itemId);
        const mesmo = antes?.rastreador?.veiculoId === r.veiculoId;
        const estado: EstadoVeiculo = mesmo && antes?.leitura ? antes.leitura as EstadoVeiculo : { ...estadoInicial(), ultimoT: antes?.leitura?.ultimoT ?? null };
        const desde = estado.ultimoT != null ? estado.ultimoT + 1000 : INICIO;
        const pontos = await historico(r.veiculoId, desde, agora, chaves);
        const { estado: novo, fechadas, aberta } = processarPontos(estado, pontos);
        for (const v of [...fechadas, ...(aberta ? [aberta] : [])]) {
          const campos = documentoViagem({ itemFrotaId: itemId, veiculo, rastreador: r, viagem: v, ...contexto });
          if (await gravarViagem(idViagem(itemId, v.saida.t), campos)) resumo.viagensGravadas += 1;
        }
        const ultimo = pontos[pontos.length - 1];
        await ref.set({
          schemaVersion: 1, item_frota_id: itemId, identificador: ident,
          rastreador: { fornecedor: 'fulltrack', veiculoId: r.veiculoId, placa: r.placa, nome: r.nome, outros: r.outros },
          ultimaComunicacao: r.ultimaComunicacao ? new Date(r.ultimaComunicacao) : null,
          ...(ultimo ? { ultimoPonto: { data: new Date(ultimo.t), lat: ultimo.lat, lng: ultimo.lng, km: ultimo.km == null ? null : Math.round(ultimo.km) } } : {}),
          leitura: novo, erro: null, atualizadoEm: FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (error) {
        const mensagem = String((error as Error)?.message ?? error).slice(0, 500);
        resumo.erros.push(`${ident}: ${mensagem}`);
        logger.error('rastreador: veículo falhou', { itemId, identificador: ident, erro: mensagem });
        await ref.set({ schemaVersion: 1, item_frota_id: itemId, identificador: ident, erro: { mensagem, em: new Date(agora) }, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  };
  await Promise.all(Array.from({ length: SIMULTANEAS }, trabalhar));

  // Viagens dos últimos 15 dias: programação, obra e motorista das fechadas acompanham o Cronograma; depois, a
  // Saída/Chegada de cada uma em `atividades` (já registrada, aguardando, gravada agora ou a completar).
  const desde = new Date(agora - CALIBRACAO_DIAS * 864e5);
  const [recentes, atividadesSnap] = await Promise.all([
    db.collection(VIAGENS).where('saida.data', '>=', desde).get(),
    db.collection('atividades').where('data', '>=', new Date(desde.getTime() - 3600e3)).get(),
  ]);
  const atividades: AtividadeLida[] = atividadesSnap.docs.flatMap((d) => {
    const a = d.data(), t = a.data instanceof Timestamp ? a.data.toMillis() : null;
    if (t == null || (a.tipo !== 'saida' && a.tipo !== 'chegada') || !a.item_frota_id) return [];
    const m = a.motorista && typeof a.motorista === 'object' ? { uid: typeof a.motorista.uid === 'string' ? a.motorista.uid : null, nome: String(a.motorista.nome ?? '') } : null;
    return [{ id: d.id, tipo: a.tipo, t, itemFrotaId: String(a.item_frota_id), motorista: m, rastreadorViagemId: typeof a.rastreadorViagemId === 'string' ? a.rastreadorViagemId : null }];
  });
  const viagensPorVeiculo = new Map<string, ViagemKm[]>();
  for (const d of recentes.docs) {
    const v = viagemDoDocumento(d.data());
    if (!v) continue;
    const lista = viagensPorVeiculo.get(d.get('item_frota_id')) ?? [];
    lista.push({ saida: v.saida, chegada: v.chegada });
    viagensPorVeiculo.set(d.get('item_frota_id'), lista);
  }

  // Calibração do KM (uma vez por dia): leituras do painel dos últimos 15 dias contra o hodômetro do rastreador.
  const ajustes = new Map<string, number | null>([...estados].map(([id, e]) => [id, typeof e.calibracao?.ajusteKm === 'number' ? e.calibracao.ajusteKm : null]));
  const calibrarAgora = [...ligados.keys()].some((id) => {
    const em = estados.get(id)?.calibracao?.calculadaEm;
    return !(em instanceof Timestamp) || agora - em.toMillis() > CALIBRACAO_VALIDADE;
  });
  if (calibrarAgora) {
    const combustivel = await db.collection('03-combustivel').where('data', '>=', desde).get();
    const leituras = new Map<string, LeituraPainel[]>();
    const somar = (itemId: unknown, l: LeituraPainel) => { if (typeof itemId === 'string') leituras.set(itemId, [...(leituras.get(itemId) ?? []), l]); };
    for (const a of atividadesSnap.docs) {
      const x = a.data();
      if (!x.rastreadorViagemId && x.data instanceof Timestamp && typeof x.km === 'number') somar(x.item_frota_id, { id: a.id, fonte: 'atividade', t: x.data.toMillis(), km: x.km });
    }
    for (const c of combustivel.docs) {
      const x = c.data();
      if (x.data instanceof Timestamp && typeof x.quilometragem === 'number') somar(x.item_frota_id, { id: c.id, fonte: 'combustivel', t: x.data.toMillis(), km: x.quilometragem });
    }
    for (const itemId of ligados.keys()) {
      const c = calibrar(leituras.get(itemId) ?? [], viagensPorVeiculo.get(itemId) ?? []);
      ajustes.set(itemId, c.ajusteKm);
      await db.collection(VEICULOS).doc(itemId).set({
        calibracao: {
          ajusteKm: c.ajusteKm, motivo: c.motivo, calculadaEm: FieldValue.serverTimestamp(),
          amostras: c.amostras.map((a) => ({ fonte: a.fonte, id: a.id, data: new Date(a.t), km: a.km, kmRastreador: a.kmRastreador, diferenca: a.diferenca, concorda: a.concorda })),
        },
      }, { merge: true });
    }
    resumo.calibrados = [...ligados.keys()].filter((id) => ajustes.get(id) != null).length;
  }

  let sugestoes = 0;
  for (const d of recentes.docs) {
    const dados = d.data();
    const veiculo = veiculos.get(dados.item_frota_id);
    const viagem = viagemDoDocumento(dados);
    if (!veiculo || !viagem) continue;
    let motorista = dados.motorista ?? null, visita = dados.visitaObra ?? null;
    if (dados.situacao === 'concluida') {
      const campos = documentoViagem({ itemFrotaId: dados.item_frota_id, veiculo, rastreador: dados.rastreador, viagem, ...contexto });
      const r = await gravarViagem(d.id, campos);
      if (r.gravou) resumo.viagensGravadas += 1;
      motorista = r.motorista;
      visita = campos.visitaObra;
    }
    const registros = registrosDaViagem({
      viagemId: d.id, itemFrotaId: dados.item_frota_id, veiculoSnapshot: dados.item_frota_snapshot,
      saida: viagem.saida, chegada: viagem.chegada, motorista,
      programacaoDaVisita: visita?.programacaoId ? programacoes.find((p) => p.id === visita.programacaoId) ?? null : null,
      ajusteKm: ajustes.get(dados.item_frota_id) ?? null, obras, atividades, agora,
    });
    for (const g of registros.gravar) {
      if (await gravarAtividade(g.id, g.campos)) resumo.atividadesGravadas += 1;
    }
    for (const r of [registros.saida, registros.chegada]) if (r?.estado === 'pendente') resumo.aCompletar += 1;

    // Destino sugerido: a cidade da parada mais longa, só para a Saída a completar sem obra ou destino.
    const longa = dados.paradaMaisLonga;
    const precisa = registros.saida.estado === 'pendente' && (registros.saida.faltam.includes('obra') || registros.saida.faltam.includes('destino')) && longa;
    let destinoSugerido = dados.destinoSugerido ?? null;
    if (precisa && (destinoSugerido?.lat !== longa.lat || destinoSugerido?.lng !== longa.lng) && sugestoes < SUGESTOES_POR_EXECUCAO) {
      try {
        if (sugestoes) await esperar(1100);
        sugestoes += 1;
        const { cidade, uf } = await cidadeDoPonto(longa.lat, longa.lng);
        destinoSugerido = { cidade, uf, lat: longa.lat, lng: longa.lng };
      } catch (error) {
        logger.warn('rastreador: cidade da parada falhou', { viagemId: d.id, erro: String((error as Error)?.message ?? error) });
      }
    }
    const extra = { registros: { saida: registros.saida, chegada: registros.chegada }, destinoSugerido };
    if (mudou(dados, extra)) await d.ref.set({ ...extra, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
  }
  return resumo;
}

/** A cada 30 minutos. Sem as chaves, não faz nada (registra o aviso). */
export const rastreadorViagens = onSchedule({
  schedule: 'every 30 minutes', timeZone: 'America/Sao_Paulo', region: REGIAO, secrets: [fulltrackApiKey, fulltrackSecretKey],
  timeoutSeconds: 540, memory: '512MiB',
}, async () => {
  const apiKey = fulltrackApiKey.value()?.trim(), secretKey = fulltrackSecretKey.value()?.trim();
  if (!apiKey || !secretKey) { logger.warn('rastreador: chaves da Fulltrack ausentes'); return; }
  const resumo = await processarRastreador({ apiKey, secretKey });
  logger.info('rastreador:execucao', resumo);
});
