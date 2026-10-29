import {
  collection, deleteField, doc, documentId, FieldPath, getDoc, getDocs, limit, onSnapshot, query, runTransaction, setDoc, updateDoc, where, writeBatch,
  type DocumentData, type DocumentReference,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref as refArquivo, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { functions } from './funcoes.ts';
import { CORES, fmtNumeroColuna, NOME_TRAVADO, nomeEspelhado } from './util.ts';
import { converterColuna, nomeDoAlvo, type Alvo } from './quadro/mudarTipo.ts';
import type { Coluna } from './quadro/tipos.ts';

// Camada de dados do Friday. As telas chamam req()/api como se houvesse um servidor (/api/...); aqui cada
// chamada é atendida direto no Firestore, nas coleções "friday-<recurso>". O login é o do sistema (Firebase
// Auth + funcionarios); quem pode ler e gravar é decidido pelas regras do Firestore.
//
// Os registros mantêm o id numérico do protótipo (campo "id", também usado como id do documento), porque as
// telas comparam e guardam ids como números (ordenação, ligações). Pessoas são a exceção: são os funcionários do
// sistema (funcionarios/{uid}) e aparecem nos registros pelo UID (células de pessoa, criado por, autor, @menções).
export type Row = Record<string, any> & { id: number };
// Pessoa do Friday = funcionário do sistema; o id é o próprio UID.
export type Pessoa = { id: string; uid: string; nome: string; email: string | null; cor: string; ativo: boolean };

// Disparado quando a sessão acaba (as telas voltam a pedir login).
export const SEM_SESSAO = 'ledur:sem-sessao';

class ErroApi extends Error {
  status: number;
  constructor(status: number, mensagem: string) { super(mensagem); this.status = status; }
}

// ------------------------------------------------------------------ recursos e campos
const RECURSOS = ['areas', 'pastas', 'quadros', 'grupos', 'colunas', 'itens', 'visoes', 'atualizacoes', 'atividades', 'anexos', 'notificacoes', 'automacoes', 'execucoes'] as const;
type Recurso = (typeof RECURSOS)[number];

// Campos gravados de cada recurso (o que não estiver aqui é ignorado, como no esquema do protótipo).
const CAMPOS: Record<Recurso, string[]> = {
  areas: ['id', 'nome', 'cor', 'posicao', 'origem_id', 'restrito'],
  pastas: ['id', 'area_id', 'pasta_pai_id', 'nome', 'cor', 'posicao', 'aberta', 'origem_id', 'restrito'],
  // cadastro: chave do cadastro oficial do quadro (friday-cadastros/{chave}), gravada pela Function fridayCadastroPromover.
  quadros: ['id', 'area_id', 'pasta_id', 'nome', 'descricao', 'posicao', 'favorito', 'nome_item', 'criado_em', 'tipo', 'quadro_pai_id', 'origem_id', 'arquivado_em', 'excluido_em', 'restrito', 'cadastro'],
  grupos: ['id', 'quadro_id', 'nome', 'cor', 'posicao', 'recolhido', 'arquivado_em', 'excluido_em', 'origem_id'],
  colunas: ['id', 'quadro_id', 'titulo', 'tipo', 'config', 'largura', 'posicao', 'oculta', 'origem_id'],
  // pessoas e busca: índices do Meu trabalho e da busca (ver prefixosBusca). importado_em, monday_atualizado_em e
  // ligacoes_pendentes: controle da importação do monday (gravados pela Function fridayMondayImportarQuadro).
  itens: ['id', 'quadro_id', 'grupo_id', 'item_pai_id', 'nome', 'posicao', 'valores', 'criado_por', 'criado_em', 'atualizado_em', 'origem_id', 'arquivado_em', 'excluido_em',
    'pessoas', 'busca', 'importado_em', 'monday_atualizado_em', 'ligacoes_pendentes', 'vinculo'],
  visoes: ['id', 'quadro_id', 'nome', 'tipo', 'config', 'posicao'],
  // quadro_id em atualizações e anexos: quadro do item, guardado para contar sem consultar item por item.
  atualizacoes: ['id', 'item_id', 'quadro_id', 'usuario_id', 'texto', 'criado_em', 'resposta_de', 'mencoes'],
  atividades: ['id', 'quadro_id', 'item_id', 'item_nome', 'usuario_id', 'automacao_id', 'acao', 'coluna_id', 'coluna_titulo', 'de', 'para', 'criado_em'],
  // arquivo: caminho no Storage; origem_id: arquivo copiado do monday ("monday:<asset>"), gravado pela Function fridayAnexosMonday.
  anexos: ['id', 'item_id', 'quadro_id', 'atualizacao_id', 'coluna_id', 'nome', 'mime', 'tamanho', 'arquivo', 'url', 'usuario_id', 'criado_em', 'origem_id'],
  // usuario_uid: dono do aviso no Firebase Auth (as regras só deixam cada um ler os próprios avisos).
  notificacoes: ['id', 'usuario_id', 'usuario_uid', 'de_usuario_id', 'tipo', 'quadro_id', 'item_id', 'atualizacao_id', 'texto', 'lida', 'criado_em'],
  // origem_id: automação importada do monday ("monday:<id>"), para não importar duas vezes.
  automacoes: ['id', 'quadro_id', 'nome', 'ativa', 'modo', 'gatilho', 'condicoes', 'acoes', 'criado_por', 'criado_em', 'atualizado_em', 'origem_id'],
  execucoes: ['id', 'automacao_id', 'quadro_id', 'item_id', 'item_nome', 'chave', 'ok', 'detalhe', 'criado_em'],
};
const JSON_COLS: Partial<Record<Recurso, string[]>> = { colunas: ['config'], itens: ['valores'], visoes: ['config'], atualizacoes: ['mencoes'], automacoes: ['gatilho', 'condicoes', 'acoes'] };
// Campos que a API genérica não grava (têm rotas próprias).
const PROTEGIDOS: Partial<Record<Recurso, string[]>> = {
  areas: ['restrito'], pastas: ['restrito'], quadros: ['restrito', 'cadastro'],
  atualizacoes: ['quadro_id'], anexos: ['quadro_id'], notificacoes: ['usuario_uid'],
  // vinculo: { cadastro, id } do registro oficial do item (cadastros oficiais).
  itens: ['pessoas', 'busca', 'importado_em', 'monday_atualizado_em', 'ligacoes_pendentes', 'vinculo'],
};
const SOMENTE_LEITURA = new Set<Recurso>(['atividades', 'execucoes']);
// Recursos que podem ser arquivados ou ir para a lixeira (em vez de sumir de vez).
const COM_ESTADO = new Set<Recurso>(['itens', 'grupos', 'quadros']);
const DIAS_LIXEIRA = 30;
// Ordem das listas: por posição (e id) ou pelos mais recentes.
const ORDEM: Partial<Record<Recurso, 'posicao' | 'recentes'>> = {
  areas: 'posicao', pastas: 'posicao', quadros: 'posicao', grupos: 'posicao', colunas: 'posicao', itens: 'posicao', visoes: 'posicao',
  atualizacoes: 'recentes', atividades: 'recentes', anexos: 'recentes', notificacoes: 'recentes', execucoes: 'recentes',
};
// Pai usado para calcular a próxima posição ao criar sem "posicao" ('' = a lista inteira).
const ESCOPO_POSICAO: Partial<Record<Recurso, string>> = {
  areas: '', pastas: 'area_id', quadros: 'area_id', grupos: 'quadro_id', colunas: 'quadro_id', itens: 'grupo_id', visoes: 'quadro_id',
};

function recurso(nome: string): Recurso {
  if (!(RECURSOS as readonly string[]).includes(nome)) throw new ErroApi(404, `recurso desconhecido: ${nome}`);
  return nome as Recurso;
}

// ------------------------------------------------------------------ utilitários
// Data e hora locais no formato do protótipo ("2026-10-19 14:30:00").
const agora = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, 19); };
const dataDe = (s: unknown) => new Date(String(s).replace(' ', 'T'));
const visivel = (x: Row | undefined) => !!x && x.arquivado_em == null && x.excluido_em == null;
const vazio = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

// Id numérico novo: milissegundos × 1000 + sorteio (cabe com folga num inteiro seguro do JavaScript).
let ultimoId = 0;
function novoId(): number {
  ultimoId = Math.max(Date.now() * 1000 + Math.floor(Math.random() * 1000), ultimoId + 1);
  return ultimoId;
}

// Número estável a partir do UID do Firebase (hash cyrb53, 53 bits): escolhe a cor da pessoa.
function hashDoUid(uid: string): number {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < uid.length; i++) {
    const c = uid.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// O Firestore não aceita undefined: some dos objetos e vira null nas listas.
function semUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map(x => (x === undefined ? null : semUndefined(x))) as T;
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, semUndefined(x)])) as T;
  }
  return v;
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const colecao = (r: Recurso) => collection(db, `friday-${r}`);
const ref = (r: Recurso, id: unknown) => doc(db, `friday-${r}`, String(id));

// Valores vindos de query string chegam como texto: números voltam a ser números.
const normalizar = (v: unknown) => (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);

async function consultar(r: Recurso, filtros: Record<string, unknown> = {}): Promise<Row[]> {
  const condicoes = Object.entries(filtros).map(([k, v]) => where(k, '==', normalizar(v)));
  const snap = await getDocs(condicoes.length ? query(colecao(r), ...condicoes) : colecao(r));
  return snap.docs.map(d => d.data() as Row);
}

function ordenar(r: Recurso, rows: Row[]): Row[] {
  const o = ORDEM[r];
  if (o === 'posicao') return rows.sort((a, b) => (Number(a.posicao) || 0) - (Number(b.posicao) || 0) || a.id - b.id);
  if (o === 'recentes') return rows.sort((a, b) => b.id - a.id);
  return rows.sort((a, b) => a.id - b.id);
}

async function buscar(r: Recurso, id: unknown): Promise<Row | undefined> {
  if (id == null || id === '' || !Number.isFinite(Number(id))) return undefined;
  const s = await getDoc(ref(r, Number(id)));
  return s.exists() ? (s.data() as Row) : undefined;
}

// Busca com memória durante uma operação (evita ler o mesmo quadro várias vezes).
function memoria() {
  const m = new Map<string, Promise<Row | undefined>>();
  return (r: Recurso, id: unknown) => {
    const k = `${r}/${id}`;
    if (!m.has(k)) m.set(k, buscar(r, id));
    return m.get(k)!;
  };
}

