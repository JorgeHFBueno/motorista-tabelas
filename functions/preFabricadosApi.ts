// API dos Pré-Fabricados (área Engenharia) para robôs: consulta dos PDFs dos pré-fabricados anexados no detalhe da obra
// (/engenharia/obras/:id), achados pelo Nº Pedido do LOTE (o mesmo número do Cód. Auxiliar da obra no Plannix), e a fila
// do botão Sincronizar (plannix-sincronizacoes, 2026-11-25). Primeiro uso: a automação do Samuel que baixa o PDF e o
// lança no Plannix. Cada chave pertence a uma pessoa
// (prefabricados-chaves-api/{sha256 da chave}: uid, nome, revogada_em), criada e revogada pelo adm2 em Cadastros → APIs;
// o banco guarda só o hash. Cabeçalho: `X-PreFabricados-Chave: enpf_...` (não usa Authorization: o Cloud Run tentaria
// validá-lo como token do Google). A pessoa da chave precisa ver a área Engenharia (ou ser adm2). O Admin SDK não passa
// pelas Rules: a permissão é conferida aqui.
// Rotas (GET): /eu, /pedidos/{pedido}/pdfs, /pdfs/{id} (o próprio PDF), /sincronizacoes (as que esperam o robô) e
// /sincronizacoes/{id}. A única que grava: POST /sincronizacoes/{id} ({ status, previa?, mensagem? }), o passo do robô
// (ou, sem status, um recado em simulando e gravando), só com chave de quem edita a área Engenharia (ou adm2).
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/prefabricados-chaves-api.md e 02_APIS_FUNCTIONS/10_APIS_POR_AREA.md.
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { db } from './firebaseAdmin.js';
import { editaArea } from './credenciais.js';
import { dataLocal } from './fridayMondayConverter.js';
import { COLUNA_PEDIDO, pedidoDaCelula } from './plannixPreFabricados.js';
import {
  COM_O_ROBO, EntradaInvalida, StatusFora, formatoChavePreFabricados, hashChavePreFabricados, passoDoRobo, pdfIdValido, pdfsAtuaisDoLote,
  pedidoDaRota, pessoaDaChavePreFabricados, sincronizacaoIdValido, sincronizacaoParaRobo,
} from './preFabricadosApiDominio.js';

type AnyRecord = Record<string, any>;
type Pessoa = { uid: string; nome: string; adm2: boolean };

class Recusa extends Error {
  constructor(readonly status: number, mensagem: string) { super(mensagem); }
}

/**
 * Pessoa da chave do cabeçalho; sem chave válida, 401 sem detalhes. `edita`: edita a área Engenharia (ou é adm2), para
 * gravar o passo do robô. Marca o último uso no máximo uma vez por hora.
 */
async function pessoaDoPedido(chave: unknown): Promise<{ pessoa: Pessoa; chaveId: string; edita: boolean }> {
  if (!formatoChavePreFabricados(chave)) throw new Recusa(401, 'Não autorizado.');
  const hash = hashChavePreFabricados(chave);
  const ref = db.collection('prefabricados-chaves-api').doc(hash);
  const registro = (await ref.get()).data();
  const funcionario = registro?.uid ? (await db.collection('funcionarios').doc(String(registro.uid)).get()).data() : undefined;
  const pessoa = pessoaDaChavePreFabricados(registro, funcionario);
  if (!pessoa) throw new Recusa(401, 'Não autorizado.');
  const agora = dataLocal();
  if (String(registro!.ultimo_uso ?? '').slice(0, 13) !== agora.slice(0, 13)) await ref.update({ ultimo_uso: agora }).catch(() => undefined);
  return { pessoa, chaveId: hash.slice(0, 12), edita: editaArea(funcionario, 'engenharia') };
}

/** GET /eu: de quem é a chave. */
const eu = (p: Pessoa) => ({ uid: p.uid, nome: p.nome, adm2: p.adm2 });

/**
 * LOTE com o Nº Pedido: subitem oficial de obras-v2 no Friday (GESTÃO DE OBRAS) cuja coluna "Nº Pedido/Cód. Auxiliar"
 * tem o número. Procura pelo texto da célula (link) e pelo valor simples; sem achado, confere os LOTEs do quadro.
 */
