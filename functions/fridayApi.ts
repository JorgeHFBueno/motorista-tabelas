// API de leitura do Friday para robôs e assistentes (só GET, nada grava no Friday). Cada chave pertence a uma pessoa
// (friday-chaves-api/{sha256 da chave}: uid, nome, revogada_em) e enxerga exatamente o que essa pessoa vê na tela:
// quadros abertos, restritos em que ela está em "acesso" e, para adm2, todos. A chave é criada e revogada pelo adm2
// na tela "Chaves de API" do Friday; o banco guarda só o hash. Cabeçalho: `X-Friday-Chave: fri_...` (não usa
// Authorization: o Cloud Run tentaria validá-lo como token do Google). O Admin SDK não passa pelas Rules: a permissão
// de cada quadro é conferida aqui (podeVerQuadro), igual às Rules do Friday.
// Contrato: The Manuscript, 02_APIS_FUNCTIONS/09_ROBOS_EXTERNOS_DE_OBRAS.md ("Leitura do Friday por chave").
import { HttpsError, onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { db } from './firebaseAdmin.js';
import { valorDoOficial, type CampoOficial } from './fridayCadastroConverter.js';
import { lerCaminho } from './fridayCadastrosExistentes.js';
import { calcular, type Coluna as ColunaFormula } from './fridayFormula.js';
import { criarItem, gravarValorDoItem, lerItem, novoContexto, vincularSeOficial } from './fridayAutomacoes.js';
import { dataLocal, novoId } from './fridayMondayConverter.js';
import {
  casaBusca, colunaDoPedido, EntradaInvalida, formatoChave, hashChave, mencoesDoTexto, palavrasDaBusca, pessoaDaChave, podeVerQuadro, textoCelula, valorDaEntrada, valoresPorTitulo,
} from './fridayApiDominio.js';

type AnyRecord = Record<string, any>;
type Pessoa = { uid: string; adm2: boolean; escrita?: boolean };
/** Recusas do cadastro oficial (HttpsError de gravarNoCadastro) no status HTTP equivalente. */
const STATUS_HTTPS: Record<string, number> = { 'invalid-argument': 400, 'not-found': 404, 'already-exists': 409, 'failed-precondition': 409, 'permission-denied': 403 };
const REGIAO = 'southamerica-east1';
const colecao = (r: string) => db.collection(`friday-${r}`);
const visivel = (x: AnyRecord | undefined) => !!x && !x.arquivado_em && !x.excluido_em;
const porPosicao = (a: AnyRecord, b: AnyRecord) => (Number(a.posicao) || 0) - (Number(b.posicao) || 0) || Number(a.id) - Number(b.id);

class Recusa extends Error {
  constructor(readonly status: number, mensagem: string) { super(mensagem); }
}

/**
 * Pessoa da chave do cabeçalho; sem chave válida, 401 sem detalhes. Marca o último uso (no máximo uma vez por hora) e,
 * na escrita, o último uso de escrita. chaveId: começo do hash, gravado no que a chave escreve (controle de dano).
 */
async function pessoaDoPedido(chave: unknown, escrita: boolean): Promise<{ pessoa: Pessoa; chaveId: string }> {
  if (!formatoChave(chave)) throw new Recusa(401, 'Não autorizado.');
  const hash = hashChave(chave);
  const ref = db.collection('friday-chaves-api').doc(hash);
  const registro = (await ref.get()).data();
  const funcionario = registro?.uid ? (await db.collection('funcionarios').doc(String(registro.uid)).get()).data() : undefined;
  const pessoa = pessoaDaChave(registro, funcionario);
  if (!pessoa) throw new Recusa(401, 'Não autorizado.');
  if (escrita && !pessoa.escrita) throw new Recusa(403, 'Esta chave é só de consulta.');
  const agora = dataLocal();
  const marcar: AnyRecord = {};
  if (String(registro!.ultimo_uso ?? '').slice(0, 13) !== agora.slice(0, 13)) marcar.ultimo_uso = agora;
  if (escrita) marcar.ultima_escrita = agora;
  if (Object.keys(marcar).length) await ref.update(marcar).catch(() => undefined);
  return { pessoa, chaveId: hash.slice(0, 12) };
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

// ---------------------------------------------------------------- escrita (só chave com escrita)
type Escrita = { pessoa: Pessoa; chaveId: string };
const autorDaChave = (e: Escrita) => ({ usuario_id: e.pessoa.uid, via: 'api', chave_api: e.chaveId });

/** Atividade feita pela chave: autor é a pessoa da chave (dispara as automações, como na tela), marcada com a chave. */
async function registrar(e: Escrita, a: AnyRecord) {
  const id = novoId();
  await colecao('atividades').doc(String(id)).set({
    id, quadro_id: Number(a.quadro_id), item_id: a.item_id ?? null, item_nome: a.item_nome ?? null, automacao_id: null, acao: a.acao,
    coluna_id: a.coluna_id ?? null, coluna_titulo: a.coluna_titulo ?? null, de: a.de ?? null, para: a.para ?? null, criado_em: dataLocal(), ...autorDaChave(e),
  });
}

/** Item que a pessoa pode alterar: ativo e num quadro que ela vê (subitem: o quadro principal também). */
async function itemParaEscrever(p: Pessoa, itemId: number) {
  const l = leitor(p);
  const item = (await colecao('itens').doc(String(itemId)).get()).data();
  if (!item || !visivel(item)) throw new Recusa(404, 'Item não encontrado.');
  const q = await l.quadro(Number(item.quadro_id));
  const principal = q?.tipo === 'subitens' ? await l.quadro(Number(q.quadro_pai_id)) : q;
  if (!podeVerQuadro(q, p) || !podeVerQuadro(principal, p)) throw new Recusa(404, 'Item não encontrado.');
  return item;
}

/** Pessoa pelo uid ou pelo nome completo (sem diferenciar maiúsculas e acentos), entre os funcionários ativos. */
async function resolvedorDePessoas() {
  const funcionarios = (await db.collection('funcionarios').where('ativo', '==', true).get()).docs.map(d => ({ uid: d.id, nome: String(d.data().nome ?? '') }));
  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return (x: string) => {
    if (funcionarios.some(f => f.uid === x)) return x;
    const achados = funcionarios.filter(f => norm(f.nome) === norm(x));
    return achados.length === 1 ? achados[0].uid : null;
  };
}

/** Converte { coluna: valor } do pedido (antes de gravar qualquer coisa: um erro recusa o pedido inteiro). */
async function valoresDoPedido(colunas: AnyRecord[], entrada: unknown) {
  if (entrada == null) return [];
  if (typeof entrada !== 'object' || Array.isArray(entrada)) throw new Recusa(400, 'valores precisa ser { "coluna": valor }.');
  const cols = colunas.map(c => ({ ...c, id: Number(c.id), titulo: String(c.titulo ?? ''), tipo: String(c.tipo) }));
  const pessoa = await resolvedorDePessoas();
  return Object.entries(entrada as AnyRecord).map(([ref, v]) => {
    const coluna = colunaDoPedido(cols, ref);
    return { coluna, valor: valorDaEntrada(coluna, v, { pessoa }) };
  });
}

/** Grava os valores no item pelo caminho da tela e registra uma atividade por coluna que mudou. */
async function gravarValores(e: Escrita, itemId: number, colunas: AnyRecord[], mudancas: { coluna: AnyRecord; valor: unknown }[]) {
  const ctx = novoContexto(colunas as never, e.pessoa.uid);
  const feitos: AnyRecord[] = [];
  for (const m of mudancas) {
    const item = (await colecao('itens').doc(String(itemId)).get()).data()!;
    // Campo oficial só leitura vira 409 (a mensagem diz qual), em vez de erro interno.
    const mudou = await gravarValorDoItem(ctx, item, await lerItem(ctx, item), m.coluna as never, m.valor, e.pessoa.uid)
      .catch(err => { if (err instanceof Error && /só leitura/.test(err.message)) throw new Recusa(409, err.message); throw err; });
    if (mudou && mudou.de !== mudou.para) {
      await registrar(e, { quadro_id: item.quadro_id, item_id: itemId, item_nome: item.nome, acao: 'alterou', coluna_id: m.coluna.id, coluna_titulo: m.coluna.titulo, de: mudou.de, para: mudou.para });
    }
    feitos.push({ coluna: m.coluna.titulo, mudou: !!mudou, para: mudou?.para ?? null });
  }
  return feitos;
}

/** POST /itens/{id}/valor { coluna, valor, simular? }: grava uma célula (coluna pelo título ou id). */
async function escreverValor(e: Escrita, itemId: number, corpo: AnyRecord) {
  const item = await itemParaEscrever(e.pessoa, itemId);
  const colunas = (await doQuadro('colunas', Number(item.quadro_id))).filter(c => !c.excluido_em);
  if (!('coluna' in corpo)) throw new Recusa(400, 'Informe coluna e valor.');
  const [m] = await valoresDoPedido(colunas, { [String(corpo.coluna)]: corpo.valor });
  if (corpo.simular === true) return { simulado: true, item: itemId, coluna: m.coluna.titulo, gravaria: m.valor ?? null };
  return { item: itemId, gravado: await gravarValores(e, itemId, colunas, [m]) };
}

/** POST /quadros/{id}/itens { nome, grupo?, valores?, simular? }: cria um item (quadro oficial: vira registro, como na tela). */
async function criarItemPeloPedido(e: Escrita, quadroId: number, corpo: AnyRecord) {
  const l = leitor(e.pessoa);
  const q = await l.quadro(quadroId);
  if (!q || !podeVerQuadro(q, e.pessoa)) throw new Recusa(404, 'Quadro não encontrado.');
  if (q.tipo !== 'quadro' && q.tipo != null) throw new Recusa(400, 'Itens só em quadros (não em painel nem no quadro interno de subitens).');
  const nome = String(corpo.nome ?? '').trim().slice(0, 500);
  if (!nome) throw new Recusa(400, 'Informe nome.');
  const [colunas, grupos] = await Promise.all([doQuadro('colunas', quadroId), doQuadro('grupos', quadroId)]);
  const gruposVis = grupos.filter(visivel).sort(porPosicao);
  const grupo = corpo.grupo == null ? gruposVis[0]
    : gruposVis.find(g => String(g.id) === String(corpo.grupo)) ?? gruposVis.find(g => palavrasDaBusca(g.nome).join(' ') === palavrasDaBusca(corpo.grupo).join(' '));
  if (!grupo) throw new Recusa(400, corpo.grupo == null ? 'O quadro não tem grupo.' : `Grupo “${String(corpo.grupo)}” não existe (${gruposVis.map(g => g.nome).join(', ')}).`);
  const valores = await valoresDoPedido(colunas.filter(c => !c.excluido_em), corpo.valores);
  if (corpo.simular === true) return { simulado: true, quadro: quadroId, grupo: grupo.nome, nome, valores: Object.fromEntries(valores.map(v => [v.coluna.titulo, v.valor ?? null])) };
  const item = await criarItem({ quadro_id: quadroId, grupo_id: Number(grupo.id), nome, criado_por: e.pessoa.uid });
  await registrar(e, { quadro_id: quadroId, item_id: item.id, item_nome: nome, acao: 'criou' });
  await vincularSeOficial(quadroId, item.id, e.pessoa.uid);
  const gravado = await gravarValores(e, item.id, colunas.filter(c => !c.excluido_em), valores);
  return { item: item.id, nome, grupo: grupo.nome, gravado };
}

/** POST /itens/{id}/atualizacoes { texto }: publica uma atualização no item (menções como @{uid}). */
async function publicarAtualizacao(e: Escrita, itemId: number, corpo: AnyRecord) {
  const item = await itemParaEscrever(e.pessoa, itemId);
  const texto = String(corpo.texto ?? '').trim().slice(0, 5000);
  if (!texto) throw new Recusa(400, 'Informe texto.');
  const id = novoId();
  await colecao('atualizacoes').doc(String(id)).set({
    id, item_id: itemId, quadro_id: Number(item.quadro_id), texto, mencoes: mencoesDoTexto(texto), resposta_de: null, criado_em: dataLocal(), ...autorDaChave(e),
  });
  return { atualizacao: id, item: itemId };
}

export const fridayApi = onRequest({ region: REGIAO, timeoutSeconds: 120, memory: '512MiB', maxInstances: 2 }, async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') throw new Recusa(405, 'Use GET (consulta) ou POST (escrita).');
    const escrita = req.method === 'POST';
    const { pessoa, chaveId } = await pessoaDoPedido(req.get('x-friday-chave'), escrita);
    const partes = req.path.split('/').filter(Boolean);
    const corpo = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as AnyRecord) : {};
    const id = /^\d+$/.test(partes[1] ?? '') ? Number(partes[1]) : null;
    let r: unknown;
    if (!escrita && partes.length === 1 && partes[0] === 'eu') r = { ...(await eu(pessoa)), escrita: pessoa.escrita };
    else if (!escrita && partes.length === 1 && partes[0] === 'quadros') r = await listarQuadros(pessoa);
    else if (!escrita && partes.length === 2 && partes[0] === 'quadros' && id != null) r = await lerQuadro(pessoa, id);
    else if (!escrita && partes.length === 1 && partes[0] === 'buscar') r = await buscar(pessoa, req.query as AnyRecord);
    else if (escrita && partes.length === 3 && partes[0] === 'itens' && id != null && partes[2] === 'valor') r = await escreverValor({ pessoa, chaveId }, id, corpo);
    else if (escrita && partes.length === 3 && partes[0] === 'quadros' && id != null && partes[2] === 'itens') r = await criarItemPeloPedido({ pessoa, chaveId }, id, corpo);
    else if (escrita && partes.length === 3 && partes[0] === 'itens' && id != null && partes[2] === 'atualizacoes') r = await publicarAtualizacao({ pessoa, chaveId }, id, corpo);
    else throw new Recusa(404, 'Rota desconhecida. Consulta (GET): /eu, /quadros, /quadros/{id}, /buscar?q=. Escrita (POST): /itens/{id}/valor, /quadros/{id}/itens, /itens/{id}/atualizacoes.');
    logger.info('friday-api', { uid: pessoa.uid, chave: chaveId, metodo: req.method, rota: req.path, simular: corpo.simular === true });
    res.status(200).json(r);
  } catch (e) {
    const status = e instanceof Recusa ? e.status : e instanceof EntradaInvalida ? 400 : e instanceof HttpsError ? (STATUS_HTTPS[e.code] ?? 500) : 500;
    const mensagem = e instanceof Error ? e.message : String(e);
    logger[status >= 500 ? 'error' : 'warn']('friday-api', { rota: req.path, metodo: req.method, status, mensagem });
    res.status(status).json({ ok: false, erro: status >= 500 ? 'Erro interno.' : mensagem });
  }
});
