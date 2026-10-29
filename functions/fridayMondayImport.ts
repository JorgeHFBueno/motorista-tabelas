import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import type { Query } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { mondayApiToken, MONDAY_API_VERSION } from './mondayClient.js';
import {
  configDe, converterFormulaMonday, dataLocal, decidirItem, json, LARGURA_PADRAO, mesclarOpcoesLista, mesclarRotulosStatus,
  mesclarValores, novoId, ordenarGrupos, pessoasDosValores, prefixosBusca, quadrosDeSubitens, resolverLigacoes, tipoFriday, tituloColuna,
  valoresDoItem, type Alvo, type ColunaImportada, type MCol, type MItem,
} from './fridayMondayConverter.js';
import { gravarNoCadastro } from './fridayCadastros.js';
import { cadastroExistente, lerCaminho, novoRegistro, type CadastroExistente, type CampoExistente, type ChaveConciliacao } from './fridayCadastrosExistentes.js';
import { planejarAtualizacao, rotuloPorTexto, valoresNoTipoAtual, type ColunaDoQuadro, type Mudanca } from './fridayMondayOficial.js';

// Importação dos quadros do monday para o Friday (coleções friday-*), um quadro por chamada.
// Só lê o monday (nenhuma mutation). Grava pelo Admin SDK, então não depende das Rules; por isso a autorização
// (funcionário ativo com adm2) é verificada aqui. Repetir a importação de um quadro não duplica nada: cada registro
// guarda o id do monday em `origem_id`. Itens intocados no Friday são atualizados; editados no Friday, preservados.

type AnyRecord = Record<string, any>;
type Row = AnyRecord & { id: number };

const REGIAO = 'southamerica-east1';
const CORES = ['#00a36c', '#fdab3d', '#e2445c', '#579bfc', '#a25ddc', '#ff642e', '#037f4c', '#9cd326', '#cab641', '#ffcb00', '#0086c0', '#66ccff', '#bb3354', '#ff158a', '#ff5ac4', '#784bd1'];
const COR_PASTA: Record<string, string> = { DONE_GREEN: '#00c875', BRIGHT_BLUE: '#579bfc', DARK_RED: '#bb3354', SOFIA_PINK: '#ff158a', INDIGO: '#5559df', DARK_ORANGE: '#ff642e', BRIGHT_GREEN: '#9cd326', WORKING_ORANGE: '#fdab3d', STUCK_RED: '#e2445c', PURPLE: '#a25ddc' };

// ---------------------------------------------------------------- esquema do Friday (igual a src/features/friday-gestao-interna/api.ts)
const CAMPOS: Record<string, string[]> = {
  usuarios: ['id', 'uid', 'nome', 'papel', 'email', 'cor', 'origem_id', 'acesso', 'ativo', 'ultimo_acesso'],
  areas: ['id', 'nome', 'cor', 'posicao', 'origem_id', 'restrito'],
  pastas: ['id', 'area_id', 'pasta_pai_id', 'nome', 'cor', 'posicao', 'aberta', 'origem_id', 'restrito'],
  quadros: ['id', 'area_id', 'pasta_id', 'nome', 'descricao', 'posicao', 'favorito', 'nome_item', 'criado_em', 'tipo', 'quadro_pai_id', 'origem_id', 'arquivado_em', 'excluido_em', 'restrito'],
  grupos: ['id', 'quadro_id', 'nome', 'cor', 'posicao', 'recolhido', 'arquivado_em', 'excluido_em', 'origem_id'],
  colunas: ['id', 'quadro_id', 'titulo', 'tipo', 'config', 'largura', 'posicao', 'oculta', 'origem_id'],
  itens: ['id', 'quadro_id', 'grupo_id', 'item_pai_id', 'nome', 'posicao', 'valores', 'criado_por', 'criado_em', 'atualizado_em', 'origem_id', 'arquivado_em', 'excluido_em',
    'pessoas', 'busca', 'importado_em', 'monday_atualizado_em', 'ligacoes_pendentes'],
  visoes: ['id', 'quadro_id', 'nome', 'tipo', 'config', 'posicao'],
  atividades: ['id', 'quadro_id', 'item_id', 'item_nome', 'usuario_id', 'automacao_id', 'acao', 'coluna_id', 'coluna_titulo', 'de', 'para', 'criado_em'],
};
function padrao(r: string): AnyRecord {
  const t = dataLocal();
  const extra: Record<string, AnyRecord> = {
    usuarios: { acesso: 'membro', ativo: 1 },
    areas: { cor: '#1f4e8c', posicao: 0, restrito: 0 },
    pastas: { posicao: 0, aberta: 1, restrito: 0 },
    quadros: { posicao: 0, favorito: 0, nome_item: 'Item', criado_em: t, tipo: 'quadro', restrito: 0 },
    grupos: { cor: '#579bfc', posicao: 0, recolhido: 0 },
    colunas: { config: {}, largura: 140, posicao: 0, oculta: 0 },
    itens: { posicao: 0, valores: {}, criado_em: t, atualizado_em: t, pessoas: [], busca: [] },
    visoes: { config: {}, posicao: 0 },
    atividades: { criado_em: t },
  };
  return { ...Object.fromEntries(CAMPOS[r].map(c => [c, null])), ...extra[r] };
}
const colecao = (r: string) => db.collection(`friday-${r}`);
async function consultar(r: string, filtros: AnyRecord = {}): Promise<Row[]> {
  let q: Query = colecao(r);
  for (const [k, v] of Object.entries(filtros)) q = q.where(k, '==', v);
  return (await q.get()).docs.map(d => d.data() as Row);
}
async function inserir(r: string, dados: AnyRecord): Promise<Row> {
  const row = { ...padrao(r), ...dados, id: novoId() } as Row;
  await colecao(r).doc(String(row.id)).set(row);
  return row;
}
const maxPosicao = (rows: Row[]) => Math.max(0, ...rows.map(x => Number(x.posicao) || 0));
const visivel = (x: Row | undefined) => !!x && x.arquivado_em == null && x.excluido_em == null;