async function lotesDoPedido(pedido: string): Promise<{ obraId: string; loteId: string }[]> {
  const registro = (await db.collection('friday-cadastros').where('colecao', '==', 'obras-v2').limit(1).get()).docs[0];
  const quadro = Number(registro?.get('subitens.quadro_id'));
  if (!registro || !quadro) return [];
  const colunas = await db.collection('friday-colunas').where('quadro_id', '==', quadro).get();
  const coluna = colunas.docs.find((c) => COLUNA_PEDIDO.test(String(c.get('titulo') ?? '').trim()));
  if (!coluna) return [];
  const [porTexto, porValor] = await Promise.all([
    db.collection('friday-itens').where(new FieldPath('valores', coluna.id, 'texto'), '==', pedido).get(),
    db.collection('friday-itens').where(new FieldPath('valores', coluna.id), '==', pedido).get(),
  ]);
  let candidatos = [...porTexto.docs, ...porValor.docs];
  // Célula com o pedido só no link do Elevor (?Cod=953), sem texto: só então lê os LOTEs do quadro.
  if (!candidatos.length) candidatos = (await db.collection('friday-itens').where('quadro_id', '==', quadro).get()).docs;
  const achados = new Map<string, { obraId: string; loteId: string }>();
  for (const item of candidatos) {
    const i = item.data();
    if (i.vinculo?.cadastro !== registro.id || i.vinculo?.id == null || i.vinculo?.sub == null || Number(i.quadro_id) !== quadro || i.excluido_em) continue;
    if (pedidoDaCelula(i.valores?.[coluna.id]) !== pedido) continue;
    achados.set(item.id, { obraId: String(i.vinculo.id), loteId: String(i.vinculo.sub) });
  }
  return [...achados.values()];
}

/** GET /pedidos/{pedido}/pdfs: a obra, o LOTE e o PDF atual de cada item que tem PDF. */
async function pdfsDoPedido(pedido: string) {
  const lotes = await lotesDoPedido(pedido);
  if (!lotes.length) throw new Recusa(404, `Nenhum LOTE com o Nº Pedido ${pedido} no Friday.`);
  if (lotes.length > 1) throw new Recusa(409, `O Nº Pedido ${pedido} está em mais de um LOTE no Friday: deixe só em um.`);
  const { obraId, loteId } = lotes[0];
  const [obra, pdfs] = await Promise.all([
    db.collection('obras-v2').doc(obraId).get(),
    db.collection('obras-pre-fabricados-pdfs').where('obraId', '==', obraId).get(),
  ]);
  const docs = pdfs.docs.map((d) => ({ id: d.id, data: d.data() }));
  const doLote = docs.filter((d) => d.data.lote === loteId);
  return {
    pedido, obraId, obra: String(obra.get('nomeObra') ?? obraId), loteId, lote: String(obra.get(new FieldPath('lotes', loteId, 'nome')) ?? ''),
    plannix: Number(doLote.find((d) => Number(d.data.plannix) > 0)?.data.plannix) || null,
    itens: pdfsAtuaisDoLote(docs, loteId),
  };
}

/** GET /pdfs/{id}: o arquivo PDF. */
async function baixarPdf(id: string) {
  if (!pdfIdValido(id)) throw new Recusa(404, 'PDF não encontrado.');
  const d = (await db.collection('obras-pre-fabricados-pdfs').doc(id).get()).data();
  const caminho = String(d?.caminho ?? '');
  if (!d || !caminho.startsWith('obras/pre-fabricados/')) throw new Recusa(404, 'PDF não encontrado.');
  const [dados] = await getStorage().bucket().file(caminho).download().catch(() => { throw new Recusa(404, 'PDF não encontrado no armazenamento.'); });
  return { dados, nome: String(d.nome ?? `${id}.pdf`) };
}

const SINCRONIZACOES = 'plannix-sincronizacoes';

/** Nomes da obra e dos LOTEs para as sincronizações listadas (uma leitura por obra). */
async function nomesDasObras(obraIds: string[]) {
  const docs = await Promise.all([...new Set(obraIds)].map((id) => db.collection('obras-v2').doc(id).get()));
  return new Map(docs.map((d) => [d.id, d.data() ?? {}]));
}
const nomes = (obras: Map<string, AnyRecord>, d: AnyRecord) => {
  const obra = obras.get(String(d.obraId));
  return { obra: String(obra?.nomeObra ?? ''), lote: String(obra?.lotes?.[String(d.lote)]?.nome ?? '') };
};

/**
 * GET /sincronizacoes: as que esperam o robô (pedidas, para simular; aprovadas, para gravar) e as que estão com ele
 * (simulando, gravando: o robô que reinicia acha o que ficou pela metade), das atualizadas há mais tempo.
 */
