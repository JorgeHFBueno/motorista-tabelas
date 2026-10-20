import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { exigirAdm2 } from './fridayMondayImport.js';
import { dataLocal, idDoUid, novoId } from './fridayMondayConverter.js';
import {
  camposDoItem, CHAVES_RESERVADAS, chaveValida, conflitoDeChave, dataDoFriday, entradaSubitem, indicePessoas, montarCampos, sincronizarRotulos, situacaoDoItem, valorDoOficial,
  valorOficial, type CampoOficial, type PedidoCampo,
} from './fridayCadastroConverter.js';

// Cadastros oficiais do Friday (etapa C1): promove um quadro livre a cadastro oficial no modo "novo".
// Cria friday-cadastros/{chave}, copia os valores das colunas escolhidas de cada item para cadastro-<chave>/{autoId},
// tira esses valores do item e grava nele o vínculo. Cada item e o seu registro oficial são gravados no mesmo lote,
// então a promoção pode ser repetida para continuar de onde parou. Contrato: The Manuscript,
// 03_APLICACAO_WEB/14_FRIDAY_CADASTROS_OFICIAIS.md.

type AnyRecord = Record<string, any>;
const REGIAO = 'southamerica-east1';
const ITENS_POR_LOTE = 200; // 2 escritas por item (registro + vínculo), abaixo do limite de 500 por lote

/** Pessoas: id numérico de friday-usuarios ↔ UID de funcionários (cadastros "monday-<id>" não são funcionários). */
async function mapasDePessoas() {
  const [usuarios, funcionarios] = await Promise.all([db.collection('friday-usuarios').get(), db.collection('funcionarios').get()]);
  const funcionario = new Set(funcionarios.docs.map(d => d.id));
  const uidPorId = new Map<number, string>();
  const idPorUid = new Map<string, number>();
  for (const d of usuarios.docs) {
    if (!funcionario.has(d.id)) continue;
    uidPorId.set(Number(d.data().id), d.id);
    idPorUid.set(d.id, Number(d.data().id));
  }
  return { uidDe: (id: number) => uidPorId.get(id), idDe: (uid: string) => idPorUid.get(uid) };
}
async function mapaDeUids(): Promise<(idFriday: number) => string | undefined> {
  return (await mapasDePessoas()).uidDe;
}

/** Nome do grupo do item (grupo oficial); null sem grupo. */
async function nomeDoGrupo(grupoId: unknown): Promise<string | null> {
  if (grupoId == null) return null;
  const g = (await db.collection('friday-grupos').doc(String(grupoId)).get()).data();
  return g ? String(g.nome ?? '') : null;
}
const grupoAtivo = (registro: AnyRecord | undefined) => (registro?.grupo?.situacao === 'ativo' ? String(registro.grupo.chave) : null);
const gruposDoQuadro = async (quadroId: number) =>
  new Map((await db.collection('friday-grupos').where('quadro_id', '==', quadroId).get()).docs.map(d => [Number(d.data().id), String(d.data().nome ?? '')]));