// Registro completo com os valores padrão do esquema do protótipo.
function padrao(r: Recurso): Record<string, unknown> {
  const t = agora();
  const extra: Record<Recurso, Record<string, unknown>> = {
    areas: { cor: '#1f4e8c', posicao: 0, restrito: 0 },
    pastas: { posicao: 0, aberta: 1, restrito: 0 },
    quadros: { posicao: 0, favorito: 0, nome_item: 'Item', criado_em: t, tipo: 'quadro', restrito: 0 },
    grupos: { cor: '#579bfc', posicao: 0, recolhido: 0 },
    colunas: { config: {}, largura: 140, posicao: 0, oculta: 0 },
    itens: { posicao: 0, valores: {}, criado_em: t, atualizado_em: t },
    visoes: { config: {}, posicao: 0 },
    atualizacoes: { criado_em: t, mencoes: [] },
    atividades: { criado_em: t },
    anexos: { criado_em: t },
    notificacoes: { lida: 0, criado_em: t },
    automacoes: { ativa: 1, modo: 'todas', gatilho: {}, condicoes: [], acoes: [], criado_em: t },
    execucoes: { ok: 1, criado_em: t },
  };
  return { ...Object.fromEntries(CAMPOS[r].map(c => [c, null])), ...extra[r] };
}

// Só os campos do recurso; booleanos viram 1/0 e texto vazio vira null (como no protótipo).
function limpar(r: Recurso, corpo: unknown): Record<string, unknown> {
  const campos = new Set(CAMPOS[r]);
  const protegidos = new Set(PROTEGIDOS[r] ?? []);
  const json = new Set(JSON_COLS[r] ?? []);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((corpo ?? {}) as Record<string, unknown>)) {
    if (k === 'id' || !campos.has(k) || protegidos.has(k)) continue;
    if (json.has(k)) out[k] = semUndefined(v ?? {});
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else out[k] = v === '' || v === undefined ? null : v;
  }
  return out;
}

async function inserir(r: Recurso, dados: Record<string, unknown>): Promise<Row> {
  const escopo = r === 'itens' && dados.item_pai_id != null ? 'item_pai_id' : ESCOPO_POSICAO[r];
  if (escopo !== undefined && dados.posicao == null) {
    const irmaos = await consultar(r, escopo ? { [escopo]: dados[escopo] ?? null } : {});
    dados.posicao = Math.max(0, ...irmaos.map(x => Number(x.posicao) || 0)) + 1;
  }
  const id = novoId();
  const row = { ...padrao(r), ...semUndefined(dados), id } as Row;
  if (r === 'itens') {
    row.busca = prefixosBusca(row.nome);
    row.pessoas = Object.keys(row.valores ?? {}).length ? pessoasDosValores(row.valores, await colunasPessoaDe(row.quadro_id)) : [];
  }
  await setDoc(ref(r, id), row);
  return row;
}

// ------------------------------------------------------------------ índices dos itens
// O Firestore não busca por trecho de texto nem dentro dos valores das células. Cada item guarda:
// - pessoas: UIDs que aparecem em colunas "pessoa" (o Meu trabalho consulta com array-contains);
// - busca: prefixos das palavras do nome, sem acento e em minúsculas (a busca consulta a 1ª palavra digitada).
// A mesma regra existe na Function de importação do monday (functions/fridayMondayConverter.ts).
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function prefixosBusca(nome: unknown): string[] {
  const prefixos = new Set<string>();
  for (const palavra of semAcento(String(nome ?? '')).split(/[^a-z0-9]+/).filter(Boolean)) {
    const p = palavra.slice(0, 20);
    for (let n = 1; n <= p.length; n++) prefixos.add(p.slice(0, n));
  }
  return [...prefixos].slice(0, 300);
}
function pessoasDosValores(valores: Record<string, unknown> | undefined, colunasPessoa: Set<string>): string[] {
  const uids = new Set<string>();
  for (const [k, v] of Object.entries(valores ?? {})) if (colunasPessoa.has(k) && Array.isArray(v)) v.forEach(x => { if (typeof x === 'string' && x) uids.add(x); });
  return [...uids];
}
async function colunasPessoaDe(quadroId: unknown): Promise<Set<string>> {
  return new Set((await consultar('colunas', { quadro_id: quadroId, tipo: 'pessoa' })).map(c => String(c.id)));
}

// ------------------------------------------------------------------ cadastros oficiais
// Quadro sinalizado como oficial (quadros.cadastro): os valores das colunas oficiais vivem na coleção do cadastro
// (cadastro-<chave>) e são encaixados nas colunas ao ler; a gravação passa pela Function fridayCadastroGravar.
// Contrato: The Manuscript, 03_APLICACAO_WEB/14_FRIDAY_CADASTROS_OFICIAIS.md.
// Cadastro existente (C5): `chave` é o caminho no documento ("identificacao.nome"); `escala` (×10) e `somente_leitura` vêm do contrato.
type CampoOficial = { chave: string; titulo: string; tipo: string; coluna_id: number; rotulos?: { codigo: string; friday_id: string }[]; situacao: string; escala?: number; somente_leitura?: boolean;
  secundario?: boolean }; // secundário: alimentado pela coluna de outro campo (ex.: Categoria a partir do Tipo do Veículo); não aparece na tela
// subitens: subitens oficiais (C3) — cada subitem é uma entrada do mapa `chave` no documento oficial do item pai.
type SubOficial = { chave: string; quadro_id: number; campos: CampoOficial[]; situacao: string };
// grupo: grupo oficial (opcional) — o nome do grupo de cada item fica no campo `chave` do documento oficial.
// modo "existente": o quadro é a tela de uma coleção que já existia (obras-v2, veiculos-v2), ligada a ela por script.
type Registro = { chave: string; nome: string; colecao: string; campos: CampoOficial[]; situacao: string; subitens?: SubOficial; grupo?: { chave: string; situacao: string };
  modo?: 'novo' | 'existente'; conciliacao?: { coluna_id: number | null; caminho: string };
  // Cadastro existente cujo nome do item espelha o documento oficial (veículos: identificador e nome); ver nomeEspelhado.
  nome_espelho?: string[] };
const registros = new Map<string, Promise<Registro | undefined>>();
function registroDe(chave: string, recarregar = false): Promise<Registro | undefined> {
  if (recarregar || !registros.has(chave)) registros.set(chave, getDoc(doc(db, 'friday-cadastros', chave)).then(s => (s.exists() ? (s.data() as Registro) : undefined)));
  return registros.get(chave)!;
}
const camposAtivos = (r: { campos?: CampoOficial[] } | undefined) => (r?.campos ?? []).filter(c => c.situacao === 'ativo' && !c.secundario);
const subOficial = (r: Registro | undefined, subQuadroId: unknown) =>
  (r?.subitens?.situacao === 'ativo' && Number(r.subitens.quadro_id) === Number(subQuadroId) ? r.subitens : undefined);
// Escopo oficial de um quadro: o próprio quadro oficial ou o quadro de subitens dele (quando os subitens são oficiais).
type EscopoOficial = { registro: Registro; campos: CampoOficial[]; subChave: string | null; quadroPrincipal: number };
async function escopoOficial(quadroId: unknown): Promise<EscopoOficial | null> {
  const quadro = await buscar('quadros', quadroId);
  if (!quadro) return null;
  const sub = quadro.tipo === 'subitens';
  const principal = sub ? await buscar('quadros', quadro.quadro_pai_id) : quadro;
  if (!principal?.cadastro) return null;
  const registro = await registroDe(principal.cadastro);
  if (!registro) return null;
  if (!sub) return { registro, campos: camposAtivos(registro), subChave: null, quadroPrincipal: principal.id };
  const s = subOficial(registro, quadro.id);
  return s ? { registro, campos: camposAtivos(s), subChave: s.chave, quadroPrincipal: principal.id } : null;
}
async function campoOficialDa(coluna: Row): Promise<(EscopoOficial & { campo: CampoOficial }) | null> {
  const e = await escopoOficial(coluna.quadro_id);
  const campo = e?.campos.find(c => c.coluna_id === coluna.id);
  return e && campo ? { ...e, campo } : null;
}
// Valor oficial → valor da célula no Friday (status/lista por código; pessoas por UID, como no Friday).
function valorDoOficial(c: CampoOficial, v: unknown): unknown {
  if (v == null) return undefined;
  if (c.escala && typeof v === 'number') { const r = v / c.escala; return Math.abs(r - Math.round(r)) < 1e-6 ? Math.round(r) : r; }
  switch (c.tipo) {
    case 'caixa': return v === true ? true : undefined;
    case 'status': return c.rotulos?.find(r => r.codigo === v)?.friday_id;
    case 'lista': { const ids = (Array.isArray(v) ? v : []).map(cod => c.rotulos?.find(r => r.codigo === cod)?.friday_id).filter(Boolean); return ids.length ? ids : undefined; }
    case 'pessoa': { const uids = (Array.isArray(v) ? v : []).filter(u => typeof u === 'string' && u); return uids.length ? uids : undefined; }
    default: return v;
  }
}
// Campo aninhado do documento oficial ("identificacao.nome"); nos cadastros novos, a chave não tem ponto.
function lerCaminho(doc: Record<string, unknown> | undefined, caminho: string): unknown {
  let atual: unknown = doc;
  for (const parte of caminho.split('.')) { if (atual == null || typeof atual !== 'object') return undefined; atual = (atual as Record<string, unknown>)[parte]; }
  return atual;
}
function mesclarOficial(item: Row, campos: CampoOficial[], oficial: Record<string, unknown> | undefined): Row {
  if (!oficial) return item;
  const valores = { ...(item.valores ?? {}) };
  for (const c of campos) {
    const v = valorDoOficial(c, lerCaminho(oficial, c.chave));
    if (v === undefined) delete valores[String(c.coluna_id)]; else valores[String(c.coluna_id)] = v;
  }
  return { ...item, valores };
}
/** Nome espelhado do cadastro (registro.nome_espelho): o nome do item vem do documento oficial e fica travado. */
function comNomeEspelhado(item: Row, registro: Registro, oficial: Record<string, unknown> | undefined): Row {
  if (!registro.nome_espelho?.length || item.vinculo?.sub != null || !oficial) return item;
  return { ...item, nome: nomeEspelhado(registro.nome_espelho, oficial) || item.nome, nome_travado: true };
}
/** Item avulso com os valores oficiais encaixados. */
async function comOficiais(item: Row): Promise<Row> {
  if (!item.vinculo?.cadastro) return item;
  const registro = await registroDe(item.vinculo.cadastro);
  if (!registro) return item;
  const d = (await getDoc(doc(db, registro.colecao, String(item.vinculo.id)))).data();
  if (item.vinculo.sub == null) return comNomeEspelhado(mesclarOficial(item, camposAtivos(registro), d), registro, d);
  const s = registro.subitens;
  if (s?.situacao !== 'ativo') return item;
  return mesclarOficial(item, camposAtivos(s), d?.[s.chave]?.[String(item.vinculo.sub)]);
}
const chamarGravacaoOficial = httpsCallable<{ itemId: number; op: string; colunaId?: number; valor?: unknown }, unknown>(functions, 'fridayCadastroGravar');
async function gravarOficial(itemId: number, op: 'valor' | 'nome' | 'situacao' | 'vincular' | 'grupo', extra: { colunaId?: number; valor?: unknown } = {}) {
  try { await chamarGravacaoOficial({ itemId, op, ...extra }); } catch (e) { throw new ErroApi(500, `Cadastro oficial: ${(e as Error).message}`); }
}
async function quadroCadastro(quadroId: unknown) { return (await buscar('quadros', quadroId))?.cadastro as string | undefined; }

