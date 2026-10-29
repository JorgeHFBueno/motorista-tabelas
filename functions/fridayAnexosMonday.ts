import { randomUUID } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getStorage } from 'firebase-admin/storage';
import { db } from './firebaseAdmin.js';
import { mondayApiToken } from './mondayClient.js';
import {
  caminhoAnexo, comCopias, dataLocal, mimeDoNome, novoId, pendentesDoMonday, type ArquivoColuna, type ArquivoPendente,
} from './fridayMondayConverter.js';
import { exigirAdm2, gql } from './fridayMondayImport.js';

// Cópia única, para o Storage do Friday, dos arquivos que a importação trouxe do monday só com o nome (colunas Arquivos,
// entrada com `monday_asset`). O monday foi aposentado: depois da cópia o arquivo fica no Friday. Só lê o monday.
// Cada chamada copia o que couber no tempo e diz quantos faltam; repetir não duplica (o anexo guarda origem_id
// "monday:<asset>"). Grava pelo Admin SDK (sem Rules), então a autorização (adm2) é verificada aqui.
// Contrato: The Manuscript, 03_APLICACAO_WEB/13_FRIDAY_GESTAO_INTERNA.md (Anexos).

type Row = Record<string, any> & { id: number };
type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;
type Asset = { id: string; name?: string; public_url?: string };

const REGIAO = 'southamerica-east1';
const TEMPO_MAXIMO_MS = 420_000;
const LIMITE_ARQUIVO = 100 * 1024 * 1024;

export const fridayAnexosMonday = onCall({ region: REGIAO, secrets: [mondayApiToken], timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const uid = await exigirAdm2(request.auth?.uid, 'copiar os arquivos do monday');
  const quadroId = Number((request.data as { quadroId?: unknown } | null)?.quadroId);
  if (!Number.isSafeInteger(quadroId)) throw new HttpsError('invalid-argument', 'quadroId inválido.');
  const token = mondayApiToken.value();
  if (!token?.trim()) throw new HttpsError('failed-precondition', 'MONDAY_API_TOKEN ausente.');
  return copiarDoQuadro(token, quadroId, uid);
});

// O quadro e o seu quadro de subitens (chamado de um subitem, sobe para o quadro principal).
async function familia(quadroId: number): Promise<number[]> {
  const q = (await db.collection('friday-quadros').doc(String(quadroId)).get()).data();
  if (!q) throw new HttpsError('not-found', 'Quadro não encontrado.');
  const principal = q.tipo === 'subitens' && q.quadro_pai_id != null ? Number(q.quadro_pai_id) : quadroId;
  const subs = await db.collection('friday-quadros').where('quadro_pai_id', '==', principal).get();
  return [principal, ...subs.docs.map(d => Number(d.id))];
}

async function copiarDoQuadro(token: string, quadroId: number, uid: string) {
  const inicio = Date.now();
  const fila: { item: Row; pendentes: ArquivoPendente[] }[] = [];
  for (const q of await familia(quadroId)) {
    const colunas = (await db.collection('friday-colunas').where('quadro_id', '==', q).get()).docs
      .map(d => d.data()).filter(c => c.tipo === 'arquivos').map(c => String(c.id));
    if (!colunas.length) continue;
    for (const d of (await db.collection('friday-itens').where('quadro_id', '==', q).get()).docs) {
      const item = d.data() as Row;
      if (item.excluido_em != null) continue;
      const pendentes = pendentesDoMonday(item.valores, colunas);
      if (pendentes.length) fila.push({ item, pendentes });
    }
  }
  const total = fila.reduce((n, f) => n + f.pendentes.length, 0);
  const bucket = getStorage().bucket();
  let copiados = 0;
  const falhas: string[] = [];
  for (const { item, pendentes } of fila) {
    if (Date.now() - inicio > TEMPO_MAXIMO_MS) break;
    const assets = await dadosDosAssets(token, pendentes.map(p => p.asset));
    const feitos = new Map<number, ArquivoColuna>();
    for (const p of pendentes) {
      if (Date.now() - inicio > TEMPO_MAXIMO_MS) break;
      try {
        feitos.set(p.asset, await copiarUm(bucket, item, p, assets.get(p.asset), uid));
        copiados++;
      } catch (e) {
        falhas.push(`${item.nome}: ${p.nome} (${(e as Error).message})`);
        logger.warn('fridayAnexosMonday: arquivo não copiado', { item: item.id, asset: p.asset, erro: (e as Error).message });
      }
    }
    if (feitos.size) await gravarNoItem(item.id, feitos);
  }
  logger.info('fridayAnexosMonday', { quadroId, total, copiados, falhas: falhas.length });
  return { copiados, restantes: total - copiados, falhas };
}