async function promover(uid: string, quadroId: number, chave: string, nome: string, pedidos: PedidoCampo[], grupoChave: string | null) {
  const colecao = `cadastro-${chave}`;
  const registroRef = db.collection('friday-cadastros').doc(chave);
  const quadroRef = db.collection('friday-quadros').doc(String(quadroId));
  const [registroSnap, quadroSnap] = await Promise.all([registroRef.get(), quadroRef.get()]);
  const quadro = quadroSnap.data();
  if (!quadro || quadro.excluido_em) throw new HttpsError('not-found', 'Quadro não encontrado.');
  if (quadro.tipo === 'subitens') throw new HttpsError('invalid-argument', 'Quadros de subitens não podem ser promovidos sozinhos.');
  if (quadro.cadastro && quadro.cadastro !== chave) throw new HttpsError('failed-precondition', `O quadro já é o cadastro oficial "${quadro.cadastro}".`);

  let registro = registroSnap.data();
  if (registro && (registro.situacao !== 'migrando' || registro.quadro_id !== quadroId)) {
    throw new HttpsError('already-exists', `Já existe um cadastro oficial com a chave "${chave}".`);
  }
  if (!registro) {
    // Primeira chamada: valida as colunas e cria o registro em "migrando".
    const colunas = (await db.collection('friday-colunas').where('quadro_id', '==', quadroId).get()).docs.map(d => d.data() as { id: number; titulo: string; tipo: string; config?: AnyRecord });
    const { campos, erros } = montarCampos(colunas, pedidos);
    if (erros.length) throw new HttpsError('invalid-argument', erros.join(' '));
    // Grupo oficial (opcional): o nome do grupo de cada item vira um campo do documento oficial.
    if (grupoChave) {
      if (!chaveValida(grupoChave) || CHAVES_RESERVADAS.has(grupoChave)) throw new HttpsError('invalid-argument', 'Chave do grupo inválida ou reservada.');
      const conflito = conflitoDeChave({ campos }, grupoChave);
      if (conflito) throw new HttpsError('invalid-argument', conflito);
    }
    registro = {
      chave, nome, modo: 'novo', colecao, quadro_id: quadroId, campos, versao: 1, situacao: 'migrando',
      ...(grupoChave ? { grupo: { chave: grupoChave, situacao: 'ativo' } } : {}),
      criado_por: uid, criado_em: FieldValue.serverTimestamp(), atualizado_em: FieldValue.serverTimestamp(),
    };
    await registroRef.create(registro);
  }
  // Retomada: usa os campos já gravados no registro (os pedidos da 2ª chamada são ignorados).
  const campos = registro.campos as ReturnType<typeof montarCampos>['campos'];
  const uidDe = await mapaDeUids();
  const itens = (await db.collection('friday-itens').where('quadro_id', '==', quadroId).get()).docs;
  const grupo = grupoAtivo(registro);
  const grupos = grupo ? await gruposDoQuadro(quadroId) : new Map<number, string>();
  const agora = Timestamp.now();
  let migrados = 0, jaMigrados = 0, pessoasSemFuncionario = 0;
  for (let k = 0; k < itens.length; k += ITENS_POR_LOTE) {
    const lote = db.batch();
    for (const d of itens.slice(k, k + ITENS_POR_LOTE)) {
      const item = d.data();
      if (item.vinculo?.cadastro === chave) { jaMigrados++; continue; }
      const { valores, pessoasSemFuncionario: semFuncionario } = camposDoItem(campos, item.valores, uidDe);
      pessoasSemFuncionario += semFuncionario;
      const oficialRef = db.collection(colecao).doc();
      const criadoEm = dataDoFriday(item.criado_em), atualizadoEm = dataDoFriday(item.atualizado_em);
      lote.set(oficialRef, {
        nome: String(item.nome ?? ''), ...valores, ...(grupo ? { [grupo]: grupos.get(Number(item.grupo_id)) ?? null } : {}), situacao: situacaoDoItem(item),
        criado_em: criadoEm ? Timestamp.fromDate(criadoEm) : agora, atualizado_em: atualizadoEm ? Timestamp.fromDate(atualizadoEm) : agora,
        criado_por: item.criado_por != null ? uidDe(Number(item.criado_por)) ?? null : null, atualizado_por: uid,
        origem: { friday_quadro_id: quadroId, friday_item_id: Number(item.id) },
      });
      // O valor oficial sai do mapa livre do item; atualizado_em do item não muda (é migração, não edição).
      const apagar = campos.flatMap(c => [new FieldPath('valores', String(c.coluna_id)), FieldValue.delete()]);
      lote.update(d.ref, 'vinculo', { cadastro: chave, id: oficialRef.id }, ...apagar);
      migrados++;
    }
    await lote.commit();
  }
  await quadroRef.update({ cadastro: chave });
  await registroRef.update({ situacao: 'ativo', atualizado_em: FieldValue.serverTimestamp() });
  const idAtividade = novoId();
  await db.collection('friday-atividades').doc(String(idAtividade)).set({
    id: idAtividade, quadro_id: quadroId, item_id: null, item_nome: null, usuario_id: idDoUid(uid), automacao_id: null, acao: 'oficializou',
    coluna_id: null, coluna_titulo: null, de: null, para: `cadastro oficial "${nome}" (${campos.length} campos, ${migrados + jaMigrados} itens)`, criado_em: dataLocal(),
  });
  return { chave, colecao, campos: campos.length, itens_migrados: migrados, itens_ja_migrados: jaMigrados, pessoas_sem_funcionario: pessoasSemFuncionario };
}

/** Promove um quadro do Friday a cadastro oficial (modo "novo"). Só adm2. Pode ser repetida para continuar. */
export const fridayCadastroPromover = onCall({ region: REGIAO, timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const uid = await exigirAdm2(request.auth?.uid, 'tornar um quadro oficial');
  const d = (request.data ?? {}) as { quadroId?: unknown; chave?: unknown; nome?: unknown; campos?: unknown; grupo?: unknown };
  const quadroId = Number(d.quadroId);
  const chave = String(d.chave ?? '');
  const grupoChave = d.grupo ? String(d.grupo) : null;
  const nome = String(d.nome ?? '').trim().slice(0, 120);
  const campos = Array.isArray(d.campos) ? (d.campos as AnyRecord[]).map(c => ({ coluna_id: Number(c?.coluna_id), chave: String(c?.chave ?? '') })) : [];
  if (!Number.isSafeInteger(quadroId)) throw new HttpsError('invalid-argument', 'quadroId inválido.');
  if (!chaveValida(chave)) throw new HttpsError('invalid-argument', 'Chave do cadastro inválida: use minúsculas, números e "_", começando por letra.');
  if (!nome) throw new HttpsError('invalid-argument', 'Informe o nome do cadastro.');
  try {
    return await promover(uid, quadroId, chave, nome, campos, grupoChave);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    const mensagem = e instanceof Error ? e.message : String(e);
    logger.error('friday-cadastro:promover', { quadroId, chave, mensagem });
    throw new HttpsError('internal', mensagem.slice(0, 300));
  }
});

