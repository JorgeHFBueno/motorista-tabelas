// API do CronoLog (Cronograma Logístico, /logistica/cronograma; área Logística) para robôs: a fila de pedidos de nota.
// Quando uma programação passa para Ag. NF sem nota, a Function logisticaPedidoNota a põe em logistica-pedidos-nota; o
// robô (primeiro, o do Samuel) lista a fila, assume o pedido, gera a nota no ERP pela Expedição e manda o PDF, que entra
// na coluna Nota como se fosse enviado na tela (o primeiro PDF leva o Status a Em viagem e o ADMINISTRATIVO recebe
// "Nota anexada"). Se não conseguir, conta o erro: vira uma observação da linha que marca o ADMINISTRATIVO do Atribuir.
// Cada chave pertence a uma pessoa (cronolog-chaves-api/{sha256 da chave}: uid, nome, revogada_em), criada e revogada pelo
// adm2 em Cadastros → APIs; o banco guarda só o hash. Cabeçalho: `X-CronoLog-Chave: lgcr_...` (não usa Authorization: o
// Cloud Run tentaria validá-lo como token do Google). A pessoa da chave precisa ver a área Logística (ou ser adm2); para
// gravar, editá-la. O Admin SDK não passa pelas Rules: a permissão é conferida aqui.
// Rotas: GET /eu, /pedidos-nota (os que esperam o robô e os que estão com ele), /pedidos-nota/{id}; POST /pedidos-nota/{id}
// ({ status: "gerando" } ou { status: "erro", mensagem }) e POST /pedidos-nota/{id}/nota?nome= (o PDF no corpo).
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/cronolog-chaves-api.md, logistica.md e 02_APIS_FUNCTIONS/10_APIS_POR_AREA.md.
import { randomUUID } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { db } from './firebaseAdmin.js';
import { editaArea } from './credenciais.js';
import { dataLocal } from './fridayMondayConverter.js';
import {
  COM_O_ROBO, EntradaInvalida, RECEBEM_NOTA, StatusFora, aindaPedeNota, alteracaoComNota, conferirPdf, formatoChaveCronoLog, hashChaveCronoLog,
  marcadosDoErro, nomeDoPdf, passoDoPedidoNota, pedidoParaRobo, pessoaDaChaveCronoLog, programacaoIdValido, textoDoErro,
} from './cronoLogApiDominio.js';

type AnyRecord = Record<string, any>;
type Pessoa = { uid: string; nome: string; adm2: boolean };

const FILA = 'logistica-pedidos-nota';
const PROGRAMACOES = 'logistica-programacoes';
const config = (id: 'status' | 'pedidoNota') => db.collection('logistica-config').doc(id);

class Recusa extends Error {
  constructor(readonly status: number, mensagem: string) { super(mensagem); }
}

/**
 * Pessoa da chave do cabeçalho; sem chave válida, 401 sem detalhes. `edita`: edita a área Logística (ou é adm2), para
 * gravar. Marca o último uso no máximo uma vez por hora.
 */
async function pessoaDoPedido(chave: unknown): Promise<{ pessoa: Pessoa; chaveId: string; edita: boolean }> {
  if (!formatoChaveCronoLog(chave)) throw new Recusa(401, 'Não autorizado.');
  const hash = hashChaveCronoLog(chave);
  const ref = db.collection('cronolog-chaves-api').doc(hash);
  const registro = (await ref.get()).data();
  const funcionario = registro?.uid ? (await db.collection('funcionarios').doc(String(registro.uid)).get()).data() : undefined;
  const pessoa = pessoaDaChaveCronoLog(registro, funcionario);
  if (!pessoa) throw new Recusa(401, 'Não autorizado.');
  const agora = dataLocal();
  if (String(registro!.ultimo_uso ?? '').slice(0, 13) !== agora.slice(0, 13)) await ref.update({ ultimo_uso: agora }).catch(() => undefined);
  return { pessoa, chaveId: hash.slice(0, 12), edita: editaArea(funcionario, 'logistica') };
}

const robo = (p: Pessoa) => ({ uid: p.uid, nome: p.nome });
const cancelado = { status: 'cancelado', atualizadoEm: FieldValue.serverTimestamp() };
const NAO_PEDE = 'A programação não pede mais nota (saiu de Ag. NF, já tem nota ou foi excluída): o pedido foi cancelado.';

/**
 * GET /pedidos-nota: os pedidos em `pedido` e `gerando`, dos mais antigos. O `pedido` cuja linha não pede mais nota
 * (saiu de Ag. NF, recebeu nota à mão ou foi excluída) é cancelado aqui e não volta; o `gerando` só quando a linha foi
 * excluída (o robô já pode ter gerado a nota no ERP).
 */