async function sincronizacoesEsperando() {
  const docs = (await db.collection(SINCRONIZACOES).where('status', 'in', COM_O_ROBO).get()).docs;
  const obras = await nomesDasObras(docs.map((d) => String(d.get('obraId'))));
  return docs
    .map((d) => sincronizacaoParaRobo(d.id, d.data(), nomes(obras, d.data())))
    .sort((a, b) => String(a.atualizadoEm).localeCompare(String(b.atualizadoEm)));
}

/** GET /sincronizacoes/{id}: uma sincronização, em qualquer status (o robô confere se não foi cancelada). */
async function sincronizacao(id: string) {
  if (!sincronizacaoIdValido(id)) throw new Recusa(404, 'Sincronização não encontrada.');
  const d = (await db.collection(SINCRONIZACOES).doc(id).get()).data();
  if (!d) throw new Recusa(404, 'Sincronização não encontrada.');
  return sincronizacaoParaRobo(id, d, nomes(await nomesDasObras([String(d.obraId)]), d));
}

/** POST /sincronizacoes/{id}: o passo do robô, numa transação (o status confere com o que está gravado). */
async function avancarSincronizacao(id: string, corpo: unknown, pessoa: Pessoa) {
  if (!sincronizacaoIdValido(id)) throw new Recusa(404, 'Sincronização não encontrada.');
  const ref = db.collection(SINCRONIZACOES).doc(id);
  await db.runTransaction(async (t) => {
    const atual = (await t.get(ref)).data();
    if (!atual) throw new Recusa(404, 'Sincronização não encontrada.');
    const passo = passoDoRobo(atual.status, corpo);
    t.update(ref, {
      status: passo.status,
      ...(passo.previa ? { previa: passo.previa } : {}),
      mensagem: passo.mensagem ?? FieldValue.delete(),
      robo: { uid: pessoa.uid, nome: pessoa.nome },
      atualizadoEm: FieldValue.serverTimestamp(),
    });
  });
  return sincronizacao(id);
}

const statusDoErro = (e: unknown) => e instanceof Recusa ? e.status : e instanceof EntradaInvalida ? 400 : e instanceof StatusFora ? 409 : 500;

export const preFabricadosApi = onRequest({ region: 'southamerica-east1', timeoutSeconds: 60, memory: '256MiB', maxInstances: 2, invoker: 'public' }, async (req, res) => {
  try {
    const partes = req.path.split('/').filter(Boolean);
    const passoDoRoboNaRota = partes.length === 2 && partes[0] === 'sincronizacoes';
    if (req.method !== 'GET' && !(req.method === 'POST' && passoDoRoboNaRota)) {
      throw new Recusa(405, 'Use GET (consulta); só POST /sincronizacoes/{id} grava.');
    }
    const { pessoa, chaveId, edita } = await pessoaDoPedido(req.get('x-prefabricados-chave'));
    logger.info('prefabricados-api', { uid: pessoa.uid, chave: chaveId, metodo: req.method, rota: req.path });
    if (req.method === 'POST') {
      if (!edita) throw new Recusa(403, 'A chave precisa ser de quem edita a área Engenharia.');
      res.status(200).json(await avancarSincronizacao(partes[1], req.body, pessoa));
      return;
    }
    if (partes.length === 1 && partes[0] === 'sincronizacoes') { res.status(200).json(await sincronizacoesEsperando()); return; }
    if (passoDoRoboNaRota) { res.status(200).json(await sincronizacao(partes[1])); return; }
    if (partes.length === 1 && partes[0] === 'eu') { res.status(200).json(eu(pessoa)); return; }
    if (partes.length === 3 && partes[0] === 'pedidos' && partes[2] === 'pdfs') { res.status(200).json(await pdfsDoPedido(pedidoDaRota(partes[1]))); return; }
    if (partes.length === 2 && partes[0] === 'pdfs') {
      const pdf = await baixarPdf(partes[1]);
      res.status(200).set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(pdf.nome)}` }).send(pdf.dados);
      return;
    }
    throw new Recusa(404, 'Rota desconhecida. GET: /eu, /pedidos/{pedido}/pdfs, /pdfs/{id}, /sincronizacoes, /sincronizacoes/{id}. POST: /sincronizacoes/{id}.');
  } catch (e) {
    const status = statusDoErro(e);
    const mensagem = e instanceof Error ? e.message : String(e);
    logger[status >= 500 ? 'error' : 'warn']('prefabricados-api', { rota: req.path, metodo: req.method, status, mensagem });
    res.status(status).json({ ok: false, erro: status >= 500 ? 'Erro interno.' : mensagem });
  }
});
