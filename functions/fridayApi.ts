// API de leitura do Friday para robôs e assistentes (só GET, nada grava no Friday). Cada chave pertence a uma pessoa
// (friday-chaves-api/{sha256 da chave}: uid, nome, revogada_em) e enxerga exatamente o que essa pessoa vê na tela:
// quadros abertos, restritos em que ela está em "acesso" e, para adm2, todos. A chave é criada e revogada pelo adm2
// na tela "Chaves de API" do Friday; o banco guarda só o hash. Cabeçalho: `X-Friday-Chave: fri_...` (não usa
// Authorization: o Cloud Run tentaria validá-lo como token do Google). O Admin SDK não passa pelas Rules: a permissão
// de cada quadro é conferida aqui (podeVerQuadro), igual às Rules do Friday.
// Contrato: The Manuscript, 02_APIS_FUNCTIONS/09_ROBOS_EXTERNOS_DE_OBRAS.md ("Leitura do Friday por chave").
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { db } from './firebaseAdmin.js';
import { valorDoOficial, type CampoOficial } from './fridayCadastroConverter.js';
import { lerCaminho } from './fridayCadastrosExistentes.js';
import { calcular, type Coluna as ColunaFormula } from './fridayFormula.js';
import { dataLocal } from './fridayMondayConverter.js';
import {
  casaBusca, formatoChave, hashChave, palavrasDaBusca, pessoaDaChave, podeVerQuadro, textoCelula, valoresPorTitulo,
} from './fridayApiDominio.js';

type AnyRecord = Record<string, any>;
type Pessoa = { uid: string; adm2: boolean };
const REGIAO = 'southamerica-east1';
const colecao = (r: string) => db.collection(`friday-${r}`);
const visivel = (x: AnyRecord | undefined) => !!x && !x.arquivado_em && !x.excluido_em;
const porPosicao = (a: AnyRecord, b: AnyRecord) => (Number(a.posicao) || 0) - (Number(b.posicao) || 0) || Number(a.id) - Number(b.id);

class Recusa extends Error {
  constructor(readonly status: number, mensagem: string) { super(mensagem); }
}

/** Pessoa da chave do cabeçalho; sem chave válida, 401 sem detalhes. Marca o último uso (no máximo uma vez por hora). */
async function pessoaDoPedido(chave: unknown): Promise<Pessoa> {
  if (!formatoChave(chave)) throw new Recusa(401, 'Não autorizado.');
  const ref = db.collection('friday-chaves-api').doc(hashChave(chave));
  const registro = (await ref.get()).data();
  const funcionario = registro?.uid ? (await db.collection('funcionarios').doc(String(registro.uid)).get()).data() : undefined;
  const pessoa = pessoaDaChave(registro, funcionario);
  if (!pessoa) throw new Recusa(401, 'Não autorizado.');
  const agora = dataLocal();
  if (String(registro!.ultimo_uso ?? '').slice(0, 13) !== agora.slice(0, 13)) await ref.update({ ultimo_uso: agora }).catch(() => undefined);
  return pessoa;
}

// ---------------------------------------------------------------- leitura com permissão
/** Quadros que a pessoa vê (cache por pedido). */
function leitor(pessoa: Pessoa) {
  const quadros = new Map<number, Promise<AnyRecord | undefined>>();
  const nomes = new Map<string, string>();
  const quadro = (id: number) => {
    if (!quadros.has(id)) quadros.set(id, colecao('quadros').doc(String(id)).get().then(s => s.data()));
    return quadros.get(id)!;
  };
  const podeVer = async (id: number) => podeVerQuadro(await quadro(id), pessoa);
  /** Nomes das pessoas (funcionarios), lidos de uma vez. */
  const carregarNomes = async (uids: Iterable<string>) => {
    const faltam = [...new Set(uids)].filter(u => u && !nomes.has(u));
    for (let k = 0; k < faltam.length; k += 100) {
      const snaps = await db.getAll(...faltam.slice(k, k + 100).map(u => db.collection('funcionarios').doc(u)));
      for (const s of snaps) nomes.set(s.id, String(s.data()?.nome ?? '?'));
    }
  };
  return { quadro, podeVer, carregarNomes, nomePessoa: (u: string) => nomes.get(u) ?? '?' };
}
type Leitor = ReturnType<typeof leitor>;