/**
 * Mudanças nos campos de um cadastro oficial (Function fridayCadastroCampos): tornar uma coluna oficial ("adicionar"),
 * descontinuar, tornar os subitens oficiais ("subitens"), acompanhar rótulos ("rotulos") e desfazer a oficialização ("desfazer").
 */
const chamarCampos = httpsCallable<{ quadroId: number; op: string; colunaId?: number; chave?: string; campos?: { coluna_id: number; chave: string }[]; grupoId?: number }, Record<string, unknown>>(
  functions, 'fridayCadastroCampos', { timeout: 560_000 });
type OpCampos = 'adicionar' | 'descontinuar' | 'subitens' | 'rotulos' | 'desfazer' | 'grupo' | 'grupo_descontinuar' | 'grupo_nome';
export async function camposOficiais(dados: { quadroId: number; op: OpCampos; colunaId?: number; chave?: string; campos?: { coluna_id: number; chave: string }[]; grupoId?: number }) {
  try { return (await chamarCampos(dados)).data; } catch (e) { throw new ErroApi(500, `Cadastro oficial: ${(e as Error).message}`); }
}

// Grava muitos documentos em lotes (o Firestore aceita até 500 operações por lote).
async function emLotes(operacoes: ((lote: ReturnType<typeof writeBatch>) => void)[]) {
  for (let k = 0; k < operacoes.length; k += 450) {
    const lote = writeBatch(db);
    operacoes.slice(k, k + 450).forEach(op => op(lote));
    await lote.commit();
  }
}

// ------------------------------------------------------------------ sessão (login do sistema)
// id = UID. admin (áreas: criar, renomear, excluir) = perfis.adm2.
export type Sessao = { id: string; uid: string; nome: string; email: string | null; cor: string; admin: boolean };
let sessao: Sessao | null = null;

function eu(): Sessao {
  if (!sessao) throw new ErroApi(401, 'Sessão encerrada. Entre novamente no sistema.');
  return sessao;
}
// Abre a sessão com o funcionário logado. O Friday não guarda pessoas próprias: nome e e-mail vêm de funcionarios
// e do login (o último acesso é gravado pela WEB, em funcionarios). Todo funcionário ativo lê e edita.
export async function iniciarSessao(p: { uid: string; nome: string; email: string | null; adm2: boolean }): Promise<Sessao> {
  sessao = { id: p.uid, uid: p.uid, nome: p.nome, email: p.email, cor: corDaPessoa(p.uid), admin: p.adm2 };
  await prepararPrimeiroUso();
  return sessao;
}

// Friday vazio: cria a área de trabalho inicial e um quadro de exemplo para começar. A área inicial tem
// id fixo e é criada numa transação: se duas aberturas chegarem juntas, só uma prepara o resto.
let primeiroUso: Promise<void> | null = null;
function prepararPrimeiroUso() {
  primeiroUso ??= criarPrimeiroUso().catch(e => { primeiroUso = null; throw e; });
  return primeiroUso;
}
async function criarPrimeiroUso() {
  if (!(await getDocs(query(colecao('areas'), limit(1)))).empty) return;
  const AREA_INICIAL = 1;
  const area = { ...padrao('areas'), id: AREA_INICIAL, nome: 'Ledur', cor: '#1f4e8c', posicao: 1 } as Row;
  const criou = await runTransaction(db, async t => {
    if ((await t.get(ref('areas', AREA_INICIAL))).exists()) return false;
    t.set(ref('areas', AREA_INICIAL), area);
    return true;
  });
  if (!criou) return;
  const quadro = await inserir('quadros', { area_id: area.id, pasta_id: null, nome: 'Quadro de exemplo', descricao: 'Pode renomear, usar ou excluir.' });
  await prepararQuadro(quadro.id);
  const [grupo] = await consultar('grupos', { quadro_id: quadro.id });
  const colunas = await consultar('colunas', { quadro_id: quadro.id });
  const status = colunas.find(c => c.tipo === 'status');
  const pessoa = colunas.find(c => c.tipo === 'pessoa');
  const exemplos: [string, string][] = [['Conhecer o Friday', '2'], ['Criar o primeiro quadro da equipe', '1'], ['Convidar a equipe', '0']];
  for (const [nome, rotulo] of exemplos) {
    const valores: Record<string, unknown> = {};
    if (status && rotulo !== '0') valores[String(status.id)] = rotulo;
    if (pessoa) valores[String(pessoa.id)] = [eu().id];
    await inserir('itens', { quadro_id: quadro.id, grupo_id: grupo?.id ?? null, nome, valores, criado_por: eu().id });
  }
}
export function encerrarSessao() { sessao = null; }

