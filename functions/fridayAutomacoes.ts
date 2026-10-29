// Executor das automações do Friday (friday-automacoes). Tudo interno: só lê e grava as coleções do Friday e, nos
// quadros oficiais, o cadastro pela mesma gravação da tela (fridayCadastros.ts). Nada sai para fora.
// - Gatilhos de item ("criado", "coluna mudou", "movido"): cada mudança feita na tela grava uma atividade em
//   friday-atividades (criou / alterou / moveu); a atividade nova dispara as automações do quadro. Assim os campos
//   oficiais (cujo valor vive no cadastro, não no item) também disparam.
// - "Data chegar": rodada a cada 10 minutos, uma vez por item e dia.
// O que as automações fazem fica registrado em friday-execucoes (histórico) e em friday-atividades com automacao_id.
// Atividades com automacao_id não disparam outras automações (evita repetição em cadeia).
// Contrato: The Manuscript, 03_APLICACAO_WEB/13_FRIDAY_GESTAO_INTERNA.md e 01_FIRESTORE/COLECOES/friday.md.
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { gravarNoCadastro } from './fridayCadastros.js';
import { indicePessoas, valorDoOficial, type CampoOficial } from './fridayCadastroConverter.js';
import { lerCaminho } from './fridayCadastrosExistentes.js';
import { dataLocal, novoId, pessoasDosValores, prefixosBusca } from './fridayMondayConverter.js';
import {
  ACOES_SUPORTADAS, chaveDaData, chaveDoEvento, comNome, condicoesValem, diaDoGatilhoData, gatilhoDispara, textoDoValor, valorDefinido,
  type Acao, type Automacao, type Coluna, type ItemVisto,
} from './fridayAutomacoesRegras.js';

type AnyRecord = Record<string, any>;
const REGIAO = 'southamerica-east1';
const ACOES_DE_EVENTO = new Set(['criou', 'alterou', 'moveu']);

const colecao = (r: string) => db.collection(`friday-${r}`);
const ler = async (r: string, id: unknown) => (id == null ? undefined : (await colecao(r).doc(String(id)).get()).data());
const visivel = (x: AnyRecord | undefined) => !!x && x.arquivado_em == null && x.excluido_em == null;
const hojeLocal = () => dataLocal().slice(0, 10);

// ---------------------------------------------------------------- leitura do item (valores livres + oficiais)
type Contexto = { colunas: Coluna[]; cadastros: Map<string, Promise<AnyRecord | undefined>>; nomes: Map<string, string> };
const novoContexto = (colunas: Coluna[]): Contexto => ({ colunas, cadastros: new Map(), nomes: new Map() });
const colunasDo = async (quadroId: number) => (await colecao('colunas').where('quadro_id', '==', quadroId).get()).docs.map(d => d.data() as Coluna);

function registroDe(ctx: Contexto, chave: string) {
  if (!ctx.cadastros.has(chave)) ctx.cadastros.set(chave, db.collection('friday-cadastros').doc(chave).get().then(s => s.data()));
  return ctx.cadastros.get(chave)!;
}
/** Campos oficiais ativos do escopo do item (quadro principal ou subitens). */
function camposDoItem(registro: AnyRecord | undefined, item: AnyRecord): CampoOficial[] {
  if (!registro || registro.situacao !== 'ativo') return [];
  const campos = (item.vinculo?.sub != null ? registro.subitens?.campos : registro.campos) ?? [];
  return (campos as (CampoOficial & { secundario?: boolean })[]).filter(c => c.situacao === 'ativo' && !c.secundario);
}
type Lido = { visto: ItemVisto; registro?: AnyRecord; campos: CampoOficial[]; oficial?: AnyRecord };
/** O item como a tela vê: os valores oficiais (que vivem no cadastro) encaixados nas colunas. */
async function lerItem(ctx: Contexto, item: AnyRecord, oficialPronto?: AnyRecord): Promise<Lido> {
  const valores = { ...(item.valores ?? {}) };
  const base = { id: Number(item.id), nome: item.nome, grupo_id: item.grupo_id ?? null, criado_por: item.criado_por ?? null };
  if (!item.vinculo?.cadastro) return { visto: { ...base, valores }, campos: [] };
  const registro = await registroDe(ctx, String(item.vinculo.cadastro));
  const campos = camposDoItem(registro, item);
  if (!campos.length) return { visto: { ...base, valores }, registro, campos };
  const doc = oficialPronto ?? (await db.collection(String(registro!.colecao)).doc(String(item.vinculo.id)).get()).data();
  const oficial = item.vinculo.sub != null ? doc?.[String(registro!.subitens?.chave)]?.[String(item.vinculo.sub)] : doc;
  for (const c of campos) {
    const v = valorDoOficial(c, lerCaminho(oficial, c.chave));
    if (v === undefined) delete valores[String(c.coluna_id)]; else valores[String(c.coluna_id)] = v;
  }
  return { visto: { ...base, valores }, registro, campos, oficial };
}