/** Valores oficiais (cadastros existentes, ex.: GESTÃO DE OBRAS → obras-v2) encaixados nas colunas, como a tela mostra. */
async function comOficiais(itens: AnyRecord[]): Promise<Map<number, AnyRecord>> {
  const valores = new Map(itens.map(i => [Number(i.id), { ...(i.valores ?? {}) }]));
  const ligados = itens.filter(i => i.vinculo?.cadastro && i.vinculo?.id);
  const registros = new Map<string, AnyRecord | undefined>();
  for (const chave of new Set(ligados.map(i => String(i.vinculo.cadastro)))) registros.set(chave, (await db.collection('friday-cadastros').doc(chave).get()).data());
  const porColecao = new Map<string, AnyRecord[]>();
  for (const i of ligados) {
    const r = registros.get(String(i.vinculo.cadastro));
    if (r?.situacao !== 'ativo' || !r.colecao) continue;
    porColecao.set(String(r.colecao), [...(porColecao.get(String(r.colecao)) ?? []), i]);
  }
  for (const [nomeColecao, lista] of porColecao) {
    const ids = [...new Set(lista.map(i => String(i.vinculo.id)))];
    const docs = new Map<string, AnyRecord | undefined>();
    for (let k = 0; k < ids.length; k += 100) {
      for (const s of await db.getAll(...ids.slice(k, k + 100).map(id => db.collection(nomeColecao).doc(id)))) docs.set(s.id, s.data());
    }
    for (const i of lista) {
      const r = registros.get(String(i.vinculo.cadastro))!;
      const sub = i.vinculo.sub != null;
      const campos = ((sub ? r.subitens?.campos : r.campos) ?? []) as (CampoOficial & { secundario?: boolean; situacao?: string })[];
      const doc = docs.get(String(i.vinculo.id));
      const oficial = sub ? doc?.[String(r.subitens?.chave)]?.[String(i.vinculo.sub)] : doc;
      const v = valores.get(Number(i.id))!;
      for (const c of campos.filter(x => x.situacao === 'ativo' && !x.secundario)) {
        const x = valorDoOficial(c, lerCaminho(oficial, c.chave));
        if (x === undefined) delete v[String(c.coluna_id)]; else v[String(c.coluna_id)] = x;
      }
    }
  }
  return valores;
}

/** Itens em texto legível: { id, nome, grupo, valores: { "Título da coluna": texto } }. */
async function itensLegiveis(itens: AnyRecord[], colunas: AnyRecord[], grupos: Map<number, string>, l: Leitor) {
  const valores = await comOficiais(itens);
  const cols = [...colunas].sort(porPosicao);
  await l.carregarNomes(cols.filter(c => c.tipo === 'pessoa').flatMap(c => itens.flatMap(i => {
    const v = valores.get(Number(i.id))?.[String(c.id)];
    return Array.isArray(v) ? v.map(String) : [];
  })));
  // Ligações: o nome do item ligado só sai quando a pessoa vê o quadro dele.
  const ligados = [...new Set(cols.filter(c => c.tipo === 'ligacao').flatMap(c => itens.flatMap(i => (valores.get(Number(i.id))?.[String(c.id)] ?? []) as unknown[])).map(Number))].filter(Number.isFinite);
  const nomeLigado = new Map<number, string>();
  for (let k = 0; k < ligados.length; k += 100) {
    for (const s of await db.getAll(...ligados.slice(k, k + 100).map(id => colecao('itens').doc(String(id))))) {
      const d = s.data();
      if (d && visivel(d) && await l.podeVer(Number(d.quadro_id))) nomeLigado.set(Number(d.id), String(d.nome ?? ''));
    }
  }
  const ctx = { nomePessoa: l.nomePessoa, nomeItem: (id: number) => nomeLigado.get(id) ?? null };
  const colunasFormula = cols.map(c => ({ id: Number(c.id), titulo: String(c.titulo ?? ''), tipo: String(c.tipo), config: c.config ?? {} })) as ColunaFormula[];
  return itens.map(i => {
    const v = valores.get(Number(i.id)) ?? {};
    const comValores = { ...i, valores: v };
    return {
      id: Number(i.id), nome: String(i.nome ?? ''), grupo: grupos.get(Number(i.grupo_id)) ?? null,
      valores: valoresPorTitulo(cols.map(c => ({ id: Number(c.id), titulo: String(c.titulo ?? '') })), id => {
        const c = cols.find(x => Number(x.id) === id)!;
        if (c.tipo === 'formula') {
          const r = calcular(colunasFormula.find(x => x.id === id)!, comValores as never, { colunas: colunasFormula, nomeUsuario: u => l.nomePessoa(String(u)) });
          return r.erro || r.valor === '' ? null : String(r.valor);
        }
        return textoCelula(c as { tipo: string; config?: AnyRecord }, v[String(id)], ctx);
      }),
    };
  });
}