// ---------------------------------------------------------------- C2: gravação do quadro oficial
/** Funcionário ativo (mesma política do restante do Friday até a etapa de credenciais). */
async function exigirFuncionarioAtivo(uid: string | undefined): Promise<string> {
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
  const f = await db.collection('funcionarios').doc(uid).get();
  if (!f.exists || f.data()?.ativo !== true) throw new HttpsError('permission-denied', 'Acesso não autorizado.');
  return uid;
}

/** Recalcula o índice `pessoas` do item: colunas de pessoa livres + campos oficiais de pessoa. */
async function atualizarIndicePessoas(itemRef: FirebaseFirestore.DocumentReference, item: AnyRecord, campos: CampoOficial[], oficial: AnyRecord | undefined) {
  const livres = new Set((await db.collection('friday-colunas').where('quadro_id', '==', item.quadro_id).where('tipo', '==', 'pessoa').get()).docs.map(d => String(d.data().id)));
  for (const c of campos) livres.delete(String(c.coluna_id));
  const { idDe } = await mapasDePessoas();
  await itemRef.update({ pessoas: indicePessoas(item.valores, livres, campos, oficial, idDe) });
}

// Escopo de gravação: o quadro principal (campos na raiz do registro oficial) ou o quadro de subitens dele
// (campos dentro do mapa `subitens.chave` do registro do item pai, em `<chave>.<id do subitem>.<campo>`).
type Escopo = {
  chave: string; registroRef: FirebaseFirestore.DocumentReference; registro: AnyRecord; sub: boolean; subChave: string | null; quadroPrincipal: number;
  campos: CampoOficial[]; salvarCampos: (novos: CampoOficial[]) => Promise<unknown>;
};
async function escopoDoQuadro(quadroId: number): Promise<Escopo> {
  const quadro = (await db.collection('friday-quadros').doc(String(quadroId)).get()).data();
  if (!quadro) throw new HttpsError('not-found', 'Quadro não encontrado.');
  const sub = quadro.tipo === 'subitens';
  const principalId = sub ? Number(quadro.quadro_pai_id) : quadroId;
  const principal = sub ? (await db.collection('friday-quadros').doc(String(principalId)).get()).data() : quadro;
  const chave = principal?.cadastro;
  if (!chave) throw new HttpsError('failed-precondition', 'Este quadro não é um cadastro oficial.');
  const registroRef = db.collection('friday-cadastros').doc(String(chave));
  const registro = (await registroRef.get()).data();
  if (!registro || registro.situacao !== 'ativo') throw new HttpsError('failed-precondition', `O cadastro oficial "${chave}" não está ativo.`);
  const versao = { versao: FieldValue.increment(1), atualizado_em: FieldValue.serverTimestamp() };
  if (sub) {
    const s = registro.subitens;
    if (!s || s.situacao !== 'ativo' || Number(s.quadro_id) !== quadroId) throw new HttpsError('failed-precondition', 'Os subitens deste quadro não são oficiais.');
    return { chave, registroRef, registro, sub: true, subChave: String(s.chave), quadroPrincipal: principalId, campos: (s.campos ?? []) as CampoOficial[],
      salvarCampos: novos => registroRef.update({ 'subitens.campos': novos, ...versao }) };
  }
  return { chave, registroRef, registro, sub: false, subChave: null, quadroPrincipal: principalId, campos: (registro.campos ?? []) as CampoOficial[],
    salvarCampos: novos => registroRef.update({ campos: novos, ...versao }) };
}
const apagarValores = (campos: CampoOficial[]) => campos.flatMap(c => [new FieldPath('valores', String(c.coluna_id)), FieldValue.delete()]);

type Operacao = 'valor' | 'nome' | 'situacao' | 'vincular' | 'grupo';
const OPERACOES: Operacao[] = ['valor', 'nome', 'situacao', 'vincular', 'grupo'];