async function nomePessoa(ctx: Contexto, uid: string) {
  if (!ctx.nomes.has(uid)) ctx.nomes.set(uid, String((await db.collection('funcionarios').doc(uid).get()).data()?.nome ?? '?'));
  return ctx.nomes.get(uid)!;
}
async function textoLegivel(ctx: Contexto, coluna: Coluna, v: unknown) {
  if (coluna.tipo === 'pessoa' && Array.isArray(v)) for (const u of v) await nomePessoa(ctx, String(u));
  return textoDoValor(coluna, v, u => ctx.nomes.get(u) ?? '?');
}

// ---------------------------------------------------------------- gravações
async function registrar(a: AnyRecord, automacaoId: number) {
  const id = novoId();
  await colecao('atividades').doc(String(id)).set({
    id, quadro_id: Number(a.quadro_id), item_id: a.item_id ?? null, item_nome: a.item_nome ?? null, usuario_id: null, automacao_id: automacaoId, acao: a.acao,
    coluna_id: a.coluna_id ?? null, coluna_titulo: a.coluna_titulo ?? null, de: a.de ?? null, para: a.para ?? null, criado_em: dataLocal(),
  });
}

/** Item novo (como o `inserir` da tela) no fim do grupo, ou dos subitens do pai. */
async function criarItem(dados: { quadro_id: number; grupo_id: number | null; item_pai_id?: number | null; nome: string; criado_por: string | null }) {
  const irmaos = dados.item_pai_id != null
    ? await colecao('itens').where('item_pai_id', '==', dados.item_pai_id).get()
    : await colecao('itens').where('grupo_id', '==', dados.grupo_id).get();
  const posicao = Math.max(0, ...irmaos.docs.map(d => Number(d.data().posicao) || 0)) + 1;
  const t = dataLocal(), id = novoId(), nome = dados.nome.slice(0, 500);
  const row = {
    id, quadro_id: dados.quadro_id, grupo_id: dados.grupo_id, item_pai_id: dados.item_pai_id ?? null, nome, posicao, valores: {}, criado_por: dados.criado_por,
    criado_em: t, atualizado_em: t, origem_id: null, arquivado_em: null, excluido_em: null, pessoas: [], busca: prefixosBusca(nome),
  };
  await colecao('itens').doc(String(id)).set(row);
  return row;
}

/** Item novo num quadro oficial vira registro do cadastro (como a tela faz ao criar). */
async function vincularSeOficial(quadroId: number, itemId: number, uid: string) {
  const quadro = await ler('quadros', quadroId);
  const sub = quadro?.tipo === 'subitens';
  const principal = sub ? await ler('quadros', quadro!.quadro_pai_id) : quadro;
  if (!principal?.cadastro) return;
  // Subitem: só quando os subitens deste quadro também são oficiais (mesma regra da tela).
  if (sub) {
    const s = (await db.collection('friday-cadastros').doc(String(principal.cadastro)).get()).data()?.subitens;
    if (s?.situacao !== 'ativo' || Number(s.quadro_id) !== quadroId) return;
  }
  await gravarNoCadastro(uid, itemId, 'vincular', null, null);
}