const doQuadro = async (r: string, quadroId: number) => (await colecao(r).where('quadro_id', '==', quadroId).get()).docs.map(d => d.data());

// ---------------------------------------------------------------- rotas
/** GET /eu: de quem é a chave. */
async function eu(p: Pessoa) {
  const f = (await db.collection('funcionarios').doc(p.uid).get()).data();
  return { uid: p.uid, nome: String(f?.nome ?? ''), adm2: p.adm2 };
}

/** GET /quadros: áreas, pastas e quadros que a pessoa vê (sem os quadros internos de subitens). */
async function listarQuadros(p: Pessoa) {
  const [areas, pastas, quadros] = await Promise.all(['areas', 'pastas', 'quadros'].map(async r => (await colecao(r).get()).docs.map(d => d.data())));
  const nomeArea = new Map(areas.map(a => [Number(a.id), String(a.nome ?? '')]));
  const pasta = new Map(pastas.map(x => [Number(x.id), x]));
  const caminho = (id: unknown) => {
    const partes: string[] = [];
    for (let x = pasta.get(Number(id)), n = 0; x && n < 20; x = pasta.get(Number(x.pasta_pai_id)), n++) partes.unshift(String(x.nome ?? ''));
    return partes.join(' / ') || null;
  };
  return {
    quadros: quadros.filter(q => q.tipo !== 'subitens' && podeVerQuadro(q, p)).sort(porPosicao).map(q => ({
      id: Number(q.id), nome: String(q.nome ?? ''), tipo: q.tipo ?? 'quadro', area: nomeArea.get(Number(q.area_id)) ?? null, pasta: caminho(q.pasta_id),
      restrito: Number(q.restrito) === 1, oficial: q.cadastro ?? null,
    })),
  };
}

/** GET /quadros/{id}: colunas, grupos e itens (com subitens) em texto legível. */
async function lerQuadro(p: Pessoa, id: number) {
  const l = leitor(p);
  const q = await l.quadro(id);
  if (!q || !podeVerQuadro(q, p) || q.tipo === 'subitens') throw new Recusa(404, 'Quadro não encontrado.');
  const [colunas, grupos, itens] = await Promise.all([doQuadro('colunas', id), doQuadro('grupos', id), doQuadro('itens', id)]);
  const gruposVis = grupos.filter(visivel).sort(porPosicao);
  const nomeGrupo = new Map(gruposVis.map(g => [Number(g.id), String(g.nome ?? '')]));
  const principais = itens.filter(i => visivel(i) && i.item_pai_id == null && nomeGrupo.has(Number(i.grupo_id))).sort(porPosicao);
  const legiveis = await itensLegiveis(principais, colunas.filter(c => !c.excluido_em), nomeGrupo, l);
  // Subitens: quadro interno (tipo subitens) ligado a este, com as próprias colunas.
  const subquadro = (await colecao('quadros').where('quadro_pai_id', '==', id).get()).docs.map(d => d.data()).find(x => x.tipo === 'subitens' && visivel(x));
  const subPorPai = new Map<number, unknown[]>();
  if (subquadro) {
    const [subColunas, subItens] = await Promise.all([doQuadro('colunas', Number(subquadro.id)), doQuadro('itens', Number(subquadro.id))]);
    const lista = subItens.filter(i => visivel(i) && i.item_pai_id != null).sort(porPosicao);
    const subLegiveis = await itensLegiveis(lista, subColunas.filter(c => !c.excluido_em), new Map(), l);
    lista.forEach((i, k) => subPorPai.set(Number(i.item_pai_id), [...(subPorPai.get(Number(i.item_pai_id)) ?? []), { ...subLegiveis[k], grupo: undefined }]));
  }
  return {
    quadro: { id, nome: String(q.nome ?? ''), oficial: q.cadastro ?? null },
    colunas: colunas.filter(c => !c.excluido_em).sort(porPosicao).map(c => ({ id: Number(c.id), titulo: String(c.titulo ?? ''), tipo: String(c.tipo) })),
    grupos: gruposVis.map(g => ({ id: Number(g.id), nome: String(g.nome ?? '') })),
    itens: legiveis.map(i => ({ ...i, subitens: subPorPai.get(i.id) ?? [] })),
  };
}

/**
 * GET /buscar?q=texto[&quadro=id][&limite=50]: itens (e subitens) cujo nome tem todas as palavras. Com "quadro", procura
 * também nos valores das colunas daquele quadro (ex.: o número do subcentro).
 */