async function gravar(uid: string, itemId: number, op: Operacao, colunaId: number | null, valor: unknown) {
  const itemRef = db.collection('friday-itens').doc(String(itemId));
  const item = (await itemRef.get()).data();
  if (!item) throw new HttpsError('not-found', 'Item não encontrado.');
  const e = await escopoDoQuadro(Number(item.quadro_id));
  const ativos = e.campos.filter(c => c.situacao === 'ativo');
  const colecao = String(e.registro.colecao);

  if (op === 'vincular') {
    // Item ou subitem criado (ou duplicado) num quadro oficial: os valores das colunas oficiais vão para o registro oficial.
    if (item.vinculo?.cadastro === e.chave) return { id: item.vinculo.id };
    const { uidDe } = await mapasDePessoas();
    const livres = { ...(item.valores ?? {}) };
    for (const c of ativos) delete livres[String(c.coluna_id)];
    const lote = db.batch();
    if (!e.sub) {
      const { valores } = camposDoItem(ativos, item.valores, uidDe);
      const oficialRef = db.collection(colecao).doc();
      const grupo = grupoAtivo(e.registro);
      lote.set(oficialRef, {
        nome: String(item.nome ?? ''), ...valores, ...(grupo ? { [grupo]: await nomeDoGrupo(item.grupo_id) } : {}), situacao: situacaoDoItem(item), criado_em: FieldValue.serverTimestamp(), criado_por: uid,
        atualizado_em: FieldValue.serverTimestamp(), atualizado_por: uid, origem: { friday_quadro_id: item.quadro_id, friday_item_id: Number(item.id) },
      });
      lote.update(itemRef, 'vinculo', { cadastro: e.chave, id: oficialRef.id }, ...apagarValores(ativos));
      await lote.commit();
      await atualizarIndicePessoas(itemRef, { ...item, valores: livres }, ativos, valores);
      return { id: oficialRef.id };
    }
    const pai = item.item_pai_id != null ? (await db.collection('friday-itens').doc(String(item.item_pai_id)).get()).data() : undefined;
    if (pai?.vinculo?.cadastro !== e.chave) throw new HttpsError('failed-precondition', 'O item pai ainda não está vinculado ao cadastro oficial.');
    const { entrada } = entradaSubitem(ativos, item, uidDe);
    const paiRef = db.collection(colecao).doc(String(pai.vinculo.id));
    lote.update(paiRef, new FieldPath(e.subChave!, String(item.id)), entrada, 'atualizado_em', FieldValue.serverTimestamp(), 'atualizado_por', uid);
    lote.update(itemRef, 'vinculo', { cadastro: e.chave, id: pai.vinculo.id, sub: String(item.id) }, ...apagarValores(ativos));
    await lote.commit();
    await atualizarIndicePessoas(itemRef, { ...item, valores: livres }, ativos, entrada);
    return { id: pai.vinculo.id, sub: String(item.id) };
  }

  if (item.vinculo?.cadastro !== e.chave) throw new HttpsError('failed-precondition', 'O item ainda não está vinculado ao cadastro oficial.');
  const oficialRef = db.collection(colecao).doc(String(item.vinculo.id));
  const caminho = (k: string) => (e.sub ? new FieldPath(e.subChave!, String(item.vinculo.sub), k) : new FieldPath(k));
  const meta: unknown[] = ['atualizado_em', FieldValue.serverTimestamp(), 'atualizado_por', uid];
  // Nome e situação são lidos do item já gravado pela tela (o item é a referência, não o que o cliente envia).
  if (op === 'nome') { await oficialRef.update(caminho('nome'), String(item.nome ?? ''), ...meta); return { ok: true }; }
  if (op === 'situacao') { await oficialRef.update(caminho('situacao'), situacaoDoItem(item), ...meta); return { ok: true }; }
  if (op === 'grupo') {
    // Item mudou de grupo: o grupo oficial acompanha (só no quadro principal).
    const grupo = grupoAtivo(e.registro);
    if (!grupo || e.sub) return { ok: true, grupo: null };
    const nome = await nomeDoGrupo(item.grupo_id);
    await oficialRef.update(grupo, nome, ...meta);
    return { ok: true, grupo: nome };
  }

  const indice = e.campos.findIndex(c => c.coluna_id === colunaId && c.situacao === 'ativo');
  if (indice < 0) throw new HttpsError('invalid-argument', 'Esta coluna não é um campo oficial ativo.');
  let campo = e.campos[indice];
  if (campo.tipo === 'status' || campo.tipo === 'lista') {
    // Rótulo criado ou renomeado no Friday depois da oficialização: o registro acompanha (o código não muda).
    const coluna = (await db.collection('friday-colunas').doc(String(colunaId)).get()).data();
    const r = sincronizarRotulos(campo, campo.tipo === 'status' ? coluna?.config?.rotulos : coluna?.config?.opcoes);
    if (r.mudou) {
      campo = r.campo;
      const novos = [...e.campos];
      novos[indice] = campo;
      await e.salvarCampos(novos);
    }
  }
  const { uidDe } = await mapasDePessoas();
  const v = valorOficial(campo, valor, uidDe);
  await oficialRef.update(caminho(campo.chave), v === undefined ? FieldValue.delete() : v, ...meta);
  if (campo.tipo === 'pessoa') {
    const doc = (await oficialRef.get()).data();
    await atualizarIndicePessoas(itemRef, item, ativos, e.sub ? doc?.[e.subChave!]?.[String(item.vinculo.sub)] : doc);
  }
  return { ok: true, valor: v ?? null };
}

/** Gravação nos cadastros oficiais a partir do quadro do Friday: valor de campo, nome, situação ou vínculo de item novo. */
export const fridayCadastroGravar = onCall({ region: REGIAO, timeoutSeconds: 60, memory: '512MiB' }, async (request) => {
  const uid = await exigirFuncionarioAtivo(request.auth?.uid);
  const d = (request.data ?? {}) as { itemId?: unknown; op?: unknown; colunaId?: unknown; valor?: unknown };
  const itemId = Number(d.itemId);
  const op = String(d.op ?? '') as Operacao;
  if (!Number.isSafeInteger(itemId)) throw new HttpsError('invalid-argument', 'itemId inválido.');
  if (!OPERACOES.includes(op)) throw new HttpsError('invalid-argument', 'Operação inválida.');
  const colunaId = d.colunaId == null ? null : Number(d.colunaId);
  try {
    return await gravar(uid, itemId, op, colunaId, d.valor);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    const mensagem = e instanceof Error ? e.message : String(e);
    logger.error('friday-cadastro:gravar', { itemId, op, mensagem });
    throw new HttpsError('internal', mensagem.slice(0, 300));
  }
});

