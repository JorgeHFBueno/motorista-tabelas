// Viagens pelo rastreador (Fulltrack/Soluzion): a cada 30 minutos, lê o histórico de posições de cada veículo com placa
// desde a última leitura, detecta as viagens (saída e volta ao raio da Fábrica) e grava atividades-rastreador; o estado
// de leitura de cada veículo fica em atividades-rastreador-veiculos. Fase A: só mostra (aba Rastreador de
// /mecanica/registros); não grava atividades. Regras: rastreadorDominio.ts. Contrato: The Manuscript,
// 01_FIRESTORE/COLECOES/atividades-rastreador.md.
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import {
  documentoViagem, estadoInicial, idViagem, ligarRastreadores, ordenarPontos, pontoFulltrack, processarPontos,
  type EstadoVeiculo, type Ponto, type ViagemAberta,
} from './rastreadorDominio.js';

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
/** Viagens com saída nos últimos dias são recalculadas a cada execução (programação editada depois, por exemplo). */
const RECALCULAR_DIAS = 7;
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

/** Grava a viagem preservando o motorista atribuído à mão (motoristaOrigem 'manual'). */
async function gravarViagem(id: string, campos: ReturnType<typeof documentoViagem>) {
  const ref = db.collection(VIAGENS).doc(id);
  return db.runTransaction(async (tx) => {
    const atual = await tx.get(ref);
    const antes = atual.exists ? atual.data() : undefined;
    const manual = antes?.motoristaOrigem === 'manual';
    const motorista = manual ? {} : { motorista: campos.motoristaProgramacao, motoristaOrigem: campos.motoristaProgramacao ? 'programacao' : null };
    const novo = { ...campos, ...motorista };
    if (!mudou(antes, novo)) return false;
    tx.set(ref, { ...novo, ...(antes ? {} : { criadoEm: FieldValue.serverTimestamp() }), atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}

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
  const resumo = { veiculos: veiculos.size, comRastreador: ligados.size, viagensGravadas: 0, erros: [] as string[] };

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

  // Programação, obra e motorista das viagens recentes já fechadas acompanham o Cronograma.
  const recentes = await db.collection(VIAGENS).where('saida.data', '>=', new Date(agora - RECALCULAR_DIAS * 864e5)).get();
  for (const d of recentes.docs) {
    const dados = d.data();
    if (dados.situacao !== 'concluida') continue;
    const veiculo = veiculos.get(dados.item_frota_id);
    const viagem = viagemDoDocumento(dados);
    if (!veiculo || !viagem) continue;
    const campos = documentoViagem({ itemFrotaId: dados.item_frota_id, veiculo, rastreador: dados.rastreador, viagem, ...contexto });
    if (await gravarViagem(d.id, campos)) resumo.viagensGravadas += 1;
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