// public_url do monday é um link temporário (cerca de 1 h): pede na hora de baixar, item por item.
async function dadosDosAssets(token: string, ids: number[]): Promise<Map<number, Asset>> {
  const out = new Map<number, Asset>();
  for (let i = 0; i < ids.length; i += 25) {
    const d = await gql(token, 'query ($ids: [ID!]!) { assets(ids: $ids) { id name public_url } }', { ids: ids.slice(i, i + 25).map(String) });
    for (const a of (d.assets ?? []) as Asset[]) out.set(Number(a.id), a);
  }
  return out;
}

const entrada = (a: Row, asset: number): ArquivoColuna => ({ id: a.id, nome: a.nome, mime: a.mime, tamanho: a.tamanho, url: a.url, monday_asset: asset });

async function copiarUm(bucket: Bucket, item: Row, p: ArquivoPendente, asset: Asset | undefined, uid: string): Promise<ArquivoColuna> {
  const origem = `monday:${p.asset}`;
  const ja = await db.collection('friday-anexos').where('origem_id', '==', origem).limit(1).get();
  if (!ja.empty) return entrada(ja.docs[0].data() as Row, p.asset);
  if (!asset?.public_url) throw new Error('o monday não devolveu o arquivo');
  const res = await fetch(asset.public_url);
  if (!res.ok) throw new Error(`download recusado (${res.status})`);
  const dados = Buffer.from(await res.arrayBuffer());
  if (dados.length > LIMITE_ARQUIVO) throw new Error('maior que 100 MB');
  const id = novoId();
  const caminho = caminhoAnexo(item.quadro_id, item.id, id, p.nome);
  const mime = mimeDoNome(p.nome) ?? res.headers.get('content-type') ?? 'application/octet-stream';
  const tokenDownload = randomUUID();
  const arquivo = bucket.file(caminho);
  await arquivo.save(dados, {
    resumable: false, contentType: mime,
    metadata: { contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(p.nome)}`, metadata: { firebaseStorageDownloadTokens: tokenDownload } },
  });
  const anexo: Row = {
    id, item_id: item.id, quadro_id: item.quadro_id, atualizacao_id: null, coluna_id: p.coluna_id, nome: p.nome, mime, tamanho: dados.length,
    arquivo: caminho, url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(caminho)}?alt=media&token=${tokenDownload}`,
    usuario_id: uid, criado_em: dataLocal(), origem_id: origem,
  };
  try {
    await db.collection('friday-anexos').doc(String(id)).set(anexo);
  } catch (e) {
    await arquivo.delete().catch(() => undefined);
    throw e;
  }
  return entrada(anexo, p.asset);
}

// Troca as entradas na célula sem mexer em atualizado_em: a cópia não é uma edição (a reimportação segue valendo).
async function gravarNoItem(itemId: number, feitos: Map<number, ArquivoColuna>) {
  const ref = db.collection('friday-itens').doc(String(itemId));
  await db.runTransaction(async t => {
    const mudancas = comCopias((await t.get(ref)).data()?.valores, feitos);
    if (Object.keys(mudancas).length) t.update(ref, Object.fromEntries(Object.entries(mudancas).map(([col, lista]) => [`valores.${col}`, lista])));
  });
}