// ---------------------------------------------------------------- C3: campos oficiais por coluna, subitens e rótulos
type OperacaoCampos = 'adicionar' | 'descontinuar' | 'subitens' | 'rotulos' | 'desfazer' | 'grupo' | 'grupo_descontinuar' | 'grupo_nome';
const OPERACOES_CAMPOS: OperacaoCampos[] = ['adicionar', 'descontinuar', 'subitens', 'rotulos', 'desfazer', 'grupo', 'grupo_descontinuar', 'grupo_nome'];
const OPERACOES_DE_FUNCIONARIO = new Set<OperacaoCampos>(['rotulos', 'grupo_nome']);

/** Itens do escopo (quadro principal ou de subitens) já vinculados, com o caminho do valor no registro oficial. */
async function itensVinculados(e: Escopo, quadroId: number) {
  const itens = (await db.collection('friday-itens').where('quadro_id', '==', quadroId).get()).docs.filter(d => d.data().vinculo?.cadastro === e.chave);
  return itens.map(d => ({ ref: d.ref, item: d.data(), oficialRef: db.collection(String(e.registro.colecao)).doc(String(d.data().vinculo.id)), sub: e.sub ? String(d.data().vinculo.sub) : null }));
}

async function mudarCampos(uid: string, quadroId: number, op: OperacaoCampos, colunaId: number | null, chave: string, pedidos: PedidoCampo[], grupoId: number | null) {
  if (op === 'subitens') return promoverSubitens(uid, quadroId, chave, pedidos);
  if (op === 'desfazer') return desfazer(uid, quadroId);
  if (op === 'grupo' || op === 'grupo_descontinuar' || op === 'grupo_nome') return mudarGrupo(uid, quadroId, op, chave, grupoId);
  const coluna = colunaId != null ? (await db.collection('friday-colunas').doc(String(colunaId)).get()).data() : undefined;
  if (!coluna) throw new HttpsError('not-found', 'Coluna não encontrada.');
  // O escopo vem da coluna: do quadro principal ou do quadro de subitens dele.
  const e = await escopoDoQuadro(Number(coluna.quadro_id));
  if (e.quadroPrincipal !== quadroId) throw new HttpsError('invalid-argument', 'A coluna não pertence a este quadro.');
  const indice = e.campos.findIndex(c => c.coluna_id === Number(coluna.id) && c.situacao === 'ativo');

  if (op === 'rotulos') {
    if (indice < 0) return { mudou: false };
    const campo = e.campos[indice];
    if (campo.tipo !== 'status' && campo.tipo !== 'lista') return { mudou: false };
    const r = sincronizarRotulos(campo, campo.tipo === 'status' ? coluna.config?.rotulos : coluna.config?.opcoes);
    if (r.mudou) { const novos = [...e.campos]; novos[indice] = r.campo; await e.salvarCampos(novos); }
    return { mudou: r.mudou };
  }

  const vinculados = await itensVinculados(e, Number(coluna.quadro_id));
  const LOTE = 200;
  if (op === 'adicionar') {
    if (indice >= 0) throw new HttpsError('already-exists', `“${coluna.titulo}” já é um campo oficial.`);
    // No quadro principal, a chave não pode repetir campos, o mapa dos subitens nem o grupo; nos subitens, só os campos deles.
    const conflito = conflitoDeChave(e.sub ? { campos: e.campos } : e.registro, chave);
    if (conflito) throw new HttpsError('already-exists', conflito);
    const { campos: [campo], erros } = montarCampos([coluna as { id: number; titulo: string; tipo: string; config?: AnyRecord }], [{ coluna_id: Number(coluna.id), chave }]);
    if (erros.length) throw new HttpsError('invalid-argument', erros.join(' '));
    // Migra primeiro e só então registra o campo: repetir a operação continua de onde parou.
    const { uidDe } = await mapasDePessoas();
    let migrados = 0;
    for (let k = 0; k < vinculados.length; k += LOTE) {
      const lote = db.batch();
      for (const v of vinculados.slice(k, k + LOTE)) {
        const bruto = v.item.valores?.[String(coluna.id)];
        if (bruto === undefined) continue;
        const valor = valorOficial(campo, bruto, uidDe);
        if (valor !== undefined) lote.update(v.oficialRef, v.sub ? new FieldPath(e.subChave!, v.sub, campo.chave) : new FieldPath(campo.chave), valor);
        lote.update(v.ref, new FieldPath('valores', String(coluna.id)), FieldValue.delete());
        migrados++;
      }
      await lote.commit();
    }
    await e.salvarCampos([...e.campos, campo]);
    return { chave: campo.chave, itens_migrados: migrados };
  }

  // op === 'descontinuar': os valores voltam para a coluna do Friday (que volta a ser livre); o registro oficial
  // mantém os dados antigos e deixa de receber gravações nesse campo.
  if (indice < 0) throw new HttpsError('failed-precondition', `“${coluna.titulo}” não é um campo oficial ativo.`);
  const campo = e.campos[indice];
  const { idDe } = await mapasDePessoas();
  const docs = new Map<string, AnyRecord | undefined>();
  for (const v of vinculados) if (!docs.has(v.oficialRef.id)) docs.set(v.oficialRef.id, undefined);
  const ids = [...docs.keys()];
  for (let k = 0; k < ids.length; k += 100) {
    const snaps = await db.getAll(...ids.slice(k, k + 100).map(id => db.collection(String(e.registro.colecao)).doc(id)));
    for (const sn of snaps) docs.set(sn.id, sn.data());
  }
  let devolvidos = 0;
  for (let k = 0; k < vinculados.length; k += LOTE) {
    const lote = db.batch();
    let n = 0;
    for (const v of vinculados.slice(k, k + LOTE)) {
      const doc = docs.get(v.oficialRef.id);
      const origem = v.sub ? doc?.[e.subChave!]?.[v.sub] : doc;
      const valor = valorDoOficial(campo, origem?.[campo.chave], idDe);
      if (valor === undefined) continue;
      lote.update(v.ref, new FieldPath('valores', String(coluna.id)), valor);
      n++;
    }
    if (n) await lote.commit();
    devolvidos += n;
  }
  const novos = [...e.campos];
  novos[indice] = { ...campo, situacao: 'descontinuado' };
  await e.salvarCampos(novos);
  return { chave: campo.chave, valores_devolvidos: devolvidos };
}