// ---------------------------------------------------------------- monday (somente leitura, com espera nos limites da API)
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));
async function gql(token: string, query: string, variables: AnyRecord = {}, tentativa = 1): Promise<AnyRecord> {
  if (/\bmutation\b/i.test(query.split('{')[0])) throw new Error('mutations não são permitidas');
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': MONDAY_API_VERSION }, body: JSON.stringify({ query, variables }),
  });
  const payload = await res.json().catch(() => ({})) as AnyRecord;
  const erros = payload.errors ?? (payload.error_message ? [{ message: payload.error_message, extensions: { code: payload.error_code } }] : null);
  if (res.status === 429 || erros?.some((e: AnyRecord) => /complexity|rate|limit/i.test(`${e.message} ${e.extensions?.code ?? ''}`))) {
    if (tentativa > 5) throw new Error('MONDAY_LIMITE: a API do monday continua limitando as consultas; tente de novo em alguns minutos.');
    const s = Math.min(60, Number(erros?.[0]?.extensions?.retry_in_seconds ?? res.headers.get('retry-after') ?? 20));
    await espera((s + 1) * 1000);
    return gql(token, query, variables, tentativa + 1);
  }
  if (!res.ok || erros?.length) throw new Error(`MONDAY_API: ${erros?.map((e: AnyRecord) => e.message).join('; ') || res.status}`);
  return payload.data;
}

const CAMPOS_ITEM = `
  id name created_at updated_at
  group { id }
  parent_item { id }
  column_values {
    id type text value
    ... on FormulaValue { display_value }
    ... on MirrorValue { display_value }
    ... on BoardRelationValue { linked_item_ids }
    ... on DependencyValue { linked_item_ids }
  }`;
const CAMPOS_QUADRO = 'id name description type board_folder_id updated_at items_count workspace { id name } groups { id title color position } columns { id title type settings_str }';

async function itensDoQuadro(token: string, boardId: string): Promise<MItem[]> {
  const itens: MItem[] = [];
  let d = await gql(token, `query ($b: [ID!]) { boards(ids: $b) { items_page(limit: 200) { cursor items { ${CAMPOS_ITEM} } } } }`, { b: [boardId] });
  let pagina = d.boards?.[0]?.items_page;
  if (!pagina) return itens;
  itens.push(...pagina.items);
  while (pagina.cursor) {
    d = await gql(token, `query ($c: String!) { next_items_page(cursor: $c, limit: 200) { cursor items { ${CAMPOS_ITEM} } } }`, { c: pagina.cursor });
    pagina = d.next_items_page;
    itens.push(...pagina.items);
  }
  return itens;
}

// ---------------------------------------------------------------- autorização
export async function exigirAdm2(uid: string | undefined, acao = 'importar do monday'): Promise<string> {
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
  const funcionario = await db.collection('funcionarios').doc(uid).get();
  const dados = funcionario.data();
  if (!funcionario.exists || dados?.ativo !== true || dados?.perfis?.adm2 !== true) throw new HttpsError('permission-denied', `Só adm2 pode ${acao}.`);
  return uid;
}
function tokenMonday(): string {
  const token = mondayApiToken.value();
  if (!token?.trim()) throw new HttpsError('failed-precondition', 'MONDAY_API_TOKEN ausente.');
  return token;
}

// ---------------------------------------------------------------- área, pastas e quadro
async function garantirArea(ws: { id: string | null; name: string } | null): Promise<number> {
  const origem = ws?.id ? String(ws.id) : 'principal';
  const [existente] = await consultar('areas', { origem_id: origem });
  if (existente) return existente.id;
  const todas = await consultar('areas');
  return (await inserir('areas', { nome: ws?.name || 'Principal', cor: CORES[todas.length % CORES.length], posicao: maxPosicao(todas) + 1, origem_id: origem })).id;
}

async function garantirPasta(token: string, folderId: string | null, areaId: number): Promise<number | null> {
  if (!folderId) return null;
  const [existente] = await consultar('pastas', { origem_id: String(folderId) });
  if (existente) return existente.id;
  // Sem conseguir ler a pasta, o quadro fica na raiz da área (não impede a importação).
  const f = await gql(token, 'query ($ids: [ID!]) { folders(ids: $ids) { id name color parent { id } } }', { ids: [folderId] })
    .then(d => d.folders?.[0], e => { logger.warn('friday-monday:pasta', { folderId, mensagem: String(e) }); return null; });
  if (!f) return null;
  const pai = f.parent?.id ? await garantirPasta(token, String(f.parent.id), areaId) : null;
  const irmas = await consultar('pastas', { area_id: areaId });
  return (await inserir('pastas', { area_id: areaId, pasta_pai_id: pai, nome: f.name, cor: f.color ? COR_PASTA[f.color] ?? null : null, posicao: maxPosicao(irmas) + 1, aberta: 0, origem_id: String(f.id) })).id;
}

async function garantirQuadro(board: AnyRecord, dados: AnyRecord): Promise<{ quadro: Row; criado: boolean }> {
  const [existente] = await consultar('quadros', { origem_id: String(board.id) });
  if (existente) return { quadro: existente, criado: false };
  const irmaos = dados.tipo === 'subitens' ? [] : await consultar('quadros', { area_id: dados.area_id });
  const quadro = await inserir('quadros', { nome: board.name, descricao: board.description || null, posicao: maxPosicao(irmaos) + 1, origem_id: String(board.id), ...dados });
  return { quadro, criado: true };
}

// ---------------------------------------------------------------- grupos e colunas
async function sincronizarGrupos(quadroId: number, grupos: AnyRecord[]): Promise<Map<string, number>> {
  const existentes = await consultar('grupos', { quadro_id: quadroId });
  const porOrigem = new Map(existentes.filter(g => g.origem_id).map(g => [String(g.origem_id), g.id]));
  let posicao = maxPosicao(existentes);
  for (const g of ordenarGrupos(grupos as { id: string; title: string; color: string; position: string }[])) {
    if (porOrigem.has(g.id)) continue;
    const row = await inserir('grupos', { quadro_id: quadroId, nome: g.title, cor: g.color || '#579bfc', posicao: ++posicao, origem_id: g.id });
    porOrigem.set(g.id, row.id);
  }
  return porOrigem;
}