async function buscar(p: Pessoa, consulta: AnyRecord) {
  const palavras = palavrasDaBusca(consulta.q);
  if (!palavras.length) throw new Recusa(400, 'Informe q (o texto a procurar).');
  const limite = Math.min(200, Math.max(1, Number(consulta.limite) || 50));
  const l = leitor(p);
  const quadroId = consulta.quadro != null ? Number(consulta.quadro) : null;
  let candidatos: AnyRecord[];
  if (quadroId != null) {
    const q = await l.quadro(quadroId);
    if (!q || !podeVerQuadro(q, p)) throw new Recusa(404, 'Quadro não encontrado.');
    candidatos = (await doQuadro('itens', quadroId)).filter(i => visivel(i) && i.item_pai_id == null);
  } else {
    const maior = [...palavras].sort((a, b) => b.length - a.length)[0];
    candidatos = (await colecao('itens').where('busca', 'array-contains', maior).limit(1000).get()).docs.map(d => d.data())
      .filter(i => visivel(i) && casaBusca(i.nome, palavras));
  }
  const porQuadro = new Map<number, AnyRecord[]>();
  for (const i of candidatos) porQuadro.set(Number(i.quadro_id), [...(porQuadro.get(Number(i.quadro_id)) ?? []), i]);
  const achados: AnyRecord[] = [];
  for (const [qid, lista] of porQuadro) {
    if (!(await l.podeVer(qid))) continue;
    const q = (await l.quadro(qid))!;
    // Subitem: o quadro de subitens segue o quadro principal; o resultado mostra o quadro e o item pai.
    const principal = q.tipo === 'subitens' ? await l.quadro(Number(q.quadro_pai_id)) : q;
    if (!principal || !podeVerQuadro(principal, p)) continue;
    const [colunas, grupos] = await Promise.all([doQuadro('colunas', qid), doQuadro('grupos', qid)]);
    const gruposVis = grupos.filter(visivel);
    const nomeGrupo = new Map(gruposVis.map(g => [Number(g.id), String(g.nome ?? '')]));
    const deGrupoVisivel = lista.filter(i => i.item_pai_id != null || nomeGrupo.has(Number(i.grupo_id)));
    const legiveis = await itensLegiveis(deGrupoVisivel, colunas.filter(c => !c.excluido_em), nomeGrupo, l);
    const pais = new Map<number, string>();
    for (const i of deGrupoVisivel.filter(x => x.item_pai_id != null)) {
      const pai = (await colecao('itens').doc(String(i.item_pai_id)).get()).data();
      pais.set(Number(i.id), String(pai?.nome ?? ''));
    }
    legiveis.forEach((it, k) => {
      const nomeCasa = casaBusca(it.nome, palavras);
      const valorCasa = quadroId != null && Object.values(it.valores).some(v => v != null && casaBusca(v, palavras));
      if (!nomeCasa && !valorCasa) return;
      achados.push({
        quadro: { id: Number(principal.id), nome: String(principal.nome ?? '') },
        ...it, ...(deGrupoVisivel[k].item_pai_id != null ? { subitemDe: pais.get(it.id) ?? null } : {}),
      });
    });
  }
  return { q: String(consulta.q), total: achados.length, itens: achados.slice(0, limite) };
}

export const fridayApi = onRequest({ region: REGIAO, timeoutSeconds: 120, memory: '512MiB', maxInstances: 2 }, async (req, res) => {
  try {
    if (req.method !== 'GET') throw new Recusa(405, 'Use GET.');
    const pessoa = await pessoaDoPedido(req.get('x-friday-chave'));
    const partes = req.path.split('/').filter(Boolean);
    let r: unknown;
    if (partes.length === 1 && partes[0] === 'eu') r = await eu(pessoa);
    else if (partes.length === 1 && partes[0] === 'quadros') r = await listarQuadros(pessoa);
    else if (partes.length === 2 && partes[0] === 'quadros' && /^\d+$/.test(partes[1])) r = await lerQuadro(pessoa, Number(partes[1]));
    else if (partes.length === 1 && partes[0] === 'buscar') r = await buscar(pessoa, req.query as AnyRecord);
    else throw new Recusa(404, 'Rota desconhecida. Use /eu, /quadros, /quadros/{id} ou /buscar?q=.');
    logger.info('friday-api', { uid: pessoa.uid, rota: req.path });
    res.status(200).json(r);
  } catch (e) {
    const status = e instanceof Recusa ? e.status : 500;
    const mensagem = e instanceof Error ? e.message : String(e);
    logger[status >= 500 ? 'error' : 'warn']('friday-api', { rota: req.path, status, mensagem });
    res.status(status).json({ ok: false, erro: status >= 500 ? 'Erro interno.' : mensagem });
  }
});