// ------------------------------------------------------------------ pessoas (funcionarios)
const corDaPessoa = (uid: string) => CORES[hashDoUid(uid) % 16];
// Pessoas em memória (nomes no registro de atividade).
let usuarios: Pessoa[] = [];
const nomeUsuario = (id: unknown) => usuarios.find(u => u.id === String(id))?.nome ?? '?';
/** Todos os funcionários (ativos e inativos, para os nomes em itens antigos), por nome. */
export async function listarPessoas(): Promise<Pessoa[]> {
  const snap = await getDocs(collection(db, 'funcionarios'));
  usuarios = snap.docs.map(d => {
    const f = d.data();
    const email = typeof f.email === 'string' && f.email.trim() ? f.email.trim().toLowerCase() : null;
    const nome = typeof f.nome === 'string' && f.nome.trim() ? f.nome.trim() : email ?? d.id;
    return { id: d.id, uid: d.id, nome, email, cor: corDaPessoa(d.id), ativo: f.ativo === true };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return usuarios;
}

// ------------------------------------------------------------------ colunas: padrões e textos
function configPadrao(tipo: string): Record<string, unknown> {
  switch (tipo) {
    case 'status':
      return { rotulos: [
        { id: '1', texto: 'Em andamento', cor: '#fdab3d' },
        { id: '2', texto: 'Feito', cor: '#00a36c', concluido: true },
        { id: '3', texto: 'Parado', cor: '#e2445c' },
        { id: '0', texto: '', cor: '#c4c4c4' },
      ] };
    case 'lista': return { opcoes: [] };
    case 'numero': return { unidade: '', resumo: 'soma' };
    case 'avaliacao': return { maximo: 5 };
    case 'ligacao': return { quadro_id: null };
    case 'formula': return { formula: '' };
    default: return {};
  }
}
const LARGURA_PADRAO: Record<string, number> = {
  status: 140, pessoa: 110, data: 120, periodo: 170, numero: 110, caixa: 80, avaliacao: 130,
  texto_longo: 220, ligacao: 180, lista: 160, formula: 180, arquivos: 130,
};
// Coluna de data que é prazo (mesma regra das telas, em quadro/tipos.ts).
const TITULO_INICIO = /in[ií]cio|abertura|come[cç]o|\bstart|admiss|entrada/i;
const ehPrazo = (titulo: string, config: Record<string, any>) => (config.prazo ?? !TITULO_INICIO.test(titulo)) as boolean;

// Texto legível de um valor, para o registro de atividade (sobrevive à exclusão da coluna).
async function formatarValor(tipo: string, config: Record<string, any>, valor: unknown): Promise<string | null> {
  if (vazio(valor)) return null;
  switch (tipo) {
    case 'status': return (config.rotulos as { id: string; texto: string }[] | undefined)?.find(r => r.id === String(valor))?.texto || null;
    case 'pessoa': return (valor as unknown[]).map(nomeUsuario).join(', ');
    case 'lista': return (valor as string[]).map(id => config.opcoes?.find((o: { id: string }) => o.id === id)?.texto ?? id).join(', ');
    case 'periodo': { const v = valor as { inicio?: string; fim?: string }; return `${v.inicio ?? '?'} → ${v.fim ?? '?'}`; }
    case 'caixa': return valor ? 'marcado' : null;
    case 'numero': return fmtNumeroColuna(config, valor) || null;
    case 'arquivos': return (valor as { nome: string }[]).map(a => a.nome).join(', ') || null;
    case 'link': { const v = valor as { url?: string; texto?: string } | string; return typeof v === 'string' ? v : v.texto || v.url || null; }
    case 'ligacao': return (await Promise.all((valor as number[]).map(async id => (await buscar('itens', id))?.nome ?? `#${id}`))).join(', ');
    default: return String(valor);
  }
}

// ------------------------------------------------------------------ atividade e avisos
async function registrar(a: { quadro_id: unknown; item_id?: unknown; item_nome?: unknown; acao: string; coluna_id?: unknown; coluna_titulo?: unknown; de?: unknown; para?: unknown }) {
  await inserir('atividades', {
    quadro_id: Number(a.quadro_id), item_id: a.item_id ?? null, item_nome: a.item_nome ?? null, usuario_id: eu().id, automacao_id: null, acao: a.acao,
    coluna_id: a.coluna_id ?? null, coluna_titulo: a.coluna_titulo ?? null, de: a.de == null ? null : String(a.de), para: a.para == null ? null : String(a.para),
  });
}

// Avisos (atribuição, menção, resposta) estão desligados até serem refeitos.

// ------------------------------------------------------------------ quadros e subitens
// Quadro novo já utilizável: um grupo, colunas básicas e a visão de tabela.
async function prepararQuadro(quadroId: number) {
  await inserir('grupos', { quadro_id: quadroId, nome: 'Grupo 1', cor: '#579bfc' });
  for (const [titulo, tipo] of [['Responsável', 'pessoa'], ['Status', 'status'], ['Data', 'data']] as const) {
    await inserir('colunas', { quadro_id: quadroId, titulo, tipo, config: configPadrao(tipo), largura: LARGURA_PADRAO[tipo] ?? 140 });
  }
  await inserir('visoes', { quadro_id: quadroId, nome: 'Tabela principal', tipo: 'tabela' });
}

// Grupo onde os subitens novos entram (o quadro de subitens tem um grupo só, que o usuário não vê).
async function grupoDoSubquadro(subId: number): Promise<number> {
  const g = ordenar('grupos', (await consultar('grupos', { quadro_id: subId })).filter(visivel))[0];
  return g?.id ?? (await inserir('grupos', { quadro_id: subId, nome: 'Subitens', cor: '#579bfc' })).id;
}
async function subquadroDe(paiId: number): Promise<Row | undefined> {
  return ordenar('quadros', await consultar('quadros', { quadro_pai_id: paiId, tipo: 'subitens' }))[0];
}
// Quadro de subitens de um quadro (cria na primeira vez, com colunas básicas).
async function garantirSubquadro(pai: Row): Promise<number> {
  const existe = await subquadroDe(pai.id);
  if (existe) return existe.id;
  const sub = await inserir('quadros', { area_id: pai.area_id, nome: `Subitens de ${pai.nome}`, tipo: 'subitens', quadro_pai_id: pai.id, nome_item: 'Subitem' });
  await inserir('grupos', { quadro_id: sub.id, nome: 'Subitens', cor: '#579bfc' });
  for (const [titulo, tipo] of [['Responsável', 'pessoa'], ['Status', 'status'], ['Data', 'data']] as const) {
    await inserir('colunas', { quadro_id: sub.id, titulo, tipo, config: configPadrao(tipo), largura: LARGURA_PADRAO[tipo] ?? 140 });
  }
  return sub.id;
}

async function completo(id: number) {
  const quadro = await buscar('quadros', id);
  if (!quadro) throw new ErroApi(404, 'quadro não encontrado');
  const [grupos, colunas, visoes, itensTodos, atualizacoes, anexos, automacoes, sub] = await Promise.all([
    consultar('grupos', { quadro_id: id }), consultar('colunas', { quadro_id: id }), consultar('visoes', { quadro_id: id }), consultar('itens', { quadro_id: id }),
    consultar('atualizacoes', { quadro_id: id }), consultar('anexos', { quadro_id: id }), consultar('automacoes', { quadro_id: id, ativa: 1 }), subquadroDe(id),
  ]);
  // Quadro oficial: registro do cadastro e documentos oficiais dos itens (uma consulta).
  const registro = quadro.cadastro ? await registroDe(quadro.cadastro, true) : undefined;
  const subOf = sub ? subOficial(registro, sub.id) : undefined;
  // Colunas oficiais levam a marca `oficial` (cadeado na tela, exclusão bloqueada, rótulos protegidos).
  const marcar = (c: Row, campos: CampoOficial[]) => {
    const campo = campos.find(x => x.coluna_id === c.id);
    return campo ? { ...c, oficial: {
      cadastro: registro!.chave, chave: campo.chave, nome: registro!.nome, rotulos: (campo.rotulos ?? []).map(r => r.friday_id),
      ...(campo.somente_leitura ? { somente_leitura: true } : {}), ...(registro!.modo === 'existente' ? { existente: true } : {}),
    } } : c;
  };
  const oficiais = new Map<string, Record<string, unknown>>();
  if (registro) {
    if (registro.modo === 'existente') {
      // Coleção existente: os documentos não guardam a origem; lê pelos vínculos dos itens (30 por consulta).
      const ids = [...new Set(itensTodos.filter(i => i.vinculo?.cadastro === registro.chave).map(i => String(i.vinculo.id)))];
      const lotes = [];
      for (let k = 0; k < ids.length; k += 30) lotes.push(getDocs(query(collection(db, registro.colecao), where(documentId(), 'in', ids.slice(k, k + 30)))));
      for (const s of await Promise.all(lotes)) for (const d of s.docs) oficiais.set(d.id, d.data());
    } else {
      const snap = await getDocs(query(collection(db, registro.colecao), where('origem.friday_quadro_id', '==', id)));
      for (const d of snap.docs) oficiais.set(d.id, d.data());
    }
  }
  const contar = (lista: Row[]) => { const m = new Map<number, number>(); for (const x of lista) m.set(Number(x.item_id), (m.get(Number(x.item_id)) ?? 0) + 1); return m; };
  const gruposVisiveis = ordenar('grupos', grupos.filter(visivel));
  const idsGrupos = new Set(gruposVisiveis.map(g => g.id));
  const itensVisiveis = ordenar('itens', itensTodos.filter(i => visivel(i) && (i.grupo_id == null || idsGrupos.has(Number(i.grupo_id)))));
  const idsItens = new Set(itensVisiveis.map(i => i.id));

  let subDados = null;
  const nSub = new Map<number, number>();
  if (sub) {
    const [subItensTodos, subColunas, subAtualizacoes, subAnexos, subGrupo] = await Promise.all([
      consultar('itens', { quadro_id: sub.id }), consultar('colunas', { quadro_id: sub.id }),
      consultar('atualizacoes', { quadro_id: sub.id }), consultar('anexos', { quadro_id: sub.id }), grupoDoSubquadro(sub.id),
    ]);
    const nAt = contar(subAtualizacoes), nAn = contar(subAnexos);
    const subItens = ordenar('itens', subItensTodos.filter(s => visivel(s) && idsItens.has(Number(s.item_pai_id))))
      .map(s => {
        const base = subOf && s.vinculo?.sub != null
          ? mesclarOficial(s, camposAtivos(subOf), (oficiais.get(String(s.vinculo.id))?.[subOf.chave] as Record<string, Record<string, unknown>> | undefined)?.[String(s.vinculo.sub)]) : s;
        return { ...base, n_atualizacoes: nAt.get(s.id) ?? 0, n_anexos: nAn.get(s.id) ?? 0 } as Row;
      });
    for (const s of subItens) nSub.set(Number(s.item_pai_id), (nSub.get(Number(s.item_pai_id)) ?? 0) + 1);
    subDados = { quadro_id: sub.id, grupo_id: subGrupo, nome_item: sub.nome_item ?? 'Subitem', colunas: ordenar('colunas', subColunas).map(c => marcar(c, camposAtivos(subOf))), itens: subItens };
  }
  const nAt = contar(atualizacoes), nAn = contar(anexos);
  return {
    quadro: {
      ...quadro, subquadro_id: sub?.id ?? null, permissao: 'editar', n_automacoes: automacoes.length,
      // subitens: situação dos subitens oficiais (null = livres; "migrando" = promoção interrompida, pode ser retomada).
      oficial: registro ? {
        chave: registro.chave, nome: registro.nome, subitens: registro.subitens?.situacao ?? null, sub_chave: registro.subitens?.chave ?? null,
        grupo: registro.grupo?.situacao ?? null, grupo_chave: registro.grupo?.chave ?? null, modo: registro.modo ?? 'novo', colecao: registro.colecao,
      } : null,
    },
    grupos: gruposVisiveis, visoes: ordenar('visoes', visoes),
    colunas: ordenar('colunas', colunas).map(c => marcar(c, camposAtivos(registro))),
    itens: itensVisiveis.map(i => {
      const oficial = registro && i.vinculo ? oficiais.get(String(i.vinculo.id)) : undefined;
      const base = registro && i.vinculo ? comNomeEspelhado(mesclarOficial(i, camposAtivos(registro), oficial), registro, oficial) : i;
      return { ...base, n_atualizacoes: nAt.get(i.id) ?? 0, n_subitens: nSub.get(i.id) ?? 0, n_anexos: nAn.get(i.id) ?? 0 };
    }),
    sub: subDados,
  };
}

async function criarSubitens(paiId: number) {
  const pai = await buscar('quadros', paiId);
  if (!pai) throw new ErroApi(404, 'quadro não encontrado');
  const subId = await garantirSubquadro(pai);
  const [sub, colunas, grupoId] = await Promise.all([buscar('quadros', subId), consultar('colunas', { quadro_id: subId }), grupoDoSubquadro(subId)]);
  return { ...sub, grupo_id: grupoId, colunas: ordenar('colunas', colunas) };
}

type ItemImportado = { grupo_id?: number; grupo_nome?: string; nome: string; valores?: Record<string, unknown>; subitens?: { nome: string; valores?: Record<string, unknown> }[] };
// Importação em lote (Excel): cria grupos pelo nome quando preciso, itens e subitens.
async function importar(quadroId: number, corpo: unknown) {
  const quadro = await buscar('quadros', quadroId);
  if (!quadro) throw new ErroApi(404, 'quadro não encontrado');
  if (quadro.cadastro) throw new ErroApi(409, 'Importar do Excel num quadro oficial ainda não é suportado.');
  const lista = ((corpo as { itens?: ItemImportado[] })?.itens ?? []) as ItemImportado[];
  const CORES_GRUPO = ['#579bfc', '#00a36c', '#a25ddc', '#fdab3d', '#e2445c', '#0086c0', '#ff642e', '#037f4c'];
  const [gruposAtuais, itensAtuais] = await Promise.all([consultar('grupos', { quadro_id: quadroId }), consultar('itens', { quadro_id: quadroId })]);
  const grupos = new Map(gruposAtuais.filter(visivel).map(g => [String(g.nome).trim().toLowerCase(), g.id]));
  // Próxima posição de cada grupo, calculada uma vez (os itens vão no fim).
  const ultima = new Map<number, number>();
  for (const i of itensAtuais) ultima.set(Number(i.grupo_id), Math.max(ultima.get(Number(i.grupo_id)) ?? 0, Number(i.posicao) || 0));
  let criados = 0, subCriados = 0, gruposCriados = 0, subquadro: number | null = null, subGrupo: number | null = null;
  const novos: Row[] = [];
  const pessoasQuadro = await colunasPessoaDe(quadroId);
  let pessoasSub = new Set<string>();
  for (const it of lista) {
    let gid = it.grupo_id ?? null;
    if (!gid) {
      const nome = (it.grupo_nome || 'Importados').trim();
      gid = grupos.get(nome.toLowerCase()) ?? null;
      if (!gid) {
        gid = (await inserir('grupos', { quadro_id: quadroId, nome, cor: CORES_GRUPO[(grupos.size + gruposCriados) % CORES_GRUPO.length] })).id;
        grupos.set(nome.toLowerCase(), gid);
        gruposCriados++;
      }
    }
    const posicao = (ultima.get(gid) ?? 0) + 1;
    ultima.set(gid, posicao);
    const nomeItem = String(it.nome || 'Sem nome').slice(0, 500), valoresItem = semUndefined(it.valores ?? {});
    const item = { ...padrao('itens'), id: novoId(), quadro_id: quadroId, grupo_id: gid, nome: nomeItem, posicao, valores: valoresItem, criado_por: eu().id, busca: prefixosBusca(nomeItem), pessoas: pessoasDosValores(valoresItem, pessoasQuadro) } as Row;
    novos.push(item);
    criados++;
    for (const [k, s] of (it.subitens ?? []).entries()) {
      if (!subquadro) { subquadro = await garantirSubquadro(quadro); subGrupo = await grupoDoSubquadro(subquadro); pessoasSub = await colunasPessoaDe(subquadro); }
      const nomeSub = String(s.nome || 'Sem nome').slice(0, 500), valoresSub = semUndefined(s.valores ?? {});
      novos.push({ ...padrao('itens'), id: novoId(), quadro_id: subquadro, grupo_id: subGrupo, item_pai_id: item.id, nome: nomeSub, posicao: k + 1, valores: valoresSub, criado_por: eu().id, busca: prefixosBusca(nomeSub), pessoas: pessoasDosValores(valoresSub, pessoasSub) } as Row);
      subCriados++;
    }
  }
  await emLotes(novos.map(n => lote => lote.set(ref('itens', n.id), n)));
  await registrar({ quadro_id: quadroId, acao: 'importou', para: `${criados} itens${subCriados ? ` e ${subCriados} subitens` : ''}` });
  return { criados, subitens: subCriados, grupos: gruposCriados };
}

async function duplicarItem(id: number) {
  const item = await buscar('itens', id);
  if (!item) throw new ErroApi(404, 'item não encontrado');
  const nome = `${item.nome} (cópia)`;
  const completoItem = await comOficiais(item);
  const novo = await inserir('itens', { quadro_id: item.quadro_id, grupo_id: item.grupo_id, item_pai_id: item.item_pai_id, nome, posicao: Number(item.posicao) + 0.5, valores: completoItem.valores ?? {}, criado_por: eu().id });
  // A cópia de um item vinculado também vira registro: num cadastro existente, a Function decide (obras-v2 cria o contrato
  // na hora; os demais deixam o item sem vínculo até a conciliação); a cópia de um subitem vira uma entrada nova no
  // registro do item pai (ex.: LOTE de obras-v2).
  if (item.vinculo) await gravarOficial(novo.id, 'vincular');
  await registrar({ quadro_id: item.quadro_id, item_id: novo.id, item_nome: nome, acao: 'duplicou' });
  return novo;
}

// Duplica a estrutura de um quadro (grupos, colunas, visões) e, se pedido, os itens.
async function duplicarQuadro(id: number, corpo: unknown) {
  const orig = await buscar('quadros', id);
  if (!orig) throw new ErroApi(404, 'quadro não encontrado');
  const b = (corpo ?? {}) as { nome?: string; area_id?: number; pasta_id?: number | null; com_itens?: boolean };
  if (orig.cadastro && b.com_itens) throw new ErroApi(409, 'Quadro oficial: só dá para duplicar a estrutura (sem itens).');
  const novo = await inserir('quadros', {
    area_id: b.area_id ?? orig.area_id, pasta_id: b.pasta_id !== undefined ? b.pasta_id : orig.pasta_id,
    nome: b.nome || `${orig.nome} (cópia)`, descricao: orig.descricao, nome_item: orig.nome_item,
  });
  const [colunas, visoes, grupos, itens] = await Promise.all([
    consultar('colunas', { quadro_id: id }), consultar('visoes', { quadro_id: id }), consultar('grupos', { quadro_id: id }), b.com_itens ? consultar('itens', { quadro_id: id }) : Promise.resolve([]),
  ]);
  const mapaCol = new Map<string, number>();
  const pessoasNovas = new Set<string>();
  for (const c of ordenar('colunas', colunas)) {
    const n = await inserir('colunas', { quadro_id: novo.id, titulo: c.titulo, tipo: c.tipo, config: c.config ?? {}, largura: c.largura, posicao: c.posicao, oculta: c.oculta });
    mapaCol.set(String(c.id), n.id);
    if (c.tipo === 'pessoa') pessoasNovas.add(String(n.id));
  }
  // Visões apontam para colunas: troca o id antigo pelo novo.
  for (const v of ordenar('visoes', visoes)) {
    const cfg = { ...(v.config ?? {}) };
    if (cfg.coluna_id != null) cfg.coluna_id = mapaCol.get(String(cfg.coluna_id)) ?? cfg.coluna_id;
    await inserir('visoes', { quadro_id: novo.id, nome: v.nome, tipo: v.tipo, config: cfg, posicao: v.posicao });
  }
  const copias: Row[] = [];
  for (const g of ordenar('grupos', grupos)) {
    const ng = await inserir('grupos', { quadro_id: novo.id, nome: g.nome, cor: g.cor, posicao: g.posicao });
    if (!b.com_itens) continue;
    for (const it of ordenar('itens', itens.filter(i => i.grupo_id === g.id && i.item_pai_id == null))) {
      const valores = Object.fromEntries(Object.entries(it.valores ?? {}).map(([k, x]) => [String(mapaCol.get(k) ?? k), x]));
      copias.push({ ...padrao('itens'), id: novoId(), quadro_id: novo.id, grupo_id: ng.id, nome: it.nome, posicao: it.posicao, valores, criado_por: eu().id, busca: prefixosBusca(it.nome), pessoas: pessoasDosValores(valores, pessoasNovas) } as Row);
    }
  }
  await emLotes(copias.map(c => lote => lote.set(ref('itens', c.id), c)));
  return novo;
}

/**
 * Muda o tipo de uma coluna convertendo os valores de todos os itens (inclusive arquivados e na lixeira). Sem `aplicar`,
 * só calcula a prévia (quantos convertem e quais ficam vazios). Campo oficial não muda de tipo nem de valores: só o
 * separador de milhar de um número (ex.: "Ano Fabricação" → número sem separador), que muda apenas a exibição.
 */
export async function mudarTipoColuna(colunaId: number, alvo: Alvo, aplicar = false) {
  const coluna = await buscar('colunas', colunaId);
  if (!coluna) throw new ErroApi(404, 'coluna não encontrada');
  const oficial = await campoOficialDa(coluna);
  if (oficial && !(coluna.tipo === 'numero' && !coluna.config?.x10 && alvo.tipo === 'numero' && !alvo.x10)) {
    throw new ErroApi(409, `“${coluna.titulo}” é um campo oficial: só o separador de milhar pode mudar.`);
  }
  const itens = oficial ? [] : await consultar('itens', { quadro_id: coluna.quadro_id });
  const r = converterColuna(coluna as Coluna, alvo, itens.map(i => ({ id: i.id, nome: String(i.nome ?? ''), v: i.valores?.[String(colunaId)] })));
  if (!aplicar) return r;
  await emLotes(r.mudancas.map(m => lote => lote.update(ref('itens', m.id), new FieldPath('valores', String(colunaId)), m.valor == null ? deleteField() : m.valor)));
  await updateDoc(ref('colunas', colunaId), { tipo: alvo.tipo, config: r.config });
  await registrar({ quadro_id: coluna.quadro_id, acao: 'alterou', coluna_id: colunaId, coluna_titulo: coluna.titulo, de: `tipo ${coluna.tipo}${coluna.config?.x10 ? ' ×10' : ''}`, para: `tipo ${nomeDoAlvo(alvo)}` });
  return r;
}

// Altera o valor de uma célula (item x coluna) e registra a atividade.
async function definirValor(itemId: number, corpo: unknown) {
  const { coluna_id, valor } = (corpo ?? {}) as { coluna_id?: number; valor?: unknown };
  const [item, coluna] = await Promise.all([buscar('itens', itemId), buscar('colunas', coluna_id)]);
  if (!item || !coluna) throw new ErroApi(404, 'item ou coluna não encontrado');
  if (coluna.quadro_id !== item.quadro_id) throw new ErroApi(400, 'a coluna não pertence ao quadro do item');
  const chave = String(coluna.id);
  const oficial = item.vinculo ? await campoOficialDa(coluna) : null;
  if (oficial?.campo.somente_leitura) throw new ErroApi(409, `“${coluna.titulo}” é só leitura: o valor vem do cadastro ${oficial.registro.nome}.`);
  const atual = oficial ? await comOficiais(item) : item;
  const antes = atual.valores?.[chave];
  const valores = { ...(atual.valores ?? {}) };
  if (vazio(valor)) delete valores[chave]; else valores[chave] = semUndefined(valor);
  const atualizado_em = agora();
  let pessoas = item.pessoas;
  if (oficial) {
    // Campo oficial: a Function valida e grava no cadastro (e atualiza o índice de pessoas do item).
    await gravarOficial(item.id, 'valor', { colunaId: coluna.id, valor: vazio(valor) ? null : semUndefined(valor) });
    await updateDoc(ref('itens', item.id), { atualizado_em });
  } else {
    // Coluna de pessoa: recalcula o índice usado pelo Meu trabalho.
    if (coluna.tipo === 'pessoa') pessoas = pessoasDosValores(valores, await colunasPessoaDe(item.quadro_id));
    await updateDoc(ref('itens', item.id), new FieldPath('valores', chave), vazio(valor) ? deleteField() : semUndefined(valor), 'atualizado_em', atualizado_em,
      ...(coluna.tipo === 'pessoa' ? ['pessoas', pessoas] : []));
  }
  const config = coluna.config ?? {};
  const [de, para] = await Promise.all([formatarValor(coluna.tipo, config, antes), formatarValor(coluna.tipo, config, valor)]);
  if (de !== para) {
    await registrar({ quadro_id: item.quadro_id, item_id: item.id, item_nome: item.nome, acao: 'alterou', coluna_id: coluna.id, coluna_titulo: coluna.titulo, de, para });
  }
  return { ...atual, valores, atualizado_em, pessoas };
}

// ------------------------------------------------------------------ arquivo, lixeira e exclusão definitiva
async function mudarEstado(r: Recurso, id: number, acao: 'arquivar' | 'restaurar') {
  if (!COM_ESTADO.has(r)) throw new ErroApi(400, acao === 'arquivar' ? 'não pode ser arquivado' : 'não pode ser restaurado');
  const antes = await buscar(r, id);
  if (!antes) throw new ErroApi(404, 'não encontrado');
  const campos = acao === 'arquivar' ? { arquivado_em: agora() } : { arquivado_em: null, excluido_em: null };
  await updateDoc(ref(r, id), campos as DocumentData);
  if (r === 'itens' && antes.vinculo) await gravarOficial(id, 'situacao');
  if (r === 'itens') await registrar({ quadro_id: antes.quadro_id, item_id: antes.id, item_nome: antes.nome, acao: acao === 'arquivar' ? 'arquivou' : 'restaurou' });
  return { ...antes, ...campos };
}

// Reúne o registro e tudo o que depende dele (como o ON DELETE CASCADE do protótipo).
// `arquivos` junta os caminhos no Storage dos anexos apagados.
async function coletarExclusao(r: Recurso, row: Row, apagar: Map<string, DocumentReference>, soltar: Map<string, DocumentReference>, arquivos: string[]) {
  const chave = `${r}/${row.id}`;
  if (apagar.has(chave)) return;
  apagar.set(chave, ref(r, row.id));
  if (r === 'anexos' && row.arquivo) arquivos.push(String(row.arquivo));
  const filhos = (rr: Recurso, campo: string) => consultar(rr, { [campo]: row.id });
  const cada = async (rr: Recurso, campo: string) => { for (const x of await filhos(rr, campo)) await coletarExclusao(rr, x, apagar, soltar, arquivos); };
  switch (r) {
    case 'areas': await cada('pastas', 'area_id'); await cada('quadros', 'area_id'); break;
    case 'pastas':
      await cada('pastas', 'pasta_pai_id');
      // Quadros da pasta ficam fora das pastas (ON DELETE SET NULL).
      for (const q of await filhos('quadros', 'pasta_id')) soltar.set(`quadros/${q.id}`, ref('quadros', q.id));
      break;
    case 'quadros':
      for (const rr of ['grupos', 'colunas', 'visoes', 'automacoes', 'execucoes', 'atividades'] as const) for (const x of await filhos(rr, 'quadro_id')) apagar.set(`${rr}/${x.id}`, ref(rr, x.id));
      await cada('itens', 'quadro_id');
      await cada('quadros', 'quadro_pai_id');
      break;
    case 'grupos': await cada('itens', 'grupo_id'); break;
    case 'itens': await cada('itens', 'item_pai_id'); await cada('atualizacoes', 'item_id'); await cada('anexos', 'item_id'); break;
    case 'atualizacoes': await cada('atualizacoes', 'resposta_de'); await cada('anexos', 'atualizacao_id'); break;
    case 'automacoes': await cada('execucoes', 'automacao_id'); break;
  }
}
async function apagarDeVez(r: Recurso, row: Row) {
  const apagar = new Map<string, DocumentReference>();
  const soltar = new Map<string, DocumentReference>();
  const arquivos: string[] = [];
  await coletarExclusao(r, row, apagar, soltar, arquivos);
  const ops: ((lote: ReturnType<typeof writeBatch>) => void)[] = [];
  for (const [k, d] of soltar) if (!apagar.has(k)) ops.push(lote => lote.update(d, { pasta_id: null }));
  for (const d of apagar.values()) ops.push(lote => lote.delete(d));
  await emLotes(ops);
  // Depois dos registros, os arquivos (um arquivo que sobrar não aparece em lugar nenhum; um registro sem arquivo, sim).
  for (const c of arquivos) {
    await deleteObject(refArquivo(storage, c)).catch(e => { if ((e as { code?: string }).code !== 'storage/object-not-found') console.warn('[friday] arquivo não apagado:', c, e); });
  }
}
// Anexo apagado pela aba Arquivos: sai também da célula da coluna em que foi enviado.
async function tirarDaColuna(anexo: Row) {
  const item = await buscar('itens', anexo.item_id);
  const lista = item?.valores?.[String(anexo.coluna_id)];
  if (!Array.isArray(lista) || !lista.some(a => a?.id === anexo.id)) return;
  const resto = lista.filter(a => a?.id !== anexo.id);
  await updateDoc(ref('itens', anexo.item_id), { [`valores.${anexo.coluna_id}`]: resto.length ? resto : deleteField() });
}

// O que está arquivado ou na lixeira (quadros, grupos e itens), do mais recente para o mais antigo.
// Abrir a lixeira também apaga de vez o que passou de 30 dias.
async function arquivo(estado: string | undefined, quadroId: number | null) {
  const lixeira = estado === 'lixeira';
  const campo = lixeira ? 'excluido_em' : 'arquivado_em';
  const pegar = async (r: Recurso) => (await getDocs(query(colecao(r), where(campo, '!=', null)))).docs.map(d => d.data() as Row).filter(x => lixeira || x.excluido_em == null);
  const [quadros, grupos, itens] = await Promise.all([pegar('quadros'), pegar('grupos'), pegar('itens')]);
  const achar = memoria();
  const linhas: Row[] = [];
  for (const q of quadros) {
    if ((q.tipo ?? 'quadro') === 'subitens' || (quadroId && q.id !== quadroId)) continue;
    linhas.push({ tipo: 'quadro', id: q.id, nome: q.nome, quadro_nome: q.nome, grupo_nome: null, quadro_id: q.id, quando: q.excluido_em ?? q.arquivado_em, _r: 'quadros' });
  }
  for (const g of grupos) {
    const q = await achar('quadros', g.quadro_id);
    if (!q || (q.tipo ?? 'quadro') === 'subitens' || (quadroId && q.id !== quadroId)) continue;
    linhas.push({ tipo: 'grupo', id: g.id, nome: g.nome, quadro_nome: q.nome, grupo_nome: null, quadro_id: q.id, quando: g.excluido_em ?? g.arquivado_em, _r: 'grupos' });
  }
  for (const i of itens) {
    const q = await achar('quadros', i.quadro_id);
    if (!q) continue;
    const [qp, g, p] = await Promise.all([q.quadro_pai_id ? achar('quadros', q.quadro_pai_id) : undefined, i.grupo_id ? achar('grupos', i.grupo_id) : undefined, i.item_pai_id ? achar('itens', i.item_pai_id) : undefined]);
    const qid = qp?.id ?? q.id;
    if (quadroId && qid !== quadroId) continue;
    linhas.push({ tipo: q.tipo === 'subitens' ? 'subitem' : 'item', id: i.id, nome: i.nome, quadro_nome: qp?.nome ?? q.nome, grupo_nome: p?.nome ?? g?.nome ?? null, quadro_id: qid, quando: i.excluido_em ?? i.arquivado_em, _r: 'itens' });
  }
  linhas.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  const restantes = (l: Row) => Math.max(0, DIAS_LIXEIRA - Math.floor((Date.now() - dataDe(l.quando).getTime()) / 86400000));
  const vencidas = lixeira ? linhas.filter(l => Date.now() - dataDe(l.quando).getTime() > DIAS_LIXEIRA * 86400000) : [];
  for (const l of vencidas) {
    const row = await buscar(l._r, l.id);
    if (row) await apagarDeVez(l._r, row).catch(e => console.warn('[friday] lixeira:', e));
  }
  const fora = new Set(vencidas);
  return linhas.filter(l => !fora.has(l)).slice(0, 1000).map(({ _r, ...l }) => { void _r; return { ...l, dias_restantes: lixeira ? restantes(l as Row) : null }; });
}

// ------------------------------------------------------------------ meu trabalho, busca e avisos
// Índices dos itens já existentes: gravados uma vez (marcador friday-meta/indices). Se não for possível gravar
// (ex.: regras de produção), Meu trabalho e busca voltam a ler todos os itens, como antes.
// Versão 2 (pessoas por UID, 2026-10-22): as células de pessoa perdem os ids numéricos antigos (de friday-usuarios,
// que deixou de existir) e o índice `pessoas` passa a ter só UIDs.
const VERSAO_INDICES = 2;
let indicesProntos: Promise<boolean> | null = null;
function garantirIndices(): Promise<boolean> {
  indicesProntos ??= criarIndices().catch(e => { console.warn('[friday] índices indisponíveis, lendo tudo:', e); indicesProntos = null; return false; });
  return indicesProntos;
}
async function criarIndices(): Promise<boolean> {
  const marcador = doc(db, 'friday-meta', 'indices');
  if (Number((await getDoc(marcador)).data()?.versao) >= VERSAO_INDICES) return true;
  const [itens, colunasPessoa] = await Promise.all([todos('itens'), getDocs(query(colecao('colunas'), where('tipo', '==', 'pessoa')))]);
  const pessoaPorQuadro = new Map<number, Set<string>>();
  for (const c of colunasPessoa.docs.map(d => d.data() as Row)) {
    if (!pessoaPorQuadro.has(Number(c.quadro_id))) pessoaPorQuadro.set(Number(c.quadro_id), new Set());
    pessoaPorQuadro.get(Number(c.quadro_id))!.add(String(c.id));
  }
  await emLotes(itens.map(i => lote => {
    const colunasPessoa = pessoaPorQuadro.get(Number(i.quadro_id)) ?? new Set<string>();
    const campos: unknown[] = ['busca', prefixosBusca(i.nome), 'pessoas', pessoasDosValores(i.valores, colunasPessoa)];
    for (const k of colunasPessoa) {
      const v = i.valores?.[k];
      if (!Array.isArray(v)) continue;
      const uids = v.filter(x => typeof x === 'string' && x);
      if (uids.length !== v.length) campos.push(new FieldPath('valores', k), uids.length ? uids : deleteField());
    }
    const [primeiro, valor, ...resto] = campos;
    lote.update(ref('itens', i.id), primeiro as string, valor, ...resto);
  }));
  await setDoc(marcador, { versao: VERSAO_INDICES, gravado_em: agora(), itens: itens.length });
  return true;
}

async function todos(r: Recurso) { return (await getDocs(colecao(r))).docs.map(d => d.data() as Row); }

type Consulta = { quadro: (id: unknown) => Promise<Row | undefined>; grupo: (id: unknown) => Promise<Row | undefined>; item: (id: unknown) => Promise<Row | undefined>; colunas: (quadroId: unknown) => Promise<Row[]> };

// Itens em que a pessoa aparece em alguma coluna "pessoa", de todos os quadros.
async function meuTrabalho() {
  const uid = eu().id;
  if (await garantirIndices()) {
    // Só os itens com a pessoa no índice; quadros, grupos e colunas são lidos sob demanda.
    const itens = (await getDocs(query(colecao('itens'), where('pessoas', 'array-contains', uid)))).docs.map(d => d.data() as Row);
    const achar = memoria();
    const colunas = new Map<number, Promise<Row[]>>();
    return montarMeuTrabalho(uid, itens, {
      quadro: id => achar('quadros', id), grupo: id => achar('grupos', id), item: id => achar('itens', id),
      colunas: qid => { if (!colunas.has(Number(qid))) colunas.set(Number(qid), consultar('colunas', { quadro_id: qid }).then(l => ordenar('colunas', l))); return colunas.get(Number(qid))!; },
    });
  }
  const [colunasSnap, itens, quadros, grupos] = await Promise.all([
    getDocs(query(colecao('colunas'), where('tipo', 'in', ['pessoa', 'data', 'periodo', 'status']))), todos('itens'), todos('quadros'), todos('grupos'),
  ]);
  const porQuadro = new Map<number, Row[]>();
  for (const c of ordenar('colunas', colunasSnap.docs.map(d => d.data() as Row))) porQuadro.set(Number(c.quadro_id), [...(porQuadro.get(Number(c.quadro_id)) ?? []), c]);
  const Q = new Map(quadros.map(q => [q.id, q])), G = new Map(grupos.map(g => [g.id, g])), I = new Map(itens.map(i => [i.id, i]));
  return montarMeuTrabalho(uid, itens, {
    quadro: async id => Q.get(id as number), grupo: async id => G.get(id as number), item: async id => I.get(id as number), colunas: async qid => porQuadro.get(Number(qid)) ?? [],
  });
}

async function montarMeuTrabalho(uid: string, itens: Row[], c: Consulta) {
  const out = [];
  for (const bruto of itens) {
    const i = bruto.vinculo ? await comOficiais(bruto) : bruto;
    const cs = (await c.colunas(i.quadro_id)).filter(x => ['pessoa', 'data', 'periodo', 'status'].includes(x.tipo));
    const v = i.valores ?? {};
    if (!cs.some(x => x.tipo === 'pessoa' && Array.isArray(v[String(x.id)]) && v[String(x.id)].includes(uid))) continue;
    if (!visivel(i)) continue;
    const q = await c.quadro(i.quadro_id);
    const [g, p, qp] = await Promise.all([i.grupo_id != null ? c.grupo(i.grupo_id) : undefined, i.item_pai_id != null ? c.item(i.item_pai_id) : undefined, q?.quadro_pai_id != null ? c.quadro(q.quadro_pai_id) : undefined]);
    const gp = p?.grupo_id != null ? await c.grupo(p.grupo_id) : undefined;
    if (!visivel(q) || (g && !visivel(g)) || (p && !visivel(p)) || (qp && !visivel(qp)) || (gp && !visivel(gp))) continue;
    // Data do item = a primeira coluna de data que é prazo (data de início não conta como atraso).
    const data = cs.filter(x => x.tipo === 'data' && ehPrazo(String(x.titulo), x.config ?? {})).map(x => v[String(x.id)]).find(Boolean)
      ?? cs.filter(x => x.tipo === 'periodo').map(x => v[String(x.id)]?.fim).find(Boolean) ?? null;
    // Status "principal": o primeiro que tem rótulo de concluído (evita colunas como Prioridade ou Tipo).
    const sts = cs.filter(x => x.tipo === 'status');
    const st = sts.find(x => (x.config?.rotulos ?? []).some((r: { concluido?: boolean }) => r.concluido)) ?? sts[0];
    const rotulo = st ? (st.config?.rotulos ?? []).find((r: { id: string }) => r.id === String(v[String(st.id)])) : null;
    const sub = q!.tipo === 'subitens';
    out.push({
      id: i.id, nome: sub ? `${i.nome} (subitem de ${p?.nome})` : i.nome,
      quadro_id: sub ? q!.quadro_pai_id : i.quadro_id, abrir_item_id: sub ? i.item_pai_id : i.id,
      quadro_nome: sub ? qp?.nome : q!.nome, grupo_nome: sub ? gp?.nome : g?.nome, grupo_cor: sub ? gp?.cor : g?.cor,
      data, status: rotulo ?? null, concluido: !!rotulo?.concluido,
    });
  }
  return out;
}

// Busca por nome: com os índices, consulta os itens cujo nome tem uma palavra começando pela 1ª palavra digitada
// e confere o termo inteiro aqui. Sem índices, lê os itens (com memória de 30 s) e filtra aqui.
let itensBusca: { quando: number; lista: Promise<Row[]> } | null = null;
async function busca(termo: string | undefined) {
  const t = semAcento(String(termo ?? '').trim());
  if (!t) return { quadros: [], itens: [] };
  let candidatos: Row[];
  if (await garantirIndices()) {
    const primeira = t.split(/[^a-z0-9]+/).find(Boolean)?.slice(0, 20);
    candidatos = primeira ? (await getDocs(query(colecao('itens'), where('busca', 'array-contains', primeira), limit(300)))).docs.map(d => d.data() as Row) : [];
  } else {
    if (!itensBusca || Date.now() - itensBusca.quando > 30000) itensBusca = { quando: Date.now(), lista: todos('itens') };
    candidatos = await itensBusca.lista;
  }
  const quadros = await todos('quadros');
  const Q = new Map(quadros.map(q => [q.id, q]));
  const achar = memoria();
  // Cada palavra digitada precisa aparecer no nome, em qualquer ordem ("prim quad" acha "Criar o primeiro quadro").
  const palavras = t.split(/[^a-z0-9]+/).filter(Boolean);
  const tem = (s: unknown) => { const n = semAcento(String(s ?? '')); return palavras.every(w => n.includes(w)); };
  const itens: Row[] = [];
  for (const i of candidatos.filter(x => tem(x.nome) && visivel(x)).sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)))) {
    const q = Q.get(i.quadro_id), qp = q && Q.get(q.quadro_pai_id);
    if (!visivel(q) || (qp && !visivel(qp))) continue;
    const g = i.grupo_id != null ? await achar('grupos', i.grupo_id) : undefined;
    if (g && !visivel(g)) continue;
    itens.push({ id: i.id, nome: i.nome, quadro_id: q!.quadro_pai_id ?? i.quadro_id, abrir_item_id: i.item_pai_id ?? i.id, quadro_nome: qp?.nome ?? q!.nome });
    if (itens.length >= 20) break;
  }
  return {
    quadros: quadros.filter(q => tem(q.nome) && (q.tipo ?? 'quadro') !== 'subitens' && visivel(q))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome))).slice(0, 10).map(q => ({ id: q.id, nome: q.nome, area_id: q.area_id })),
    // Subitem: abre o quadro principal no item pai.
    itens,
  };
}