/**
 * Cria as colunas que faltam e acrescenta rótulos/opções novos às existentes. Devolve as colunas importadas pelo id do
 * monday (com o título e o tipo que têm hoje no Friday). Sem `gravar` (prévia), só calcula: colunas novas ficam de fora
 * (listadas em `novas`) e as configurações mescladas ficam só em memória.
 */
async function sincronizarColunas(quadroId: number, colunas: MCol[], gravar = true) {
  const existentes = await consultar('colunas', { quadro_id: quadroId });
  const porOrigem = new Map(existentes.filter(c => c.origem_id).map(c => [String(c.origem_id), c]));
  const importadas = new Map<string, ColunaDoQuadro>();
  const novasFormulas: ColunaImportada[] = [];
  const novas: string[] = [];
  let posicao = maxPosicao(existentes);
  let ignoradas = 0;
  for (const c of colunas) {
    const tipo = tipoFriday(c.type);
    if (!tipo) { if (!['name', 'subtasks'].includes(c.type)) ignoradas++; continue; }
    const atual = porOrigem.get(c.id);
    if (!atual) {
      novas.push(tituloColuna(c));
      if (!gravar) continue;
      const config = configDe(c);
      if (c.type === 'dependency') config.quadro_id = quadroId;
      const row = await inserir('colunas', { quadro_id: quadroId, titulo: tituloColuna(c), tipo, config, largura: LARGURA_PADRAO[tipo] ?? 140, posicao: ++posicao, origem_id: c.id });
      const col = { id: row.id, tipoMonday: c.type, config, titulo: tituloColuna(c), tipo };
      importadas.set(c.id, col);
      if (c.type === 'formula') novasFormulas.push(col);
      continue;
    }
    let config = atual.config ?? {};
    // Só quando a coluna ainda tem o tipo de origem: convertida no Friday ("Mudar tipo…"), a configuração é outra.
    if (c.type === 'status' && atual.tipo === 'status') config = mesclarRotulosStatus(config, json(c.settings_str) ?? {});
    if (c.type === 'dropdown' && atual.tipo === 'lista') config = mesclarOpcoesLista(config, json(c.settings_str) ?? {});
    if (gravar && JSON.stringify(config) !== JSON.stringify(atual.config ?? {})) await colecao('colunas').doc(String(atual.id)).update({ config });
    importadas.set(c.id, { id: atual.id, tipoMonday: c.type, config: structuredClone(config), titulo: String(atual.titulo ?? ''), tipo: String(atual.tipo) });
  }
  // Fórmulas novas: ids das colunas do monday → ids do Friday (com todas as colunas do quadro já conhecidas).
  if (novasFormulas.length) {
    const mapa = new Map<string, Alvo>(colunas.map(c => [c.id, { id: importadas.get(c.id)?.id ?? null, tipoMonday: c.type }]));
    for (const col of novasFormulas) {
      col.config = { ...col.config, formula: converterFormulaMonday(String(col.config.formula_monday ?? ''), mapa) };
      await colecao('colunas').doc(String(col.id)).update({ config: col.config });
    }
  }
  const pessoaFriday = new Set([...existentes.filter(c => c.tipo === 'pessoa').map(c => String(c.id)), ...[...importadas.values()].filter(c => c.tipoMonday === 'people' || c.tipoMonday === 'person').map(c => String(c.id))]);
  return { importadas, ignoradas, colunasPessoa: pessoaFriday, novas };
}

// ---------------------------------------------------------------- itens
/** Itens do Friday já importados, pelo id do monday (consulta em lotes de 30). */
async function acharItensPorOrigem(ids: string[], cache: Map<string, number>) {
  const faltam = [...new Set(ids)].filter(id => !cache.has(id));
  for (let k = 0; k < faltam.length; k += 30) {
    const snap = await colecao('itens').where('origem_id', 'in', faltam.slice(k, k + 30)).get();
    for (const d of snap.docs) cache.set(String(d.data().origem_id), Number(d.data().id));
  }
}

