// API do CronoObra (área Engenharia) para robôs, Power BI, planilhas e assistentes: só consulta do Cronograma de Obras
// (/engenharia/cronograma). Cada chave pertence a uma pessoa (cronoobra-chaves-api/{sha256 da chave}: uid, nome,
// revogada_em), criada e revogada pelo adm2 em Cadastros → APIs; o banco guarda só o hash. Cabeçalho:
// `X-CronoObra-Chave: encr_...` (não usa Authorization: o Cloud Run tentaria validá-lo como token do Google). A pessoa da
// chave precisa ver a área Engenharia (ou ser adm2): tirar a área corta o acesso sem revogar a chave. O Admin SDK não
// passa pelas Rules: a permissão é conferida aqui.
// Rotas: GET /eu, GET /cronograma e POST /mcp (as mesmas consultas como ferramentas de MCP).
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/cronoobra-chaves-api.md e 02_APIS_FUNCTIONS/10_APIS_POR_AREA.md.
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { db } from './firebaseAdmin.js';
import { dataLocal } from './fridayMondayConverter.js';
import { responderMcp, type FerramentaMcp } from './fridayMcp.js';
import {
  EntradaInvalida, formatoChaveCronoObra, hashChaveCronoObra, lerFiltrosCronograma, montarCronograma, pessoaDaChaveCronoObra, type Doc,
} from './cronoObraApiDominio.js';

type AnyRecord = Record<string, any>;
type Pessoa = { uid: string; nome: string; adm2: boolean };

class Recusa extends Error {
  constructor(readonly status: number, mensagem: string) { super(mensagem); }
}

/** Pessoa da chave do cabeçalho; sem chave válida, 401 sem detalhes. Marca o último uso no máximo uma vez por hora. */
async function pessoaDoPedido(chave: unknown): Promise<{ pessoa: Pessoa; chaveId: string }> {
  if (!formatoChaveCronoObra(chave)) throw new Recusa(401, 'Não autorizado.');
  const hash = hashChaveCronoObra(chave);
  const ref = db.collection('cronoobra-chaves-api').doc(hash);
  const registro = (await ref.get()).data();
  const funcionario = registro?.uid ? (await db.collection('funcionarios').doc(String(registro.uid)).get()).data() : undefined;
  const pessoa = pessoaDaChaveCronoObra(registro, funcionario);
  if (!pessoa) throw new Recusa(401, 'Não autorizado.');
  const agora = dataLocal();
  if (String(registro!.ultimo_uso ?? '').slice(0, 13) !== agora.slice(0, 13)) await ref.update({ ultimo_uso: agora }).catch(() => undefined);
  return { pessoa, chaveId: hash.slice(0, 12) };
}

const docs = (s: FirebaseFirestore.QuerySnapshot): Doc[] => s.docs.map((d) => ({ id: d.id, data: d.data() }));

/** GET /eu: de quem é a chave. */
const eu = (p: Pessoa) => ({ uid: p.uid, nome: p.nome, adm2: p.adm2 });

/** GET /cronograma: o Cronograma de Obras (/engenharia/cronograma), com filtros. */
async function cronograma(consulta: AnyRecord | undefined) {
  const filtros = lerFiltrosCronograma(consulta);
  const [obras, mestres, alocacoes] = await Promise.all([
    db.collection('obras-v2').where('friday.ok', '==', true).get(),
    db.collection('monday-mestres').get(),
    db.collection('monday-cronograma').get(),
  ]);
  return { ...montarCronograma({ obras: docs(obras), mestres: docs(mestres), alocacoes: docs(alocacoes) }, filtros), filtros, gerado_em: dataLocal() };
}