/**
 * As automações rodam no servidor (Function fridayAutomacoes), depois da gravação da tela. Cada execução fica em
 * friday-execucoes; quando uma do quadro termina, `aoRodar` é chamado (com folga, para juntar várias) e a tela recarrega.
 */
export function observarAutomacoes(quadroId: number, aoRodar: () => void): () => void {
  let primeira = true;
  let espera: ReturnType<typeof setTimeout> | undefined;
  const parar = onSnapshot(query(colecao('execucoes'), where('criado_em', '>=', agora())), snap => {
    // A primeira leitura traz o que já existia: só as mudanças seguintes contam.
    if (primeira) { primeira = false; return; }
    const doQuadro = snap.docChanges().some(c => Number(c.doc.data().quadro_id) === quadroId && c.doc.data().detalhe !== 'rodando…');
    if (!doQuadro) return;
    clearTimeout(espera);
    espera = setTimeout(aoRodar, 600);
  }, e => console.warn('[friday] automações: sem atualização automática', e));
  return () => { clearTimeout(espera); parar(); };
}

// Lista do quadro com quantas vezes cada automação rodou e quando foi a última.
async function automacoesDoQuadro(quadroId: number) {
  const [automacoes, execucoes] = await Promise.all([consultar('automacoes', { quadro_id: quadroId }), consultar('execucoes', { quadro_id: quadroId })]);
  return ordenar('automacoes', automacoes).map(a => {
    const ex = execucoes.filter(e => e.automacao_id === a.id);
    return { ...a, n_execucoes: ex.length, ultima_execucao: ex.map(e => String(e.criado_em)).sort().at(-1) ?? null, n_erros: ex.filter(e => !Number(e.ok)).length };
  });
}