type Contagem = { criados: number; atualizados: number; iguais: number; preservados: number; ignorados: number };
async function sincronizarItens(p: {
  quadroId: number; itens: MItem[]; grupos: Map<string, number>; grupoPadrao: () => Promise<number>;
  colunas: Map<string, ColunaImportada>; colunasPessoa: Set<string>;
  itemPorOrigem: Map<string, number>; subitens: boolean;
}): Promise<Contagem> {
  const c: Contagem = { criados: 0, atualizados: 0, iguais: 0, preservados: 0, ignorados: 0 };
  const existentes = await consultar('itens', { quadro_id: p.quadroId });
  const porOrigem = new Map(existentes.filter(i => i.origem_id).map(i => [String(i.origem_id), i]));
  const ultimaPosicao = new Map<number, number>();
  for (const i of existentes) ultimaPosicao.set(Number(i.grupo_id), Math.max(ultimaPosicao.get(Number(i.grupo_id)) ?? 0, Number(i.posicao) || 0));
  // 1ª passada: id de cada item (existente ou novo), para que ligações entre itens do mesmo quadro já se resolvam.
  const idNovo = new Map<string, number>();
  for (const it of p.itens) {
    const existente = porOrigem.get(it.id);
    if (existente) p.itemPorOrigem.set(it.id, existente.id);
    else { const id = novoId(); idNovo.set(it.id, id); p.itemPorOrigem.set(it.id, id); }
  }
  const ligados = p.itens.flatMap(it => it.column_values.flatMap(cv => cv.linked_item_ids ?? []).map(String));
  await acharItensPorOrigem(ligados, p.itemPorOrigem);

  const colunasAlteradas = new Set<number>();
  const tag = (col: ColunaImportada, nome: string) => {
    const opcoes = (col.config.opcoes ??= []) as { id: string; texto: string; cor: string }[];
    let op = opcoes.find(o => o.texto === nome);
    if (!op) { op = { id: String(opcoes.length + 1), texto: nome, cor: '#c4c4c4' }; opcoes.push(op); colunasAlteradas.add(col.id); }
    return op.id;
  };
  const importadas = [...p.colunas.values()].map(col => col.id);
  const escrita = db.bulkWriter();
  for (const it of p.itens) {
    const existente = porOrigem.get(it.id);
    const decisao = decidirItem(existente, it.updated_at);
    if (decisao === 'igual') { c.iguais++; continue; }
    if (decisao === 'preservar') { c.preservados++; continue; }
    const itemPaiId = p.subitens ? p.itemPorOrigem.get(String(it.parent_item?.id ?? '')) ?? null : null;
    if (p.subitens && itemPaiId == null) { c.ignorados++; continue; } // subitem de item não importado
    const conv = valoresDoItem(it, p.colunas, { tag });
    const lig = resolverLigacoes(conv.ligacoes, id => p.itemPorOrigem.get(id));
    const marca = dataLocal(it.updated_at);
    const grupoId = (it.group && p.grupos.get(it.group.id)) ?? await p.grupoPadrao();
    if (decisao === 'criar') {
      const valores = { ...conv.valores, ...lig.valores };
      const posicao = (ultimaPosicao.get(grupoId) ?? 0) + 1;
      ultimaPosicao.set(grupoId, posicao);
      const id = idNovo.get(it.id)!;
      void escrita.set(colecao('itens').doc(String(id)), {
        ...padrao('itens'), id, quadro_id: p.quadroId, grupo_id: grupoId, item_pai_id: itemPaiId, nome: String(it.name ?? '').slice(0, 500) || 'Sem nome',
        posicao, valores, criado_em: dataLocal(it.created_at), atualizado_em: marca, importado_em: marca, monday_atualizado_em: it.updated_at,
        origem_id: it.id, busca: prefixosBusca(it.name), pessoas: pessoasDosValores(valores, p.colunasPessoa), ligacoes_pendentes: lig.pendentes,
      });
      c.criados++;
    } else {
      const valores = mesclarValores(existente!.valores, { ...conv.valores, ...lig.valores }, importadas);
      void escrita.update(colecao('itens').doc(String(existente!.id)), {
        nome: String(it.name ?? '').slice(0, 500) || 'Sem nome', grupo_id: grupoId, item_pai_id: p.subitens ? itemPaiId : existente!.item_pai_id ?? null, valores,
        atualizado_em: marca, importado_em: marca, monday_atualizado_em: it.updated_at,
        busca: prefixosBusca(it.name), pessoas: pessoasDosValores(valores, p.colunasPessoa), ligacoes_pendentes: lig.pendentes,
      });
      c.atualizados++;
    }
  }
  for (const col of p.colunas.values()) if (colunasAlteradas.has(col.id)) void escrita.update(colecao('colunas').doc(String(col.id)), { config: col.config });
  await escrita.close();
  return c;
}

/** Ligações que apontavam para itens de quadros ainda não importados: resolve as que já podem ser resolvidas. */
async function resolverPendentes(cache: Map<string, number>): Promise<number> {
  const snap = await colecao('itens').where('ligacoes_pendentes', '!=', null).limit(2000).get();
  if (snap.empty) return 0;
  const pendentes = snap.docs.map(d => d.data() as Row);
  await acharItensPorOrigem(pendentes.flatMap(i => Object.values(i.ligacoes_pendentes ?? {}).flat().map(String)), cache);
  const escrita = db.bulkWriter();
  let resolvidas = 0;
  for (const item of pendentes) {
    const lig = resolverLigacoes(item.ligacoes_pendentes ?? {}, id => cache.get(id));
    if (!Object.keys(lig.valores).length) continue;
    const valores = { ...(item.valores ?? {}) };
    for (const [col, ids] of Object.entries(lig.valores)) valores[col] = [...new Set([...((valores[col] ?? []) as number[]), ...ids])];
    // Completa a importação: não conta como edição no Friday (atualizado_em não muda).
    void escrita.update(colecao('itens').doc(String(item.id)), { valores, ligacoes_pendentes: lig.pendentes });
    resolvidas++;
  }
  await escrita.close();
  // Colunas "conectar quadros" cujo quadro de destino ainda não tinha sido importado.
  const colunas = (await consultar('colunas', { tipo: 'ligacao' })).filter(c => c.config?.quadro_id == null && c.config?.origem_quadros?.length);
  for (const c of colunas) {
    const [alvo] = await colecao('quadros').where('origem_id', 'in', c.config.origem_quadros.slice(0, 30)).limit(1).get().then(s => s.docs.map(d => d.data() as Row));
    if (alvo) await colecao('colunas').doc(String(c.id)).update({ config: { ...c.config, quadro_id: alvo.id } });
  }
  return resolvidas;
}

// ---------------------------------------------------------------- reimportação de um quadro oficial (cadastro existente)
type ParteOficial = { novos: string[]; alterados: { nome: string; mudancas: Mudanca[] }[]; iguais: number; sumidos: string[]; colunas_novas: string[] };
type Acao = () => Promise<void>;

/**
 * Plano de uma parte do quadro oficial (os itens ou os subitens) e as gravações dele. Na prévia, nada é gravado: as
 * colunas novas só são listadas e os rótulos novos ficam em memória. Na gravação, as gravações voltam em `acoes`, para
 * rodar depois de salvar as configurações das colunas (a gravação no cadastro lê os rótulos da coluna).
 */
