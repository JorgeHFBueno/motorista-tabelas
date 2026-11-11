// API do Friday para robôs e assistentes: consulta (GET) e, com chave de escrita, gravação (POST). Cada chave pertence a uma pessoa
// (friday-chaves-api/{sha256 da chave}: uid, nome, revogada_em) e enxerga exatamente o que essa pessoa vê na tela:
// quadros abertos, restritos em que ela está em "acesso" e, para adm2, todos. A chave é criada e revogada pelo adm2
// na tela "Chaves de API" do Friday; o banco guarda só o hash. Cabeçalho: `X-Friday-Chave: fri_...` (não usa
// Authorization: o Cloud Run tentaria validá-lo como token do Google). O Admin SDK não passa pelas Rules: a permissão
// de cada quadro é conferida aqui (podeVerQuadro), igual às Rules do Friday. POST /mcp expõe as mesmas rotas como
// ferramentas de MCP para o Claude Code e outros assistentes (protocolo em fridayMcp.ts).
// Contrato: The Manuscript, 02_APIS_FUNCTIONS/09_ROBOS_EXTERNOS_DE_OBRAS.md ("Leitura do Friday por chave").
import { HttpsError, onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getStorage } from 'firebase-admin/storage';
import { db } from './firebaseAdmin.js';
import { valorDoOficial, type CampoOficial } from './fridayCadastroConverter.js';
import { lerCaminho } from './fridayCadastrosExistentes.js';
import { calcular, type Coluna as ColunaFormula } from './fridayFormula.js';
import { gravarAnexo } from './fridayAnexosMonday.js';
import { criarItem, gravarValorDoItem, lerItem, novoContexto, subquadroDe, vincularSeOficial } from './fridayAutomacoes.js';
import { dataLocal, novoId } from './fridayMondayConverter.js';
import { conteudoDoArquivo, FERRAMENTAS, responderMcp } from './fridayMcp.js';
import {
  anexoLegivel, casaBusca, colunaDoPedido, EntradaInvalida, entradaDaCelula, formatoChave, hashChave, LIMITE_ENVIO, mencoesDoTexto, nomeDoEnvio, palavrasDaBusca,
  pessoaDaChave, podeVerQuadro, textoCelula, valorDaEntrada, valoresPorTitulo,
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
async function pessoaDoPedido(chave: unknown, escrita: boolean): Promise<{ pessoa: Pessoa; chaveId: string; marcarEscrita: () => Promise<unknown> }> {
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
  // MCP: um só POST para consulta e escrita; a última escrita é marcada por ferramenta de escrita.
  const marcarEscrita = () => ref.update({ ultima_escrita: dataLocal() }).catch(() => undefined);
  return { pessoa, chaveId: hash.slice(0, 12), marcarEscrita };
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

/**
 * POST /itens/{id}/subitens { nome, valores?, simular? }: cria um subitem no item, no quadro de subitens do quadro (criado
 * na primeira vez, com Responsável, Status e Data, como na tela). Valores pelas colunas do quadro de subitens.
 */
async function criarSubitemPeloPedido(e: Escrita, paiId: number, corpo: AnyRecord) {
  const pai = await itemParaEscrever(e.pessoa, paiId);
  if (pai.item_pai_id != null) throw new Recusa(400, 'Subitem não tem subitens: use o item principal.');
  const quadro = (await colecao('quadros').doc(String(pai.quadro_id)).get()).data();
  if (!quadro || (quadro.tipo != null && quadro.tipo !== 'quadro')) throw new Recusa(400, 'Subitens só nos itens de um quadro.');
  const nome = String(corpo.nome ?? '').trim().slice(0, 500);
  if (!nome) throw new Recusa(400, 'Informe nome.');
  if (corpo.simular === true) {
    const sub = (await colecao('quadros').where('quadro_pai_id', '==', Number(quadro.id)).where('tipo', '==', 'subitens').get()).docs.map(d => d.data())
      .sort(porPosicao)[0];
    const valores = sub ? await valoresDoPedido((await doQuadro('colunas', Number(sub.id))).filter(c => !c.excluido_em), corpo.valores) : [];
    return {
      simulado: true, item: paiId, nome, valores: Object.fromEntries(valores.map(v => [v.coluna.titulo, v.valor ?? null])),
      ...(sub ? {} : { aviso: 'O quadro ainda não tem subitens: o quadro de subitens será criado (colunas Responsável, Status e Data) e os valores, conferidos nele.' }),
    };
  }
  const { quadroId: subId, grupoId } = await subquadroDe(quadro);
  const colunas = (await doQuadro('colunas', subId)).filter(c => !c.excluido_em);
  const valores = await valoresDoPedido(colunas, corpo.valores);
  const novo = await criarItem({ quadro_id: subId, grupo_id: grupoId, item_pai_id: paiId, nome, criado_por: e.pessoa.uid });
  await registrar(e, { quadro_id: subId, item_id: novo.id, item_nome: nome, acao: 'criou' });
  await vincularSeOficial(subId, novo.id, e.pessoa.uid);
  const gravado = await gravarValores(e, novo.id, colunas, valores);
  return { subitem: novo.id, nome, item: paiId, gravado };
}

// ---------------------------------------------------------------- arquivos (anexos do item)
/** GET /itens/{id}/arquivos: arquivos do item (colunas de arquivos, atualizações e aba Arquivos), com o link de download. */
async function listarArquivos(p: Pessoa, itemId: number) {
  const item = await itemParaEscrever(p, itemId);
  const [anexos, colunas] = await Promise.all([colecao('anexos').where('item_id', '==', itemId).get(), doQuadro('colunas', Number(item.quadro_id))]);
  const titulo = new Map(colunas.map(c => [Number(c.id), String(c.titulo ?? '')]));
  return {
    item: itemId,
    arquivos: anexos.docs.map(d => d.data()).sort((a, b) => Number(a.id) - Number(b.id)).map(a => anexoLegivel(a, id => titulo.get(id) ?? null)),
  };
}

/** GET /arquivos/{id}: o conteúdo do arquivo, para quem tem só a chave (o item precisa estar num quadro que a pessoa vê). */
async function baixarArquivo(p: Pessoa, anexoId: number) {
  const a = (await colecao('anexos').doc(String(anexoId)).get()).data();
  if (!a?.arquivo) throw new Recusa(404, 'Arquivo não encontrado.');
  await itemParaEscrever(p, Number(a.item_id)).catch(() => { throw new Recusa(404, 'Arquivo não encontrado.'); });
  const [dados] = await getStorage().bucket().file(String(a.arquivo)).download().catch(() => { throw new Recusa(404, 'Arquivo não encontrado no armazenamento.'); });
  return { dados, mime: String(a.mime ?? 'application/octet-stream'), nome: String(a.nome ?? 'arquivo') };
}

/**
 * POST /itens/{id}/arquivos?nome=arquivo.pdf[&coluna=Título][&simular=1], com o arquivo no corpo (até 25 MB): grava no
 * Storage e em friday-anexos, com a pessoa da chave e a marca da chave. Com coluna (de arquivos), entra também na célula
 * (com registro de atividade, como na tela); sem, fica na aba Arquivos do item.
 */
async function enviarArquivo(e: Escrita, itemId: number, consulta: AnyRecord, dados: Buffer | undefined, tipo: string | undefined) {
  const item = await itemParaEscrever(e.pessoa, itemId);
  const nome = nomeDoEnvio(consulta.nome);
  if (!dados?.length) throw new Recusa(400, 'Mande o conteúdo do arquivo no corpo do pedido.');
  if (dados.length > LIMITE_ENVIO) throw new Recusa(413, 'Arquivo maior que 25 MB.');
  const colunas = (await doQuadro('colunas', Number(item.quadro_id))).filter(c => !c.excluido_em);
  let coluna: AnyRecord | null = null;
  if (consulta.coluna != null && String(consulta.coluna).trim()) {
    coluna = colunaDoPedido(colunas.map(c => ({ ...c, id: Number(c.id), titulo: String(c.titulo ?? '') })), consulta.coluna);
    if (coluna.tipo !== 'arquivos') throw new Recusa(400, `“${coluna.titulo}” não é coluna de arquivos.`);
  }
  if (/^(1|true|sim)$/i.test(String(consulta.simular ?? ''))) return { simulado: true, item: itemId, nome, tamanho: dados.length, coluna: coluna?.titulo ?? null };
  const mime = tipo && !/^(application\/(json|x-www-form-urlencoded)|text\/plain|multipart\/)/i.test(tipo) ? tipo.split(';')[0].trim() : null;
  const anexo = await gravarAnexo(getStorage().bucket(), item as AnyRecord & { id: number }, nome, dados, mime,
    { atualizacao_id: null, coluna_id: coluna?.id ?? null, origem_id: null, ...autorDaChave(e) });
  let gravado: AnyRecord[] | undefined;
  if (coluna) {
    const atual = (await colecao('itens').doc(String(itemId)).get()).data()?.valores?.[String(coluna.id)];
    gravado = await gravarValores(e, itemId, colunas, [{ coluna, valor: [...(Array.isArray(atual) ? atual : []), entradaDaCelula(anexo)] }]);
  }
  return { item: itemId, arquivo: anexoLegivel(anexo, () => coluna?.titulo ?? null), ...(gravado ? { gravado } : {}) };
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

// ---------------------------------------------------------------- MCP (as rotas acima como ferramentas)
/** Ferramenta do MCP → a mesma função da rota (mesmas permissões, valores e registros). */
async function executarFerramenta(e: Escrita, nome: string, a: AnyRecord): Promise<unknown> {
  const numero = (campo: string) => {
    const n = Number(a[campo]);
    if (!Number.isSafeInteger(n) || n <= 0) throw new Recusa(400, `Informe ${campo} (o id, um número).`);
    return n;
  };
  switch (nome) {
    case 'quem_sou_eu': return { ...(await eu(e.pessoa)), escrita: !!e.pessoa.escrita };
    case 'listar_quadros': return listarQuadros(e.pessoa);
    case 'ler_quadro': return lerQuadro(e.pessoa, numero('quadro'));
    case 'buscar_itens': return buscar(e.pessoa, { q: a.texto, quadro: a.quadro, limite: a.limite });
    case 'listar_arquivos': return listarArquivos(e.pessoa, numero('item'));
    case 'baixar_arquivo': { const id = numero('arquivo'); return conteudoDoArquivo(id, await baixarArquivo(e.pessoa, id)); }
    case 'gravar_valor': return escreverValor(e, numero('item'), a);
    case 'criar_item': return criarItemPeloPedido(e, numero('quadro'), a);
    case 'criar_subitem': return criarSubitemPeloPedido(e, numero('item'), a);
    case 'publicar_atualizacao': return publicarAtualizacao(e, numero('item'), a);
    default: throw new Recusa(400, `Ferramenta desconhecida: ${nome}.`);
  }
}

const statusDoErro = (e: unknown) => e instanceof Recusa ? e.status : e instanceof EntradaInvalida ? 400 : e instanceof HttpsError ? (STATUS_HTTPS[e.code] ?? 500) : 500;

export const fridayApi = onRequest({ region: REGIAO, timeoutSeconds: 120, memory: '512MiB', maxInstances: 2 }, async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') throw new Recusa(405, 'Use GET (consulta) ou POST (escrita).');
    const partes = req.path.split('/').filter(Boolean);
    const mcp = partes.length === 1 && partes[0] === 'mcp';
    // MCP sem sessão: só POST (sem o canal GET de eventos, que o protocolo permite recusar com 405).
    if (mcp && req.method !== 'POST') throw new Recusa(405, 'O MCP usa POST.');
    const escrita = req.method === 'POST' && !mcp;
    const { pessoa, chaveId, marcarEscrita } = await pessoaDoPedido(req.get('x-friday-chave'), escrita);
    if (mcp) {
      const r = await responderMcp(req.body, {
        escrita: !!pessoa.escrita,
        executar: async (nome, args) => {
          const deEscrita = FERRAMENTAS.find(f => f.name === nome)?.escrita === true;
          if (deEscrita) await marcarEscrita();
          logger.info('friday-api', { uid: pessoa.uid, chave: chaveId, metodo: 'MCP', rota: req.path, ferramenta: nome, simular: args.simular === true });
          return executarFerramenta({ pessoa, chaveId }, nome, args);
        },
        mensagemDeErro: err => {
          const status = statusDoErro(err);
          const mensagem = err instanceof Error ? err.message : String(err);
          logger[status >= 500 ? 'error' : 'warn']('friday-api', { rota: req.path, metodo: 'MCP', status, mensagem });
          return status >= 500 ? 'Erro interno.' : mensagem;
        },
      });
      if (r === null) res.status(202).end(); else res.status(200).json(r);
      return;
    }
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
    else if (escrita && partes.length === 3 && partes[0] === 'itens' && id != null && partes[2] === 'subitens') r = await criarSubitemPeloPedido({ pessoa, chaveId }, id, corpo);
    else if (!escrita && partes.length === 3 && partes[0] === 'itens' && id != null && partes[2] === 'arquivos') r = await listarArquivos(pessoa, id);
    else if (escrita && partes.length === 3 && partes[0] === 'itens' && id != null && partes[2] === 'arquivos') {
      r = await enviarArquivo({ pessoa, chaveId }, id, req.query as AnyRecord, req.rawBody, req.get('content-type'));
    } else if (!escrita && partes.length === 2 && partes[0] === 'arquivos' && id != null) {
      // Download: o próprio arquivo, não JSON.
      const a = await baixarArquivo(pessoa, id);
      logger.info('friday-api', { uid: pessoa.uid, chave: chaveId, metodo: req.method, rota: req.path });
      res.status(200).set({ 'Content-Type': a.mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(a.nome)}` }).send(a.dados);
      return;
    } else {
      throw new Recusa(404, 'Rota desconhecida. Consulta (GET): /eu, /quadros, /quadros/{id}, /buscar?q=, /itens/{id}/arquivos, /arquivos/{id}. '
        + 'Escrita (POST): /itens/{id}/valor, /quadros/{id}/itens, /itens/{id}/subitens, /itens/{id}/atualizacoes, /itens/{id}/arquivos?nome=. '
        + 'MCP (POST): /mcp.');
    }
    logger.info('friday-api', { uid: pessoa.uid, chave: chaveId, metodo: req.method, rota: req.path, simular: corpo.simular === true || req.query.simular != null });
    res.status(200).json(r);
  } catch (e) {
    const status = statusDoErro(e);
    const mensagem = e instanceof Error ? e.message : String(e);
    logger[status >= 500 ? 'error' : 'warn']('friday-api', { rota: req.path, metodo: req.method, status, mensagem });
    res.status(status).json({ ok: false, erro: status >= 500 ? 'Erro interno.' : mensagem });
  }
});