// ------------------------------------------------------------------ CRUD genérico
async function listar(r: Recurso, q: Record<string, string>) {
  const filtros: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) if (CAMPOS[r].includes(k)) filtros[k] = v;
  // Avisos: só os da própria pessoa.
  if (r === 'notificacoes') filtros.usuario_uid = eu().uid;
  let rows = await consultar(r, filtros);
  // Por padrão só o que está ativo; _estado=arquivado | lixeira | todos para o resto.
  if (COM_ESTADO.has(r)) {
    const e = q._estado;
    if (e === 'arquivado') rows = rows.filter(x => x.arquivado_em != null && x.excluido_em == null);
    else if (e === 'lixeira') rows = rows.filter(x => x.excluido_em != null);
    else if (e !== 'todos') rows = rows.filter(visivel);
  }
  return ordenar(r, rows).slice(0, Math.min(Number(q._limite) || 2000, 10000));
}

async function obter(r: Recurso, id: number) {
  const row = await buscar(r, id);
  if (!row || (r === 'notificacoes' && row.usuario_uid !== eu().uid)) throw new ErroApi(404, 'não encontrado');
  return row;
}

async function criar(r: Recurso, corpo: unknown) {
  if (SOMENTE_LEITURA.has(r) || r === 'anexos' || r === 'notificacoes') throw new ErroApi(405, 'use a rota própria');
  const b = { ...((corpo ?? {}) as Record<string, unknown>) };
  if (r === 'colunas' && !b.config) b.config = configPadrao(String(b.tipo));
  if (r === 'colunas' && !b.largura) b.largura = LARGURA_PADRAO[String(b.tipo)] ?? 140;
  if ((r === 'itens' || r === 'automacoes') && !b.criado_por) b.criado_por = eu().id;
  if (r === 'atualizacoes' && !b.usuario_id) b.usuario_id = eu().id;
  const dados = limpar(r, b);
  if (r === 'atualizacoes') dados.quadro_id = (await buscar('itens', dados.item_id))?.quadro_id ?? null;
  const row = await inserir(r, dados);
  if (r === 'quadros' && !b.vazio) await prepararQuadro(row.id);
  // Item (ou subitem, quando os subitens são oficiais) criado num quadro oficial: vincula ao cadastro.
  // Num cadastro existente, a Function decide: obras-v2 cria o contrato na hora; os demais deixam o item sem vínculo até a
  // próxima conciliação. O subitem novo vira uma entrada no registro do item pai, se o pai estiver vinculado (ex.: LOTE).
  if (r === 'itens') { const e = await escopoOficial(row.quadro_id); if (e) await gravarOficial(row.id, 'vincular'); }
  if (r === 'itens') await registrar({ quadro_id: row.quadro_id, item_id: row.id, item_nome: row.nome, acao: 'criou' });
  return row;
}