/** Torna oficiais os subitens de um quadro oficial: cada subitem vira uma entrada do mapa `<chave>` no registro do item pai. */
async function promoverSubitens(uid: string, quadroId: number, chave: string, pedidos: PedidoCampo[]) {
  const e = await escopoDoQuadro(quadroId);
  if (e.sub) throw new HttpsError('invalid-argument', 'Use o quadro principal.');
  const atual = e.registro.subitens;
  if (atual && atual.situacao !== 'migrando') throw new HttpsError('already-exists', 'Os subitens deste quadro já são oficiais.');
  if (!chaveValida(chave) || CHAVES_RESERVADAS.has(chave)) throw new HttpsError('invalid-argument', 'Chave dos subitens inválida ou reservada.');
  const conflito = atual ? null : conflitoDeChave({ ...e.registro, subitens: null }, chave);
  if (conflito) throw new HttpsError('invalid-argument', conflito);
  const subQuadro = (await db.collection('friday-quadros').where('quadro_pai_id', '==', quadroId).where('tipo', '==', 'subitens').get()).docs.map(d => d.data())
    .sort((a, b) => Number(a.id) - Number(b.id))[0];
  if (!subQuadro) throw new HttpsError('failed-precondition', 'Este quadro ainda não tem subitens.');
  let campos: CampoOficial[];
  if (atual) {
    campos = atual.campos; // retomada: vale o que já foi registrado
  } else {
    const colunas = (await db.collection('friday-colunas').where('quadro_id', '==', Number(subQuadro.id)).get()).docs.map(d => d.data() as { id: number; titulo: string; tipo: string; config?: AnyRecord });
    const m = montarCampos(colunas, pedidos);
    if (m.erros.length) throw new HttpsError('invalid-argument', m.erros.join(' '));
    campos = m.campos;
    await e.registroRef.update({ subitens: { chave, quadro_id: Number(subQuadro.id), campos, situacao: 'migrando' }, versao: FieldValue.increment(1), atualizado_em: FieldValue.serverTimestamp() });
  }
  const subChave = atual ? String(atual.chave) : chave;
  const pais = new Map((await db.collection('friday-itens').where('quadro_id', '==', quadroId).get()).docs
    .filter(d => d.data().vinculo?.cadastro === e.chave).map(d => [Number(d.data().id), String(d.data().vinculo.id)]));
  const subitens = (await db.collection('friday-itens').where('quadro_id', '==', Number(subQuadro.id)).get()).docs;
  const { uidDe } = await mapasDePessoas();
  let migrados = 0, jaMigrados = 0, semPai = 0, pessoasSemFuncionario = 0;
  for (let k = 0; k < subitens.length; k += 200) {
    const lote = db.batch();
    for (const d of subitens.slice(k, k + 200)) {
      const s = d.data();
      if (s.vinculo?.cadastro === e.chave) { jaMigrados++; continue; }
      const paiId = pais.get(Number(s.item_pai_id));
      if (!paiId) { semPai++; continue; }
      const r = entradaSubitem(campos, s, uidDe);
      pessoasSemFuncionario += r.pessoasSemFuncionario;
      lote.update(db.collection(String(e.registro.colecao)).doc(paiId), new FieldPath(subChave, String(s.id)), r.entrada);
      lote.update(d.ref, 'vinculo', { cadastro: e.chave, id: paiId, sub: String(s.id) }, ...apagarValores(campos));
      migrados++;
    }
    await lote.commit();
  }
  await e.registroRef.update({ 'subitens.situacao': 'ativo', atualizado_em: FieldValue.serverTimestamp() });
  return { chave: subChave, campos: campos.length, subitens_migrados: migrados, subitens_ja_migrados: jaMigrados, subitens_sem_pai: semPai, pessoas_sem_funcionario: pessoasSemFuncionario };
}

