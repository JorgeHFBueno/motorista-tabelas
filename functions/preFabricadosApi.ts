// API dos Pré-Fabricados (área Engenharia) para robôs: só consulta dos PDFs dos pré-fabricados anexados no detalhe da obra
// (/engenharia/obras/:id), achados pelo Nº Pedido do LOTE (o mesmo número do Cód. Auxiliar da obra no Plannix). Primeiro
// uso: a automação do Samuel que baixa o PDF e o lança no Plannix. Cada chave pertence a uma pessoa
// (prefabricados-chaves-api/{sha256 da chave}: uid, nome, revogada_em), criada e revogada pelo adm2 em Cadastros → APIs;
// o banco guarda só o hash. Cabeçalho: `X-PreFabricados-Chave: enpf_...` (não usa Authorization: o Cloud Run tentaria
// validá-lo como token do Google). A pessoa da chave precisa ver a área Engenharia (ou ser adm2). O Admin SDK não passa
// pelas Rules: a permissão é conferida aqui.
// Rotas (GET): /eu, /pedidos/{pedido}/pdfs e /pdfs/{id} (o próprio PDF).
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/prefabricados-chaves-api.md e 02_APIS_FUNCTIONS/10_APIS_POR_AREA.md.
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { FieldPath } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { db } from './firebaseAdmin.js';
import { dataLocal } from './fridayMondayConverter.js';
import { COLUNA_PEDIDO, pedidoDaCelula } from './plannixPreFabricados.js';
import {
  EntradaInvalida, formatoChavePreFabricados, hashChavePreFabricados, pdfIdValido, pdfsAtuaisDoLote, pedidoDaRota, pessoaDaChavePreFabricados,
} from './preFabricadosApiDominio.js';

type AnyRecord = Record<string, any>;
type Pessoa = { uid: string; nome: string; adm2: boolean };

class Recusa extends Error {
  constructor(readonly status: number, mensagem: string) { super(mensagem); }
}

/** Pessoa da chave do cabeçalho; sem chave válida, 401 sem detalhes. Marca o último uso no máximo uma vez por hora. */
async function pessoaDoPedido(chave: unknown): Promise<{ pessoa: Pessoa; chaveId: string }> {
  if (!formatoChavePreFabricados(chave)) throw new Recusa(401, 'Não autorizado.');
  const hash = hashChavePreFabricados(chave);
  const ref = db.collection('prefabricados-chaves-api').doc(hash);
  const registro = (await ref.get()).data();
  const funcionario = registro?.uid ? (await db.collection('funcionarios').doc(String(registro.uid)).get()).data() : undefined;
  const pessoa = pessoaDaChavePreFabricados(registro, funcionario);
  if (!pessoa) throw new Recusa(401, 'Não autorizado.');
  const agora = dataLocal();
  if (String(registro!.ultimo_uso ?? '').slice(0, 13) !== agora.slice(0, 13)) await ref.update({ ultimo_uso: agora }).catch(() => undefined);
  return { pessoa, chaveId: hash.slice(0, 12) };
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

const statusDoErro = (e: unknown) => e instanceof Recusa ? e.status : e instanceof EntradaInvalida ? 400 : 500;

export const preFabricadosApi = onRequest({ region: 'southamerica-east1', timeoutSeconds: 60, memory: '256MiB', maxInstances: 2, invoker: 'public' }, async (req, res) => {
  try {
    if (req.method !== 'GET') throw new Recusa(405, 'Use GET (só consulta).');
    const partes = req.path.split('/').filter(Boolean);
    const { pessoa, chaveId } = await pessoaDoPedido(req.get('x-prefabricados-chave'));
    logger.info('prefabricados-api', { uid: pessoa.uid, chave: chaveId, metodo: req.method, rota: req.path });
    if (partes.length === 1 && partes[0] === 'eu') { res.status(200).json(eu(pessoa)); return; }
    if (partes.length === 3 && partes[0] === 'pedidos' && partes[2] === 'pdfs') { res.status(200).json(await pdfsDoPedido(pedidoDaRota(partes[1]))); return; }
    if (partes.length === 2 && partes[0] === 'pdfs') {
      const pdf = await baixarPdf(partes[1]);
      res.status(200).set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(pdf.nome)}` }).send(pdf.dados);
      return;
    }
    throw new Recusa(404, 'Rota desconhecida. Consulta (GET): /eu, /pedidos/{pedido}/pdfs, /pdfs/{id}.');
  } catch (e) {
    const status = statusDoErro(e);
    const mensagem = e instanceof Error ? e.message : String(e);
    logger[status >= 500 ? 'error' : 'warn']('prefabricados-api', { rota: req.path, metodo: req.method, status, mensagem });
    res.status(status).json({ ok: false, erro: status >= 500 ? 'Erro interno.' : mensagem });
  }
});