async function pedidosEsperando() {
  const fila = (await db.collection(FILA).where('status', 'in', COM_O_ROBO).get()).docs;
  if (!fila.length) return [];
  const [etiquetas, ...programacoes] = await db.getAll(config('status'), ...fila.map((f) => db.collection(PROGRAMACOES).doc(f.id)));
  const lista: ReturnType<typeof pedidoParaRobo>[] = [];
  const cancelar: string[] = [];
  fila.forEach((f, i) => {
    const p = programacoes[i].data();
    const vale = f.get('status') === 'gerando' ? !!p : aindaPedeNota(p, etiquetas.get('etiquetas'));
    if (vale) lista.push(pedidoParaRobo(f.id, f.data(), p)); else cancelar.push(f.id);
  });
  if (cancelar.length) {
    const lote = db.batch();
    cancelar.forEach((id) => lote.update(db.collection(FILA).doc(id), cancelado));
    await lote.commit();
    logger.info('cronolog-api: pedidos cancelados', { ids: cancelar });
  }
  return lista.sort((a, b) => String(a.pedidoEm).localeCompare(String(b.pedidoEm)));
}

/** GET /pedidos-nota/{id}: um pedido, em qualquer status (o robô confere se não foi cancelado). */
async function pedido(id: string) {
  if (!programacaoIdValido(id)) throw new Recusa(404, 'Pedido de nota não encontrado.');
  const [fila, programacao] = await db.getAll(db.collection(FILA).doc(id), db.collection(PROGRAMACOES).doc(id));
  if (!fila.exists) throw new Recusa(404, 'Pedido de nota não encontrado.');
  return pedidoParaRobo(id, fila.data()!, programacao.data());
}

/**
 * POST /pedidos-nota/{id}: assumir ({ status: "gerando" }, só se a linha ainda pede nota) ou contar o erro ({ status:
 * "erro", mensagem }): o erro vira uma observação da linha, em nome da pessoa da chave, marcando o ADMINISTRATIVO (a
 * Function logisticaObservacaoMencao avisa cada um no sino).
 */
async function avancarPedido(id: string, corpo: unknown, pessoa: Pessoa) {
  if (!programacaoIdValido(id)) throw new Recusa(404, 'Pedido de nota não encontrado.');
  const filaRef = db.collection(FILA).doc(id);
  const progRef = db.collection(PROGRAMACOES).doc(id);
  const resultado = await db.runTransaction(async (t) => {
    const [fila, programacao, etiquetas, papeis] = await t.getAll(filaRef, progRef, config('status'), config('pedidoNota'));
    if (!fila.exists) throw new Recusa(404, 'Pedido de nota não encontrado.');
    const passo = passoDoPedidoNota(fila.get('status'), corpo);
    const p = programacao.data();
    if (!p || (passo.status === 'gerando' && !aindaPedeNota(p, etiquetas.get('etiquetas')))) {
      t.update(filaRef, cancelado);
      return { cancelado: true };
    }
    t.update(filaRef, {
      status: passo.status, mensagem: passo.mensagem ?? FieldValue.delete(), robo: robo(pessoa), atualizadoEm: FieldValue.serverTimestamp(),
    });
    if (passo.status === 'erro') {
      const marcados = marcadosDoErro(papeis.get('atribuidos'), pessoa.uid);
      t.create(db.collection('logistica-observacoes').doc(), {
        schemaVersion: 1, programacaoId: id, texto: textoDoErro(passo.mensagem!, marcados), anexos: [],
        autor: robo(pessoa), criadoEm: FieldValue.serverTimestamp(), ...(marcados.length ? { marcados } : {}),
      });
    }
    return { cancelado: false };
  });
  if (resultado.cancelado) throw new Recusa(409, NAO_PEDE);
  return pedido(id);
}

/**
 * POST /pedidos-nota/{id}/nota: o PDF gerado entra na Nota da programação como o envio da tela (logistica/notas/{id}/,
 * com token de download; até 10 PDFs; o primeiro leva o Status a Em viagem), assinado pela pessoa da chave, e o pedido
 * fica `concluido`. Aceito de `pedido` ou `gerando`, mesmo que a linha tenha recebido nota à mão nesse meio-tempo (a
 * nota gerada no ERP não se perde). Se a gravação falhar, o arquivo enviado é apagado.
 */
