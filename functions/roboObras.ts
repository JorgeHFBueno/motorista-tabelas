// Endpoint dos robôs externos de obras ("o Friday decide, o robô executa"). O robô só faz o que exige a máquina dele
// (criar o subcentro na tela do ERP, com Playwright); a escolha das obras, a validação e a gravação ficam aqui.
// Acesso: cabeçalho `X-Robo-Token: <ROBO_OBRAS_TOKEN>` (segredo próprio, revogável trocando o valor). Não usa
// `Authorization: Bearer`: o Cloud Run tenta validar esse cabeçalho como token do Google e responde 401. O Admin SDK não
// passa pelas Rules: cada rota confere o token e só grava o campo que lhe cabe, pelo mesmo caminho da tela.
// Proposta a validar na prática (2026-11-04): The Manuscript, 02_APIS_FUNCTIONS/09_ROBOS_EXTERNOS_DE_OBRAS.md.
import { HttpsError, onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { db } from './firebaseAdmin.js';
import { gravarNoCadastro } from './fridayCadastros.js';
import { lerCaminho, type CampoExistente } from './fridayCadastrosExistentes.js';
import { situacaoDoItem } from './fridayCadastroConverter.js';
import { dataLocal, novoId } from './fridayMondayConverter.js';
import {
  camposDoRobo, candidatos, dataValida, decidirRegistro, INICIO_SUBCENTRO, obrasSemSubcentro, subcentroValido, tokenConfere, tokenDoCabecalho,
} from './roboObrasDominio.js';

type AnyRecord = Record<string, any>;
const REGIAO = 'southamerica-east1';
const roboObrasToken = defineSecret('ROBO_OBRAS_TOKEN');
/** Autor das gravações do robô (atividades do Friday). */
export const ROBO_OBRAS_UID = 'robo-obras';

class Recusa extends Error {
  constructor(readonly status: number, mensagem: string) { super(mensagem); }
}
/** Erros da gravação do quadro oficial (HttpsError) no status HTTP equivalente. */
const STATUS_HTTPS: Record<string, number> = { 'invalid-argument': 400, 'not-found': 404, 'already-exists': 409, 'failed-precondition': 412, 'permission-denied': 403 };

/** Cadastro obras-v2 ativo (quadro GESTÃO DE OBRAS): registro, chave, colunas do quadro e os campos ligados. */
async function cadastroDeObras() {
  const registros = (await db.collection('friday-cadastros').where('colecao', '==', 'obras-v2').get()).docs
    .map(d => d.data()).filter(r => r.modo === 'existente' && r.situacao === 'ativo');
  if (registros.length !== 1) throw new Recusa(412, `Esperado um cadastro obras-v2 ativo; encontrados ${registros.length}.`);
  const registro = registros[0];
  const quadroId = Number(registro.quadro_id);
  const colunas = (await db.collection('friday-colunas').where('quadro_id', '==', quadroId).get()).docs
    .map(d => d.data()).filter(c => !c.excluido_em).map(c => ({ id: Number(c.id), titulo: String(c.titulo ?? ''), tipo: String(c.tipo ?? '') }));
  return { chave: String(registro.chave), quadroId, colunas, campos: (registro.campos ?? []) as CampoExistente[] };
}

async function subcentroPendentes(corpo: AnyRecord) {
  const desde = corpo.desde ?? INICIO_SUBCENTRO;
  if (!dataValida(desde)) throw new Recusa(400, 'desde precisa ser AAAA-MM-DD.');
  const c = await cadastroDeObras();
  const itens = (await db.collection('friday-itens').where('quadro_id', '==', c.quadroId).get()).docs.map(d => d.data());
  const ids = [...new Set(candidatos(itens, c.chave, desde).map(i => String(i.vinculo.id)))];
  const oficiais = new Map<string, AnyRecord | undefined>();
  for (let k = 0; k < ids.length; k += 100) {
    for (const sn of await db.getAll(...ids.slice(k, k + 100).map(id => db.collection('obras-v2').doc(id)))) oficiais.set(sn.id, sn.data());
  }
  const r = obrasSemSubcentro({ itens, oficiais, colunas: c.colunas, campos: c.campos, chaveCadastro: c.chave, desde });
  if ('erro' in r) throw new Recusa(412, r.erro);
  return { desde, ...r };
}

async function subcentroRegistrar(corpo: AnyRecord) {
  const itemId = Number(corpo.itemId);
  const subcentro = corpo.subcentro;
  const simular = corpo.simular === true;
  if (!Number.isSafeInteger(itemId)) throw new Recusa(400, 'itemId inválido.');
  if (!subcentroValido(subcentro)) throw new Recusa(400, 'subcentro precisa ser só dígitos (texto).');
  const c = await cadastroDeObras();
  const campos = camposDoRobo(c.campos);
  if ('erro' in campos) throw new Recusa(412, campos.erro);
  const item = (await db.collection('friday-itens').doc(String(itemId)).get()).data();
  if (!item || Number(item.quadro_id) !== c.quadroId || item.item_pai_id != null) throw new Recusa(404, 'Obra não encontrada no quadro de obras.');
  if (situacaoDoItem(item) !== 'ativo') throw new Recusa(409, 'A obra está arquivada ou na lixeira.');
  if (item.vinculo?.cadastro !== c.chave) throw new Recusa(409, 'A obra não está ligada ao cadastro obras-v2.');
  const obraRef = db.collection('obras-v2').doc(String(item.vinculo.id));
  const atual = lerCaminho((await obraRef.get()).data(), campos.subcentro.chave);
  const decisao = decidirRegistro(atual, subcentro);
  // Nunca sobrescreve: outro valor já gravado é conflito (alguém preencheu ou o robô errou de obra).
  if (decisao === 'conflito') throw new Recusa(409, `A obra já tem outro subcentro (${String(atual)}).`);
  const base = { itemId, obraId: obraRef.id, subcentro };
  if (decisao === 'ja_gravado') return { ...base, ok: true, ja_gravado: true, conferido: true };
  if (simular) return { ...base, ok: true, simulado: true, gravaria: true };

  // Mesmo caminho da edição na tela (fridayCadastroGravar): valida pelo contrato e grava em obras-v2.
  await gravarNoCadastro(ROBO_OBRAS_UID, itemId, 'valor', Number(campos.subcentro.coluna_id), subcentro);
  const conferido = lerCaminho((await obraRef.get()).data(), campos.subcentro.chave) === subcentro;
  if (!conferido) throw new Recusa(500, 'Gravado, mas a releitura não conferiu o subcentro.');
  const idAtividade = novoId();
  await db.collection('friday-atividades').doc(String(idAtividade)).set({
    id: idAtividade, quadro_id: c.quadroId, item_id: itemId, item_nome: item.nome ?? null, usuario_id: ROBO_OBRAS_UID, automacao_id: null, acao: 'alterou',
    coluna_id: Number(campos.subcentro.coluna_id), coluna_titulo: 'Subcentro ERP', de: null, para: `${subcentro} (robô de obras)`, criado_em: dataLocal(),
  });
  return { ...base, ok: true, conferido: true };
}

const ROTAS: Record<string, (corpo: AnyRecord) => Promise<unknown>> = {
  '/subcentro/pendentes': subcentroPendentes,
  '/subcentro/registrar': subcentroRegistrar,
};

/** Rotas do robô de obras (POST, corpo JSON). Sem token válido, 401 sem detalhes. */
export const roboObras = onRequest({ region: REGIAO, secrets: [roboObrasToken], timeoutSeconds: 120, memory: '512MiB', maxInstances: 2 }, async (req, res) => {
  if (!tokenConfere(tokenDoCabecalho(req.get('x-robo-token')), roboObrasToken.value())) {
    res.status(401).json({ ok: false, erro: 'Não autorizado.' });
    return;
  }
  const rota = ROTAS[req.path];
  if (!rota) { res.status(404).json({ ok: false, erro: 'Rota desconhecida.' }); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, erro: 'Use POST.' }); return; }
  const corpo = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as AnyRecord) : {};
  try {
    const r = await rota(corpo);
    logger.info('robo-obras', { rota: req.path, itemId: corpo.itemId ?? null, simular: corpo.simular === true });
    res.status(200).json(r);
  } catch (e) {
    const status = e instanceof Recusa ? e.status : e instanceof HttpsError ? (STATUS_HTTPS[e.code] ?? 500) : 500;
    const mensagem = e instanceof Error ? e.message : String(e);
    logger[status >= 500 ? 'error' : 'warn']('robo-obras', { rota: req.path, itemId: corpo.itemId ?? null, status, mensagem });
    res.status(status).json({ ok: false, erro: mensagem.slice(0, 300) });
  }
});