const COLUNAS_SUBITENS: [string, string, AnyRecord, number][] = [
  ['Responsável', 'pessoa', {}, 110],
  ['Status', 'status', { rotulos: [
    { id: '1', texto: 'Em andamento', cor: '#fdab3d' }, { id: '2', texto: 'Feito', cor: '#00a36c', concluido: true },
    { id: '3', texto: 'Parado', cor: '#e2445c' }, { id: '0', texto: '', cor: '#c4c4c4' },
  ] }, 140],
  ['Data', 'data', {}, 120],
];
/** Quadro de subitens e o grupo onde os subitens entram (cria na primeira vez, como a tela). */
async function subquadroDe(pai: AnyRecord): Promise<{ quadroId: number; grupoId: number }> {
  const subs = (await colecao('quadros').where('quadro_pai_id', '==', Number(pai.id)).where('tipo', '==', 'subitens').get()).docs
    .map(d => d.data()).sort((a, b) => (Number(a.posicao) || 0) - (Number(b.posicao) || 0) || Number(a.id) - Number(b.id));
  const t = dataLocal();
  let quadroId = subs[0]?.id as number | undefined;
  if (quadroId == null) {
    quadroId = novoId();
    await colecao('quadros').doc(String(quadroId)).set({
      id: quadroId, area_id: pai.area_id ?? null, pasta_id: null, nome: `Subitens de ${pai.nome}`, descricao: null, posicao: 0, favorito: 0, nome_item: 'Subitem',
      criado_em: t, tipo: 'subitens', quadro_pai_id: Number(pai.id), origem_id: null, arquivado_em: null, excluido_em: null, restrito: 0, cadastro: null,
    });
    for (const [k, [titulo, tipo, config, largura]] of COLUNAS_SUBITENS.entries()) {
      const id = novoId();
      await colecao('colunas').doc(String(id)).set({ id, quadro_id: quadroId, titulo, tipo, config, largura, posicao: k + 1, oculta: 0, origem_id: null });
    }
  }
  const grupos = (await colecao('grupos').where('quadro_id', '==', quadroId).get()).docs.map(d => d.data()).filter(visivel)
    .sort((a, b) => (Number(a.posicao) || 0) - (Number(b.posicao) || 0) || Number(a.id) - Number(b.id));
  if (grupos[0]) return { quadroId, grupoId: Number(grupos[0].id) };
  const grupoId = novoId();
  await colecao('grupos').doc(String(grupoId)).set({ id: grupoId, quadro_id: quadroId, nome: 'Subitens', cor: '#579bfc', posicao: 1, recolhido: 0, arquivado_em: null, excluido_em: null, origem_id: null });
  return { quadroId, grupoId };
}