async function planejarParteOficial(p: {
  quadroId: number; boardCols: MCol[]; itens: MItem[]; registro: AnyRecord; cadastro: CadastroExistente; sub: boolean; aplicar: boolean; uid: string;
  grupos: Map<string, number>; grupoPadrao: () => Promise<number>; nomesGrupos: Map<number, string>; itemPorOrigem: Map<string, number>; recusados: string[];
  /** Nome de cada item do quadro principal pelo id do Friday (inclusive os novos), para os rótulos dos subitens. */
  nomes: Map<number, string>;
}) {
  const campos = ((p.sub ? p.registro.subitens?.campos : p.registro.campos) ?? []).filter((c: CampoExistente) => c.situacao === 'ativo' && !c.secundario) as CampoExistente[];
  const ligadas = new Set(campos.map(c => Number(c.coluna_id)));
  const subChave = p.sub ? String(p.registro.subitens.chave) : null;
  const { importadas: colunas, colunasPessoa, novas } = await sincronizarColunas(p.quadroId, p.boardCols, p.aplicar);
  const alteradas = new Set<number>();
  const tag = (col: ColunaImportada, nome: string) => {
    const opcoes = (col.config.opcoes ??= []) as { id: string; texto: string; cor: string }[];
    let op = opcoes.find(o => o.texto === nome);
    if (!op) { op = { id: String(opcoes.length + 1), texto: nome, cor: '#c4c4c4' }; opcoes.push(op); alteradas.add(col.id); }
    return op.id;
  };
  const ctx = { tag, rotulo: rotuloPorTexto(alteradas) };
  const existentes = await consultar('itens', { quadro_id: p.quadroId });
  const porOrigem = new Map(existentes.filter(i => i.origem_id).map(i => [String(i.origem_id), i]));
  if (!p.sub) for (const i of existentes) p.nomes.set(Number(i.id), String(i.nome ?? ''));
  // Documentos do cadastro dos itens ligados (o do item pai, nos subitens).
  const docs = new Map<string, AnyRecord>();
  const ids = [...new Set(existentes.filter(i => i.vinculo?.cadastro === p.registro.chave).map(i => String(i.vinculo.id)))];
  for (let k = 0; k < ids.length; k += 100) {
    for (const s of await db.getAll(...ids.slice(k, k + 100).map(id => db.collection(String(p.registro.colecao)).doc(id)))) if (s.exists) docs.set(s.id, s.data()!);
  }
  const parte: ParteOficial = { novos: [], alterados: [], iguais: 0, sumidos: [], colunas_novas: novas };
  const importadasLivres = [...colunas.values()].map(c => c.id).filter(id => !ligadas.has(id));
  const acoes: Acao[] = [];
  const vincular: { id: number; nome: string }[] = [];
  const ultimaPosicao = new Map<number, number>();
  for (const i of existentes) ultimaPosicao.set(Number(i.grupo_id), Math.max(ultimaPosicao.get(Number(i.grupo_id)) ?? 0, Number(i.posicao) || 0));
  const nomeTravado = !p.sub && Array.isArray(p.registro.nome_espelho) && p.registro.nome_espelho.length > 0;
  const chave = p.registro.conciliacao as ChaveConciliacao | undefined;

  for (const it of p.itens) {
    const nome = String(it.name ?? '').slice(0, 500).trim() || 'Sem nome';
    const paiId = p.sub ? p.itemPorOrigem.get(String(it.parent_item?.id ?? '')) ?? null : null;
    const rotulo = p.sub ? `${paiId != null ? p.nomes.get(paiId) ?? '?' : '?'} › ${nome}` : nome;
    const existente = porOrigem.get(it.id);
    const marca = dataLocal(it.updated_at);
    if (!existente) {
      if (p.sub && paiId == null) continue; // subitem de item não importado
      const conv = valoresNoTipoAtual(it, colunas, ctx);
      let aviso = '';
      if (!p.sub && p.cadastro.cria_registro && chave) {
        const novo = novoRegistro(p.cadastro, campos, { id: 0, nome, valores: conv.valores }, chave);
        const valorChave = lerCaminho(novo.doc, chave.caminho);
        if (novo.erros.length) aviso = ` (fica fora do cadastro: ${novo.erros.join(' ')})`;
        else if (valorChave != null && valorChave !== '' && !(await db.collection(String(p.registro.colecao)).where(chave.caminho, '==', valorChave).limit(1).get()).empty) {
          aviso = ` (fica fora do cadastro: já existe "${String(valorChave)}")`;
        }
      }
      parte.novos.push(rotulo + aviso);
      const id = novoId();
      p.itemPorOrigem.set(it.id, id);
      if (!p.sub) p.nomes.set(id, nome);
      if (!p.aplicar) continue;
      const grupoId = p.sub ? await p.grupoPadrao() : (it.group && p.grupos.get(it.group.id)) ?? await p.grupoPadrao();
      const posicao = (ultimaPosicao.get(grupoId) ?? 0) + 1;
      ultimaPosicao.set(grupoId, posicao);
      acoes.push(async () => {
        const lig = resolverLigacoes(conv.ligacoes, x => p.itemPorOrigem.get(x));
        const valores = { ...conv.valores, ...lig.valores };
        await colecao('itens').doc(String(id)).set({
          ...padrao('itens'), id, quadro_id: p.quadroId, grupo_id: grupoId, item_pai_id: paiId, nome, posicao, valores,
          criado_em: dataLocal(it.created_at), atualizado_em: marca, importado_em: marca, monday_atualizado_em: it.updated_at,
          origem_id: it.id, busca: prefixosBusca(nome), pessoas: pessoasDosValores(valores, colunasPessoa), ligacoes_pendentes: lig.pendentes,
        });
      });
      vincular.push({ id, nome: rotulo });
      continue;
    }
    p.itemPorOrigem.set(it.id, Number(existente.id));
    if (existente.monday_atualizado_em === it.updated_at) { parte.iguais++; continue; }
    const ligado = existente.vinculo?.cadastro === p.registro.chave;
    const doc = ligado ? docs.get(String(existente.vinculo.id)) : undefined;
    const oficial = ligado && p.sub ? doc?.[subChave!]?.[String(existente.vinculo.sub)] : doc;
    const grupoId = p.sub ? null : (it.group && p.grupos.get(it.group.id)) ?? null;
    const plano = planejarAtualizacao({
      item: it, existente, colunas, campos: ligado ? campos : [], oficial, nomeTravado, grupoId,
      nomeDoGrupo: g => (g == null ? '—' : p.nomesGrupos.get(Number(g)) ?? String(g)), ctx,
    });
    if (plano.mudancas.length) parte.alterados.push({ nome: rotulo, mudancas: plano.mudancas });
    else parte.iguais++;
    for (const m of plano.mudancas) if (m.recusa) p.recusados.push(`${rotulo} › ${m.coluna}: ${m.recusa}`);
    if (!p.aplicar) continue;
    const ligacoes = valoresNoTipoAtual(it, colunas, ctx).ligacoes;
    acoes.push(async () => {
      // 1) Campos ligados no cadastro (validação da tela); 2) o item, que dispara o recálculo da situação com o
      // documento já atualizado; 3) o nome, que a gravação lê do item.
      for (const l of plano.ligados) {
        try { await gravarNoCadastro(p.uid, Number(existente.id), 'valor', l.coluna_id, l.valor); }
        catch (e) { p.recusados.push(`${rotulo} › ${l.titulo}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      const lig = resolverLigacoes(ligacoes, x => p.itemPorOrigem.get(x));
      const valores = mesclarValores(existente.valores, { ...plano.livres, ...lig.valores }, importadasLivres);
      await colecao('itens').doc(String(existente.id)).update({
        ...(plano.nome ? { nome: plano.nome, busca: prefixosBusca(plano.nome) } : {}), ...(plano.grupo_id != null ? { grupo_id: plano.grupo_id } : {}),
        valores, atualizado_em: marca, importado_em: marca, monday_atualizado_em: it.updated_at,
        pessoas: pessoasDosValores(valores, colunasPessoa), ligacoes_pendentes: lig.pendentes,
      });
      if (plano.nome && ligado) {
        try { await gravarNoCadastro(p.uid, Number(existente.id), 'nome', null, null); }
        catch (e) { p.recusados.push(`${rotulo} › Nome: ${e instanceof Error ? e.message : String(e)}`); }
      }
    });
  }
  // Itens importados do monday que não vieram (arquivados ou apagados lá): só listados.
  const vindos = new Set(p.itens.map(i => String(i.id)));
  parte.sumidos = existentes.filter(i => visivel(i) && i.origem_id && !vindos.has(String(i.origem_id)))
    .map(i => (p.sub ? `${p.nomes.get(Number(i.item_pai_id)) ?? '?'} › ${i.nome}` : String(i.nome)));
  const gravar = async () => {
    for (const id of alteradas) {
      const col = [...colunas.values()].find(c => c.id === id);
      if (col) await colecao('colunas').doc(String(id)).update({ config: col.config });
    }
    for (const a of acoes) await a();
    // Itens novos viram registros do cadastro (ou entradas do item pai), pela mesma gravação do quadro.
    for (const v of vincular) {
      try { await gravarNoCadastro(p.uid, v.id, 'vincular', null, null); }
      catch (e) { p.recusados.push(`${v.nome}: ${e instanceof Error ? e.message : String(e)}`); }
    }
  };
  return { parte, gravar };
}

/**
 * Quadro oficial ligado a um cadastro existente (ex.: GESTÃO DE OBRAS → obras-v2). Prévia: o que mudaria, sem gravar
 * nada. Gravação: o monday vale para o que mudou lá desde a última importação (ver fridayMondayOficial.ts).
 */
async function reimportarOficial(token: string, board: AnyRecord, quadro: Row, uid: string, modo: 'previa' | 'aplicar') {
  const registro = (await db.collection('friday-cadastros').doc(String(quadro.cadastro)).get()).data();
  const cadastro = registro?.modo === 'existente' && registro.situacao === 'ativo' ? cadastroExistente(registro.colecao) : undefined;
  if (!registro || !cadastro) throw new HttpsError('failed-precondition', `O quadro "${quadro.nome}" é um cadastro oficial novo (${quadro.cadastro}); só os ligados a um cadastro existente podem ser atualizados do monday.`);
  const aplicar = modo === 'aplicar';
  const recusados: string[] = [];
  const itemPorOrigem = new Map<string, number>();
  const gruposAntes = await consultar('grupos', { quadro_id: quadro.id });
  const grupos = aplicar ? await sincronizarGrupos(quadro.id, board.groups ?? [])
    : new Map(gruposAntes.filter(g => g.origem_id).map(g => [String(g.origem_id), Number(g.id)]));
  const gruposNovos = ordenarGrupos((board.groups ?? []) as { id: string; title: string; color: string; position: string }[])
    .filter(g => !gruposAntes.some(x => String(x.origem_id) === g.id)).map(g => g.title);
  const nomesGrupos = new Map((aplicar ? await consultar('grupos', { quadro_id: quadro.id }) : gruposAntes).map(g => [Number(g.id), String(g.nome ?? '')]));
  const primeiroGrupo = async () => {
    const lista = (await consultar('grupos', { quadro_id: quadro.id })).filter(visivel).sort((a, b) => a.posicao - b.posicao);
    return lista[0]?.id ?? (await inserir('grupos', { quadro_id: quadro.id, nome: 'Itens', cor: '#579bfc', posicao: 1 })).id;
  };
  const comum = { registro, cadastro, aplicar, uid, nomesGrupos, itemPorOrigem, recusados, nomes: new Map<number, string>() };
  const principal = await planejarParteOficial({ ...comum, quadroId: quadro.id, boardCols: board.columns ?? [], itens: await itensDoQuadro(token, String(board.id)), sub: false, grupos, grupoPadrao: primeiroGrupo });
  if (aplicar) await principal.gravar();

  // Subitens oficiais (ex.: LOTEs): o quadro interno de subitens do quadro.
  let subitens: ParteOficial | null = null;
  const subOficial = registro.subitens?.situacao === 'ativo' ? Number(registro.subitens.quadro_id) : null;
  for (const subId of quadrosDeSubitens(board.columns ?? [])) {
    const d = await gql(token, `query ($b: [ID!]) { boards(ids: $b) { ${CAMPOS_QUADRO} } }`, { b: [subId] });
    const subBoard = d.boards?.[0];
    const [subQuadro] = await consultar('quadros', { origem_id: String(subId) });
    if (!subBoard || !subQuadro || Number(subQuadro.id) !== subOficial) continue;
    const grupoSub = async () => {
      const lista = (await consultar('grupos', { quadro_id: subQuadro.id })).filter(visivel).sort((a, b) => a.posicao - b.posicao);
      return lista[0]?.id ?? (await inserir('grupos', { quadro_id: subQuadro.id, nome: 'Subitens', cor: '#579bfc', posicao: 1 })).id;
    };
    const s = await planejarParteOficial({ ...comum, quadroId: subQuadro.id, boardCols: subBoard.columns ?? [], itens: await itensDoQuadro(token, subId), sub: true, grupos: new Map(), grupoPadrao: grupoSub });
    if (aplicar) await s.gravar();
    subitens = s.parte;
  }
  const resultado = {
    oficial: true, modo, board_id: String(board.id), nome: board.name, quadro_id: quadro.id, cadastro: String(quadro.cadastro), colecao: String(registro.colecao),
    itens: principal.parte, subitens, grupos_novos: gruposNovos, recusados,
  };
  if (!aplicar) return resultado;
  const ligacoesResolvidas = await resolverPendentes(itemPorOrigem);
  const contar = (x: ParteOficial | null) => (x ? `${x.novos.length} novos, ${x.alterados.length} alterados` : '');
  await inserir('atividades', {
    quadro_id: quadro.id, usuario_id: uid, acao: 'importou',
    para: `do monday (o monday vale): ${contar(principal.parte)}${subitens ? `; subitens: ${contar(subitens)}` : ''}${recusados.length ? `; ${recusados.length} valor(es) recusado(s)` : ''}`,
  });
  await colecao('importacoes').doc(String(board.id)).set({
    board_id: String(board.id), nome: board.name, quadro_id: quadro.id, quadro_criado: false, itens_monday: null, oficial: true,
    criados: principal.parte.novos.length, atualizados: principal.parte.alterados.length, iguais: principal.parte.iguais, preservados: 0, ignorados: 0,
    recusados, ligacoes_resolvidas: ligacoesResolvidas, situacao: 'ok', mensagem: null, importado_em: dataLocal(), monday_atualizado_em: board.updated_at ?? null, por_uid: uid,
  });
  return { ...resultado, ligacoes_resolvidas: ligacoesResolvidas };
}

// ---------------------------------------------------------------- importação de um quadro
async function importarQuadro(token: string, boardId: string, uid: string, modo: 'previa' | 'aplicar' | null = null) {
  const { boards } = await gql(token, `query ($b: [ID!]) { boards(ids: $b) { ${CAMPOS_QUADRO} } }`, { b: [boardId] });
  const board = boards?.[0];
  if (!board) throw new HttpsError('not-found', 'Quadro não encontrado no monday (ou sem acesso pelo token).');
  if (board.type !== 'board') throw new HttpsError('invalid-argument', 'Só quadros comuns podem ser importados.');

  const areaId = await garantirArea(board.workspace ?? null);
  const pastaId = await garantirPasta(token, board.board_folder_id ? String(board.board_folder_id) : null, areaId);
  const { quadro, criado } = await garantirQuadro(board, { area_id: areaId, pasta_id: pastaId, tipo: 'quadro', nome_item: 'Item' });
  // Quadro que virou cadastro oficial: os valores oficiais não vivem mais no quadro. Atualiza só com prévia antes
  // ("previa", depois "aplicar"), pela reimportação oficial; a importação em lote não mexe nele.
  if (quadro.cadastro) {
    if (!modo) throw new HttpsError('failed-precondition', `O quadro "${quadro.nome}" é um cadastro oficial (${quadro.cadastro}): atualize pelo botão "Prévia e atualizar" dele.`);
    return reimportarOficial(token, board, quadro, uid, modo);
  }
  if (modo) throw new HttpsError('invalid-argument', 'A prévia é só para quadros oficiais.');

  const grupos = await sincronizarGrupos(quadro.id, board.groups ?? []);
  const { importadas: colunas, ignoradas, colunasPessoa } = await sincronizarColunas(quadro.id, board.columns ?? []);
  if (criado) {
    await inserir('visoes', { quadro_id: quadro.id, nome: 'Tabela principal', tipo: 'tabela', posicao: 1 });
    const periodo = [...colunas.values()].find(c => c.tipoMonday === 'timeline');
    if (periodo) await inserir('visoes', { quadro_id: quadro.id, nome: 'Cronograma', tipo: 'cronograma', posicao: 2, config: { coluna_id: periodo.id } });
  }
  const primeiroGrupo = async () => {
    const lista = (await consultar('grupos', { quadro_id: quadro.id })).filter(visivel).sort((a, b) => a.posicao - b.posicao);
    return lista[0]?.id ?? (await inserir('grupos', { quadro_id: quadro.id, nome: 'Itens', cor: '#579bfc', posicao: 1 })).id;
  };
  const itemPorOrigem = new Map<string, number>();
  const itens = await itensDoQuadro(token, boardId);
  const principal = await sincronizarItens({ quadroId: quadro.id, itens, grupos, grupoPadrao: primeiroGrupo, colunas, colunasPessoa, itemPorOrigem, subitens: false });

  // Subitens: quadro interno "subitens" com colunas próprias e um grupo só.
  const sub: Contagem = { criados: 0, atualizados: 0, iguais: 0, preservados: 0, ignorados: 0 };
  for (const subId of quadrosDeSubitens(board.columns ?? [])) {
    const d = await gql(token, `query ($b: [ID!]) { boards(ids: $b) { ${CAMPOS_QUADRO} } }`, { b: [subId] });
    const subBoard = d.boards?.[0];
    if (!subBoard) continue;
    const { quadro: subQuadro } = await garantirQuadro(subBoard, { area_id: areaId, pasta_id: null, tipo: 'subitens', quadro_pai_id: quadro.id, nome_item: 'Subitem', nome: `Subitens de ${board.name}` });
    const subColunas = await sincronizarColunas(subQuadro.id, subBoard.columns ?? []);
    const grupoSub = async () => {
      const lista = (await consultar('grupos', { quadro_id: subQuadro.id })).filter(visivel).sort((a, b) => a.posicao - b.posicao);
      return lista[0]?.id ?? (await inserir('grupos', { quadro_id: subQuadro.id, nome: 'Subitens', cor: '#579bfc', posicao: 1 })).id;
    };
    const c = await sincronizarItens({
      quadroId: subQuadro.id, itens: await itensDoQuadro(token, subId), grupos: new Map(), grupoPadrao: grupoSub,
      colunas: subColunas.importadas, colunasPessoa: subColunas.colunasPessoa, itemPorOrigem, subitens: true,
    });
    for (const k of Object.keys(sub) as (keyof Contagem)[]) sub[k] += c[k];
  }
  const ligacoesResolvidas = await resolverPendentes(itemPorOrigem);
  const resultado = {
    board_id: String(board.id), nome: board.name, quadro_id: quadro.id, quadro_criado: criado, itens_monday: itens.length,
    ...principal, subitens: sub, colunas_ignoradas: ignoradas, ligacoes_resolvidas: ligacoesResolvidas,
  };
  await inserir('atividades', {
    quadro_id: quadro.id, usuario_id: uid, acao: 'importou',
    para: `do monday: ${principal.criados} novos, ${principal.atualizados} atualizados, ${principal.preservados} preservados (editados no Friday)`,
  });
  await colecao('importacoes').doc(String(board.id)).set({ ...resultado, situacao: 'ok', mensagem: null, importado_em: dataLocal(), monday_atualizado_em: board.updated_at ?? null, por_uid: uid });
  return resultado;
}

// ---------------------------------------------------------------- Functions
/** Quadros que o token do monday enxerga, com a situação de cada um no Friday. */
export const fridayMondayInventario = onCall({ region: REGIAO, secrets: [mondayApiToken], timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  await exigirAdm2(request.auth?.uid);
  const token = tokenMonday();
  try {
    return await inventario(token);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    logger.error('friday-monday:inventario', { mensagem });
    throw new HttpsError('internal', mensagem.slice(0, 300));
  }
});

async function inventario(token: string) {
  const { workspaces } = await gql(token, 'query { workspaces(limit: 100) { id name } }');
  const boards: AnyRecord[] = [];
  for (let page = 1; ; page++) {
    const d = await gql(token, 'query ($p: Int!) { boards(limit: 100, page: $p, state: active) { id name type items_count updated_at board_folder_id workspace { id name } } }', { p: page });
    boards.push(...d.boards);
    if (d.boards.length < 100) break;
  }
  const pastas = new Map<string, string>();
  const wsIds = (workspaces as AnyRecord[]).map(w => w.id);
  try {
    for (let page = 1; wsIds.length; page++) {
      const d = await gql(token, 'query ($ws: [ID], $p: Int) { folders(workspace_ids: $ws, limit: 100, page: $p) { id name } }', { ws: wsIds, p: page });
      for (const f of d.folders) pastas.set(String(f.id), f.name);
      if (d.folders.length < 100) break;
    }
  } catch (e) { logger.warn('friday-monday:pastas', { mensagem: String(e) }); } // só nomes de pasta na tela
  const importacoes = new Map((await colecao('importacoes').get()).docs.map(d => [d.id, d.data()]));
  // Quadros do Friday que viraram cadastro oficial: a tela atualiza só com prévia (fora do "Puxar o que falta").
  const oficiais = new Set((await colecao('quadros').where('cadastro', '!=', null).get()).docs.map(d => String(d.data().origem_id ?? '')).filter(Boolean));
  const quadros = boards.filter(b => b.type === 'board').map(b => {
    const imp = importacoes.get(String(b.id));
    const situacao = !imp ? 'novo' : imp.situacao === 'erro' ? 'erro' : (b.updated_at && imp.monday_atualizado_em && b.updated_at > imp.monday_atualizado_em) ? 'atualizar' : 'importado';
    return {
      id: String(b.id), nome: b.name, itens: b.items_count ?? 0, monday_atualizado_em: b.updated_at ?? null,
      area: b.workspace?.name ?? 'Principal', pasta: b.board_folder_id ? pastas.get(String(b.board_folder_id)) ?? null : null,
      situacao, importado_em: imp?.importado_em ?? null, quadro_id: imp?.quadro_id ?? null, mensagem: imp?.mensagem ?? null, oficial: oficiais.has(String(b.id)),
    };
  }).sort((a, b) => a.area.localeCompare(b.area) || String(a.pasta ?? '').localeCompare(String(b.pasta ?? '')) || a.nome.localeCompare(b.nome));
  return { quadros, gerado_em: dataLocal() };
}

/** Importa (ou atualiza) um quadro do monday no Friday. */
export const fridayMondayImportarQuadro = onCall({ region: REGIAO, secrets: [mondayApiToken], timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const uid = await exigirAdm2(request.auth?.uid);
  const boardId = String(request.data?.boardId ?? '');
  if (!/^\d+$/.test(boardId)) throw new HttpsError('invalid-argument', 'boardId inválido.');
  const modo = request.data?.modo == null ? null : String(request.data.modo);
  if (modo !== null && modo !== 'previa' && modo !== 'aplicar') throw new HttpsError('invalid-argument', 'modo inválido.');
  const token = tokenMonday();
  try {
    return await importarQuadro(token, boardId, uid, modo);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    logger.error('friday-monday:importar', { boardId, mensagem });
    // Prévia não marca o quadro com erro (nada foi gravado).
    if (modo === 'previa') throw e instanceof HttpsError ? e : new HttpsError('internal', mensagem.slice(0, 300));
    await colecao('importacoes').doc(boardId).set({ board_id: boardId, situacao: 'erro', mensagem, importado_em: dataLocal(), por_uid: uid }, { merge: true });
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('internal', mensagem.slice(0, 300));
  }
});