async function atualizar(r: Recurso, id: number, corpo: unknown) {
  if (SOMENTE_LEITURA.has(r)) throw new ErroApi(405, 'somente leitura');
  const antes = await buscar(r, id);
  if (!antes) throw new ErroApi(404, 'não encontrado');
  if (r === 'notificacoes' && antes.usuario_uid !== eu().uid) throw new ErroApi(404, 'não encontrado');
  // Atualização já publicada: só quem escreveu altera.
  if (r === 'atualizacoes' && String(antes.usuario_id) !== eu().id) throw new ErroApi(403, 'Só quem escreveu pode alterar esta atualização.');
  const dados = limpar(r, corpo);
  const mudou = Object.keys(dados).filter(k => !igual(antes[k], dados[k]));
  if (!mudou.length) return antes;
  const oficial = r === 'colunas' && mudou.includes('config') ? await campoOficialDa(antes) : null;
  if (oficial) {
    // Campo oficial: rótulos e opções podem ser acrescentados, mas não removidos (os dados oficiais usam os códigos deles).
    if (oficial.campo.rotulos?.length) {
      const novos = new Set(((((dados.config as Record<string, unknown>)?.[oficial.campo.tipo === 'status' ? 'rotulos' : 'opcoes'] ?? []) as { id: string }[]).map(x => String(x.id))));
      if (oficial.campo.rotulos.some(x => !novos.has(x.friday_id))) throw new ErroApi(409, `“${antes.titulo}” é um campo oficial: rótulos podem ser acrescentados, mas não removidos.`);
    }
  }
  const campos: Record<string, unknown> = Object.fromEntries(mudou.map(k => [k, dados[k]]));
  if (r === 'itens' || r === 'automacoes') campos.atualizado_em = agora();
  if (r === 'itens' && mudou.includes('nome') && antes.vinculo && antes.vinculo.sub == null && (await registroDe(antes.vinculo.cadastro))?.nome_espelho?.length) {
    throw new ErroApi(409, NOME_TRAVADO);
  }
  if (r === 'itens' && mudou.includes('nome')) campos.busca = prefixosBusca(dados.nome);
  await updateDoc(ref(r, id), campos as DocumentData);
  if (r === 'itens' && antes.vinculo && mudou.includes('nome')) await gravarOficial(id, 'nome');
  // Grupo oficial: item movido de grupo ou grupo renomeado — o documento oficial acompanha o nome do grupo.
  if (r === 'itens' && antes.vinculo && antes.vinculo.sub == null && mudou.includes('grupo_id')
    && (await registroDe(antes.vinculo.cadastro))?.grupo?.situacao === 'ativo') await gravarOficial(id, 'grupo');
  if (r === 'grupos' && mudou.includes('nome')) {
    const cadastro = await quadroCadastro(antes.quadro_id);
    if (cadastro && (await registroDe(cadastro))?.grupo?.situacao === 'ativo') await camposOficiais({ quadroId: Number(antes.quadro_id), op: 'grupo_nome', grupoId: id });
  }
  if (oficial && (oficial.campo.tipo === 'status' || oficial.campo.tipo === 'lista')) {
    // Rótulo renomeado, recolorido ou criado: o registro oficial acompanha (o código não muda). Se falhar, a próxima
    // gravação de valor nessa coluna sincroniza de novo.
    try { await camposOficiais({ quadroId: oficial.quadroPrincipal, op: 'rotulos', colunaId: id }); await registroDe(oficial.registro.chave, true); }
    catch (e) { console.warn('Friday: rótulos do campo oficial não sincronizados agora', e); }
  }
  if (r === 'itens') {
    if (mudou.includes('nome')) await registrar({ quadro_id: antes.quadro_id, item_id: id, item_nome: dados.nome, acao: 'renomeou', de: antes.nome, para: dados.nome });
    if (mudou.includes('grupo_id')) {
      const [de, para] = await Promise.all([buscar('grupos', antes.grupo_id), buscar('grupos', dados.grupo_id)]);
      await registrar({ quadro_id: antes.quadro_id, item_id: id, item_nome: antes.nome, acao: 'moveu', de: de?.nome ?? null, para: para?.nome ?? null });
    }
  }
  return { ...antes, ...campos };
}

