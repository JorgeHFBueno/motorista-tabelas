/* Migração da pasta CRM LEDUR do Friday para o Comercial (comercial-negocios, sua subcoleção atualizacoes, e
 * comercial-contatos). Contrato: The Manuscript, 01_FIRESTORE/COLECOES/comercial.md (seção "Migração do Friday").
 *
 * Empacotar (da pasta do repositório WEB):
 *   npx esbuild tools/migrar-crm-friday/migrar.ts --bundle --platform=node --format=esm --outfile=<scratchpad>/migrar-crm.mjs
 * Rodar:
 *   node <scratchpad>/migrar-crm.mjs <pasta-de-saida>                       → simulação: lê o Friday, grava plano e relatório. Não grava nada.
 *   node <scratchpad>/migrar-crm.mjs <pasta-de-saida> --emulador 127.0.0.1:8080 --storage-emulador 127.0.0.1:9199
 *                                                                            → ensaio: lê a produção e grava no emulador (o app em --mode emulador mostra).
 *   node <scratchpad>/migrar-crm.mjs <pasta-de-saida> --aplicar             → grava na produção, com pré-condição "não existe" em cada documento
 *                                                                              (rodar de novo não duplica nem sobrescreve) e relê para conferir.
 *   ... --so-arquivos (com --aplicar ou --emulador)                         → refaz só a cópia dos arquivos, se ela falhou depois da gravação.
 * Lê com a sessão do Firebase CLI (firebase login) da conta do responsável; a REST com essa conta não passa pelas Rules.
 * Não mexe no Friday: arquivar a pasta CRM LEDUR é um passo à parte, depois da conferência. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  cargoDe, categoriaContatoDe, dataDe, etapaDoItem, idAtualizacao, idContato, idNegocio, instanteDe, motivoDe, numeroDe, origemDe,
  prioridadeDe, quadroDoNegocio, textoComMencoes, tipoContatoDe,
} from './mapeamento';

const args = process.argv.slice(2);
const saida = args.find((a) => !a.startsWith('--') && !/^\d+\.\d+\.\d+\.\d+:\d+$/.test(a));
if (!saida) throw new Error('Uso: node migrar-crm.mjs <pasta-de-saida> [--aplicar | --emulador host:porta --storage-emulador host:porta]');
const opcao = (nome: string) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : null; };
const APLICAR = args.includes('--aplicar');
const EMULADOR = opcao('--emulador');
const STORAGE_EMULADOR = opcao('--storage-emulador');
const SO_ARQUIVOS = args.includes('--so-arquivos');
if (APLICAR && EMULADOR) throw new Error('--aplicar e --emulador não vão juntos.');
fs.mkdirSync(saida, { recursive: true });

const PROJETO = 'app-motor-api';
const BUCKET = 'app-motor-api.firebasestorage.app';
const DB = `projects/${PROJETO}/databases/(default)`;
const PASTA = 'CRM LEDUR';
const CLI_ROOT = 'C:/Users/TI_R3TR0/AppData/Roaming/npm/node_modules/firebase-tools/lib';
const req = createRequire(import.meta.url);
const auth = req(`${CLI_ROOT}/auth`);
const api = req(`${CLI_ROOT}/apiv2`);
const conta = auth.getGlobalDefaultAccount();
if (!conta?.tokens?.refresh_token) throw new Error('Sem sessão do Firebase CLI (rode firebase login).');
api.setRefreshToken(conta.tokens.refresh_token);
const token = async () => (await api.getAccessToken()) as string;

async function pedir(url: string, init: RequestInit & { emulador?: boolean } = {}) {
  const headers = { ...(init.headers as Record<string, string>), Authorization: `Bearer ${init.emulador ? 'owner' : await token()}` };
  const r = await fetch(url, { ...init, headers });
  if (!r.ok) throw Object.assign(new Error(`${r.status} ${url}: ${(await r.text()).slice(0, 400)}`), { status: r.status });
  return r;
}
const json = async (url: string, corpo?: unknown, emulador = false) =>
  (await pedir(url, { method: corpo ? 'POST' : 'GET', body: corpo ? JSON.stringify(corpo) : undefined, headers: { 'Content-Type': 'application/json' }, emulador })).json();

// ---------------------------------------------------------------- Firestore REST
type V = Record<string, unknown>;
const dv = (v: any): any => ('nullValue' in v ? null : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue
  : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'timestampValue' in v ? new Date(v.timestampValue)
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dv(x)]))
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(dv) : v);
const ev = (v: unknown): any => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(ev) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as V).map(([k, x]) => [k, ev(x)])) } };
};
const prod = `https://firestore.googleapis.com/v1/${DB}`;

async function consulta(col: string, campo: string, valor: number | string): Promise<V[]> {
  const value = typeof valor === 'number' ? { integerValue: String(valor) } : { stringValue: valor };
  const r = await json(`${prod}/documents:runQuery`, { structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value } } } });
  return (r as any[]).filter((x) => x.document).map((x) => ({ _id: x.document.name.split('/').pop(), ...Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, y]) => [k, dv(y)])) }));
}

async function colecaoInteira(col: string): Promise<V[]> {
  const out: V[] = [];
  let pagina = '';
  do {
    const r: any = await json(`${prod}/documents/${col}?pageSize=300${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''}`);
    for (const d of r.documents ?? []) out.push({ _id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, y]) => [k, dv(y)])) });
    pagina = r.nextPageToken ?? '';
  } while (pagina);
  return out;
}

// ---------------------------------------------------------------- leitura do Friday
const ativo = (x: V) => !x.arquivado_em && !x.excluido_em;
const pastas = (await consulta('friday-pastas', 'nome', PASTA)).filter(ativo);
if (pastas.length !== 1) throw new Error(`Esperava 1 pasta "${PASTA}" ativa, achei ${pastas.length}.`);
const quadros = (await consulta('friday-quadros', 'pasta_id', Number(pastas[0].id))).filter((q) => ativo(q) && q.tipo === 'quadro');
const funcionarios = await colecaoInteira('funcionarios');
const nomes: Record<string, string> = Object.fromEntries(funcionarios.map((f) => [String(f._id), String(f.nome ?? '')]));

type Coluna = { id: string; titulo: string; tipo: string; config: any };
type Quadro = { id: number; nome: string; colunas: Coluna[]; grupos: Record<string, string>; itens: V[]; atualizacoes: V[]; anexos: V[] };
const lidos: Quadro[] = [];
for (const q of quadros) {
  const id = Number(q.id);
  const colunas = (await consulta('friday-colunas', 'quadro_id', id)).filter(ativo).map((c) => ({ id: String(c.id), titulo: String(c.titulo), tipo: String(c.tipo), config: c.config ?? {} }));
  const grupos = Object.fromEntries((await consulta('friday-grupos', 'quadro_id', id)).map((g) => [String(g.id), String(g.nome)]));
  const itens = (await consulta('friday-itens', 'quadro_id', id)).filter((i) => ativo(i) && !i.item_pai_id);
  lidos.push({ id, nome: String(q.nome), colunas, grupos, itens, atualizacoes: await consulta('friday-atualizacoes', 'quadro_id', id), anexos: await consulta('friday-anexos', 'quadro_id', id) });
}

const colunaDe = (q: Quadro, ...titulos: string[]) => q.colunas.find((c) => titulos.some((t) => c.titulo.toLowerCase() === t.toLowerCase())) ?? null;
const valorDe = (i: V, c: Coluna | null) => (c ? (i.valores as V | undefined)?.[c.id] : undefined);
const rotuloDe = (i: V, c: Coluna | null): string | null => {
  const v = valorDe(i, c);
  if (v == null || !c) return null;
  const r = Object.values(c.config.rotulos ?? {}).find((x: any) => String(x.id) === String(v)) as any;
  return r ? String(r.texto ?? r.nome ?? '') || null : null;
};
const opcoesDe = (i: V, c: Coluna | null): string[] => {
  const v = valorDe(i, c);
  if (!Array.isArray(v) || !c) return [];
  return v.map((id) => (c.config.opcoes ?? []).find((o: any) => String(o.id) === String(id))).filter(Boolean).map((o: any) => String(o.texto ?? o.nome ?? ''));
};
const textoDe = (i: V, c: Coluna | null) => { const v = valorDe(i, c); return typeof v === 'string' && v.trim() ? v.trim() : null; };
const listaDe = (i: V, c: Coluna | null) => { const v = valorDe(i, c); return Array.isArray(v) ? v.map(String) : []; };
const dataDoItem = (i: V) => (instanteDe(i.criado_em) ? new Date(instanteDe(i.criado_em)!.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10) : null);

// ---------------------------------------------------------------- tradução
const relatorio: Record<string, unknown> = { lidoEm: new Date().toISOString(), pasta: pastas[0].id, quadros: lidos.map((q) => ({ id: q.id, nome: q.nome, itens: q.itens.length })) };
const avisos: string[] = [];
const contar = (chave: string) => { (relatorio[chave] as number | undefined) ?? (relatorio[chave] = 0); relatorio[chave] = (relatorio[chave] as number) + 1; };
// Quem "criou" o que veio do Friday: não é um funcionário (uid fixo), para a tela mostrar a origem.
const MIGRACAO = { uid: 'migracao-friday', nome: 'Migração do Friday' };
const agora = new Date();

type Escrita = { caminho: string; dados: V };
const escritas: Escrita[] = [];
const copias: { de: string; para: string; nome: string; contentType: string }[] = [];

// Contatos primeiro: os negócios ligam neles pelo id novo.
const qContatos = lidos.find((q) => q.nome.toLowerCase() === 'contatos');
if (!qContatos) throw new Error('Quadro Contatos não encontrado.');
const contatoIds = new Set<string>();
for (const i of qContatos.itens) {
  const id = idContato(String(i.id));
  contatoIds.add(String(i.id));
  escritas.push({ caminho: `comercial-contatos/${id}`, dados: {
    schemaVersion: 1,
    nome: String(i.nome ?? '').trim() || 'Sem nome',
    tipo: tipoContatoDe(rotuloDe(i, colunaDe(qContatos, 'Tipo'))),
    categoria: categoriaContatoDe(qContatos.grupos[String(i.grupo_id)] ?? null),
    empresa: textoDe(i, colunaDe(qContatos, 'Empresa')),
    cargo: cargoDe(opcoesDe(i, qContatos.colunas.find((c) => c.titulo === 'Titulo') ?? null), textoDe(i, qContatos.colunas.find((c) => c.titulo === 'Título') ?? null)),
    email: textoDe(i, colunaDe(qContatos, 'E-mail')),
    telefone: textoDe(i, colunaDe(qContatos, 'Telefone')),
    notas: textoDe(i, colunaDe(qContatos, 'Notas')),
    origemFriday: { quadroId: qContatos.id, itemId: Number(i.id), quadro: qContatos.nome },
    criadoPor: MIGRACAO, registradoEm: instanteDe(i.criado_em) ?? agora, atualizadoPor: MIGRACAO, atualizadoEm: agora,
    excluidoEm: null, excluidoPor: null,
  } });
  contar('contatos');
}

for (const q of lidos) {
  const qual = quadroDoNegocio(q.nome);
  if (!qual) { if (q !== qContatos) avisos.push(`Quadro fora da migração: ${q.nome}`); continue; }
  const c = {
    responsavel: colunaDe(q, 'Responsável'), cliente: colunaDe(q, 'Nome do Cliente'), contato: colunaDe(q, 'Informações do contato'),
    prioridade: colunaDe(q, 'Prioridade'), origem: colunaDe(q, 'Fonte do Lead', 'Canal de aquisição'), etapa: colunaDe(q, 'Etapa'),
    valor: colunaDe(q, 'Valor do negócio'), metragem: colunaDe(q, 'Metragem quadrada'), criacao: colunaDe(q, 'Data de criação do negócio'),
    fechamento: colunaDe(q, 'Data de fechamento'), motivo: colunaDe(q, 'Status'), referencias: colunaDe(q, 'Referências'), projeto: colunaDe(q, 'Projeto Pronto'),
  };
  for (const i of q.itens) {
    const id = idNegocio(String(i.id));
    const { etapa, fonte } = etapaDoItem(rotuloDe(i, c.etapa), q.grupos[String(i.grupo_id)] ?? null, qual.segmento);
    contar(`etapaPor_${fonte}`);
    const rotOrigem = rotuloDe(i, c.origem);
    const origem = origemDe(rotOrigem);
    if (rotOrigem && !origem) contar(`origemDescartada_${rotOrigem}`);
    const responsaveis = listaDe(i, c.responsavel).slice(0, 10);
    if (responsaveis.some((u) => !nomes[u])) contar('responsavelSemFuncionario');
    const ligados = listaDe(i, c.contato).filter((x) => contatoIds.has(x)).map(idContato);
    const dataCriacao = dataDe(valorDe(i, c.criacao)) ?? dataDoItem(i);
    if (!dataDe(valorDe(i, c.criacao))) contar('dataCriacaoDoItem');
    if (!dataCriacao) { avisos.push(`Sem data de criação, ficou fora: ${q.nome} / ${i.id}`); continue; }
    const situacaoFechada = etapa === 'ganho' || etapa === 'perdido' || etapa === 'pos_venda';
    const motivo = etapa === 'perdido' ? motivoDe(rotuloDe(i, c.motivo)) : null;

    // Arquivos reais (friday-anexos, no Storage) são copiados; os das colunas que ficaram no monday viram uma nota.
    const anexos = q.anexos.filter((a) => String(a.item_id) === String(i.id) && !a.excluido_em && typeof a.arquivo === 'string');
    const arquivos = anexos.map((a) => {
      const grupo = String(a.coluna_id) === c.projeto?.id ? 'projeto' : String(a.coluna_id) === c.referencias?.id ? 'referencias' : 'outros';
      const nome = String(a.nome ?? 'arquivo');
      const para = `comercial/negocios/${id}/${a._id}-${nome.replace(/[\\/#?[\]]/g, '_')}`;
      copias.push({ de: String(a.arquivo), para, nome, contentType: String(a.mime || 'application/octet-stream') });
      return { path: para, nome, contentType: String(a.mime || 'application/octet-stream'), bytes: Number(a.tamanho ?? 0), grupo };
    });
    const soMonday = (col: Coluna | null, rotulo: string) => {
      const v = valorDe(i, col);
      return Array.isArray(v) ? v.filter((x: any) => x && !x.arquivo && !x.anexo_id && x.monday_asset).map((x: any) => `${rotulo}: ${x.nome}`) : [];
    };
    const pendentes = [...soMonday(c.referencias, 'Referências'), ...soMonday(c.projeto, 'Projeto pronto')];

    escritas.push({ caminho: `comercial-negocios/${id}`, dados: {
      schemaVersion: 1,
      titulo: String(i.nome ?? '').trim().slice(0, 200) || 'Sem nome',
      cliente: textoDe(i, c.cliente)?.slice(0, 200) ?? null,
      segmento: qual.segmento, tipo: qual.tipo, etapa, responsaveis,
      prioridade: prioridadeDe(rotuloDe(i, c.prioridade)), origem,
      valor: numeroDe(valorDe(i, c.valor), c.valor?.config?.x10 === true),
      metragem: numeroDe(valorDe(i, c.metragem), c.metragem?.config?.x10 === true),
      dataCriacao,
      dataFechamento: dataDe(valorDe(i, c.fechamento)) ?? null,
      motivoPerda: motivo,
      contatoIds: ligados, arquivos,
      origemFriday: { quadroId: q.id, itemId: Number(i.id), quadro: q.nome },
      criadoPor: MIGRACAO, registradoEm: instanteDe(i.criado_em) ?? agora, atualizadoPor: MIGRACAO, atualizadoEm: agora,
      excluidoEm: null, excluidoPor: null,
    } });
    contar(`negocios_${qual.segmento}_${qual.tipo}`);
    if (situacaoFechada && !dataDe(valorDe(i, c.fechamento))) contar('fechadoSemData');
    if (etapa === 'perdido' && !motivo) contar('perdidoSemMotivo');

    for (const a of q.atualizacoes.filter((x) => String(x.item_id) === String(i.id) && !x.excluido_em)) {
      const uid = typeof a.usuario_id === 'string' ? a.usuario_id : '';
      const nome = (uid && nomes[uid]) || (a.autor_monday ? `${a.autor_monday} (monday)` : 'Sem autor');
      const texto = textoComMencoes(String(a.texto ?? ''), nomes).trim();
      if (!texto) continue;
      escritas.push({ caminho: `comercial-negocios/${id}/atualizacoes/${idAtualizacao(String(a.id ?? a._id))}`, dados: {
        texto: texto.slice(0, 5000), autor: { uid, nome }, criadoEm: instanteDe(a.criado_em) ?? agora,
      } });
      contar('atualizacoes');
    }
    if (pendentes.length) {
      escritas.push({ caminho: `comercial-negocios/${id}/atualizacoes/fd-${i.id}-arquivos`, dados: {
        texto: `Arquivos que estavam no monday e não vieram para o Friday nem para cá:\n${pendentes.map((p) => `• ${p}`).join('\n')}`,
        autor: MIGRACAO, criadoEm: instanteDe(i.criado_em) ?? agora,
      } });
      contar('notasArquivosMonday');
      relatorio.arquivosSoNoMonday = ((relatorio.arquivosSoNoMonday as number) ?? 0) + pendentes.length;
    }
  }
}
relatorio.avisos = avisos;
relatorio.escritas = escritas.length;
relatorio.copiasStorage = copias.length;
fs.writeFileSync(path.join(saida, 'plano.json'), JSON.stringify({ escritas, copias }, (_k, v) => (v instanceof Date ? v.toISOString() : v), 2));
fs.writeFileSync(path.join(saida, 'relatorio.json'), JSON.stringify(relatorio, null, 2));
console.log(JSON.stringify(relatorio, null, 2));

// ---------------------------------------------------------------- gravação
if (!APLICAR && !EMULADOR) { console.log('\nSimulação: nada foi gravado.'); process.exit(0); }

const destino = EMULADOR ? `http://${EMULADOR}/v1/${DB}` : prod;
const nomeDoc = (caminho: string) => `${DB}/documents/${caminho}`;
for (let k = 0; !SO_ARQUIVOS && k < escritas.length; k += 400) {
  const lote = escritas.slice(k, k + 400).map((e) => ({
    update: { name: nomeDoc(e.caminho), fields: Object.fromEntries(Object.entries(e.dados).map(([x, y]) => [x, ev(y)])) },
    currentDocument: { exists: false },
  }));
  await json(`${destino}/documents:commit`, { writes: lote }, Boolean(EMULADOR));
  console.log(`gravados ${Math.min(k + 400, escritas.length)} de ${escritas.length}`);
}

for (const c of copias) {
  const baixar = await pedir(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(c.de)}?alt=media`);
  const corpo = Buffer.from(await baixar.arrayBuffer());
  const base = STORAGE_EMULADOR ? `http://${STORAGE_EMULADOR}` : 'https://storage.googleapis.com';
  await pedir(`${base}/upload/storage/v1/b/${BUCKET}/o?uploadType=media&ifGenerationMatch=0&name=${encodeURIComponent(c.para)}`, {
    method: 'POST', body: corpo, headers: { 'Content-Type': c.contentType }, emulador: Boolean(STORAGE_EMULADOR),
  });
  console.log(`arquivo copiado: ${c.para}`);
}

// Conferência: relê cada negócio e contato gravado.
let conferidos = 0;
for (const e of escritas.filter((x) => !x.caminho.includes('/atualizacoes/'))) {
  await json(`${destino}/documents/${e.caminho}`, undefined, Boolean(EMULADOR));
  conferidos += 1;
}
console.log(`\nConferidos ${conferidos} documentos (negócios e contatos) no ${EMULADOR ? 'emulador' : 'Firestore de produção'}.`);
