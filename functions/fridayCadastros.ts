import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { exigirAdm2 } from './fridayMondayImport.js';
import { dataLocal, idDoUid, novoId } from './fridayMondayConverter.js';
import { camposDoItem, chaveValida, dataDoFriday, montarCampos, situacaoDoItem, type PedidoCampo } from './fridayCadastroConverter.js';

// Cadastros oficiais do Friday (etapa C1): promove um quadro livre a cadastro oficial no modo "novo".
// Cria friday-cadastros/{chave}, copia os valores das colunas escolhidas de cada item para cadastro-<chave>/{autoId},
// tira esses valores do item e grava nele o vínculo. Cada item e o seu registro oficial são gravados no mesmo lote,
// então a promoção pode ser repetida para continuar de onde parou. Contrato: The Manuscript,
// 03_APLICACAO_WEB/14_FRIDAY_CADASTROS_OFICIAIS.md.

type AnyRecord = Record<string, any>;
const REGIAO = 'southamerica-east1';
const ITENS_POR_LOTE = 200; // 2 escritas por item (registro + vínculo), abaixo do limite de 500 por lote

/** UIDs de funcionários a partir do id numérico de friday-usuarios (cadastros "monday-<id>" não são funcionários). */
async function mapaDeUids(): Promise<(idFriday: number) => string | undefined> {
  const [usuarios, funcionarios] = await Promise.all([db.collection('friday-usuarios').get(), db.collection('funcionarios').get()]);
  const funcionario = new Set(funcionarios.docs.map(d => d.id));
  const porId = new Map<number, string>();
  for (const d of usuarios.docs) if (funcionario.has(d.id)) porId.set(Number(d.data().id), d.id);
  return id => porId.get(id);
}

async function promover(uid: string, quadroId: number, chave: string, nome: string, pedidos: PedidoCampo[]) {
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
    registro = {
      chave, nome, modo: 'novo', colecao, quadro_id: quadroId, campos, versao: 1, situacao: 'migrando',
      criado_por: uid, criado_em: FieldValue.serverTimestamp(), atualizado_em: FieldValue.serverTimestamp(),
    };
    await registroRef.create(registro);
  }
  // Retomada: usa os campos já gravados no registro (os pedidos da 2ª chamada são ignorados).
  const campos = registro.campos as ReturnType<typeof montarCampos>['campos'];
  const uidDe = await mapaDeUids();
  const itens = (await db.collection('friday-itens').where('quadro_id', '==', quadroId).get()).docs;
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
        nome: String(item.nome ?? ''), ...valores, situacao: situacaoDoItem(item),
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
  const d = (request.data ?? {}) as { quadroId?: unknown; chave?: unknown; nome?: unknown; campos?: unknown };
  const quadroId = Number(d.quadroId);
  const chave = String(d.chave ?? '');
  const nome = String(d.nome ?? '').trim().slice(0, 120);
  const campos = Array.isArray(d.campos) ? (d.campos as AnyRecord[]).map(c => ({ coluna_id: Number(c?.coluna_id), chave: String(c?.chave ?? '') })) : [];
  if (!Number.isSafeInteger(quadroId)) throw new HttpsError('invalid-argument', 'quadroId inválido.');
  if (!chaveValida(chave)) throw new HttpsError('invalid-argument', 'Chave do cadastro inválida: use minúsculas, números e "_", começando por letra.');
  if (!nome) throw new HttpsError('invalid-argument', 'Informe o nome do cadastro.');
  try {
    return await promover(uid, quadroId, chave, nome, campos);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    const mensagem = e instanceof Error ? e.message : String(e);
    logger.error('friday-cadastro:promover', { quadroId, chave, mensagem });
    throw new HttpsError('internal', mensagem.slice(0, 300));
  }
});