// ---------------------------------------------------------------- ações
/** Quem fica como autor nas gravações do cadastro oficial: quem criou a automação. */
const autor = (a: Automacao) => String(a.criado_por || 'automacao');
/** Faz uma ação no item. Devolve o que foi feito (para o histórico); erro = exceção. */
async function fazerAcao(acao: Acao, a: Automacao, itemId: number, ctx: Contexto): Promise<string> {
  const ref = colecao('itens').doc(String(itemId));
  const item = (await ref.get()).data();
  if (!item || item.excluido_em) throw new Error('o item não existe mais');
  if (!ACOES_SUPORTADAS.has(acao.tipo)) throw new Error(acao.tipo === 'webhook' ? 'webhook não roda: o Friday é interno' : `a ação "${acao.tipo}" não está disponível`);
  const quadroId = Number(item.quadro_id);

  if (acao.tipo === 'definir') {
    const coluna = ctx.colunas.find(c => c.id === Number(acao.coluna_id));
    if (!coluna) throw new Error('a coluna da ação não existe mais neste quadro');
    const lido = await lerItem(ctx, item);
    const valor = valorDefinido(acao, coluna, lido.visto, hojeLocal());
    const antes = lido.visto.valores[String(coluna.id)];
    if (JSON.stringify(antes ?? null) === JSON.stringify(valor ?? null)) return `${coluna.titulo}: já estava assim`;
    const campo = lido.campos.find(c => c.coluna_id === coluna.id);
    if (campo) {
      if ((campo as CampoOficial & { somente_leitura?: boolean }).somente_leitura) throw new Error(`“${coluna.titulo}” é só leitura (vem do cadastro)`);
      await gravarNoCadastro(autor(a), itemId, 'valor', coluna.id, valor ?? null);
      await ref.update({ atualizado_em: dataLocal() });
    } else {
      const valores = { ...(item.valores ?? {}) };
      if (valor === undefined) delete valores[String(coluna.id)]; else valores[String(coluna.id)] = valor;
      const extra: unknown[] = [];
      if (coluna.tipo === 'pessoa') {
        const livres = new Set(ctx.colunas.filter(c => c.tipo === 'pessoa').map(c => String(c.id)));
        for (const c of lido.campos) livres.delete(String(c.coluna_id));
        extra.push('pessoas', lido.campos.length ? indicePessoas(valores, livres, lido.campos, lido.oficial) : pessoasDosValores(valores, livres));
      }
      await ref.update(new FieldPath('valores', String(coluna.id)), valor === undefined ? FieldValue.delete() : valor, 'atualizado_em', dataLocal(), ...extra);
    }
    const [de, para] = [await textoLegivel(ctx, coluna, antes), await textoLegivel(ctx, coluna, valor)];
    if (de !== para) await registrar({ quadro_id: quadroId, item_id: itemId, item_nome: item.nome, acao: 'alterou', coluna_id: coluna.id, coluna_titulo: coluna.titulo, de, para }, a.id);
    return `${coluna.titulo}: ${para ?? 'vazio'}`;
  }

  if (acao.tipo === 'mover') {
    const grupo = await ler('grupos', acao.grupo_id);
    if (!grupo || Number(grupo.quadro_id) !== quadroId || !visivel(grupo)) throw new Error('o grupo de destino não existe mais neste quadro');
    if (Number(item.grupo_id) === Number(grupo.id)) return `já estava em ${grupo.nome}`;
    // Vai para o topo do grupo, como no monday.
    const doGrupo = await colecao('itens').where('grupo_id', '==', Number(grupo.id)).get();
    const posicao = Math.min(1, ...doGrupo.docs.map(d => Number(d.data().posicao) || 0)) - 1;
    await ref.update({ grupo_id: Number(grupo.id), posicao, atualizado_em: dataLocal() });
    if (item.vinculo?.cadastro && item.vinculo.sub == null && (await registroDe(ctx, String(item.vinculo.cadastro)))?.grupo?.situacao === 'ativo') {
      await gravarNoCadastro(autor(a), itemId, 'grupo', null, null);
    }
    const de = (await ler('grupos', item.grupo_id))?.nome ?? null;
    await registrar({ quadro_id: quadroId, item_id: itemId, item_nome: item.nome, acao: 'moveu', de, para: grupo.nome }, a.id);
    return `movido para ${grupo.nome}`;
  }

  if (acao.tipo === 'arquivar') {
    if (item.arquivado_em) return 'já estava arquivado';
    await ref.update({ arquivado_em: dataLocal() });
    if (item.vinculo) await gravarNoCadastro(autor(a), itemId, 'situacao', null, null);
    await registrar({ quadro_id: quadroId, item_id: itemId, item_nome: item.nome, acao: 'arquivou' }, a.id);
    return 'arquivado';
  }

  const visto = { id: itemId, nome: item.nome, valores: item.valores ?? {} };
  if (acao.tipo === 'subitem') {
    const pai = await ler('quadros', quadroId);
    if (!pai || pai.tipo === 'subitens') throw new Error('subitens só nos itens do quadro principal');
    const { quadroId: subId, grupoId } = await subquadroDe(pai);
    const novo = await criarItem({ quadro_id: subId, grupo_id: grupoId, item_pai_id: itemId, nome: comNome(acao.nome, visto).trim() || 'Subitem', criado_por: a.criado_por ?? null });
    await vincularSeOficial(subId, novo.id, autor(a));
    await registrar({ quadro_id: subId, item_id: novo.id, item_nome: novo.nome, acao: 'criou' }, a.id);
    return `subitem “${novo.nome}” criado`;
  }

  // criar_item: item novo em outro quadro (no grupo escolhido ou no primeiro).
  const destino = await ler('quadros', acao.quadro_id);
  if (!destino || !visivel(destino) || destino.tipo === 'subitens') throw new Error('o quadro de destino não existe mais');
  let grupoId = acao.grupo_id ?? null;
  const grupo = grupoId != null ? await ler('grupos', grupoId) : undefined;
  if (!grupo || Number(grupo.quadro_id) !== Number(destino.id) || !visivel(grupo)) {
    const grupos = (await colecao('grupos').where('quadro_id', '==', Number(destino.id)).get()).docs.map(d => d.data()).filter(visivel)
      .sort((x, y) => (Number(x.posicao) || 0) - (Number(y.posicao) || 0) || Number(x.id) - Number(y.id));
    if (!grupos[0]) throw new Error('o quadro de destino não tem grupo');
    grupoId = Number(grupos[0].id);
  }
  const novo = await criarItem({ quadro_id: Number(destino.id), grupo_id: grupoId, nome: comNome(acao.nome || '{nome}', visto).trim() || String(item.nome ?? 'Item'), criado_por: a.criado_por ?? null });
  await vincularSeOficial(Number(destino.id), novo.id, autor(a));
  await registrar({ quadro_id: Number(destino.id), item_id: novo.id, item_nome: novo.nome, acao: 'criou' }, a.id);
  return `item criado em ${destino.nome}`;
}