async function receberNota(id: string, nomeRota: unknown, corpo: unknown, pessoa: Pessoa) {
  if (!programacaoIdValido(id)) throw new Recusa(404, 'Pedido de nota não encontrado.');
  const dados = conferirPdf(corpo);
  const filaRef = db.collection(FILA).doc(id);
  const progRef = db.collection(PROGRAMACOES).doc(id);
  const [fila, programacao] = await db.getAll(filaRef, progRef);
  if (!fila.exists) throw new Recusa(404, 'Pedido de nota não encontrado.');
  if (!RECEBEM_NOTA.includes(fila.get('status'))) throw new Recusa(409, `O pedido de nota está em "${fila.get('status')}": não recebe mais PDF.`);
  if (!programacao.exists) throw new Recusa(404, 'A programação foi excluída.');
  const nome = nomeDoPdf(nomeRota, programacao.get('expedicao'));
  const bucket = getStorage().bucket();
  const caminho = `logistica/notas/${id}/${Date.now()}-${nome}`;
  const token = randomUUID();
  const arquivo = bucket.file(caminho);
  await arquivo.save(dados, {
    resumable: false, contentType: 'application/pdf',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  const nota = {
    caminho, url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(caminho)}?alt=media&token=${token}`,
    nome, tamanho: dados.length,
  };
  try {
    const status = await db.runTransaction(async (t) => {
      const [f, p, etiquetas] = await t.getAll(filaRef, progRef, config('status'));
      if (!f.exists || !RECEBEM_NOTA.includes(f.get('status'))) throw new Recusa(409, 'O pedido de nota mudou durante o envio: confira em GET /pedidos-nota/{id}.');
      if (!p.exists) throw new Recusa(404, 'A programação foi excluída.');
      const alteracao = alteracaoComNota(p.data()!, nota, etiquetas.get('etiquetas'));
      t.update(progRef, { ...alteracao, atualizadoPorUid: pessoa.uid, atualizadoPorNome: pessoa.nome.slice(0, 200), atualizadoEm: FieldValue.serverTimestamp() });
      t.update(filaRef, {
        status: 'concluido', nota: caminho, mensagem: FieldValue.delete(), robo: robo(pessoa), atualizadoEm: FieldValue.serverTimestamp(),
      });
      return alteracao.status ?? null;
    });
    return { ...(await pedido(id)), nota: { nome, tamanho: dados.length }, statusDaLinha: status ? 'Em viagem' : null };
  } catch (e) {
    await arquivo.delete().catch(() => undefined);
    throw e;
  }
}

const statusDoErro = (e: unknown) => e instanceof Recusa ? e.status : e instanceof EntradaInvalida ? 400 : e instanceof StatusFora ? 409 : 500;

export const cronoLogApi = onRequest({ region: 'southamerica-east1', timeoutSeconds: 60, memory: '256MiB', maxInstances: 2, invoker: 'public' }, async (req, res) => {
  try {
    const partes = req.path.split('/').filter(Boolean);
    const doPedido = partes[0] === 'pedidos-nota' && partes.length >= 2;
    const ehNota = doPedido && partes.length === 3 && partes[2] === 'nota';
    if (req.method !== 'GET' && !(req.method === 'POST' && doPedido && (partes.length === 2 || ehNota))) {
      throw new Recusa(405, 'Use GET (consulta); só POST /pedidos-nota/{id} e /pedidos-nota/{id}/nota gravam.');
    }
    const { pessoa, chaveId, edita } = await pessoaDoPedido(req.get('x-cronolog-chave'));
    logger.info('cronolog-api', { uid: pessoa.uid, chave: chaveId, metodo: req.method, rota: req.path });
    if (req.method === 'POST') {
      if (!edita) throw new Recusa(403, 'A chave precisa ser de quem edita a área Logística.');
      res.status(200).json(ehNota ? await receberNota(partes[1], req.query.nome, req.rawBody, pessoa) : await avancarPedido(partes[1], req.body, pessoa));
      return;
    }
    if (partes.length === 1 && partes[0] === 'eu') { res.status(200).json({ uid: pessoa.uid, nome: pessoa.nome, adm2: pessoa.adm2, edita }); return; }
    if (partes.length === 1 && partes[0] === 'pedidos-nota') { res.status(200).json(await pedidosEsperando()); return; }
    if (doPedido && partes.length === 2) { res.status(200).json(await pedido(partes[1])); return; }
    throw new Recusa(404, 'Rota desconhecida. GET: /eu, /pedidos-nota, /pedidos-nota/{id}. POST: /pedidos-nota/{id}, /pedidos-nota/{id}/nota.');
  } catch (e) {
    const status = statusDoErro(e);
    const mensagem = e instanceof Error ? e.message : String(e);
    logger[status >= 500 ? 'error' : 'warn']('cronolog-api', { rota: req.path, metodo: req.method, status, mensagem });
    res.status(status).json({ ok: false, erro: status >= 500 ? 'Erro interno.' : mensagem });
  }
});