async function excluir(r: Recurso, id: number, definitivo: boolean) {
  if (SOMENTE_LEITURA.has(r)) throw new ErroApi(405, 'não pode ser excluído');
  const antes = await buscar(r, id);
  if (!antes) throw new ErroApi(404, 'não encontrado');
  if (r === 'notificacoes' && antes.usuario_uid !== eu().uid) throw new ErroApi(404, 'não encontrado');
  if (r === 'atualizacoes' && String(antes.usuario_id) !== eu().id) throw new ErroApi(403, 'Só quem escreveu pode apagar esta atualização.');
  if (r === 'colunas' && await campoOficialDa(antes)) throw new ErroApi(409, `“${antes.titulo}” é um campo oficial e não pode ser excluído.`);
  // Itens, grupos e quadros vão para a lixeira (restauráveis por 30 dias).
  if (COM_ESTADO.has(r) && !definitivo) {
    await updateDoc(ref(r, id), { excluido_em: agora() });
    if (r === 'itens' && antes.vinculo) await gravarOficial(id, 'situacao');
  } else {
    // Item oficial apagado de vez: o registro oficial fica, marcado como excluído.
    if (r === 'itens' && antes.vinculo && !antes.excluido_em) { await updateDoc(ref(r, id), { excluido_em: agora() }); await gravarOficial(id, 'situacao'); }
    await apagarDeVez(r, antes);
    if (r === 'anexos' && antes.coluna_id != null) await tirarDaColuna(antes);
  }
  if (r === 'itens') await registrar({ quadro_id: antes.quadro_id, item_id: id, item_nome: antes.nome, acao: 'excluiu' });
}

// ------------------------------------------------------------------ "rotas" (o mesmo contrato do servidor do protótipo)
async function rotear(metodo: string, url: string, corpo?: unknown): Promise<unknown> {
  const [caminho, qs] = url.split('?');
  const q = Object.fromEntries(new URLSearchParams(qs ?? ''));
  const p = caminho.replace(/^\/+|\/+$/g, '').split('/');
  eu();
  if (p[0] === 'auth') {
    if (p[1] === 'eu' && metodo === 'GET') return eu();
    if (p[1] === 'sair') return { ok: true };
    throw new ErroApi(410, 'O login do Friday é o login do sistema.');
  }
  if (p[0] === 'admin' || p[0] === 'permissoes') throw new ErroApi(501, 'Pessoas e permissões chegam na etapa de credenciais.');
  if (p[0] === 'busca' && metodo === 'GET') return busca(q.q);
  if (p[0] === 'meu-trabalho' && metodo === 'GET') return meuTrabalho();
  if (p[0] === 'arquivo' && metodo === 'GET') return arquivo(q.estado, Number(q.quadro_id) || null);
  if (p[0] === 'quadros' && p.length === 3) {
    const id = Number(p[1]);
    if (p[2] === 'completo' && metodo === 'GET') return completo(id);
    if (p[2] === 'subitens' && metodo === 'POST') return criarSubitens(id);
    if (p[2] === 'importar' && metodo === 'POST') return importar(id, corpo);
    if (p[2] === 'duplicar' && metodo === 'POST') return duplicarQuadro(id, corpo);
    if (p[2] === 'automacoes' && metodo === 'GET') return automacoesDoQuadro(id);
  }
  if (p[0] === 'itens' && p[2] === 'duplicar' && metodo === 'POST') return duplicarItem(Number(p[1]));
  if (p[0] === 'itens' && p[2] === 'valor' && metodo === 'PATCH') return definirValor(Number(p[1]), corpo);
  if (p.length === 3 && (p[2] === 'arquivar' || p[2] === 'restaurar') && metodo === 'POST') return mudarEstado(recurso(p[0]), Number(p[1]), p[2]);
  const r = recurso(p[0]);
  if (p.length === 1 && metodo === 'GET') return listar(r, q);
  if (p.length === 1 && metodo === 'POST') return criar(r, corpo);
  if (p.length === 2) {
    const id = Number(p[1]);
    if (metodo === 'GET') return obter(r, id);
    if (metodo === 'PATCH') return atualizar(r, id, corpo);
    if (metodo === 'DELETE') return excluir(r, id, !!q.definitivo);
  }
  throw new ErroApi(404, `rota desconhecida: ${metodo} ${url}`);
}

export async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  try {
    return (await rotear(method.toUpperCase(), url, body)) as T;
  } catch (e) {
    if (e instanceof ErroApi && e.status === 401) window.dispatchEvent(new Event(SEM_SESSAO));
    // Recusa das regras do Firestore: mensagem em português.
    if ((e as { code?: string }).code === 'permission-denied') throw new Error('Sem permissão para esta ação no Friday.');
    throw e;
  }
}

// Anexos: o arquivo vai para o Storage (friday/<quadro>/<item>/<anexo>-<nome>) e o registro para friday-anexos.
const LIMITE_ANEXO = 25 * 1024 * 1024;
export async function enviarArquivo(itemId: number, arquivo: File, atualizacaoId?: number, colunaId?: number): Promise<Row> {
  if (arquivo.size > LIMITE_ANEXO) throw new Error(`“${arquivo.name}” passa de 25 MB, o limite por arquivo.`);
  const item = await buscar('itens', itemId);
  if (!item) throw new Error('Item não encontrado.');
  const id = novoId();
  const caminho = `friday/${item.quadro_id}/${itemId}/${id}-${arquivo.name.replace(/[/\\]/g, '_')}`;
  const mime = arquivo.type || 'application/octet-stream';
  const alvo = refArquivo(storage, caminho);
  try {
    await uploadBytes(alvo, arquivo, { contentType: mime, contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(arquivo.name)}` });
  } catch (e) {
    if ((e as { code?: string }).code === 'storage/unauthorized') throw new Error(`Sem permissão para anexar “${arquivo.name}”.`);
    throw e;
  }
  try {
    const row: Row = {
      id, item_id: itemId, quadro_id: item.quadro_id, atualizacao_id: atualizacaoId ?? null, coluna_id: colunaId ?? null, nome: arquivo.name, mime,
      tamanho: arquivo.size, arquivo: caminho, url: await getDownloadURL(alvo), usuario_id: eu().id, criado_em: agora(), origem_id: null,
    };
    await setDoc(ref('anexos', id), row);
    return row;
  } catch (e) {
    await deleteObject(alvo).catch(() => undefined);
    throw e;
  }
}

// Cópia única dos arquivos que vieram do monday só com o nome (Function fridayAnexosMonday, só adm2). Cada chamada copia
// o que couber no tempo e diz quantos faltam.
export const copiarArquivosMonday = httpsCallable<{ quadroId: number }, { copiados: number; restantes: number; falhas: string[] }>(
  functions, 'fridayAnexosMonday', { timeout: 560_000 });

export const api = {
  list: (r: string, filtros: Record<string, string | number> = {}) => {
    const q = new URLSearchParams(Object.entries(filtros).map(([k, v]) => [k, String(v)])).toString();
    return req<Row[]>('GET', q ? `${r}?${q}` : r);
  },
  get: (r: string, id: number) => req<Row>('GET', `${r}/${id}`),
  create: (r: string, dados: Record<string, unknown>) => req<Row>('POST', r, dados),
  update: (r: string, id: number, dados: Record<string, unknown>) => req<Row>('PATCH', `${r}/${id}`, dados),
  remove: (r: string, id: number) => req<void>('DELETE', `${r}/${id}`),
};