/**
 * Roda as ações de uma automação para um item, uma única vez por `chave` (o gatilho do Firestore pode chegar repetido).
 * Cada ação roda mesmo se a anterior falhou; o histórico guarda o resultado de todas.
 */
async function executar(a: Automacao, item: AnyRecord, chave: string, ctx: Contexto) {
  const execRef = colecao('execucoes').doc(String(novoId()));
  const reservou = await db.runTransaction(async t => {
    if (!(await t.get(colecao('execucoes').where('chave', '==', chave).limit(1))).empty) return false;
    t.create(execRef, { id: Number(execRef.id), automacao_id: a.id, quadro_id: Number(a.quadro_id), item_id: Number(item.id), item_nome: item.nome ?? null, chave, ok: 1, detalhe: 'rodando…', criado_em: dataLocal() });
    return true;
  });
  if (!reservou) return;
  const feitos: string[] = [];
  let ok = 1;
  for (const acao of a.acoes ?? []) {
    try { feitos.push(await fazerAcao(acao, a, Number(item.id), ctx)); } catch (e) { ok = 0; feitos.push(`erro: ${e instanceof Error ? e.message : String(e)}`); }
  }
  await execRef.update({ ok, detalhe: (feitos.join(' · ') || 'nenhuma ação').slice(0, 500) });
  logger.info('friday-automacoes:executou', { automacaoId: a.id, itemId: item.id, ok, detalhe: feitos });
}

const automacoesAtivas = async (quadroId: number) =>
  (await colecao('automacoes').where('quadro_id', '==', quadroId).get()).docs.map(d => d.data() as Automacao).filter(a => Number(a.ativa) === 1 && a.gatilho?.tipo);