// ---------------------------------------------------------------- MCP
const leitura = { readOnlyHint: true, openWorldHint: false } as const;
const DATA = { type: 'string', description: 'Data AAAA-MM-DD ou DD/MM/AAAA.' };
const FERRAMENTAS: FerramentaMcp[] = [
  {
    name: 'quem_sou_eu', title: 'Quem sou eu', escrita: false, annotations: leitura,
    inputSchema: { type: 'object', properties: {} },
    description: 'De quem é a chave.',
  },
  {
    name: 'ler_cronograma', title: 'Ler o Cronograma de Obras', escrita: false, annotations: leitura,
    inputSchema: {
      type: 'object', properties: {
        de: DATA, ate: DATA,
        contrato: { type: 'string', description: 'ID do contrato, número do contrato, sigla ou parte do nome da obra.' },
        mestre: { type: 'string', description: 'Nome do mestre (sem diferenciar acento e maiúscula) ou o ID.' },
        status: { type: 'array', items: { type: 'string' }, description: 'Status do LOTE; qualquer um da lista.' },
      },
    },
    description: 'Cronograma de Obras: qual mestre está em qual LOTE, de quando a quando, com os dias NT (não trabalhados). '
      + 'Uma linha por período em "alocacoes"; "obras" traz os contratos com os LOTEs; "mestres", todos. Com "de"/"ate", só os períodos que tocam o intervalo.',
  },
];
const INSTRUCOES = 'CronoObra (área Engenharia da Ledur), só consulta, em nome da pessoa da chave. ler_cronograma traz o '
  + 'Cronograma de Obras (/engenharia/cronograma) com os mestres por LOTE e os dias NT; use de/ate para um período.';

async function executarFerramenta(p: Pessoa, nome: string, args: AnyRecord): Promise<unknown> {
  if (nome === 'quem_sou_eu') return eu(p);
  if (nome === 'ler_cronograma') return cronograma(args);
  throw new Recusa(404, `Ferramenta desconhecida: ${nome}.`);
}

const statusDoErro = (e: unknown) => e instanceof Recusa ? e.status : e instanceof EntradaInvalida ? 400 : 500;

export const cronoObraApi = onRequest({ region: 'southamerica-east1', timeoutSeconds: 60, memory: '256MiB', maxInstances: 2, invoker: 'public' }, async (req, res) => {
  try {
    const partes = req.path.split('/').filter(Boolean);
    const mcp = partes.length === 1 && partes[0] === 'mcp';
    if (mcp && req.method !== 'POST') throw new Recusa(405, 'O MCP usa POST.');
    if (!mcp && req.method !== 'GET') throw new Recusa(405, 'Use GET (só consulta) ou POST em /mcp.');
    const { pessoa, chaveId } = await pessoaDoPedido(req.get('x-cronoobra-chave'));
    if (mcp) {
      const r = await responderMcp(req.body, {
        escrita: false,
        ferramentas: FERRAMENTAS,
        servidor: { name: 'ledur-cronoobra', title: 'CronoObra Ledur' },
        instrucoes: INSTRUCOES,
        executar: async (nome, args) => {
          logger.info('cronoobra-api', { uid: pessoa.uid, chave: chaveId, metodo: 'MCP', rota: req.path, ferramenta: nome });
          return executarFerramenta(pessoa, nome, args);
        },
        mensagemDeErro: (err) => {
          const status = statusDoErro(err);
          const mensagem = err instanceof Error ? err.message : String(err);
          logger[status >= 500 ? 'error' : 'warn']('cronoobra-api', { rota: req.path, metodo: 'MCP', status, mensagem });
          return status >= 500 ? 'Erro interno.' : mensagem;
        },
      });
      if (r === null) res.status(202).end(); else res.status(200).json(r);
      return;
    }
    let r: unknown;
    if (partes.length === 1 && partes[0] === 'eu') r = eu(pessoa);
    else if (partes.length === 1 && partes[0] === 'cronograma') r = await cronograma(req.query as AnyRecord);
    else throw new Recusa(404, 'Rota desconhecida. Consulta (GET): /eu, /cronograma?de=&ate=&contrato=&mestre=&status=. MCP (POST): /mcp.');
    logger.info('cronoobra-api', { uid: pessoa.uid, chave: chaveId, metodo: req.method, rota: req.path });
    res.status(200).json(r);
  } catch (e) {
    const status = statusDoErro(e);
    const mensagem = e instanceof Error ? e.message : String(e);
    logger[status >= 500 ? 'error' : 'warn']('cronoobra-api', { rota: req.path, metodo: req.method, status, mensagem });
    res.status(status).json({ ok: false, erro: status >= 500 ? 'Erro interno.' : mensagem });
  }
});