/**
 * Desfaz a oficialização de um quadro (C3b): os valores dos campos oficiais ativos voltam para as colunas dos itens e
 * dos subitens, os vínculos saem, o quadro deixa de ser oficial e o registro fica "arquivado". Os documentos oficiais
 * não são alterados nem apagados, e a chave do cadastro não pode ser reaproveitada. Repetir continua de onde parou
 * (itens já desvinculados são pulados).
 */
async function desfazer(uid: string, quadroId: number) {
  const quadroRef = db.collection('friday-quadros').doc(String(quadroId));
  const quadro = (await quadroRef.get()).data();
  if (!quadro) throw new HttpsError('not-found', 'Quadro não encontrado.');
  const chave = quadro.cadastro;
  if (!chave) throw new HttpsError('failed-precondition', 'Este quadro não é um cadastro oficial.');
  const registroRef = db.collection('friday-cadastros').doc(String(chave));
  const registro = (await registroRef.get()).data();
  if (!registro) throw new HttpsError('not-found', `Registro do cadastro "${chave}" não encontrado.`);
  const colecao = String(registro.colecao);
  const ativos = (lista: unknown) => ((lista ?? []) as CampoOficial[]).filter(c => c.situacao === 'ativo');
  const sub = registro.subitens as { chave: string; quadro_id: number; campos: CampoOficial[] } | undefined;
  const { idDe } = await mapasDePessoas();

  // Devolve um escopo (quadro principal ou de subitens): os valores voltam pela mesma conversão do "descontinuar".
  async function devolver(alvo: number, campos: CampoOficial[], origemDe: (doc: AnyRecord | undefined, item: AnyRecord) => AnyRecord | undefined) {
    const colunasPessoa = new Set((await db.collection('friday-colunas').where('quadro_id', '==', alvo).where('tipo', '==', 'pessoa').get()).docs.map(d => String(d.data().id)));
    const itens = (await db.collection('friday-itens').where('quadro_id', '==', alvo).get()).docs.filter(d => d.data().vinculo?.cadastro === chave);
    const ids = [...new Set(itens.map(d => String(d.data().vinculo.id)))];
    const docs = new Map<string, AnyRecord | undefined>();
    for (let k = 0; k < ids.length; k += 100) {
      for (const sn of await db.getAll(...ids.slice(k, k + 100).map(id => db.collection(colecao).doc(id)))) docs.set(sn.id, sn.data());
    }
    for (let k = 0; k < itens.length; k += 200) {
      const lote = db.batch();
      for (const d of itens.slice(k, k + 200)) {
        const item = d.data();
        const origem = origemDe(docs.get(String(item.vinculo.id)), item);
        const valores = { ...(item.valores ?? {}) };
        const caminhos: unknown[] = [];
        for (const c of campos) {
          const v = valorDoOficial(c, origem?.[c.chave], idDe);
          if (v === undefined) continue;
          valores[String(c.coluna_id)] = v;
          caminhos.push(new FieldPath('valores', String(c.coluna_id)), v);
        }
        lote.update(d.ref, 'vinculo', FieldValue.delete(), 'pessoas', indicePessoas(valores, colunasPessoa, [], undefined, idDe), ...caminhos);
      }
      await lote.commit();
    }
    return itens.length;
  }

  const subitens = sub?.quadro_id != null
    ? await devolver(Number(sub.quadro_id), ativos(sub.campos), (doc, item) => doc?.[sub.chave]?.[String(item.vinculo.sub)])
    : 0;
  const itens = await devolver(quadroId, ativos(registro.campos), doc => doc);
  await registroRef.update({ situacao: 'arquivado', arquivado_em: FieldValue.serverTimestamp(), arquivado_por: uid, versao: FieldValue.increment(1), atualizado_em: FieldValue.serverTimestamp() });
  await quadroRef.update({ cadastro: FieldValue.delete() });
  logger.info('friday-cadastro:desfeito', { chave, quadroId, itens, subitens, uid });
  return { chave, itens_devolvidos: itens, subitens_devolvidos: subitens };
}

/**
 * Grupo oficial num quadro já oficial:
 * - "grupo" (adm2): ativa o grupo como campo (na primeira vez com a chave pedida; depois, sempre a mesma chave) e
 *   grava o nome do grupo em todos os documentos oficiais;
 * - "grupo_descontinuar" (adm2): o campo deixa de ser mantido; os documentos guardam o último nome;
 * - "grupo_nome" (funcionário ativo): grupo renomeado no Friday; atualiza os documentos dos itens desse grupo.
 */