// ---------------------------------------------------------------- Functions
/** Atividade nova da tela (item criado, valor alterado, item movido): roda as automações do quadro que ela dispara. */
export const fridayAutomacoesEvento = onDocumentCreated({ document: 'friday-atividades/{atividadeId}', region: REGIAO }, async event => {
  const at = event.data?.data();
  if (!at || at.automacao_id != null || at.item_id == null || !ACOES_DE_EVENTO.has(String(at.acao))) return;
  const automacoes = (await automacoesAtivas(Number(at.quadro_id))).filter(a => a.gatilho.tipo !== 'data_chega');
  if (!automacoes.length) return;
  const item = await ler('itens', at.item_id);
  if (!visivel(item) || Number(item!.quadro_id) !== Number(at.quadro_id)) return;
  const ctx = novoContexto(await colunasDo(Number(item!.quadro_id)));
  const { visto } = await lerItem(ctx, item!);
  const hoje = hojeLocal();
  for (const a of automacoes.sort((x, y) => x.id - y.id)) {
    if (!gatilhoDispara(a.gatilho, { acao: at.acao, coluna_id: at.coluna_id }, visto, ctx.colunas) || !condicoesValem(a, visto, ctx.colunas, hoje)) continue;
    await executar(a, item!, chaveDoEvento(a.id, Number(at.id)), ctx);
  }
});

/** A cada 10 minutos: automações "quando uma data chegar" dos itens cujo dia (data ± dias) é hoje. */
export const fridayAutomacoesDatas = onSchedule({ schedule: 'every 10 minutes', timeZone: 'America/Sao_Paulo', region: REGIAO }, async () => {
  const todas = (await colecao('automacoes').where('ativa', '==', 1).get()).docs.map(d => d.data() as Automacao).filter(a => a.gatilho?.tipo === 'data_chega');
  const hoje = hojeLocal();
  const porQuadro = new Map<number, Automacao[]>();
  for (const a of todas) porQuadro.set(Number(a.quadro_id), [...(porQuadro.get(Number(a.quadro_id)) ?? []), a]);
  for (const [quadroId, automacoes] of porQuadro) {
    const quadro = await ler('quadros', quadroId);
    if (!visivel(quadro)) continue;
    const grupos = new Set((await colecao('grupos').where('quadro_id', '==', quadroId).get()).docs.map(d => d.data()).filter(visivel).map(g => Number(g.id)));
    const itens = (await colecao('itens').where('quadro_id', '==', quadroId).get()).docs.map(d => d.data())
      .filter(i => visivel(i) && (i.grupo_id == null || grupos.has(Number(i.grupo_id))));
    const ctx = novoContexto(await colunasDo(quadroId));
    // Documentos oficiais lidos em lote (um por item vinculado).
    const oficiais = new Map<string, AnyRecord | undefined>();
    const vinculados = itens.filter(i => i.vinculo?.cadastro);
    for (const chave of new Set(vinculados.map(i => String(i.vinculo.cadastro)))) {
      const registro = await registroDe(ctx, chave);
      if (!registro?.colecao) continue;
      const refs = [...new Set(vinculados.filter(i => i.vinculo.cadastro === chave).map(i => String(i.vinculo.id)))].map(id => db.collection(String(registro.colecao)).doc(id));
      for (let k = 0; k < refs.length; k += 100) for (const s of await db.getAll(...refs.slice(k, k + 100))) oficiais.set(`${chave}/${s.id}`, s.data());
    }
    let rodadas = 0;
    for (const item of itens) {
      const { visto } = await lerItem(ctx, item, item.vinculo?.cadastro ? oficiais.get(`${item.vinculo.cadastro}/${item.vinculo.id}`) ?? {} : undefined);
      for (const a of automacoes) {
        const dia = diaDoGatilhoData(a.gatilho, visto);
        if (dia !== hoje || !condicoesValem(a, visto, ctx.colunas, hoje)) continue;
        await executar(a, item, chaveDaData(a.id, Number(item.id), dia), ctx);
        rodadas++;
      }
    }
    if (rodadas) logger.info('friday-automacoes:datas', { quadroId, rodadas });
  }
});
