import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getStorage } from 'firebase-admin/storage';
import { db } from './firebaseAdmin.js';
import { mondayApiToken } from './mondayClient.js';
import { dataLocal, idDaAtualizacaoMonday, textoDoMonday, type MAtualizacao, type MResposta } from './fridayMondayConverter.js';
import { mencoesDoTexto } from './fridayApiDominio.js';
import { copiarAssetDoMonday, familia, type Bucket } from './fridayAnexosMonday.js';
import { exigirAdm2, gql, pessoasDoMonday } from './fridayMondayImport.js';

// Cópia, para as Atualizações do Friday, das atualizações (Write an update) dos itens importados do monday, com as
// respostas e os arquivos anexados. O monday foi aposentado: só é lido. Cada atualização guarda origem_id
// "monday:<id do monday>", então repetir só traz as que faltam; cada chamada faz o que couber no tempo e diz
// quantas faltam. Autor: o funcionário ligado ao monday (funcionarios.mondayId) ou, sem vínculo, só o nome
// (autor_monday). Grava pelo Admin SDK (sem Rules), então a autorização (adm2) é verificada aqui.
// Contrato: The Manuscript, 03_APLICACAO_WEB/13_FRIDAY_GESTAO_INTERNA.md (Atualizações do monday).

type Row = Record<string, any> & { id: number };

const REGIAO = 'southamerica-east1';
const TEMPO_MAXIMO_MS = 420_000;
const POR_PAGINA = 100;
const TAMANHO_TEXTO = 20_000;
const CAMPOS = 'id body created_at creator_id creator { name }';
const CONSULTA = `query ($b: [ID!], $p: Int!) { boards(ids: $b) { updates(limit: ${POR_PAGINA}, page: $p) {
  ${CAMPOS} item_id assets { id name public_url } replies { ${CAMPOS} } } } }`;

export const fridayAtualizacoesMonday = onCall({ region: REGIAO, secrets: [mondayApiToken], timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const uid = await exigirAdm2(request.auth?.uid, 'trazer as atualizações do monday');
  const quadroId = Number((request.data as { quadroId?: unknown } | null)?.quadroId);
  if (!Number.isSafeInteger(quadroId)) throw new HttpsError('invalid-argument', 'quadroId inválido.');
  const token = mondayApiToken.value();
  if (!token?.trim()) throw new HttpsError('failed-precondition', 'MONDAY_API_TOKEN ausente.');
  return trazerDoQuadro(token, quadroId, uid);
});

async function atualizacoesDoBoard(token: string, boardId: string): Promise<MAtualizacao[]> {
  const out: MAtualizacao[] = [];
  for (let p = 1; ; p++) {
    const d = await gql(token, CONSULTA, { b: [boardId], p });
    const pagina = (d.boards?.[0]?.updates ?? []) as MAtualizacao[];
    out.push(...pagina);
    if (pagina.length < POR_PAGINA) return out;
  }
}

async function trazerDoQuadro(token: string, quadroId: number, uid: string) {
  const inicio = Date.now();
  const autorDe = await pessoasDoMonday();
  const bucket = getStorage().bucket();
  let trazidas = 0, faltam = 0;
  const falhas: string[] = [];
  for (const q of await familia(quadroId)) {
    const quadro = (await db.collection('friday-quadros').doc(String(q)).get()).data();
    if (!quadro?.origem_id) continue;
    const itens = new Map((await db.collection('friday-itens').where('quadro_id', '==', q).get()).docs
      .filter(d => d.get('origem_id') != null).map(d => [String(d.get('origem_id')), d.data() as Row]));
    if (!itens.size) continue;
    // Já trazidas (origem "monday:<id>" → id no Friday): não se repetem e servem de pai para as respostas.
    const ja = new Map<string, number>();
    for (const d of (await db.collection('friday-atualizacoes').where('quadro_id', '==', q).get()).docs) {
      if (d.get('origem_id')) ja.set(String(d.get('origem_id')), Number(d.id));
    }
    for (const u of await atualizacoesDoBoard(token, String(quadro.origem_id))) {
      const item = itens.get(String(u.item_id));
      if (!item) continue;
      const fila: [MResposta, MAtualizacao | null][] = [[u, null], ...(u.replies ?? []).map(r => [r, u] as [MResposta, MAtualizacao])];
      for (const [m, pai] of fila) {
        if (ja.has(`monday:${m.id}`)) continue;
        const paiId = pai ? ja.get(`monday:${pai.id}`) : null;
        if (Date.now() - inicio > TEMPO_MAXIMO_MS || paiId === undefined) { faltam++; continue; }
        try {
          ja.set(`monday:${m.id}`, await gravar(bucket, item, m, paiId, pai ? [] : u.assets ?? [], autorDe, uid, falhas));
          trazidas++;
        } catch (e) {
          faltam++;
          falhas.push(`${item.nome}: ${(e as Error).message}`);
          logger.warn('fridayAtualizacoesMonday: atualização não trazida', { item: item.id, update: m.id, erro: (e as Error).message });
        }
      }
    }
  }
  logger.info('fridayAtualizacoesMonday', { quadroId, trazidas, faltam, falhas: falhas.length });
  return { trazidas, restantes: faltam, falhas };
}

// Grava uma atualização (ou resposta) e copia os arquivos dela. O id segue a hora do monday; se já estiver ocupado
// por outra atualização, usa o seguinte.
async function gravar(bucket: Bucket, item: Row, m: MResposta, paiId: number | null, assets: NonNullable<MAtualizacao['assets']>,
  autorDe: (mondayId: string) => string | undefined, uid: string, falhas: string[]): Promise<number> {
  let id = idDaAtualizacaoMonday(m.created_at, m.id) ?? Date.now() * 1000;
  while ((await db.collection('friday-atualizacoes').doc(String(id)).get()).exists) id++;
  const autor = m.creator_id != null ? autorDe(String(m.creator_id)) : undefined;
  for (const a of assets) {
    try {
      await copiarAssetDoMonday(bucket, item, Number(a.id), a.name, { id: a.id, name: a.name, public_url: a.public_url ?? undefined },
        { atualizacao_id: id, coluna_id: null, usuario_id: autor ?? uid });
    } catch (e) {
      falhas.push(`${item.nome}: ${a.name} (${(e as Error).message})`);
    }
  }
  const texto = textoDoMonday(m.body, autorDe).slice(0, TAMANHO_TEXTO);
  await db.collection('friday-atualizacoes').doc(String(id)).set({
    id, item_id: item.id, quadro_id: item.quadro_id, usuario_id: autor ?? null, autor_monday: m.creator?.name ?? null,
    texto: texto || ' ', mencoes: mencoesDoTexto(texto), resposta_de: paiId, criado_em: dataLocal(m.created_at), editado_em: null,
    origem_id: `monday:${m.id}`,
  });
  return id;
}