async function mudarGrupo(uid: string, quadroId: number, op: 'grupo' | 'grupo_descontinuar' | 'grupo_nome', chave: string, grupoId: number | null) {
  const e = await escopoDoQuadro(quadroId);
  if (e.sub) throw new HttpsError('invalid-argument', 'Use o quadro principal.');
  const atual = e.registro.grupo as { chave: string; situacao: string } | undefined;
  const colecao = String(e.registro.colecao);
  const versao = { versao: FieldValue.increment(1), atualizado_em: FieldValue.serverTimestamp() };
  if (op === 'grupo_descontinuar') {
    if (atual?.situacao !== 'ativo') throw new HttpsError('failed-precondition', 'O grupo não é um campo oficial ativo.');
    await e.registroRef.update({ 'grupo.situacao': 'descontinuado', ...versao });
    return { chave: atual.chave };
  }
  // Atualiza o grupo nos documentos oficiais dos itens vinculados (todos, ou só os de um grupo).
  const sincronizar = async (grupoChave: string, soDoGrupo: number | null) => {
    let consulta = db.collection('friday-itens').where('quadro_id', '==', quadroId);
    if (soDoGrupo != null) consulta = consulta.where('grupo_id', '==', soDoGrupo);
    const itens = (await consulta.get()).docs.map(d => d.data()).filter(i => i.vinculo?.cadastro === e.chave && i.vinculo.sub == null);
    const nomes = await gruposDoQuadro(quadroId);
    for (let k = 0; k < itens.length; k += 400) {
      const lote = db.batch();
      for (const i of itens.slice(k, k + 400)) lote.update(db.collection(colecao).doc(String(i.vinculo.id)), grupoChave, nomes.get(Number(i.grupo_id)) ?? null, 'atualizado_em', FieldValue.serverTimestamp(), 'atualizado_por', uid);
      await lote.commit();
    }
    return itens.length;
  };
  if (op === 'grupo_nome') {
    if (atual?.situacao !== 'ativo' || grupoId == null) return { itens: 0 };
    return { chave: atual.chave, itens: await sincronizar(atual.chave, grupoId) };
  }
  // op === 'grupo'
  if (atual?.situacao === 'ativo') throw new HttpsError('already-exists', 'O grupo já é um campo oficial.');
  const grupoChave = atual?.chave ?? chave; // a chave do grupo nunca muda
  if (!atual) {
    if (!chaveValida(grupoChave) || CHAVES_RESERVADAS.has(grupoChave)) throw new HttpsError('invalid-argument', 'Chave do grupo inválida ou reservada.');
    const conflito = conflitoDeChave(e.registro, grupoChave);
    if (conflito) throw new HttpsError('already-exists', conflito);
  }
  // Grava primeiro e só então registra: repetir continua de onde parou.
  const itens = await sincronizar(grupoChave, null);
  await e.registroRef.update({ grupo: { chave: grupoChave, situacao: 'ativo' }, ...versao });
  return { chave: grupoChave, itens };
}

/** Mudanças nos campos de um cadastro oficial: tornar uma coluna oficial, descontinuar, subitens oficiais, rótulos, grupo e desfazer. */
export const fridayCadastroCampos = onCall({ region: REGIAO, timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const d = (request.data ?? {}) as { quadroId?: unknown; op?: unknown; colunaId?: unknown; chave?: unknown; campos?: unknown; grupoId?: unknown };
  const op = String(d.op ?? '') as OperacaoCampos;
  if (!OPERACOES_CAMPOS.includes(op)) throw new HttpsError('invalid-argument', 'Operação inválida.');
  // Rótulos e nome de grupo acompanham edições comuns (qualquer funcionário); mudar campos e desfazer é de adm2.
  const uid = OPERACOES_DE_FUNCIONARIO.has(op) ? await exigirFuncionarioAtivo(request.auth?.uid) : await exigirAdm2(request.auth?.uid, 'mudar os campos de um cadastro oficial');
  const quadroId = Number(d.quadroId);
  if (!Number.isSafeInteger(quadroId)) throw new HttpsError('invalid-argument', 'quadroId inválido.');
  const colunaId = d.colunaId == null ? null : Number(d.colunaId);
  const chave = String(d.chave ?? '');
  if (op === 'adicionar' && !chaveValida(chave)) throw new HttpsError('invalid-argument', 'Chave inválida: use minúsculas, números e "_", começando por letra.');
  const pedidos = Array.isArray(d.campos) ? (d.campos as AnyRecord[]).map(c => ({ coluna_id: Number(c?.coluna_id), chave: String(c?.chave ?? '') })) : [];
  try {
    return await mudarCampos(uid, quadroId, op, colunaId, chave, pedidos, d.grupoId == null ? null : Number(d.grupoId));
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    const mensagem = e instanceof Error ? e.message : String(e);
    logger.error('friday-cadastro:campos', { quadroId, op, mensagem });
    throw new HttpsError('internal', mensagem.slice(0, 300));
  }
});
